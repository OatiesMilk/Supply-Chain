# Test Cases: Role Access Control

| Document control | |
|---|---|
| Title | Test Cases: Role Access Control |
| Document ID | QA-TC-ACC |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Proves each role sees its default modules and **cannot** reach other roles' modules or actions, in the UI and at the API. Expected screen sets come from `server/src/services/permissions.ts:18-24` (system-overview §3.2).

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-ACC-001](#tc-acc-001-sales-coordinator-sees-exactly-its-expected-modules) | Sales Coordinator sees exactly its expected modules | Sales Coordinator | High | Access Control | TS-010 | Run |
| [TC-ACC-002](#tc-acc-002-sales-coordinator-opens-calendar-and-reports-but-not-admin-screens-or-apis) | Sales Coordinator opens Calendar and Reports but not admin screens or APIs | Sales Coordinator | High | Access Control | TS-010 | Run |
| [TC-ACC-003](#tc-acc-003-logistics-sees-exactly-its-default-modules) | Logistics sees exactly its default modules | Logistics | High | Access Control | TS-010 | Run |
| [TC-ACC-004](#tc-acc-004-logistics-is-refused-admin-company-creation-and-rma-writes) | Logistics is refused admin, company creation and RMA writes | Logistics | High | Access Control | TS-010 | Run |
| [TC-ACC-005](#tc-acc-005-tass-sees-exactly-its-default-modules) | TASS sees exactly its default modules | TASS | High | Access Control | TS-010 | Deferred |
| [TC-ACC-006](#tc-acc-006-tass-sees-records-in-the-procurement-pick-up-module-it-is-granted) | TASS sees records in the Procurement Pick-up module it is granted | TASS | Medium | Positive | TS-010 | Deferred |
| [TC-ACC-007](#tc-acc-007-tass-cannot-read-or-write-deliveries) | TASS cannot read or write Deliveries | TASS | Critical | Access Control | TS-010 | Run |
| [TC-ACC-008](#tc-acc-008-admin-sees-every-staff-module) | Admin sees every staff module | Admin | Medium | Access Control | TS-010 | Run |
| [TC-ACC-009](#tc-acc-009-driver-cannot-reach-staff-screens-or-staff-apis) | Driver cannot reach staff screens or staff APIs | Driver | Critical | Access Control | TS-010 | Run |
| [TC-ACC-010](#tc-acc-010-tass-is-not-offered-record-creation-it-cannot-perform-main--new-delivery) | TASS is not offered record creation it cannot perform (Main → New Delivery) | TASS | Medium | Negative | TS-010 | Deferred |
| [TC-ACC-011](#tc-acc-011-driver-cannot-read-a-run-assigned-to-another-driver) | Driver cannot read a run assigned to another driver | Driver | Critical | Access Control | TS-008 | Run |
| [TC-ACC-012](#tc-acc-012-a-per-user-module-denial-takes-effect-in-the-ui-and-the-api) | A per-user module denial takes effect in the UI and the API | Admin | High | Access Control | TS-016 | Run |
| [TC-ACC-013](#tc-acc-013-a-driver-login-without-a-linked-profile-sees-no-runs) | A Driver login without a linked profile sees no runs | Driver | High | Access Control | TS-008 | Run |
| [TC-ACC-014](#tc-acc-014-driver-cannot-create-customers-or-suppliers) | Driver cannot create customers or suppliers | Driver | Low | Access Control | TS-010 | Run |
| [TC-ACC-015](#tc-acc-015-sales-coordinator-cannot-assign-drivers) | Sales Coordinator cannot assign drivers | Sales Coordinator | High | Access Control | TS-010 | Run |
| [TC-ACC-016](#tc-acc-016-temporary-access-request-actually-reaches-an-admin) | Temporary access request actually reaches an Admin | Sales Coordinator | Low | Negative | TS-010 | Run |
| [TC-ACC-017](#tc-acc-017-logistics-has-view-only-rma-in-the-ui) | Logistics has view-only RMA in the UI | Logistics | High | Access Control | TS-004 | Deferred |

## Test cases

### TC-ACC-001: Sales Coordinator sees exactly its expected modules

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-001 |
| Title | Sales Coordinator sees exactly its expected modules |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-SC, ACC-SCREENS, OQ-09, SI-25 (permissions.ts:19) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | None beyond preconditions |
| Steps | 1. Expand the sidebar if collapsed ("Expand menu").<br>2. List every sidebar item label. |
| Expected Result | • Visible: Main, Dashboard, Deliveries, RMA, Accounting Collection, Procurement Pick-up, Sales Orders, Customers, Suppliers, Delivery Calendar, Reports, AM Directory, Transaction Center (Delivery Calendar and Reports per the user decision on OQ-09, 2026-10-14).<br>• Not visible: Drivers, SKU Master, Data Sampler, Admin Panel.<br>• Fail (SI-25) if "Delivery Calendar" or "Reports" is missing. |
| Actual Result | RUN-20261014-02: Sales sidebar and module list did not include Delivery Calendar or Reports, contrary to the approved Sales access decision. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-ACC-001-02-sales-sidebar.png](../../artifacts/RUN-20261014-02/TC-ACC-001-02-sales-sidebar.png) |
| Defect ID | RUN-20261014-02: DEF-003 |
### TC-ACC-002: Sales Coordinator opens Calendar and Reports but not admin screens or APIs

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-002 |
| Title | Sales Coordinator opens Calendar and Reports but not admin screens or APIs |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-SC, ACC-SCREENS, ACC-API, OQ-09, SI-25 |
| Role | Sales Coordinator |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | None beyond preconditions |
| Steps | 1. Navigate to `/admin`, then `/inventory`, then `/driver_manager`.<br>2. Navigate to `/calendar`, then `/statistical_reports`.<br>3. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `GET /api/users`<br>4. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `GET /api/reports/summary`<br>5. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/drivers` body `{"name":"UAT Probe","type":"ASSISTANT"}` |
| Expected Result | • Each URL in step 1 shows "This page is not available for your account." (or redirects to `/dashboard`); no admin data is displayed.<br>• Step 2: the Delivery Calendar and the Statistical Reports page open normally (OQ-09). Fail (SI-25) if either shows "This page is not available for your account."<br>• Step 3: 403 `{"error":"Module access denied"}`.<br>• Step 4: 200 with a report summary (Fail, SI-25, if 403).<br>• Step 5: 403 `{"error":"Module access denied"}`; no assistant created. |
| Actual Result | RUN-20261014-02: Calendar and Reports remained unavailable to Maria Reyes. GET /api/reports/summary returned 403 with {"error":"Module access denied"}. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-ACC-002-01-admin-denied.png](../../artifacts/RUN-20261014-02/TC-ACC-002-01-admin-denied.png); [TC-ACC-002-01-driver-manager-denied.png](../../artifacts/RUN-20261014-02/TC-ACC-002-01-driver-manager-denied.png); [TC-ACC-002-01-inventory-denied.png](../../artifacts/RUN-20261014-02/TC-ACC-002-01-inventory-denied.png); [TC-ACC-002-02-calendar.png](../../artifacts/RUN-20261014-02/TC-ACC-002-02-calendar.png); [TC-ACC-002-02-reports.png](../../artifacts/RUN-20261014-02/TC-ACC-002-02-reports.png) |
| Defect ID | RUN-20261014-02: DEF-003 |
### TC-ACC-003: Logistics sees exactly its default modules

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-003 |
| Title | Logistics sees exactly its default modules |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-LOG, ACC-SCREENS (permissions.ts:20) |
| Role | Logistics |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. List every sidebar item label.<br>2. Click "Drivers" and list the tabs shown. |
| Expected Result | • Visible: Main, Dashboard, Deliveries, RMA, Accounting Collection, Procurement Pick-up, Sales Orders, Customers, Suppliers, Drivers, Delivery Calendar, Reports, Transaction Center.<br>• Not visible: AM Directory, SKU Master, Data Sampler, Admin Panel.<br>• Drivers shows tabs View, Board, Manager. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Visible: Main, Dashboard, Deliveries, RMA, Accounting Collection, Procurement Pick-up, Sales Orders, Customers, Suppliers, Drivers, Delivery Calendar, Reports, Transaction Center.; • Not visible: AM Directory, SKU Master, Data Sampler, Admin Panel.; • Drivers shows tabs View, Board, Manager. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ACC-003-02-logistics-sidebar-drivers.png](../../artifacts/RUN-20261014-02/TC-ACC-003-02-logistics-sidebar-drivers.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-004: Logistics is refused admin, company creation and RMA writes

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-004 |
| Title | Logistics is refused admin, company creation and RMA writes |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-LOG, ACC-API, BR-23 |
| Role | Logistics |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Seeded RMA demo run exists (reference `SAP-DEMO-…-RMA`); note its Record ID from the RMA list. |
| Test Data | None beyond preconditions |
| Steps | 1. Navigate to `/admin` and `/am_directory`.<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/companies` body `{"name":"UAT Logistics Co"}`<br>3. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/records` body `{"company_id":"<any company id from GET /api/companies>","category":"RMA","reference":"UAT-<RUN>-LOGRMA","delivery_date":"<TODAY>"}`<br>4. In the Logistics session, send with the API helper (AGENTS.md §8): `PUT /api/records/{seeded RMA id}` body `{"area":"Pasay","remarks":"UAT probe"}` |
| Expected Result | • Step 1: "This page is not available for your account." for both.<br>• Step 2: 403 `{"error":"Forbidden for this role"}`.<br>• Step 3: 403 `{"error":"Logistics has view-only access to RMA records"}`.<br>• Step 4: 403 `{"error":"Logistics has view-only access to RMA records"}`. |
| Actual Result | RUN-20261014-02: Logistics was denied the RMA/admin actions, but the denial text differed from the expected message in the case. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-ACC-004-01-admin-denied.png](../../artifacts/RUN-20261014-02/TC-ACC-004-01-admin-denied.png); [TC-ACC-004-01-am-directory-denied.png](../../artifacts/RUN-20261014-02/TC-ACC-004-01-am-directory-denied.png) |
| Defect ID | RUN-20261014-02: DEF-004 |
### TC-ACC-005: TASS sees exactly its default modules

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-005 |
| Title | TASS sees exactly its default modules |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-TASS, ACC-SCREENS (permissions.ts:21) |
| Role | TASS |
| Priority | High |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: TASS responsibilities are not yet defined (OQ-02, OQ-07; user decision 2026-10-14). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). |
| Test Data | None beyond preconditions |
| Steps | 1. List every sidebar item label. |
| Expected Result | • Visible: Main, Dashboard, RMA, Accounting Collection, Procurement Pick-up, Suppliers, Transaction Center.<br>• Not visible: Deliveries, Sales Orders, Customers, Drivers, Delivery Calendar, Reports, AM Directory, SKU Master, Data Sampler, Admin Panel. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-006: TASS sees records in the Procurement Pick-up module it is granted

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-006 |
| Title | TASS sees records in the Procurement Pick-up module it is granted |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-TASS, SI-01 (permissions.ts:21; recordAccess.ts:17) |
| Role | TASS |
| Priority | Medium |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: TASS responsibilities are not yet defined (OQ-02, OQ-07; user decision 2026-10-14). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Seeded Procurement Pick-up demo run exists (verify as Admin: Procurement Pick-up list shows a `SAP-DEMO-…-PROCUREMENT_PICKUP` row). |
| Test Data | None beyond preconditions |
| Steps | 1. Click sidebar "Procurement Pick-up".<br>2. Read the list rows. |
| Expected Result | • The list shows the existing Procurement Pick-up records (at least the seeded demo run).<br>• It is a Fail (confirms SI-01) if the list shows "No matching records found." while records exist. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-007: TASS cannot read or write Deliveries

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-007 |
| Title | TASS cannot read or write Deliveries |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-TASS, ACC-API, BR-RECSCOPE (recordAccess.ts:17; records.ts:23-41) |
| Role | TASS |
| Priority | Critical |
| Type | Access Control |
| Preconditions | Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-DEL-002 (D-DEL-01 exists). |
| Test Data | None beyond preconditions |
| Steps | 1. Navigate to `/deliveries`.<br>2. In the TASS session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-DEL-01.id}`<br>3. In the TASS session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-01.id}` body `{"area":"Pasay","remarks":"UAT probe"}`<br>4. In the TASS session, send with the API helper (AGENTS.md §8): `POST /api/records` body `{"company_id":"<any>","category":"Deliveries","reference":"UAT-<RUN>-TASSDEL","delivery_date":"<TODAY>"}` |
| Expected Result | • Step 1: "This page is not available for your account."<br>• Step 2: 403 `{"error":"Record access denied"}`.<br>• Step 3: 403 `{"error":"Record access denied"}`.<br>• Step 4: 403 (`Module access denied` or `Forbidden for this role`); no record created. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: "This page is not available for your account."; • Step 2: 403 `{"error":"Record access denied"}`.; • Step 3: 403 `{"error":"Record access denied"}`.; • Step 4: 403 (`Module access denied` or `Forbidden for this role`); no record created. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ACC-007-01-tass-deliveries-denied.png](../../artifacts/RUN-20261014-02/TC-ACC-007-01-tass-deliveries-denied.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-008: Admin sees every staff module

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-008 |
| Title | Admin sees every staff module |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-ADM, ACC-SCREENS (permissions.ts:22) |
| Role | Admin |
| Priority | Medium |
| Type | Access Control |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. List every sidebar item label. |
| Expected Result | Visible: Main, Dashboard, Deliveries, RMA, Accounting Collection, Procurement Pick-up, Sales Orders, Customers, Suppliers, Drivers, Admin Panel, Delivery Calendar, Reports, AM Directory, Transaction Center, SKU Master, Data Sampler. |
| Actual Result | RUN-20261014-02: Observed the case expected result: Visible: Main, Dashboard, Deliveries, RMA, Accounting Collection, Procurement Pick-up, Sales Orders, Customers, Suppliers, Drivers, Admin Panel, Delivery Calendar, Reports, AM Directory, Transaction Center, SKU Master, Data Sampler. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ACC-008-01-admin-modules.png](../../artifacts/RUN-20261014-02/TC-ACC-008-01-admin-modules.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-009: Driver cannot reach staff screens or staff APIs

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-009 |
| Title | Driver cannot reach staff screens or staff APIs |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-DRV, ACC-API |
| Role | Driver |
| Priority | Critical |
| Type | Access Control |
| Preconditions | Signed in as Driver in its own browser context (session from TC-AUTH-005). |
| Test Data | None beyond preconditions |
| Steps | 1. Navigate to `/deliveries`, then `/admin`.<br>2. In the Driver session, send with the API helper (AGENTS.md §8): `GET /api/users`<br>3. In the Driver session, send with the API helper (AGENTS.md §8): `GET /api/customers`<br>4. In the Driver session, send with the API helper (AGENTS.md §8): `POST /api/records` body `{"company_id":"<any>","category":"Deliveries","reference":"UAT-<RUN>-DRVREC","delivery_date":"<TODAY>"}`<br>5. In the Driver session, send with the API helper (AGENTS.md §8): `GET /api/dashboard/stats` |
| Expected Result | • Step 1: the Driver field app (or "This page is not available for your account.") is shown; no staff list is rendered.<br>• Steps 2, 3, 5: 403 `{"error":"Module access denied"}`.<br>• Step 4: 403; no record created. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: the Driver field app (or "This page is not available for your account.") is shown; no staff list is rendered.; • Steps 2, 3, 5: 403 `{"error":"Module access denied"}`.; • Step 4: 403; no record created. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ACC-009-01-driver-admin.png](../../artifacts/RUN-20261014-02/TC-ACC-009-01-driver-admin.png); [TC-ACC-009-01-driver-deliveries.png](../../artifacts/RUN-20261014-02/TC-ACC-009-01-driver-deliveries.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-010: TASS is not offered record creation it cannot perform (Main → New Delivery)

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-010 |
| Title | TASS is not offered record creation it cannot perform (Main → New Delivery) |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-TASS, SI-22 |
| Role | TASS |
| Priority | Medium |
| Type | Negative |
| Preconditions | **DEFERRED in this cycle: TASS responsibilities are not yet defined (OQ-02, OQ-07; user decision 2026-10-14). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). |
| Test Data | Order Type "RMA", Company "Jollibee Foods Corp. - Quezon City Cluster", Reference `UAT-<RUN>-TASSNEW`, Delivery Date `<TODAY>` |
| Steps | 1. Click sidebar "Main".<br>2. Look for the button "New Delivery". If shown, click it, fill the test data and click "Submit". |
| Expected Result | • Either "New Delivery" is not offered to TASS, or the record is created successfully.<br>• It is a Fail if the form is offered and Submit is refused (e.g. toast with "Forbidden for this role"). |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-011: Driver cannot read a run assigned to another driver

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-011 |
| Title | Driver cannot read a run assigned to another driver |
| Scenario ID | TS-008 |
| Requirement / Rule Ref | R-DRV, BR-11 (recordAccess.ts:26-33) |
| Role | Driver |
| Priority | Critical |
| Type | Access Control |
| Preconditions | Signed in as Driver in its own browser context (session from TC-AUTH-005). Depends on TC-DEL-040 (D-DEL-05 assigned to Manny Santos). |
| Test Data | None beyond preconditions |
| Steps | 1. On the Driver dashboard search the run list for reference `UAT-<RUN>-DEL-05`.<br>2. In the Driver session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-DEL-05.id}`<br>3. In the Driver session, send with the API helper (AGENTS.md §8): `POST /api/records/{D-DEL-05.id}/time-in` body `{"remarks":"UAT probe"}` |
| Expected Result | • Step 1: the run is not listed.<br>• Step 2: 403 `{"error":"Record access denied"}`.<br>• Step 3: 403 `{"error":"Record access denied"}`; D-DEL-05 unchanged. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: the run is not listed.; • Step 2: 403 `{"error":"Record access denied"}`.; • Step 3: 403 `{"error":"Record access denied"}`; D-DEL-05 unchanged. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-012: A per-user module denial takes effect in the UI and the API

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-012 |
| Title | A per-user module denial takes effect in the UI and the API |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | R-ADM, R-LOG, BR-30, ACC-API (permissions.ts:28-44; recordAccess.ts:18) |
| Role | Admin |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). and Signed in as Logistics in its own browser context (session from TC-AUTH-002). Seeded RMA demo run id known. |
| Test Data | None beyond preconditions |
| Steps | 1. Admin: Admin Panel → tab "User Management" → row "Juan Santos" → "Access".<br>2. In "Module Access — Juan Santos (LOGISTICS)" toggle "RMA" off (aria-label "Toggle RMA"), click "Save Changes".<br>3. Logistics: reload the page and list sidebar items.<br>4. In the Logistics session, send with the API helper (AGENTS.md §8): `GET /api/records/{seeded RMA id}`<br>5. Admin: open "Access" for Juan Santos again, click "Reset to Role Default", then "Save Changes".<br>6. Logistics: reload; list sidebar items. |
| Expected Result | • Step 2 shows "Saved!".<br>• Step 3: "RMA" no longer in the Logistics sidebar.<br>• Step 4: 403 `{"error":"Record access denied"}`.<br>• Step 6: "RMA" is back in the sidebar. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 2 shows "Saved!".; • Step 3: "RMA" no longer in the Logistics sidebar.; • Step 4: 403 `{"error":"Record access denied"}`.; • Step 6: "RMA" is back in the sidebar. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ACC-012-02-rma-access-denied.png](../../artifacts/RUN-20261014-02/TC-ACC-012-02-rma-access-denied.png); [TC-ACC-012-06-rma-access-restored.png](../../artifacts/RUN-20261014-02/TC-ACC-012-06-rma-access-restored.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-013: A Driver login without a linked profile sees no runs

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-013 |
| Title | A Driver login without a linked profile sees no runs |
| Scenario ID | TS-008 |
| Requirement / Rule Ref | R-DRV, BR-31, BR-11 (recordAccess.ts:26-33) |
| Role | Driver |
| Priority | High |
| Type | Access Control |
| Preconditions | Depends on TC-ADM-022 (U-DRV2 "UAT Driver Two" exists and its profile was unlinked). |
| Test Data | U-DRV2 |
| Steps | 1. In a new context sign in as U-DRV2 via the email form.<br>2. Read the dashboard.<br>3. In the Driver session, send with the API helper (AGENTS.md §8): (U-DRV2 session) `GET /api/records` |
| Expected Result | • Dashboard shows "No runs ready for execution today."<br>• API returns 200 with an empty array `[]`. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Dashboard shows "No runs ready for execution today."; • API returns 200 with an empty array `[]`. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ACC-013-01-unlinked-driver-dashboard.png](../../artifacts/RUN-20261014-02/TC-ACC-013-01-unlinked-driver-dashboard.png); [TC-ACC-013-02-unlinked-driver-records.json](../../artifacts/RUN-20261014-02/TC-ACC-013-02-unlinked-driver-records.json) |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-014: Driver cannot create customers or suppliers

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-014 |
| Title | Driver cannot create customers or suppliers |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-DRV, OQ-05, BR-22 (customers.ts:31-32; suppliers.ts:30) |
| Role | Driver |
| Priority | Low |
| Type | Access Control |
| Preconditions | Signed in as Driver in its own browser context (session from TC-AUTH-005). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Driver session, send with the API helper (AGENTS.md §8): `POST /api/customers` body `{"name":"UAT Driver Customer"}`<br>2. In the Driver session, send with the API helper (AGENTS.md §8): `POST /api/suppliers` body `{"name":"UAT Driver Supplier","category":"Hardware"}` |
| Expected Result | • Both return 403 `{"error":"Module access denied"}` (Driver accounts never hold the Customers/Suppliers screens). User decision on OQ-05: Drivers must not create customers. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Both return 403 `{"error":"Module access denied"}` (Driver accounts never hold the Customers/Suppliers screens). User decision on OQ-05: Drivers must not create customers. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ACC-014-01-driver-session.png](../../artifacts/RUN-20261014-02/TC-ACC-014-01-driver-session.png); [TC-ACC-014-02-driver-write-denials.json](../../artifacts/RUN-20261014-02/TC-ACC-014-02-driver-write-denials.json) |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-015: Sales Coordinator cannot assign drivers

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-015 |
| Title | Sales Coordinator cannot assign drivers |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-SC, BR-04 (records.ts:811-816, 974-999) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-002 (D-DEL-01). Driver profile id of "Lando Navarro" from `GET /api/drivers` (run as Logistics). |
| Test Data | None beyond preconditions |
| Steps | 1. Open D-DEL-01 (Deliveries list → click the row) and list the workspace tabs.<br>2. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/records` body `{"company_id":"<any>","category":"Deliveries","reference":"UAT-<RUN>-SCDRV","delivery_date":"<TODAY>","driver":"Lando Navarro"}`<br>3. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `PUT /api/records/{D-DEL-01.id}` body `{"driver_id":"<Lando id>","remarks":"UAT probe"}`<br>4. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `GET /api/records/{D-DEL-01.id}` and read `driver`. |
| Expected Result | • Step 1: no "Dispatch & Logistics" tab for Sales Coordinator.<br>• Step 2: 403 `{"error":"Sales Coordinator cannot assign drivers — use the Logistics role"}`.<br>• Step 3: either refused (4xx) or accepted without changing the driver.<br>• Step 4: `driver` is still the value assigned by Logistics (or empty), never "Lando Navarro". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: no "Dispatch & Logistics" tab for Sales Coordinator.; • Step 2: 403 `{"error":"Sales Coordinator cannot assign drivers — use the Logistics role"}`.; • Step 3: either refused (4xx) or accepted without changing the driver.; • Step 4: `driver` is still the value assigned by Logistics (or empty), never "Lando Navarro". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ACC-015-01-sales-workspace.png](../../artifacts/RUN-20261014-02/TC-ACC-015-01-sales-workspace.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ACC-016: Temporary access request actually reaches an Admin

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-016 |
| Title | Temporary access request actually reaches an Admin |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | SI-19 (client/src/components/AccessRequestModal.tsx:25-45) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Admin has denied Deliveries for Maria Reyes (Admin Panel → User Management → Maria Reyes → "Access" → toggle "Deliveries" off → "Save Changes"). Restore it at the end. |
| Test Data | Module "Deliveries", reason "UAT access request" |
| Steps | 1. Reload the SC page. On Dashboard click the card "Deliveries Scheduled Today".<br>2. In the "Request Temporary Access" modal fill "Module / Screen Needed" and "Reason for Request", click "Submit Request".<br>3. As Admin, open the notification bell (title "Notifications").<br>4. As Admin restore SC access: Admin Panel → User Management → Maria Reyes → "Access" → "Reset to Role Default" → "Save Changes". |
| Expected Result | • Step 2 shows "Request Sent" and "Your admin has been notified."<br>• Step 3: the Admin has a new notification about the request. (Fail if no notification or request record exists anywhere: SI-19.) |
| Actual Result | RUN-20261014-02: Sales saw Request Sent and Your admin has been notified. Admin Notifications showed No notifications yet; no request notification appeared. Maria Reyes access was reset to role defaults and the Deliveries sidebar entry returned. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-ACC-016-01-maria-deliveries-denied.png](../../artifacts/RUN-20261014-02/TC-ACC-016-01-maria-deliveries-denied.png); [TC-ACC-016-02-sales-dashboard-denied.png](../../artifacts/RUN-20261014-02/TC-ACC-016-02-sales-dashboard-denied.png); [TC-ACC-016-03-request-modal.png](../../artifacts/RUN-20261014-02/TC-ACC-016-03-request-modal.png); [TC-ACC-016-04-request-filled.png](../../artifacts/RUN-20261014-02/TC-ACC-016-04-request-filled.png); [TC-ACC-016-05-request-sent-message.png](../../artifacts/RUN-20261014-02/TC-ACC-016-05-request-sent-message.png); [TC-ACC-016-06-admin-notifications.png](../../artifacts/RUN-20261014-02/TC-ACC-016-06-admin-notifications.png); [TC-ACC-016-07-maria-access-restored.png](../../artifacts/RUN-20261014-02/TC-ACC-016-07-maria-access-restored.png); [TC-ACC-016-08-access-modal-closed.png](../../artifacts/RUN-20261014-02/TC-ACC-016-08-access-modal-closed.png); [TC-ACC-016-09-sales-access-restored.png](../../artifacts/RUN-20261014-02/TC-ACC-016-09-sales-access-restored.png) |
| Defect ID | RUN-20261014-02: DEF-016 |
### TC-ACC-017: Logistics has view-only RMA in the UI

| Field | Description |
|---|---|
| Test Case ID | TC-ACC-017 |
| Title | Logistics has view-only RMA in the UI |
| Scenario ID | TS-004 |
| Requirement / Rule Ref | R-LOG, WF-3 (DeliveriesPage.tsx:77-82; DeliveryRecordWorkspace.tsx:94-99) |
| Role | Logistics |
| Priority | High |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: RMA is out of focus until it is decided who starts RMA runs (OQ-01; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-RMA-001 (D-RMA-01). |
| Test Data | None beyond preconditions |
| Steps | 1. Click sidebar "RMA". Read the page subtitle and the toolbar buttons.<br>2. Click the D-RMA-01 row. List the workspace tabs.<br>3. Open tab "Comments".<br>4. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/records/{D-RMA-01.id}/comments` body `{"body":"UAT probe"}` |
| Expected Result | • Step 1: subtitle "View returns and pull-out records (read-only — driver assignment not available for Logistics on this screen)."; no "New Record" button; no row checkboxes.<br>• Step 2: no "Dispatch & Logistics" tab.<br>• Step 3: text "RMA is view only for Logistics. You can read the discussion here." and no comment composer.<br>• Step 4: 403 `{"error":"Logistics has view-only access to RMA records"}`. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |