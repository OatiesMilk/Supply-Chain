# Test Cases: Accounting Collection and Verification

| Document control | |
|---|---|
| Title | Test Cases: Accounting Collection and Verification |
| Document ID | QA-TC-COL |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Collection records use their own screens (`AccountingCollectionView` / `AccountingCollectionWorkspace`). In the UI "Collected" = Delivered and "Awaiting Collection" = Pending. Verification is TASS-only at the API (`records.ts:1197-1245`).

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

> **This whole file is DEFERRED in cycle 1** (user decision 2026-10-14: focus on Deliveries; see `../../00-discovery/open-questions.md`). Keep it for a later cycle; record every case as Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-COL-001](#tc-col-001-sales-coordinator-creates-an-accounting-collection) | Sales Coordinator creates an Accounting Collection | Sales Coordinator | Critical | Positive | TS-001 | Deferred |
| [TC-COL-002](#tc-col-002-collection-create-form-enforces-its-required-fields) | Collection create form enforces its required fields | Sales Coordinator | Medium | Negative | TS-011 | Deferred |
| [TC-COL-003](#tc-col-003-logistics-assigns-the-collection-to-john-doe-from-the-driver-board) | Logistics assigns the collection to John Doe from the Driver Board | Logistics | Critical | Positive | TS-001 | Deferred |
| [TC-COL-004](#tc-col-004-driver-collects-delivered-and-tass-is-notified) | Driver collects (Delivered) and TASS is notified | Driver | Critical | Positive | TS-001 | Deferred |
| [TC-COL-005](#tc-col-005-tass-verifies-the-collection-once) | TASS verifies the collection once | TASS | Critical | Positive | TS-001 | Deferred |
| [TC-COL-006](#tc-col-006-second-verification-is-refused-and-the-verification-is-audited) | Second verification is refused and the verification is audited | TASS | Medium | Negative | TS-001 | Deferred |
| [TC-COL-007](#tc-col-007-verification-tab-and-api-agree-on-who-may-verify) | Verification tab and API agree on who may verify | Admin | Low | Access Control | TS-010 | Deferred |
| [TC-COL-008](#tc-col-008-collection-documents-can-be-managed-in-the-documents-tab) | Collection documents can be managed in the Documents tab | Sales Coordinator | Low | Positive | TS-009 | Deferred |
| [TC-COL-009](#tc-col-009-verification-before-collection-is-refused) | Verification before collection is refused | TASS | High | Negative | TS-011 | Deferred |
| [TC-COL-010](#tc-col-010-verification-applies-only-to-collection-records) | Verification applies only to collection records | TASS | Medium | Negative | TS-011 | Deferred |
| [TC-COL-011](#tc-col-011-logistics-links-a-delivery-to-the-collection) | Logistics links a Delivery to the collection | Logistics | High | Positive | TS-001 | Deferred |
| [TC-COL-012](#tc-col-012-only-collection-records-can-be-linked) | Only collection records can be linked | Logistics | Medium | Negative | TS-011 | Deferred |
| [TC-COL-013](#tc-col-013-sales-coordinator-and-logistics-cannot-verify-collections) | Sales Coordinator and Logistics cannot verify collections | Sales Coordinator | Medium | Access Control | TS-010 | Deferred |

## Test cases

### TC-COL-001: Sales Coordinator creates an Accounting Collection

| Field | Description |
|---|---|
| Test Case ID | TC-COL-001 |
| Title | Sales Coordinator creates an Accounting Collection |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-SC, T-02, WF-2 (AccountingCollectionView.tsx:559-715) |
| Role | Sales Coordinator |
| Priority | Critical |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | D-COL-01, D-COL-02 |
| Steps | 1. Sidebar "Accounting Collection" → "New Record". Fill D-COL-01 from test-data.md §4 (Amount to Collect `25000.00`). Click "Submit". Record {D-COL-01.id}.<br>2. Repeat for D-COL-02. |
| Expected Result | • Toast "Collection submitted" twice.<br>• List shows both with Status "Scheduled" and Amount 25,000.00 / 5,000.00. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-002: Collection create form enforces its required fields

| Field | Description |
|---|---|
| Test Case ID | TC-COL-002 |
| Title | Collection create form enforces its required fields |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-01 (AccountingCollectionView.tsx:280-283) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | None beyond preconditions |
| Steps | 1. "New Record"; choose company "Jollibee Foods Corp. - Quezon City Cluster", reference `UAT-<RUN>-COL-NEG`; leave Area, Account Manager, Amount empty; click "Submit".<br>2. Click "Cancel". |
| Expected Result | "Account Manager is required", "Area is required", "Amount to Collect is required" are shown; nothing created. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-003: Logistics assigns the collection to John Doe from the Driver Board

| Field | Description |
|---|---|
| Test Case ID | TC-COL-003 |
| Title | Logistics assigns the collection to John Doe from the Driver Board |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-LOG, BR-13, WF-2 (DriverBoard.tsx:98-197) |
| Role | Logistics |
| Priority | Critical |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-COL-001. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Drivers" → tab "Board".<br>2. In column "Unassigned" find `UAT-<RUN>-COL-01`; click "Reassign".<br>3. In "Assign driver" choose "John Doe".<br>4. Click "Close". |
| Expected Result | • Message "Driver assigned successfully."<br>• The card moves to the John Doe column. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-004: Driver collects (Delivered) and TASS is notified

| Field | Description |
|---|---|
| Test Case ID | TC-COL-004 |
| Title | Driver collects (Delivered) and TASS is notified |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | T-05, T-09, R-DRV, WF-2 (records.ts:1185-1192) |
| Role | Driver |
| Priority | Critical |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Driver in its own browser context (session from TC-AUTH-005). Depends on TC-COL-003. Fixture F-JPG. |
| Test Data | None beyond preconditions |
| Steps | 1. Find `UAT-<RUN>-COL-01`; "Record Time In", confirm `UAT collect time in`.<br>2. Upload F-JPG; "Received By *" `Cashier Lim`; "Accomplish"; confirm `UAT collected 25000`.<br>3. As TASS open the bell (title "Notifications"). |
| Expected Result | • Run under "Accomplished (N)".<br>• TASS has notification "Collection ready for verification" mentioning `UAT-<RUN>-COL-01`.<br>• In the Accounting Collection list the status shows "Collected" (Delivered). |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-005: TASS verifies the collection once

| Field | Description |
|---|---|
| Test Case ID | TC-COL-005 |
| Title | TASS verifies the collection once |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-TASS, BR-19, WF-2, OQ-07 (AccountingCollectionWorkspace.tsx:398-453; records.ts:1197-1245) |
| Role | TASS |
| Priority | Critical |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-COL-004. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Accounting Collection" → click `UAT-<RUN>-COL-01`.<br>2. Open tab "Verification"; click "Verify Collection of ₱25,000.00" (or "Mark as Collection Verified").<br>3. As Sales Coordinator open the bell. |
| Expected Result | • Card shows "Collection Verified", "Verified by: Ana Cruz", "Verified at:" with current Manila time.<br>• The verify button is no longer offered.<br>• Sales Coordinator has notification "Collection verified". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-006: Second verification is refused and the verification is audited

| Field | Description |
|---|---|
| Test Case ID | TC-COL-006 |
| Title | Second verification is refused and the verification is audited |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | BR-19, SI-08 (records.ts:1212-1234) |
| Role | TASS |
| Priority | Medium |
| Type | Negative |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Depends on TC-COL-005. |
| Test Data | None beyond preconditions |
| Steps | 1. In the TASS session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-COL-01.id}/verify-collection`<br>2. Open D-COL-01 → tab "Audit Trail". |
| Expected Result | • Step 1: 400 "This collection has already been verified".<br>• Audit Trail contains an update by "Ana Cruz" for the verification. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-007: Verification tab and API agree on who may verify

| Field | Description |
|---|---|
| Test Case ID | TC-COL-007 |
| Title | Verification tab and API agree on who may verify |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-ADM, SI-23, BR-19 (AccountingCollectionWorkspace.tsx:370; records.ts:1197) |
| Role | Admin |
| Priority | Low |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Admin in its own browser context (session from TC-AUTH-004). Depends on TC-COL-004 and must run BEFORE TC-COL-005. |
| Test Data | None beyond preconditions |
| Steps | 1. Open D-COL-01 → tab "Verification"; read the text and controls. Do not click a verify button.<br>2. In the Admin session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-COL-01.id}/verify-collection` |
| Expected Result | • Step 2: 403 "Forbidden for this role" (TASS only).<br>• Step 1 must not tell Admin it can verify. Fail (SI-23) if the tab states "Verification requires TASS or Admin role." or shows a verify button to Admin. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-008: Collection documents can be managed in the Documents tab

| Field | Description |
|---|---|
| Test Case ID | TC-COL-008 |
| Title | Collection documents can be managed in the Documents tab |
| Scenario ID | TS-009 |
| Requirement / Rule Ref | SI-20, BR-15 (AccountingCollectionWorkspace.tsx:151-160, 758) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-COL-001. |
| Test Data | None beyond preconditions |
| Steps | 1. Open D-COL-02 → tab "Documents". |
| Expected Result | The tab lets the user upload and list documents. Fail (SI-20) if it shows "This section is under development…". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-009: Verification before collection is refused

| Field | Description |
|---|---|
| Test Case ID | TC-COL-009 |
| Title | Verification before collection is refused |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-19 (records.ts:1208-1210) |
| Role | TASS |
| Priority | High |
| Type | Negative |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-COL-001 (D-COL-02 Scheduled). |
| Test Data | None beyond preconditions |
| Steps | 1. Open D-COL-02 → "Verification".<br>2. In the TASS session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-COL-02.id}/verify-collection` |
| Expected Result | • Text "Verification is only available once a record is marked Collected."<br>• API 400 "Collection can only be verified after delivery is marked Accomplished". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-010: Verification applies only to collection records

| Field | Description |
|---|---|
| Test Case ID | TC-COL-010 |
| Title | Verification applies only to collection records |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-19 (records.ts:1204-1206) |
| Role | TASS |
| Priority | Medium |
| Type | Negative |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-RMA-001. |
| Test Data | None beyond preconditions |
| Steps | 1. In the TASS session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-RMA-01.id}/verify-collection` |
| Expected Result | 403 "Collection verification only applies to Accounting Collection records". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-011: Logistics links a Delivery to the collection

| Field | Description |
|---|---|
| Test Case ID | TC-COL-011 |
| Title | Logistics links a Delivery to the collection |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-LOG, BR-14, WF-2 (DeliveryRecordWorkspace.tsx:634-669; records.ts:960-973) |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-COL-001 and TC-DEL-011. |
| Test Data | None beyond preconditions |
| Steps | 1. Open D-DEL-01 → tab "Overview" → card "Linked Collection".<br>2. Type {D-COL-01.id} in "Collection Record ID", leave remarks empty, click "Link Collection".<br>3. Type remarks `UAT link collection`, click "Link Collection". |
| Expected Result | • Step 2: "A brief remark is required when linking a collection."<br>• Step 3: the card shows Collection ID {D-COL-01.id}, reference `UAT-<RUN>-COL-01`, company and status, with an "Unlink" button. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-012: Only collection records can be linked

| Field | Description |
|---|---|
| Test Case ID | TC-COL-012 |
| Title | Only collection records can be linked |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-14 (records.ts:965-971) |
| Role | Logistics |
| Priority | Medium |
| Type | Negative |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Depends on TC-DEL-010. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-05.id}` body `{"linked_collection_id":"{D-DEL-02.id}","remarks":"UAT probe"}` |
| Expected Result | 400 "Linked record must be an existing Accounting Collection record". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-COL-013: Sales Coordinator and Logistics cannot verify collections

| Field | Description |
|---|---|
| Test Case ID | TC-COL-013 |
| Title | Sales Coordinator and Logistics cannot verify collections |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | BR-19, R-SC, R-LOG (records.ts:1197) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). and Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-COL-001. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-COL-02.id}/verify-collection`<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-COL-02.id}/verify-collection`<br>3. As SC open D-COL-02 → "Verification" and read the text. |
| Expected Result | • Steps 1-2: 403 "Forbidden for this role".<br>• Step 3: a message that verification needs TASS; no verify button. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |