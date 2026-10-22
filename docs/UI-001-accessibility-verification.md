# UI-001 accessibility verification

Issue: [#208](https://github.com/MarcZxc1/Supply-Chain/issues/208). Baseline source: `dev` at `7e37bc1`.

## Before and after

| Flow | Baseline source evidence | Implemented behavior and regression |
| --- | --- | --- |
| Email sign-in | Email and Password labels did not reference their existing input IDs; login error was an ordinary div. | Clicking either label focuses its field. Authentication errors are announced and receive focus. Browser test submits rejected synthetic credentials. |
| Record creation | Shared combobox and several labels had no association; Delivery Date said optional; attachment selection required clicking a div. | Associated labels, required-to-submit/draft explanation, linked field errors and first-invalid-field focus. Native file control supports keyboard selection without uploading before save. |
| Record workspace | Several editable fields lacked names; invalid remarks were not connected to their textarea; attachment-removal overlay lacked native modal behavior. | Named fields and connected required-reason errors with focus; removal reuses ActionDialog and restores trigger focus after Escape. |
| Global search | Plain backdrop/content div with document Escape listener; background remained keyboard reachable. | Named native modal; combobox/listbox result announcements, arrow/Enter selection, explicit Tab boundaries, Escape and trigger focus return. Browser testing caught and corrected the native dialog's Tab boundary reaching browser chrome. |
| Notifications | Linked rows depended on mouse clicks; popup lacked keyboard dismissal and focus handling. | Separate native linked-record and mark-read buttons, named nonmodal region, Escape/close return focus, Tab can leave the popup. Navigation and notification API behavior are preserved. |
| Admin and inventory | Multiple inputs/filters lacked labels; icon/row actions had small targets. | Associated names and labels, connected API errors; 44px preferred hit areas for prioritized actions. Destructive Admin dialog is tested without performing the action. |
| Shell, comments and POD | Small toolbar/send/removal targets; some feedback only in generic banners or toasts. | Named 44px primary/icon targets with focus styles; connected comment/POD errors and announced API banner. Toolbar wraps on narrow screens. |

## Reproduce automated evidence

Local verification on 2026-10-22 passed: client/server typechecks and production builds, all 33 client test files, all 283 server tests, and 17 executed Chromium tests (9 accessibility + 8 dashboard), with retries disabled. The keyboard file-selection regression also passed three consecutive targeted runs.

Use the existing frontend on port 3000 and backend on port 4000; these tests do not start servers.

```bash
npm run lint --workspace=client
npm run build --workspace=client
npm run test:client
npm run lint --workspace=server
npm run test:server
npm run test:accessibility --prefix e2e
npm run test:dashboard --prefix e2e
```

The accessibility suite intercepts API responses using synthetic accounts, companies, records and files. It never sends live account/record writes. It checks 320/390/1280px search layouts, keyboard containment, arrow/Enter navigation, Escape/return focus, login labels/errors, native file selection, record/workspace validation, Admin labels and destructive-dialog cancellation, inventory filter names and the portal's 200% text-size setting at a 640px CSS viewport. The latter exercises enlarged text and reflow; it is not a claim that every browser's zoom implementation has been manually tested.

Search screenshots at all three widths are attached to the Playwright HTML report. Run `npm run report --prefix e2e` to inspect `e2e/playwright-report/`; CI retains its `playwright-artifacts` report and test outputs for seven days on success and failure. Screenshots use only synthetic data.

CI also runs the existing Sales Coordinator, Logistics, Driver and integration suites against its isolated PostgreSQL service, retaining the real authorization, lifecycle and stored-file regressions. Attachment removal assertions now use the shared native dialog's `dialog` role.

## Limits and remaining human verification

Browser and DOM checks verify accessible names, error relationships, keyboard behavior and layout. They do not establish WCAG conformance or prove the spoken output of assistive technology. NVDA/VoiceOver and observed nondeveloper task sessions were not available in this environment. Before acceptance, review the prioritized flows with a screen reader, actual browser zoom and phone hardware; UI-006 owns the broader cross-role usability program.

The implementation follows the [WAI modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/). The project's preferred 44px target is stronger than [WCAG 2.2 AA SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), which specifies 24px with defined exceptions. This work does not change permissions, lifecycle requirements, persistence or notification side effects.
