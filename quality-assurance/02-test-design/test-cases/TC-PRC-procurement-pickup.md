# Test Cases: Procurement Pick-up

| Document control | |
|---|---|
| Title | Test Cases: Procurement Pick-up |
| Document ID | QA-TC-PRC |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Procurement Pick-up follows the shared lifecycle. TASS holds the screen but not the records (SI-01).

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

> **This whole file is DEFERRED in cycle 1** (user decision 2026-10-14: focus on Deliveries; see `../../00-discovery/open-questions.md`). Keep it for a later cycle; record every case as Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-PRC-001](#tc-prc-001-sales-coordinator-creates-a-procurement-pick-up) | Sales Coordinator creates a Procurement Pick-up | Sales Coordinator | High | Positive | TS-005 | Deferred |
| [TC-PRC-002](#tc-prc-002-logistics-assigns-starts-and-completes-the-pick-up) | Logistics assigns, starts and completes the pick-up | Logistics | High | Positive | TS-005 | Deferred |
| [TC-PRC-003](#tc-prc-003-pick-ups-list-in-the-suppliers-module) | Pick-ups list in the Suppliers module | Sales Coordinator | Low | Positive | TS-005 | Deferred |
| [TC-PRC-006](#tc-prc-006-tass-sees-procurement-pick-up-records-it-is-granted) | TASS sees Procurement Pick-up records it is granted | TASS | Medium | Positive | TS-005 | Deferred |

## Test cases

### TC-PRC-001: Sales Coordinator creates a Procurement Pick-up

| Field | Description |
|---|---|
| Test Case ID | TC-PRC-001 |
| Title | Sales Coordinator creates a Procurement Pick-up |
| Scenario ID | TS-005 |
| Requirement / Rule Ref | R-SC, T-02, WF-4 |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: user decision 2026-10-14 to focus on Deliveries only (OQ-01, OQ-04). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | D-PRC-01 |
| Steps | 1. Click sidebar "Procurement Pick-up", then "New Record". Fill the D-PRC-01 values from test-data.md §4 and click "Submit". Record the Record ID as {D-PRC-01.id}.<br>2. Check the page title. |
| Expected Result | • "Record submitted"; status "Scheduled".<br>• Page title "Procurement Pick-up". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-PRC-002: Logistics assigns, starts and completes the pick-up

| Field | Description |
|---|---|
| Test Case ID | TC-PRC-002 |
| Title | Logistics assigns, starts and completes the pick-up |
| Scenario ID | TS-005 |
| Requirement / Rule Ref | R-LOG, T-05, T-09, WF-4 |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: user decision 2026-10-14 to focus on Deliveries only (OQ-01, OQ-04). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-PRC-001. Fixture F-PNG. |
| Test Data | None beyond preconditions |
| Steps | 1. Procurement Pick-up → open D-PRC-01 → "Dispatch & Logistics": Driver "Lando Navarro", remarks `UAT assign Lando`, "Save Changes".<br>2. Remarks `UAT pickup start`, "Record Time In".<br>3. "Select Photo / Document" F-PNG; "Received By *" `Warehouse Clerk`; click "Delivered"; remarks `UAT picked up`; "Save Changes". |
| Expected Result | • Each save succeeds; final status "Delivered" with Time Out set. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-PRC-003: Pick-ups list in the Suppliers module

| Field | Description |
|---|---|
| Test Case ID | TC-PRC-003 |
| Title | Pick-ups list in the Suppliers module |
| Scenario ID | TS-005 |
| Requirement / Rule Ref | WF-4, WF-8 (SupplierWorkspace.tsx) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: user decision 2026-10-14 to focus on Deliveries only (OQ-01, OQ-04). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-PRC-001. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Suppliers" → open any supplier → tab "Procurement Pick-ups (N)". |
| Expected Result | The tab opens and shows either linked pick-ups or "No procurement pick-ups linked to this supplier yet." without errors. Record which; the linking rule is not defined in code (informational). |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-PRC-006: TASS sees Procurement Pick-up records it is granted

| Field | Description |
|---|---|
| Test Case ID | TC-PRC-006 |
| Title | TASS sees Procurement Pick-up records it is granted |
| Scenario ID | TS-005 |
| Requirement / Rule Ref | R-TASS, SI-01 |
| Role | TASS |
| Priority | Medium |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: user decision 2026-10-14 to focus on Deliveries only (OQ-01, OQ-04). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-PRC-001. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Procurement Pick-up"; search `UAT-<RUN>-PRC-01`.<br>2. In the TASS session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-PRC-01.id}` |
| Expected Result | • The record is listed and opens. Fail (SI-01) if the list is empty.<br>• API returns 200 (Fail if 403 "Record access denied"). |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |