# Plan: Driver mobile view cleanup

Status: approved by Dylan 2026-11-11, ready for stage 2 (implement)
Date: 2026-11-11
Screen: Driver dashboard ("Microgenesis Field Mobile"), `client/src/features/dashboard/DriverDashboard.tsx`
Reference viewport: iPhone 14, 393 x 852, DPR 3 (Firefox responsive mode)
Base branch: `feature/client-dashboard-redesign`. This work is committed on that same branch and ships together with the dashboard redesign (Dylan, 2026-11-11).

## 0. Decisions from Dylan (2026-11-11)

- D1. Combine with the dashboard redesign: commit on `feature/client-dashboard-redesign`, no separate branch. QA for both goes through one handoff.
- D2. Tap to copy the reference: yes. Tapping the reference copies it to the clipboard and shows a "Reference copied" toast (`notify.success`). The control is a 44px tall button with accessible name "Copy reference <ref>"; hidden when there is no reference; falls back to a "Could not copy" toast if the Clipboard API is unavailable.
- D3. Tabs use "Active" / "Done today" with a one-line hint about RMA items on the Done tab. The red "Due ... · N days late" line replaces the separate Overdue badge everywhere.
- D4. No extra driver features (maps, call buttons) in this plan.

## 1. Summary

The driver screen works, but on a phone it reads like a shrunken desktop page. The driver has to
scroll past counters, a tall tab box and a pagination bar before the first job, and the first job card
squeezes the customer name into a column about 70px wide. This plan reorders the page so the job list
comes first, puts pagination at the bottom, rebuilds the job card header for narrow screens, and tidies
the counters, tabs and touch targets. Workflow rules, permissions, API and data stay exactly as they are.

## 2. Findings (driver's point of view at 393px)

| # | What the driver sees | Cause in code | Severity |
|---|---|---|---|
| F1 | Pagination ("Showing 1-7 of 7", page buttons) sits above the job list. It pushes the first job down about 100px and the driver has to scroll back up to change page after reaching the end of the list. | `PagedDriverDashboard` puts `RecordPageControls` inside `queueControls`, which renders before the list. | High |
| F2 | Job card header: reference and customer name are crammed into a narrow left column because the badges column is `shrink-0` on the right. "Jollibee Foods Corp. - Quezon City Cluster" wraps to 6 lines, one or two words each. | Header is `flex justify-between` with badges `shrink-0 flex-wrap justify-end`. | High |
| F3 | Long raw reference (`SAP-DEMO-94890005-PROCUREMENT_PICKUP`) breaks mid-word across 4 lines in tiny mono text. When a record has no reference, the internal database id is shown instead. | `break-all font-mono text-[11px]` and fallback `rec.reference \|\| rec.id`. | Medium |
| F4 | "Active work" / "Completed today / RMA awaiting receipt" tabs stack vertically on mobile: one filled pill and one plain text line, so the second option does not look tappable and the box is about 110px tall. | `grid-cols-1 sm:grid-cols-2` plus a long second label. No counts on the tabs. | Medium |
| F5 | Stat cards are cramped: "Accomplished" nearly touches the card edge, big padding and a 24px number for a value that is usually 0 to 10, and the three cards take about 85px. | `KpiTile size="compact"` in a 3 column grid at 393px, label `text-sm`. | Medium |
| F6 | The page title row repeats the brand bar: "Microgenesis Field Mobile" header, then "Driver dashboard" plus Refresh. The driver's name and today's date are hidden on mobile (`hidden sm:block`), so the driver cannot see which day the list is for. | Header layout. | Low |
| F7 | Small touch targets: Refresh button about 32px tall; confirm sheet Cancel / Confirm about 32px (`text-xs py-2`); the sheet's close "X" is a 16px icon with no accessible name. Mobile guideline is at least 44 x 44px. | `DashboardPage` refresh button, status confirm modal. | Medium |
| F8 | Item description is cut at 40 characters with no way to read the rest. | `item_description.slice(0, 40)`. | Low |
| F9 | Due date shows as raw `2026-10-30` while other dashboards use "Oct 30, 2026". Overdue jobs get a badge but the date line itself does not stand out. | Raw value; `formatDate` exists in `ui/format.ts` but is not used here. | Low |
| F10 | Confirm sheet is not announced as a dialog and shows the raw reference ("Mark SAP-DEMO-... as Accomplished") in 12px text. Long references overflow the sentence. | Modal has no `role="dialog"` / `aria-modal` / labelled title. | Low |
| F11 | "Upcoming and other dates" cards use the same side-by-side layout as F2, so long names wrap badly there too, and show the raw reference plus raw date in one mono line. | Same pattern as F2. | Low |

