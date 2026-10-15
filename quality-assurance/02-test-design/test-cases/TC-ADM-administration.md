# Test Cases: Administration

| Document control | |
|---|---|
| Title | Test Cases: Administration |
| Document ID | QA-TC-ADM |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Admin Panel (tabs "User Management", "System Audit Log", "Integrations") and module access. The "Microsoft user Object ID (optional)" field and Microsoft identity linking are out of scope; always leave it empty.

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-ADM-001](#tc-adm-001-user-management-lists-the-seeded-accounts) | User Management lists the seeded accounts | Admin | Medium | Positive | TS-016 | Run |
| [TC-ADM-002](#tc-adm-002-admin-creates-a-sales-coordinator-who-can-sign-in) | Admin creates a Sales Coordinator who can sign in | Admin | High | Positive | TS-016 | Run |
| [TC-ADM-003](#tc-adm-003-admin-creates-the-lockout-test-account) | Admin creates the lockout test account | Admin | Medium | Positive | TS-016 | Run |
| [TC-ADM-004](#tc-adm-004-weak-passwords-and-malformed-emails-are-refused) | Weak passwords and malformed emails are refused | Admin | Medium | Negative | TS-016 | Run |
| [TC-ADM-005](#tc-adm-005-duplicate-email-is-refused) | Duplicate email is refused | Admin | Medium | Negative | TS-016 | Run |
| [TC-ADM-006](#tc-adm-006-required-fields-for-user-creation) | Required fields for user creation | Admin | Low | Negative | TS-016 | Run |
| [TC-ADM-007](#tc-adm-007-create-a-driver-login-linked-to-an-existing-profile) | Create a Driver login linked to an existing profile | Admin | High | Positive | TS-016 | Run |
| [TC-ADM-008](#tc-adm-008-editing-a-user-to-an-existing-email-gets-a-prompt-clear-error) | Editing a user to an existing email gets a prompt, clear error | Admin | Medium | Negative | TS-016 | Run |
| [TC-ADM-009](#tc-adm-009-admin-renames-a-user) | Admin renames a user | Admin | Low | Positive | TS-016 | Run |
| [TC-ADM-010](#tc-adm-010-user-administration-changes-are-audited) | User administration changes are audited | Admin | Medium | Negative | TS-016 | Run |
| [TC-ADM-011](#tc-adm-011-deactivation-ends-sessions-and-blocks-sign-in-activation-restores-it) | Deactivation ends sessions and blocks sign-in; activation restores it | Admin | Critical | Positive | TS-016 | Run |
| [TC-ADM-012](#tc-adm-012-admin-cannot-lock-themselves-out) | Admin cannot lock themselves out | Admin | High | Negative | TS-016 | Run |
| [TC-ADM-013](#tc-adm-013-delete-is-refused-for-users-with-records-allowed-for-unused-users) | Delete is refused for users with records; allowed for unused users | Admin | High | Boundary | TS-016 | Run |
| [TC-ADM-014](#tc-adm-014-grant-and-reset-module-access-for-a-user) | Grant and reset module access for a user | Admin | High | Positive | TS-016 | Run |
| [TC-ADM-015](#tc-adm-015-module-access-save-is-protected-against-stale-edits) | Module access save is protected against stale edits | Admin | Medium | Negative | TS-016 | Run |
| [TC-ADM-016](#tc-adm-016-audit-log-can-be-filtered-by-action) | Audit log can be filtered by action | Admin | Low | Negative | TS-016 | Run |
| [TC-ADM-017](#tc-adm-017-integrations-tab-and-test-email-mock-mailer) | Integrations tab and test email (mock mailer) | Admin | Low | Positive | TS-016 | Deferred |
| [TC-ADM-018](#tc-adm-018-non-admins-cannot-use-administration-apis) | Non-admins cannot use administration APIs | Logistics | High | Access Control | TS-010 | Run |
| [TC-ADM-019](#tc-adm-019-changing-a-driver-login-to-another-role-unlinks-its-profile) | Changing a Driver login to another role unlinks its profile | Admin | Medium | Positive | TS-016 | Run |
| [TC-ADM-020](#tc-adm-020-data-sampler-generates-sample-records) | Data Sampler generates sample records | Admin | Low | Positive | TS-016 | Run |
| [TC-ADM-021](#tc-adm-021-linking-a-profile-already-linked-to-another-login-is-refused) | Linking a profile already linked to another login is refused | Admin | Medium | Negative | TS-016 | Run |
| [TC-ADM-022](#tc-adm-022-new-driver-login-with-a-new-profile-then-unlinked) | New Driver login with a new profile, then unlinked | Admin | Medium | Positive | TS-016 | Run |
| [TC-ADM-023](#tc-adm-023-admin-reviews-the-completed-main-chain-end-of-ts-001) | Admin reviews the completed main chain (end of TS-001) | Admin | High | Positive | TS-001 | Run |

## Test cases

### TC-ADM-001: User Management lists the seeded accounts

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-001 |
| Title | User Management lists the seeded accounts |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | R-ADM, WF-7 (users.ts:14-26; AdminPanel.tsx:471-584) |
| Role | Admin |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. Admin Panel → tab "User Management".<br>2. Read the count text and the table. |
| Expected Result | "N registered accounts"; rows include Maria Reyes (Sales Coordinator), Juan Santos (Logistics), Ana Cruz (TASS), System Admin (Admin), John Doe (Driver), all "Active", Auth "Email only". |
| Actual Result | RUN-20261014-02: Observed the case expected result: "N registered accounts"; rows include Maria Reyes (Sales Coordinator), Juan Santos (Logistics), Ana Cruz (TASS), System Admin (Admin), John Doe (Driver), all "Active", Auth "Email only". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-001-02-seeded-users.png](../../artifacts/RUN-20261014-02/TC-ADM-001-02-seeded-users.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-002: Admin creates a Sales Coordinator who can sign in

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-002 |
| Title | Admin creates a Sales Coordinator who can sign in |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | R-ADM, BR-27, WF-7 (users.ts:31-92) |
| Role | Admin |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). A password for U-SC2 chosen by the user (not written down). |
| Test Data | U-SC2 |
| Steps | 1. Admin Panel → tab "User Management".<br>2. "Create User"; Full Name `UAT Sales Two`; Email `uat.sales2@microgenesis.test`; Password (user-supplied); Role "Sales Coordinator"; leave Microsoft field empty; "Create".<br>3. In a new context sign in as U-SC2. |
| Expected Result | • Row "UAT Sales Two", Sales Coordinator, Active.<br>• U-SC2 lands on `/dashboard`. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Row "UAT Sales Two", Sales Coordinator, Active.; • U-SC2 lands on `/dashboard`. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-002-02-user-created.png](../../artifacts/RUN-20261014-02/TC-ADM-002-02-user-created.png); [TC-ADM-002-03-user-sign-in.png](../../artifacts/RUN-20261014-02/TC-ADM-002-03-user-sign-in.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-003: Admin creates the lockout test account

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-003 |
| Title | Admin creates the lockout test account |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-27 |
| Role | Admin |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | U-LOCK |
| Steps | 1. "Create User": `UAT Lockout`, `uat.lockout@microgenesis.test`, user-supplied password, Role "Logistics", "Create". |
| Expected Result | Row "UAT Lockout" Active (used by TC-AUTH-013). |
| Actual Result | RUN-20261014-02: Observed the case expected result: Row "UAT Lockout" Active (used by TC-AUTH-013). / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-003-01-lockout-user-created.png](../../artifacts/RUN-20261014-02/TC-ADM-003-01-lockout-user-created.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-004: Weak passwords and malformed emails are refused

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-004 |
| Title | Weak passwords and malformed emails are refused |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-27, SI-15 (users.ts:33-47) |
| Role | Admin |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Admin session, send with the API helper (AGENTS.md §8): `POST /api/users` body `{"name":"UAT Weak","email":"not-an-email","password":"1","role":"TASS"}`<br>2. If created, note it for cleanup in TC-ADM-013. |
| Expected Result | 400 naming the email format and/or password policy. Fail (SI-15) if 201. |
| Actual Result | RUN-20261014-02: The Admin creation flow accepted malformed email not-an-email and a weak password for UAT Weak; the created user appeared Active. The account was later removed under TC-ADM-013. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: DEF-001 |
### TC-ADM-005: Duplicate email is refused

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-005 |
| Title | Duplicate email is refused |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-27 (users.ts:81-89) |
| Role | Admin |
| Priority | Medium |
| Type | Negative |
| Preconditions | Depends on TC-ADM-002. |
| Test Data | None beyond preconditions |
| Steps | 1. "Create User" with email `UAT.SALES2@microgenesis.test` (upper case), any name/password, role TASS. |
| Expected Result | "An account with this email already exists." |
| Actual Result | RUN-20261014-02: Observed the case expected result: "An account with this email already exists." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-005-02-duplicate-email.png](../../artifacts/RUN-20261014-02/TC-ADM-005-02-duplicate-email.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-006: Required fields for user creation

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-006 |
| Title | Required fields for user creation |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-27 |
| Role | Admin |
| Priority | Low |
| Type | Negative |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. "Create User"; leave Name empty; "Create".<br>2. In the Admin session, send with the API helper (AGENTS.md §8): `POST /api/users` body `{"name":"X","email":"x@y.test","password":"Abc12345!","role":"MANAGER"}` |
| Expected Result | • "Name, email, and password are required".<br>• 400 "role must be one of: SALES_COORDINATOR, LOGISTICS, TASS, ADMIN, DRIVER". |
| Actual Result | RUN-20261014-02: Submitting the empty user form showed a required-field message that did not match the expected Full Name wording. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-ADM-006-01-empty-required-fields.png](../../artifacts/RUN-20261014-02/TC-ADM-006-01-empty-required-fields.png); [TC-ADM-006-01-required-fields.png](../../artifacts/RUN-20261014-02/TC-ADM-006-01-required-fields.png); [TC-ADM-006-02-name-required-message.png](../../artifacts/RUN-20261014-02/TC-ADM-006-02-name-required-message.png) |
| Defect ID | RUN-20261014-02: DEF-002 |
### TC-ADM-007: Create a Driver login linked to an existing profile

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-007 |
| Title | Create a Driver login linked to an existing profile |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-31, WF-7 (driverLogin.ts:31-60; AdminPanel.tsx:535-545) |
| Role | Admin |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). Depends on TC-DIR-010 (UAT Driver Alpha active, unlinked). |
| Test Data | U-DRVA |
| Steps | 1. "Create User": `UAT Driver Alpha`, `uat.driver.alpha@microgenesis.test`, user-supplied password, Role "Driver"; in "Driver profile" choose "UAT Driver Alpha"; "Create".<br>2. Drivers → "Manager": read the badge on "UAT Driver Alpha". |
| Expected Result | • User created with driver profile "UAT Driver Alpha".<br>• Badge "Login linked". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • User created with driver profile "UAT Driver Alpha".; • Badge "Login linked". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-007-01-driver-login-created.png](../../artifacts/RUN-20261014-02/TC-ADM-007-01-driver-login-created.png); [TC-ADM-007-02-profile-linked.png](../../artifacts/RUN-20261014-02/TC-ADM-007-02-profile-linked.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-008: Editing a user to an existing email gets a prompt, clear error

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-008 |
| Title | Editing a user to an existing email gets a prompt, clear error |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-27, SI-05 (users.ts:149-187) |
| Role | Admin |
| Priority | Medium |
| Type | Negative |
| Preconditions | Depends on TC-ADM-002. |
| Test Data | None beyond preconditions |
| Steps | 1. Row "UAT Sales Two" → "Edit"; Email `sales@microgenesis.com`; "Save". Wait up to 15 s. |
| Expected Result | Within 15 s an error says the email is already used; the row keeps its email. Fail (SI-05) if the save spins with no response or a generic failure dialog "Could not update user" with a 500. |
| Actual Result | RUN-20261014-02: Updating UAT Sales Two to existing sales@microgenesis.com left the row in a pending save state with a spinner beyond 15 seconds and no prompt error. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-ADM-008-01-duplicate-email.png](../../artifacts/RUN-20261014-02/TC-ADM-008-01-duplicate-email.png) |
| Defect ID | RUN-20261014-02: DEF-017 |
### TC-ADM-009: Admin renames a user

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-009 |
| Title | Admin renames a user |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | WF-7 |
| Role | Admin |
| Priority | Low |
| Type | Positive |
| Preconditions | Depends on TC-ADM-002. |
| Test Data | None beyond preconditions |
| Steps | 1. Row "UAT Sales Two" → "Edit"; Name `UAT Sales Two Renamed`; "Save". |
| Expected Result | Row shows the new name. |
| Actual Result | RUN-20261014-02: Observed the case expected result: Row shows the new name. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-009-01-user-renamed.png](../../artifacts/RUN-20261014-02/TC-ADM-009-01-user-renamed.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-010: User administration changes are audited

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-010 |
| Title | User administration changes are audited |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | SI-10, WF-7 (users.ts:149-300) |
| Role | Admin |
| Priority | Medium |
| Type | Negative |
| Preconditions | Depends on TC-ADM-009 and TC-ADM-011. |
| Test Data | None beyond preconditions |
| Steps | 1. "System Audit Log": Action "All Actions"; From/To `<TODAY>`; "Apply Filters".<br>2. Look for Record Type "User" entries for UAT Sales Two (rename, deactivate, activate). |
| Expected Result | An audit entry exists for each user change. Fail (SI-10) if none exist. |
| Actual Result | RUN-20261014-02: The 2026-10-14 System Audit Log query returned 79 events and 9 UserPermission events, but zero User record-type events. Rename, deactivate, and activate actions on U-SC2 had no corresponding User audit rows. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-ADM-010-01-user-audit-missing.png](../../artifacts/RUN-20261014-02/TC-ADM-010-01-user-audit-missing.png) |
| Defect ID | RUN-20261014-02: DEF-013 |
### TC-ADM-011: Deactivation ends sessions and blocks sign-in; activation restores it

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-011 |
| Title | Deactivation ends sessions and blocks sign-in; activation restores it |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | AUTH-3, WF-7 (users.ts:190-239; auth.ts:85-90; routes/auth.ts:31-33) |
| Role | Admin |
| Priority | Critical |
| Type | Positive |
| Preconditions | U-SC2 signed in in its own context (from TC-ADM-002). |
| Test Data | None beyond preconditions |
| Steps | 1. Admin: row "UAT Sales Two Renamed" → "Deactivate" → dialog "Deactivate …?" → "Deactivate user".<br>2. U-SC2 context: click any sidebar item, or run `fetch('/api/auth/me').then(async r=>[r.status, await r.text()])`.<br>3. Sign in again as U-SC2.<br>4. Admin: "Activate" → "Activate user". Sign in as U-SC2 again. |
| Expected Result | • Row Status "Deactivated".<br>• Step 2: 401 "Session no longer valid — please log in again" (UI returns to login).<br>• Step 3: "Account is deactivated".<br>• Step 4: sign-in succeeds. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Row Status "Deactivated".; • Step 2: 401 "Session no longer valid — please log in again" (UI returns to login).; • Step 3: "Account is deactivated".; • Step 4: sign-in succeeds. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-011-01-sales-two-session.png](../../artifacts/RUN-20261014-02/TC-ADM-011-01-sales-two-session.png); [TC-ADM-011-02-user-deactivated.png](../../artifacts/RUN-20261014-02/TC-ADM-011-02-user-deactivated.png); [TC-ADM-011-03-deactivated-signin.png](../../artifacts/RUN-20261014-02/TC-ADM-011-03-deactivated-signin.png); [TC-ADM-011-04-user-activated.png](../../artifacts/RUN-20261014-02/TC-ADM-011-04-user-activated.png); [TC-ADM-011-05-reactivated-signin.png](../../artifacts/RUN-20261014-02/TC-ADM-011-05-reactivated-signin.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-012: Admin cannot lock themselves out

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-012 |
| Title | Admin cannot lock themselves out |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-28 (users.ts:160-162, 194-196, 249-251) |
| Role | Admin |
| Priority | High |
| Type | Negative |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). Admin user id from `GET /api/auth/me`. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Admin session, send with the API helper (AGENTS.md §8): `PATCH /api/users/<own id>/deactivate`<br>2. In the Admin session, send with the API helper (AGENTS.md §8): `DELETE /api/users/<own id>`<br>3. In the Admin session, send with the API helper (AGENTS.md §8): `PATCH /api/users/<own id>` body `{"role":"TASS"}` |
| Expected Result | • 400 "You cannot deactivate your own account".<br>• 400 "You cannot delete your own account".<br>• 400 "You cannot change your own admin role. Another admin must perform this action to prevent self-lockout." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • 400 "You cannot deactivate your own account".; • 400 "You cannot delete your own account".; • 400 "You cannot change your own admin role. Another admin must perform this action to prevent self-lockout." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-013: Delete is refused for users with records; allowed for unused users

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-013 |
| Title | Delete is refused for users with records; allowed for unused users |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-29 (users.ts:245-300) |
| Role | Admin |
| Priority | High |
| Type | Boundary |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | U-TEMP `UAT Temp`, `uat.temp@microgenesis.test` |
| Steps | 1. Row "Maria Reyes" → "Delete" → "Delete user".<br>2. "Create User" U-TEMP (role TASS); then its "Delete" → "Delete user".<br>3. If TC-ADM-004 created "UAT Weak", delete it too. |
| Expected Result | • Step 1: refused, "Cannot delete this user because they have N associated record(s)… Deactivate the account instead…"; Maria remains.<br>• Step 2: U-TEMP disappears from the list. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: refused, "Cannot delete this user because they have N associated record(s)… Deactivate the account instead…"; Maria remains.; • Step 2: U-TEMP disappears from the list. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-013-01-protected-user.png](../../artifacts/RUN-20261014-02/TC-ADM-013-01-protected-user.png); [TC-ADM-013-02-temp-created.png](../../artifacts/RUN-20261014-02/TC-ADM-013-02-temp-created.png); [TC-ADM-013-03-temp-deleted.png](../../artifacts/RUN-20261014-02/TC-ADM-013-03-temp-deleted.png); [TC-ADM-013-04-weak-user-cleaned.png](../../artifacts/RUN-20261014-02/TC-ADM-013-04-weak-user-cleaned.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-014: Grant and reset module access for a user

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-014 |
| Title | Grant and reset module access for a user |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-30, R-SC, WF-7 (permissions.ts:99-117; AdminPanel.tsx:135-185) |
| Role | Admin |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). and Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | None beyond preconditions |
| Steps | 1. Admin Panel → tab "User Management". Row "Maria Reyes" → "Access".<br>2. Read the panel; toggle "SKU Master" on; "Save Changes".<br>3. SC: reload; open sidebar "SKU Master".<br>4. Admin: "Reset to Role Default"; "Save Changes". SC: reload. |
| Expected Result | • Panel "Module Access — Maria Reyes (SALES_COORDINATOR)"; "Admin Panel" shows "Locked".<br>• "Saved!"; SC sees and can open "SKU Master".<br>• After reset SC no longer sees it. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Panel "Module Access — Maria Reyes (SALES_COORDINATOR)"; "Admin Panel" shows "Locked".; • "Saved!"; SC sees and can open "SKU Master".; • After reset SC no longer sees it. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-014-01-access-granted.png](../../artifacts/RUN-20261014-02/TC-ADM-014-01-access-granted.png); [TC-ADM-014-02-sales-sku-access.png](../../artifacts/RUN-20261014-02/TC-ADM-014-02-sales-sku-access.png); [TC-ADM-014-03-access-reset.png](../../artifacts/RUN-20261014-02/TC-ADM-014-03-access-reset.png); [TC-ADM-014-04-sales-default-restored.png](../../artifacts/RUN-20261014-02/TC-ADM-014-04-sales-default-restored.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-015: Module access save is protected against stale edits

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-015 |
| Title | Module access save is protected against stale edits |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-30 (permissions.ts:106) |
| Role | Admin |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). Two Admin tabs (same session). |
| Test Data | None beyond preconditions |
| Steps | 1. Tab 1 and Tab 2: open "Access" for "Ana Cruz".<br>2. Tab 1: toggle "Customers" on; "Save Changes".<br>3. Tab 2: toggle "Sales Orders" on; "Save Changes".<br>4. Tab 1: reload, "Reset to Role Default", "Save Changes". |
| Expected Result | • Tab 2 shows "Permissions or role changed. Reload module access before saving." in the red box; nothing saved from tab 2.<br>• Step 4 restores defaults. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Tab 2 shows "Permissions or role changed. Reload module access before saving." in the red box; nothing saved from tab 2.; • Step 4 restores defaults. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-015-01-tab1-saved.png](../../artifacts/RUN-20261014-02/TC-ADM-015-01-tab1-saved.png); [TC-ADM-015-02-stale-tab-conflict.png](../../artifacts/RUN-20261014-02/TC-ADM-015-02-stale-tab-conflict.png); [TC-ADM-015-03-role-default-restored.png](../../artifacts/RUN-20261014-02/TC-ADM-015-03-role-default-restored.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-016: Audit log can be filtered by action

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-016 |
| Title | Audit log can be filtered by action |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | SI-11, WF-7 (admin.ts:11-71) |
| Role | Admin |
| Priority | Low |
| Type | Negative |
| Preconditions | Depends on TC-ADM-007 (a LINK_LOGIN entry exists). |
| Test Data | None beyond preconditions |
| Steps | 1. "System Audit Log": open the "Action" filter options.<br>2. In the Admin session, send with the API helper (AGENTS.md §8): `GET /api/admin/audit-log?action=LINK_LOGIN` and inspect `entries[].action`. |
| Expected Result | Filtering by LINK_LOGIN returns only LINK_LOGIN entries. Fail (SI-11) if the UI lacks the option and the API returns other actions. |
| Actual Result | RUN-20261014-02: The UI action filter offered only CREATE, UPDATE, DELETE. GET /api/admin/audit-log?action=LINK_LOGIN returned HTTP 200 with 50 entries and included LINK_LOGIN, UPDATE, and CREATE, so the requested filter was ignored. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-ADM-016-01-audit-filter-ui.png](../../artifacts/RUN-20261014-02/TC-ADM-016-01-audit-filter-ui.png); [TC-ADM-016-02-audit-filter-api.json](../../artifacts/RUN-20261014-02/TC-ADM-016-02-audit-filter-api.json) |
| Defect ID | RUN-20261014-02: DEF-012 |
### TC-ADM-017: Integrations tab and test email (mock mailer)

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-017 |
| Title | Integrations tab and test email (mock mailer) |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | R-ADM (admin.ts:75-135; AdminPanel.tsx:804-819) |
| Role | Admin |
| Priority | Low |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: this environment sends real email through Microsoft Graph, and the user decided to disregard email in this UAT (2026-10-14). Running this case could email real mailboxes. Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. Tab "Integrations": read "Email Delivery".<br>2. "Send Test Email": Recipient `uat.test@microgenesis.test`; "Send Test". |
| Expected Result | • Email method "mock".<br>• "Test email sent successfully via MOCK" (method text may be lower case); a "[MOCK EMAIL]" block in the API terminal. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-018: Non-admins cannot use administration APIs

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-018 |
| Title | Non-admins cannot use administration APIs |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-LOG, R-TASS, ACC-API |
| Role | Logistics |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). and Signed in as TASS in its own browser context (session from TC-AUTH-003). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `GET /api/admin/audit-log`<br>2. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/users` body `{"name":"X","email":"x@uat.test","password":"Abc12345!","role":"ADMIN"}`<br>3. In the TASS session, send with the API helper (AGENTS.md §8): `PUT /api/users/<Juan id>/permissions` body `{"permissions":[],"expectedVersion":"x"}`<br>4. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/data-sampler/generate` body `{}` |
| Expected Result | All return 403 ("Module access denied"); no user created. |
| Actual Result | RUN-20261014-02: Observed the case expected result: All return 403 ("Module access denied"); no user created. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-019: Changing a Driver login to another role unlinks its profile

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-019 |
| Title | Changing a Driver login to another role unlinks its profile |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-31 (users.ts:173-177; driverLogin.ts:63-66) |
| Role | Admin |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-ADM-007. |
| Test Data | None beyond preconditions |
| Steps | 1. Row "UAT Driver Alpha" (user) → "Edit"; Role "Logistics"; "Save".<br>2. Drivers → "Manager": read the badge on "UAT Driver Alpha". |
| Expected Result | Badge "No login". |
| Actual Result | RUN-20261014-02: Observed the case expected result: Badge "No login". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-019-01-role-updated.png](../../artifacts/RUN-20261014-02/TC-ADM-019-01-role-updated.png); [TC-ADM-019-02-profile-unlinked.png](../../artifacts/RUN-20261014-02/TC-ADM-019-02-profile-unlinked.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-020: Data Sampler generates sample records

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-020 |
| Title | Data Sampler generates sample records |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | R-ADM (data-sampler.ts:131) |
| Role | Admin |
| Priority | Low |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). Do NOT use any reset control. |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "Data Sampler"; mode "Fully Randomized"; select module "Sales Orders"; slider to 3; "Generate 3 Records". |
| Expected Result | "3 records created in Sales Orders."; the module count rises by 3. |
| Actual Result | RUN-20261014-02: Observed the case expected result: "3 records created in Sales Orders."; the module count rises by 3. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-020-01-sales-orders-generated.png](../../artifacts/RUN-20261014-02/TC-ADM-020-01-sales-orders-generated.png) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-021: Linking a profile already linked to another login is refused

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-021 |
| Title | Linking a profile already linked to another login is refused |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-31 (driverLogin.ts:52-55) |
| Role | Admin |
| Priority | Medium |
| Type | Negative |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). Profile id of "John Doe" (from `GET /api/drivers`). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Admin session, send with the API helper (AGENTS.md §8): `POST /api/users` body `{"name":"UAT Driver Clash","email":"uat.clash@microgenesis.test","password":"<user-supplied>","role":"DRIVER","driver_profile_id":"<John Doe profile id>"}` |
| Expected Result | 409 "This Driver profile is already linked to another login. Unlink it first."; no user created. |
| Actual Result | RUN-20261014-02: Observed the case expected result: 409 "This Driver profile is already linked to another login. Unlink it first."; no user created. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-ADM-021-01-link-existing-profile.json](../../artifacts/RUN-20261014-02/TC-ADM-021-01-link-existing-profile.json) |
| Defect ID | RUN-20261014-02: — |
### TC-ADM-022: New Driver login with a new profile, then unlinked

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-022 |
| Title | New Driver login with a new profile, then unlinked |
| Scenario ID | TS-016 |
| Requirement / Rule Ref | BR-31, WF-7 (driverLogin.ts:31-60; users.ts:96-112) |
| Role | Admin |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | U-DRV2 |
| Steps | 1. "Create User": `UAT Driver Two`, `uat.driver2@microgenesis.test`, user-supplied password, Role "Driver", "Driver profile" = "Create a new profile named after this login"; "Create".<br>2. In the Users table, row "UAT Driver Two", set the inline "Driver profile" select to "No Driver profile". |
| Expected Result | • Step 1: Driver Manager shows "UAT Driver Two" with "Login linked".<br>• Step 2: warning "Sees no runs until linked." on the row. |
| Actual Result | RUN-20261014-02: After creating UAT Driver Two, Driver Manager initially showed Drivers (5) and omitted the profile. A manual reload changed the list to Drivers (6) and showed Login linked. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-ADM-022-01-driver-created.png](../../artifacts/RUN-20261014-02/TC-ADM-022-01-driver-created.png); [TC-ADM-022-02-login-linked.png](../../artifacts/RUN-20261014-02/TC-ADM-022-02-login-linked.png); [TC-ADM-022-03-driver-unlinked.png](../../artifacts/RUN-20261014-02/TC-ADM-022-03-driver-unlinked.png) |
| Defect ID | RUN-20261014-02: DEF-014 |
### TC-ADM-023: Admin reviews the completed main chain (end of TS-001)

| Field | Description |
|---|---|
| Test Case ID | TC-ADM-023 |
| Title | Admin reviews the completed main chain (end of TS-001) |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-ADM, WF-1, WF-7 (admin.ts:11-71; records.ts:607-624) |
| Role | Admin |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). Depends on TC-DRV-005 and TC-TXN-003. |
| Test Data | None beyond preconditions |
| Steps | 1. "System Audit Log": From/To `<TODAY>`; "Apply Filters"; find the entries with Record ID {D-DEL-01.id} (use page navigation if needed).<br>2. Open D-DEL-01 (Deliveries) → tab "Audit Trail".<br>3. Dashboard: read "Records by Status". |
| Expected Result | • D-DEL-01 has CREATE by Maria Reyes and UPDATEs by Maria Reyes, Juan Santos and John Doe (assignment, priority, Time In, completion), in time order.<br>• The record Audit Trail shows the same events.<br>• "Records by Status" includes the delivered status (ACCOMPLISHED) with a count of at least 1. |
| Actual Result | RUN-20261014-02: The audit trail showed expected creator and update events, but the Records by Status chart showed axes and labels including Delivered without a visible bar or count for the completed record. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-ADM-023-01-main-chain-audit.png](../../artifacts/RUN-20261014-02/TC-ADM-023-01-main-chain-audit.png); [TC-ADM-023-02-record-audit.png](../../artifacts/RUN-20261014-02/TC-ADM-023-02-record-audit.png); [TC-ADM-023-03-record-audit-trail.png](../../artifacts/RUN-20261014-02/TC-ADM-023-03-record-audit-trail.png); [TC-ADM-023-04-records-by-status.png](../../artifacts/RUN-20261014-02/TC-ADM-023-04-records-by-status.png) |
| Defect ID | RUN-20261014-02: DEF-015 |