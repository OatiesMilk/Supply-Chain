# Test Cases: Authentication and Session

| Document control | |
|---|---|
| Title | Test Cases: Authentication and Session |
| Document ID | QA-TC-AUTH |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

Non-SSO sign-in, sign-out, session and request-security behaviour. Microsoft SSO is out of scope and has no cases. TC-AUTH-001..005 also create the signed-in sessions every later case reuses.

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-AUTH-001](#tc-auth-001-sales-coordinator-signs-in-with-email-and-password) | Sales Coordinator signs in with email and password | Sales Coordinator | Critical | Positive | TS-017 | Run |
| [TC-AUTH-002](#tc-auth-002-logistics-signs-in-with-email-and-password) | Logistics signs in with email and password | Logistics | Critical | Positive | TS-017 | Run |
| [TC-AUTH-003](#tc-auth-003-tass-signs-in-with-email-and-password) | TASS signs in with email and password | TASS | Critical | Positive | TS-017 | Run |
| [TC-AUTH-004](#tc-auth-004-admin-signs-in-with-email-and-password) | Admin signs in with email and password | Admin | Critical | Positive | TS-017 | Run |
| [TC-AUTH-005](#tc-auth-005-driver-signs-in-and-lands-on-the-field-mobile-dashboard) | Driver signs in and lands on the field mobile dashboard | Driver | Critical | Positive | TS-017 | Run |
| [TC-AUTH-006](#tc-auth-006-wrong-password-is-rejected) | Wrong password is rejected | Unauthenticated | High | Negative | TS-017 | Run |
| [TC-AUTH-007](#tc-auth-007-unknown-email-is-rejected-with-the-same-message) | Unknown email is rejected with the same message | Unauthenticated | Medium | Negative | TS-017 | Run |
| [TC-AUTH-008](#tc-auth-008-login-without-email-or-password-is-refused) | Login without email or password is refused | Unauthenticated | Medium | Boundary | TS-017 | Run |
| [TC-AUTH-009](#tc-auth-009-email-is-case-insensitive-at-sign-in) | Email is case-insensitive at sign-in | Sales Coordinator | Low | Boundary | TS-017 | Run |
| [TC-AUTH-010](#tc-auth-010-sign-out-ends-the-session) | Sign out ends the session | Sales Coordinator | High | Positive | TS-017 | Run |
| [TC-AUTH-011](#tc-auth-011-protected-pages-and-api-refuse-anonymous-access) | Protected pages and API refuse anonymous access | Unauthenticated | High | Access Control | TS-010 | Run |
| [TC-AUTH-012](#tc-auth-012-a-write-without-the-csrf-token-is-refused) | A write without the CSRF token is refused | Sales Coordinator | High | Negative | TS-017 | Run |
| [TC-AUTH-013](#tc-auth-013-repeated-failed-logins-are-rate-limited-per-account) | Repeated failed logins are rate-limited per account | Unauthenticated | Medium | Boundary | TS-017 | Run |

## Test cases

### TC-AUTH-001: Sales Coordinator signs in with email and password

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-001 |
| Title | Sales Coordinator signs in with email and password |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | R-SC, AUTH-1 (server/src/routes/auth.ts:16-40) |
| Role | Sales Coordinator |
| Priority | Critical |
| Type | Positive |
| Preconditions | Entry criteria met (Test Plan §10). Fresh `npm run seed:uat`. |
| Test Data | U-SC (test-data.md §2) |
| Steps | 1. Open a new Playwright browser context and go to `http://localhost:3000/login`.<br>2. Click "Sign in with email instead". Never click "Sign in with Microsoft".<br>3. In "Email" type `sales@microgenesis.com`; in "Password" type the password the user supplied for this account.<br>4. Click "Sign In".<br>5. Save the context with Playwright `storageState` to `quality-assurance/e2e/.auth/<role>.json`.<br>6. Read the sidebar items. |
| Expected Result | • URL becomes `http://localhost:3000/dashboard`.<br>• The user name "Maria Reyes" is shown in the app header.<br>• No error message is shown. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • URL becomes `http://localhost:3000/dashboard`.; • The user name "Maria Reyes" is shown in the app header.; • No error message is shown. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-001-05-sales-signed-in.png](../../artifacts/RUN-20261014-02/TC-AUTH-001-05-sales-signed-in.png) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-002: Logistics signs in with email and password

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-002 |
| Title | Logistics signs in with email and password |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | R-LOG, AUTH-1 |
| Role | Logistics |
| Priority | Critical |
| Type | Positive |
| Preconditions | As TC-AUTH-001. |
| Test Data | U-LOG |
| Steps | 1. Open a new Playwright browser context and go to `http://localhost:3000/login`.<br>2. Click "Sign in with email instead". Never click "Sign in with Microsoft".<br>3. In "Email" type `logistics@microgenesis.com`; in "Password" type the password the user supplied for this account.<br>4. Click "Sign In".<br>5. Save the context with Playwright `storageState` to `quality-assurance/e2e/.auth/<role>.json`. |
| Expected Result | • URL becomes `/dashboard`; Logistics dashboard cards "Assigned to Drivers Today" and "No Driver Assigned" are visible. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • URL becomes `/dashboard`; Logistics dashboard cards "Assigned to Drivers Today" and "No Driver Assigned" are visible. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-002-05-logistics-signed-in.png](../../artifacts/RUN-20261014-02/TC-AUTH-002-05-logistics-signed-in.png); [TC-AUTH-002-console.txt](../../artifacts/RUN-20261014-02/TC-AUTH-002-console.txt) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-003: TASS signs in with email and password

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-003 |
| Title | TASS signs in with email and password |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | R-TASS, AUTH-1 |
| Role | TASS |
| Priority | Critical |
| Type | Positive |
| Preconditions | As TC-AUTH-001. |
| Test Data | U-TASS |
| Steps | 1. Open a new Playwright browser context and go to `http://localhost:3000/login`.<br>2. Click "Sign in with email instead". Never click "Sign in with Microsoft".<br>3. In "Email" type `tass@microgenesis.com`; in "Password" type the password the user supplied for this account.<br>4. Click "Sign In".<br>5. Save the context with Playwright `storageState` to `quality-assurance/e2e/.auth/<role>.json`. |
| Expected Result | • URL becomes `/dashboard`; TASS cards "Open RMA Records" and "Collections Pending" are visible. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • URL becomes `/dashboard`; TASS cards "Open RMA Records" and "Collections Pending" are visible. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-003-05-tass-signed-in.png](../../artifacts/RUN-20261014-02/TC-AUTH-003-05-tass-signed-in.png); [TC-AUTH-003-console.txt](../../artifacts/RUN-20261014-02/TC-AUTH-003-console.txt) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-004: Admin signs in with email and password

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-004 |
| Title | Admin signs in with email and password |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | R-ADM, AUTH-1 |
| Role | Admin |
| Priority | Critical |
| Type | Positive |
| Preconditions | As TC-AUTH-001. |
| Test Data | U-ADM |
| Steps | 1. Open a new Playwright browser context and go to `http://localhost:3000/login`.<br>2. Click "Sign in with email instead". Never click "Sign in with Microsoft".<br>3. In "Email" type `admin@microgenesis.com`; in "Password" type the password the user supplied for this account.<br>4. Click "Sign In".<br>5. Save the context with Playwright `storageState` to `quality-assurance/e2e/.auth/<role>.json`. |
| Expected Result | • URL becomes `/dashboard`; Admin cards "Total Active Users" and "Audit Events Today" are visible. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • URL becomes `/dashboard`; Admin cards "Total Active Users" and "Audit Events Today" are visible. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-004-05-admin-signed-in.png](../../artifacts/RUN-20261014-02/TC-AUTH-004-05-admin-signed-in.png); [TC-AUTH-004-06-admin-credential-followup.png](../../artifacts/RUN-20261014-02/TC-AUTH-004-06-admin-credential-followup.png); [TC-AUTH-004-console.txt](../../artifacts/RUN-20261014-02/TC-AUTH-004-console.txt) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-005: Driver signs in and lands on the field mobile dashboard

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-005 |
| Title | Driver signs in and lands on the field mobile dashboard |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | R-DRV, AUTH-1 |
| Role | Driver |
| Priority | Critical |
| Type | Positive |
| Preconditions | As TC-AUTH-001. Use a mobile viewport (e.g. Playwright device "Pixel 7"). |
| Test Data | U-DRV |
| Steps | 1. Open a new Playwright browser context and go to `http://localhost:3000/login`.<br>2. Click "Sign in with email instead". Never click "Sign in with Microsoft".<br>3. In "Email" type `driver@microgenesis.com`; in "Password" type the password the user supplied for this account.<br>4. Click "Sign In".<br>5. Save the context with Playwright `storageState` to `quality-assurance/e2e/.auth/<role>.json`. |
| Expected Result | • The page shows the heading "Microgenesis Field Mobile" and the name "John Doe".<br>• Stat tiles "Today's Runs", "Accomplished", "Remaining" are shown.<br>• Five seeded runs with references starting `SAP-DEMO-` are listed (one per category). |
| Actual Result | RUN-20261014-02: Observed the case expected result: • The page shows the heading "Microgenesis Field Mobile" and the name "John Doe".; • Stat tiles "Today's Runs", "Accomplished", "Remaining" are shown.; • Five seeded runs with references starting `SAP-DEMO-` are listed (one per category). / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-005-05-driver-signed-in.png](../../artifacts/RUN-20261014-02/TC-AUTH-005-05-driver-signed-in.png); [TC-AUTH-005-console.txt](../../artifacts/RUN-20261014-02/TC-AUTH-005-console.txt) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-006: Wrong password is rejected

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-006 |
| Title | Wrong password is rejected |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | AUTH-2 (server/src/routes/auth.ts:26-29) |
| Role | Unauthenticated |
| Priority | High |
| Type | Negative |
| Preconditions | New browser context, not signed in. |
| Test Data | Email `sales@microgenesis.com`, password `WrongPass!9` |
| Steps | 1. Go to `/login`, click "Sign in with email instead".<br>2. Enter the test data and click "Sign In". |
| Expected Result | • Error text "Invalid email or password" is displayed.<br>• URL stays `/login`; no session cookie `mg_session` is set. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Error text "Invalid email or password" is displayed.; • URL stays `/login`; no session cookie `mg_session` is set. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-006-02-wrong-password-rejected.png](../../artifacts/RUN-20261014-02/TC-AUTH-006-02-wrong-password-rejected.png); [TC-AUTH-006-03-cookie-check.png](../../artifacts/RUN-20261014-02/TC-AUTH-006-03-cookie-check.png) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-007: Unknown email is rejected with the same message

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-007 |
| Title | Unknown email is rejected with the same message |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | AUTH-2 (server/src/routes/auth.ts:22-24) |
| Role | Unauthenticated |
| Priority | Medium |
| Type | Negative |
| Preconditions | Not signed in. |
| Test Data | Email `nobody.uat@microgenesis.com`, password `Anything1` |
| Steps | 1. Go to `/login`, click "Sign in with email instead".<br>2. Enter the test data and click "Sign In". |
| Expected Result | Error text "Invalid email or password" (identical to TC-AUTH-006, so account existence is not revealed). |
| Actual Result | RUN-20261014-02: Observed the case expected result: Error text "Invalid email or password" (identical to TC-AUTH-006, so account existence is not revealed). / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-007-02-unknown-email-rejected.png](../../artifacts/RUN-20261014-02/TC-AUTH-007-02-unknown-email-rejected.png) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-008: Login without email or password is refused

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-008 |
| Title | Login without email or password is refused |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | AUTH-2 (server/src/routes/auth.ts:18-20) |
| Role | Unauthenticated |
| Priority | Medium |
| Type | Boundary |
| Preconditions | Not signed in. |
| Test Data | Empty email; empty password |
| Steps | 1. Go to `/login`, click "Sign in with email instead", leave both fields empty, click "Sign In".<br>2. From the login page run in the console: `fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(async r=>[r.status, await r.text()])`. |
| Expected Result | • Step 1: the browser blocks submission (fields are `required`); no request is sent.<br>• Step 2: HTTP 400 with body `{"error":"Email and password are required"}`. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: the browser blocks submission (fields are `required`); no request is sent.; • Step 2: HTTP 400 with body `{"error":"Email and password are required"}`. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-008-01-required-fields.png](../../artifacts/RUN-20261014-02/TC-AUTH-008-01-required-fields.png) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-009: Email is case-insensitive at sign-in

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-009 |
| Title | Email is case-insensitive at sign-in |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | AUTH-1 (server/src/routes/auth.ts:22) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Boundary |
| Preconditions | Not signed in (new context). |
| Test Data | Email `SALES@MICROGENESIS.COM`, the Sales Coordinator password |
| Steps | 1. Go to `/login`, click "Sign in with email instead".<br>2. Enter the test data, click "Sign In".<br>3. Sign out with the Navbar button titled "Log out". |
| Expected Result | Sign-in succeeds and lands on `/dashboard` as "Maria Reyes". |
| Actual Result | RUN-20261014-02: Observed the case expected result: Sign-in succeeds and lands on `/dashboard` as "Maria Reyes". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-009-02-case-insensitive-sign-in.png](../../artifacts/RUN-20261014-02/TC-AUTH-009-02-case-insensitive-sign-in.png); [TC-AUTH-009-03-logout.png](../../artifacts/RUN-20261014-02/TC-AUTH-009-03-logout.png) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-010: Sign out ends the session

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-010 |
| Title | Sign out ends the session |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | AUTH-3 (server/src/routes/auth.ts:42-49) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | A separate, freshly signed-in Sales Coordinator context (do not use the saved session file). |
| Test Data | U-SC |
| Steps | 1. Click the Navbar icon button with title "Log out" (`#logout-button`).<br>2. In the same page console run `fetch('/api/auth/me').then(r=>r.status)`.<br>3. Navigate to `http://localhost:3000/deliveries`. |
| Expected Result | • After step 1 the URL is `/login`.<br>• Step 2 returns 401.<br>• Step 3 shows the login page (URL `/login`), not the Deliveries list. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • After step 1 the URL is `/login`.; • Step 2 returns 401.; • Step 3 shows the login page (URL `/login`), not the Deliveries list. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-010-01-fresh-sales-signed-in.png](../../artifacts/RUN-20261014-02/TC-AUTH-010-01-fresh-sales-signed-in.png); [TC-AUTH-010-02-protected-route-after-logout.png](../../artifacts/RUN-20261014-02/TC-AUTH-010-02-protected-route-after-logout.png) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-011: Protected pages and API refuse anonymous access

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-011 |
| Title | Protected pages and API refuse anonymous access |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | AUTH-3, R-ANON (server/src/middleware/auth.ts:85-90) |
| Role | Unauthenticated |
| Priority | High |
| Type | Access Control |
| Preconditions | New context, not signed in. |
| Test Data | None |
| Steps | 1. Navigate to `http://localhost:3000/admin`.<br>2. In the console run `fetch('/api/records').then(async r=>[r.status, await r.text()])`.<br>3. Run `fetch('/api/users').then(r=>r.status)`. |
| Expected Result | • Step 1 shows the login page at `/login`.<br>• Step 2: 401 with `{"error":"Not authenticated"}`.<br>• Step 3: 401. |
| Actual Result | RUN-20261015-08: New anonymous context: /admin redirects to /login and Microsoft sign-in button is visible. GET records returns 401 with error Not authenticated; GET users returns 401 with the same error. Authenticated Sales context remained separate. |
| Status | RUN-20261015-08: Pass |
| Evidence | RUN-20261015-08: [TC-AUTH-011-01-anonymous-login.png](../../artifacts/RUN-20261015-08/TC-AUTH-011-01-anonymous-login.png) |
| Defect ID | RUN-20261015-08: — |
### TC-AUTH-012: A write without the CSRF token is refused

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-012 |
| Title | A write without the CSRF token is refused |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | AUTH-4 (server/src/middleware/csrf.ts:69-77) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Negative |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | None |
| Steps | 1. On any portal page run in the console (note: no `X-CSRF-Token` header): `fetch('/api/companies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'UAT CSRF Probe'})}).then(async r=>[r.status, r.headers.get('X-CSRF-Error'), await r.text()])`.<br>2. Open the Companies combobox on a New Record form and search "UAT CSRF Probe". |
| Expected Result | • Step 1: HTTP 403, header `X-CSRF-Error: token`, body `{"error":"Security token missing or expired. Refresh the page and try again."}`.<br>• Step 2: no company "UAT CSRF Probe" exists. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: HTTP 403, header `X-CSRF-Error: token`, body `{"error":"Security token missing or expired. Refresh the page and try again."}`.; • Step 2: no company "UAT CSRF Probe" exists. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-012-02-company-search-form.png](../../artifacts/RUN-20261014-02/TC-AUTH-012-02-company-search-form.png); [TC-AUTH-012-03-probe-absent.png](../../artifacts/RUN-20261014-02/TC-AUTH-012-03-probe-absent.png) |
| Defect ID | RUN-20261014-02: — |
### TC-AUTH-013: Repeated failed logins are rate-limited per account

| Field | Description |
|---|---|
| Test Case ID | TC-AUTH-013 |
| Title | Repeated failed logins are rate-limited per account |
| Scenario ID | TS-017 |
| Requirement / Rule Ref | AUTH-5 (server/src/middleware/rateLimits.ts:16, 85, 92-96) |
| Role | Unauthenticated |
| Priority | Medium |
| Type | Boundary |
| Preconditions | Depends on TC-ADM-003 (account U-LOCK exists). Never use a shared role account for this case. |
| Test Data | U-LOCK email `uat.lockout@microgenesis.test`, wrong password `Wrong-<n>` |
| Steps | 1. In a new context, from `/login` send 5 failed logins for U-LOCK with the console: `for (let i=1;i<=5;i++) console.log(await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'uat.lockout@microgenesis.test',password:'Wrong-'+i})}).then(r=>r.status))`.<br>2. Send a 6th attempt with the CORRECT U-LOCK password the same way and record status and body. |
| Expected Result | • Attempts 1-5 return 401.<br>• Attempt 6 returns 429 with body `{"error":"Too many requests. Please wait and try again."}` even though the password is correct. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Attempts 1-5 return 401.; • Attempt 6 returns 429 with body `{"error":"Too many requests. Please wait and try again."}` even though the password is correct. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-AUTH-013-02-rate-limited.png](../../artifacts/RUN-20261014-02/TC-AUTH-013-02-rate-limited.png) |
| Defect ID | RUN-20261014-02: — |