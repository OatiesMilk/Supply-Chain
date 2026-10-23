# GH-210 readable controls and reflow follow-up

## Scope and baseline

This first follow-up slice starts from `dev` `c3082e5`, including merged UI-002
PR #219, the shared UI-005 controls and merged accessibility PR #222. It does
not modify the Driver/Accounting confirmation/form implementation from #222.
Tracks [#210](https://github.com/OatiesMilk/Supply-Chain/issues/210); manual
staff/device acceptance stays coordinated with [#214](https://github.com/OatiesMilk/Supply-Chain/issues/214).

Source inspection showed `.mg-control` used 0.875rem (14px), contradicting the
existing 1rem editable-text guidance. Sidebar labels were 12px and truncated,
with smaller fixed-pixel grouping/user text; compact nav dimensions grew past the
fixed 72px rail at 200% app text. Filter inputs/options and POD help/files/actions
were 12px, with filenames truncated. Filter controls were 40px at the default
root and smaller at 90%. The workspace breadcrumb had a 14rem minimum (448px at
200%), and the prior guide recorded narrow Save/POD heading clipping.

Changes:

- Shared editable Input/Select/Textarea text is 1rem; buttons and data stay
  0.875rem. The Plus Jakarta Sans stack, brand palette and spacing scale stay.
- Sidebar functional labels and user text use readable rem text and wrap.
  The expanded base width remains 224px at 100%, the compact rail remains 72px,
  and compact buttons retain a 44px size. Mobile width stays 256px at 100% and is
  capped to the viewport at larger app text. The mobile logo reserves space for
  the enlarged close control. Navigation content scrolls vertically; the desktop toggle intentionally
  straddles the panel edge. Existing
  permission checks, route keys/labels/groups, current-page state, collapsed
  tooltips, keyboard shortcut and closed-mobile inertness remain in place.
- FilterPopover/FilterCombobox labels, options and feedback use 14px data text;
  editable text uses 16px. Touched controls use the shared 44px minimum token and
  visible keyboard focus. Floating UI positioning, nesting/dismissal, ARIA,
  keyboard selection and partial-name filtering semantics are unchanged.
- PodUploader help, errors, filenames and actions use data text. Section captions
  use 13px. Long staged/saved filenames wrap, with staged size metadata on a
  separate line. Below the small-screen breakpoint, removal moves below the
  file details so it cannot consume the filename's entire text width. Required
  heading/action text and workspace Save/breadcrumb rows
  can wrap at narrow widths; Save uses reduced mobile padding and an explicit
  breakable text child. File validation, IndexedDB staging, readiness,
  server uploads, completion requirements and save/status behavior are unchanged.

## Automated evidence

Validated source: `dev` `c3082e5` plus this scoped change.

- Client `tsc --noEmit` / lint: passed.
- Sequential full-client suite: 39 test-file processes, zero failures (30.2s).
- Production client build: passed (10.02s).
- Actual built-client Chromium tests: 28/28 passed (14 Accessibility and 14
  Design System, 36.4s), including all seven GH-210 cases. Screenshots are
  attached to the browser test report for Sidebar/filter viewports, workspace
  Save and long staged POD names.

The browser run served compiled assets through Playwright request interception,
with the existing synthetic API fixtures. No new development server was started.
All API writes were intercepted. File staging/removal exercised local IndexedDB;
it did not upload to live records.

Baseline measurements were taken on `08a4124` before rebasing onto `c3082e5`;
the relevant baseline control styles were unchanged by that rebase. Chromium
measured shared editable text at 14px/28px for 100%/200% app text, and compact nav
buttons at 44px/88px inside a fixed 72px rail. The updated browser cases verify
16px-equivalent editable text and fixed compact-rail target geometry at enlarged
app text, plus the 44px floor at 90%.

The touched Sidebar count badge keeps the semantic red but uses red-700
rather than red-500: the installed Tailwind palette gives approximately 6.42:1
white-text contrast instead of 3.82:1 when converted to sRGB and evaluated with
the WCAG luminance formula. FilterCombobox uses the existing `border-field`
control boundary. These are scoped palette checks, not a full rendered-state
contrast audit.

The added Design System cases cover 320x900, 390x844, 768x1024, 1280x900 and
844x390 landscape at 200% persisted app Text Size; Sidebar visible labels/compact
geometry; editable computed font sizes; nested filter keyboard selection; 90%
44px targets; and a 320px/200% workspace Save plus a long staged POD filename.
These are layout and interaction checks, not a blanket contrast or usability
certification. Browser zoom and OS/browser font preferences are different from
app Text Size and still require manual checks.

## Deferred module audit and integration

Source review identified these remaining slices. They are intentionally not
silently restyled in this change:

| Module | Source evidence / remaining concern | Next slice |
| --- | --- | --- |
| AccountingCollectionWorkspace | Functional audit/collection labels and values still use text-xs and 10–11px utilities; fixed-width audit labels need enlarged-text review | Accounting typography/reflow, coordinate Accounting owner and #222 |
| RouteSlipMenu | Trigger/actions 11px, section labels 9px, absolute popup with 220px minimum and no collision-aware placement | Export/route-slip typography and overlay reflow |
| ExportMenu | Trigger/options 11px, caption/helper 9px, absolute popup with 220px minimum | Shared export overlay slice with RouteSlipMenu |
| StatusStepper | Status words in 10px pills; enlarged label/pill wrapping requires review | Status-summary typography slice |
| Other workspace controls | This slice only changes proven Save/breadcrumb constraints and shared POD. Remaining native utility controls/overlays retain their existing fonts/geometry | Continue task-by-task audit; do not infer global compliance |

Merged #221 resolved #216 filter/query fixes; Roel's #198 follow-up remains
separately coordinated. This slice preserves the merged filter/query behavior
and personnel-input semantics. #208 owns further focus/modal behavior; no Sidebar opening
focus management is added. #207 camera/map behavior is outside scope. #213 owns
shared visual-system coordination. Do not close #210 from this limited slice.

Manual acceptance under #214 should include real mobile Safari/Android, desktop
keyboard/screen reader, 200% browser zoom, user-preferred browser fonts, 90–220%
app text, sidebar labels/tooltips, landscape scrolling, long real filenames and
required-photo feedback. Real upload recovery and role-authorized workflow checks
need controlled test data; synthetic UI checks do not verify operational storage.
