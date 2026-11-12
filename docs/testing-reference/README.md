> URL version note (2026-11-04): this reference retains its pinned source baseline. The [full API v1 migration](../API_V1_MIGRATION.md) defines the current URL prefix; historical `/api` entries do not establish compatibility aliases.

# System capabilities, payloads and automation reference

This reference describes the Microgenesis Supply Chain Portal for developers designing unit, component, API integration, database integration and browser E2E tests. It was prepared on **2026-10-27** from source, not from assumptions about ticket titles or old QA reports.

## Baselines and status

| Profile | Source | Meaning for assertions |
| --- | --- | --- |
| `merged-dev` | `8660bdee15b502867716ca0c60683965c6cd87f6` | Merged `dev`, including PR #237 RMA ownership/references, #238 route-slip periods and #240 RMA lifecycle. Default contract in this reference. |
| `historical-efb0283` | `efb0283049d8d71ab35c9acb4d0954d17899970b` | One explicitly historical case records the RMA lifecycle gap before merged #240; do not apply it to current acceptance. |
| `requirements-only` | Issues #231 and #239 | Supplier movement, physical receiving, visibility and Excel/UAT decisions are not established implemented capabilities merely because an issue exists. |

The PR status is a dated GitHub observation. Re-check the target SHA and PR state before a run. This reference does **not** establish staging/production deployment state, human acceptance, or that every listed scenario has run. The working branch used to author the documentation is separate from the pinned source used to inspect the application.

## Reading order

1. [Module capabilities and boundaries](modules.md): what each screen/workflow does; roles, side effects, unsupported operations, and important test cases.
2. [Payloads and request recipes](payloads.md): wire conventions, common record fields, concrete requests, response shapes and limits.
3. [Every registered API endpoint](endpoint-catalog.md): method, path, middleware, observed request fields and exact response expressions, with pinned source links.
4. [Payload types and server serializers](payload-types.md): extracted TypeScript declarations and authoritative record/product/permission serialization.
5. [Latest PR and unconfirmed requirements](latest-pr.md): merged #238 and #240, with explicit historical-versus-current lifecycle expectations.
6. [Automation strategy and fixtures](test-plan.md) and [108-case matrix](test-case-matrix.md): which tests belong at which level, evidence requirements and deterministic fixtures.
7. [Machine-readable scenario matrix](test-cases.json) and [route inventory](endpoint-inventory.json): planning inputs for automation. These are not implemented test suites or runtime JSON Schemas.
8. [Existing test inventory](existing-tests.md): actual test files and static test titles at the merged baseline; presence does not prove coverage or a passing run.

## Contract authority

Use this precedence when evidence disagrees:

1. The approved business rule, recorded with its owner and scope, defines intended behavior.
2. The pinned server route, shared middleware, permission policy and serializer define what this version actually accepts/returns.
3. The client defines controls, requests, local-only state and presentation; it can be more restrictive than the API.
4. Tests are evidence of selected scenarios, with the mocking/DB/browser boundary stated.
5. Older prose, comments, ticket titles and UI success messages are navigation aids; they do not prove implementation.

A difference between intended and implemented behavior is a **gap to track**, not an instruction to change the expected business rule to whatever the code does. Characterization tests can record current behavior, but must be labelled separately from acceptance tests. Do not automatically bless gaps by snapshotting them.

## Important differences already found

- `/api/records/:id` DELETE is disabled for every role. The older API contract describes soft deletion; do not use that older description for new tests.
- RMA is owned by TASS/Admin and readable/printable by Logistics. Merged #240 removes internal Driver/Time In/POD prerequisites for RMA completion; ordinary Delivery controls remain. One historical case explicitly records the pre-#240 gap and must not run as a current acceptance expectation.
- Purchase date and customer contact fields already exist in merged RMA validation, persistence and serialization. Open #230 still requires decisions about requiredness, granularity, contact source/snapshots and document acceptance. “Ticket open” does not mean “field absent.”
- Attachment preview already has an API for valid images, PDF and DOCX. Legacy DOC has a download path but preview returns 415. Do not infer absence of preview from open #232.
- TASS has a default Procurement Pick-up screen grant, but `readableCategories()` currently restricts TASS records to RMA and Accounting Collection. The dashboard also counts pending procurement pickups. This needs reconciliation; do not invent an access rule to make tests pass.
- Record endpoints return display statuses, while Transaction Center returns stored status enums. Assert endpoint-specific contracts.
- Access-request UI changes local state and displays “admin notified,” but does not send an API request. It is not a persisted approval workflow.
- Route-slip files are generated in the browser, not by a `/route-slip` API. Assert the data fetch, downloaded artifact and contents, not an invented export endpoint.
- Stock adjustments labelled “Goods Receipt” are not a complete physical receipt/receiving workflow for operational records. Supplier routing and receiving from #239 remain requirements work.

## Refreshing the generated evidence

Run from a repository with dependencies installed by the normal `npm ci` workflow:

```bash
node scripts/generate-test-reference.cjs /path/to/clean/pinned-checkout docs/testing-reference
```

The command only reads application source and writes the endpoint catalog/inventory, payload types and existing-test inventory. If `test-cases.json` is present in the output directory, it also renders that planning source to Markdown and CSV. It does not start servers, connect to databases, seed data, send email, execute tests, or update GitHub. It uses the installed TypeScript parser, not a network download.

After regeneration, update the handwritten baseline/profile tables, module details, payload recipes and scenario matrix for actual behavior changes. Static extraction cannot resolve all helper validations, dynamic fields, middleware failures or binary response bodies. Read linked source before treating a field as required or a response expression as a JSON example.

## Definition of a useful test case

Record a stable case ID, baseline/profile, module, role and permission overrides, fixture state, request/UI action, expected status and payload, expected database/storage/audit/notification side effects, forbidden side effects, and the test layer. Include failure/retry behavior and save/reload assertions. Avoid tests that only check a button exists or that a mock returned exactly what the test configured it to return.

The scenario matrix is a proposed implementation backlog. An `existing_test_files` entry is a starting point for inspection, not a coverage assertion. Existing suites include HTTP handlers with mocked Prisma and JSDOM interactions; those do not substitute for real PostgreSQL, persisted file storage or a real browser.
