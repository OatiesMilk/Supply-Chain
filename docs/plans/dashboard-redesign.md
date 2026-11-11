# Plan: Dashboard redesign (all roles, uniform design)

| Field | Value |
| :--- | :--- |
| Stage | 1, Plan (revision 3, **approved by Dylan on 2026-11-10**) |
| Branch (for stage 2) | `feature/client-dashboard-redesign` off `dev` |
| Owner | Dylan |
| Primary files | `client/src/features/dashboard/*`, `server/src/routes/dashboard.ts`, `server/src/services/dashboardOverview.ts`, `server/src/services/dashboardFilters.ts`, `server/src/services/activeRecordCounts.ts`, `server/src/routes/records.ts`, `client/src/utils/dashboardFilters.ts`, `server/prisma/schema.prisma` |
| Schema migration | Yes, one additive column (`DeliveryRecord.submittedAt`) with a backfill |
| Live database writes | Only through the migration, which Dylan runs in stage 4 after a dry run |

## 0. Decisions from Dylan (2026-11-10)

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | Scope | Start from the TASS dashboard, but **every role's dashboard must share the same design system**. All dashboards adopt the same components in this feature. |
| 2 | What is "open RMA" | **Every RMA that is not completed and not a draft**: Scheduled, Pending, In Transit, On-Hold and Rescheduled. |
| 3 | Age measure | **Days since the record left Draft**. Records created directly as submitted use their creation time. |
| 4 | Thresholds | Amber at 4 to 7 days, red above 7 days. |
| 5 | Pick-ups tile | Keep it. TASS uses procurement pick-ups daily. |
| 6 | Returned to Draft, then resubmitted | **Age restarts from the latest submission.** |
| - | Mockup | Not needed. Dylan tests locally. |

## 1. Summary

The TASS dashboard shows numbers that disagree with each other and with the sidebar. In the
reviewed screenshot the **Open RMA Records** card says **13**, while the link under the cards,
the table badge and the sidebar RMA badge all say **14**. Four pieces of code each define "open
RMA" differently. The five role dashboards (Sales Coordinator, Logistics, TASS, Admin, Driver) were
also built separately, so cards, headings, copy, spacing and interactions differ from screen to
screen.

This plan:

1. Fixes the numbers: one shared definition per metric, used by the card, the table, the
   drill-down list and the sidebar badge.
2. Adds a `submittedAt` timestamp so "days open" counts from when an RMA left Draft.
3. Builds a small dashboard design system (`DashboardPage`, `KpiTile`, `KpiRow`,
   `DashboardPanel`, `RecordTable`, `AgeIndicator`, `EmptyState`) and moves **all** role
   dashboards onto it, starting with TASS.

## 2. Current state and findings

The `dashboard` screen renders `DashboardView.tsx`, which picks a role dashboard
(`LogisticsDashboard`, `TassDashboard`, `AdminDashboard`, or the Sales Coordinator default in
`DashboardView` itself). Drivers use `DriverDashboard.tsx` on the `driver_dashboard` screen.
Data comes from `GET /api/dashboard/stats` (KPI numbers) and `GET /api/dashboard/overview`
(previews and attention counts). When `stats` has not loaded, every role dashboard recomputes KPIs
from the in-memory, paginated `deliveryRecords`.

### F1. "Open RMA" has four different definitions (the 13 vs 14 bug)

| Where it shows | Code | Statuses | Drafts |
| :--- | :--- | :--- | :--- |
| KPI card "Open RMA Records" (13) | `routes/dashboard.ts` TASS `open_rma` | SCHEDULED, PENDING | **Counted** (no `draft` filter) |
| Card drill-down list (`tass-open-rma`) | `services/dashboardFilters.ts` | SCHEDULED, PENDING | Excluded |
| "View all 14" link and "14 OPEN" badge | `services/dashboardOverview.ts` `rma_attention` | SCHEDULED, PENDING, ON_HOLD | Excluded |
| Sidebar RMA badge (14) | `routes/records.ts` `/active-counts` + `services/activeRecordCounts.ts` | SCHEDULED, IN_TRANSIT, PENDING, ON_HOLD | Excluded |

The data fits 12 non-draft Scheduled/Pending + 1 draft = 13 on the card, and 12 + 2 on hold = 14
elsewhere. This is inferred from code and screenshot, not from a database query. Clicking the card
would open a list of 12. None of the four counts Rescheduled RMA, which Dylan wants counted.

### F2. Other KPIs count drafts too

TASS `rma_on_hold`, `pending_procurement_pickup` and `pending_verification` in `/stats` lack
`draft: false`, while their drill-down filters exclude drafts. The Sales Coordinator, Logistics and
Admin `/stats` branches also build their `where` objects inline instead of reusing
`dashboardRecordFilter`, so they can drift the same way.

### F3. Client fallback is another source of truth

All role dashboards fall back to counting the paginated `deliveryRecords` list while `/stats`
loads, so a tile can show a wrong number and then jump.

### F4. "View all 14 open RMA records (showing 10)" link

- Sits outside every card, under the KPI row, so it reads as part of the KPI row.
- Calls `onNavigate('rma')` with **no filter**, so it opens every RMA, including completed ones.
- "(showing 10)" describes the table below it, not anything near the link.

### F5. TASS attention table

- Ordered by `createdAt` ascending, capped at 10; On-Hold records can be pushed off the preview.
- Days open is computed in the browser from `created_at` with the device clock (not Manila time),
  and is measured from creation, not from leaving Draft. Every row shows `11d` in the screenshot.
- Age colour (red/amber/grey) has no legend or icon, so meaning is carried by colour only.
- Reference column is empty on every row (`rmaReference` is not set in seeded data).
- Status pills repeat "RMA:" on every row of an RMA-only table.
- Company is truncated with no tooltip or accessible full name.

### F6. Inconsistencies across role dashboards

| Area | What differs today |
| :--- | :--- |
| KPI cards | Copied markup in each file; footer margin differs (`mt-1` vs `mt-2`); each card has its own hover colour; some footers are links, some are status text |
| Interaction | Cards and table rows are clickable `div`/`tr` with `onClick`: not focusable, no keyboard activation, no accessible name (6 to 12 `onClick` handlers per file) |
| Motion | `animate-pulse` on warning icons, no `prefers-reduced-motion` handling |
| Typography | `font-black uppercase tracking-wider` on almost every label and heading, with sizes varying between `text-sm` and `text-base` |
| Copy | Em dashes in UI text: TASS "Blocked, needs action" and the "Open RMA Records, Needs Attention" heading; Admin "All modules, system-wide"; Driver "Record Time In, Start transport" and "Remarks, reason for change (required)" (shown here with commas in place of the em dash) |
| States | Loading, empty and error states are each written differently, and some are missing |

## 3. Goals and non-goals

**Goals**

1. Every dashboard number equals the count of the list it opens, and the RMA number equals the
   sidebar RMA badge.
2. All role dashboards share one layout, one KPI tile, one panel, one table pattern, one set of
   states and one copy style.
3. The TASS attention table shows the most urgent records first, aged from submission.
4. WCAG 2.2 AA on every dashboard: keyboard, focus, contrast, not colour alone, reduced motion.

**Non-goals**

- Changing which metrics each role sees, except the TASS Open RMA definition and draft exclusion.
- Changing the Driver workflow (Time In, POD, remarks rules). The Driver screen gets the shared
  look and copy only.
- Sidebar, header and navigation redesign.
- Permission model or RMA lifecycle changes.
- New charts. The existing Sales Coordinator status chart is restyled, not replaced.

## 4. Design system for dashboards

New folder `client/src/features/dashboard/ui/`. Every role dashboard is composed only from these.

| Component | Purpose and rules |
| :--- | :--- |
| `DashboardPage` | Page shell: title row (sentence case, e.g. "Command dashboard"), "Updated HH:MM" stamp, Refresh button, consistent vertical spacing (`space-y-6`) |
| `KpiRow` | Responsive grid: 4 columns at `lg` (5 for Sales Coordinator collapses to 3 + 2 at `lg`, 2 at `sm`, 1 below), equal-height tiles |
| `KpiTile` | Label, value, context line, one action (see 4.1) |
| `DashboardPanel` | Card with title, optional count badge, optional actions, body, optional footer ("Showing 10 of 14", "View all" link) |
| `RecordTable` | Table with real link/button in the first cell, `focus-within` row styling, mouse row-click kept; switches to a stacked list below `md` |
| `AgeIndicator` | Manila-day age with icon + text above thresholds (amber 4 to 7, red above 7) |
| `EmptyState` / `PanelError` / `TileSkeleton` | One pattern each for empty, error (with Retry) and loading |
| `StatusPill` | Existing `RecordStatus`, with an option to hide the category prefix inside single-category tables |

### 4.1 KPI tile contract

| Part | Rule |
| :--- | :--- |
| Label | Sentence case, `text-sm font-semibold text-slate-600` |
| Value | Large semibold number, tabular figures, compact above 999 (1.2K) |
| Context | One line explaining the number, in slate text; status shown with icon plus words, never colour alone |
| Action | Whole tile is one `<button>` with an accessible name, e.g. "Open RMA, 14 records. View list" |
| Tone | `neutral`, `warning`, `critical` set only the icon chip and a 3px left accent; warning/critical only when value is above 0 |
| Zero | Calm context line ("Nothing pending") and neutral tone |
| Loading | Skeleton, never fallback counting |
| Motion | No pulse; one hover style; visible focus ring |
| No access | If `canAccess(targetScreen)` is false, the tile renders without button or arrow |

### 4.2 Copy and visual rules

- No em dashes in UI text. Use commas or separate lines.
- Sentence case for labels, headings and buttons. Uppercase is reserved for small table column
  headers only.
- Digits for numbers ("2 on hold").
- Brand navy `#1F3864` for primary actions and headings; tones map to existing slate/blue, amber and
  red; text always uses slate tokens so contrast stays AA. No new dependencies.

## 5. Role dashboards on the new system

Metrics stay the same as today unless stated. Every tile opens its existing dashboard filter.

### 5.1 TASS (first, reference implementation)

```
Command dashboard                                           Updated 8:27 AM  [Refresh]
[Open RMA 14      ] [On hold 2         ] [Pick-ups pending 0] [Collections to verify 4]
[2 on hold, 3 >7d ] [Blocked, act now  ] [Nothing pending   ] [1 verified today       ]
Open RMA needing attention                                                 14 open
Record / RMA ref | Company | Area | Status | Delivery date | Age
...
Showing 10 of 14                                       View all 14 open RMA records >
```

| Tile | Value | Context | Opens |
| :--- | :--- | :--- | :--- |
| Open RMA | Open RMA (definition 6.1) | "N on hold, M open over 7 days" | RMA, `tass-open-rma` |
| On hold | On-Hold RMA | "Blocked, needs action" or "No blocked RMA" | RMA, `tass-rma-on-hold` |
| Pick-ups pending | Scheduled or Pending pick-ups | "Nothing pending" at 0 | Procurement Pick-up, `tass-pending-pickups` |
| Collections to verify | Accomplished, unverified collections | "N verified today" or "Awaiting your sign-off" | Accounting Collection, `tass-pending-verification` |

Attention table: On-Hold first, then oldest submission first; columns Record (ID with RMA
reference as a second line when present), Company, Area, Status (no "RMA:" prefix), Delivery date
(`Jul 12, 2026`), Age. The floating link moves into the panel footer and passes `tass-open-rma`.

### 5.2 Sales Coordinator

Same five tiles (Scheduled today, Pending driver assignment, On hold, Rescheduled, Completed today)
on `KpiTile`. "Delivery record status" chart and "Needs attention" panel move into `DashboardPanel`;
the three attention mini-cards become tiles of the same contract at a smaller size. Record count
footer becomes the panel footer of the status chart.

