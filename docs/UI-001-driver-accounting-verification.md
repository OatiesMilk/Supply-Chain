# GH-208 Driver and Accounting accessibility follow-up

## Baseline and scope

This follows UI-001 PR #215 and shared controls PR #217, on the merged
UI-003 PR #218 baseline, starting from `dev` commit `ef66d1e` on 2026-10-23. It addresses the Driver status confirmation and Accounting
Collection create form portions of [#208](https://github.com/OatiesMilk/Supply-Chain/issues/208).

The Driver uses the existing native `ActionDialog`. It provides an accessible
name/description, explicit bidirectional Tab boundary wrapping and native Escape dismissal, preserves
the trigger for focus restoration, and inherits viewport-bounded scrolling.
Remarks retain their required help, cannot be changed while saving, and remain
available with save failures for retry. Cancel/Escape stay blocked while saving.
Existing staged-upload-before-status-write, Time In, recipient, allowed-status and
completion-photo checks remain in their original paths. Receiver controls now
also reference the existing completion help.

All eleven Accounting create-form labels identify their controls. Validation
errors describe the relevant controls and are announced; invalid Submit continues
to focus the first invalid field. A visible native multiple-file input replaces
the click-only upload area. Touched form controls/actions have visible keyboard
focus and use the existing fixed control-height token, including at 90% text size.
Save as Draft still requires only a company; native required validation has not
been added to fields that would prevent that workflow. Attachment retry, lifecycle,
requests and payload construction are unchanged.

## Automated evidence

- Client `tsc --noEmit`: passed after implementation.
- `client/tests/driverAccountingAccessibility.test.ts`: passed. Behavioral checks
  exercise invalid Submit with no create callback, linked field errors, first
  invalid focus, actual company-only draft payload, required Driver remarks,
  blocked pending dismissal, saved remarks trimming, failed-write retry and reopen.
- Full client suite: passed with the repository test globs and
  `--test-concurrency=1` (39 test-file processes, 0 failures, about 24.3 seconds after the CI fix).
- Parent validation: production client build passed; server baseline typecheck
  passed. Backend source is unchanged by this slice.
- Playwright Accessibility project discovery: passed, 14 tests, including four new
  follow-up cases. New fixtures use synthetic responses and intercept all writes;
  no real account or customer mutation is needed.
- CI run [39889719801](https://github.com/OatiesMilk/Supply-Chain/actions/runs/39889719801)
  passed quality checks, builds, typechecks and client/server tests. Accessibility
  reported 11 passed and 3 failed: the Driver modal Tab containment case at each
  viewport. The Accounting case passed.
- A standalone Chromium experiment reproduced native modal focus moving from the
  final button to browser chrome (`document.activeElement` becomes `body`). The
  background control remained inert. The failure was a real gap in the stronger
  keyboard containment contract, rather than a background authorization or save
  regression.
- `ActionDialog` now wraps Tab and Shift+Tab at its current enabled, visible
  boundaries. It skips hidden/inert/disabled controls and negative tabindex,
  handles pending states with no enabled controls by focusing the dialog, and
  retains native modality and focus restoration. Its pending transition also
  refocuses the modal if disabling the focused action leaves keyboard focus out
  of reach of the dialog's key handler.
- Focused shared-dialog regressions cover both boundaries, normal interior Tab,
  disabled confirmation, hidden/inert/disabled-fieldset/negative-tabindex controls,
  pending fallback/dismissal and a single-action dialog. The browser regressions
  retain the original containment checks and add explicit reverse boundaries,
  disabled confirmation and rejection of background focus.
- The parent ran the actual bundled React `ActionDialog` in Chromium without an
  application server. Its Tab/Shift+Tab, exclusions, pending fallback, Escape and
  Cancel focus-restoration checks passed.
- The production client build passed after the focus correction. All 21 existing
  Accessibility and Design System browser cases then passed against those built
  assets in Chromium (one worker, retries disabled, about 21.8 seconds), including
  all three previously failing Driver viewport cases and the Accounting case.
  A temporary local runner copied the repository specs unchanged except for a
  beforeEach route that fulfilled localhost static-asset requests from the build
  output. The specs' own synthetic API fixtures retained precedence; no server or
  live API was used. This establishes built-client browser behavior with mocked
  API responses, not backend role authorization, persisted writes or staff
  acceptance. Localhost:3000 remains offline; no new development server was started.
  Current-head GitHub CI still must validate the integrated role suites.

## Integration and manual acceptance gates

The browser additions cover Driver modal keyboard containment/restoration and
viewport fit at 320, 390 and 1280px, and Accounting clickable labels, error focus,
native file chooser and action targets at 90% persisted text size. Run the
Accessibility project against the branch's running client before acceptance.

[#214](https://github.com/OatiesMilk/Supply-Chain/issues/214) still owns the
representative staff/device/screen-reader acceptance record. Check Driver Time In,
Pending/Rescheduled and successful completion with a real valid photo/receiver;
check rejected uploads, failed-save retry, and Accounting draft/submit/upload-retry
with authorized test data. Verify a short viewport, 200% text, keyboard-only flow
and screen-reader error/help announcements. Synthetic UI tests do not verify
backend authorization, storage, email delivery or operational business acceptance.

Sidebar/Navbar, AccessRequestModal, global CSS, backend APIs and permission/schema
changes are outside this slice. Shared visual work under #213 and other #208
acceptance items remain independently coordinated; this change does not close #208.
