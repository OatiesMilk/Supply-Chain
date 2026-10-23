# UI Typography, Contrast and Reflow (UI-002)

Tracks GitHub issue #210. This page records the shared type scale, the contrast
audit for the first set of screens, how the layouts were checked, and what is
left. Coordinate any change to these tokens with UI-005 (#213).

## Type scale

Defined once in `client/src/index.css` (`@theme`). Tailwind v4 turns each
token into a utility class.

| Utility | Size | Line height | Use for |
| :--- | :--- | :--- | :--- |
| `text-body` | 1rem (16px) | 1.5rem | Inputs, selects, textareas and longer free text |
| `text-data` | 0.875rem (14px) | 1.25rem | Table values, statuses, dates, record IDs, buttons, errors, helper text |
| `text-caption` | 0.8125rem (13px) | 1.125rem | Only uppercase section labels, field labels, keyboard hints and decorative initials |

Rules:

- Do not use `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]` or
  `text-xs` for information people act on. Use `text-data` or larger.
- `text-caption` is the only size below 14px. It is allowed for uppercase
  labels because capital letters at 13px are taller than lowercase letters at
  14px, and the value they label is always shown at 14px or more.
- Use rem, not px, for font sizes and for widths that hold text (for example
  table column minimums). The header **Text Size** control sets the root font
  size as a percentage, and the browser font-size setting does the same.
  Pixel sizes ignore both, which is why the old `text-[10px]` labels never grew.
- Shared editable controls (`.mg-control`, Input/Select/Textarea) use
  `--mg-text-base` / `text-body` at 1rem. Buttons and data remain 0.875rem.
  At the default 16px root this also avoids the usual small-field mobile Safari
  focus zoom. Actual iOS behavior and deliberately reduced app text remain manual
  acceptance items.

## Colour and contrast

Ratios were calculated from the Tailwind v4 colour values with the WCAG 2.2
relative-luminance formula. They are calculations, not a compliance claim; an
assistive-technology and manual review is still needed (see UI-006, #214).

| Pair (text on background) | Ratio | Result | Change |
| :--- | :--- | :--- | :--- |
| `slate-400` on white | 2.63 | Fails 4.5:1 | Replaced with `slate-500` (4.77) |
| `gray-400` on white | 2.60 | Fails | Replaced with `slate-500` |
| `slate-300` on white | 1.48 | Fails | Replaced with `slate-500` (large decorative empty-state icons kept light) |
| `slate-500` on `slate-100` (table header, header pills) | 4.35 | Fails | Changed to `slate-600` (6.90) |
| `emerald-600` on white | 3.67 | Fails | Changed to `emerald-700` (5.37) |
| `amber-600` on white | 3.19 | Fails | Changed to `amber-700` (5.05) |
| `red-600` on `red-50` | 4.36 | Fails | Error text changed to `red-700` |
| White on `amber-500` (driver Pending button) | 2.15 | Fails | Button now `amber-700` (5.05) |
| White on `emerald-600` (driver Accomplish button) | 3.67 | Fails | Button now `emerald-700` (5.37) |
| White on `purple-500` (driver Reschedule button) | 4.12 | Fails | Button now `purple-600` (5.53) |
| White at 60% on navy `#1F3864` (bulk action bar) | 5.28 | Passes | Raised to 70% (6.57) for margin |
| `blue-200` on navy `#1F3864` (driver header) | 8.16 | Passes | None |
| Status badges (`*-700` on `*-100`) | 4.54 to 6.13 | Passes | None |
| Brand `#0078C1` links on white | 4.71 | Passes | None |

Non-text contrast (WCAG 1.4.11): input borders were `slate-200`/`slate-300`
(1.23 and 1.48 on white). A new token, `--color-field` (`#7f8ba0`, 3.44 on
white, 3.29 on `slate-50`), is used as `border-field` on inputs, selects and
textareas in the updated screens.

Meaning that relied only on visuals now has text as well:

- The TASS Collection column dash reads "Not verified" to screen readers.
- Audit Trail changes read "changed from … to …" instead of relying on a
  strikethrough and an arrow.
- Status badges already carry the status word, so colour is never the only cue.

## Screens updated

- `client/src/features/deliveries/DeliveryRecordsView.tsx`
- `client/src/features/deliveries/DeliveryRecordWorkspace.tsx`
- `client/src/features/dashboard/DriverDashboard.tsx`
- `client/src/layouts/Navbar.tsx`
- `client/src/components/Pagination.tsx`

Layout fixes found during the checks:

- Header: the Log out button was pushed off-screen at 200% text size. The
  header now grows and wraps instead of clipping, and the screen title
  truncates first.
- Records table: column minimums and the table minimum are in rem. On small
  screens a hint says the table scrolls sideways, and the scroll area can be
  focused with the keyboard and has an accessible name.
- Bulk action bar: wraps inside the viewport instead of running off both sides.
- Date filters: drop to one per row when two no longer fit.
- Record workspace: the record ID in the breadcrumb no longer truncates; the
  PDF error message wraps; Save and Revert wrap; comment and remarks headers
  wrap long names.
- Driver dashboard: long references and company names wrap inside their cards;
  the three status buttons stack below 360px.

## How the layouts were checked

Local app (`npm run dev`), Logistics and Driver demo accounts, Chromium viewport
emulation. For each width the check measured whether the page scrolled
sideways and whether any button or field sat outside the viewport.

| Width | Records list | Record workspace | Driver dashboard |
| :--- | :--- | :--- | :--- |
| 320px | No page scroll; only the table scrolls | No page scroll; tab strip scrolls | No page scroll |
| 390px | No page scroll | No page scroll | No page scroll |
| 1280px | No page scroll | No page scroll | Not applicable |
| 1280px at 200% text | Nothing clipped; header wraps | Nothing clipped | Not applicable |

The original check recorded workspace Save Changes and Proof of Delivery
heading clipping at 320px with 200% app text. The GH-210 follow-up adds wrapping
for these actions, the shared POD heading/files and the breadcrumb minimum.
Current evidence and remaining limits are tracked in
[the follow-up verification record](UI-002-readable-controls-verification.md).

## Follow-ups (not in this change)

Several module files still use pixel text sizes. The source-reviewed deferred
list includes AccountingCollectionWorkspace, RouteSlipMenu, ExportMenu and
StatusStepper; it is recorded in
[the GH-210 follow-up verification record](UI-002-readable-controls-verification.md).
The follow-up covers shared editable text, Sidebar labels,
FilterPopover/FilterCombobox and PodUploader functional text. Remaining modules
need separate UI-002 or UI-005 slices. Touched targets reuse the existing shared
44px token; focus-management changes remain coordinated under #208.
