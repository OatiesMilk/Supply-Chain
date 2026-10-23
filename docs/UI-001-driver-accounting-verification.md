# GH-208 Driver and Accounting accessibility follow-up

## Baseline and scope

This follows UI-001 PR #215 and shared controls PR #217, on the merged
UI-003 PR #218 baseline, starting from `dev` commit `ef66d1e` on 2026-10-23. It addresses the Driver status confirmation and Accounting
Collection create form portions of [#208](https://github.com/OatiesMilk/Supply-Chain/issues/208).

The Driver uses the existing native `ActionDialog`. It provides an accessible
name/description, browser modal focus containment and Escape dismissal, preserves
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
  `--test-concurrency=1` (38 test-file processes, 0 failures, about 29.8 seconds).
- Parent validation: production client build passed; server baseline typecheck
  passed. Backend source is unchanged by this slice.
- Playwright Accessibility project discovery: passed, 14 tests, including four new
  follow-up cases. New fixtures use synthetic responses and intercept all writes;
  no real account or customer mutation is needed.
- Browser execution is pending: localhost:3000 was offline and repository rules
  prohibit starting another development server for tests. Test discovery does not
  establish browser acceptance. JSDOM's dialog stub does not establish browser
  top-layer inertness, focus containment, or native focus restoration.

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
