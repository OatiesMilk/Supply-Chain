# Test Cases: Deliveries Lifecycle

| Document control | |
|---|---|
| Title | Test Cases: Deliveries Lifecycle |
| Document ID | QA-TC-DEL |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Deliveries is the main end-to-end chain (TS-001) plus two Logistics-driven alternate chains (TS-002 chain A on D-DEL-02, TS-003 chain B on D-DEL-05) that together cover every status transition T-01..T-25 in `00-discovery/system-overview.md` §5. Run cases in the order given in `AGENTS.md` §6; each states its dependencies.

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-DEL-001](#tc-del-001-sales-coordinator-saves-a-delivery-as-draft) | Sales Coordinator saves a Delivery as Draft | Sales Coordinator | High | Positive | TS-007 | Run |
| [TC-DEL-002](#tc-del-002-sales-coordinator-submits-a-complete-delivery-start-of-the-main-chain) | Sales Coordinator submits a complete Delivery (start of the main chain) | Sales Coordinator | Critical | Positive | TS-001 | Run |
| [TC-DEL-003](#tc-del-003-create-form-rejects-missing-company-and-reference) | Create form rejects missing company and reference | Sales Coordinator | High | Negative | TS-011 | Run |
| [TC-DEL-004](#tc-del-004-delivery-date-is-presented-as-required-when-it-is-required-to-submit) | Delivery Date is presented as required when it is required to submit | Sales Coordinator | Low | Negative | TS-011 | Run |
| [TC-DEL-005](#tc-del-005-api-refuses-a-malformed-delivery-date-on-create) | API refuses a malformed Delivery Date on create | Sales Coordinator | Medium | Negative | TS-011 | Run |
| [TC-DEL-006](#tc-del-006-api-refuses-an-unknown-priority-on-create) | API refuses an unknown Priority on create | Sales Coordinator | Medium | Negative | TS-011 | Run |
| [TC-DEL-007](#tc-del-007-api-refuses-an-unknown-company-cleanly) | API refuses an unknown company cleanly | Sales Coordinator | Medium | Negative | TS-011 | Run |
| [TC-DEL-008](#tc-del-008-api-refuses-creating-a-record-directly-in-a-non-initial-status) | API refuses creating a record directly in a non-initial status | Sales Coordinator | Medium | Negative | TS-011 | Run |
| [TC-DEL-009](#tc-del-009-drivers-cannot-be-assigned-while-creating-a-record) | Drivers cannot be assigned while creating a record | Logistics | Medium | Negative | TS-011 | Run |
| [TC-DEL-010](#tc-del-010-logistics-creates-two-deliveries-for-the-alternate-chains) | Logistics creates two Deliveries for the alternate chains | Logistics | High | Positive | TS-002 | Run |
| [TC-DEL-011](#tc-del-011-logistics-assigns-driver-and-assistant-to-the-main-chain-delivery) | Logistics assigns driver and assistant to the main-chain Delivery | Logistics | Critical | Positive | TS-001 | Run |
| [TC-DEL-012](#tc-del-012-dispatch-changes-without-a-reason-are-refused) | Dispatch changes without a reason are refused | Logistics | Medium | Negative | TS-011 | Run |
| [TC-DEL-013](#tc-del-013-only-active-directory-entries-can-be-assigned) | Only active directory entries can be assigned | Logistics | Medium | Negative | TS-011 | Run |
| [TC-DEL-014](#tc-del-014-sales-coordinator-edits-a-record-remarks-are-mandatory-and-logged) | Sales Coordinator edits a record; remarks are mandatory and logged | Sales Coordinator | High | Positive | TS-001 | Run |
| [TC-DEL-015](#tc-del-015-a-draft-without-a-reference-cannot-be-submitted) | A Draft without a reference cannot be submitted | Sales Coordinator | High | Negative | TS-007 | Run |
| [TC-DEL-016](#tc-del-016-sales-coordinator-completes-and-submits-the-draft) | Sales Coordinator completes and submits the Draft | Sales Coordinator | High | Positive | TS-007 | Run |
| [TC-DEL-017](#tc-del-017-sales-coordinator-returns-a-scheduled-record-to-draft) | Sales Coordinator returns a Scheduled record to Draft | Sales Coordinator | High | Positive | TS-007 | Run |
| [TC-DEL-018](#tc-del-018-record-time-in-is-refused-when-its-preconditions-are-missing) | Record Time In is refused when its preconditions are missing | Logistics | High | Negative | TS-011 | Run |
| [TC-DEL-019](#tc-del-019-delivery-date-edits-are-validated) | Delivery Date edits are validated | Logistics | Medium | Boundary | TS-011 | Run |
| [TC-DEL-020](#tc-del-020-comments-are-added-to-the-record-timeline-empty-comments-are-refused) | Comments are added to the record timeline; empty comments are refused | Sales Coordinator | Medium | Boundary | TS-001 | Run |
| [TC-DEL-021](#tc-del-021-record-list-search-filters-and-filter-validation) | Record list search, filters and filter validation | Sales Coordinator | Medium | Boundary | TS-011 | Run |
| [TC-DEL-022](#tc-del-022-only-sales-coordinator-or-admin-can-submit-a-draft-status-route) | Only Sales Coordinator or Admin can submit a Draft (status route) | Logistics | High | Access Control | TS-010 | Run |
| [TC-DEL-023](#tc-del-023-logistics-cannot-return-a-record-to-draft) | Logistics cannot return a record to Draft | Logistics | Medium | Access Control | TS-010 | Run |
| [TC-DEL-024](#tc-del-024-records-cannot-be-deleted-even-by-sales-coordinator-api) | Records cannot be deleted, even by Sales Coordinator (API) | Sales Coordinator | High | Access Control | TS-007 | Run |
| [TC-DEL-025](#tc-del-025-no-delete-control-is-offered-for-records-in-the-ui) | No delete control is offered for records in the UI | Sales Coordinator | Low | Access Control | TS-007 | Run |
| [TC-DEL-026](#tc-del-026-logistics-cannot-delete-records) | Logistics cannot delete records | Logistics | Medium | Access Control | TS-010 | Run |
| [TC-DEL-027](#tc-del-027-admin-cannot-delete-records) | Admin cannot delete records | Admin | Low | Access Control | TS-010 | Run |
| [TC-DEL-028](#tc-del-028-timestamp-corrections-and-received-by-rules-on-completed-runs) | Timestamp corrections and Received By rules on completed runs | Logistics | Medium | Boundary | TS-002 | Run |
| [TC-DEL-029](#tc-del-029-logistics-bulk-sets-status-on-two-deliveries) | Logistics bulk-sets status on two Deliveries | Logistics | Medium | Positive | TS-006 | Run |
| [TC-DEL-030](#tc-del-030-chain-a-assign-driver-then-scheduled--on-hold) | Chain A: assign driver, then Scheduled → On-Hold | Logistics | High | Positive | TS-002 | Run |
| [TC-DEL-031](#tc-del-031-chain-a-on-hold--scheduled-same-status-is-refused) | Chain A: On-Hold → Scheduled; same status is refused | Logistics | Medium | Positive | TS-002 | Run |
| [TC-DEL-032](#tc-del-032-chain-a-scheduled--rescheduled-requires-a-new-future-different-date) | Chain A: Scheduled → Rescheduled requires a new, future, different date | Logistics | High | Boundary | TS-002 | Run |
| [TC-DEL-033](#tc-del-033-chain-a-rescheduled--on-hold) | Chain A: Rescheduled → On-Hold | Logistics | Medium | Positive | TS-002 | Run |
| [TC-DEL-034](#tc-del-034-chain-a-on-hold--rescheduled-back-to-today) | Chain A: On-Hold → Rescheduled back to today | Logistics | Medium | Positive | TS-002 | Run |
| [TC-DEL-035](#tc-del-035-chain-a-logistics-records-time-in-on-a-rescheduled-run) | Chain A: Logistics records Time In on a Rescheduled run | Logistics | High | Positive | TS-002 | Run |
| [TC-DEL-036](#tc-del-036-a-started-run-cannot-be-returned-to-draft) | A started run cannot be returned to Draft | Admin | Medium | Negative | TS-002 | Run |
| [TC-DEL-037](#tc-del-037-chain-a-in-transit--on-hold) | Chain A: In Transit → On-Hold | Logistics | Medium | Positive | TS-002 | Run |
| [TC-DEL-038](#tc-del-038-chain-a-completion-is-blocked-without-photo-and-received-by-then-succeeds-on-hold--delivered) | Chain A: completion is blocked without photo and Received By, then succeeds (On-Hold → Delivered) | Logistics | Critical | Negative | TS-002 | Run |
| [TC-DEL-039](#tc-del-039-delivered-is-terminal-and-priority-is-locked) | Delivered is terminal and priority is locked | Logistics | High | Negative | TS-002 | Run |
| [TC-DEL-040](#tc-del-040-chain-b-assign-manny-santos-and-record-time-in-from-scheduled) | Chain B: assign Manny Santos and record Time In from Scheduled | Logistics | High | Positive | TS-003 | Run |
| [TC-DEL-041](#tc-del-041-chain-b-duplicate-time-in-refused-in-transit--pending) | Chain B: duplicate Time In refused; In Transit → Pending | Logistics | Medium | Positive | TS-003 | Run |
| [TC-DEL-042](#tc-del-042-chain-b-pending--on-hold) | Chain B: Pending → On-Hold | Logistics | Medium | Positive | TS-003 | Run |
| [TC-DEL-043](#tc-del-043-chain-b-on-hold--pending-allowed-because-time-in-exists) | Chain B: On-Hold → Pending (allowed because Time In exists) | Logistics | Medium | Positive | TS-003 | Run |
| [TC-DEL-044](#tc-del-044-chain-b-pending--rescheduled-clears-time-in-time-out-and-received-by) | Chain B: Pending → Rescheduled clears Time In, Time Out and Received By | Logistics | High | Positive | TS-003 | Run |
| [TC-DEL-045](#tc-del-045-chain-b-rescheduled--scheduled) | Chain B: Rescheduled → Scheduled | Logistics | Medium | Positive | TS-003 | Run |
| [TC-DEL-046](#tc-del-046-chain-b-a-second-attempt-is-started-then-in-transit--rescheduled) | Chain B: a second attempt is started, then In Transit → Rescheduled | Logistics | Medium | Positive | TS-003 | Run |
| [TC-DEL-047](#tc-del-047-chain-b-sales-coordinator-returns-a-rescheduled-record-to-draft) | Chain B: Sales Coordinator returns a Rescheduled record to Draft | Sales Coordinator | Medium | Positive | TS-003 | Run |
| [TC-DEL-048](#tc-del-048-chain-b-on-hold--draft-by-sales-coordinator) | Chain B: On-Hold → Draft by Sales Coordinator | Sales Coordinator | Medium | Positive | TS-003 | Run |
| [TC-DEL-049](#tc-del-049-sales-coordinator-bulk-sets-priority-delivered-records-are-skipped) | Sales Coordinator bulk-sets priority; Delivered records are skipped | Sales Coordinator | Medium | Boundary | TS-006 | Run |

## Test cases

### TC-DEL-001: Sales Coordinator saves a Delivery as Draft

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-001 |
| Title | Sales Coordinator saves a Delivery as Draft |
| Scenario ID | TS-007 |
| Requirement / Rule Ref | R-SC, T-01, BR-02, WF-1 (records.ts:793-877) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | D-DEL-03 (test-data.md §4) |
| Steps | 1. Click sidebar "Deliveries", then "New Record".<br>2. In "Company Name *" type `Chowking` and choose "Chowking Foods Corp. - South Manila Area".<br>3. Leave "Reference (SAP Number) *" empty. Set "Area" to `Manila - Malate`.<br>4. Click "Save as Draft".<br>5. Note the Record ID shown in the green "Record Created" banner as {D-DEL-03.id}.<br>6. Clear filters and find the record in the list. |
| Expected Result | • Toast "Draft saved".<br>• Banner "Record Created" with a Record ID `REC-#####` and a "View record" button.<br>• List row status is "Draft"; Driver column shows "Unassigned". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Toast "Draft saved".; • Banner "Record Created" with a Record ID `REC-#####` and a "View record" button.; • List row status is "Draft"; Driver column shows "Unassigned". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-001-04-draft-created.png](../../artifacts/RUN-20261014-02/TC-DEL-001-04-draft-created.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-002: Sales Coordinator submits a complete Delivery (start of the main chain)

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-002 |
| Title | Sales Coordinator submits a complete Delivery (start of the main chain) |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-SC, T-02, BR-01, WF-1 (records.ts:793-877) |
| Role | Sales Coordinator |
| Priority | Critical |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | D-DEL-01 |
| Steps | 1. Click sidebar "Deliveries", then "New Record".<br>2. Fill: "Company Name *" = "Jollibee Foods Corp. - Quezon City Cluster"; "Priority *" = "2 - Moderate"; "Reference (SAP Number) *" = `UAT-<RUN>-DEL-01`; "Area" = `Quezon City - Diliman`; "Address (optional)" = `12 E. Rodriguez Jr. Ave`; "Account Manager" = `M. Reyes`; "Delivery Date" = `<TODAY>`; "Item Type" = "Small Item"; "Remarks" = `UAT main chain delivery`.<br>3. Click "+ Add Item"; set SKU `UTK-PRN-TH80`, quantity `2`.<br>4. Click "Submit".<br>5. Record the Record ID from the "Record Created" banner as {D-DEL-01.id}; click "View record".<br>6. Open tab "Remarks History" and tab "Audit Trail". |
| Expected Result | • Toast "Record submitted".<br>• Workspace shows status "Scheduled", priority "2 - Moderate", reference `UAT-<RUN>-DEL-01`, line item UTK-PRN-TH80 × 2.<br>• Remarks History shows "UAT main chain delivery" by Maria Reyes.<br>• Audit Trail shows one creation event by Maria Reyes. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Toast "Record submitted".; • Workspace shows status "Scheduled", priority "2 - Moderate", reference `UAT-<RUN>-DEL-01`, line item UTK-PRN-TH80 × 2.; • Remarks History shows "UAT main chain delivery" by Maria Reyes.; • Audit Trail shows one creation event by Maria Reyes. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-002-04-record-submitted.png](../../artifacts/RUN-20261014-02/TC-DEL-002-04-record-submitted.png); [TC-DEL-002-05-record-workspace.png](../../artifacts/RUN-20261014-02/TC-DEL-002-05-record-workspace.png); [TC-DEL-002-06-audit-trail.png](../../artifacts/RUN-20261014-02/TC-DEL-002-06-audit-trail.png); [TC-DEL-002-06-remarks-history.png](../../artifacts/RUN-20261014-02/TC-DEL-002-06-remarks-history.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-003: Create form rejects missing company and reference

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-003 |
| Title | Create form rejects missing company and reference |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-01, BR-02 (client/src/utils/recordLifecycle.ts:5-8) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | Reference `UAT-<RUN>-NEG-01` |
| Steps | 1. Deliveries → "New Record". Leave every field empty and click "Submit".<br>2. Click "Save as Draft" with every field empty.<br>3. Choose company "Mercury Drug Corporation - Head Office", leave Reference empty, set Delivery Date `<TODAY>`, click "Submit".<br>4. Click "Cancel". |
| Expected Result | • Step 1 shows "Company Name is required" (and no record is created).<br>• Step 2 shows "Company Name is required".<br>• Step 3 shows "Reference (SAP number) is required".<br>• The list contains no new record from this case. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1 shows "Company Name is required" (and no record is created).; • Step 2 shows "Company Name is required".; • Step 3 shows "Reference (SAP number) is required".; • The list contains no new record from this case. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-003-01-empty-submit.png](../../artifacts/RUN-20261014-02/TC-DEL-003-01-empty-submit.png); [TC-DEL-003-02-empty-draft.png](../../artifacts/RUN-20261014-02/TC-DEL-003-02-empty-draft.png); [TC-DEL-003-03-missing-reference.png](../../artifacts/RUN-20261014-02/TC-DEL-003-03-missing-reference.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-004: Delivery Date is presented as required when it is required to submit

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-004 |
| Title | Delivery Date is presented as required when it is required to submit |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-01, SI-21 (RecordCreateForm.tsx:496; recordLifecycle.ts:8) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | Company "Mercury Drug Corporation - Head Office", Reference `UAT-<RUN>-NEG-02`, no date |
| Steps | 1. Deliveries → "New Record". Read the label of the Delivery Date field.<br>2. Fill the test data (no Delivery Date) and click "Submit".<br>3. Click "Cancel". |
| Expected Result | • Step 2 shows "Delivery Date is required" and creates nothing.<br>• Step 1: the label marks the field as required (e.g. "Delivery Date *"). Fail (SI-21) if the label reads "Delivery Date (optional)". |
| Actual Result | RUN-20261014-02: The create form labeled Delivery Date optional, but Submit displayed Delivery Date is required. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-DEL-004-02-date-required-label-and-error.png](../../artifacts/RUN-20261014-02/TC-DEL-004-02-date-required-label-and-error.png) |
| Defect ID | RUN-20261014-02: DEF-005 |
### TC-DEL-005: API refuses a malformed Delivery Date on create

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-005 |
| Title | API refuses a malformed Delivery Date on create |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-01, BR-08, SI-04 (records.ts:818-858) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Company id of "Mercury Drug Corporation - Head Office" from `GET /api/companies`. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/records` body `{"company_id":"<Mercury id>","category":"Deliveries","reference":"UAT-<RUN>-NEG-03","delivery_date":"2026-13-45"}`<br>2. Search the Deliveries list for `UAT-<RUN>-NEG-03`. |
| Expected Result | • HTTP 400 with an error naming the Delivery Date (e.g. "Delivery Date must be a valid YYYY-MM-DD date.").<br>• No record `UAT-<RUN>-NEG-03` exists. Fail (SI-04) if 201 is returned. |
| Actual Result | RUN-20261014-02: The create API accepted a malformed Delivery Date on two attempts instead of rejecting it; no validation refusal was returned. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-DEL-005-02-invalid-date-no-record.png](../../artifacts/RUN-20261014-02/TC-DEL-005-02-invalid-date-no-record.png) |
| Defect ID | RUN-20261014-02: DEF-006 |
### TC-DEL-006: API refuses an unknown Priority on create

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-006 |
| Title | API refuses an unknown Priority on create |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-07, SI-04 (records.ts:827, 904-911) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | As TC-DEL-005. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/records` body `{"company_id":"<Mercury id>","category":"Deliveries","reference":"UAT-<RUN>-NEG-04","delivery_date":"<TODAY>","priority":"9 - Urgent"}` |
| Expected Result | HTTP 400 "Invalid record priority." and no record created. Fail (SI-04) if 201 with priority "9 - Urgent". |
| Actual Result | RUN-20261014-02: The create API accepted an unknown Priority value and created the record. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-DEL-006-01-invalid-priority-created.png](../../artifacts/RUN-20261014-02/TC-DEL-006-01-invalid-priority-created.png) |
| Defect ID | RUN-20261014-02: DEF-007 |
### TC-DEL-007: API refuses an unknown company cleanly

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-007 |
| Title | API refuses an unknown company cleanly |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-01, SI-04, SI-05 (records.ts:822-858) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/records` body `{"company_id":"does-not-exist","category":"Deliveries","reference":"UAT-<RUN>-NEG-05","delivery_date":"<TODAY>"}` with a 15-second timeout (`AbortSignal.timeout(15000)`). |
| Expected Result | Within 15 s an HTTP 4xx (400 or 404) naming the company. Fail if HTTP 500 "Internal server error" or no response within 15 s (record which). |
| Actual Result | RUN-20261014-02: Creating with an unknown company produced HTTP 500 instead of a clean 400 validation response. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: DEF-008 |
### TC-DEL-008: API refuses creating a record directly in a non-initial status

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-008 |
| Title | API refuses creating a record directly in a non-initial status |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-03 (records.ts:820) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | As TC-DEL-005. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/records` body `{"company_id":"<Mercury id>","category":"Deliveries","reference":"UAT-<RUN>-NEG-06","delivery_date":"<TODAY>","status":"Delivered"}` |
| Expected Result | HTTP 400 `{"error":"New records must be Draft or Scheduled."}`. |
| Actual Result | RUN-20261014-02: Observed the case expected result: HTTP 400 `{"error":"New records must be Draft or Scheduled."}`. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-009: Drivers cannot be assigned while creating a record

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-009 |
| Title | Drivers cannot be assigned while creating a record |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-04, R-LOG (records.ts:810-821) |
| Role | Logistics |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Company id of Mercury. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/records` body `{"company_id":"<Mercury id>","category":"Deliveries","reference":"UAT-<RUN>-NEG-07","delivery_date":"<TODAY>","driver":"Lando Navarro"}` |
| Expected Result | HTTP 400 `{"error":"Assign drivers after submitting the record."}`; no record created. |
| Actual Result | RUN-20261014-02: Observed the case expected result: HTTP 400 `{"error":"Assign drivers after submitting the record."}`; no record created. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-010: Logistics creates two Deliveries for the alternate chains

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-010 |
| Title | Logistics creates two Deliveries for the alternate chains |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | R-LOG, T-02, WF-1 |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | D-DEL-02, D-DEL-05 |
| Steps | 1. Deliveries → "New Record". Fill D-DEL-02 values from test-data.md §4 and click "Submit". Record {D-DEL-02.id}.<br>2. Repeat for D-DEL-05. Record {D-DEL-05.id}. |
| Expected Result | • Toast "Record submitted" twice.<br>• Both rows show status "Scheduled" and Driver "Unassigned". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Toast "Record submitted" twice.; • Both rows show status "Scheduled" and Driver "Unassigned". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-010-01-scheduled.png](../../artifacts/RUN-20261014-02/TC-DEL-010-01-scheduled.png); [TC-DEL-010-02-scheduled.png](../../artifacts/RUN-20261014-02/TC-DEL-010-02-scheduled.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-011: Logistics assigns driver and assistant to the main-chain Delivery

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-011 |
| Title | Logistics assigns driver and assistant to the main-chain Delivery |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-LOG, BR-13, WF-1 (records.ts:934-952, 1031-1036) |
| Role | Logistics |
| Priority | Critical |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-002. |
| Test Data | Driver "John Doe", assistant "Jayson Reyes", remarks `UAT assign John Doe` |
| Steps | 1. Click sidebar "Deliveries", type `UAT-<RUN>-DEL-01` in "Search records...", click the matching row to open the record workspace.<br>2. Open tab "Dispatch & Logistics". In "Driver & Delivery Details" choose "John Doe" in "Driver".<br>3. Click "+ Add Assistant" and choose "Jayson Reyes".<br>4. In "Change Reason / Remarks *" type the remarks; click "Save Changes".<br>5. Return to the Deliveries list. |
| Expected Result | • Toast "Dispatch & Logistics changes saved".<br>• The record shows Driver "John Doe" and assistant "Jayson Reyes"; status still "Scheduled".<br>• List row Driver column shows "John Doe". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Toast "Dispatch & Logistics changes saved".; • The record shows Driver "John Doe" and assistant "Jayson Reyes"; status still "Scheduled".; • List row Driver column shows "John Doe". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-011-04-dispatch-saved.png](../../artifacts/RUN-20261014-02/TC-DEL-011-04-dispatch-saved.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-012: Dispatch changes without a reason are refused

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-012 |
| Title | Dispatch changes without a reason are refused |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-05 (DeliveryRecordWorkspace.tsx:1243-1256; records.ts:921-923) |
| Role | Logistics |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-010. |
| Test Data | None beyond preconditions |
| Steps | 1. Click sidebar "Deliveries", type `UAT-<RUN>-DEL-02` in "Search records...", click the matching row to open the record workspace.<br>2. Tab "Dispatch & Logistics": choose Driver "Ronald de la Cruz", leave the remarks empty, click "Save Changes".<br>3. Click "Revert". |
| Expected Result | • Message "A reason is required when making changes to dispatch or status fields."<br>• D-DEL-02 driver remains "Unassigned" after reload. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Message "A reason is required when making changes to dispatch or status fields."; • D-DEL-02 driver remains "Unassigned" after reload. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-012-02-reason-required.png](../../artifacts/RUN-20261014-02/TC-DEL-012-02-reason-required.png); [TC-DEL-012-03-reverted.png](../../artifacts/RUN-20261014-02/TC-DEL-012-03-reverted.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-013: Only active directory entries can be assigned

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-013 |
| Title | Only active directory entries can be assigned |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-13 (services/driverDirectory.ts:119-165) |
| Role | Logistics |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-010. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-02.id}` body `{"driver_id":"not-a-profile","remarks":"UAT probe"}`<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-02.id}` body `{"driver":"Nobody Driver","remarks":"UAT probe"}`<br>3. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-02.id}` body `{"driver_assistants":["Ghost Assistant"],"remarks":"UAT probe"}` |
| Expected Result | • Step 1: 400 `{"error":"Choose a Driver from the directory."}`.<br>• Step 2: 400 `{"error":"Driver \"Nobody Driver\" is inactive or not in the directory. Choose an active entry."}`.<br>• Step 3: 400 `{"error":"Assistant \"Ghost Assistant\" is inactive or not in the directory. Choose an active entry."}`. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 400 `{"error":"Choose a Driver from the directory."}`.; • Step 2: 400 `{"error":"Driver \"Nobody Driver\" is inactive or not in the directory. Choose an active entry."}`.; • Step 3: 400 `{"error":"Assistant \"Ghost Assistant\" is inactive or not in the directory. Choose an active entry."}`. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-014: Sales Coordinator edits a record; remarks are mandatory and logged

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-014 |
| Title | Sales Coordinator edits a record; remarks are mandatory and logged |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-SC, BR-05, BR-07 (DeliveryRecordWorkspace.tsx:319-589; records.ts:921-923, 1048-1055) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-011. |
| Test Data | Priority "3 - High"; remarks `UAT raise priority` |
| Steps | 1. Click sidebar "Deliveries", type `UAT-<RUN>-DEL-01` in "Search records...", click the matching row to open the record workspace.<br>2. Tab "Overview": click "Edit", set "Priority" to "3 - High", leave "Remarks — reason for change *" empty, click "Save Changes".<br>3. Type the remarks and click "Save Changes".<br>4. Open "Remarks History" and "Audit Trail". |
| Expected Result | • Step 2 shows "Remarks are required to save changes." and nothing is saved.<br>• Step 3 toast "Record changes saved"; Overview shows priority "3 - High".<br>• Remarks History lists "UAT raise priority" by Maria Reyes; Audit Trail has a new update event by Maria Reyes. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 2 shows "Remarks are required to save changes." and nothing is saved.; • Step 3 toast "Record changes saved"; Overview shows priority "3 - High".; • Remarks History lists "UAT raise priority" by Maria Reyes; Audit Trail has a new update event by Maria Reyes. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-014-02-reason-required.png](../../artifacts/RUN-20261014-02/TC-DEL-014-02-reason-required.png); [TC-DEL-014-03-priority-updated.png](../../artifacts/RUN-20261014-02/TC-DEL-014-03-priority-updated.png); [TC-DEL-014-04-remarks-history.png](../../artifacts/RUN-20261014-02/TC-DEL-014-04-remarks-history.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-015: A Draft without a reference cannot be submitted

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-015 |
| Title | A Draft without a reference cannot be submitted |
| Scenario ID | TS-007 |
| Requirement / Rule Ref | T-03, BR-01 (records.ts:1028, 1146) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-001. |
| Test Data | None beyond preconditions |
| Steps | 1. Click sidebar "Deliveries", type `UAT-<RUN>-DEL-03` in "Search records...", click the matching row to open the record workspace. (search by Record ID {D-DEL-03.id} because it has no reference).<br>2. Tab "Overview": in "Remarks — reason for change (required)" type `UAT submit draft`, click "Submit". |
| Expected Result | • An error "Reference is required to submit the draft." is shown.<br>• Status remains "Draft". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • An error "Reference is required to submit the draft." is shown.; • Status remains "Draft". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-015-01-draft-workspace.png](../../artifacts/RUN-20261014-02/TC-DEL-015-01-draft-workspace.png); [TC-DEL-015-02-reference-required.png](../../artifacts/RUN-20261014-02/TC-DEL-015-02-reference-required.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-016: Sales Coordinator completes and submits the Draft

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-016 |
| Title | Sales Coordinator completes and submits the Draft |
| Scenario ID | TS-007 |
| Requirement / Rule Ref | R-SC, T-03, WF-1 (records.ts:1024-1030, 1176-1184) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | Depends on TC-DEL-015. |
| Test Data | Reference `UAT-<RUN>-DEL-03`, Delivery Date `<TODAY>` |
| Steps | 1. In D-DEL-03 click "Edit", set "Reference (SAP)" and "Delivery Date" to the test data, remarks `UAT add reference`, "Save Changes".<br>2. In "Remarks — reason for change (required)" type `UAT submit draft`, click "Submit". |
| Expected Result | • Toast "Record changes saved", then toast "Record submitted".<br>• Status "Scheduled".<br>• Logistics has a new bell notification "New DELIVERY record — driver needed" mentioning `UAT-<RUN>-DEL-03` (verify in TC-NOT-001). |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Toast "Record changes saved", then toast "Record submitted".; • Status "Scheduled".; • Logistics has a new bell notification "New DELIVERY record — driver needed" mentioning `UAT-<RUN>-DEL-03` (verify in TC-NOT-001). / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-016-01-edit-draft.png](../../artifacts/RUN-20261014-02/TC-DEL-016-01-edit-draft.png); [TC-DEL-016-02-reference-date-saved.png](../../artifacts/RUN-20261014-02/TC-DEL-016-02-reference-date-saved.png); [TC-DEL-016-03-record-submitted.png](../../artifacts/RUN-20261014-02/TC-DEL-016-03-record-submitted.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-017: Sales Coordinator returns a Scheduled record to Draft

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-017 |
| Title | Sales Coordinator returns a Scheduled record to Draft |
| Scenario ID | TS-007 |
| Requirement / Rule Ref | R-SC, T-04 (ReturnToDraftDialog.tsx; deliveryLifecycle.ts:79-80) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | Depends on TC-DEL-016. |
| Test Data | Reason `UAT return to draft` |
| Steps | 1. In D-DEL-03 tab "Overview" click "Return to Draft".<br>2. In dialog "Return this record to Draft?" type the reason in "Reason (required)" and click "Return to Draft". |
| Expected Result | • Toast "Record returned to Draft".<br>• Status "Draft"; Remarks History shows the reason. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Toast "Record returned to Draft".; • Status "Draft"; Remarks History shows the reason. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-017-01-return-dialog.png](../../artifacts/RUN-20261014-02/TC-DEL-017-01-return-dialog.png); [TC-DEL-017-02-return-reason.png](../../artifacts/RUN-20261014-02/TC-DEL-017-02-return-reason.png); [TC-DEL-017-03-returned-to-draft.png](../../artifacts/RUN-20261014-02/TC-DEL-017-03-returned-to-draft.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-018: Record Time In is refused when its preconditions are missing

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-018 |
| Title | Record Time In is refused when its preconditions are missing |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | T-25, BR-06 (deliveryLifecycle.ts:78, 84-90) |
| Role | Logistics |
| Priority | High |
| Type | Negative |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-017 (D-DEL-03 is Draft) and TC-DEL-010 (D-DEL-02 has no driver). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/records/{D-DEL-03.id}/time-in` body `{"remarks":"UAT probe"}`<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/records/{D-DEL-02.id}/time-in` body `{"remarks":"UAT probe"}`<br>3. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/records/{D-DEL-02.id}/time-in` body `{"remarks":""}`<br>4. In the Logistics session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-DEL-02.id}/status` body `{"status":"In Transit","remarks":"UAT probe"}`<br>5. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-02.id}` body `{"status":"Delivered","remarks":"UAT probe"}` |
| Expected Result | • Step 1: 400 "Submit the draft before recording Time In."<br>• Step 2: 400 "Assign a driver before recording Time In."<br>• Step 3: 400 "Remarks are required when recording Time In."<br>• Step 4: 400 "Use Record Time In to start this run."<br>• Step 5: 400 "Use the status action to change status." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 400 "Submit the draft before recording Time In."; • Step 2: 400 "Assign a driver before recording Time In."; • Step 3: 400 "Remarks are required when recording Time In."; • Step 4: 400 "Use Record Time In to start this run."; • Step 5: 400 "Use the status action to change status." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-019: Delivery Date edits are validated

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-019 |
| Title | Delivery Date edits are validated |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-08, R-LOG (records.ts:935-938, 1001-1003) |
| Role | Logistics |
| Priority | Medium |
| Type | Boundary |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-010. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-05.id}` body `{"delivery_date":"2026-02-30","remarks":"UAT probe"}`<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-05.id}` body `{"delivery_date":"<TODAY>"}` (no remarks)<br>3. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-05.id}` body `{"delivery_date":"<TODAY>","remarks":"UAT date confirm"}` |
| Expected Result | • Step 1: 400 "Delivery Date must be a valid YYYY-MM-DD date."<br>• Step 2: 400 "Remarks are required when editing a record."<br>• Step 3: 200 and `delivery_date` = `<TODAY>`. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 400 "Delivery Date must be a valid YYYY-MM-DD date."; • Step 2: 400 "Remarks are required when editing a record."; • Step 3: 200 and `delivery_date` = `<TODAY>`. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-020: Comments are added to the record timeline; empty comments are refused

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-020 |
| Title | Comments are added to the record timeline; empty comments are refused |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | BR-35, R-SC (records.ts:1288-1318; CommentComposer.tsx:66-86) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Boundary |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-002. |
| Test Data | Comment `UAT comment from Sales` |
| Steps | 1. Click sidebar "Deliveries", type `UAT-<RUN>-DEL-01` in "Search records...", click the matching row to open the record workspace.<br>2. Tab "Comments": type the comment in "Add to the discussion… (Ctrl+Enter to send)", click the button "Send comment".<br>3. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/records/{D-DEL-01.id}/comments` body `{"body":"   "}` |
| Expected Result | • The comment appears with author "Maria Reyes" and a timestamp.<br>• Step 3: 400 `{"error":"Comment body is required"}`. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • The comment appears with author "Maria Reyes" and a timestamp.; • Step 3: 400 `{"error":"Comment body is required"}`. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-020-02-comment-added.png](../../artifacts/RUN-20261014-02/TC-DEL-020-02-comment-added.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-021: Record list search, filters and filter validation

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-021 |
| Title | Record list search, filters and filter validation |
| Scenario ID | TS-011 |
| Requirement / Rule Ref | BR-33, R-SC (records.ts:175-289) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Boundary |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-001, TC-DEL-002. |
| Test Data | None beyond preconditions |
| Steps | 1. Deliveries: type `UAT-<RUN>-DEL-01` in "Search records...".<br>2. Clear search; click status chip "Draft".<br>3. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `GET /api/records?dateFrom=<TODAY+1>&dateTo=<TODAY>`<br>4. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `GET /api/records?search=` + 101 × "a"<br>5. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `GET /api/records?status=Lost` |
| Expected Result | • Step 1: exactly one row, `UAT-<RUN>-DEL-01`.<br>• Step 2: only Draft rows; D-DEL-03 included.<br>• Step 3: 400 "dateFrom cannot be after dateTo".<br>• Step 4: 400 "search query is too long".<br>• Step 5: 400 "status is invalid". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: exactly one row, `UAT-<RUN>-DEL-01`.; • Step 2: only Draft rows; D-DEL-03 included.; • Step 3: 400 "dateFrom cannot be after dateTo".; • Step 4: 400 "search query is too long".; • Step 5: 400 "status is invalid". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-021-01-reference-search.png](../../artifacts/RUN-20261014-02/TC-DEL-021-01-reference-search.png); [TC-DEL-021-02-draft-filter.png](../../artifacts/RUN-20261014-02/TC-DEL-021-02-draft-filter.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-022: Only Sales Coordinator or Admin can submit a Draft (status route)

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-022 |
| Title | Only Sales Coordinator or Admin can submit a Draft (status route) |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | T-03, SI-03, OQ-06, R-LOG (records.ts:902, 1025, 1125, 1143; deliveryLifecycle.ts:77-83) |
| Role | Logistics |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-018 (D-DEL-03 still Draft). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-03.id}` body `{"is_draft":"No","remarks":"UAT probe"}`<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-DEL-03.id}/status` body `{"status":"Scheduled","remarks":"UAT probe"}`<br>3. In the Logistics session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-DEL-03.id}` and read `status`. |
| Expected Result | • Step 1: 403 "Only Sales Coordinator or Admin may submit or return drafts."<br>• Step 2: 403 with the same rule (Logistics may not submit drafts).<br>• Step 3: status is still "Draft". Fail (SI-03) if step 2 returns 200 and the record becomes "Scheduled"; user decision on OQ-06: Logistics must not submit drafts. |
| Actual Result | RUN-20261014-02: Logistics changed a Draft to Scheduled through the status API; the request returned HTTP 200. Sales restored the record to Draft through the normal UI after the observation. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-DEL-022-04-restored-to-draft.png](../../artifacts/RUN-20261014-02/TC-DEL-022-04-restored-to-draft.png) |
| Defect ID | RUN-20261014-02: DEF-010 |
### TC-DEL-023: Logistics cannot return a record to Draft

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-023 |
| Title | Logistics cannot return a record to Draft |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | T-04, R-LOG (deliveryLifecycle.ts:79) |
| Role | Logistics |
| Priority | Medium |
| Type | Access Control |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). D-DEL-02 is Scheduled. |
| Test Data | None beyond preconditions |
| Steps | 1. Click sidebar "Deliveries", type `UAT-<RUN>-DEL-02` in "Search records...", click the matching row to open the record workspace. Open "Dispatch & Logistics" and read the "Status Update" buttons.<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-DEL-02.id}/status` body `{"status":"Draft","remarks":"UAT probe"}` |
| Expected Result | • Step 1: no "Return to Draft" button for Logistics.<br>• Step 2: 400 "Only Sales Coordinator or Admin may return a record to Draft." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: no "Return to Draft" button for Logistics.; • Step 2: 400 "Only Sales Coordinator or Admin may return a record to Draft." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-023-01-logistics-status-controls.png](../../artifacts/RUN-20261014-02/TC-DEL-023-01-logistics-status-controls.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-024: Records cannot be deleted, even by Sales Coordinator (API)

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-024 |
| Title | Records cannot be deleted, even by Sales Coordinator (API) |
| Scenario ID | TS-007 |
| Requirement / Rule Ref | BR-20, OQ-03, SI-26, R-SC (records.ts:1248-1268) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Create D-DEL-06 first: Deliveries → New Record → company "Greenwich Pizza Corp.", "Save as Draft"; record {D-DEL-06.id}. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `DELETE /api/records/{D-DEL-06.id}`<br>2. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-DEL-06.id}`<br>3. Search the Deliveries list for {D-DEL-06.id}. |
| Expected Result | • Step 1: refused with a 4xx (no record deletion is allowed: user decision on OQ-03, 2026-10-14).<br>• Step 2: 200; the record still exists.<br>• Step 3: the row is still listed.<br>• Fail (SI-26) if step 1 returns 200 `{"ok":true}` and the record disappears. |
| Actual Result | RUN-20261014-02: The refusal check instead deleted the test Draft. The record disappeared from the list; the case was not retried. This was the single authorized deletion probe, and no seeded record was targeted. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-DEL-024-01-new-draft-form.png](../../artifacts/RUN-20261014-02/TC-DEL-024-01-new-draft-form.png); [TC-DEL-024-02-company-selected.png](../../artifacts/RUN-20261014-02/TC-DEL-024-02-company-selected.png); [TC-DEL-024-03-delete-test-draft-created.png](../../artifacts/RUN-20261014-02/TC-DEL-024-03-delete-test-draft-created.png); [TC-DEL-024-04-deleted-record-not-listed.png](../../artifacts/RUN-20261014-02/TC-DEL-024-04-deleted-record-not-listed.png) |
| Defect ID | RUN-20261014-02: DEF-011 |
### TC-DEL-025: No delete control is offered for records in the UI

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-025 |
| Title | No delete control is offered for records in the UI |
| Scenario ID | TS-007 |
| Requirement / Rule Ref | BR-20, OQ-03, SI-24 (client/src/api/index.ts:542) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Access Control |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-017 (D-DEL-03 is Draft). |
| Test Data | None beyond preconditions |
| Steps | 1. Open D-DEL-03. Look in the workspace header, Overview tab and the list row for a delete action. Do not click anything destructive. |
| Expected Result | No delete control exists anywhere for records (matches the decision that records are not deleted). Fail if a delete control is offered; record its label. |
| Actual Result | RUN-20261014-02: Observed the case expected result: No delete control exists anywhere for records (matches the decision that records are not deleted). Fail if a delete control is offered; record its label. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-025-01-no-delete-control.png](../../artifacts/RUN-20261014-02/TC-DEL-025-01-no-delete-control.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-026: Logistics cannot delete records

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-026 |
| Title | Logistics cannot delete records |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | BR-20, R-LOG (records.ts:1248) |
| Role | Logistics |
| Priority | Medium |
| Type | Access Control |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `DELETE /api/records/{D-DEL-03.id}` |
| Expected Result | 403 `{"error":"Forbidden for this role"}`; D-DEL-03 still exists. |
| Actual Result | RUN-20261014-02: Observed the case expected result: 403 `{"error":"Forbidden for this role"}`; D-DEL-03 still exists. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-027: Admin cannot delete records

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-027 |
| Title | Admin cannot delete records |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | BR-20, R-ADM, OQ-03 (records.ts:1248) |
| Role | Admin |
| Priority | Low |
| Type | Access Control |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Admin session, send with the API helper (AGENTS.md §8): `DELETE /api/records/{D-DEL-03.id}` |
| Expected Result | 403 `{"error":"Forbidden for this role"}` (current code). Record OQ-03. |
| Actual Result | RUN-20261014-02: Observed the case expected result: 403 `{"error":"Forbidden for this role"}` (current code). Record OQ-03. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-028: Timestamp corrections and Received By rules on completed runs

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-028 |
| Title | Timestamp corrections and Received By rules on completed runs |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | BR-09, BR-10 (records.ts:896-900, 1038-1044) |
| Role | Logistics |
| Priority | Medium |
| Type | Boundary |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). and Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-038. Read `time_in` of D-DEL-02 via `GET /api/records/{D-DEL-02.id}`. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-02.id}` body `{"time_out":"<time_in minus 1 hour, ISO with Z>","remarks":"UAT probe"}`<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-02.id}` body `{"time_out":"2026-10-14 10:00","remarks":"UAT probe"}`<br>3. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-02.id}` body `{"time_in":"<time_in value>","remarks":"UAT probe"}`<br>4. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-02.id}` body `{"received_by":"","remarks":"UAT probe"}`<br>5. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-02.id}` body `{"time_out":"<time_in plus 30 minutes, ISO with Z>","remarks":"UAT correct time out"}` |
| Expected Result | • Step 1: 400 "Time Out must be after Time In."<br>• Step 2: 400 "Corrections require an existing timestamp and a full ISO timestamp with timezone. Use Record Time In to start the run."<br>• Step 3: 403 "Only Logistics or Admin may correct recorded timestamps."<br>• Step 4: 400 "Received By is required on completed runs."<br>• Step 5: 200; `time_out` equals the submitted instant; Remarks History has "UAT correct time out". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 400 "Time Out must be after Time In."; • Step 2: 400 "Corrections require an existing timestamp and a full ISO timestamp with timezone. Use Record Time In to start the run."; • Step 3: 403 "Only Logistics or Admin may correct recorded timestamps."; • Step 4: 400 "Received By is required on completed runs."; • Step 5: 200; `time_out` equals the submitted instant; Remarks History has "UAT correct time out". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-028-01-time-corrections.png](../../artifacts/RUN-20261014-02/TC-DEL-028-01-time-corrections.png); [TC-DEL-028-02-time-out-remark-history.png](../../artifacts/RUN-20261014-02/TC-DEL-028-02-time-out-remark-history.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-029: Logistics bulk-sets status on two Deliveries

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-029 |
| Title | Logistics bulk-sets status on two Deliveries |
| Scenario ID | TS-006 |
| Requirement / Rule Ref | R-LOG, T-07, BR-LIFE-08 (DeliveryRecordsView.tsx:909-962) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Create D-DEL-08 and D-DEL-09 first (Deliveries → New Record, values in test-data.md §4, "Submit"). |
| Test Data | D-DEL-08, D-DEL-09 |
| Steps | 1. Deliveries: tick the row checkboxes of `UAT-<RUN>-DEL-08` and `UAT-<RUN>-DEL-09`.<br>2. Open "Set status:" and read the options and the note under it.<br>3. Choose "On-Hold"; leave "Set priority:" "Keep unchanged"; click "Apply".<br>4. Open D-DEL-08 → "Remarks History". |
| Expected Result | • Step 2: options exclude In Transit, Delivered, Draft and Rescheduled; note "Reschedule deliveries one at a time to set each new date."<br>• Banner "Status updated for 2 records."; both rows "On-Hold".<br>• Remarks History has an automatically generated remark by Juan Santos. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 2: options exclude In Transit, Delivered, Draft and Rescheduled; note "Reschedule deliveries one at a time to set each new date."; • Banner "Status updated for 2 records."; both rows "On-Hold".; • Remarks History has an automatically generated remark by Juan Santos. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-029-01-d09-form.png](../../artifacts/RUN-20261014-02/TC-DEL-029-01-d09-form.png); [TC-DEL-029-01-record-08-created.png](../../artifacts/RUN-20261014-02/TC-DEL-029-01-record-08-created.png); [TC-DEL-029-02-d09-submitted.png](../../artifacts/RUN-20261014-02/TC-DEL-029-02-d09-submitted.png); [TC-DEL-029-03-bulk-options.png](../../artifacts/RUN-20261014-02/TC-DEL-029-03-bulk-options.png); [TC-DEL-029-04-status-hold.png](../../artifacts/RUN-20261014-02/TC-DEL-029-04-status-hold.png); [TC-DEL-029-05-d08-remarks-history.png](../../artifacts/RUN-20261014-02/TC-DEL-029-05-d08-remarks-history.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-030: Chain A: assign driver, then Scheduled → On-Hold

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-030 |
| Title | Chain A: assign driver, then Scheduled → On-Hold |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | T-07, BR-05, R-LOG (deliveryLifecycle.ts:51; records.ts:1109) |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-018. |
| Test Data | None beyond preconditions |
| Steps | 1. Click sidebar "Deliveries", type `UAT-<RUN>-DEL-02` in "Search records...", click the matching row to open the record workspace.<br>2. Tab "Dispatch & Logistics": Driver "Ronald de la Cruz", remarks `UAT assign Ronald`, "Save Changes".<br>3. In the Logistics session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-DEL-02.id}/status` body `{"status":"On-Hold","remarks":""}`<br>4. Open tab "Dispatch & Logistics". In the "Status Update" card click the button "On-Hold".<br>5. In "Change Reason / Remarks *" type `UAT hold A1`.<br>6. Click "Save Changes". |
| Expected Result | • Step 2 toast "Dispatch & Logistics changes saved".<br>• Step 3: 400 "Remarks are required when changing status."<br>• After step 6 status is "On-Hold". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 2 toast "Dispatch & Logistics changes saved".; • Step 3: 400 "Remarks are required when changing status."; • After step 6 status is "On-Hold". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-030-02-driver-assigned.png](../../artifacts/RUN-20261014-02/TC-DEL-030-02-driver-assigned.png); [TC-DEL-030-04-hold-reason.png](../../artifacts/RUN-20261014-02/TC-DEL-030-04-hold-reason.png); [TC-DEL-030-05-on-hold.png](../../artifacts/RUN-20261014-02/TC-DEL-030-05-on-hold.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-031: Chain A: On-Hold → Scheduled; same status is refused

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-031 |
| Title | Chain A: On-Hold → Scheduled; same status is refused |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | T-16 (deliveryLifecycle.ts:54; records.ts:1129) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-DEL-030. |
| Test Data | None beyond preconditions |
| Steps | 1. Open tab "Dispatch & Logistics". In the "Status Update" card click the button "Scheduled".<br>2. In "Change Reason / Remarks *" type `UAT release A1`.<br>3. Click "Save Changes".<br>4. In the Logistics session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-DEL-02.id}/status` body `{"status":"Scheduled","remarks":"UAT same"}` |
| Expected Result | • Status "Scheduled".<br>• Step 4: 400 "Choose a different status or priority before saving." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Status "Scheduled".; • Step 4: 400 "Choose a different status or priority before saving." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-031-01-scheduled-selected.png](../../artifacts/RUN-20261014-02/TC-DEL-031-01-scheduled-selected.png); [TC-DEL-031-02-scheduled-restored.png](../../artifacts/RUN-20261014-02/TC-DEL-031-02-scheduled-restored.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-032: Chain A: Scheduled → Rescheduled requires a new, future, different date

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-032 |
| Title | Chain A: Scheduled → Rescheduled requires a new, future, different date |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | T-08, BR-08 (records.ts:1131-1137, 1164) |
| Role | Logistics |
| Priority | High |
| Type | Boundary |
| Preconditions | Depends on TC-DEL-031. |
| Test Data | None beyond preconditions |
| Steps | 1. In "Status Update" click "Rescheduled"; leave "New delivery date *" empty; remarks `UAT resched`; "Save Changes".<br>2. Set "New delivery date *" to `<TODAY>` (same as current) and save.<br>3. In the Logistics session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-DEL-02.id}/status` body `{"status":"Rescheduled","remarks":"UAT past","delivery_date":"2020-01-01"}`<br>4. Set "New delivery date *" to `<TODAY+1>` and click "Save Changes". |
| Expected Result | • Step 1: "Enter the new delivery date." (UI) and nothing saved.<br>• Step 2: "The new delivery date must be different from the current delivery date."<br>• Step 3: 400 "The new delivery date cannot be in the past."<br>• Step 4: status "Rescheduled", Delivery Date `<TODAY+1>`. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: "Enter the new delivery date." (UI) and nothing saved.; • Step 2: "The new delivery date must be different from the current delivery date."; • Step 3: 400 "The new delivery date cannot be in the past."; • Step 4: status "Rescheduled", Delivery Date `<TODAY+1>`. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-032-01-reschedule-date-form.png](../../artifacts/RUN-20261014-02/TC-DEL-032-01-reschedule-date-form.png); [TC-DEL-032-03-same-date-rejected.png](../../artifacts/RUN-20261014-02/TC-DEL-032-03-same-date-rejected.png); [TC-DEL-032-04-rescheduled-tomorrow.png](../../artifacts/RUN-20261014-02/TC-DEL-032-04-rescheduled-tomorrow.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-033: Chain A: Rescheduled → On-Hold

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-033 |
| Title | Chain A: Rescheduled → On-Hold |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | T-22 |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-DEL-032. |
| Test Data | None beyond preconditions |
| Steps | 1. Open tab "Dispatch & Logistics". In the "Status Update" card click the button "On-Hold".<br>2. In "Change Reason / Remarks *" type `UAT hold A2`.<br>3. Click "Save Changes". |
| Expected Result | Status "On-Hold". |
| Actual Result | RUN-20261014-02: Observed the case expected result: Status "On-Hold". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-033-01-hold-selected.png](../../artifacts/RUN-20261014-02/TC-DEL-033-01-hold-selected.png); [TC-DEL-033-02-on-hold.png](../../artifacts/RUN-20261014-02/TC-DEL-033-02-on-hold.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-034: Chain A: On-Hold → Rescheduled back to today

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-034 |
| Title | Chain A: On-Hold → Rescheduled back to today |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | T-19 |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-DEL-033. |
| Test Data | None beyond preconditions |
| Steps | 1. Click "Rescheduled", set "New delivery date *" to `<TODAY>`, remarks `UAT resched A2`, "Save Changes". |
| Expected Result | Status "Rescheduled"; Delivery Date `<TODAY>`. |
| Actual Result | RUN-20261014-02: Observed the case expected result: Status "Rescheduled"; Delivery Date `<TODAY>`. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-034-01-reschedule-today.png](../../artifacts/RUN-20261014-02/TC-DEL-034-01-reschedule-today.png); [TC-DEL-034-02-rescheduled-today.png](../../artifacts/RUN-20261014-02/TC-DEL-034-02-rescheduled-today.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-035: Chain A: Logistics records Time In on a Rescheduled run

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-035 |
| Title | Chain A: Logistics records Time In on a Rescheduled run |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | T-06, R-LOG (records.ts:1080-1103; DeliveryRecordWorkspace.tsx:1011-1015) |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | Depends on TC-DEL-034. |
| Test Data | None beyond preconditions |
| Steps | 1. Tab "Dispatch & Logistics": confirm "Record Time In" is disabled while remarks are empty.<br>2. Type remarks `UAT time in A`, click "Record Time In". |
| Expected Result | • Toast "Time In recorded".<br>• Status "In Transit"; "Time In (Manila)" shows the current Manila time (±2 min).<br>• Remarks History shows "UAT time in A". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Toast "Time In recorded".; • Status "In Transit"; "Time In (Manila)" shows the current Manila time (±2 min).; • Remarks History shows "UAT time in A". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-035-01-time-in-disabled-empty.png](../../artifacts/RUN-20261014-02/TC-DEL-035-01-time-in-disabled-empty.png); [TC-DEL-035-02-time-in-recorded.png](../../artifacts/RUN-20261014-02/TC-DEL-035-02-time-in-recorded.png); [TC-DEL-035-03-remarks-history.png](../../artifacts/RUN-20261014-02/TC-DEL-035-03-remarks-history.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-036: A started run cannot be returned to Draft

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-036 |
| Title | A started run cannot be returned to Draft |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | T-04, BR-06 (deliveryLifecycle.ts:80) |
| Role | Admin |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). Depends on TC-DEL-035 (D-DEL-02 In Transit). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Admin session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-DEL-02.id}/status` body `{"status":"Draft","remarks":"UAT probe"}` |
| Expected Result | 400 "A started run cannot be returned to Draft." |
| Actual Result | RUN-20261014-02: Observed the case expected result: 400 "A started run cannot be returned to Draft." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-037: Chain A: In Transit → On-Hold

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-037 |
| Title | Chain A: In Transit → On-Hold |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | T-11 |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-DEL-036. |
| Test Data | None beyond preconditions |
| Steps | 1. Open tab "Dispatch & Logistics". In the "Status Update" card click the button "On-Hold".<br>2. In "Change Reason / Remarks *" type `UAT hold A3`.<br>3. Click "Save Changes". |
| Expected Result | Status "On-Hold"; Time In is still shown. |
| Actual Result | RUN-20261014-02: Observed the case expected result: Status "On-Hold"; Time In is still shown. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-037-01-on-hold-selected.png](../../artifacts/RUN-20261014-02/TC-DEL-037-01-on-hold-selected.png); [TC-DEL-037-02-on-hold.png](../../artifacts/RUN-20261014-02/TC-DEL-037-02-on-hold.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-038: Chain A: completion is blocked without photo and Received By, then succeeds (On-Hold → Delivered)

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-038 |
| Title | Chain A: completion is blocked without photo and Received By, then succeeds (On-Hold → Delivered) |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | T-17, BR-15, WF-1 (records.ts:1142-1163; podRequirement.ts:13-23) |
| Role | Logistics |
| Priority | Critical |
| Type | Negative |
| Preconditions | Depends on TC-DEL-037. Fixture files F-PDF and F-JPG (test-data.md §6). |
| Test Data | Received By `Liza Ramos` |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-DEL-02.id}/status` body `{"status":"Delivered","remarks":"UAT probe","received_by":"Liza Ramos"}`<br>2. Tab "Dispatch & Logistics": click "Delivered". Read the red messages; note whether "Save Changes" is enabled.<br>3. Click "Select Photo / Document", choose F-PDF; type remarks `UAT upload pdf`; "Save Changes". Click "Delivered" again and read the messages.<br>4. In the Logistics session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-DEL-02.id}/status` body `{"status":"Delivered","remarks":"UAT probe"}` (no received_by)<br>5. Click "Select Photo / Document", choose F-JPG; type "Received By *" `Liza Ramos`; click "Delivered"; remarks `UAT delivered A`; "Save Changes". |
| Expected Result | • Step 1: 400 "Upload at least one JPG or PNG delivery photo before marking this delivery Accomplished."<br>• Step 2: "Upload at least one JPG or PNG delivery photo before completing this delivery. Documents alone do not count." (and "Received By is required before completing this run.") with Save disabled.<br>• Step 3: the PDF is listed under "Saved Attachments" but the photo message remains.<br>• Step 4: 400 "Received By is required before completing this run."<br>• Step 5: status "Delivered"; "Time Out (Manila)" filled with the current time; Received By "Liza Ramos". |
| Actual Result | RUN-20261014-02: With only the PDF staged and no delivery photo or Received By value, the expected intermediate save could not be completed because Save Changes was disabled. The PDF and photo were persisted only with the later successful completion. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-DEL-038-02-delivery-blocked-no-photo.png](../../artifacts/RUN-20261014-02/TC-DEL-038-02-delivery-blocked-no-photo.png); [TC-DEL-038-03-pdf-staged.png](../../artifacts/RUN-20261014-02/TC-DEL-038-03-pdf-staged.png); [TC-DEL-038-05-photo-receiver-ready.png](../../artifacts/RUN-20261014-02/TC-DEL-038-05-photo-receiver-ready.png); [TC-DEL-038-06-delivered.png](../../artifacts/RUN-20261014-02/TC-DEL-038-06-delivered.png) |
| Defect ID | RUN-20261014-02: DEF-032 |
### TC-DEL-039: Delivered is terminal and priority is locked

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-039 |
| Title | Delivered is terminal and priority is locked |
| Scenario ID | TS-002 |
| Requirement / Rule Ref | T-24, BR-07 (deliveryLifecycle.ts:56; records.ts:22, 1023, 1128) |
| Role | Logistics |
| Priority | High |
| Type | Negative |
| Preconditions | Depends on TC-DEL-038. |
| Test Data | None beyond preconditions |
| Steps | 1. Tab "Dispatch & Logistics": read the "Status Update" buttons.<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `PATCH /api/records/{D-DEL-02.id}/status` body `{"status":"On-Hold","remarks":"UAT probe"}`<br>3. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-02.id}` body `{"priority":"1 - Low","remarks":"UAT probe"}`<br>4. Tab "Overview": click "Edit" and look at "Priority". |
| Expected Result | • Step 1: no status buttons are offered.<br>• Step 2: 400 "Cannot change Delivered to On-Hold."<br>• Step 3: 400 "Priority can't be changed after a record is Delivered."<br>• Step 4: priority cannot be changed; text "Priority is locked after delivery." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: no status buttons are offered.; • Step 2: 400 "Cannot change Delivered to On-Hold."; • Step 3: 400 "Priority can't be changed after a record is Delivered."; • Step 4: priority cannot be changed; text "Priority is locked after delivery." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-039-01-priority-locked.png](../../artifacts/RUN-20261014-02/TC-DEL-039-01-priority-locked.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-040: Chain B: assign Manny Santos and record Time In from Scheduled

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-040 |
| Title | Chain B: assign Manny Santos and record Time In from Scheduled |
| Scenario ID | TS-003 |
| Requirement / Rule Ref | T-05, R-LOG (deliveryLifecycle.ts:84-90) |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-019. |
| Test Data | None beyond preconditions |
| Steps | 1. Click sidebar "Deliveries", type `UAT-<RUN>-DEL-05` in "Search records...", click the matching row to open the record workspace.<br>2. Tab "Dispatch & Logistics": Driver "Manny Santos", remarks `UAT assign Manny`, "Save Changes".<br>3. Type remarks `UAT time in B1`, click "Record Time In". |
| Expected Result | • Driver "Manny Santos" saved.<br>• Status "In Transit"; Time In set. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Driver "Manny Santos" saved.; • Status "In Transit"; Time In set. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-040-02-manny-assigned.png](../../artifacts/RUN-20261014-02/TC-DEL-040-02-manny-assigned.png); [TC-DEL-040-03-time-in.png](../../artifacts/RUN-20261014-02/TC-DEL-040-03-time-in.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-041: Chain B: duplicate Time In refused; In Transit → Pending

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-041 |
| Title | Chain B: duplicate Time In refused; In Transit → Pending |
| Scenario ID | TS-003 |
| Requirement / Rule Ref | T-10, T-25 (deliveryLifecycle.ts:87; records.ts:1142) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-DEL-040. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/records/{D-DEL-05.id}/time-in` body `{"remarks":"UAT again"}`<br>2. Open tab "Dispatch & Logistics". In the "Status Update" card click the button "Pending".<br>3. In "Change Reason / Remarks *" type `UAT pending B1`.<br>4. Click "Save Changes". |
| Expected Result | • Step 1: 400 "Time In has already been recorded for this attempt."<br>• Status "Pending". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 400 "Time In has already been recorded for this attempt."; • Status "Pending". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-041-01-pending-selected.png](../../artifacts/RUN-20261014-02/TC-DEL-041-01-pending-selected.png); [TC-DEL-041-02-pending.png](../../artifacts/RUN-20261014-02/TC-DEL-041-02-pending.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-042: Chain B: Pending → On-Hold

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-042 |
| Title | Chain B: Pending → On-Hold |
| Scenario ID | TS-003 |
| Requirement / Rule Ref | T-14 |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-DEL-041. |
| Test Data | None beyond preconditions |
| Steps | 1. Open tab "Dispatch & Logistics". In the "Status Update" card click the button "On-Hold".<br>2. In "Change Reason / Remarks *" type `UAT hold B1`.<br>3. Click "Save Changes". |
| Expected Result | Status "On-Hold". |
| Actual Result | RUN-20261014-02: Observed the case expected result: Status "On-Hold". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-042-01-on-hold.png](../../artifacts/RUN-20261014-02/TC-DEL-042-01-on-hold.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-043: Chain B: On-Hold → Pending (allowed because Time In exists)

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-043 |
| Title | Chain B: On-Hold → Pending (allowed because Time In exists) |
| Scenario ID | TS-003 |
| Requirement / Rule Ref | T-18 (deliveryLifecycle.ts:70-76) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-DEL-042. |
| Test Data | None beyond preconditions |
| Steps | 1. In "Status Update" read the offered buttons.<br>2. Open tab "Dispatch & Logistics". In the "Status Update" card click the button "Pending".<br>3. In "Change Reason / Remarks *" type `UAT pending B2`.<br>4. Click "Save Changes". |
| Expected Result | • Offered: Delivered, Pending, Rescheduled (no "Scheduled", because Time In exists).<br>• Status "Pending". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Offered: Delivered, Pending, Rescheduled (no "Scheduled", because Time In exists).; • Status "Pending". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-043-02-pending.png](../../artifacts/RUN-20261014-02/TC-DEL-043-02-pending.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-044: Chain B: Pending → Rescheduled clears Time In, Time Out and Received By

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-044 |
| Title | Chain B: Pending → Rescheduled clears Time In, Time Out and Received By |
| Scenario ID | TS-003 |
| Requirement / Rule Ref | T-15, BR-06 (records.ts:1164) |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | Depends on TC-DEL-043. |
| Test Data | None beyond preconditions |
| Steps | 1. Click "Rescheduled", "New delivery date *" `<TODAY+1>`, remarks `UAT resched B1`, "Save Changes".<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-DEL-05.id}` |
| Expected Result | • Status "Rescheduled"; Delivery Date `<TODAY+1>`.<br>• API: `time_in`, `time_out`, `received_by` are all null. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Status "Rescheduled"; Delivery Date `<TODAY+1>`.; • API: `time_in`, `time_out`, `received_by` are all null. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-044-01-reschedule-next-day.png](../../artifacts/RUN-20261014-02/TC-DEL-044-01-reschedule-next-day.png); [TC-DEL-044-02-rescheduled-reset.png](../../artifacts/RUN-20261014-02/TC-DEL-044-02-rescheduled-reset.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-045: Chain B: Rescheduled → Scheduled

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-045 |
| Title | Chain B: Rescheduled → Scheduled |
| Scenario ID | TS-003 |
| Requirement / Rule Ref | T-21 |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-DEL-044. |
| Test Data | None beyond preconditions |
| Steps | 1. Open tab "Dispatch & Logistics". In the "Status Update" card click the button "Scheduled".<br>2. In "Change Reason / Remarks *" type `UAT back to scheduled B`.<br>3. Click "Save Changes". |
| Expected Result | Status "Scheduled". |
| Actual Result | RUN-20261014-02: Observed the case expected result: Status "Scheduled". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-045-01-scheduled.png](../../artifacts/RUN-20261014-02/TC-DEL-045-01-scheduled.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-046: Chain B: a second attempt is started, then In Transit → Rescheduled

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-046 |
| Title | Chain B: a second attempt is started, then In Transit → Rescheduled |
| Scenario ID | TS-003 |
| Requirement / Rule Ref | T-05, T-12 |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-DEL-045. |
| Test Data | None beyond preconditions |
| Steps | 1. Remarks `UAT time in B2`, click "Record Time In".<br>2. Click "Rescheduled", "New delivery date *" `<TODAY>`, remarks `UAT resched B2`, "Save Changes". |
| Expected Result | • After step 1 status "In Transit".<br>• After step 2 status "Rescheduled", Delivery Date `<TODAY>`, Time In empty. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • After step 1 status "In Transit".; • After step 2 status "Rescheduled", Delivery Date `<TODAY>`, Time In empty. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-046-01-time-in-b2.png](../../artifacts/RUN-20261014-02/TC-DEL-046-01-time-in-b2.png); [TC-DEL-046-02-rescheduled-today.png](../../artifacts/RUN-20261014-02/TC-DEL-046-02-rescheduled-today.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-047: Chain B: Sales Coordinator returns a Rescheduled record to Draft

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-047 |
| Title | Chain B: Sales Coordinator returns a Rescheduled record to Draft |
| Scenario ID | TS-003 |
| Requirement / Rule Ref | T-23, R-SC |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-046. |
| Test Data | None beyond preconditions |
| Steps | 1. Click sidebar "Deliveries", type `UAT-<RUN>-DEL-05` in "Search records...", click the matching row to open the record workspace.<br>2. Overview → "Return to Draft" → reason `UAT draft B` → "Return to Draft". |
| Expected Result | • Toast "Record returned to Draft"; status "Draft".<br>• Driver "Manny Santos" is retained (drafts retain assignments). |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Toast "Record returned to Draft"; status "Draft".; • Driver "Manny Santos" is retained (drafts retain assignments). / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-047-01-returned-draft-manny-retained.png](../../artifacts/RUN-20261014-02/TC-DEL-047-01-returned-draft-manny-retained.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-048: Chain B: On-Hold → Draft by Sales Coordinator

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-048 |
| Title | Chain B: On-Hold → Draft by Sales Coordinator |
| Scenario ID | TS-003 |
| Requirement / Rule Ref | T-03, T-07, T-20 |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). and Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-047. |
| Test Data | None beyond preconditions |
| Steps | 1. SC: in D-DEL-05 Overview type `UAT resubmit B`, click "Submit".<br>2. Logistics: open D-DEL-05 → "Dispatch & Logistics" → "On-Hold", remarks `UAT hold B2`, "Save Changes".<br>3. SC: reload D-DEL-05 → Overview → "Return to Draft", reason `UAT draft from hold`, confirm. |
| Expected Result | • Step 1: "Record submitted"; Scheduled.<br>• Step 2: On-Hold.<br>• Step 3: "Record returned to Draft"; status Draft. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: "Record submitted"; Scheduled.; • Step 2: On-Hold.; • Step 3: "Record returned to Draft"; status Draft. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-048-01-resubmitted.png](../../artifacts/RUN-20261014-02/TC-DEL-048-01-resubmitted.png); [TC-DEL-048-02-on-hold.png](../../artifacts/RUN-20261014-02/TC-DEL-048-02-on-hold.png); [TC-DEL-048-03-returned-draft.png](../../artifacts/RUN-20261014-02/TC-DEL-048-03-returned-draft.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DEL-049: Sales Coordinator bulk-sets priority; Delivered records are skipped

| Field | Description |
|---|---|
| Test Case ID | TC-DEL-049 |
| Title | Sales Coordinator bulk-sets priority; Delivered records are skipped |
| Scenario ID | TS-006 |
| Requirement / Rule Ref | R-SC, BR-07, BR-LIFE-08, T-24 (DeliveryRecordsView.tsx:414-483) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Boundary |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-029 and TC-DEL-038 (D-DEL-02 Delivered). |
| Test Data | None beyond preconditions |
| Steps | 1. Deliveries: tick D-DEL-08 and D-DEL-09; confirm no "Set status:" control is offered to Sales Coordinator.<br>2. "Set priority:" "3 - High"; "Apply".<br>3. Tick D-DEL-02 (Delivered) and D-DEL-08; read "Set priority:"; choose "1 - Low" if offered; "Apply". |
| Expected Result | • No "Set status:" for Sales Coordinator.<br>• Banner "Priority updated for 2 records."; both rows priority "3 - High".<br>• D-DEL-02 priority is unchanged (locked after delivery); the banner reports that it was not updated (or the priority control is disabled because a Delivered record is selected). |
| Actual Result | RUN-20261014-02: Observed the case expected result: • No "Set status:" for Sales Coordinator.; • Banner "Priority updated for 2 records."; both rows priority "3 - High".; • D-DEL-02 priority is unchanged (locked after delivery); the banner reports that it was not updated (or the priority control is disabled because a Delivered record is selected). / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DEL-049-01-sales-bulk-controls.png](../../artifacts/RUN-20261014-02/TC-DEL-049-01-sales-bulk-controls.png); [TC-DEL-049-02-priority-high.png](../../artifacts/RUN-20261014-02/TC-DEL-049-02-priority-high.png); [TC-DEL-049-03-d08-priority.png](../../artifacts/RUN-20261014-02/TC-DEL-049-03-d08-priority.png); [TC-DEL-049-04-delivered-selected.png](../../artifacts/RUN-20261014-02/TC-DEL-049-04-delivered-selected.png); [TC-DEL-049-05-delivered-skip-result.png](../../artifacts/RUN-20261014-02/TC-DEL-049-05-delivered-skip-result.png); [TC-DEL-049-06-d08-low.png](../../artifacts/RUN-20261014-02/TC-DEL-049-06-d08-low.png); [TC-DEL-049-07-d02-unchanged.png](../../artifacts/RUN-20261014-02/TC-DEL-049-07-d02-unchanged.png) |
| Defect ID | RUN-20261014-02: — |