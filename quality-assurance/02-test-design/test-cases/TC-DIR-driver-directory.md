# Test Cases: Driver Directory and Dispatch Views

| Document control | |
|---|---|
| Title | Test Cases: Driver Directory and Dispatch Views |
| Document ID | QA-TC-DIR |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Driver Manager (roster), Driver Board, Driver View, Delivery Calendar and Monthly Driver Report. Rules: `server/src/routes/drivers.ts`, `server/src/services/driverDirectory.ts`.

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-DIR-001](#tc-dir-001-admin-adds-a-driver-with-coverage-areas) | Admin adds a Driver with coverage areas | Admin | High | Positive | TS-013 | Run |
| [TC-DIR-002](#tc-dir-002-logistics-adds-an-assistant-only) | Logistics adds an Assistant (only) | Logistics | High | Positive | TS-013 | Run |
| [TC-DIR-003](#tc-dir-003-logistics-cannot-add-a-driver-api) | Logistics cannot add a Driver (API) | Logistics | High | Access Control | TS-010 | Run |
| [TC-DIR-004](#tc-dir-004-duplicate-roster-names-are-refused) | Duplicate roster names are refused | Logistics | Medium | Negative | TS-013 | Run |
| [TC-DIR-005](#tc-dir-005-logistics-edits-a-drivers-coverage) | Logistics edits a Driver's coverage | Logistics | Medium | Positive | TS-013 | Run |
| [TC-DIR-006](#tc-dir-006-logistics-cannot-rename-a-driver-or-change-type) | Logistics cannot rename a Driver or change type | Logistics | High | Access Control | TS-010 | Run |
| [TC-DIR-007](#tc-dir-007-coverage-must-come-from-the-area-list) | Coverage must come from the area list | Logistics | Medium | Negative | TS-013 | Run |
| [TC-DIR-008](#tc-dir-008-linking-a-login-through-the-roster-api-is-refused) | Linking a login through the roster API is refused | Logistics | Medium | Access Control | TS-010 | Run |
| [TC-DIR-009](#tc-dir-009-deactivated-drivers-cannot-be-assigned) | Deactivated Drivers cannot be assigned | Logistics | High | Negative | TS-013 | Run |
| [TC-DIR-010](#tc-dir-010-reactivate-a-driver) | Reactivate a Driver | Logistics | Low | Positive | TS-013 | Run |
| [TC-DIR-011](#tc-dir-011-delivery-calendar-shows-the-days-records) | Delivery Calendar shows the day's records | Logistics | Medium | Positive | TS-013 | Run |
| [TC-DIR-012](#tc-dir-012-driver-board-groups-records-by-driver-and-shows-unassigned-ones) | Driver Board groups records by driver and shows unassigned ones | Logistics | Medium | Positive | TS-013 | Run |
| [TC-DIR-013](#tc-dir-013-driver-view-lists-a-drivers-runs-and-supports-actions) | Driver View lists a driver's runs and supports actions | Logistics | Medium | Positive | TS-013 | Run |
| [TC-DIR-014](#tc-dir-014-monthly-driver-report-generates-a-file) | Monthly Driver Report generates a file | Logistics | Low | Positive | TS-015 | Run |
| [TC-DIR-015](#tc-dir-015-logistics-prepares-a-future-dated-delivery-for-the-driver) | Logistics prepares a future-dated delivery for the Driver | Logistics | High | Positive | TS-008 | Run |

## Test cases

### TC-DIR-001: Admin adds a Driver with coverage areas

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-001 |
| Title | Admin adds a Driver with coverage areas |
| Scenario ID | TS-013 |
| Requirement / Rule Ref | R-ADM, BR-24, WF-8 (drivers.ts:52-66) |
| Role | Admin |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | D-DRV-A: name `UAT Driver Alpha`, coverage "Makati CBD" |
| Steps | 1. Sidebar "Drivers" → tab "Manager".<br>2. Tab "Drivers (N)" → "Add Driver".<br>3. "Full Name *" `UAT Driver Alpha`; "Type" Driver; in "Coverage Areas" choose "Makati CBD".<br>4. Click "Add Driver". |
| Expected Result | Row "UAT Driver Alpha" with "No login", coverage "Makati CBD", Status "Active", Added By "System Admin". |
| Actual Result | RUN-20261014-02: Observed the case expected result: Row "UAT Driver Alpha" with "No login", coverage "Makati CBD", Status "Active", Added By "System Admin". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DIR-001-01-driver-manager.png](../../artifacts/RUN-20261014-02/TC-DIR-001-01-driver-manager.png); [TC-DIR-001-02-driver-details.png](../../artifacts/RUN-20261014-02/TC-DIR-001-02-driver-details.png); [TC-DIR-001-03-driver-added.png](../../artifacts/RUN-20261014-02/TC-DIR-001-03-driver-added.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-002: Logistics adds an Assistant (only)

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-002 |
| Title | Logistics adds an Assistant (only) |
| Scenario ID | TS-013 |
| Requirement / Rule Ref | R-LOG, BR-24 (drivers.ts:57-59; DriverManagerView.tsx:343-381) |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | Name `UAT Assistant Beta` |
| Steps | 1. Sidebar "Drivers" → tab "Manager".<br>2. Tab "Assistants (N)" → "Add Assistant".<br>3. Open "Type" options and read the help text.<br>4. "Full Name *" `UAT Assistant Beta`; click "Add Assistant". |
| Expected Result | • "Type" offers only Assistant; help text "Only Admin can add drivers."<br>• Row "UAT Assistant Beta" Active in Assistants. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • "Type" offers only Assistant; help text "Only Admin can add drivers."; • Row "UAT Assistant Beta" Active in Assistants. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DIR-002-01-assistant-form.png](../../artifacts/RUN-20261014-02/TC-DIR-002-01-assistant-form.png); [TC-DIR-002-02-assistant-added.png](../../artifacts/RUN-20261014-02/TC-DIR-002-02-assistant-added.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-003: Logistics cannot add a Driver (API)

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-003 |
| Title | Logistics cannot add a Driver (API) |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-LOG, BR-24 (drivers.ts:57-59) |
| Role | Logistics |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/drivers` body `{"name":"UAT Rogue Driver","type":"DRIVER"}` |
| Expected Result | 403 "Only Admin can add drivers. Logistics can add assistants." |
| Actual Result | RUN-20261014-02: Observed the case expected result: 403 "Only Admin can add drivers. Logistics can add assistants." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-004: Duplicate roster names are refused

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-004 |
| Title | Duplicate roster names are refused |
| Scenario ID | TS-013 |
| Requirement / Rule Ref | BR-24 (driverDirectory.ts:48-50) |
| Role | Logistics |
| Priority | Medium |
| Type | Negative |
| Preconditions | Depends on TC-DIR-002. |
| Test Data | None beyond preconditions |
| Steps | 1. "Add Assistant" with name `uat assistant beta` (lower case); submit.<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/drivers` body `{"name":"UAT ASSISTANT BETA","type":"ASSISTANT"}` |
| Expected Result | • UI error "A assistant with this name already exists" / "An assistant with this name already exists" (record exact text).<br>• API 409 "This entry already exists." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • UI error "A assistant with this name already exists" / "An assistant with this name already exists" (record exact text).; • API 409 "This entry already exists." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DIR-004-01-duplicate-assistant-ui.png](../../artifacts/RUN-20261014-02/TC-DIR-004-01-duplicate-assistant-ui.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-005: Logistics edits a Driver's coverage

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-005 |
| Title | Logistics edits a Driver's coverage |
| Scenario ID | TS-013 |
| Requirement / Rule Ref | R-LOG, BR-24 (drivers.ts:70-84) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Drivers" → tab "Manager".<br>2. Row "Lando Navarro" → icon "Edit".<br>3. In coverage choose "Pasay"; click "Save". |
| Expected Result | Coverage now includes "Pasay"; no error. |
| Actual Result | RUN-20261014-02: Observed the case expected result: Coverage now includes "Pasay"; no error. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DIR-005-01-edit-driver.png](../../artifacts/RUN-20261014-02/TC-DIR-005-01-edit-driver.png); [TC-DIR-005-01-pasay-staged.png](../../artifacts/RUN-20261014-02/evidence/TC-DIR-005-01-pasay-staged.png); [TC-DIR-005-02-pasay-saved.png](../../artifacts/RUN-20261014-02/evidence/TC-DIR-005-02-pasay-saved.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-006: Logistics cannot rename a Driver or change type

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-006 |
| Title | Logistics cannot rename a Driver or change type |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-LOG, BR-24 (driverDirectory.ts:76-84) |
| Role | Logistics |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Driver id of "Manny Santos" from `GET /api/drivers`. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/drivers/<Manny id>` body `{"name":"Manny S."}`<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/drivers/<Manny id>` body `{"type":"ASSISTANT"}` |
| Expected Result | • Step 1: 403 "Only Admin can rename a Driver."<br>• Step 2: 403 "Only Admin can change whether an entry is a Driver or an Assistant." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 403 "Only Admin can rename a Driver."; • Step 2: 403 "Only Admin can change whether an entry is a Driver or an Assistant." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-007: Coverage must come from the area list

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-007 |
| Title | Coverage must come from the area list |
| Scenario ID | TS-013 |
| Requirement / Rule Ref | BR-24 (driverDirectory.ts:31-35; areaHierarchy.ts) |
| Role | Logistics |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Lando Navarro id. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/drivers/<Lando id>` body `{"coverage_areas":["Atlantis"]}` |
| Expected Result | 400 "Coverage must use areas or subregions from the area list. Not recognised: Atlantis." |
| Actual Result | RUN-20261014-02: Observed the case expected result: 400 "Coverage must use areas or subregions from the area list. Not recognised: Atlantis." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-008: Linking a login through the roster API is refused

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-008 |
| Title | Linking a login through the roster API is refused |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | BR-31 (drivers.ts:39-43) |
| Role | Logistics |
| Priority | Medium |
| Type | Access Control |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/drivers/<Lando id>` body `{"user_id":"anything"}` |
| Expected Result | 403 "Driver logins are linked by Admin in Admin Panel → Users." |
| Actual Result | RUN-20261014-02: Observed the case expected result: 403 "Driver logins are linked by Admin in Admin Panel → Users." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-009: Deactivated Drivers cannot be assigned

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-009 |
| Title | Deactivated Drivers cannot be assigned |
| Scenario ID | TS-013 |
| Requirement / Rule Ref | BR-13, BR-24 (driverDirectory.ts:127-130) |
| Role | Logistics |
| Priority | High |
| Type | Negative |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DIR-001, TC-DEL-010. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Drivers" → tab "Manager".<br>2. Row "UAT Driver Alpha" → icon "Deactivate (history is preserved)" → "Deactivate".<br>3. Open D-DEL-05 (if not Draft) or D-DEL-07 → "Dispatch & Logistics" → open "Driver" options.<br>4. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-07.id}` body `{"driver":"UAT Driver Alpha","remarks":"UAT probe"}` |
| Expected Result | • Status "Inactive".<br>• "UAT Driver Alpha" is not offered.<br>• API 400 "Driver \"UAT Driver Alpha\" is inactive or not in the directory. Choose an active entry." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Status "Inactive".; • "UAT Driver Alpha" is not offered.; • API 400 "Driver \"UAT Driver Alpha\" is inactive or not in the directory. Choose an active entry." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DIR-009-01-driver-manager-alpha.png](../../artifacts/RUN-20261014-02/TC-DIR-009-01-driver-manager-alpha.png); [TC-DIR-009-02-alpha-inactive.png](../../artifacts/RUN-20261014-02/TC-DIR-009-02-alpha-inactive.png); [TC-DIR-009-03-driver-options.png](../../artifacts/RUN-20261014-02/TC-DIR-009-03-driver-options.png); [TC-DIR-009-04-driver-options-after-deactivation.png](../../artifacts/RUN-20261014-02/TC-DIR-009-04-driver-options-after-deactivation.png); [TC-DIR-009-05-inactive-assignment-api.json](../../artifacts/RUN-20261014-02/TC-DIR-009-05-inactive-assignment-api.json) |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-010: Reactivate a Driver

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-010 |
| Title | Reactivate a Driver |
| Scenario ID | TS-013 |
| Requirement / Rule Ref | BR-24 |
| Role | Logistics |
| Priority | Low |
| Type | Positive |
| Preconditions | Depends on TC-DIR-009. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Drivers" → tab "Manager".<br>2. Toggle the filter to "All"; row "UAT Driver Alpha" → icon "Activate". |
| Expected Result | Status "Active". |
| Actual Result | RUN-20261014-02: Observed the case expected result: Status "Active". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DIR-010-01-alpha-reactivated.png](../../artifacts/RUN-20261014-02/TC-DIR-010-01-alpha-reactivated.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-011: Delivery Calendar shows the day's records

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-011 |
| Title | Delivery Calendar shows the day's records |
| Scenario ID | TS-013 |
| Requirement / Rule Ref | R-LOG, WF-1 (DeliveryCalendar.tsx) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-002. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Delivery Calendar".<br>2. Click today's date cell.<br>3. Click `UAT-<RUN>-DEL-01` in the popup. |
| Expected Result | • The popup lists "N records" for today including `UAT-<RUN>-DEL-01`.<br>• The record workspace opens. |
| Actual Result | RUN-20261014-02: The October 14 calendar popup listed 27 records and included the correct record, but displayed internal ID REC-47964 where UAT-R02-DEL-01 was expected. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-DIR-011-01-today-calendar.png](../../artifacts/RUN-20261014-02/evidence/TC-DIR-011-01-today-calendar.png); [TC-DIR-011-02-delivery-opened.png](../../artifacts/RUN-20261014-02/evidence/TC-DIR-011-02-delivery-opened.png) |
| Defect ID | RUN-20261014-02: DEF-018 |
### TC-DIR-012: Driver Board groups records by driver and shows unassigned ones

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-012 |
| Title | Driver Board groups records by driver and shows unassigned ones |
| Scenario ID | TS-013 |
| Requirement / Rule Ref | R-LOG, WF-1 (DriverBoard.tsx:271-283) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-011. |
| Test Data | None beyond preconditions |
| Steps | 1. Drivers → "Board". Read the summary line and the "John Doe" column.<br>2. In "Filter by area" click "Quezon City - Diliman". |
| Expected Result | • Summary "Active records grouped by driver — N unassigned, N shown".<br>• John Doe column contains his active runs (e.g. seeded runs); filter shows only Quezon City - Diliman cards. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Summary "Active records grouped by driver — N unassigned, N shown".; • John Doe column contains his active runs (e.g. seeded runs); filter shows only Quezon City - Diliman cards. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DIR-012-01-driver-board.png](../../artifacts/RUN-20261014-02/evidence/TC-DIR-012-01-driver-board.png); [TC-DIR-012-02-diliman-filter.png](../../artifacts/RUN-20261014-02/evidence/TC-DIR-012-02-diliman-filter.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-013: Driver View lists a driver's runs and supports actions

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-013 |
| Title | Driver View lists a driver's runs and supports actions |
| Scenario ID | TS-013 |
| Requirement / Rule Ref | R-LOG, WF-1 (DriverView.tsx) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. Drivers → "View". In "Drivers" select "Manny Santos".<br>2. Switch "Active N" / "Completed N".<br>3. Click "N need a driver" toggle. |
| Expected Result | • Manny's runs are listed (D-DEL-05 if active).<br>• "Runs needing a driver" opens (or "All active runs have a driver."). |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Manny's runs are listed (D-DEL-05 if active).; • "Runs needing a driver" opens (or "All active runs have a driver."). / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DIR-013-01-manny-runs.png](../../artifacts/RUN-20261014-02/evidence/TC-DIR-013-01-manny-runs.png); [TC-DIR-013-03-needs-driver.png](../../artifacts/RUN-20261014-02/evidence/TC-DIR-013-03-needs-driver.png) |
| Defect ID | RUN-20261014-02: — |
### TC-DIR-014: Monthly Driver Report generates a file

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-014 |
| Title | Monthly Driver Report generates a file |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | R-LOG, WF-1 (DriverReportModal.tsx:82-204) |
| Role | Logistics |
| Priority | Low |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. Deliveries → "Monthly Driver Report".<br>2. Month = current month, Year = current year, File Format "CSV (.csv)", "Current Status"; "Generate Report". |
| Expected Result | Text "N delivery records found for <Month> <Year>" and a CSV download that includes `UAT-<RUN>-DEL-01`. |
| Actual Result | RUN-20261014-02: The UI reported 28 records found and generated Microgenesis_Driver_Report_OCTOBER_2026.csv, but the CSV contained aggregate output and did not include the expected D-DEL-01 reference. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-DIR-014-01-report-settings.png](../../artifacts/RUN-20261014-02/evidence/TC-DIR-014-01-report-settings.png); [TC-DIR-014-02-driver-report.csv](../../artifacts/RUN-20261014-02/evidence/TC-DIR-014-02-driver-report.csv); [TC-DIR-014-03-report-generated.png](../../artifacts/RUN-20261014-02/evidence/TC-DIR-014-03-report-generated.png) |
| Defect ID | RUN-20261014-02: DEF-019 |
### TC-DIR-015: Logistics prepares a future-dated delivery for the Driver

| Field | Description |
|---|---|
| Test Case ID | TC-DIR-015 |
| Title | Logistics prepares a future-dated delivery for the Driver |
| Scenario ID | TS-008 |
| Requirement / Rule Ref | R-LOG, BR-12 |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | D-DEL-04 (date `<TODAY+3>`) |
| Steps | 1. Deliveries → "New Record" with D-DEL-04 values; "Submit"; record {D-DEL-04.id}.<br>2. Open it → "Dispatch & Logistics": Driver "John Doe", remarks `UAT future`, "Save Changes". |
| Expected Result | D-DEL-04 Scheduled, Delivery Date `<TODAY+3>`, Driver "John Doe". |
| Actual Result | RUN-20261014-02: Observed the case expected result: D-DEL-04 Scheduled, Delivery Date `<TODAY+3>`, Driver "John Doe". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-DIR-015-01-future-delivery-created.png](../../artifacts/RUN-20261014-02/TC-DIR-015-01-future-delivery-created.png); [TC-DIR-015-02-driver-assigned.png](../../artifacts/RUN-20261014-02/TC-DIR-015-02-driver-assigned.png) |
| Defect ID | RUN-20261014-02: — |