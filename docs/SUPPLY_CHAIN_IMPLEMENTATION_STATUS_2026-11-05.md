# Supply Chain implementation status

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