### 5.3 Logistics

Same tiles on `KpiTile`. RMA transport requests and Drivers out today become `DashboardPanel` +
`RecordTable`, each with a "Showing N of M" footer and a filtered "View all" link.

### 5.4 Admin

Same tiles on `KpiTile`. Records by status, users by role and recent audit activity become
`DashboardPanel`s; "All modules, system-wide" replaces the em dash copy.

### 5.5 Driver

Keeps its mobile-first layout and every workflow rule. Adopts `DashboardPage`, `KpiTile` for its
counters, `DashboardPanel` for run sections, shared states, and copy fixes ("Record Time In: start
transport", "Remarks, reason for change (required)").

## 6. Data and API changes

### 6.1 One definition per metric

- `server/src/services/dashboardFilters.ts`:
  - Add `OPEN_RMA_STATUSES = ['SCHEDULED', 'PENDING', 'IN_TRANSIT', 'ON_HOLD', 'RESCHEDULED']`
    (every status except `ACCOMPLISHED`).
  - `tass-open-rma` becomes `{ category: 'RMA', draft: false, status: { in: OPEN_RMA_STATUSES } }`.
  - New id `tass-rma-aging`: open RMA with `submittedAt` older than 7 Manila days.
- `/api/dashboard/stats`: every role branch builds its counts from `dashboardRecordFilter(id)`
  instead of inline `where` objects. This adds `draft: false` where it is missing and makes each tile
  share code with its drill-down.
- `dashboardOverview` (TASS): `rma_attention` uses `dashboardRecordFilter('tass-open-rma')`.
- Sidebar: `services/activeRecordCounts.ts` counts RMA with `OPEN_RMA_STATUSES` (adds Rescheduled
  for RMA only); the `/active-counts` `groupBy` status list adds `RESCHEDULED` so RMA rows are
  returned. Other categories keep their current rule.
- `client/src/utils/dashboardFilters.ts`: `tass-open-rma` matcher uses the same statuses
  (`Scheduled`, `Pending`, `In Transit`, `On-Hold`, `Rescheduled`), and `tass-rma-aging` is added.
- RMA list (`DeliveryRecordsView`): the `tass-open-rma` filter is already applied server-side via
  `dashboard_filter`; add a visible "Filtered: Open RMA" chip so the user sees why completed records
  are hidden.

### 6.2 New column `DeliveryRecord.submittedAt`

There is no field today that records when a record left Draft. Submission is only visible as an
`UPDATE` audit entry whose `previousValue.is_draft` is `"Yes"` and `newValue.is_draft` is `"No"`.

| Item | Detail |
| :--- | :--- |
| Column | `submittedAt DateTime?` on `DeliveryRecord` (nullable, additive, no default) |
| Set on create | When a record is created with `draft: false`, `submittedAt = now()` in the same transaction |
| Set on submit | Every time `draft` goes from `true` to `false`, set `submittedAt = now()` in the existing locked transaction (latest submission wins) |
| Returned to Draft | `submittedAt` is set to null in the same transaction (a draft has no submission); the next submit sets a fresh value |
| Backfill | 1) **latest** audit `UPDATE` where `previousValue::jsonb->>'is_draft' = 'Yes'` and `newValue::jsonb->>'is_draft' = 'No'`; 2) otherwise `createdAt` for non-draft records; 3) drafts stay null |
| Applies to | All categories (cheap and consistent), used for age only on RMA in this feature |
| Serialization | `serializeRecord` adds `submitted_at` (ISO or null); API contract doc updated |
| Index | None needed (filter runs inside existing `(deletedAt, category, status)` index) |

The migration is written in stage 2 as `server/prisma/migrations/<timestamp>_record_submitted_at/`
with the backfill SQL. Stage 2 also ships a read-only dry-run script
(`server/scripts/dry-run-submitted-at-backfill.ts`) that prints how many rows each backfill rule would
set, with no writes. Per project rules, Dylan runs the dry run and gives explicit go-ahead before the
migration touches any live database.

### 6.3 Age calculation

- Server: `tass-rma-aging` compares `submittedAt` with Manila midnight 7 days ago.
- Client: `manilaDaysSince(submitted_at ?? created_at)` in a shared util. `created_at` is only a
  safety fallback for rows the backfill missed.
- Preview ordering: On-Hold first, then `submittedAt` ascending, `id` ascending, using two bounded
  queries (On-Hold, then the remainder up to 10) because Prisma cannot order by a custom status rank.

### 6.4 Overview response additions (additive)

| Field | Roles | Meaning |
| :--- | :--- | :--- |
| `counts['tass-rma-on-hold']`, `counts['tass-rma-aging']` | TASS | Context lines on the Open RMA tile |
| `generated_at` | All | Server time, for the "Updated" stamp |
| `record_previews.rma_attention` | TASS | New ordering (6.3) |

### 6.5 Client data flow

- Remove the `deliveryRecords` fallback counting from all role dashboards; show skeletons instead.
- Refresh invalidates `/stats`, `/overview` and the sidebar active-counts query together.

## 7. Permissions per role

No permission changes. `requireAuth` + `requireResource('dashboard')` stay on both dashboard
endpoints, every count stays inside `recordScope(user)`, and `submitted_at` follows the same field
visibility as `created_at` in `serializeRecord`.

| Role | Dashboard | Data change | Visual change |
| :--- | :--- | :--- | :--- |
| TASS | `TassDashboard` | Open RMA definition, drafts excluded, aging | Full redesign |
| Sales Coordinator | `DashboardView` default | Counts move to shared filters (same results unless drafts were counted) | Shared system |
| Logistics | `LogisticsDashboard` | Same as Sales Coordinator | Shared system |
| Admin | `AdminDashboard` | Same as Sales Coordinator | Shared system |
| Driver | `DriverDashboard` (`driver_dashboard`) | None | Shared system, workflow unchanged |

Tiles check `canAccess(screen)`; a tile whose target screen was removed by a permission override
renders as non-interactive instead of a dead link.

## 8. Implementation phases (stage 2, one commit each)

1. **feat(db): add submittedAt with backfill.** Schema, migration SQL, dry-run script, set on
   create/submit, `submitted_at` in serializer, API contract doc. Server tests.
2. **fix(server): single source for dashboard and sidebar counts.** `OPEN_RMA_STATUSES`, shared
   filters in every `/stats` branch, `draft: false`, active-counts Rescheduled for RMA, overview
   ordering, new counts, `generated_at`. Server tests.
3. **feat(client): dashboard design system.** `ui/` components, `manilaDaysSince`, component tests.
4. **feat(client): TASS dashboard on the design system.** KPI row, attention table, footer link,
   remove fallback, copy fixes, RMA list filter chip.
5. **feat(client): Sales Coordinator dashboard on the design system.**
6. **feat(client): Logistics dashboard on the design system.**
7. **feat(client): Admin dashboard on the design system.**
8. **feat(client): Driver dashboard on the design system** (look and copy only).
9. **feat(client): freshness and refresh** across all dashboards.
10. **docs: dashboard metric definitions** in `docs/MODULE_ACCESS.md` or a new
    `docs/DASHBOARD_METRICS.md`.

## 9. Tests

**Server (`node:test`)**

- Each role's `/stats` value equals `/records?dashboard_filter=<id>` total for the same user and
  seed, including draft fixtures.
- TASS: Open RMA includes Rescheduled, In Transit and On-Hold; excludes Accomplished and drafts;
  equals `rma_attention` and the sidebar RMA badge.
- `submittedAt`: set on non-draft create; set on submit; cleared when returned to Draft; set to
  the new time on resubmit; never set on draft create.
- Backfill SQL against a test database: latest audit-derived submission wins, `createdAt` fallback,
  drafts null.
- Overview: On-Hold first, then oldest submission; aging count.

**Client (`node:test` + JSDOM)**

- `KpiTile`: accessible name, keyboard activation, non-interactive without access, skeleton.
- `RecordTable`: first-cell link, stacked list below `md`.
- `AgeIndicator` and `manilaDaysSince`: thresholds and Manila midnight boundaries.
- Each role dashboard: renders only through `ui/` components, no em dash in rendered text,
  no fallback counts while loading.

**E2E (Playwright, seeded accounts per role)**

- TASS: tile, table badge and sidebar badge are equal; each tile opens a list with the same total.
- Every role: dashboard keyboard walk-through and 375px no-horizontal-scroll check.

## 10. Risks

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Open RMA number changes (13 to a larger number with Rescheduled) | User confusion | Release note; context line shows the split |
| Sidebar RMA badge changes (adds Rescheduled) | Same | Same release note |
| Migration backfill on live data | Wrong ages if audit JSON differs | Read-only dry run first, Dylan's go-ahead, nullable column so rollback is a column drop |
| Audit JSON parsing fails on old rows | Backfill skips those rows | Fall back to `createdAt`; dry run reports counts per rule |
| Touching all five dashboards | Larger diff, regression risk | One commit per role, no metric changes outside TASS, AC for unchanged numbers |
| Driver screen regressions | Field operations impact | Look and copy only; existing Driver tests must pass unchanged in behaviour |
| Removing client fallback | Blank tiles if `/stats` fails | Skeleton then inline error with Retry |
| Existing tests assert old copy | Failures | Update assertions in the same phase |

## 11. Acceptance criteria

1. **AC1** For a seeded TASS user, the Open RMA tile, the attention table badge and the sidebar RMA
   badge show the same number.
2. **AC2** Open RMA counts Scheduled, Pending, In Transit, On-Hold and Rescheduled RMA, and never
   counts Accomplished RMA or drafts.
3. **AC3** For every role, clicking any KPI tile opens its list with the dashboard filter applied,
   and the list total equals the tile value.
4. **AC4** A draft record never changes any dashboard tile value for any role.
5. **AC5** The "View all N open RMA records" link is inside the table panel footer and opens the RMA
   list filtered to open RMA, with a visible filter chip.
6. **AC6** On-Hold RMA appear before other RMA in the attention table; within each group the oldest
   submission is first.
7. **AC7** Age is the number of Manila days since `submitted_at`; 4 to 7 days shows amber, above 7
   shows red, and both show an icon and text.
8. **AC8** A record created as Draft has no `submitted_at`; submitting sets it; returning to Draft
   clears it; submitting again sets it to the new submission time, so age restarts. A record created
   as submitted gets `submitted_at` equal to its creation time.
9. **AC9** The backfill dry-run script makes no writes and prints counts per backfill rule.
10. **AC10** All five dashboards use the shared `ui/` components for tiles, panels, tables and
    states, and their tiles look and behave the same (label, value, context, action, focus ring).
11. **AC11** No em dash (U+2014) appears in text rendered by any dashboard.
12. **AC12** Every tile and every table row link on every dashboard is reachable with Tab, shows a
    focus ring and activates with Enter.
13. **AC13** With `prefers-reduced-motion: reduce`, nothing on any dashboard animates.
14. **AC14** At 375px width, no dashboard scrolls horizontally; tables render as stacked lists.
15. **AC15** While loading, tiles show skeletons, never a number that later changes.
16. **AC16** If `/overview` fails, KPI tiles still render and panels show an error with a working
    Retry.
17. **AC17** Refresh updates tiles, panels and the sidebar badges together, and the "Updated" time
    changes.
18. **AC18** Sales Coordinator, Logistics and Admin tile values are unchanged from before for the
    same non-draft seed data.
19. **AC19** Driver workflows (Time In, completion, POD, required remarks) behave exactly as before.
20. **AC20** `cd client && npx tsc --noEmit`, `cd server && npx tsc --noEmit`,
    `npm run test:client` and `npm run test:server` pass.

## 12. Open questions

None. All questions were answered by Dylan on 2026-11-10 (see section 0).
