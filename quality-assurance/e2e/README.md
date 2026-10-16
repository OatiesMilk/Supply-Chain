# Automated QA tests

The canonical suites are `unit/`, `api/` and `browser/`. They use Node's built-in test runner; browser assertions use the QA package's Playwright dependency. `../automated-tests/run-pyramid.ts` discovers these suites, captures TAP results and returns a nonzero exit code for failures, execution errors, incomplete results or blocked prerequisites. The old integration/browser entry points forward to the canonical suites; do not combine them with discovery or tests will run twice.

Install the root workspace dependencies first, then run `npm ci --prefix quality-assurance/e2e` to install the QA package's locked dependencies. No dev servers are started by these tests.

From the repository root:

```sh
npm run test:unit --prefix quality-assurance/e2e
npm run test:api --prefix quality-assurance/e2e
npm run test:browser --prefix quality-assurance/e2e
npm test --prefix quality-assurance/e2e
npm run typecheck --prefix quality-assurance/e2e
```

API and multi-role browser tests require the existing local servers on ports 4000 and 3000, and runtime secrets `UAT_PASSWORD_SC`, `UAT_PASSWORD_LOGISTICS`, `UAT_PASSWORD_TASS`, `UAT_PASSWORD_ADMIN`, `UAT_PASSWORD_DRIVER`. Provide these through your secret setup; never put them in source, shell history, reports or committed files. Missing prerequisites produce Blocked, not Pass.

Writes check that `server/.env` configures local PostgreSQL with a database ending `_sandbox` or `_test`, and reject conflicting inherited database settings. Run the API with that configuration: the public health endpoint does not expose its actual database name, so the tests cannot independently attest that the running service uses this file. Requests are restricted to `http://localhost:4000/api`; redirects and absolute request paths are rejected. Never point a proxy at a remote environment. The suites create uniquely named test records/customers/SKUs and leave them as evidence. They do not seed, reset or delete them for cleanup. Negative probes may create invalid data or change their isolated fixtures if a defect is still present. TC-DEL-024 contains one deletion-refusal probe against its own disposable fixture.

Each run allocates a new `RUN-YYYYMMDD-NN` directory and writes an execution log, report, sanitized API responses, test transcripts and an artifact index. Browser tests capture record-specific checkpoints and screenshots at failure. Action/screenshot traces begin after authentication, with DOM/network snapshots disabled, so credentials, session headers and authentication pages are not captured. Sessions stay in memory.

The browser lifecycle drives creation, assignment, Time In, photo selection and completion through UI controls. It verifies the completed record and its record-level audit. It is explicitly a subset of TC-ADM-023: the System Audit Log and Records by Status chart still need their separate acceptance checks. Likewise, the stale-customer and inverted-range API probes do not verify the corresponding UI defects. A regression pass is not UAT sign-off.

## Microsoft account smoke

The user authorized Microsoft sign-in on 2026-10-15. For the requested account, run:

```sh
UAT_MICROSOFT_EMAIL=dagodemarcgeraldarante@gmail.com UAT_MICROSOFT_ROLE=sales npm run test:sso --prefix quality-assurance/e2e
```

This opens a headed QA browser. Complete Microsoft sign-in, password/MFA and any consent review yourself. The test verifies the returned email and records only email and application role, then captures the authorized landing screen. It never creates an account, changes permissions or exports cookies. A single account covers its own role; this smoke does not substitute for multi-role RBAC or delivery acceptance. Do not mix `--sso` into the multi-role suite.

The SSO smoke requires a graphical browser environment and the QA Playwright installation. It allows ten minutes for user-completed sign-in/MFA. Optionally set `UAT_BROWSER_EXECUTABLE` to an installed Chromium executable when the Playwright-managed browser revision is unavailable. The requested account's role is explicitly checked as `SALES_COORDINATOR` when `UAT_MICROSOFT_ROLE=sales`.
