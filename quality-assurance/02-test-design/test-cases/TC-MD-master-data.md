# Test Cases: Companies, Customers and Suppliers

| Document control | |
|---|---|
| Title | Test Cases: Companies, Customers and Suppliers |
| Document ID | QA-TC-MD |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Master data used by records. Companies have no create screen (API only, `companies.ts:21`). Customer edits require a reason and use optimistic concurrency (`customers.ts:95-127`).

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-MD-001](#tc-md-001-sales-coordinator-creates-a-company-api-and-it-is-selectable-on-records) | Sales Coordinator creates a company (API) and it is selectable on records | Sales Coordinator | Medium | Positive | TS-012 | Run |
| [TC-MD-002](#tc-md-002-company-creation-rules) | Company creation rules | Logistics | Low | Negative | TS-012 | Run |
| [TC-MD-003](#tc-md-003-sales-coordinator-creates-a-customer) | Sales Coordinator creates a customer | Sales Coordinator | High | Positive | TS-012 | Run |
| [TC-MD-004](#tc-md-004-customer-name-is-required-on-create) | Customer name is required on create | Sales Coordinator | Medium | Negative | TS-012 | Run |
| [TC-MD-005](#tc-md-005-customer-create-validates-email-and-phone-like-edit-does) | Customer create validates email and phone like edit does | Sales Coordinator | Medium | Negative | TS-012 | Run |
| [TC-MD-006](#tc-md-006-malformed-customer-input-gets-a-prompt-error-response) | Malformed customer input gets a prompt error response | Sales Coordinator | Medium | Negative | TS-012 | Run |
| [TC-MD-007](#tc-md-007-logistics-edits-a-customer-with-a-reason-change-is-audited) | Logistics edits a customer with a reason; change is audited | Logistics | High | Positive | TS-012 | Run |
| [TC-MD-008](#tc-md-008-customer-edit-validations) | Customer edit validations | Sales Coordinator | Medium | Negative | TS-012 | Run |
| [TC-MD-009](#tc-md-009-concurrent-customer-edits-do-not-overwrite-each-other) | Concurrent customer edits do not overwrite each other | Sales Coordinator | Medium | Negative | TS-012 | Run |
| [TC-MD-010](#tc-md-010-supplier-creation-and-category-validation) | Supplier creation and category validation | Sales Coordinator | Medium | Negative | TS-012 | Run |
| [TC-MD-011](#tc-md-011-tass-cannot-create-suppliers-or-customers) | TASS cannot create suppliers or customers | TASS | Medium | Access Control | TS-010 | Deferred |

## Test cases

### TC-MD-001: Sales Coordinator creates a company (API) and it is selectable on records

| Field | Description |
|---|---|
| Test Case ID | TC-MD-001 |
| Title | Sales Coordinator creates a company (API) and it is selectable on records |
| Scenario ID | TS-012 |
| Requirement / Rule Ref | R-SC, BR-23, WF-8 (companies.ts:21-40) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | Company `UAT Company Alpha <RUN>`, SAP `SAP-CO-UAT1` |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/companies` body `{"name":"UAT Company Alpha <RUN>","sap_number":"SAP-CO-UAT1","address":"1 UAT St","contact_person":"Uma Tester"}`<br>2. Deliveries → "New Record"; type `UAT Company` in "Company Name *". Then "Cancel". |
| Expected Result | • 201 with `name` and `sap_number` echoed.<br>• The combobox offers "UAT Company Alpha <RUN>". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • 201 with `name` and `sap_number` echoed.; • The combobox offers "UAT Company Alpha <RUN>". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-MD-001-02-company-option.png](../../artifacts/RUN-20261014-02/TC-MD-001-02-company-option.png); [TC-MD-001-03-company-selected.png](../../artifacts/RUN-20261014-02/TC-MD-001-03-company-selected.png) |
| Defect ID | RUN-20261014-02: — |
### TC-MD-002: Company creation rules

| Field | Description |
|---|---|
| Test Case ID | TC-MD-002 |
| Title | Company creation rules |
| Scenario ID | TS-012 |
| Requirement / Rule Ref | BR-23, R-LOG |
| Role | Logistics |
| Priority | Low |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). and Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/companies` body `{"sap_number":"X"}`<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/companies` body `{"name":"UAT Logistics Company"}` |
| Expected Result | • Step 1: 400 "name is required".<br>• Step 2: 403 "Forbidden for this role". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 400 "name is required".; • Step 2: 403 "Forbidden for this role". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-MD-003: Sales Coordinator creates a customer

| Field | Description |
|---|---|
| Test Case ID | TC-MD-003 |
| Title | Sales Coordinator creates a customer |
| Scenario ID | TS-012 |
| Requirement / Rule Ref | R-SC, WF-8 (customers.ts:32-72; CustomersView.tsx:188-239) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | D-CUS-01 |
| Steps | 1. Sidebar "Customers" → "New Customer".<br>2. Fill D-CUS-01 values; click "Create Customer".<br>3. Open the new row → tab "Audit Trail". |
| Expected Result | • Row "UAT Customer Alpha <RUN>" appears in "Merchant Customer Registry".<br>• Audit Trail shows "Maria Reyes created this customer". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Row "UAT Customer Alpha <RUN>" appears in "Merchant Customer Registry".; • Audit Trail shows "Maria Reyes created this customer". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-MD-003-01-customer-form.png](../../artifacts/RUN-20261014-02/TC-MD-003-01-customer-form.png); [TC-MD-003-02-customer-created.png](../../artifacts/RUN-20261014-02/TC-MD-003-02-customer-created.png); [TC-MD-003-03-customer-page2.png](../../artifacts/RUN-20261014-02/TC-MD-003-03-customer-page2.png); [TC-MD-003-04-audit.png](../../artifacts/RUN-20261014-02/TC-MD-003-04-audit.png) |
| Defect ID | RUN-20261014-02: — |
### TC-MD-004: Customer name is required on create

| Field | Description |
|---|---|
| Test Case ID | TC-MD-004 |
| Title | Customer name is required on create |
| Scenario ID | TS-012 |
| Requirement / Rule Ref | BR-21 |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | None beyond preconditions |
| Steps | 1. "New Customer"; leave "Customer Name *" empty; "Create Customer".<br>2. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/customers` body `{"contact_person":"X"}` |
| Expected Result | • "Customer Name is required"; nothing created.<br>• API 400 "name is required". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • "Customer Name is required"; nothing created.; • API 400 "name is required". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-MD-004-01-name-required.png](../../artifacts/RUN-20261014-02/TC-MD-004-01-name-required.png) |
| Defect ID | RUN-20261014-02: — |
### TC-MD-005: Customer create validates email and phone like edit does

| Field | Description |
|---|---|
| Test Case ID | TC-MD-005 |
| Title | Customer create validates email and phone like edit does |
| Scenario ID | TS-012 |
| Requirement / Rule Ref | BR-21, SI-12 (customers.ts:32-58; customerValidation.ts) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | Name `UAT Customer Bad <RUN>`, Email `not-an-email`, Phone `CALL-ME!!` |
| Steps | 1. "New Customer" with the test data; "Create Customer". |
| Expected Result | Refused with "Enter a valid email address, like name@company.com." (and a phone error). Fail (SI-12) if the customer is created. |
| Actual Result | RUN-20261014-02: The create form accepted invalid email not-an-email and phone CALL-ME!! through browser-native validation, without the expected application email and phone errors. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-MD-005-01-invalid-customer.png](../../artifacts/RUN-20261014-02/TC-MD-005-01-invalid-customer.png) |
| Defect ID | RUN-20261014-02: DEF-020 |
### TC-MD-006: Malformed customer input gets a prompt error response

| Field | Description |
|---|---|
| Test Case ID | TC-MD-006 |
| Title | Malformed customer input gets a prompt error response |
| Scenario ID | TS-012 |
| Requirement / Rule Ref | SI-05 (customers.ts:32) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/customers` body `{"name":12345}` with `AbortSignal.timeout(15000)` |
| Expected Result | Within 15 s an HTTP 4xx response. Fail (SI-05) if no response within 15 s or HTTP 500. |
| Actual Result | RUN-20261014-02: POST /api/customers with {"name":12345} produced no response within the 15-second timeout; the request remained unresolved. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: DEF-017 |
### TC-MD-007: Logistics edits a customer with a reason; change is audited

| Field | Description |
|---|---|
| Test Case ID | TC-MD-007 |
| Title | Logistics edits a customer with a reason; change is audited |
| Scenario ID | TS-012 |
| Requirement / Rule Ref | R-LOG, BR-21 (CustomerEditForm.tsx; customers.ts:95-127) |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-MD-003. |
| Test Data | None beyond preconditions |
| Steps | 1. Customers → open "UAT Customer Alpha <RUN>" → "Edit customer".<br>2. City `Pasig`; "Reason for change *" `UAT city correction`; "Save changes".<br>3. Tab "Audit Trail". |
| Expected Result | • "Changes saved. The reason was added to the Audit Trail."<br>• Audit Trail entry "Juan Santos edited this customer" with Field City, Before "Quezon City", After "Pasig", reason shown. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • "Changes saved. The reason was added to the Audit Trail."; • Audit Trail entry "Juan Santos edited this customer" with Field City, Before "Quezon City", After "Pasig", reason shown. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-MD-007-01-city-saved.png](../../artifacts/RUN-20261014-02/TC-MD-007-01-city-saved.png) |
| Defect ID | RUN-20261014-02: — |
### TC-MD-008: Customer edit validations

| Field | Description |
|---|---|
| Test Case ID | TC-MD-008 |
| Title | Customer edit validations |
| Scenario ID | TS-012 |
| Requirement / Rule Ref | BR-21 |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-MD-007. |
| Test Data | None beyond preconditions |
| Steps | 1. "Edit customer"; change nothing; "Save changes".<br>2. Email `bad@`; reason `x`; "Save changes".<br>3. Restore email; change Phone to `0917 000 0000`; leave reason empty; "Save changes".<br>4. Name = empty; reason `x`; "Save changes". Then "Cancel" / discard. |
| Expected Result | • Step 1: "Change at least one field before saving."<br>• Step 2: "Enter a valid email address, like name@company.com."<br>• Step 3: "Enter a reason for this change."<br>• Step 4: "Customer name is required." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: "Change at least one field before saving."; • Step 2: "Enter a valid email address, like name@company.com."; • Step 3: "Enter a reason for this change."; • Step 4: "Customer name is required." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-MD-008-01-no-change.png](../../artifacts/RUN-20261014-02/TC-MD-008-01-no-change.png); [TC-MD-008-02-bad-email.png](../../artifacts/RUN-20261014-02/TC-MD-008-02-bad-email.png); [TC-MD-008-03-reason-required.png](../../artifacts/RUN-20261014-02/TC-MD-008-03-reason-required.png); [TC-MD-008-04-name-required.png](../../artifacts/RUN-20261014-02/TC-MD-008-04-name-required.png) |
| Defect ID | RUN-20261014-02: — |
### TC-MD-009: Concurrent customer edits do not overwrite each other

| Field | Description |
|---|---|
| Test Case ID | TC-MD-009 |
| Title | Concurrent customer edits do not overwrite each other |
| Scenario ID | TS-012 |
| Requirement / Rule Ref | BR-21 (customers.ts:103, 112, 124) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). and Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-MD-007. |
| Test Data | None beyond preconditions |
| Steps | 1. SC and Logistics both open "UAT Customer Alpha <RUN>" → "Edit customer".<br>2. Logistics: Contact person `Lucia`, reason `UAT first`, "Save changes".<br>3. SC: Contact person `Sofia`, reason `UAT second`, "Save changes". |
| Expected Result | • Logistics save succeeds.<br>• SC gets "Someone else saved changes to this customer after you opened it…" with "Discard my edits and load the latest values"; contact person stays "Lucia". |
| Actual Result | RUN-20261014-02: The concurrent edit did not show the expected stale-edit conflict with latest value Lucia. The Sales form remained on Sofia with an unsaved change, and the expected load-latest action was not observed. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-MD-009-01-stale-edit-conflict.png](../../artifacts/RUN-20261014-02/TC-MD-009-01-stale-edit-conflict.png) |
| Defect ID | RUN-20261014-02: DEF-021 |
### TC-MD-010: Supplier creation and category validation

| Field | Description |
|---|---|
| Test Case ID | TC-MD-010 |
| Title | Supplier creation and category validation |
| Scenario ID | TS-012 |
| Requirement / Rule Ref | BR-22, SI-13, R-SC (suppliers.ts:30-45; SuppliersView.tsx) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | D-SUP-01 |
| Steps | 1. Sidebar "Suppliers" → "New Supplier"; fill D-SUP-01 (Category "Electronics"); "Create Supplier".<br>2. "New Supplier" with empty name; "Create Supplier".<br>3. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/suppliers` body `{"name":"UAT Supplier Odd <RUN>","category":"Gadgets"}` |
| Expected Result | • Step 1: row "UAT Supplier Alpha <RUN>" with Category Electronics.<br>• Step 2: "Supplier Name is required".<br>• Step 3: 400 (unknown category). Fail (SI-13) if 201. |
| Actual Result | RUN-20261014-02: POST /api/suppliers with category Gadgets returned HTTP 201 instead of expected HTTP 400. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-MD-010-01-supplier-form.png](../../artifacts/RUN-20261014-02/TC-MD-010-01-supplier-form.png); [TC-MD-010-02-supplier-created.png](../../artifacts/RUN-20261014-02/TC-MD-010-02-supplier-created.png); [TC-MD-010-03-empty-name.png](../../artifacts/RUN-20261014-02/TC-MD-010-03-empty-name.png) |
| Defect ID | RUN-20261014-02: DEF-022 |
### TC-MD-011: TASS cannot create suppliers or customers

| Field | Description |
|---|---|
| Test Case ID | TC-MD-011 |
| Title | TASS cannot create suppliers or customers |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-TASS, BR-22 |
| Role | TASS |
| Priority | Medium |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: TASS responsibilities are not yet defined (OQ-02, OQ-07; user decision 2026-10-14). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Suppliers": look for "New Supplier".<br>2. In the TASS session, send with the API helper (AGENTS.md §8): `POST /api/suppliers` body `{"name":"UAT TASS Supplier","category":"Hardware"}`<br>3. In the TASS session, send with the API helper (AGENTS.md §8): `POST /api/customers` body `{"name":"UAT TASS Customer"}` |
| Expected Result | • No "New Supplier" button.<br>• Step 2: 403 "Forbidden for this role".<br>• Step 3: 403 "Module access denied". |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |