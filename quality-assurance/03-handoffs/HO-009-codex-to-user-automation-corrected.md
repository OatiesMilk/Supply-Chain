# HO-009: QA automation corrected; live checks pending

| Document control | Value |
|---|---|
| Title | QA automation corrected; live checks pending |
| Version | 1.0 |
| Date | 2026-10-15 |
| Status | Implementation complete; live validation pending |
| From | Codex |
| To | User |
| Previous handoff | HO-008 |
| Related runs | RUN-20261015-02, RUN-20261015-03 |

## Summary

Corrected QA test implementation and reporting inside `quality-assurance/`. The canonical unit runner passes 48 tests. API preflight correctly records Blocked with zero tests and exits 2 when runtime secrets are missing. No live mutations, seeds, resets or application source changes were performed. No branches, commits or pushes were created.

The user's later instruction authorizes Microsoft sign-in for the designated account. An interactive account smoke is implemented, but Microsoft login has not occurred: no CUA browser is connected, and the QA-pinned Playwright dependency is absent. The user's choice to continue offline validation was honored.

## What changed

- Fail-closed runner, current-build reports, canonical test discovery and executable package scripts.
- UI-driven delivery journey with record-specific assertions; exact driver-profile isolation checks.
- Runtime credentials, discovered fixtures, isolated mutable records, local disposable-target checks and sanitized evidence.
- Failure screenshots, console logs and post-login action/screenshot traces with network snapshots disabled.
- Explicit partial-coverage labels and correction notes on historical reports.
- Interactive Microsoft smoke that checks the returned email and role without treating a single account as all roles.

## Validation

- [RUN-20261015-02](../06-reports/automated-RUN-20261015-02.md): 48 unit/infrastructure tests pass, zero failures.
- [RUN-20261015-03](../06-reports/automated-RUN-20261015-03.md): API layer Blocked before any application calls; zero tests; exit 2.
- Strict QA typecheck passes using locally installed Playwright 1.63.0 types through a temporary compiler override. The configured QA version is 1.64.1; its execution is not validated.
- Client and server `tsc --noEmit` pass; tracked diff whitespace check passes.
- `npm ci --offline --ignore-scripts --prefix quality-assurance/e2e` could not install the QA package because a required dependency was not cached. No dependency or lock files were changed.
- Earlier auxiliary runs are preserved: one sandbox execution error and one successful unit validation preceded the final numbered runs.

## Remaining work

The user can install the locked QA dependencies when network installation is appropriate and start the interactive SSO smoke in a graphical browser environment. Microsoft password/MFA/consent must be completed by the user. Multi-role API/browser coverage still requires the configured role credentials. Full TC-ADM-023 checks for System Audit Log and the dashboard chart remain outside the implemented record-audit subset. Existing application defects remain open.

## Links

- [Commands and authentication setup](../e2e/README.md)
- [Remediation details and limits](../06-reports/automation-remediation.md)
- [Original implementation review](../06-reports/automated-test-implementation-review.md)
