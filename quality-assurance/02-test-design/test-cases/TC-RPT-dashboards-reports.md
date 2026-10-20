# Test Cases: Dashboards, Reports and Exports

| Document control | |
|---|---|
| Title | Test Cases: Dashboards, Reports and Exports |
| Document ID | QA-TC-RPT |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Role dashboards (`server/src/routes/dashboard.ts`), Statistical Reports, AM Directory, list exports and global search.

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-RPT-001](#tc-rpt-001-sales-coordinator-dashboard-cards-drill-into-matching-lists) | Sales Coordinator dashboard cards drill into matching lists | Sales Coordinator | Medium | Positive | TS-015 | Run |
| [TC-RPT-002](#tc-rpt-002-logistics-dashboard-shows-driver-workload) | Logistics dashboard shows driver workload | Logistics | Medium | Positive | TS-015 | Run |
| [TC-RPT-003](#tc-rpt-003-tass-dashboard-counts-only-records-tass-can-open) | TASS dashboard counts only records TASS can open | TASS | Medium | Negative | TS-015 | Deferred |
| [TC-RPT-004](#tc-rpt-004-dashboard-counts-respect-per-user-category-denials) | Dashboard counts respect per-user category denials | Sales Coordinator | Low | Negative | TS-015 | Run |
| [TC-RPT-005](#tc-rpt-005-admin-dashboard-matches-administration-data) | Admin dashboard matches administration data | Admin | Medium | Positive | TS-015 | Run |
| [TC-RPT-006](#tc-rpt-006-statistical-reports-summary-with-filters-and-range-validation) | Statistical Reports summary with filters and range validation | Logistics | Medium | Boundary | TS-015 | Run |
| [TC-RPT-007](#tc-rpt-007-export-the-deliveries-list-to-csv) | Export the Deliveries list to CSV | Sales Coordinator | Low | Positive | TS-015 | Run |
| [TC-RPT-008](#tc-rpt-008-am-directory-groups-records-by-account-manager) | AM Directory groups records by account manager | Sales Coordinator | Low | Positive | TS-015 | Run |
| [TC-RPT-009](#tc-rpt-009-global-search-finds-a-record) | Global search finds a record | Logistics | Low | Positive | TS-015 | Run |

## Test cases

### TC-RPT-001: Sales Coordinator dashboard cards drill into matching lists

| Field | Description |
|---|---|
| Test Case ID | TC-RPT-001 |
| Title | Sales Coordinator dashboard cards drill into matching lists |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | R-SC, WF-1 (DashboardView.tsx:164-250; records.ts:133-171) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | None beyond preconditions |
| Steps | 1. Dashboard: note the numbers on "Pending Driver Assignment" and "On-Hold Items".<br>2. Click "Pending Driver Assignment"; count the list rows (total).<br>3. Back; click "On-Hold Items"; count rows. |
| Expected Result | Each card number equals the number of records listed after clicking it. |
| Actual Result | RUN-20261015-08: Microsoft Sales account: Pending Driver Assignment card 23 and drilldown total 23; On-Hold Items card 3 and drilldown total 3. |
| Status | RUN-20261015-08: Pass |
| Evidence | RUN-20261015-08: [TC-RPT-001-03-result.png](../../artifacts/RUN-20261015-08/TC-RPT-001-03-result.png) |
| Defect ID | RUN-20261015-08: — |
### TC-RPT-002: Logistics dashboard shows driver workload

| Field | Description |
|---|---|
| Test Case ID | TC-RPT-002 |
| Title | Logistics dashboard shows driver workload |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | R-LOG (LogisticsDashboard.tsx:72-170) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. Dashboard: read "No Driver Assigned" and click it; count rows.<br>2. Read "Drivers Currently Out for Delivery". |
| Expected Result | • Card count equals listed rows.<br>• Drivers with today's runs (e.g. John Doe) are listed, or "No drivers currently assigned to today's deliveries." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Card count equals listed rows.; • Drivers with today's runs (e.g. John Doe) are listed, or "No drivers currently assigned to today's deliveries." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-RPT-002-01-dashboard.png](../../artifacts/RUN-20261014-02/TC-RPT-002-01-dashboard.png); [TC-RPT-002-02-unassigned-list.png](../../artifacts/RUN-20261014-02/TC-RPT-002-02-unassigned-list.png) |
| Defect ID | RUN-20261014-02: — |
### TC-RPT-003: TASS dashboard counts only records TASS can open

| Field | Description |
|---|---|
| Test Case ID | TC-RPT-003 |
| Title | TASS dashboard counts only records TASS can open |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | R-TASS, SI-02, SI-01 (dashboard.ts:57-89) |
| Role | TASS |
| Priority | Medium |
| Type | Negative |
| Preconditions | **DEFERRED in this cycle: TASS responsibilities are not yet defined (OQ-02, OQ-07; user decision 2026-10-14). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-PRC-001. |
| Test Data | None beyond preconditions |
| Steps | 1. Dashboard: note "Pick-ups Pending".<br>2. Click it and count the listed rows. |
| Expected Result | The card number equals the number of rows TASS can see. Fail (SI-02) if the card shows N > 0 and the list is empty. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-RPT-004: Dashboard counts respect per-user category denials

| Field | Description |
|---|---|
| Test Case ID | TC-RPT-004 |
| Title | Dashboard counts respect per-user category denials |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | SI-02, BR-30 (dashboard.ts:13-28) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). and Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. Admin: Module Access for Maria Reyes → toggle "Deliveries" off → "Save Changes".<br>2. SC: reload Dashboard; read "Pending Driver Assignment".<br>3. Admin: "Reset to Role Default" → "Save Changes". |
| Expected Result | With Deliveries denied, the SC dashboard does not report Delivery counts (cards hidden or 0). Fail (SI-02) if it still shows non-zero Delivery counts. |
| Actual Result | RUN-20261014-02: Observed the case expected result: With Deliveries denied, the SC dashboard does not report Delivery counts (cards hidden or 0). Fail (SI-02) if it still shows non-zero Delivery counts. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-RPT-004-01-deliveries-denied-dashboard.png](../../artifacts/RUN-20261014-02/TC-RPT-004-01-deliveries-denied-dashboard.png) |
| Defect ID | RUN-20261014-02: — |
### TC-RPT-005: Admin dashboard matches administration data

| Field | Description |
|---|---|
| Test Case ID | TC-RPT-005 |
| Title | Admin dashboard matches administration data |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | R-ADM (dashboard.ts:92-146) |
| Role | Admin |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. Dashboard: note "Total Active Users".<br>2. Admin Panel → "User Management": count Status "Active".<br>3. Back on Dashboard click "View Full Log →". |
| Expected Result | • "Total Active Users" equals the Active count.<br>• "View Full Log →" opens "System Audit Log". |
| Actual Result | RUN-20261014-02: The Admin dashboard showed Total Active Users as 0 while User Management showed 8 active seeded/test accounts at that point in the run. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-RPT-005-01-admin-dashboard.png](../../artifacts/RUN-20261014-02/TC-RPT-005-01-admin-dashboard.png) |
| Defect ID | RUN-20261014-02: DEF-027, DEF-028 |
### TC-RPT-006: Statistical Reports summary with filters and range validation

| Field | Description |
|---|---|
| Test Case ID | TC-RPT-006 |
| Title | Statistical Reports summary with filters and range validation |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | R-LOG, BR-34, SI-25 (reports.ts:13-111; StatisticalReportView.tsx:218-262) |
| Role | Logistics |
| Priority | Medium |
| Type | Boundary |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-038. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Reports". "Delivery Date From (Manila)" and "To" = `<TODAY>`; Category "Deliveries"; "Generate Report".<br>2. Set From `<TODAY+1>`, To `<TODAY>`; "Generate Report".<br>3. Run as SC: `GET /api/reports/summary` (API helper). |
| Expected Result | • Step 1: cards "Delivery Date Cohort", "Delivered in Cohort", "Completed by Time Out" etc. with values ≥ 1 delivered.<br>• Step 2: an error (server "dateFrom must be on or before dateTo") and no stale results.<br>• Step 3: 200 with a summary (Sales Coordinator should have Reports per OQ-09). Fail (SI-25) if 403 "Module access denied". |
| Actual Result | RUN-20261014-02: The Logistics Reports page remained on Loading and the browser recorded 401/400 errors; the reversed-date step could not be submitted because its button was disabled. The separate Sales API check returned 403 {"error":"Module access denied"} (linked to DEF-003). |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-RPT-006-01-deliveries-today.png](../../artifacts/RUN-20261014-02/TC-RPT-006-01-deliveries-today.png) |
| Defect ID | RUN-20261014-02: DEF-003, DEF-029 |
### TC-RPT-007: Export the Deliveries list to CSV

| Field | Description |
|---|---|
| Test Case ID | TC-RPT-007 |
| Title | Export the Deliveries list to CSV |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | R-SC (ExportMenu.tsx:162) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-002. |
| Test Data | None beyond preconditions |
| Steps | 1. Deliveries → "Export" → "Export CSV" (capture the download). |
| Expected Result | A CSV downloads and contains a row for `UAT-<RUN>-DEL-01`. |
| Actual Result | RUN-20261014-02: Observed the case expected result: A CSV downloads and contains a row for `UAT-<RUN>-DEL-01`. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-RPT-007-01-export-menu.png](../../artifacts/RUN-20261014-02/TC-RPT-007-01-export-menu.png); [TC-RPT-007-02-deliveries-export.csv](../../artifacts/RUN-20261014-02/TC-RPT-007-02-deliveries-export.csv) |
| Defect ID | RUN-20261014-02: — |
### TC-RPT-008: AM Directory groups records by account manager

| Field | Description |
|---|---|
| Test Case ID | TC-RPT-008 |
| Title | AM Directory groups records by account manager |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | R-SC (AccountManagerDirectory.tsx; records.ts:384-439) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-002. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "AM Directory"; expand "M. Reyes". |
| Expected Result | Card shows Total/Done/Active; "All Records (N)" includes `UAT-<RUN>-DEL-01`. |
| Actual Result | RUN-20261014-02: AM Directory showed the expected manager summary but expanded the record as REC-47964 instead of UAT-R02-DEL-01. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-RPT-008-01-am-directory.png](../../artifacts/RUN-20261014-02/TC-RPT-008-01-am-directory.png) |
| Defect ID | RUN-20261014-02: DEF-018 |
### TC-RPT-009: Global search finds a record

| Field | Description |
|---|---|
| Test Case ID | TC-RPT-009 |
| Title | Global search finds a record |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | R-LOG (GlobalSearch.tsx:167) |
| Role | Logistics |
| Priority | Low |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-002. |
| Test Data | None beyond preconditions |
| Steps | 1. Press Ctrl+K; type `U`; then type `UAT-<RUN>-DEL-01`; press Enter on the result. |
| Expected Result | • With one character: "Type at least 2 characters to search".<br>• Group "Delivery Records (1)"; Enter opens the record. |
| Actual Result | RUN-20261014-02: One-character search showed the minimum-length prompt and the full reference produced one delivery result, but pressing Enter left the overlay open and did not open the record. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-RPT-009-01-one-char.png](../../artifacts/RUN-20261014-02/TC-RPT-009-01-one-char.png); [TC-RPT-009-02-search-result-opened.png](../../artifacts/RUN-20261014-02/TC-RPT-009-02-search-result-opened.png) |
| Defect ID | RUN-20261014-02: DEF-030 |