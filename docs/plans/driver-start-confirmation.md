# Plan: Driver "Start transport" becomes a confirmation (optional remarks)

Status: stage 1 (plan). Approved by Dylan on 2026-11-13. Ready for stage 2.
Date: 2026-11-13
Base: `dev` at `7b0807e` (local; `git fetch` could not reach GitHub from this session, so pull `dev` before stage 2).
Feature branch: `feature/driver-start-confirmation` (created, no commits).

## Approved decisions (2026-11-13)

1. Logistics/Admin Record Time In keeps required remarks (section 4 out of scope stands).
2. Option C: confirmation sheet with an optional note.
3. Default remark when the note is blank: `Transport started`.

## 1. Summary

Today a Driver who taps **Start transport** on the Driver dashboard gets a sheet that requires
"Remarks, reason for change". Confirm stays disabled until something is typed, so drivers type filler
("start", "going") that carries no information. Starting a run is not a "change" that needs a reason: the
record is already assigned and scheduled, and the system already knows who started it and when.

After this change, Start transport opens a **confirmation sheet**: job, company, reference, and an
**optional** note field. Confirm is enabled straight away. If the driver leaves the note blank, the server
writes a standard remark (`Transport started`) so the remark history and audit trail stay complete.

**Complete delivery is unchanged.** It still requires remarks, Received By and proof photo.

## 2. What the start remarks feed today (verified in code)

| Consumer | Where | Depends on driver-typed text? |
|---|---|---|
| Audit log (before/after JSON) | `records.ts` `POST /:id/time-in`, `rmaDispatch.ts` `savedAction` | No. Written from the record state; remarks are just one field in the snapshot. |
| Remark history (append-only `RemarkLog`, context `TIME_IN` / `RMA_TRANSPORT`) | same handlers; shown in the record's Remarks tab and the manifest PDF documentation trail | Needs **a** body (`body` is non-null), not driver text. An auto remark keeps one row per start. |
| `DeliveryRecord.remarks` (latest remark) | overwritten on start | Shows whatever was last written; the auto text is fine. |
| Notifications | RMA start notifies TASS + Logistics (`In transit.`); non-RMA start sends none | No. Message text never includes the remarks. |
| Dashboards, reports, exports, daily snapshots | use `timeIn`, `status`, `rmaTransportStartedAt` | No. |
| Business rules | `docs/BUSINESS_REQUIREMENTS.md` BR-LIFE-04 and rule 3: "Remarks are mandatory ... for every status change" | **Yes, on paper.** This plan needs a documented exception, like BR-LIFE-08 (bulk status, remarks generated automatically). |
| Tests | `podRequirements.test.ts`, `seededRoleWorkflows.test.ts`, `rmaDispatch.test.ts`, `driverDashboardDesign.test.ts`, `e2e/tests/integration.spec.ts` | Existing tests send remarks and keep passing. New tests cover the blank case. |

Conclusion: nothing functional depends on the driver typing a reason. The only hard dependency is that a
remark row exists, which a server-generated default satisfies.

## 3. Options considered

| Option | Verdict |
|---|---|
| A. Keep required remarks | Low-quality filler, extra friction on a phone at the start of every run. Not recommended. |
| B. Pure confirmation, no text field at all | Simplest, but drivers lose a place to note something real ("customer asked to come at 3pm", "using backup van"). |
| **C. Confirmation with optional note, server default when blank** | **Recommended.** Fast path for 95% of starts, keeps the audit trail identical in shape, still lets a driver add context. |

## 4. Scope

In scope:
- Driver dashboard start sheet (`client/src/features/dashboard/DriverDashboard.tsx`) for Deliveries,
  Procurement Pick-up, Sales Orders, Accounting Collection (Time In) and RMA (Logistics transport start).
- Server: remarks optional **for the Driver role only** on `POST /records/:id/time-in` and on
  `PATCH /records/:id/rma-transport` when `transport_status = IN_TRANSIT`.
- Remark history label for the `TIME_IN` and `RMA_TRANSPORT` contexts (today they show the raw code).
- Docs: BUSINESS_REQUIREMENTS (exception), API_CONTRACT (remarks optional for Driver start).

Out of scope:
- Complete delivery / complete RMA transport (remarks stay required).
- Logistics/Admin recording Time In from the record workspace, Accounting Collection workspace and the
  Logistics driver board (`DriverView.tsx`). Recording a start on a driver's behalf is an exception act,
  so a reason stays required there (see open question 8.1).
- Any schema or migration change.

## 5. Changes

### 5.1 Data
None. `RemarkLog.body` stays required; the server fills it.

