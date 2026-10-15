# Test Cases: Driver Field App

| Document control | |
|---|---|
| Title | Test Cases: Driver Field App |
| Document ID | QA-TC-DRV |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Driver execution on the mobile dashboard ("Microgenesis Field Mobile"). Use a mobile viewport. The Driver has no On-Hold action (by design, `DriverDashboard.tsx:320-342`). Driver-date rules depend on the Manila date: run these on the seed day.

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-DRV-001](#tc-drv-001-assigned-run-appears-on-the-driver-dashboard) | Assigned run appears on the Driver dashboard | Driver | Critical | Positive | TS-001 | Run |
| [TC-DRV-002](#tc-drv-002-time-in-needs-remarks-and-starts-the-run) | Time In needs remarks and starts the run | Driver | Critical | Positive | TS-001 | Run |
| [TC-DRV-003](#tc-drv-003-a-document-alone-does-not-unlock-completion) | A document alone does not unlock completion | Driver | High | Negative | TS-009 | Run |
| [TC-DRV-004](#tc-drv-004-driver-completes-the-main-chain-run-with-photo-and-received-by) | Driver completes the main-chain run with photo and Received By | Driver | Critical | Positive | TS-001 | Run |
| [TC-DRV-005](#tc-drv-005-accomplished-run-details-show-proof-and-timestamps) | Accomplished run details show proof and timestamps | Driver | Medium | Positive | TS-001 | Run |
| [TC-DRV-006](#tc-drv-006-driver-marks-a-seeded-delivery-run-pending) | Driver marks a seeded Delivery run Pending | Driver | High | Positive | TS-008 | Run |
| [TC-DRV-007](#tc-drv-007-driver-completes-the-pending-run-pending--delivered) | Driver completes the Pending run (Pending → Delivered) | Driver | High | Positive | TS-008 | Run |
| [TC-DRV-008](#tc-drv-008-driver-reschedules-a-started-rma-run) | Driver reschedules a started RMA run | Driver | Medium | Positive | TS-004 | Deferred |
| [TC-DRV-009](#tc-drv-009-future-dated-delivery-is-read-only-for-the-driver) | Future-dated Delivery is read-only for the Driver | Driver | High | Negative | TS-008 | Run |
| [TC-DRV-010](#tc-drv-010-future-dated-non-delivery-run-is-also-read-only-for-the-driver) | Future-dated non-Delivery run is also read-only for the Driver | Driver | Low | Negative | TS-008 | Deferred |
| [TC-DRV-011](#tc-drv-011-driver-cannot-change-priority-or-other-metadata) | Driver cannot change priority or other metadata | Driver | Medium | Access Control | TS-010 | Run |
| [TC-DRV-012](#tc-drv-012-driver-signs-out) | Driver signs out | Driver | Medium | Positive | TS-017 | Run |

## Test cases

### TC-DRV-001: Assigned run appears on the Driver dashboard

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-001 |
| Title | Assigned run appears on the Driver dashboard |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-DRV, BR-11, WF-6 (recordAccess.ts:26-33) |
| Role | Driver |
| Priority | Critical |
| Type | Positive |
| Preconditions | Signed in as Driver in its own browser context (session from TC-AUTH-005). Depends on TC-DEL-014. |
| Test Data | None beyond preconditions |
| Steps | 1. Reload the Driver dashboard.<br>2. On the Driver dashboard find the run card whose reference is `UAT-<RUN>-DEL-01`.<br>3. Read the card contents and the "Accomplish" button state. |
| Expected Result | • The run card shows reference `UAT-<RUN>-DEL-01`, company "Jollibee Foods Corp. - Quezon City Cluster" and status SCHEDULED.<br>• "Record Time In" is enabled; "Accomplish" is disabled with text "Record Time In before completing this run." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • The run card shows reference `UAT-<RUN>-DEL-01`, company "Jollibee Foods Corp. - Quezon City Cluster" and status SCHEDULED.; • "Record Time In" is enabled; "Accomplish" is disabled with text "Record Time In before completing this run." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DRV-001-01-assigned-run.png](../../artifacts/RUN-20261014-02/TC-DRV-001-01-assigned-run.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-002: Time In needs remarks and starts the run

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-002 |
| Title | Time In needs remarks and starts the run |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | T-05, R-DRV, WF-6 (records.ts:1080-1103; DriverDashboard.tsx:277-282, 467-553) |
| Role | Driver |
| Priority | Critical |
| Type | Positive |
| Preconditions | Depends on TC-DRV-001. |
| Test Data | None beyond preconditions |
| Steps | 1. On the Driver dashboard find the run card whose reference is `UAT-<RUN>-DEL-01`.<br>2. Click "Record Time In".<br>3. With remarks empty, check whether "Confirm" is enabled.<br>4. In the "Confirm Status" modal type `UAT driver time in` in "Remarks — reason for change (required)".<br>5. Click "Confirm". |
| Expected Result | • Step 3: "Confirm" is disabled.<br>• Toast "Status updated successfully".<br>• The card shows "Time In recorded: HH:MM" (current Manila time) and status IN TRANSIT. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 3: "Confirm" is disabled.; • Toast "Status updated successfully".; • The card shows "Time In recorded: HH:MM" (current Manila time) and status IN TRANSIT. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DRV-002-02-empty-confirm.png](../../artifacts/RUN-20261014-02/TC-DRV-002-02-empty-confirm.png); [TC-DRV-002-03-confirm-with-remarks.png](../../artifacts/RUN-20261014-02/TC-DRV-002-03-confirm-with-remarks.png); [TC-DRV-002-04-time-in-recorded.png](../../artifacts/RUN-20261014-02/TC-DRV-002-04-time-in-recorded.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-003: A document alone does not unlock completion

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-003 |
| Title | A document alone does not unlock completion |
| Scenario ID | TS-009 |
| Requirement / Rule Ref | BR-15, WF-6 (podPhotos.ts:7; podRequirement.ts:13-23) |
| Role | Driver |
| Priority | High |
| Type | Negative |
| Preconditions | Depends on TC-DRV-002. Fixture F-PDF. |
| Test Data | None beyond preconditions |
| Steps | 1. On the Driver dashboard find the run card whose reference is `UAT-<RUN>-DEL-01`.<br>2. Click "Select Photo / Document" and choose F-PDF.<br>3. Type `Pedro Penduko` in "Received By *".<br>4. Read the text under the card and the "Accomplish" state. |
| Expected Result | • F-PDF is listed under "Staged for Upload".<br>• "Accomplish" stays disabled with "Upload at least one JPG or PNG delivery photo before completing this delivery. Documents alone do not count." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • F-PDF is listed under "Staged for Upload".; • "Accomplish" stays disabled with "Upload at least one JPG or PNG delivery photo before completing this delivery. Documents alone do not count." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DRV-003-02-document-staged.png](../../artifacts/RUN-20261014-02/TC-DRV-003-02-document-staged.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-004: Driver completes the main-chain run with photo and Received By

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-004 |
| Title | Driver completes the main-chain run with photo and Received By |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | T-09, BR-15, R-DRV, WF-1, WF-6 (records.ts:1151-1163, 1185-1190) |
| Role | Driver |
| Priority | Critical |
| Type | Positive |
| Preconditions | Depends on TC-DRV-003. Fixture F-JPG. |
| Test Data | Received By `Pedro Penduko` |
| Steps | 1. On the Driver dashboard find the run card whose reference is `UAT-<RUN>-DEL-01`.<br>2. Click "Select Photo / Document" and choose F-JPG.<br>3. Ensure "Received By *" is `Pedro Penduko`.<br>4. Click "Accomplish".<br>5. In the "Confirm Status" modal type `UAT delivered main chain` in "Remarks — reason for change (required)".<br>6. Click "Confirm". |
| Expected Result | • Toast "Status updated successfully".<br>• The run moves into "Accomplished (N)" with badge "Done" and "In: / Out:" times; "Accomplished" tile increases by 1.<br>• Logistics/SC view of D-DEL-01 shows status "Delivered", Received By "Pedro Penduko", Time Out set; Documents tab lists F-PDF and F-JPG. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Toast "Status updated successfully".; • The run moves into "Accomplished (N)" with badge "Done" and "In: / Out:" times; "Accomplished" tile increases by 1.; • Logistics/SC view of D-DEL-01 shows status "Delivered", Received By "Pedro Penduko", Time Out set; Documents tab lists F-PDF and F-JPG. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DRV-004-02-photo-staged.png](../../artifacts/RUN-20261014-02/TC-DRV-004-02-photo-staged.png); [TC-DRV-004-03-confirm-delivery.png](../../artifacts/RUN-20261014-02/TC-DRV-004-03-confirm-delivery.png); [TC-DRV-004-04-accomplished.png](../../artifacts/RUN-20261014-02/TC-DRV-004-04-accomplished.png); [TC-DRV-004-05-accomplished-section.png](../../artifacts/RUN-20261014-02/TC-DRV-004-05-accomplished-section.png); [TC-DRV-004-06-logistics-deliveries.png](../../artifacts/RUN-20261014-02/TC-DRV-004-06-logistics-deliveries.png); [TC-DRV-004-07-logistics-search.png](../../artifacts/RUN-20261014-02/TC-DRV-004-07-logistics-search.png); [TC-DRV-004-08-logistics-record.png](../../artifacts/RUN-20261014-02/TC-DRV-004-08-logistics-record.png); [TC-DRV-004-09-logistics-documents.png](../../artifacts/RUN-20261014-02/TC-DRV-004-09-logistics-documents.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-005: Accomplished run details show proof and timestamps

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-005 |
| Title | Accomplished run details show proof and timestamps |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | WF-6, R-DRV (DoneRecordModal.tsx:33-81) |
| Role | Driver |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-DRV-004. |
| Test Data | None beyond preconditions |
| Steps | 1. In "Accomplished (N)" click the `UAT-<RUN>-DEL-01` row.<br>2. Read the modal; click the close button (aria-label "Close details"). |
| Expected Result | Modal "Accomplished Run Details" shows "Time in:", "Time out:", "Received by: Pedro Penduko", the remarks, and under "Proof of Delivery (POD)" the photo F-JPG (and F-PDF). |
| Actual Result | RUN-20261014-02: Observed the case expected result: Modal "Accomplished Run Details" shows "Time in:", "Time out:", "Received by: Pedro Penduko", the remarks, and under "Proof of Delivery (POD)" the photo F-JPG (and F-PDF). / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DRV-005-01-details-modal.png](../../artifacts/RUN-20261014-02/TC-DRV-005-01-details-modal.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-006: Driver marks a seeded Delivery run Pending

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-006 |
| Title | Driver marks a seeded Delivery run Pending |
| Scenario ID | TS-008 |
| Requirement / Rule Ref | T-05, T-10, R-DRV |
| Role | Driver |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Driver in its own browser context (session from TC-AUTH-005). Seeded Delivery run D-SEED-DEL (reference `SAP-DEMO-<hash>` with no category suffix) exists. |
| Test Data | None beyond preconditions |
| Steps | 1. On the Driver dashboard find the run card whose reference is `SAP-DEMO-<hash> (D-SEED-DEL)`.<br>2. Click "Record Time In"; confirm with remarks `UAT seed time in`.<br>3. Click "Pending"; confirm with remarks `UAT seed pending`. |
| Expected Result | • After step 2 the card shows "Time In recorded".<br>• After step 3 status PENDING; toast "Status updated successfully". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • After step 2 the card shows "Time In recorded".; • After step 3 status PENDING; toast "Status updated successfully". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DRV-006-01-time-in-confirm.png](../../artifacts/RUN-20261014-02/TC-DRV-006-01-time-in-confirm.png); [TC-DRV-006-02-time-in.png](../../artifacts/RUN-20261014-02/TC-DRV-006-02-time-in.png); [TC-DRV-006-03-pending-confirm.png](../../artifacts/RUN-20261014-02/TC-DRV-006-03-pending-confirm.png); [TC-DRV-006-04-pending.png](../../artifacts/RUN-20261014-02/TC-DRV-006-04-pending.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-007: Driver completes the Pending run (Pending → Delivered)

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-007 |
| Title | Driver completes the Pending run (Pending → Delivered) |
| Scenario ID | TS-008 |
| Requirement / Rule Ref | T-13, R-DRV |
| Role | Driver |
| Priority | High |
| Type | Positive |
| Preconditions | Depends on TC-DRV-006. Fixture F-PNG. |
| Test Data | Received By `Ana Lopez` |
| Steps | 1. On the Driver dashboard find the run card whose reference is `SAP-DEMO-<hash> (D-SEED-DEL)`.<br>2. Upload F-PNG via "Select Photo / Document"; "Received By *" `Ana Lopez`.<br>3. Click "Accomplish"; confirm with remarks `UAT seed done`. |
| Expected Result | Run appears in "Accomplished (N)" with "Done". |
| Actual Result | RUN-20261014-02: Observed the case expected result: Run appears in "Accomplished (N)" with "Done". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DRV-007-01-pending-run-ready.png](../../artifacts/RUN-20261014-02/TC-DRV-007-01-pending-run-ready.png); [TC-DRV-007-02-completion-confirm.png](../../artifacts/RUN-20261014-02/TC-DRV-007-02-completion-confirm.png); [TC-DRV-007-03-accomplished.png](../../artifacts/RUN-20261014-02/TC-DRV-007-03-accomplished.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-008: Driver reschedules a started RMA run

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-008 |
| Title | Driver reschedules a started RMA run |
| Scenario ID | TS-004 |
| Requirement / Rule Ref | T-12, R-DRV, WF-3 (records.ts:1131, 1164) |
| Role | Driver |
| Priority | Medium |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Driver in its own browser context (session from TC-AUTH-005). Seeded run `SAP-DEMO-…-RMA` (D-SEED-RMA). |
| Test Data | None beyond preconditions |
| Steps | 1. On the Driver dashboard find the run card whose reference is `SAP-DEMO-…-RMA`.<br>2. Click "Record Time In"; confirm with `UAT RMA time in`.<br>3. Click "Reschedule"; confirm with `UAT RMA customer absent`.<br>4. In the Driver session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-SEED-RMA.id}` |
| Expected Result | • Status RESCHEDULED; toast "Status updated successfully".<br>• API: `status` "Rescheduled", `time_in` null, `delivery_date` unchanged (Drivers are not asked for a new date). |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-009: Future-dated Delivery is read-only for the Driver

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-009 |
| Title | Future-dated Delivery is read-only for the Driver |
| Scenario ID | TS-008 |
| Requirement / Rule Ref | BR-12, R-DRV (deliveryLifecycle.ts:40-46; DriverDashboard.tsx:422-448) |
| Role | Driver |
| Priority | High |
| Type | Negative |
| Preconditions | Signed in as Driver in its own browser context (session from TC-AUTH-005). Depends on TC-DIR-015 (D-DEL-04 dated `<TODAY+3>` assigned to John Doe). |
| Test Data | None beyond preconditions |
| Steps | 1. Reload; scroll to "Upcoming / Other Dates".<br>2. Find `UAT-<RUN>-DEL-04`; look for action buttons.<br>3. In the Driver session, send with the API helper (AGENTS.md §8): `POST /api/records/{D-DEL-04.id}/time-in` body `{"remarks":"UAT early"}`<br>4. In the Driver session, send with the API helper (AGENTS.md §8): `POST /api/records/{D-DEL-04.id}/comments` body `{"body":"UAT early comment"}` |
| Expected Result | • The run is listed with badge "Upcoming · read-only" and has no action buttons.<br>• Step 3: 400 "This delivery is scheduled for a future date and is read-only until that date."<br>• Step 4: 400 with the same message. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • The run is listed with badge "Upcoming · read-only" and has no action buttons.; • Step 3: 400 "This delivery is scheduled for a future date and is read-only until that date."; • Step 4: 400 with the same message. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DRV-009-01-upcoming-read-only.png](../../artifacts/RUN-20261014-02/TC-DRV-009-01-upcoming-read-only.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-010: Future-dated non-Delivery run is also read-only for the Driver

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-010 |
| Title | Future-dated non-Delivery run is also read-only for the Driver |
| Scenario ID | TS-008 |
| Requirement / Rule Ref | OQ-04, BR-12 (deliveryLifecycle.ts:41) |
| Role | Driver |
| Priority | Low |
| Type | Negative |
| Preconditions | **DEFERRED in this cycle: user decision 2026-10-14 to focus on Deliveries only (OQ-01, OQ-04). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Driver in its own browser context (session from TC-AUTH-005). Depends on TC-SO-001 (D-SO-03 dated `<TODAY+3>` assigned to John Doe in that case). |
| Test Data | None beyond preconditions |
| Steps | 1. Reload; find `UAT-<RUN>-SO-03` under "Upcoming / Other Dates".<br>2. In the Driver session, send with the API helper (AGENTS.md §8): `POST /api/records/{D-SO-03.id}/time-in` body `{"remarks":"UAT early SO"}` |
| Expected Result | • The run shows a read-only badge and no buttons.<br>• Step 2: 400 (read-only until its date). Record the actual response against OQ-04; current code is expected to return 200 and start the run. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-011: Driver cannot change priority or other metadata

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-011 |
| Title | Driver cannot change priority or other metadata |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-DRV, BR-07, BR-11 (records.ts:904-907, 928-933) |
| Role | Driver |
| Priority | Medium |
| Type | Access Control |
| Preconditions | Signed in as Driver in its own browser context (session from TC-AUTH-005). Seeded Delivery run D-SEED-DEL. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Driver session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-SEED-DEL.id}` body `{"priority":"3 - High","remarks":"UAT probe"}`<br>2. In the Driver session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-SEED-DEL.id}` body `{"reference":"HACKED","remarks":"UAT probe"}`<br>3. In the Driver session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-SEED-DEL.id}` |
| Expected Result | • Step 1: 403 "Your role cannot change record priority."<br>• Step 2: 200 or 4xx, but step 3 shows `reference` unchanged (not "HACKED"). |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 403 "Your role cannot change record priority."; • Step 2: 200 or 4xx, but step 3 shows `reference` unchanged (not "HACKED"). / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DRV-012: Driver signs out

| Field | Description |
|---|---|
| Test Case ID | TC-DRV-012 |
| Title | Driver signs out |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | AUTH-3, R-DRV (DriverDashboard.tsx:155) |
| Role | Driver |
| Priority | Medium |
| Type | Positive |
| Preconditions | A fresh Driver context (not the saved session). |
| Test Data | None beyond preconditions |
| Steps | 1. Click "Log Out". |
| Expected Result | URL `/login`; the field dashboard is no longer shown. |
| Actual Result | RUN-20261014-02: Observed the case expected result: URL `/login`; the field dashboard is no longer shown. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DRV-012-01-before-signout.png](../../artifacts/RUN-20261014-02/TC-DRV-012-01-before-signout.png); [TC-DRV-012-02-signed-out.png](../../artifacts/RUN-20261014-02/TC-DRV-012-02-signed-out.png) |
| Defect ID | RUN-20261014-02: — |