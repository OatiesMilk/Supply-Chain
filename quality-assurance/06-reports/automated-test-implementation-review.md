# Automated test implementation review

Date: 2026-10-15. Reviewed working tree at commit `665775f`, including untracked QA tests and reports. This is an implementation review, not a new UAT execution or release sign-off.

## Assessment

The tests contain useful assertions against actual application services and HTTP endpoints. The implementation does not yet provide dependable automated UAT evidence: the report generator can report success after execution failures, and browser workflow coverage is substantially narrower than its labels and reported case results imply.

Two separate implementations exist: `automated-tests/` (16 unit, 13 integration and 10 API journey tests) and `e2e/` (41 unit, 31 API and 9 browser tests). The pyramid runner executes only the former. Its results do not include the newer browser or major-defect regression suites.

## Findings

### High: Report generation ignores failed test processes

Location: `automated-tests/run-pyramid.ts:35–83, 88–90, 133, 229`.

The runner ignores subprocess exit status, spawn errors and signals; it derives success from regex matches against human-readable output. Unrecognized output or a startup failure can produce zero detected failures and a successful report. It also hard-codes a 100% pass rate, successful traceability rows and a zero-defect conclusion, and never propagates test failures through its own exit status.

Verified with an in-memory execution of the transpiled runner, replacing all three subprocesses with exit-code-1 failures and intercepting file writes. Result: three failed processes, zero tests, `PASSED (100%)`, and “tests passed with zero defects.” No application calls or file writes occurred in this reproduction.

### High: Browser lifecycle tests bypass the workflows they claim to verify

Location: `e2e/browser/delivery-workflow.test.ts:57–83, 96–110, 126–136, 154–175, 193–210, 254–263`.

Creation, assignment, Time In, upload and delivery completion happen through the API. Browsers log in and visit generic screens afterward. Creation checks only that the body contains “Deliveries”; assignment and Time In have no record-specific UI assertions; completion checks a generic “ACCOMPLISHED” label. These tests can pass when the relevant form, dispatch control, upload interface or completion action is broken.

The Admin step checks an API audit array's length, then screenshots the Deliveries list without opening the record's Audit Trail. TC-ADM-023 additionally requires named actors/events in time order, matching record audit events, and the dashboard status count. Those requirements are not established by this test. The reload step also verifies persistence through an Admin API request rather than the reloaded Sales UI.

### High: Driver isolation test does not establish ownership

Location: `automated-tests/e2e.test.ts:262–274`.

`test_driver_cannot_access_unassigned_records` checks only that listed records are non-drafts and have a nonempty driver name. A record assigned to another driver satisfies both assertions. An empty response also passes. There is no known foreign record retrieval attempt or comparison to the signed-in driver's linked profile.

### High: Mutation probes lack a disposable-target guard and can change shared fixtures

Location: `e2e/helpers/auth.ts:3, 48–65`; `e2e/api/major-defects-regression.test.ts:155–167, 199–210`.

The API base is freely configurable and the helper also accepts absolute URLs without enforcing the QA manual's localhost restriction. The suites do not verify a disposable target before making writes. The stale-edit probe updates the first customer returned, while the invalid adjustment probe posts stock against the first SKU. If the expected guards fail, these operations alter shared fixture data. Repeated runs can accumulate records, SKUs and stock movements, changing subsequent results. The deletion probe is also destructive if the refusal defect remains present.

### Medium: Hard-coded credentials, fixture IDs, paths and dates make reruns fragile

Location: `e2e/helpers/auth.ts:15`; `e2e/api/major-defects-regression.test.ts:19, 42`; `e2e/browser/delivery-workflow.test.ts:8–13, 55, 61, 99–100`; `e2e/browser/browser-defects.test.ts:6–9`.

Credentials are embedded in test source rather than supplied at runtime as required by the QA manual. Company and driver IDs are tied to an existing database instance; browser files load Playwright through an absolute path to the root E2E directory despite a separate QA dependency installation. Artifact paths and several operational dates are fixed. Reseeding or moving the repository can invalidate the tests independently of application behavior. Status-only validation tests can also accept an unrelated validation error as proof that the intended field guard works.

### Medium: New run reports contain conclusions the implementation does not establish

Location: `06-reports/UAT-summary-RUN-20261015-01.md:57–62`; `e2e/api/major-defects-regression.test.ts:155–174, 221–235`.

The DEF-021 probe checks only an API 409; it does not exercise two concurrent forms or the conflict-resolution UI. The DEF-029 probe checks only an inverted date range's API response; it does not open Reports or observe a loading spinner. The summary nevertheless describes current UI failures. DEF-019 is also listed as confirmed open without a corresponding export test in these suites. Prior findings may remain open, but these tests do not independently reconfirm them. Several references use nonexistent case families such as TC-CUS, TC-SEC and TC-REP instead of the approved case identifiers.

### Medium: Failure evidence and execution wiring are incomplete

Location: `e2e/package.json:7`; `e2e/browser/*.test.ts`; `artifacts/RUN-20261015-01/index.md`.

The QA package's `test` script still exits with “no test specified.” The separate pyramid runner does not discover the newer suites. Browser tests close their contexts in `finally` without capturing a failure trace or console errors; workflow screenshots occur after assertions, so earlier failures can leave no screenshot. The new artifact directory contains eight PNGs and its index, without retained API response JSON, traces or console transcripts. This falls short of the QA manual's evidence requirements and limits independent verification of the reported run.

## Verification performed

- Executed each of the five `e2e/unit/*.test.ts` files directly with `node --import tsx`: **41 passed, zero failed**.
- Executed `automated-tests/unit.test.ts` directly with the same loader: **16 passed, zero failed**.
- Verified the runner's false-success path with mocked subprocess failures and intercepted writes.
- Read API and browser implementations, application routes, approved TC-ADM-023 and original defect descriptions. No live API/browser mutation suite was executed for this review.
- No application source, dependencies, configuration, test implementations or existing run results were changed.

The unit results support the isolated business-rule assertions they execute. They do not establish full UI acceptance or resolve the existing UAT defects.