Out of scope but worth noting: action buttons (Start transport, Accomplish, Pending, Reschedule) and the
"Received by" input already meet 44px and are fine.

## 3. Goals and non-goals

Goals
- The first job card is visible without scrolling on a 393 x 852 screen (top of card above the fold).
- Every tappable control is at least 44 x 44px.
- No text in the job list wraps to one word per line at 360px wide or wider.
- Pagination is at the bottom of the list it controls.
- Desktop and tablet (640px and up) keep working and look the same or better.

Non-goals
- No change to workflow rules, status transitions, POD requirements, RMA logic, permissions or API.
- No change to the shared `Pagination` component used by other screens (only where the driver page puts it).
- No new features such as maps, call buttons or offline mode (D4).
- No change to other role dashboards.

## 4. Proposed changes

### 4.1 Page order (fixes F1, F6)

New order, top to bottom:

1. App header: brand on the left, avatar on the right (unchanged), 56px tall on mobile.
2. Title row: "Driver dashboard" (h1) with a second line "Wednesday, Nov 11, 2026" visible on all sizes. Refresh becomes a 44 x 44px icon button on mobile (label "Refresh" stays visible from `sm` up; accessible name unchanged: "Refresh dashboard").
3. Stat strip (4.4).
4. Queue switch (4.3).
5. Save feedback banner (unchanged).
6. Job list panel(s).
7. Pagination, directly under the list, inside the same panel footer (`DashboardPanel` already has a `footer` slot for "Showing x of y"). Hidden when there is only one page, except for the "Showing 1-7 of 7 records" line which stays as plain footer text.
8. Loading and error lines of `RecordPageControls` move next to the list: the loading state uses the existing skeleton, the error line with Retry shows above the list (errors must be seen first).

Implementation note: split `queueControls` into `queueSwitch` (top) and `listFooter` (bottom) props on `DriverDashboardContent`. When the page changes, scroll the list panel's heading into view and move focus to it so the driver lands at the top of the new page.

### 4.2 Job card (fixes F2, F3, F8, F9)

Mobile layout (stacked, full width):

```
[Procurement Pick-up] [Scheduled] [Overdue · 3 days late]    <- badge row, wraps
Jollibee Foods Corp. - Quezon City Cluster                   <- customer, text-base semibold, full width
Ref SAP-DEMO-94890005-PROCUREMENT_PI...                      <- one line, truncated
-------------------------------------------------------------
(pin) Quezon City - Diliman
(clock) Due Oct 30, 2026            (red text when overdue)
(box) Demo item for PROCUREMENT_PICKUP
...actions unchanged...
```

- Header changes from side-by-side to a column on mobile: badges first, then customer name at full width, then the reference. From `sm` up the current side-by-side layout may stay since there is room.
- Customer name: `text-base font-semibold`, normal word wrapping (no `break-all`), clamps at 2 lines with the full name in the element's accessible text.
- Reference: one line, `truncate`, prefixed with a muted "Ref" label, sans-serif `text-xs` with `tabular-nums` instead of 11px mono. Full value available via `title` and in the card's `aria-label`. Tap to copy (D2).
- Never show the internal `rec.id`. If there is no reference, show "No reference yet".
- Details become a vertical list (one item per line) so icons line up; due date uses `formatDate`; overdue date line turns rose and reads "Due Oct 30, 2026 · 12 days late", and the separate overdue badge is removed everywhere (D3).
- Item description: clamp to 2 lines with CSS (`line-clamp-2`) instead of slicing at 40 chars, plus a "Show more" toggle when clamped.
- Card padding 16px, 12px gap between cards on mobile (currently 16px gap inside a padded panel, so cards look boxed twice). The panel's inner padding drops to 12px below `sm`.

Apply the same header pattern to the "Accomplished" cards and the "Upcoming and other dates" cards (F11), so all three lists look the same.

### 4.3 Queue switch (fixes F4)

- Always a 2 column segmented control (also on mobile), equal width, 44px tall, inside a light gray track.
- Labels with counts at every width: "Active (7)" and "Done today (2)". On the Done tab a one-line hint shows under the switch: "Includes RMA items waiting for TASS receipt." (D3)
- Counts come from the existing overview counts (`remaining + rma_active`, `completed + rma_completed`), no API change. While counts load, show labels without numbers.
- Keep `aria-pressed` buttons (works with current tests) and add `aria-controls` pointing at the list panel.

### 4.4 Stat strip (fixes F5)

- Replace the three separate tiles with one card split into three equal cells by thin dividers: number on top (`text-xl`, tabular), label underneath (`text-xs`): "Today", "Done", "Left". Full labels ("Today's runs", "Accomplished", "Remaining") stay as the accessible names and as visible labels from `sm` up.
- About 64px tall instead of 85px.
- Each cell keeps `data-kpi-tile` and the skeleton behavior so the "never show a number that later changes" rule still holds. Implemented as a new `size="strip"` option or a small `KpiStrip` component in `features/dashboard/ui`, used only by the driver screen.

### 4.5 Touch targets and the confirm sheet (fixes F7, F10)

- Refresh button: 44px min height on mobile (driver page only; done by passing a prop to `DashboardPage` so other dashboards are unchanged).
- Confirm sheet becomes a proper bottom sheet on mobile: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on "Confirm status", full width with rounded top corners, safe-area bottom padding (`env(safe-area-inset-bottom)`), max height `90dvh` with internal scroll so the keyboard does not hide the buttons.
- Close button: 44 x 44px, `aria-label="Close"`.
- Cancel and Confirm: full-width row of two 44px buttons, `text-sm`. Confirm keeps its rules (remarks required, photo check).
- Sheet text shows the customer name and the truncated reference instead of only the raw reference. Textarea font becomes 16px on mobile so iOS Safari does not zoom in on focus.
- Escape closes the sheet when not saving; focus returns to the button that opened it.

### 4.6 Small polish

- Background behind cards stays `#F8F9FB`; section spacing on mobile becomes 16px instead of 24px (`space-y-4` below `sm`).
- No em dashes, no uppercase styling, no pulse (existing test rules stay).

## 5. Data, API and permissions

- No API, schema, migration or seed changes.
- No permission changes. Every button keeps its current `access.canRecord(...)` checks and disabled rules.
- Only client files change: `DriverDashboard.tsx`, `features/dashboard/ui` (new strip option, `DashboardPage` refresh size prop), and tests.

## 6. Implementation phases (stage 2, one commit each)

1. Layout order: split queue controls, move pagination into the list panel footer, scroll and focus on page change, date under title, Refresh 44px. Tests for order and focus.
2. Job card: new header layout, reference display and fallback, tap to copy, details list, formatted and overdue due date, description clamp. Apply to Accomplished and Upcoming cards. Tests.
3. Queue switch: 2 column segmented control, short labels and counts. Tests.
4. Stat strip: new strip variant, wire into driver page. Update existing tile test.
5. Confirm sheet: dialog semantics, bottom sheet layout, touch targets, focus handling, iOS zoom fix. Tests.
6. Visual check: Playwright screenshots at 360, 393 and 768px wide for the active and done queues, attached to the QA handoff.

## 7. Tests

Unit (`client/tests/driverDashboardDesign.test.ts`, node test runner with JSDOM):
- Pagination element (`[data-testid="pagination-container"]`) comes after the last job card in document order, and nothing paginated comes before the first card.
- With one page, the page buttons are not rendered but "Showing 1-7 of 7 records" is.
- Job card header: badges, customer and reference appear in that DOM order; reference element has `truncate` and a `title` with the full value; no `break-all` in the card.
- Clicking the reference button calls the clipboard with the full reference and fires the success toast; no button when there is no reference.
- A record with no reference shows "No reference yet" and never the record `id`.
- Due date renders as "Oct 30, 2026"; an overdue run shows "days late" on the date line.
- Queue switch renders two buttons in one row container with `grid-cols-2` at all sizes and shows counts when overview counts are present.
- Stat strip: still 3 `[data-kpi-tile]` elements, still skeletons while loading, accessible names are the full labels.
- Confirm sheet has `role="dialog"`, `aria-modal="true"`, a labelled title, and a close button named "Close"; Escape closes it.
- Existing tests (workflow buttons, no em dash, empty state, completed RMA) still pass unchanged.

E2E / visual (Playwright, `e2e/`, driver demo seed account):
- At 393 x 852, top edge of the first job card is above 852px on first load.
- At 360px wide, no horizontal scroll (`document.documentElement.scrollWidth <= 360`).
- All buttons and inputs in the driver view are at least 44px tall at 393px (measured by bounding box).

## 8. Risks

- Combined branch: the redesign and this fix merge to `dev` together, so a problem in either holds back both. Mitigation: one commit per phase, so a single phase can be reverted.
- `DashboardPanel` footer and `DashboardPage` refresh prop are shared. Changes are additive props with current defaults, so other dashboards render the same; covered by their existing tests.
- Truncating references hides part of them. Full value stays in `title`, the aria-label and the details modal, and drivers usually identify jobs by customer name and area.
- Short tab labels might hide that RMA items waiting for TASS appear under "Done today". Mitigated by the hint line (D3).

## 9. Acceptance criteria

AC1. On the Driver dashboard at 393 x 852, pagination appears below the job list, never above it.
AC2. With a single page of results, no page number buttons are shown; the "Showing x of y records" line is shown under the list.
AC3. Changing page scrolls to and focuses the list heading.
AC4. At 393px, a job card shows badges on their own row, then the customer name at full card width. "Jollibee Foods Corp. - Quezon City Cluster" wraps to at most 2 lines.
AC5. The reference shows on one line, truncated with an ellipsis when too long; the full reference is available in its tooltip and in the card's accessible name.
AC6. A record without a reference shows "No reference yet"; the internal record id never appears on the driver screen.
AC7. Due dates show as "Mon D, YYYY"; overdue runs show "N days late" in red on the due date line.
AC8. Long item descriptions are clamped to 2 lines with a "Show more" control, not cut at 40 characters.
AC9. The queue switch shows both options side by side, equal width, at least 44px tall, at every width from 360px up, with counts when available.
AC10. The three counters fit in one row at 360px without labels touching card edges, still show skeletons (no digits) while loading, and keep their full names for screen readers.
AC11. Today's date is visible under the page title on mobile.
AC12. Refresh, the confirm sheet's Close, Cancel and Confirm buttons are each at least 44 x 44px at 393px.
AC13. The confirm sheet is announced as a modal dialog with the title "Confirm status", closes on Escape when not saving, and returns focus to the button that opened it.
AC14. Focusing the remarks box on iOS Safari does not zoom the page (font size at least 16px).
AC15. The top of the first job card is visible without scrolling at 393 x 852 when there is at least one active job.
AC16. No horizontal scrolling at 360px wide on either queue.
AC17. All workflow actions (Start transport, POD upload, Received by, Accomplish, Pending, Reschedule, RMA panel) behave exactly as before; existing driver tests pass.
AC18. Other role dashboards look and behave the same as before (their tests pass, spot check at 1280px).

AC19. Tapping a job's reference copies it and shows "Reference copied"; the copy control is at least 44px tall and has an accessible name.

## 10. Open questions

None. All questions answered (section 0).
