# Test Cases: Transaction Center

| Document control | |
|---|---|
| Title | Test Cases: Transaction Center |
| Document ID | QA-TC-TXN |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Merged view of record events and stock movements with role category limits (`server/src/services/transactionAccess.ts:7-14`).

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-TXN-001](#tc-txn-001-sales-coordinator-sees-only-its-delivery-categories) | Sales Coordinator sees only its delivery categories | Sales Coordinator | Medium | Access Control | TS-014 | Run |
| [TC-TXN-002](#tc-txn-002-inventory-movements-appear-for-admin) | Inventory movements appear for Admin | Admin | Medium | Positive | TS-014 | Run |
| [TC-TXN-003](#tc-txn-003-record-detail-shows-the-audit-timeline) | Record detail shows the audit timeline | Sales Coordinator | Medium | Positive | TS-001 | Run |
| [TC-TXN-004](#tc-txn-004-tass-sees-the-categories-it-works) | TASS sees the categories it works | TASS | Low | Positive | TS-014 | Deferred |
| [TC-TXN-005](#tc-txn-005-driver-transaction-api-is-limited-to-own-runs-and-no-inventory) | Driver Transaction API is limited to own runs and no inventory | Driver | Medium | Access Control | TS-010 | Run |
| [TC-TXN-006](#tc-txn-006-status-filter-matches-the-displayed-state) | Status filter matches the displayed state | Sales Coordinator | Low | Negative | TS-014 | Run |

## Test cases

### TC-TXN-001: Sales Coordinator sees only its delivery categories

| Field | Description |
|---|---|
| Test Case ID | TC-TXN-001 |
| Title | Sales Coordinator sees only its delivery categories |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | R-SC (transactionAccess.ts:11) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Access Control |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-002. Seeded RMA and Accounting Collection demo runs exist. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Transaction Center"; read the "Category" options.<br>2. Source "Delivery Records"; "Apply Filters"; scan Type / Category values. |
| Expected Result | • Categories offered: Deliveries, Procurement Pick-up, Sales Orders only.<br>• No RMA or Accounting Collection rows (the seeded `SAP-DEMO-…-RMA` and `SAP-DEMO-…-ACCOUNTING_COLLECTION` runs are absent). |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Categories offered: Deliveries, Procurement Pick-up, Sales Orders only.; • No RMA or Accounting Collection rows (the seeded `SAP-DEMO-…-RMA` and `SAP-DEMO-…-ACCOUNTING_COLLECTION` runs are absent). / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-TXN-001-01-delivery-category-filter.png](../../artifacts/RUN-20261014-02/TC-TXN-001-01-delivery-category-filter.png) |
| Defect ID | RUN-20261014-02: — |
### TC-TXN-002: Inventory movements appear for Admin

| Field | Description |
|---|---|
| Test Case ID | TC-TXN-002 |
| Title | Inventory movements appear for Admin |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | R-ADM |
| Role | Admin |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). Depends on TC-SKU-006. |
| Test Data | None beyond preconditions |
| Steps | 1. Transaction Center: Source "Inventory Movements"; "Apply Filters".<br>2. Click the `GRN-UAT-<RUN>-01` row. |
| Expected Result | • Row with Source "INVENTORY", reference `GRN-UAT-<RUN>-01`, description "+50 units → balance: 50".<br>• Detail shows Qty Change 50, Resulting Balance 50 and "Other Recent Transactions — Same Product". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Row with Source "INVENTORY", reference `GRN-UAT-<RUN>-01`, description "+50 units → balance: 50".; • Detail shows Qty Change 50, Resulting Balance 50 and "Other Recent Transactions — Same Product". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-TXN-002-01-inventory-movements.png](../../artifacts/RUN-20261014-02/TC-TXN-002-01-inventory-movements.png); [TC-TXN-002-02-inventory-detail.png](../../artifacts/RUN-20261014-02/TC-TXN-002-02-inventory-detail.png) |
| Defect ID | RUN-20261014-02: — |
### TC-TXN-003: Record detail shows the audit timeline

| Field | Description |
|---|---|
| Test Case ID | TC-TXN-003 |
| Title | Record detail shows the audit timeline |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | WF-1, R-SC (transactions.ts:148-220) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DRV-004. |
| Test Data | None beyond preconditions |
| Steps | 1. Transaction Center: search/filter to `UAT-<RUN>-DEL-01`; click it.<br>2. Read "Audit Timeline". |
| Expected Result | "N events — oldest first" including "Record Created", "Driver assigned: John Doe", and status changes ending with a Delivered/ACCOMPLISHED status, each "by {user}". |
| Actual Result | RUN-20261014-02: Observed the case expected result: "N events — oldest first" including "Record Created", "Driver assigned: John Doe", and status changes ending with a Delivered/ACCOMPLISHED status, each "by {user}". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-TXN-003-01-transaction-center.png](../../artifacts/RUN-20261014-02/TC-TXN-003-01-transaction-center.png); [TC-TXN-003-02-audit-timeline.png](../../artifacts/RUN-20261014-02/TC-TXN-003-02-audit-timeline.png) |
| Defect ID | RUN-20261014-02: — |
### TC-TXN-004: TASS sees the categories it works

| Field | Description |
|---|---|
| Test Case ID | TC-TXN-004 |
| Title | TASS sees the categories it works |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | R-TASS, OQ-02 (transactionAccess.ts:13) |
| Role | TASS |
| Priority | Low |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: TASS responsibilities are not yet defined (OQ-02, OQ-07; user decision 2026-10-14). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-RMA-001, TC-COL-001. |
| Test Data | None beyond preconditions |
| Steps | 1. Transaction Center: "Apply Filters" with defaults. |
| Expected Result | `UAT-<RUN>-COL-01` is listed. Record whether `UAT-<RUN>-RMA-01` is listed (current code: absent). Outcome decided by OQ-02. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-TXN-005: Driver Transaction API is limited to own runs and no inventory

| Field | Description |
|---|---|
| Test Case ID | TC-TXN-005 |
| Title | Driver Transaction API is limited to own runs and no inventory |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-DRV, BR-11 (transactionAccess.ts:22-40; transactions.ts:40-42) |
| Role | Driver |
| Priority | Medium |
| Type | Access Control |
| Preconditions | Signed in as Driver in its own browser context (session from TC-AUTH-005). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Driver session, send with the API helper (AGENTS.md §8): `GET /api/transactions?source=delivery&limit=100`<br>2. In the Driver session, send with the API helper (AGENTS.md §8): `GET /api/transactions?source=inventory` |
| Expected Result | • Step 1: 200; every row is a John Doe run (no `UAT-<RUN>-DEL-02`/`-05`).<br>• Step 2: 403 "Inventory access denied". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 200; every row is a John Doe run (no `UAT-<RUN>-DEL-02`/`-05`).; • Step 2: 403 "Inventory access denied". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-TXN-006: Status filter matches the displayed state

| Field | Description |
|---|---|
| Test Case ID | TC-TXN-006 |
| Title | Status filter matches the displayed state |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | SI-16 (transactions.ts:54) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-017 (D-DEL-03 is Draft). |
| Test Data | None beyond preconditions |
| Steps | 1. Transaction Center: Status "Scheduled"; "Apply Filters"; look for `UAT-<RUN>-DEL-03`. |
| Expected Result | The Draft record D-DEL-03 is NOT listed under "Scheduled". Fail (SI-16) if it is. |
| Actual Result | RUN-20261014-02: Transaction Center status filtering did not consistently match displayed delivery status; the case exposed SI-16 status/date filter behavior. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-TXN-006-01-filter-form.png](../../artifacts/RUN-20261014-02/TC-TXN-006-01-filter-form.png); [TC-TXN-006-02-scheduled-filter.png](../../artifacts/RUN-20261014-02/TC-TXN-006-02-scheduled-filter.png) |
| Defect ID | RUN-20261014-02: DEF-009 |