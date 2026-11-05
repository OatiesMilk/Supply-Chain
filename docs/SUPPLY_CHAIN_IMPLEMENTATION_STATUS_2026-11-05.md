# Supply Chain implementation status

## Current reconciliation

**Reconciled:** 2026-11-05

**Source baseline:** clean local `dev` at `6aad0f7`, before this documentation edit

**Initial reconciliation evidence:** source and existing test/report inspection at 6aad0f7; subsequent implementation/test evidence is recorded in dated follow-ups below

Use this section and the [original AUD ticket mapping](AUDIT_DEVELOPMENT_BACKLOG.md#ticket-mapping-and-recommended-order) when selecting work. The original review at `e56a8da` is preserved below as history. An old Open label or unchecked acceptance box is not sufficient evidence that code is missing.

### User decisions after PR #297

**Recorded:** 2026-11-05, with local dev at `15a7cd1`. These are scope decisions, not new application changes or test results.

| Item | User decision | Current disposition |
| --- | --- | --- |
| Password policy | Defer changes during development to keep development logins easier. | Deferred during development; the remaining password-management gaps are not marked fixed. Revisit when development ends. |
| Supplier categories | Admin manages the category catalog; suppliers can have multiple categories. | Approved requirement, implementation pending. Supersedes the earlier proposed fixed list of five values. Category administration is Admin-owned; supplier selection continues to use the applicable supplier authority. |
| Data Sampler | No further fixes; remove the module when development is complete because it is not needed in the final product. | Temporary development capability; removal planned. The category-permission question is superseded for current work selection. Existing merged fixes and safeguards remain until removal. |

### Data Sampler retirement task

**Trigger:** the user declares development complete. **Status:** planned; the module has not been removed.

- Retire the sampler UI/navigation, API client methods, server endpoints/registration and its permission-catalog integration together. Review persisted role/account permissions so removal does not invalidate normal sessions or policies.
- Retire sampler-only tests/docs and preserve shared validation/helpers and coverage used by normal operational workflows.
- Module retirement does not authorize deleting generated records, audit history, attachments or resetting any database. Data cleanup requires its own explicit scope.

### Classification definitions

| Classification | Meaning |
| --- | --- |
| Source-confirmed open | The current source trace still matches the documented gap. Runtime/deployment impact is qualified separately. |
| Implemented; verification pending | The repair exists in source; the specified acceptance evidence is still needed. |
| Partially implemented | Existing behavior is identified alongside the remaining scope. |
| Decision needed | Product or operating behavior must be agreed before that change. |
| Deferred during development | The user has postponed the work; the underlying gap is not marked resolved. |
| Removal planned | A temporary capability will be retired at the agreed development-completion point; removal has not occurred. |
| Verification pending | A historical observation or integration concern needs a current reproduction; no current defect is asserted. |
| Closed by requirement / Done — merged | An existing product decision or recorded implementation/acceptance resolves that scope. |

### Health/readiness follow-up

**Implemented locally:** 2026-11-05 on dev baseline `419b8bf`; awaiting PR, merge and deployment.

- [Public readiness](../server/src/routes/health.ts) retains the database ping
  and required production configuration checks. It returns only
  `{"ok":true}` (200) or `{"ok":false}` (503), with no-store caching.
  Database errors are logged with a fixed message rather than raw driver details.
- [API registration/self-ping](../server/src/index.ts) share the canonical health
  path; [render.yaml](../render.yaml) now sets healthCheckPath to /api/v1/health.
  Detailed deployment and integration checks remain behind the existing Admin
  authentication/resource/role guards.
- Validation: server suite **476 passed, 0 failed, 5 optional PostgreSQL checks
  skipped** (481 total); the nine new health cases are included. Client
  availability/recovery checks **4 passed**. Both workspace TypeScript checks
  passed. The first sandboxed server run hit loopback EACCES restrictions; the
  unrestricted rerun above supplied the usable result.
- In-app browser: the local public endpoint displayed only `{"ok":true}`;
  the signed-in Admin Integrations panel still loaded its diagnostic sections.
  Anonymous HTTP probes on ports 4000 and 3000 both returned that exact body,
  status 200 and no-store; both Admin diagnostic endpoints returned 401 without
  a session.
  No provider send, business-data write or real database outage was performed.
  Failure/configuration/recovery regressions use injected database doubles.
- Repository configuration is not deployed configuration. Confirm the effective
  Render HTTP health path after the approved deployment/Blueprint sync. Durable
  scheduling remains separate AUD-011 work; password and sampler decisions remain
  as recorded above.

### Recent fixes already implemented

| Finding | Current disposition and evidence | Remaining boundary |
| --- | --- | --- |
| LEGACY record-notification visibility | PR #293 is in this baseline. [notificationVisibility](../server/src/services/notificationVisibility.ts) applies category, deletion and linked Driver scope; [permissionVisibility tests](../server/tests/permissionVisibility.test.ts) inspect those predicates. | SQL predicate tests are not live PostgreSQL notification UAT. |
| Data Sampler submission validation | PR #294 is in this baseline. [Server generation](../server/src/routes/data-sampler.ts) reuses final submission validation; [manual UI](../client/src/features/admin/DataSamplerView.tsx) validates required fields. Existing [server](../server/tests/podRequirements.test.ts) and [client](../client/tests/rmaAutofill.test.ts) regressions cover the repair. | Subsequent user decision: no additional sampler fixes; module retirement is planned after development. |
| Supplier creation and central audit | PR #295 is in this baseline. [suppliers route](../server/src/routes/suppliers.ts) creates the supplier and its audit entry in one transaction; [supplier route tests](../server/tests/suppliers.test.ts) cover success and audit failure with doubles. | Recorded browser happy-path evidence is below; real PostgreSQL rollback on audit failure remains pending. Supplier category validation is separate. |
| Role findings F1–F8 and WF-01–WF-07 | Implementation reports describe [F1–F8](ROLE_AUDIT_FIXES_2026-10-30.md) and [WF-01–WF-07](ROLE_WORKFLOW_FIXES_2026-10-31.md), with current source/test entry points. | Their recorded skips and browser/database/provider limits remain; they are not new execution results. |

### Findings and next scope

These are current scope dispositions, including dated local implementations and deferred work. Preserve current middleware, role ceilings and audit rules when changing them.

| Reference | Current evidence | Expected outcome / next scope |
| --- | --- | --- |
| DEF-001 / SEC-09 — password management | [User creation](../server/src/routes/users.ts) now validates email, but passwords need only be non-empty. The [auth API](../server/src/routes/auth.ts) has no password change/reset workflow. | Deferred during development by the user; revisit at development completion. Email validation is implemented, while password-policy/change/reset work remains unresolved. |
| DEF-009 / AUD-010 — Transaction Center semantics | [Transactions](../server/src/routes/transactions.ts) filter stored status directly, unlike the shared effective Draft/In Transit state. Inventory date filtering uses the server-local end-of-day setter. | Align delivery filters/display with canonical lifecycle state and define Manila inventory timestamp boundaries while preserving supported caller contracts. |
| DEF-012 — audit action filter | [Admin audit](../server/src/routes/admin.ts) accepts only CREATE, UPDATE and DELETE and silently ignores other action values. | Support actual emitted login-link actions and define validation of unknown filters; UI/API must agree. |
| DEF-016 — temporary access request | [AccessRequestModal](../client/src/components/AccessRequestModal.tsx) sets local sent state and claims Admin notification without an API call or saved request. | Choose a real request/notification workflow or honest contact-admin instructions; confirm only an actual outcome. |
| DEF-018 — business references in record links | [Calendar](../client/src/features/deliveries/DeliveryCalendar.tsx) and [AM Directory](../client/src/features/admin/AccountManagerDirectory.tsx) still display record ID as their record label. | Show the appropriate business reference with an ID fallback, preserving stable IDs for navigation and reference-less records. |
| DEF-022 — supplier category contract | [Supplier creation](../server/src/routes/suppliers.ts) and [schema](../server/prisma/schema.prisma) still use a single category string. | User-approved replacement: Admin-managed categories with multiple categories per supplier. Implement catalog/relations, selection, validation, filters and audit consistently, with a reviewed legacy-data mapping. The old fixed-five-only rejection expectation is superseded. |
| DEF-028 — View Full Log destination | [AdminDashboard](../client/src/features/dashboard/AdminDashboard.tsx) navigates to Admin without an audit target; [AdminPanel](../client/src/features/admin/AdminPanel.tsx) starts on Users. The separate audit-today card already has a filter target. | Add/use an explicit all-audit destination; retain the audit-today preset's separate meaning. |
| DEF-030 — Global Search Enter | [GlobalSearch](../client/src/components/GlobalSearch.tsx) starts the cursor at -1 and opens on Enter only with a selected index. | Agree that direct Enter opens the first available result, while an explicit keyboard selection wins. Test empty, changing and denied results. |
| SEC-10 — public readiness details | Implemented locally: [health](../server/src/routes/health.ts) returns only availability, with no-store caching; authenticated Admin diagnostics retain details. | Awaiting PR/merge/deployment; verify effective hosted response. See the health/readiness follow-up above. |
| AUD-008 — residual full-set transaction reads | [Transaction Center](../server/src/routes/transactions.ts) loads matching delivery/inventory sets before merging, sorting and slicing. Bounded record endpoints and ordinary views already exist. | Review bounded cross-source querying and complete counts/exports; validate representative-volume behavior. Do not rebuild ordinary record pagination. |
| AUD-011 — jobs and deployment health | Health configuration is implemented locally in [render.yaml](../render.yaml); [API jobs](../server/src/index.ts) still use process timers. | Verify effective hosted health settings after deployment. Scheduler, schedule-window identity, retries and missed-run behavior still need agreement. |

### Decisions and approved capability scope

| Reference / capability | Existing behavior | Decision and approved scope needed |
| --- | --- | --- |
| AUD-004 — Company management | SC/Admin [create API](../server/src/routes/companies.ts) exists; no Company creation/edit client workflow was found. Customer is a separate entity. | Company/SAP duplicate rules, edit authority and the portal workflow. |
| AUD-005 — Account Manager identity | [Choices](../client/src/data.ts) and record names remain strings. [Mail lookup](../server/src/services/mailPermissions.ts) now requires an exact unique active authorized account. | User relation, separate master entity or both; rename/inactive/backfill rules. |
| AUD-006 — fleet and conflicts | Vehicles are static [choices](../client/src/data.ts), not a managed Vehicle relation. Driver profile ownership checks already exist. | Scheduling windows, warn/block, overrides, assistants and capacity. |
| AUD-007 — supplier/product traceability | [Schema](../server/prisma/schema.prisma) has no DeliveryRecord Supplier foreign key or LineItem Product relation. Operational stock is manual. | Stable links/backfill and any explicitly accepted stock lifecycle rules; automatic financial/stock posting is not implicit scope. |
| Data Sampler retirement | Admin plus Data Sampler authority and final field validation exist. The historical [Admin audit](ROLE_ADMIN_AUDIT_2026-11-02.md) questioned category Create denials. | User excluded further sampler fixes and chose removal after development. Keep this out of active implementation; follow the retirement task above when development is declared complete. |
| SKU secondary tabs / Warehouse | Eight [SKU tabs](../client/src/features/inventory/SkuWorkspace.tsx) are scaffolds; Warehouse components exist but [routing](../client/src/routes/AppRouter.tsx) does not expose a separate Warehouse screen. | Accept, defer or remove unavailable UI; agree data/workflow requirements before implementation. |
| Existing-account Microsoft identity UI | The [identity API](../server/src/routes/users.ts) exists; the [Admin UI](../client/src/features/admin/AdminPanel.tsx) exposes provisioning during creation only. | Decide whether existing-account linking/unlinking belongs in the Admin UI, with the existing reviewed authority/audit contract. |

### Verification queue

| Check | Existing evidence | Acceptance still needed |
| --- | --- | --- |
| Supplier audit failure | Transactional route and route doubles; earlier browser success recorded below. | Fixture-specific audit-write failure on designated disposable PostgreSQL; assert neither supplier nor audit row survives. |
| Assignment/completion failure recovery | [Record routes](../server/src/routes/records.ts) perform assignment alerts and completion notification work after the business transaction. [Completion mail](../server/src/services/notify.ts) distinguishes outcomes; provider errors alone are not proof every later database/log failure is handled. | Inject relevant failures; inspect committed state, HTTP result and retries. Agree in-app transaction boundaries and external-email retry/duplicate semantics before adding an outbox. |
| V1 dashboard authority | [Six accepted cases](../quality-assurance/06-reports/2026-11-04-v1-dashboard-access-acceptance.md) remain Not Run. | Execute screen/resource/category denials and session-refresh restoration on controlled accounts, restoring exact overrides afterward. |
| Attachment deletion cleanup | [Outbox](../server/src/services/podDeletionCleanup.ts), [migration](../server/prisma/migrations/20261103010000_pod_storage_deletion_outbox/migration.sql), route doubles and an [opt-in PostgreSQL test](../server/tests/podDeletion.postgres.test.ts) already exist. | Read migration status on the intended target; verify database rollback and real storage retry. Code presence does not prove active migration/provider behavior. |
| Remaining role journeys and concurrency | [November 4 QA](../quality-assurance/06-reports/UAT-summary-RUN-20261104-REMAIN.md) and role-fix reports have scoped evidence. | Logistics RMA transport, supplier-collection movement, Procurement completion, stale/concurrent saves and duplicate collection API verification on a disposable target. |
| Deployment, provider, device and scale | Diagnostics, supporting APIs and tests exist. | Actual SSO/email/private-storage outcomes, exports/downloads, large-list Admin scrolling, mobile layout and agreed representative-volume latency/memory. No current dependency advisory count was obtained. |
| Older qualifications | The [workflow audit](ROLE_WORKFLOW_IMPLEMENTATION_AUDIT_2026-10-30.md) reported inactive-roster LEGACY/V1 differences and SSO diagnostics readiness inconsistency. | Reproduce on current source/configuration before changing behavior; clarify roster inactivity separately from account deactivation. |

### Disposition of the 32 historical QA defect records

The [original DEF files](../quality-assurance/05-defects/) and execution results are historical evidence. This table is a source reconciliation, not a fresh UAT run or owner sign-off. Their original Open labels are preserved; use the classification here to select a current fix or retest.

| ID | Current classification | Evidence / next check |
| --- | --- | --- |
| DEF-001 | Partially implemented; deferred during development | Email validation exists; the user deferred password-policy work as recorded above. |
| DEF-002 | Implemented; verification pending | [AdminPanel](../client/src/features/admin/AdminPanel.tsx) now has the expected required-field text; verify actual form behavior and role-validation response. |
| DEF-003 | Closed by requirement | The [defect's acceptance note](../quality-assurance/05-defects/DEF-003-sales-coordinator-is-denied-approved-calendar-and-reports-access.md) accepts per-account Calendar/Reports grants rather than mandatory role defaults. |
| DEF-004 | Verification pending | Historical RMA denial-text discrepancy; compare with current dedicated RMA contracts and role denials, not the older blanket workflow. |
| DEF-005 | Implemented; verification pending | [Create form](../client/src/features/deliveries/RecordCreateForm.tsx) marks date required for submitted non-RMA/transport cases and optional for permitted drafts/movements. |
| DEF-006 | Implemented; verification pending | Current record date validation; [majorDefects](../server/tests/majorDefects.test.ts) includes malformed/impossible dates. |
| DEF-007 | Implemented; verification pending | Current priority validation and [majorDefects](../server/tests/majorDefects.test.ts) cases. |
| DEF-008 | Implemented; verification pending | Current Company lookup/P2003 mapping; [majorDefects](../server/tests/majorDefects.test.ts) covers missing/disappearing Company. |
| DEF-009 | Source-confirmed open | Raw transaction status filtering; see current scope above. |
| DEF-010 | Implemented; verification pending | Shared [lifecycle](../server/src/services/deliveryLifecycle.ts) reserves ordinary draft submission; existing [majorDefects](../server/tests/majorDefects.test.ts) coverage. |
| DEF-011 | Implemented; verification pending | Record DELETE refuses every role; [majorDefects](../server/tests/majorDefects.test.ts) asserts no writes. |
| DEF-012 | Source-confirmed open | Audit action allowlist; see above. |
| DEF-013 | Implemented; verification pending | Safe account metadata audit in [permissionManagement](../server/src/services/permissionManagement.ts); [WF-02 remediation](ROLE_WORKFLOW_FIXES_2026-10-31.md). Verify visible historical changes on controlled accounts. |
| DEF-014 | Verification pending | Admin refreshes its local profile list after creation; Driver Manager uses a separate [query](../client/src/api/queries/useDriversQuery.ts). Retest cross-screen cache/count behavior before asserting closure. |
| DEF-015 | Implemented; verification pending | [Shared chart](../client/src/features/dashboard/DashboardStatusChart.tsx) maps ACCOMPLISHED to Delivered and renders count labels; verify real-browser geometry/counts. |
| DEF-016 | Source-confirmed open | Local-only access request confirmation; see above. |
| DEF-017 | Implemented for confirmed paths; verification pending | [majorDefects](../server/tests/majorDefects.test.ts), SKU conflict handling and current customer/user handlers cover the reported paths. This does not clear every async route in the repository. |
| DEF-018 | Source-confirmed open | Calendar/AM Directory record labels; see above. |
| DEF-019 | Closed by requirement | The [recorded product decision](../quality-assurance/05-defects/DEF-019-monthly-driver-report-export-omits-per-delivery-rows.md) accepts aggregate-only Monthly Driver CSV; do not add per-delivery rows to satisfy the old expectation. |
| DEF-020 | Implemented; verification pending | Customer POST uses [parseCustomerCreate](../server/src/services/customerValidation.ts) for email/phone/type checks. |
| DEF-021 | Implemented; owner acceptance pending | [Live follow-up](../quality-assurance/06-reports/2026-10-16-def021-customer-conflict.md) distinguishes the non-reproduced stale overwrite from repaired failed-reload draft loss; [client regression](../client/tests/customerEditConflict.test.ts) exists. |
| DEF-022 | Superseded expectation; approved implementation pending | Replace the fixed-five-only expectation with the user's Admin-managed, multiple-category requirement; see above. |
| DEF-023 | Implemented; scoped browser evidence | [Inventory clear](../client/src/features/inventory/InventoryView.tsx) resets both search states and filters; [November 4 QA](../quality-assurance/06-reports/UAT-summary-RUN-20261104-REMAIN.md) observed recovery. |
| DEF-024 | Implemented; scoped browser evidence | Admin SKU form and [creation tests](../client/tests/skuCreation.test.ts); November 4 QA created a SKU. |
| DEF-025 | Implemented; verification pending | Shared [SKU validation](../server/src/services/skuValidation.ts), [creation](../server/tests/skuCreation.test.ts) and [major-defect regressions](../server/tests/majorDefects.test.ts); creation and edit acceptance remain distinct. |
| DEF-026 | Implemented; verification pending | Stock type/quantity validation and transactional stock/ledger/audit; [majorDefects](../server/tests/majorDefects.test.ts) covers refusals. Verify multi-process PostgreSQL behavior separately. |
| DEF-027 | Implemented; verification pending | [Dashboard API](../server/src/routes/dashboard.ts) counts active users; [AdminDashboard](../client/src/features/dashboard/AdminDashboard.tsx) reads the matching total_active_users field. Reconcile actual browser count with controlled accounts. |
| DEF-028 | Source-confirmed open | View Full Log target; see above. |
| DEF-029 | Implemented; recorded follow-up | The [defect follow-up](../quality-assurance/05-defects/DEF-029-logistics-statistical-reports-stays-loading-with-request-errors.md) records PR #184 and passing scoped checks; [reportsLifecycle](../server/tests/reportsLifecycle.test.ts) covers bounds and forwarded failures. |
| DEF-030 | Source-confirmed open | Enter selection behavior; see above. |
| DEF-031 | Expectation clarification needed | [NotificationBell](../client/src/components/NotificationBell.tsx) intentionally caps badges at 9+. The recorded 13-to-12 unread change remains 9+ under that contract; it does not prove a failed decrement. Agree exact-count versus capped display before requesting a fix. |
| DEF-032 | Verification pending | [Workspace](../client/src/features/deliveries/DeliveryRecordWorkspace.tsx) now offers a separate Documents Save Files action. Retest the reported Dispatch form sequence and the standalone upload; supporting PDFs still do not satisfy completion-photo requirements. |

### Reconciliation limits and maintenance

- This refresh covers the original AUD-001–AUD-011 mapping, the DEF-001–DEF-032 records, recent role audits, and the three merged fixes. It does not clear every untraced recommendation in older archived reports.
- The initial reconciliation at 6aad0f7 inspected source and existing evidence without executing tests. The dated health/readiness follow-up above records subsequent application tests and read-only browser checks. Neither step changed business records, permissions, migrations, deployments, tickets or sent provider messages.
- Each future fix should update this register and its affected ticket/contract docs in the same PR, with exact source revision, checks and remaining limits. Keep original execution counts and audit observations intact; add dated follow-up evidence.
- Work stages are sequencing guidance. Use one PR per independently reviewable change; a large stage may require several PRs.

---

## Historical browser/source review and merge evidence

The remainder preserves the earlier review and post-merge record. Its phrases about current source/browser observations refer to the revisions named there; use the reconciliation above for present work selection.

**Reviewed:** 2026-11-05  
**Source revision:** `e56a8da` on `dev`  
**Review type:** Read-only browser cross-check and current-source trace; not release sign-off

This document orients agents to what is implemented, unfinished, and still
needs verification. The source at `e56a8da` is the reviewed application state.
The browser observations apply to the app reached at `http://localhost:3000`.
The live data did not match the November 4 QA fixtures, so historical findings
remain evidence rather than fresh reproductions.

## Follow-up implementation status (2026-11-05)

The review below is a historical snapshot of source revision `e56a8da` and its
browser observations. The refreshed `dev` branch is now at `2c4211d`, with PRs
#293 (LEGACY notification visibility), #294 (Data Sampler validation), and #295
(atomic Supplier creation/audit) merged. All three findings are resolved in
current `dev`; merge status does not establish deployment status.

The Supplier fix passed three route tests; the server suite passed 467 tests
with 5 optional PostgreSQL tests skipped, and the strict server TypeScript check
passed. These route tests use database doubles; PostgreSQL rollback behavior on
audit-write failure has not been verified. An in-app browser check against the
configured `mg_portal_sandbox` successfully created a temporary supplier; the
System Audit Log showed its `Supplier CREATE` event, actor, and seven initial
values. The temporary supplier and matching audit event were removed afterward,
and the UI counts returned to 5 suppliers and 54 audit entries. No
operational/shared database was used.

## Remaining next steps after PR #295

1. Verify supplier creation rollback on audit-write failure against a designated
   disposable `_sandbox` or `_test` database.
2. Decide retry and idempotency requirements for Logistics assignment
   notifications and completion email before adding an outbox.
3. Decide whether the unfinished SKU tabs and a separate Warehouse screen are
   accepted product scope.

## Open implementation findings in reviewed source revision `e56a8da`

| Priority | Status in reviewed source | Evidence | Proposed next action |
| --- | --- | --- | --- |
| P0 — access control | LEGACY notification filtering has a source-confirmed gap. | The LEGACY branch specially checks DeliveryRecord notifications only for RMA. It does not filter other categories by current readable category, exclude soft-deleted non-RMA records, or enforce Driver ownership for non-RMA records. The API returns each notification's title, message, and record ID. See [`notificationVisibility.ts`](../server/src/services/notificationVisibility.ts) and [`notifications.ts`](../server/src/routes/notifications.ts). | Apply current category, deletion, and linked Driver scope to every DeliveryRecord notification. Add LEGACY regression coverage. Confirm runtime mode before claiming deployed impact. |
| P1 — data integrity | Data Sampler can still create a non-RMA record with a blank reference. | The November 4 UAT report recorded a saved Sales Order with an empty reference. The current form has no required marker, and the route preserves an empty override without applying [`recordSubmissionError`](../server/src/services/recordSubmission.ts). The normal record submission paths use that validator. See [`DataSamplerView.tsx`](../client/src/features/admin/DataSamplerView.tsx) and [`data-sampler.ts`](../server/src/routes/data-sampler.ts). | Validate final non-RMA reference/date values on the server and mark required values in the manual UI. Preserve RMA-specific rules. |
| P1 — audit integrity | Supplier creation still lacks a central audit entry. | The November 4 UAT run created a supplier but found no central audit event. The current POST route still calls `prisma.supplier.create` directly without an audit write or transaction. Current database data did not include the old synthetic supplier. See [`suppliers.ts`](../server/src/routes/suppliers.ts) and the transaction/audit pattern in [`customers.ts`](../server/src/routes/customers.ts). | Save supplier creation and a `Supplier` CREATE audit entry in one transaction with actor and stable supplier details. |

The Data Sampler route already requires Admin plus Data Sampler write access.
Whether it must additionally enforce each generated category's normal write
policy is not settled by the current acceptance evidence. Do not label that a
defect without a policy decision. Sampler records must remain Scheduled and
retain their audit entry.

## Reliability concerns requiring verification

Ordinary record submission notifications are written inside the record
transaction. Logistics assignment notifications and completion
notification/email handling happen after the business transaction commits in
[`records.ts`](../server/src/routes/records.ts). A notification failure may
leave committed work while the request reports failure; failure behavior has
not been injected or verified. Decide whether assignment notification writes
should share the transaction, and define durable retry/idempotency semantics for
completion email before designing an outbox. Do not treat configured, mocked,
skipped, failed, or sent email as equivalent outcomes.

## Current browser observations

- All five roles could access the app. The Sales Coordinator's New Delivery
  form was enabled in this review, contrary to the November 4 report's disabled
  observation. Do not carry that old observation as a current defect.
- Sales list pagination changed rows across pages and disabled Next on the last
  page for 63 current results. This was a basic UI check, not a scale or
  performance test.
- TASS RMA details showed transport, physical receipt, and final completion as
  distinct stages. The collection detail exposed its verification action.
  Neither action was submitted during the read-only review.
- Driver views showed scheduled work and the Time In, recipient, photo, and
  remarks prerequisites. No operational workflow was advanced.
- Admin diagnostics and export controls were visible. No email, SSO provider,
  export file, or route-slip output was sent or downloaded for validation.
- The Admin user list displayed five current accounts without a scrolling
  issue. Large lists and mobile layout were not checked.

## Capability decisions

- The SKU detail has eight unfinished tabs: Transactions, Purchase History,
  Sales History, Delivery History, RMA History, Accounting History, Documents &
  Attachments, and Analytics & Forecasting. They are visible scaffolds in
  [`SkuWorkspace.tsx`](../client/src/features/inventory/SkuWorkspace.tsx).
  Complete them only if they are accepted product scope; otherwise hide or mark
  them unavailable.
- Warehouse components exist, but a separate Warehouse screen is not routed.
  Inventory groups and filters SKUs by their location field. See
  [`AppRouter.tsx`](../client/src/routes/AppRouter.tsx) and
  [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md). Agree on the workflow
  before implementing a separate screen.
- Operational stock movement remains manual. Do not add automatic stock
  posting, reservations, or financial reconciliation without an agreed rule.

## Work sequence recommended by the original review

1. Fix and regression-test LEGACY notification category, deletion, and Driver
   ownership filtering.
2. Apply the canonical submission validator to Data Sampler's final non-RMA
   fields and improve its required-field UI.
3. Make supplier creation and its central audit event atomic.
4. Verify those fixes against a designated disposable `_sandbox` or `_test`
   database. Do not use current operational data for mutating checks.
5. Decide notification delivery retry/idempotency requirements; add a durable
   outbox only if those requirements call for it.
6. Decide whether the unfinished SKU tabs and separate Warehouse screen are
   accepted capabilities before implementation.

## Remaining verification

- The six accepted V1 dashboard cases remain Not Run in the
  [V1 access acceptance](../quality-assurance/06-reports/2026-11-04-v1-dashboard-access-acceptance.md).
  The browser's role-policy editor was read-only candidate mode; no permission
  or rollout settings were changed. The accepted model separates screen,
  resource, and record-category Read authority.
- Live Logistics RMA transport, supplier-collection movement, Procurement
  transport completion, concurrent/stale edits, duplicate collection API
  verification, notification failure/retry, and completion email/provider
  outcomes still need controlled verification. Current data lacked an
  in-transit Logistics RMA. These checks may create records, audit events, or
  provider calls and belong on a designated disposable target.
- Supplier creation plus audit failure is covered with route test doubles;
  verify PostgreSQL rollback on a designated disposable `_sandbox` or `_test`
  database before claiming live-database transaction behavior.
- The latest automated run report found here,
  [`RUN-20261020-05`](../quality-assurance/06-reports/automated-RUN-20261020-05.md),
  passed 48 unit checks; API and browser suites were blocked by the local
  database-name guard requiring `_sandbox` or `_test`. Passing unit tests are
  not full UAT sign-off.
- The attachment deletion outbox and migration already exist in
  [`podDeletionCleanup.ts`](../server/src/services/podDeletionCleanup.ts) and
  [`migration.sql`](../server/prisma/migrations/20261103010000_pod_storage_deletion_outbox/migration.sql).
  Application of the migration to the active database and real storage-provider
  retry behavior were not verified.

## Evidence limits

The November 4 remaining-modules report used source baseline `9a6fe2a`; this
review used `e56a8da`. The current database lacked the named synthetic fixtures
recorded in that report. No screenshots or credentials were retained. This
documentation update changed no application source, tests, business records, or
permissions; it sent no external messages and downloaded no exports. No test
results are claimed for the reviewed source state.
