# Test Cases: Sales Orders and Bulk Actions

| Document control | |
|---|---|
| Title | Test Cases: Sales Orders and Bulk Actions |
| Document ID | QA-TC-SO |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Sales Orders are reached from sidebar "Sales Orders" (`Sidebar.tsx:343`). Bulk status/priority from the list is exercised here (`DeliveryRecordsView.tsx:909-962`).

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

> **This whole file is DEFERRED in cycle 1** (user decision 2026-10-14: focus on Deliveries; see `../../00-discovery/open-questions.md`). Keep it for a later cycle; record every case as Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-SO-001](#tc-so-001-sales-coordinator-creates-sales-orders) | Sales Coordinator creates Sales Orders | Sales Coordinator | High | Positive | TS-006 | Deferred |
| [TC-SO-002](#tc-so-002-logistics-bulk-sets-status-on-two-sales-orders) | Logistics bulk-sets status on two Sales Orders | Logistics | Medium | Positive | TS-006 | Deferred |
| [TC-SO-003](#tc-so-003-sales-coordinator-bulk-sets-priority) | Sales Coordinator bulk-sets priority | Sales Coordinator | Medium | Positive | TS-006 | Deferred |
| [TC-SO-004](#tc-so-004-bulk-status-reports-records-that-cannot-transition) | Bulk status reports records that cannot transition | Logistics | Low | Negative | TS-006 | Deferred |

## Test cases

### TC-SO-001: Sales Coordinator creates Sales Orders

| Field | Description |
|---|---|
| Test Case ID | TC-SO-001 |
| Title | Sales Coordinator creates Sales Orders |
| Scenario ID | TS-006 |
| Requirement / Rule Ref | R-SC, T-02, WF-5 |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: user decision 2026-10-14 to focus on Deliveries only (OQ-01, OQ-04). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). and Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | D-SO-01, D-SO-02, D-SO-03 |
| Steps | 1. Click sidebar "Sales Orders", then "New Record". Fill the D-SO-01 values from test-data.md §4 and click "Submit". Record the Record ID as {D-SO-01.id}.<br>2. Repeat for D-SO-02 and D-SO-03 (D-SO-03 Delivery Date `<TODAY+3>`).<br>3. Logistics: open D-SO-03 → "Dispatch & Logistics": Driver "John Doe", remarks `UAT future SO`, "Save Changes". |
| Expected Result | • Three records "Scheduled"; page subtitle "B2B merchant sales orders queued for fulfillment."<br>• D-SO-03 Driver "John Doe". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-SO-002: Logistics bulk-sets status on two Sales Orders

| Field | Description |
|---|---|
| Test Case ID | TC-SO-002 |
| Title | Logistics bulk-sets status on two Sales Orders |
| Scenario ID | TS-006 |
| Requirement / Rule Ref | R-LOG, T-07, BR-LIFE-08 |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: user decision 2026-10-14 to focus on Deliveries only (OQ-01, OQ-04). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-SO-001. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Sales Orders"; tick the row checkboxes of D-SO-01 and D-SO-02.<br>2. In "Set status:" choose "On-Hold"; leave "Set priority:" "Keep unchanged"; click "Apply".<br>3. Open D-SO-01 → "Remarks History". |
| Expected Result | • Banner "Status updated for 2 records."<br>• Both rows "On-Hold"; Remarks History has an automatically generated remark. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-SO-003: Sales Coordinator bulk-sets priority

| Field | Description |
|---|---|
| Test Case ID | TC-SO-003 |
| Title | Sales Coordinator bulk-sets priority |
| Scenario ID | TS-006 |
| Requirement / Rule Ref | R-SC, BR-07, BR-LIFE-08 |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: user decision 2026-10-14 to focus on Deliveries only (OQ-01, OQ-04). Codex: record Status "Not Run" with this reason and do not execute.** Depends on TC-SO-002. |
| Test Data | None beyond preconditions |
| Steps | 1. Sales Orders: tick D-SO-01 and D-SO-02; confirm "Set status:" is not offered to Sales Coordinator.<br>2. "Set priority:" "3 - High"; "Apply". |
| Expected Result | • No "Set status:" control for Sales Coordinator.<br>• Banner "Priority updated for 2 records."; both rows priority "3 - High". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-SO-004: Bulk status reports records that cannot transition

| Field | Description |
|---|---|
| Test Case ID | TC-SO-004 |
| Title | Bulk status reports records that cannot transition |
| Scenario ID | TS-006 |
| Requirement / Rule Ref | BR-LIFE-08, T-24 |
| Role | Logistics |
| Priority | Low |
| Type | Negative |
| Preconditions | **DEFERRED in this cycle: user decision 2026-10-14 to focus on Deliveries only (OQ-01, OQ-04). Codex: record Status "Not Run" with this reason and do not execute.** Depends on TC-SO-002 and TC-DRV-007 (seeded SO run Delivered). |
| Test Data | None beyond preconditions |
| Steps | 1. Sales Orders: tick D-SO-01 (On-Hold) and the seeded Delivered SO run; "Set status:" "Scheduled"; "Apply". |
| Expected Result | D-SO-01 becomes "Scheduled"; the Delivered run stays "Delivered"; the banner reports the failure (e.g. "1 records failed to update and remain selected for retry."). |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |