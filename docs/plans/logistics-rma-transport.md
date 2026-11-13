# Plan: Let Logistics record RMA transport for drivers

Status: approved by Dylan on 2026-11-13 (section 10). Stage 2 runs in its own thread. Q2 stays open and does
not block the build.
Date: 2026-11-13
Base: `dev` at `40c14af`, which includes `feature/driver-start-confirmation` (PR #317) and its
`resolveStartRemarks` in `server/src/services/startRemarks.ts` (a Driver may leave the start note blank, every
other role must type remarks). The live check in 2.1 ran on `7b0807e`; code references below are re-checked
against `40c14af`.
Feature branch for stage 2: `feature/logistics-rma-transport` off `dev`. This file moves to
`docs/plans/logistics-rma-transport.md` in the first commit.
Screens: RMA record page (Status & Actions tab), Drivers > View.

## 1. Summary

Dylan's question: Logistics can fill in a driver's run on Deliveries but not on the other record types.
Is that a gap?

Answer: only for RMA. I checked the code on `dev` and ran the app as a Logistics user against a private test
database, on one assigned job of each type due today:

| Record type | Logistics starts it for the driver | Uploads the proof photo | Completes it (Received By + photo) |
| :--- | :--- | :--- | :--- |
| Deliveries | Yes | Yes | Yes |
| Procurement Pick-up | Yes | Yes | Yes |
| Sales Orders | Yes | Yes | Yes |
| Accounting Collection | Yes | Yes | Yes |
| RMA (Logistics transport) | **No** | **No** | **No** |

Procurement Pick-up, Sales Orders and Accounting Collection already work exactly like Deliveries, in both
permission modes. If they failed for Dylan, that is a different problem (Q2).

The RMA block is deliberate code from RMA dispatch (#255), and the current access matrix repeats it
(Logistics on RMA = view and assign). But no document records a reason, BR-LIFE-02 lists Logistics as able to
record Time In with no RMA exception, and there is no fallback: when a driver's phone dies or the driver
cannot use the app, the RMA transport stays Pending and nobody can finish it, while a Delivery on the same
run can be finished by Logistics.

Proposal: Logistics can **Start transport** and **Complete transport** on an assigned Logistics-transport RMA
for the assigned driver, under the same rules the driver has (assigned driver, planned date reached, verified
JPG/PNG proof photo, Received By), plus required remarks. TASS still confirms physical receipt and completes
the RMA. Admin stays view-only. No database migration. One permission switch per environment, with a dry run.

## 2. Current behaviour (verified)

### 2.1 Live check

Setup: `dev` at `7b0807e`, private local PostgreSQL with throwaway data, permission foundation and the #255
RMA dispatch activation applied, one Driver ("Juan Driver"), every job Scheduled, assigned and dated today
(Asia/Manila). All calls made as the Logistics user, with remarks. Run in `PERMISSION_MODE=V1` and again in
`LEGACY` (the default) with the same outcome.

| Call as Logistics | Deliveries | Pick-up | Sales Orders | Acct Collection | RMA |
| :--- | :--- | :--- | :--- | :--- | :--- |
| "Record Time In" on Status & Actions | shown | shown | shown | shown | not shown, only the assignment form |
| `POST /records/:id/time-in` | 200 In Transit | 200 | 200 | 200 | 403 |
| `PATCH /records/:id/rma-transport` `IN_TRANSIT` | n/a | n/a | n/a | n/a | 403 "Forbidden for this role" |
| `POST /records/:id/attachments` (proof photo) | 201 | 201 | 201 | 201 | 403 |
| Complete: `PATCH /status` `Delivered` with `received_by`, or RMA `rma-transport` `COMPLETED` | 200 Delivered | 200 | 200 | 200 | 403 "Forbidden for this role" |
| `GET /records/:id/rma-capabilities` | | | | | `assign: true`, `transport: false`, `pod: false` |

RMA 403 messages: V1 "Time In denied" and "Attachment changes denied"; LEGACY "Logistics has view-only access
to RMA records".

Screenshots (same folder): `evidence/logistics-procurement-pickup-actions.png` (proof uploader and Record
Time In) and `evidence/logistics-rma-actions.png` (RMA shows only "Driver & transport details").

### 2.2 Where the code blocks Logistics on RMA

Server (all of these change together):
1. `server/src/routes/rmaDispatch.ts:140`: `PATCH /:id/rma-transport` has `requireRole('DRIVER')`.
2. `rmaDispatch.ts:41` and `:48`: `rmaCapabilities()` gives `transport` and `pod` only when
   `policy.role === 'DRIVER'`.
3. `server/src/services/permissionCatalog.ts:83`: the role ceiling allows Logistics only `WRITE` and `ASSIGN`
   on RMA. An ALLOW above the ceiling is rejected on save and denied at runtime (`permissionEvaluator.ts`).
4. `server/src/services/rmaDispatchPermissions.ts:6`: the #255 activation gives Logistics
   `SCREEN:rma:WRITE`, `CATEGORY:RMA:WRITE` and `CATEGORY:RMA:ASSIGN` only.
5. `server/src/services/recordAccess.ts:229`: the RMA branch of `canPerformPolicyRecordAction` has transport
   rules for `DRIVER` only. For any other role, `STATUS` with no target falls through to `false`.
6. `server/src/routes/records.ts:66-70`: the record middleware returns 403 for any non-GET on an RMA by
   Logistics; `records.ts:859` denies Logistics RMA uploads again; `server/src/services/recordOperations.ts:25`
   (V1) needs `POD`.

Client:
7. `client/src/features/deliveries/RmaWorkflowPanel.tsx:52` and `:55`: `transport` and `pod` require
   `currentUserRole === 'Driver'`; `:260` shows the proof uploader to drivers only.
8. `RmaWorkflowPanel.tsx:95-99`: Complete transport does not send `received_by`, which the server has
   required since D5 (`rmaTransportReceivedBy`). Drivers now use the driver job card, so nobody reaches this
   today, but it must be fixed before Logistics uses the panel.
9. `client/src/features/drivers/DriverView.tsx:346`: Drivers > View embeds the same panel for RMA, so it has
   no RMA actions either.

### 2.3 The docs disagree

- `docs/BUSINESS_REQUIREMENTS.md:50` (BR-LIFE-02): Time In by "Driver, Logistics, Admin", no RMA exception.
  Line 188 still says "RMA: Created by Sales Coordinator/Admin; Logistics view-only", which is out of date
  (TASS creates RMA).
- `docs/RMA_DISPATCH_IMPLEMENTATION.md`, "Accepted workflow and role boundaries": the assigned Driver records
  the transport. No reason is given for leaving Logistics out.
- `docs/MODULE_ACCESS.md:60` and `docs/plans/driver-job-cards-and-actions.md` section 4.1: Logistics on RMA =
  view and assign driver.

## 3. Scope

In scope
- Logistics can Start transport (Pending to In Transit) and Complete transport (In Transit to Transport
  complete) on a submitted RMA with movement "Logistics transport" that has an assigned Driver, from the RMA
  record's Status & Actions tab and from Drivers > View.
- Logistics can upload the transport proof photo on such an RMA while transport is In Transit.
- Every check the driver has today stays: assigned driver, planned date reached (Asia/Manila), not received
  or completed yet, `expected_version` (409 when stale), a saved and verified JPG/PNG proof photo, Received By
  (1 to 120 characters).
- Remarks are required for Logistics on Start and on Complete (matches driver-start-confirmation: only a
  Driver may leave the start note blank).
- The remark, audit entry and notifications name the Logistics user who acted, as they do on Deliveries.
- A permission switch per environment, with dry run, apply and revoke.
- Docs.

Out of scope
- Logistics editing RMA details, confirming physical receipt, final completion, or Pending / On-Hold /
  Reschedule on RMA. These stay with TASS.
- Logistics deleting RMA attachments.
- Admin (stays view-only, decision D1).
- Starting an RMA through `/time-in`. RMA keeps its own Start path.
- Notifying the driver when Logistics acts for them (possible follow-up).
- Deliveries, Procurement Pick-up, Sales Orders and Accounting Collection (already work).

## 4. Changes

### 4.1 Data

None. No migration. `rmaTransportStartedAt`, `rmaTransportCompletedAt` and `rmaTransportReceivedBy` exist.

### 4.2 Permissions and rollout

- Ceiling (`permissionCatalog.ts:83`): Logistics on RMA becomes `WRITE`, `ASSIGN`, `STATUS`, `POD`. Never
  `UPDATE`, `RECEIVE`, `COMPLETE`, `CREATE` or `TIME_IN`.
- The frozen legacy baseline (`defaultRolePermissions`, `legacyCapabilities`) does not change, so the
  permission backfill keeps producing the same baseline. The new rights come only from an explicit switch,
  the pattern #255 used.
- New grant list next to `RMA_DISPATCH_GRANTS`: `LOGISTICS: ['CATEGORY:RMA:STATUS', 'CATEGORY:RMA:POD']`.
- New script `npm run permissions:activate-rma-logistics-transport`
  (`server/prisma/activate-rma-logistics-transport.ts`, service in `rmaDispatchPermissions.ts`):
  - Dry run by default: prints the Logistics role policy revision, the two rows it would change, and
    whether the policy is eligible. Writes nothing.
  - `--apply` writes. `--revoke` sets the two rows back to DENY.
  - Same guards as #255: an identified active Admin (`RMA_DISPATCH_ADMIN_ID`), advisory lock `(243, 1)`, one
    transaction. It only changes a Logistics policy whose rows exactly match the #255-activated set and whose
    revision is the one recorded by the #255 activation audit entry. Anything else is reported as skipped
    with a nonzero exit, for an Admin to review. Idempotent. One audit entry with before and after
    (`source: RMA_LOGISTICS_TRANSPORT`). Individual user overrides are untouched.
  - Staging and production: dry run first, output to Dylan, `--apply` only after Dylan's explicit go-ahead
    (stage 4).
- Until the switch runs nothing changes for Logistics (fails closed). The server reads role policies on every
  request, so it applies at once; the Logistics screen shows the buttons after its next session refresh
  (within 30 seconds or on focus) or a reload.
- In V1 mode an Admin can later switch the two rights off for Logistics in Admin permissions, because they are
  now inside the ceiling. In LEGACY mode policy saves return 503, so the script is the only switch.

### 4.3 Server

- `recordAccess.ts`, RMA branch of `canPerformPolicyRecordAction`: a Logistics case for `STATUS` and `POD`
  only. Allowed when `eligibleRmaTransport` and `rmaTransport.actionAllowed` are true, and for `STATUS` only
  with no `targetStatus` (transport, never a status change). Logistics `STATUS` with a target returns false.
  `ASSIGN` unchanged.
- `rmaDispatch.ts`:
  - `rmaCapabilities()`: `transport` and `pod` for `DRIVER` and `LOGISTICS`. The driver keeps the
    own-assignment rule (record scope); Logistics needs an assigned driver on the record (`row.driverId`).
  - `PATCH /:id/rma-transport`: `requireRole('DRIVER', 'LOGISTICS')`. `requireAction('CATEGORY', 'RMA',
    'STATUS')` and the policy re-read inside the transaction stay. Remarks required for Logistics on Start
    (`resolveStartRemarks`) and on Complete (already required). Completion keeps `received_by` and the
    verified proof photo check in the same transaction. A future planned date keeps returning 403.
  - Notifications unchanged: TASS and Logistics get "RMA transport updated", the actor is left out.
- `records.ts`:
  - Record middleware (`:66-70`): let Logistics through on `POST /:id/attachments` for RMA only, by extending
    the existing `allowDriverRmaPod` exception. Every other write stays view-only for Logistics on RMA.
  - Upload handler (`:857-864`): Logistics on RMA uses `canUploadRmaPod`, which becomes true through the
    new `pod` capability (In Transit, Logistics transport, assigned driver, not received).
  - Attachment delete: unchanged.
- `POST /:id/time-in` on RMA stays denied for every role.

### 4.4 Client

- `RmaWorkflowPanel.tsx`:
  - `transport` and `pod` also for Logistics, still driven by the server capabilities and
    `access.canRecord`.
  - Proof photo uploader for Logistics while In Transit.
  - A required "Received by" field (max 120 characters) for Complete transport, sent as `received_by`. This
    also fixes item 8.
  - One line above the buttons for Logistics: "Recording for Juan Driver. This is saved under your name."
  - Future planned date: no buttons, and the line "Transport can start on 2026-11-20."
- Drivers > View gets all of this through the embedded panel. No separate change.
- The RMA Overview stays read-only for Logistics (`DeliveryRecordsView.tsx:973` unchanged).
- Driver job card: no change. It shows the new state through its existing polling.

### 4.5 Docs

- `docs/RMA_DISPATCH_IMPLEMENTATION.md`: role boundaries, and the new switch (dry run, apply, revoke,
  rollback order).
- `docs/BUSINESS_REQUIREMENTS.md`: BR-LIFE-02 note (RMA starts with Start transport), fix line 188.
- `docs/MODULE_ACCESS.md:60` and the matrix in `docs/plans/driver-job-cards-and-actions.md` section 4.1.
- `docs/API_CONTRACT.md`: `rma-transport` roles, RMA proof upload by Logistics.

## 5. Permissions after the change

Logistics-transport RMA with an assigned driver:

| Action | Driver (own runs) | Logistics | TASS |
| :--- | :--- | :--- | :--- |
| Start transport | Yes | **Yes (new)** | No |
| Upload transport proof photo while In Transit | Yes | **Yes (new)** | Unchanged |
| Complete transport (Received By + photo) | Yes | **Yes (new)** | No |
| Assign driver, vehicle, assistants | No | Yes | No |
| Physical receipt, final completion | No | No | Yes |
| RMA status (Pending, On-Hold, Reschedule) | No | No | Yes |
| Edit RMA details | No | No | Yes |

Admin and Sales Coordinator: no change.

## 6. Risks

1. Separation of duties. #255 kept transport with the driver who carries the item, and Logistics recording
   it from the office weakens that. Mitigation: the same photo and Received By are required, remarks are
   required, every action is saved under the Logistics user's name, and TASS still confirms physical receipt
   before the RMA can be completed. Dylan accepted this trade-off by choosing start and complete (section 10).
2. `STATUS` is a broad permission key. Giving Logistics `CATEGORY:RMA:STATUS` must not open `PATCH /status` on
   RMA. Mitigation: the Logistics rule allows `STATUS` only without a target, and the record middleware keeps
   `PATCH /status` and `PUT` view-only for Logistics on RMA. Tests cover Pending, On-Hold, Rescheduled and
   Delivered on RMA as Logistics, in both modes.
3. Rollout. The code alone changes nothing until the switch runs, so a missed switch looks like "not
   working". The release steps include the dry run and apply for every environment.
4. Rollback order. Revoke first (`--revoke`), then roll back the code. Old code denies the rights anyway
   (above its ceiling), but revoking first keeps stored policies inside the old ceiling for the Admin screens.
5. Merge conflict with `feature/driver-start-confirmation`, which edits the same route and `input()` helper.
   Mitigation: start after it merges and reuse `resolveStartRemarks`.
6. Driver and Logistics acting at the same moment. `expected_version` gives the second one 409 "This RMA
   changed in another session" and the panel reloads.
7. Completing the wrong RMA by mistake. Complete needs remarks, Received By and a photo, and the panel shows
   the RMA number and the driver's name.

## 7. Acceptance criteria (testable)

Setup unless stated: switch applied, submitted RMA, movement Logistics transport, assigned driver, planned date
today (Asia/Manila), transport Pending.

- **AC1** Logistics `PATCH /rma-transport` `IN_TRANSIT` with remarks returns 200: transport In Transit,
  `rma_transport_started_at` set, a remark and an audit entry under the Logistics user, TASS notified.
- **AC2** The same without remarks returns 400 and saves nothing.
- **AC3** Planned date tomorrow returns 403 and saves nothing; the panel shows no buttons and the start date.
- **AC4** 403 for: no assigned driver, draft, movement Supplier collection or Internal, already received,
  transport already Completed.
- **AC5** Logistics uploads a JPG/PNG proof photo while In Transit: 201. While Pending: 403.
- **AC6** Logistics `COMPLETED` with remarks, Received By and a saved photo returns 200: transport Completed,
  `rma_transport_received_by` and `rma_transport_completed_at` set, RMA status unchanged, physical receipt
  still unconfirmed. Without Received By: 400 "Received By is required before completing this run." Over 120
  characters: 400. Without a photo: 400 "Upload a saved JPG or PNG transport proof photo before completing
  transport."
- **AC7** A stale `expected_version` returns 409 for whichever of Driver and Logistics saves second.
- **AC8** Logistics still gets 403 on RMA for `PATCH /status` (Pending, On-Hold, Rescheduled, Delivered),
  `PUT /records/:id`, `POST /time-in`, `POST /rma-receipt` and attachment delete, in both permission modes.
- **AC9** Before the switch runs, Logistics gets 403 on `rma-transport` and on RMA proof upload, and
  `rma-capabilities` shows `transport: false` and `pod: false`.
- **AC10** Driver flow unchanged: a driver starts and completes their own RMA and cannot act on another
  driver's RMA.
- **AC11** TASS, Admin and Sales Coordinator get 403 on `rma-transport`.
- **AC12** Switch: the dry run writes nothing and prints the plan. `--apply` on an exact #255 Logistics
  policy changes only the two rows and writes one audit entry; a second run changes nothing. A customized
  policy is skipped with exit code 1. `--revoke` sets both rows back to DENY with an audit entry. User
  overrides are untouched.
- **AC13** UI as Logistics: the RMA's Status & Actions tab shows remarks and Start transport; after the start
  it shows the proof photo uploader, Received by and Complete transport. Drivers > View shows the same for
  the RMA run. The Overview tab stays read-only.
- **AC14** The driver's job card shows the new state within its existing polling interval, without a reload.
- **AC15** `tsc --noEmit` passes for client and server, client and server tests pass, and a Logistics
  on-behalf case in `e2e/tests/rma-dispatch.spec.ts` passes.

## 8. Open questions for Dylan

- **Q1.** Answered: start and complete (section 10).
- **Q2.** Where did Procurement Pick-up or Sales Orders fail for you? Environment (local, staging,
  production), screen and a record number. They work in my test in both permission modes, so it may be the
  record (no driver assigned yet, still a Draft) or a module restriction on that Logistics account.
- **Q3.** Keep the planned-date rule for Logistics on RMA (cannot start before the planned date)?
  Recommended: yes, same as the driver; TASS changes the date when an earlier pickup is agreed. On Deliveries
  the date rule applies to drivers only.

## 9. Stage 2 phases (one commit each, tests alongside)

1. Permissions: ceiling, grant list, activation service and script (dry run, apply, revoke). Tests:
   `permissionEvaluator.test.ts` (Logistics RMA `UPDATE` and `COMPLETE` stay forbidden), activation tests.
2. Server rules: `recordAccess.ts`, `rmaCapabilities()`, `rma-transport` roles and remarks. Tests:
   `rmaDispatch.test.ts`, `rmaDispatch.postgres.test.ts`.
3. Server proof upload: record middleware and upload handler. Tests: `podRequirements.test.ts`.
4. Client: `RmaWorkflowPanel` (capabilities, uploader, Received by, copy, date line). Tests in
   `client/src/features/deliveries/__tests__/`.
5. E2E: Logistics on-behalf case in `e2e/tests/rma-dispatch.spec.ts`.
6. Docs (4.5).

Release (stage 4, Dylan): merge to `dev` after QA, then per environment: dry run of the switch, Dylan's
go-ahead, `--apply`, Logistics users reload. Rollback: `--revoke`, then the code.

## 10. Decisions log

Dylan, 2026-11-13:
- Q1. Start and complete. Logistics can start RMA transport, upload the transport proof photo and complete
  transport for the assigned driver, with the checks in section 3. Options not taken: start only, and keeping
  RMA driver-only.
- Plan approved ("proceed").
- Q3. Not answered; the recommended default applies: Logistics keeps the planned-date rule on RMA.
- Q2. Not answered yet. It is a separate question about Procurement Pick-up and Sales Orders and does not
  block this build.
