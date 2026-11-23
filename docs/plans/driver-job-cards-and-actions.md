# Plan: Unified driver job cards, driver action limits, module access matrix

Status: all questions answered, waiting for Dylan's approval (stage 1, no code changes yet)
Date: 2026-11-11
Base branch: `dev` at `52e001d` (PR #308 dashboard redesign + driver mobile fixes is merged)
Feature branch for stage 2: `feature/driver-job-cards` off `dev`
Screens: Driver dashboard (`client/src/features/dashboard/DriverDashboard.tsx`), Deliveries, RMA, Procurement Pick-up, Sales Orders

## 1. Summary

Three changes:

1. **Module access matrix.** Make the server enforce who can open, create, assign and edit records in
   Deliveries, RMA, Procurement Pick-up and Sales Orders, exactly as Dylan described. Most of it already
   holds. The gaps are: Admin can still write everywhere, Logistics can still create Procurement Pick-up
   and Sales Orders, and TASS still gets the Procurement Pick-up screen by default.
2. **One driver job card.** Every record assigned to a driver uses the same card. The only visible
   difference is the type label: "Delivery", "RMA", "Procurement Pickup", "Sales Order". Today RMA uses a
   different panel (`RmaWorkflowPanel`) with a remarks box and a single "Start transport" button, while the
   other types use the Delivery card (see screenshot).
3. **Drivers can only Start Transport and Complete Delivery.** No Pending, no Reschedule, for any type.
   Enforced on the server, not just hidden in the UI. Completing still requires a saved POD that follows
   the existing upload rules.

One small additive database migration is needed (a nullable column for the RMA "Received by" name, see 5). No data is written or backfilled.

## 2. Current state (verified in code on `dev`)

### 2.1 Module access today

Sources: `server/src/services/permissions.ts` (`ROLE_DEFAULTS`, `editableScreens`),
`server/src/services/recordAccess.ts` (`readableCategories`, `canWriteCategory`, `canCreateCategory`),
`server/src/services/permissionCatalog.ts` (V1 role ceilings and defaults), `server/src/routes/records.ts`,
`server/src/routes/rmaDispatch.ts`.

| Module | Rule Dylan wants | Today | Gap |
| :--- | :--- | :--- | :--- |
| Deliveries | SC + Logistics only | SC, Logistics, Admin have the screen. TASS does not. | None |
| Deliveries | SC creates | `canCreateCategory` blocks Logistics for DELIVERY | None |
| Deliveries | Logistics assigns drivers | Logistics and Admin can assign | Admin can assign |
| RMA | TASS + Logistics only | TASS, Logistics, Admin. SC is blocked from RMA in every path | None |
| RMA | TASS creates | Logistics cannot create or edit RMA | None |
| RMA | Logistics assigns drivers | `PATCH /records/:id/rma-assignment` allows LOGISTICS and ADMIN | Admin can assign |
| RMA | Internal movement needs no driver | `rma_movement` is `LOGISTICS_TRANSPORT`, `SUPPLIER_COLLECTION` or `INTERNAL_NO_DRIVER`. Only `LOGISTICS_TRANSPORT` can be assigned or shown to drivers | None (also covers supplier collection) |
| Procurement Pick-up | SC + Logistics only | SC, Logistics, Admin, **and TASS** have the screen by default. TASS sees no records (`readableCategories` filters them) but the menu item shows | TASS screen |
| Procurement Pick-up | SC creates | SC **and Logistics** can create | Logistics create |
| Sales Orders | SC + Logistics only | SC, Logistics, Admin | None |
| Sales Orders | SC creates | SC **and Logistics** can create | Logistics create |
| All four | Admin read-only | Admin can create, edit, submit drafts, assign, record Time In, change status, complete, upload/delete attachments, correct timestamps | Admin writes |

Both permission modes exist in code: `PERMISSION_MODE=LEGACY` (default) and `V1` (role policies stored in
`RolePolicy` / `RolePermission`). The plan covers both so behaviour does not depend on which mode staging
runs.

### 2.2 Driver actions today

| Type | Start | Complete | Other driver actions |
| :--- | :--- | :--- | :--- |
| Delivery, Procurement Pick-up, Sales Order (and Accounting Collection) | `POST /records/:id/time-in` (sets `IN_TRANSIT`, remarks required) | `PATCH /records/:id/status` to `Delivered`. Requires Time In, Received By and a saved, verified JPG/PNG POD | **Pending and Rescheduled** buttons on the card. The server also accepts **On-Hold** from a driver because `RUN_TRANSITIONS` allows it and nothing checks the role |
| RMA (Logistics transport only) | `PATCH /records/:id/rma-transport` with `IN_TRANSIT` | Same endpoint with `COMPLETED`. Requires a saved JPG/PNG POD. TASS later confirms physical receipt and completes the RMA | In V1 mode a driver can also call `PATCH /status` with Pending, On-Hold or Rescheduled on an RMA (`canPerformPolicyRecordAction` only blocks `Delivered` for drivers). Legacy mode blocks it |

POD rules (`server/src/services/attachmentRules.ts`, `podPhotos.ts`, `client/src/components/PodUploader.tsx`):
10 MB per file, JPG/PNG/PDF/DOCX/XLSX only, at most 10 files and 50 MB per record, and at least one saved
JPG or PNG photo (documents alone do not count). Content is checked on the server, not just the extension.
Staging stores files in the `pod-staging` bucket. None of this changes.

### 2.3 Driver card today

`DriverDashboardContent` renders an `<article>` per active record. For RMA it embeds
`RmaWorkflowPanel` (a back-office panel with "Transport actions", an always-visible Remarks textarea and
a grey "Start transport" button). For every other type it renders the Delivery layout: Start transport,
"Transport started" banner, POD uploader, Received by, then Accomplish / Pending / Reschedule. Badge text
comes from `categoryLabelFor` ("RMA transport", "Delivery", otherwise the raw category such as
"Procurement Pick-up").

## 3. Scope

### In scope

- S1. Server-enforced module access matrix (section 4.1) in both permission modes.
- S2. A rule on the server that a driver can only start or complete an assigned run (section 4.2).
- S3. A single `DriverJobCard` component used for every type on the driver dashboard (section 4.3).
- S4. Client UI follows the matrix: Admin sees these four modules as view-only; Logistics no longer sees
  "New" on Procurement Pick-up and Sales Orders; TASS no longer sees Procurement Pick-up.
- S5. Tests (unit, route, E2E) and `docs/MODULE_ACCESS.md` update.

### Out of scope

- Data backfills and edits to stored `RolePolicy` rows. (The only schema change is the one nullable column in section 5.)
- Changing the POD limits, storage buckets or the TASS receipt/completion steps for RMA.
- Changing the future-date rule (drivers cannot start a Delivery or RMA dated in the future). It stays as is.
- New driver features such as "Report a problem", maps or call buttons.
- Accounting Collection access rules (not part of Dylan's list), unless Q6 says otherwise.

## 4. Design

### 4.1 Module access matrix (target)

`R` = read, `C` = create, `E` = edit fields / submit drafts, `A` = assign driver, `S` = change status
(Pending, On-Hold, Reschedule, correct times), `-` = no access.

| Module | SC | Logistics | TASS | Admin | Driver |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Deliveries | R C E | R A S | - | R | assigned runs only: Start, Complete |
| RMA | - | R A, plus Start and Complete transport for the assigned driver after the Logistics transport switch (see logistics-rma-transport.md) | R C E S, receipt, final completion | R | assigned `LOGISTICS_TRANSPORT` runs only: Start, Complete transport |
| Procurement Pick-up | R C E | R A S | - | R | assigned runs only: Start, Complete |
| Sales Orders | R C E | R A S | - | R | assigned runs only: Start, Complete |

Notes:
- RMA with `INTERNAL_NO_DRIVER` (and `SUPPLIER_COLLECTION`) never gets a driver and never appears on a
  driver dashboard. This is already true and gets a regression test.
- "Edit" for Logistics keeps today's field-level limits (delivery date, priority, vehicle, assistants on
  their assigned records). Only creation is removed for Procurement Pick-up and Sales Orders.

Implementation:
- `recordAccess.ts`: add one helper, `isReadOnlyCategoryForRole(role, category)`, true for ADMIN on
  DELIVERY, RMA, PROCUREMENT_PICKUP, SALES_ORDERS. Call it from `canWriteCategory`, `canCreateCategory`
  and `canWritePolicyCategory` (V1) so every route that already uses them is covered.
- `canCreateCategory` / V1 `CREATE` ceiling: Logistics cannot create PROCUREMENT_PICKUP or SALES_ORDERS
  (same pattern as the existing DELIVERY rule).
- Routes that check role but not category write access get an explicit check: `POST /:id/time-in`,
  attachment upload and delete, timestamp corrections in `PUT /:id`, and `PATCH /:id/rma-assignment`
  (drop ADMIN from `requireRole`).
- `permissions.ts` and `permissionCatalog.ts`: remove `procurement_pickup` from TASS defaults and make it
  non-editable for TASS (same pattern as `rma` for SC), so an old per-account grant cannot bring it back.
- V1 stored `RolePermission` rows for ADMIN may still say ALLOW. The code guards above deny regardless
  (deny wins). Aligning the stored rows is optional follow-up work and would need a dry run and Dylan's
  go-ahead because it writes to a live database.
- Errors: 403 with a plain message, for example "Admin has view-only access to Sales Orders." and
  "Only Sales Coordinator can create Procurement Pick-up records."

### 4.2 Driver actions: Start Transport and Complete Delivery only

Server (source of truth):
- `deliveryLifecycle.ts`: add `driverActionError(record, target)` that, for role DRIVER, allows only
  target `Delivered` on `PATCH /status` and returns
  "Drivers can only start transport or complete a run. Ask Logistics to mark it Pending or Rescheduled."
- `PATCH /records/:id/status`: call it before any other transition logic. Drivers get 403 for Pending,
  On-Hold, Rescheduled, Scheduled and Draft, on every category including RMA, in both permission modes.
- `POST /records/:id/time-in` and `PATCH /records/:id/rma-transport` stay the "Start" paths; the
  `COMPLETED` value of `rma-transport` and `PATCH /status` to `Delivered` stay the "Complete" paths.
- Completion keeps every existing check: assigned driver, Time In / transport started, saved and verified
  JPG/PNG POD in the same transaction. Received By is now required for every type (D5):
  non-RMA keeps `received_by` on `PATCH /status`; RMA `rma-transport` with `COMPLETED` now requires a
  `received_by` string (trimmed, 1 to 120 characters) and stores it in the new `rmaTransportReceivedBy`
  column. 400 "Received By is required before completing this run." when missing.
- The RMA transport Received By is the person who took the items from the driver. It is separate from
  TASS's physical receipt recipient (`rmaRecipient`), which stays as is. Record detail, audit history and
  the Done tab show it as "Received by (transport)" for RMA.
- Records already in Pending (started) can still be completed by the driver. Rescheduled records come back
  as startable after Logistics reschedules. On-Hold records show no buttons and the line
  "On hold. Contact Logistics."

Who sets Pending / Reschedule after this change: Logistics, from Driver View, Driver Board and the record
page. Those controls already exist and are unchanged (see Q4).

Additive API field, so the card does not need two code paths: the record DTO returned to a DRIVER gets
`driver_actions: { start: boolean, complete: boolean, start_blocked_reason?: string }`, computed on the
server from the same checks as the routes (`timeInError`, `driverDeliveryDateError`,
`rmaCapabilities().transport`, etc.). Other roles do not receive the field. Old clients ignore it.

### 4.3 One driver job card

New component `client/src/features/dashboard/DriverJobCard.tsx`, used for every active record:

1. Header: type badge, status pill, customer name, copyable reference ("No reference yet" when empty).
   One badge style for all types; only the text differs.
2. Details: area, due date (red "N days late" line when overdue), item summary with "Show more".
3. Before start: full-width **Start transport** button.
4. After start: "Transport started: 1:01 PM" banner, POD uploader (same helper text and limits as today),
   **Received by** field (required on every type, RMA included), then one full-width **Complete delivery**
   button. It stays disabled until a JPG/PNG photo is saved and Received By is filled, with the reason
   shown under it.
5. Both buttons open the existing confirm bottom sheet with the Remarks field (remarks stay required
   because both server endpoints require them and they feed the audit trail).
6. No Pending, Reschedule or On-Hold buttons anywhere on the driver dashboard.

Type label mapping (one function, `jobTypeLabel`):

| Category | Label |
| :--- | :--- |
| Deliveries | Delivery |
| RMA | RMA |
| Procurement Pick-up | Procurement Pickup |
| Sales Orders | Sales Order |
| Accounting Collection | Accounting Collection (see Q6) |

An adapter, `useDriverJobActions(record)`, hides the endpoint difference: Start calls `time-in` or
`rma-transport IN_TRANSIT`; Complete calls `status Delivered` or `rma-transport COMPLETED` (with
`expected_version` for RMA). Start time comes from `time_in` or `rma_transport_started_at`.
`RmaWorkflowPanel` is no longer used on the driver dashboard; it stays for TASS, Logistics and Admin.
The "Done" tab keeps today's RMA wording ("Transport complete, waiting for TASS receipt").

### 4.4 Client permission UI

- Admin: Deliveries, RMA, Procurement Pick-up and Sales Orders lists and detail pages render without New,
  Edit, Submit, Assign, Status, Time In, upload or delete controls. A small "View only" note in the page
  header.
- Logistics: no "New" button on Procurement Pick-up or Sales Orders.
- TASS: Procurement Pick-up is gone from the sidebar and direct URLs fall back to an allowed page.
- The client reads these from the session snapshot and `access.canRecord(...)`; the server still decides.

## 5. Data and API changes

| Change | Type | Breaking? |
| :--- | :--- | :--- |
| `PATCH /records/:id/status`: DRIVER may only send `Delivered` | Behaviour, 403 otherwise | Only for drivers sending Pending/On-Hold/Rescheduled, which the new UI never does |
| Admin writes on the four categories return 403 | Behaviour | Yes for Admin users, by design |
| Logistics `POST /records` for PROCUREMENT_PICKUP / SALES_ORDERS returns 403 | Behaviour | Yes for Logistics, by design |
| `PATCH /records/:id/rma-assignment` no longer accepts ADMIN | Behaviour | Yes for Admin, by design |
| TASS default screens drop `procurement_pickup` | Session snapshot | Menu item disappears |
| Record DTO adds `driver_actions` for DRIVER only | Additive | No |
| `PATCH /records/:id/rma-transport` with `COMPLETED` requires `received_by` | Behaviour, 400 otherwise | Only for drivers; the new card always sends it |
| Record DTO adds `rma_transport_received_by` | Additive | No |
| Prisma: `DeliveryRecord.rmaTransportReceivedBy String?` + migration `<timestamp>_rma_transport_received_by` (`ALTER TABLE ... ADD COLUMN ... TEXT NULL`) | Additive schema | No; existing rows stay NULL |
| Database data writes / backfill | None | No |

Client and server should deploy together (the client stops calling the removed actions; the server rejects them). The migration must run before the new server starts (Dylan runs it in stage 4; the dry run is `prisma migrate diff` / reviewing the generated SQL).

## 6. Risks

1. **Admin loses its "fix anything" ability** on these modules. If Admin is used today to correct
   records, that work moves to SC (record fields) and Logistics (assignment, status, time corrections).
   Mitigation: confirm in Q1.
2. **Logistics may actually create Procurement Pick-up or Sales Orders today.** Removing it could block a
   real workflow. Mitigation: confirm in Q2; seed/UAT data that relies on Logistics-created records gets
   updated.
3. **Drivers lose the way to say "customer not available".** After this, they must call Logistics.
   Mitigation: Q4; a "Report a problem" feature could follow as its own plan.
4. **Two permission modes** (LEGACY and V1) can drift. Mitigation: every rule lives in one helper used by
   both paths, and route tests run each rule in both modes.
5. **Records already in Pending/On-Hold/Rescheduled** when this ships. Covered in 4.2; a test seeds each state.
6. **E2E and seeded specs** (`e2e/driver-mobile.spec.ts`, permission specs) click Pending/Reschedule or
   create as Logistics/Admin. They will be updated in the same branch.
7. **Migration on staging/production.** Additive nullable column, no lock-heavy rewrite, but it is a schema
   change on a live database, so Dylan runs it at release after reviewing the SQL.
8. **RMA in transit at release time** has no transport Received By yet; the driver fills it when completing. Older completed RMAs show it blank.
9. **Working tree note:** the local `dev` checkout shows about 60 modified files that differ only in line
   endings (CRLF). Stage 2 should not commit them; `git diff --ignore-cr-at-eol` is empty.

## 7. Acceptance criteria (testable)

Access matrix
- AC1. SC can create Delivery, Procurement Pick-up and Sales Order records. SC cannot open RMA (screen hidden, `GET /records?category=RMA` returns no RMA rows, direct detail returns 403).
- AC2. Logistics `POST /records` for DELIVERY, PROCUREMENT_PICKUP, SALES_ORDERS and RMA returns 403; no "New" button on those pages.
- AC3. Logistics can assign a driver on Delivery, Procurement Pick-up, Sales Order and on RMA with `LOGISTICS_TRANSPORT`.
- AC4. TASS can create RMA. TASS has no Deliveries, Procurement Pick-up or Sales Orders menu item, and their direct URLs fall back to an allowed page.
- AC5. Admin can list and open records in all four modules. Every write (create, edit, submit, assign, RMA assign, time-in, status, attachment upload/delete, timestamp correction) returns 403 and no write control is shown.
- AC6. An RMA with `INTERNAL_NO_DRIVER` or `SUPPLIER_COLLECTION` cannot be assigned (403) and never appears on any driver dashboard.
- AC7. AC1 to AC6 pass with `PERMISSION_MODE=LEGACY` and with `PERMISSION_MODE=V1`.

Driver card
- AC8. On the driver dashboard, an assigned Delivery, RMA, Procurement Pick-up and Sales Order render the same card structure (same sections, buttons, POD block, order). The only difference is the badge text: "Delivery", "RMA", "Procurement Pickup", "Sales Order".
- AC9. Before start, the card shows only "Start transport". After start it shows the start time, POD uploader, Received by and "Complete delivery", on every type including RMA.
- AC10. No card shows Pending, Reschedule or On-Hold buttons, at phone width (393px) and desktop width.

Driver actions (server)
- AC11. A driver `PATCH /records/:id/status` with Pending, On-Hold, Rescheduled, Scheduled or Draft returns 403 for every category, in both permission modes, and the record is unchanged.
- AC12. A driver can start (time-in or RMA transport `IN_TRANSIT`) only their own assigned, non-draft, current-dated run. Another driver's run returns 403.
- AC13. A driver cannot complete without a saved JPG/PNG POD on the record: the server returns 400 and the button stays disabled with the reason shown.
- AC14. POD upload rejects a file over 10 MB, a type outside JPG/PNG/PDF/DOCX/XLSX, an 11th file and a total over 50 MB, with the existing messages. A PDF alone does not enable "Complete delivery".
- AC15. With a valid photo and Received By, "Complete delivery" sets Delivery/PP/SO to Delivered with server Time Out, and sets RMA transport to COMPLETED (RMA then waits for TASS receipt).
- AC15a. Completing any type (RMA included) without Received By returns 400 and the button stays disabled. For RMA the name is saved to `rma_transport_received_by`, shown on the record and in audit history, and TASS's later physical receipt recipient is stored separately and unchanged.
- AC16. A record that was already Pending can still be completed by the driver; an On-Hold record shows no buttons and "On hold. Contact Logistics."
- AC17. Logistics can still set Pending and Reschedule from Driver View and Driver Board.

Quality gates
- AC18. `npm run lint`, `npm run build`, `npm run test:client`, `npm run test:server` pass; updated E2E driver and permission specs pass.

## 8. Implementation phases (stage 2, one commit each, tests alongside)

1. Server: `driverActionError` + `PATCH /status` guard + RMA-in-V1 gap. Tests in `server/tests` (both modes).
2. Server: access matrix helpers (Admin read-only, Logistics create, TASS screen) + route guards. Tests per AC1 to AC7.
3. Server: migration + `rmaTransportReceivedBy`, required `received_by` on RMA transport completion, `driver_actions` in the driver DTO. Tests for each state (Scheduled, In Transit, Pending, On-Hold, Rescheduled, future date, RMA PENDING/IN_TRANSIT).
4. Client: `DriverJobCard`, `jobTypeLabel`, `useDriverJobActions`; remove Pending/Reschedule from the driver dashboard. Tests in `client/tests`.
5. Client: Admin view-only UI, Logistics/TASS menu and "New" changes. Tests.
6. E2E spec updates and `docs/MODULE_ACCESS.md` refresh.

## 9. Open questions for Dylan

- Q1. Admin read-only: should Admin lose every write on these four modules, including comments and attachments? Recommended: yes, all writes blocked; Accounting Collection unchanged.
- Q2. Logistics can currently create Procurement Pick-up and Sales Orders. Remove that? Recommended: yes, SC only.
- Q3. TASS currently has the Procurement Pick-up menu item (it shows no records). Remove it? Recommended: yes.
- Q4. Pending and Reschedule move to Logistics only (Driver View, Driver Board, record page). Is that right, or should someone else own it? Recommended: Logistics.
- Q5. Received By on the RMA card? Answered: required on every record, RMA included (D5).
- Q6. Accounting Collection runs also reach drivers today. Give them the same card and the same Start/Complete-only rule with an "Accounting Collection" label? Recommended: yes.

## 10. Decisions log

Dylan, 2026-11-11:
- D1 (Q1). Yes. Admin is fully read-only on Deliveries, RMA, Procurement Pick-up and Sales Orders, including comments and attachments. Accounting Collection unchanged.
- D2 (Q2). Yes. Only SC creates Procurement Pick-up and Sales Orders.
- D3 (Q3). Yes. TASS loses the Procurement Pick-up screen.
- D4 (Q4). Yes. Logistics alone handles Pending and Reschedule.
- D5 (Q5). Drivers fill in Received by on every record, RMA included. For RMA it is stored in a new nullable column `rmaTransportReceivedBy`, separate from TASS's physical receipt recipient.
- D6 (Q6). Yes. Accounting Collection runs use the same card and rules, labelled "Accounting Collection".