### 5.2 API
- New shared helper (e.g. `server/src/services/startRemarks.ts`):
  `DEFAULT_START_REMARK = 'Transport started'`,
  `resolveStartRemarks(raw, role)` returns the trimmed text, the default for a Driver with blank/missing
  remarks, or an error for other roles. Rejects non-string values and enforces the existing length limit if any.
- `POST /records/:id/time-in`: use the helper instead of the inline 400. Driver may send `{}` or
  `{ "remarks": "" }`; Logistics/Admin still get `400 Remarks are required when recording Time In.`
- `PATCH /records/:id/rma-transport`: the `input()` helper keeps requiring remarks for `COMPLETED`; for
  `IN_TRANSIT` it uses the default when blank. Route is Driver-only already.
- `recordOperations.ts` allowed-field list for `/time-in` is unchanged (`remarks` still allowed, now optional).

### 5.3 Client
- `DriverDashboard.tsx` start sheet:
  - Title "Start transport", summary "Start transport for <Company> (<Type>)", reference line (as today).
  - Short line: "Your start time is recorded when you confirm."
  - Field label "Note (optional)", no `required`, no autofocus (so the phone keyboard does not pop up);
    focus goes to the Confirm button.
  - Confirm is enabled when not saving and no photo error; blank note sends `remarks: ''`.
  - Complete sheet keeps the current required "Remarks, reason for change" field and disabled-until-typed rule.
- `api/index.ts`: `recordTimeIn` / `progressRmaTransport` types allow `remarks?: string`.
- `DeliveryRecordWorkspace.tsx` and `DeliveryManifest.tsx` `CONTEXT_LABEL`: add
  `TIME_IN: 'Transport started'` and `RMA_TRANSPORT: 'RMA transport'`.

## 6. Permissions
No permission changes. `TIME_IN` and `CATEGORY:RMA:STATUS` checks, record scope, assigned-driver checks and
delivery-date rules all run exactly as before. Only the remarks validation differs, and only for `DRIVER`.

## 7. Risks
- **Business rule drift**: BR-LIFE-04 says every status change needs remarks. Mitigated by a written exception
  in BUSINESS_REQUIREMENTS and API_CONTRACT. Needs Dylan's (and if needed the business owner's) sign-off.
- **Accidental starts**: a one-tap confirm is easier to hit by mistake. Mitigated by keeping the sheet (two taps),
  and Logistics can already correct/reschedule a wrongly started run.
- **Less context in history**: most starts will read "Transport started". Acceptable because time, author and
  role are already on every row.
- **Role leak**: if the helper is applied without the role check, Logistics/Admin would lose the required reason.
  Covered by AC4.

## 8. Open questions for Dylan
1. ~~Should Logistics/Admin Time In also become optional, or stay required?~~ Decided 2026-11-13: stay required.
2. ~~Option C (optional note) or option B (no text field at all)?~~ Decided 2026-11-13: option C, optional note.
3. ~~Default remark wording: "Transport started" OK?~~ Decided 2026-11-13: yes.

## 9. Acceptance criteria (testable)
- **AC1** Driver dashboard: tapping Start transport on an assigned, startable Delivery opens a sheet with Confirm
  enabled and an optional note field; Confirm with a blank note returns 200, sets `time_in`, status In Transit.
- **AC2** Same as AC1 for RMA with Logistics transport: `rma_transport_status` becomes `IN_TRANSIT`,
  `rma_transport_started_at` is set, TASS and Logistics get the existing "RMA transport updated" notification.
- **AC3** Blank start writes exactly one `RemarkLog` row with body `Transport started` and the matching context
  (`TIME_IN` / `RMA_TRANSPORT`), authored by the driver; one audit log row as today.
- **AC4** `POST /time-in` without remarks as Logistics or Admin still returns 400 with the current message.
- **AC5** A typed note is saved trimmed as the remark body instead of the default.
- **AC6** Non-string remarks (e.g. number) return 400 on both endpoints.
- **AC7** Complete delivery and RMA transport `COMPLETED` without remarks still return 400; the complete sheet
  still disables Confirm until remarks are typed.
- **AC8** Remarks tab and manifest PDF show "Transport started" / "RMA transport" labels instead of raw codes.
- **AC9** Existing permission, date-window and assignment checks unchanged: an unassigned driver, a future-dated
  run, or a missing `TIME_IN` permission still fails as before.
- **AC10** Client and server type checks and test suites pass; the E2E integration start step passes both with
  and without a note.

## 10. Stage 2 phases (one commit each, tests alongside)
1. Server helper + `/time-in` and `/rma-transport` changes; server tests for AC1-AC7, AC9.
2. Driver dashboard sheet + API types; client tests (`driverDashboardDesign.test.ts`) for AC1, AC7.
3. Remark context labels (AC8) + E2E integration step update (AC10).
4. Docs: BUSINESS_REQUIREMENTS exception, API_CONTRACT.
