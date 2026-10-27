# Automation design and test boundaries

Use the [108-case scenario matrix](test-case-matrix.md) as a starting backlog, the [JSON](test-cases.json) for tooling and the [CSV](test-cases.csv) for team planning. These cases have **not** been implemented/executed by writing this reference. Existing files in [the inventory](existing-tests.md) need inspection before marking a case covered.

## 1. Choose the correct layer

| Layer | Real boundary | Best assertions | What it cannot prove |
| --- | --- | --- | --- |
| Unit | Pure validator/policy/mapper/date/grouping/serializer, controlled inputs/clock | Exact allowed transitions, required fields, enum mapping, array/null behavior, role policy, numeric/date edges | HTTP middleware order, real DB constraints, persisted files, browser UX |
| Component | Real React component/hooks under JSDOM, controlled network/query store | Labels/actions/disabled state, invalid input, request body/call order, loading/error/retry, cache invalidation, keyboard state | Real layout, camera, native PDF/Office rendering, DB persistence |
| API integration | Express routes + real auth/security middleware with controlled service adapters | Status/headers/wire DTO, session/CSRF/role/scope, validation before side effect, error mapping, helper interactions | Real transaction isolation or file durability if Prisma/storage are mocked |
| Database integration | Actual isolated PostgreSQL, Prisma and migrations, real data relationships; controlled external services | FK/unique constraints, row locks, races, rollback, append-only audit/remark attribution, save/read consistency | Production identity/config, third-party mail/SSO availability, UI usability |
| Storage integration | Actual temporary local storage or isolated private bucket, actual file bytes | Quotas, format proof, streaming, cleanup/compensation, missing object, no unauthorized byte access | Browser rendering fidelity or remote storage durability if only a fake adapter is used |
| Artifact | Actual generated XLSX/PDF/DOCX/CSV bytes | Matching periods/row IDs/groupings/totals, sheet/document structure, meaningful text, no unauthorized records | Visual print fidelity solely from strings, all-page loading if generator receives only a preselected array |
| E2E | Real browser → app origin → Express → isolated database/storage | Role handoffs, form+payload+persisted reload, search/deep-link/cache, uploads/downloads, screenshots/mobile/focus | Every validator permutation; real email inbox delivery when mail provider is mocked |
| External integration smoke | Explicit approved external test tenant/inbox/storage environment | Actual Microsoft/Teams sign-in, real mail receipt and persistent private storage | Approval of unrelated production behavior or complete workflow coverage |

The repository uses `node:test` through `tsx`, not Vitest. Existing API tests frequently replace Prisma and mount a small Express app on an ephemeral port. Call those **HTTP tests with mocked persistence**; do not label them a real-DB integration run. JSDOM is useful but is not a replacement for a browser screenshot or a persisted workflow.

## 2. Deterministic fixture contract

Create fixture data through test setup appropriate to the isolated environment. Do not rely on random sampler output, production IDs or display names. Use synthetic domains/addresses and fake provider adapters; do not send real notifications to colleagues from automation.

| Fixture | Required variants |
| --- | --- |
| Roles | Active SC/Logistics/TASS/Admin, a second Admin, linked Driver A/B, unlinked Driver C, inactive/deleted user; known default and explicit grant/deny snapshots |
| Driver directory | Stable IDs distinct from user IDs; same display name collision; Driver versus Assistant; inactive profile; valid whole Subregion versus one Area; already-linked/unlinked identities |
| Companies/directories | Real Company ID for operations, separate Customer/Supplier IDs, same-name companies with different IDs, contact lengths/empty/nulls, supplier categories outside UI options |
| Records | All five categories; Draft/Scheduled/In Transit/Pending/On-Hold/Rescheduled/Delivered; unassigned/A/B; deleted historical row; saved linked accessible/inaccessible/draft collection |
| Dates | Frozen Manila today; yesterday/tomorrow; day before/from/to/day after; undated; leap day/impossible date; UTC just across Manila midnight; Sunday/new year; month-end |
| Lifecycle | Existing valid Time In, invalid legacy stamp, completed late persisted flag, recipient blank/nonblank; legacy RMA Scheduled with historical clocks |
| Files | Actual valid small PNG/JPEG/PDF/DOC/DOCX; fake extensions/MIMEs; missing storage object; exact10MiB/+1 byte; 9/10 files; 50MiB edge; macro/zip traversal/bomb/polyglot fixtures |
| Inventory | Zero/one/positive/maximum balance; allocated ATP; missing legacy inventory row; duplicate code; 21+ transactions for latest20 detail and five related-row boundaries |
| Pagination | At least201 scoped matches plus foreign-category/nonmatching cached rows; identical createdAt ties; terminal cursor; custom-sort rows beyond first page |
| Notifications | >50 unread for one user, another user's ID, missing/denied target record; AM exact match/surname fallback/no match; mock and failing mail outcomes |
| Concurrency | Two permission/customer editors; two stock deductions; assignment vs deactivation; upload vs quota; proof-delete vs completion; duplicate collection verification |

Freeze time at the unit/API adapter boundary or inject an explicit clock where supported; avoid globally changing a production server clock. Isolate modules that read environment settings at import time. Never log real cookie/CSRF/JWT/OAuth secrets in artifacts.

Keep fixtures traceable: test-run prefix, stable logical aliases mapped to generated DB IDs, recorded role/profile link, and cleanup ownership. Never let Driver display names determine expected ownership. Prefer independent browser contexts/cookie jars per role.

## 3. Every mutation test should inspect more than the response

For a successful record mutation, read it back and verify relevant fields plus the actor, audit snapshot and appended remark. For upload, list/download actual bytes; for stock, check balance and transaction; for permissions, fetch fresh `/me`; for notification read, verify owner-specific unread count. A mock call count alone is insufficient evidence of persistence.

For a rejected request, assert forbidden side effects were absent: record/stock/permission unchanged, no orphan object, no audit “success,” no external send. Explicitly distinguish a pretransaction reject, a transaction rollback and a failure in a notification performed after a successful commit.

The code does not make all workflows atomic. Collection verification has separate update/audit/notify awaits; email and some notifications occur after commit; storage is outside the database and uses compensation. Those need controlled fault injection and persisted outcome assertions, not an invented universal rollback expectation.

## 4. Contract-testing rules

1. Test canonical display/status values on record endpoints and stored enum values on Transaction Center separately. Never use one overbroad DTO for both.
2. Treat query aliases as endpoint-specific. `/records` dateFrom/To means scheduled date; legacy status-history aliases default to creation; report aliases mean scheduled date; inventory transaction bounds use another implementation.
3. Separate missing property, null, empty string and false. `is_draft` is a display string; absent Delivery lateness keys differ from false for a non-Delivery record.
4. Follow actual serializer keys; do not assert database-only columns, password hashes or OAuth tokens. Dynamic IDs/timestamps need pattern/range and identity assertions.
5. Do not assume a universal 404 or strict unknown-field rejection. Shared record middleware often returns403; some field branches ignore unsupported properties. Verify actual readback.
6. Assert `204` without attempting JSON parsing. Follow streaming and redirect contracts outside the generic JSON wrapper.
7. A role or screen grant is not sufficient by itself: test role+resource+category+ownership+state combinations.
8. A browser success message is not an external side effect. Access requests are currently local-only; mail ok/mock means neither inbox delivery nor approved recipients.
9. Do not treat generated TypeScript response expressions as literal JSON Schemas. Resolve helpers and serializer/nullable conditions before building validators.
10. Distinguish characterization-gap cases from intended acceptance. A known invalid-input or access inconsistency must remain visible as a defect/business decision, not become the desired policy by snapshot.

## 5. Small set of high-value browser journeys

Keep broad input permutations at lower layers. Browser journeys should integrate the most important handoffs:

| Journey | Roles / expected evidence |
| --- | --- |
| Delivery lifecycle | SC submits → Logistics assigns → assigned Driver starts/uploads/completes → SC sees persisted result, audit/remarks and allowed notifications |
| RMA entry/print | TASS saves/edits optional reference/details → Logistics opens/prints but cannot mutate; SC/Driver denied |
| RMA completion (merged #240) | TASS/Admin completes with recipient/remarks in one status request, no fabricated Driver/Time In/POD; reload shows Completed at and audit |
| Accounting verification | Completed Accounting Collection → TASS verifies once → creator sees result; other roles cannot verify |
| Attachment retry | Create with staged files → one upload fails → retry only failed file → one record, expected stored files/preview/download |
| Route-slip export (#238) | Choose day/from/range with >100 filtered matches → export actual files → validate correct period/records/groups and no inaccessible rows |
| Customer concurrency | Two editors → one saves → second409 keeps user input → reload/retry and audit |
| Inventory mutation | Admin catalog create → permitted stock adjustment → balance/ATP/transaction visible; unauthorized role cannot alter stock |
| Session/revocation | Open protected detail → Admin revokes permission/deactivates account → next request/UI denies; logout/back/second-user cache remains isolated |
| Search/Drivers/mobile | Keyboard and narrow viewport navigation → correct category detail; Driver cannot access foreign run; no stale search reopening or clipped action controls |

Capture screenshots only where layout/focus/preview/print fidelity adds evidence. For downloads record case ID, relevant expected row IDs/count, file checksum/name and parsed assertions; raw customer data or session headers do not belong in artifacts.

## 6. Current suite boundaries and commands

Run from the accepted checkout with normal dependencies already installed. These are instructions, not commands executed by this reference-writing task:

```bash
npm run lint --workspace=client
npm run lint --workspace=server
npm run test:client
npm run test:server
```

For focused tests, use the existing Node runner and real repo paths, for example:

```bash
node --import tsx --test client/src/utils/__tests__/routeSlipPeriod.test.ts
node --import tsx --test client/tests/routeSlipExports.test.ts client/tests/routeSlipMenu.test.ts
node --import tsx --test server/tests/recordsIntegration.test.ts server/tests/podRequirements.test.ts
```

Existing browser suites:

```bash
npm run e2e:sc
npm run e2e:logistics
npm run e2e:driver
npm run e2e:integration
```

Use existing local frontend/backend on3000/4000; do not start additional dev servers as a test side effect. Read `e2e/playwright.config.ts` and `e2e/tests/global.setup.ts` for actual configured base URL/account setup before running, without printing credentials. The CI workflow provisions its own disposable PostgreSQL service and serves the built app on3000; that isolated CI setup is distinct from local services. Do not copy CI seed commands into a shared/staging database.

CI quality gate includes Prisma validation/generation, both typechecks/builds and both full Node suites. Browser jobs run the three role suites plus integration. Existing browser files primarily focus on SC/Logistics/Driver; a default passing CI run is not proof of complete TASS/Admin/RMA/receiving coverage. Do not count test discovery or a skipped case as an executed pass.

PR #240 is merged as `8660bde`, includes #238, and has a green integrated CI run; see [the SHA-bound evidence](latest-pr.md). RMA240 cases now belong to `merged-dev`. Only the explicitly tagged `historical-efb0283` case describes the previous lifecycle blocker; it must not be used as a current expected failure. `requirements-only` scenarios are decision/test-design work, not executable implemented-system assertions.

## 7. Coverage and defect bookkeeping

For each stable case ID, track planned/implemented/executed result, source SHA, environment identity, layers actually exercised, linked test name, mocks used, artifact reference and unresolved defect/decision. Use `characterization-gap` labels to keep known implementation limitations separate. The JSON's `existing_test_files` are relevant inspection candidates and can contain current or explicitly historical files; they are not automatic coverage declarations.

Prioritize P0 authentication/authorization/data-loss/proof/concurrency cases, then P1 operational workflows and report correctness. For expensive combinations, cover validators thoroughly at unit/API level and a smaller representative browser set. Expand testing after a code change/failure/identified gap; avoid repeated full runs that add no new evidence.

## 8. Suggested team split

| Person | First automation workstream | Review/coordination |
| --- | --- | --- |
| Marc | #238 route-slip artifact/pagination regressions; #230 RMA field/document cases once business rules confirmed | Maintain capability-to-case traceability and compare new payloads against serializers |
| Dylan | Auth/CSRF/proxy/module/record-scope and API contract cases; coordinate #239 receiving/movement decisions | Review #240 role/lifecycle boundaries and real-DB transaction/concurrency coverage |
| Julius | #236/#240 TASS/Admin RMA persisted completion E2E and lifecycle regressions; later #231 supplier workflow after approved decisions | Run cross-role/browser handoffs and negative ownership/file cases |

This is a suggested automation split for the reference. The documentation task does not reassign GitHub tickets or approve unresolved business rules.
