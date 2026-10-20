# HO-010: Microsoft login verified as Sales Coordinator

| Document control | Value |
|---|---|
| Title | Microsoft login verified as Sales Coordinator |
| Date | 2026-10-15 |
| From | Codex |
| To | User |
| Status | Complete |
| Related run | RUN-20261015-07 |
| Previous handoff | HO-009 |

The requested Microsoft sign-in for `dagodemarcgeraldarante@gmail.com` succeeded after the user completed MFA. The portal's authenticated identity endpoint returned HTTP 200 and role `SALES_COORDINATOR`; the rendered dashboard displayed the Sales Coordinator profile. The account smoke passed, 1/1 tests. The browser closed after the test; no cookies or session tokens were exported.

The original MFA wait expired in RUN-20261015-04. RUN-20261015-05 identified a test timing error at the OAuth callback; the corrected test waits for callback completion and a valid portal session. The final successful run is authoritative for this login check. Earlier diagnostics remain preserved and do not establish an account-role defect.

The existing QA lockfile dependencies are now installed; QA TypeScript validation passes. RUN-20261015-06 passed all 48 unit/infrastructure checks. The login smoke used pinned Playwright 1.64.1 with preinstalled Chromium revision 1243. No application code, account permissions, environment files or seed data changed. No commits or pushes were created.

Other roles, full delivery workflows and existing UAT defects are outside this account smoke and remain unverified by this run.

- [Login report](../06-reports/SSO-summary-RUN-20261015-07.md)
- [Identity evidence](../artifacts/RUN-20261015-07/SSO-account-identity.json)
- [Dashboard evidence](../artifacts/RUN-20261015-07/SSO-account-01-authenticated-role-screen.png)
- [Artifact index](../artifacts/RUN-20261015-07/index.md)
