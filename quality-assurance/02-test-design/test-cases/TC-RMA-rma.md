# Test Cases: RMA (Returns / Pull-out)

| Document control | |
|---|---|
| Title | Test Cases: RMA (Returns / Pull-out) |
| Document ID | QA-TC-RMA |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

RMA is created by Sales Coordinator or Admin, is view-only for Logistics, and is worked by TASS (`server/src/routes/records.ts:30-35`, `:806`, `:889-892`, `:1124`). See OQ-01 for who starts an RMA run.

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

> **This whole file is DEFERRED in cycle 1** (user decision 2026-10-14: focus on Deliveries; see `../../00-discovery/open-questions.md`). Keep it for a later cycle; record every case as Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-RMA-001](#tc-rma-001-sales-coordinator-creates-an-rma-record) | Sales Coordinator creates an RMA record | Sales Coordinator | High | Positive | TS-004 | Deferred |
| [TC-RMA-002](#tc-rma-002-logistics-cannot-create-rma-records) | Logistics cannot create RMA records | Logistics | High | Access Control | TS-010 | Deferred |
| [TC-RMA-003](#tc-rma-003-tass-can-work-an-rma-record-in-the-ui) | TASS can work an RMA record in the UI | TASS | Critical | Positive | TS-004 | Deferred |
| [TC-RMA-004](#tc-rma-004-tass-changes-rma-status-through-the-server-rules) | TASS changes RMA status through the server rules | TASS | High | Positive | TS-004 | Deferred |
| [TC-RMA-005](#tc-rma-005-tass-cannot-change-status-of-non-rma-records-it-can-read) | TASS cannot change status of non-RMA records it can read | TASS | High | Access Control | TS-010 | Deferred |
| [TC-RMA-006](#tc-rma-006-tass-cannot-assign-drivers-or-vehicles) | TASS cannot assign drivers or vehicles | TASS | High | Access Control | TS-010 | Deferred |
| [TC-RMA-007](#tc-rma-007-admin-assigns-a-driver-and-starts-an-rma-run) | Admin assigns a driver and starts an RMA run | Admin | High | Positive | TS-004 | Deferred |
| [TC-RMA-008](#tc-rma-008-tass-cannot-submit-an-rma-draft) | TASS cannot submit an RMA draft | TASS | Medium | Access Control | TS-010 | Deferred |
| [TC-RMA-009](#tc-rma-009-driver-completes-the-rma-run) | Driver completes the RMA run | Driver | High | Positive | TS-004 | Deferred |

## Test cases

### TC-RMA-001: Sales Coordinator creates an RMA record

| Field | Description |
|---|---|
| Test Case ID | TC-RMA-001 |
| Title | Sales Coordinator creates an RMA record |
| Scenario ID | TS-004 |
| Requirement / Rule Ref | R-SC, T-02, WF-3 |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | D-RMA-01, D-RMA-02 |
| Steps | 1. Click sidebar "RMA", then "New Record". Fill the D-RMA-01 values from test-data.md §4 and click "Submit". Record the Record ID as {D-RMA-01.id}.<br>2. Repeat for D-RMA-02.<br>3. Check the page title. |
| Expected Result | • Toast "Record submitted" twice; both rows status "Scheduled".<br>• Page title "RMA (Returns / Pull-out)". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-RMA-002: Logistics cannot create RMA records

| Field | Description |
|---|---|
| Test Case ID | TC-RMA-002 |
| Title | Logistics cannot create RMA records |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-LOG, BR-01 (records.ts:806; DeliveryRecordsView.tsx:260-262) |
| Role | Logistics |
| Priority | High |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. Click sidebar "RMA"; look for "New Record".<br>2. Click sidebar "Main" → "New Delivery"; open "Order Type *" options. |
| Expected Result | • No "New Record" button on RMA.<br>• "Order Type *" does not offer RMA. (API refusal is covered by TC-ACC-004.) |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-RMA-003: TASS can work an RMA record in the UI

| Field | Description |
|---|---|
| Test Case ID | TC-RMA-003 |
| Title | TASS can work an RMA record in the UI |
| Scenario ID | TS-004 |
| Requirement / Rule Ref | R-TASS, SI-17, WF-3 (DeliveryRecordWorkspace.tsx:93-100) |
| Role | TASS |
| Priority | Critical |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-RMA-001. |
| Test Data | None beyond preconditions |
| Steps | 1. Click sidebar "RMA"; click the D-RMA-01 row.<br>2. List the workspace tabs and any status or edit controls. |
| Expected Result | • TASS sees the record details and a way to update its status and add comments (business rule BR-TASS-01: "TASS works RMA records").<br>• Fail (confirms SI-17) if the workspace shows no tabs and no status control. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-RMA-004: TASS changes RMA status through the server rules

| Field | Description |
|---|---|
| Test Case ID | TC-RMA-004 |
| Title | TASS changes RMA status through the server rules |
| Scenario ID | TS-004 |
| Requirement / Rule Ref | R-TASS, T-07, T-16, WF-3 (records.ts:1124) |
| Role | TASS |
| Priority | High |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-RMA-001. |
| Test Data | None beyond preconditions |
| Steps | 1. In the TASS session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-RMA-01.id}/status` body `{"status":"On-Hold","remarks":"UAT TASS hold"}`<br>2. In the TASS session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-RMA-01.id}/status` body `{"status":"Scheduled","remarks":"UAT TASS release"}`<br>3. As Sales Coordinator open D-RMA-01 → "Remarks History". |
| Expected Result | • Both return 200 with `status` "On-Hold" then "Scheduled".<br>• Remarks History lists both remarks by "Ana Cruz". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-RMA-005: TASS cannot change status of non-RMA records it can read

| Field | Description |
|---|---|
| Test Case ID | TC-RMA-005 |
| Title | TASS cannot change status of non-RMA records it can read |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-TASS, BR-TASS (records.ts:1124) |
| Role | TASS |
| Priority | High |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-COL-001 (D-COL-01). |
| Test Data | None beyond preconditions |
| Steps | 1. In the TASS session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-COL-01.id}/status` body `{"status":"On-Hold","remarks":"UAT probe"}`<br>2. In the TASS session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-COL-01.id}` body `{"area":"Pasay","remarks":"UAT probe"}` |
| Expected Result | • Step 1: 403 "TASS status updates are limited to RMA records".<br>• Step 2: 403 (TASS write access is limited to RMA records). |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-RMA-006: TASS cannot assign drivers or vehicles

| Field | Description |
|---|---|
| Test Case ID | TC-RMA-006 |
| Title | TASS cannot assign drivers or vehicles |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-TASS, SI-14, BR-13 (records.ts:915-917, 934-973) |
| Role | TASS |
| Priority | High |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-RMA-001. Driver id of "Lando Navarro" (from Logistics `GET /api/drivers`). |
| Test Data | None beyond preconditions |
| Steps | 1. In the TASS session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-RMA-02.id}` body `{"driver_id":"<Lando id>","vehicle":"Van-01 (L300)","remarks":"UAT probe"}`<br>2. In the TASS session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-RMA-02.id}` |
| Expected Result | • Step 1: 403 (assigning drivers is Logistics/Admin only per the capability table).<br>• Step 2: `driver` empty and `vehicle` "(None)". Fail (SI-14) if Lando Navarro is assigned. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-RMA-007: Admin assigns a driver and starts an RMA run

| Field | Description |
|---|---|
| Test Case ID | TC-RMA-007 |
| Title | Admin assigns a driver and starts an RMA run |
| Scenario ID | TS-004 |
| Requirement / Rule Ref | R-ADM, T-05, OQ-01, WF-3 |
| Role | Admin |
| Priority | High |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Admin in its own browser context (session from TC-AUTH-004). Depends on TC-RMA-004. |
| Test Data | None beyond preconditions |
| Steps | 1. RMA → open D-RMA-01 → "Dispatch & Logistics": Driver "John Doe", remarks `UAT admin assign RMA`, "Save Changes".<br>2. Remarks `UAT admin time in RMA`, click "Record Time In". |
| Expected Result | • "Dispatch & Logistics changes saved"; then "Time In recorded".<br>• Status "In Transit". Record against OQ-01 that only Admin/Driver can start RMA runs. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-RMA-008: TASS cannot submit an RMA draft

| Field | Description |
|---|---|
| Test Case ID | TC-RMA-008 |
| Title | TASS cannot submit an RMA draft |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | T-03, SI-03 (records.ts:1125, 1143) |
| Role | TASS |
| Priority | Medium |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). As Sales Coordinator create D-RMA-03 with "Save as Draft" (company "Mang Inasal Philippines Inc.", reference `UAT-<RUN>-RMA-03`). |
| Test Data | None beyond preconditions |
| Steps | 1. In the TASS session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-RMA-03.id}/status` body `{"status":"Scheduled","remarks":"UAT probe"}`<br>2. In the TASS session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-RMA-03.id}` |
| Expected Result | • Step 1: 403 (only Sales Coordinator or Admin may submit drafts).<br>• Step 2: status "Draft". Fail (SI-03) if it became "Scheduled". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-RMA-009: Driver completes the RMA run

| Field | Description |
|---|---|
| Test Case ID | TC-RMA-009 |
| Title | Driver completes the RMA run |
| Scenario ID | TS-004 |
| Requirement / Rule Ref | T-09, R-DRV, WF-3 |
| Role | Driver |
| Priority | High |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Driver in its own browser context (session from TC-AUTH-005). Depends on TC-RMA-007. Fixture F-JPG. |
| Test Data | None beyond preconditions |
| Steps | 1. Find `UAT-<RUN>-RMA-01` on the Driver dashboard.<br>2. Upload F-JPG; "Received By *" `RMA Desk`; click "Accomplish"; confirm with `UAT RMA collected`. |
| Expected Result | Run listed under "Accomplished (N)"; Admin view of D-RMA-01 shows "Delivered". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |