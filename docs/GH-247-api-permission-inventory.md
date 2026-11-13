# GH-247 API Permission Inventory

This inventory maps the protected API surface to the V1 permission checks added
for GH-247. It is a review aid; endpoint middleware and service checks remain
the enforcement source of truth. Keep this file current when adding a route.

## Enforcement layers

- `requireAuth` validates the signed cookie and, in V1, reloads the active
  account, role policy, overrides, conversion state, and Driver profile from a
  coherent database snapshot on every request. The JWT role is not authority.
- Existing `requireRole` checks remain in place. V1 permissions do not widen
  their role restrictions, ownership rules, field restrictions, or lifecycle
  validation.
- `requireResource` checks the requested resource action in V1. Record routes
  additionally use the fixed server-side category/action mapping in
  `server/src/services/recordOperations.ts`; clients cannot choose a screen or
  permission action to authorize a request.
- V1 policy endpoints validate complete replacement payloads and expected
  revisions. Record and directory writes retain their transactional validation
  and audit behavior.
- `PERMISSION_MODE` defaults to `LEGACY`; this change adds V1 enforcement but
  does not activate the coordinated rollout.

## API route inventory

| Route group and operations | V1 authorization mapping | Additional boundary |
| --- | --- | --- |
| `POST /api/auth/login`, `POST /api/auth/microsoft`, `GET /api/auth/microsoft/callback`, `GET /api/auth/microsoft/status`, `POST /api/auth/logout` | Authentication/session flows; no module grant is used to establish identity. | Microsoft callback state and existing tenant/account rules remain authoritative. |
| `GET /api/auth/me` | `requireAuth`; returns the current server-computed permission snapshot. | `Cache-Control: no-store`; inactive or unconverted V1 sessions fail closed. |
| `GET /api/records`, `/active-counts`, `/am-summary`, `/calendar-summary`, `/status-history-counts`, `/:id`, `/:id/audit`, `/:id/remarks`, `/:id/comments`, `/:id/attachments`, attachment download and preview | `RESOURCE:records:READ`, category `READ`, and the requested record screen `READ` where applicable. | Every list/detail path intersects the current record scope: category denials, deletion, Driver profile ownership, draft status, and eligible RMA movement. Linked collection data is separately redacted. |
| `POST /api/records` | Category `CREATE` plus a server-selected writable record screen and `RESOURCE:records:READ`. Optional attached documents require `POD`; optional vehicle assignment requires `ASSIGN`. | Existing role rules and strict V1 body validation remain. Creating a record does not permit assigning a Driver; assignment remains a separate operation. |
| `PUT /api/records/:id` | Category `UPDATE`; fields map independently to `ASSIGN`, `TIME_IN`, `COMPLETE`, `SUBMIT`, or `POD` as applicable. | Source record must be readable and writable. A category move checks the destination but returns 400 because relocation is not supported. Existing role, field, state, and concurrency rules still apply. |
| `PATCH /api/records/:id/status` | `STATUS` for a transition, `COMPLETE` for Delivered/recipient changes, `SUBMIT` for draft submission, and `UPDATE` for priority/date fields. | The saved record is rechecked inside the existing transaction; role, proof, clock, recipient, and lifecycle checks remain. |
| `POST /api/records/:id/time-in` | Category `TIME_IN`. | Role, assignment, date, state, and required remarks are validated before the update. |
| `POST /api/records/:id/comments` | Category `COMMENT`. | Record scope and strict body validation apply before writing. |
| `POST` or `DELETE /api/records/:id/attachments...` | Category `POD`; upload authorization runs before the multipart parser or file effects. | Existing role, ownership, evidence, quota, storage cleanup, audit, and record-lock checks remain. Read/download/preview routes require record visibility. |
| `PATCH /api/records/:id/verify-collection` | Category `VERIFY_COLLECTION`. | `requireRole('TASS')`; record must be an accomplished, unverified Accounting Collection. |
| `DELETE /api/records/:id` | Denied; the existing delete operation remains disabled. | No role receives a V1 delete bypass. |
| `GET /api/records/:id/rma-capabilities` | `RESOURCE:records:READ` plus current record scope. | Capabilities are derived from the server's RMA policy and movement state. |
| `PATCH /api/records/:id/rma-assignment` | Category `ASSIGN`. | Logistics/Admin role guard and dedicated RMA assignment/state checks remain. |
| `PATCH /api/records/:id/rma-transport` | Category `STATUS`. | Driver role, linked profile ownership, eligible Logistics transport, proof, and transport-state checks remain. |
| `POST /api/records/:id/rma-receipt` | Category `RECEIVE`. | TASS role and separate physical receipt confirmation checks remain. Final RMA completion remains a separate TASS `COMPLETE` action through the status route. |
| `GET /api/transactions` and `GET /api/transactions/:source/:id` | `RESOURCE:transactions:READ`, `RESOURCE:records:READ`, category `READ`; inventory rows additionally require SKU read. | The transaction category ceiling and current Driver ownership scope apply to list and direct detail reads. Transactions are read-only. |
| `GET /api/dashboard/stats`, `GET /api/reports/summary` | Dashboard resource `READ`; reports require records resource `READ` and `SCREEN:statistical_reports:READ`. | Aggregates and report queries use category/Driver scopes; hidden records do not contribute to counts or results. |
| `GET /api/notifications`, `GET /api/notifications/unread-count` | Authenticated user's own notifications, filtered by current record/resource visibility. | Both V1 and LEGACY hide stale `ScopedSummary` notifications via `scopedSummaryVersion` (which includes `rolePolicyRevision` alongside `permissionVersion` in LEGACY mode); V1 also hides unscoped historical alerts without resource access, and record-linked messages are rechecked against current category and Driver scope. |
| `PATCH /api/notifications/read-all`, `PATCH /api/notifications/:id/read` | Self-scoped personal read-state update. | Existing explicit role allow-list remains; updates always constrain `userId` to the authenticated account. |
| `POST /api/notifications/send-email` | Records resource `READ`, category `WRITE`, and the trigger's specific action (`CREATE`, `STATUS`, `COMPLETE`, or `VERIFY_COLLECTION`). | Existing role allow-list; strict trigger/recipient allow-list and record-state checks run before recipient lookup or send. Account Manager matching must be exact and unambiguous; recipients must also be able to read the record. |
| `GET /api/companies`; `POST /api/companies` | Companies `READ` / `CREATE`. | Existing Sales Coordinator/Admin role guard remains. |
| `GET /api/customers`; `POST /api/customers`; `PUT /api/customers/:id`; `GET /api/customers/:id/audit` | Customers `READ`, `CREATE`, or `UPDATE` as appropriate. | Existing role guards, customer audit reason, field validation, and stale-edit conflict handling remain. |
| `GET /api/suppliers`; `POST /api/suppliers` | Suppliers `READ` / `CREATE`, with supplier screen access for creation. | Existing role allow-list remains. |
| `GET /api/drivers`; `POST /api/drivers`; `PUT /api/drivers/:id`; `DELETE /api/drivers/:id` | Drivers `READ`, `CREATE`, `UPDATE`, or `DELETE`; write routes also require Driver Manager screen access. | Existing Logistics/Admin role, stable linked Driver identity, active-assignment, and audit rules remain. |
| `GET /api/skus`, `GET /api/skus/:id`, `GET /api/skus/:id/audit`; `POST /api/skus`; `PUT /api/skus/:id`; `POST /api/skus/:id/adjust` | SKU `READ`, `CREATE`, `UPDATE`, or `ADJUST`; adjustment also requires inventory screen access. | Existing Admin/Logistics role restrictions and atomic stock/audit transaction checks remain. Transaction Center lookup is read-only and never grants adjustment. |
| `GET /api/admin/roles/:role/permissions`, `PUT /api/admin/roles/:role/permissions`, `GET /api/admin/audit-log`, integration/deployment status, `POST /api/admin/test-email` | Admin resource `READ` or `WRITE` according to operation. | Admin role and protected management capabilities remain. Audit results are filtered by current V1 business-record visibility. |
| `GET /api/users`, `GET /api/users/:id/permissions`, `POST /api/users`, `PUT /api/users/:id/driver-profile`, `PUT /api/users/:id/microsoft-identity`, `PATCH /api/users/:id`, `PATCH /api/users/:id/deactivate`, `PATCH /api/users/:id/activate`, `DELETE /api/users/:id`, `PUT /api/users/:id/permissions`, `POST /api/users/:id/permissions/reset` | Users resource `READ`, `CREATE`, `UPDATE`, or `DELETE`; permission replacements/resets use versioned V1 management services. | Every route retains the Admin role check. Admin self-lockout/demotion, protected roles, revision conflicts, driver-link identity, and transactional audit protections remain enforced. |
| `GET /api/data-sampler/counts`, `POST /api/data-sampler/generate`, `POST /api/data-sampler/reset`; `GET /api/dev/reset-capability`, `POST /api/dev/reset-seed` | Data Sampler or Admin resource `READ`/`WRITE` according to operation. | Admin role and the existing local-demo/deployment target guards remain. |
| `GET /api/health` | Public health check. | Returns service health only; it does not expose authorization or business records. |

## Verification coverage

- `server/tests/permissionEnforcement.test.ts` exercises direct HTTP access with
  a signed cookie, including stale JWT claims, read-only mutation/upload denial,
  role-default and override revocation, category scoping, Driver ownership,
  mail validation, and protected operations.
- `server/tests/permissionVisibility.test.ts` checks audit/notification query
  predicates, stale summary suppression, strict email inputs, and mutation
  payload validation.
- `server/tests/permissionEvaluator.test.ts` and
  `server/tests/permissionFoundation.test.ts` cover inheritance, Allow/Deny,
  complete-state validation, role ceilings, and legacy conversion behavior.
- `server/tests/permissionManagement.postgres.test.ts` and the PostgreSQL case
  in `permissionFoundation.test.ts` cover atomic saves, concurrent conflicts,
  revisions, conversion compatibility, and rollback on the disposable database.
