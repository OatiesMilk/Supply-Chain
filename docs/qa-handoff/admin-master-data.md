# QA Handoff: Admin Account Managers and Companies

| Item | Value |
| :--- | :--- |
| Feature | Admin-managed Account Managers and Companies |
| For | ChatGPT Codex (QA execution) |
| Prepared | 2026-11-10 |
| Code location | Local `dev` working tree, **uncommitted**. Before QA, Dylan moves it to `feature/admin-account-managers-companies` (branched off `dev`) and commits it there. The uncommitted edits to `server/package.json` and `server/prisma/seed-staging.ts` (plus `provision-staging-permissions.ts`, `seed-staging-master-data.ts` and their tests) belong to separate staging work and are not part of this feature. |
| Design notes | `docs/ADMIN_MASTER_DATA.md` |
| Migration | `server/prisma/migrations/20261110030000_account_manager_directory/` |

## Rules for this QA run

1. Test only. Do not change application code, migrations, seeds or dependencies. Record failures in **Results**, with evidence.
2. Do not create branches, commit, push or open pull requests. Do not add co-author lines anywhere.
3. Run only against a **disposable local database** (`mg_portal_sandbox` or another `*_sandbox` / `*_test` database). Never run against staging or production.
4. Do not run `npm run db:reset`, `db:clean` or `prisma migrate reset` unless the database is confirmed disposable.
5. When something is ambiguous, write it under **Open questions** instead of guessing.
6. Quoted messages are copied from the code. Server (API) messages have no final period unless shown; client-side inline messages do. Treat a wording difference as a Low defect, not a failure of the criterion.

## 1. What the feature does

- **Admin Panel → Account Managers** tab: list, search, filter by status (Active, Inactive, All), add, edit, deactivate and reactivate Account Managers (AMs). You can link an AM to one portal login.
- **Admin Panel → Companies** tab: the same actions for companies. Each company has a required, unique SAP number and an optional default AM.
- Every AM picker reads this list. That covers the Record create form (including Auto Fill), the Record workspace edit form, Accounting Collection and the Data Sampler. The hardcoded 7-name list is gone.
- Server rules: a new or changed record AM must be an active AM. A new record, or a company change on a record, needs an active company. Old records keep their saved AM name.
- AM emails and the 4 PM summary go to the AM's **linked login**. A deactivated AM gets nothing. An unlinked AM keeps the old rule: mail goes out only when exactly one active account has that exact name.
- Only Admins can make changes. Other roles can only read the lists, and they see AM `{ id, name, is_active }` only.

## 2. Setup

From the repository root, on Windows PowerShell or bash:

```bash
git branch --show-current          # expect feature/admin-account-managers-companies
git rev-parse HEAD                 # record in Results
git status --short                 # expect a clean tree

npm install
cd server
npx prisma migrate deploy          # applies 20261110030000_account_manager_directory
npx prisma generate
cd ..
```

Seed the disposable local database by following the guarded process in `docs/GETTING_STARTED.md` ("Secure local seed and reset policy"). It needs `LOCAL_DESTRUCTIVE_SEED=true` and `LOCAL_SEED_DATABASE=mg_portal_sandbox` in `server/.env`. Then run:

```bash
npm run seed
```

Start the app in a separate terminal and leave it running:

```bash
npm run dev            # frontend http://localhost:3000, backend http://localhost:4000
```

**Check the database:** in the `AccountManager` table (Prisma Studio: `cd server && npx prisma studio`), the 7 former names should exist (P. Soriano, D. Macaraeg, F. Valenzuela, R. Pagkalinawan, M. Reyes, A. Santos, C. Lim), plus any other name already on records.

## 3. Test accounts and roles

These are the seeded accounts from `server/prisma/seeds/users.ts`. They are local demo values only.

| Role | Email | Password | Expected access to this feature |
| :--- | :--- | :--- | :--- |
| Admin | admin@microgenesis.com | admin123 | Full manage on both tabs |
| Sales Coordinator | sales@microgenesis.com | password123 | No Admin Panel. Pickers show active AMs and companies. |
| Logistics | logistics@microgenesis.com | password123 | No Admin Panel. Read-only lists through pickers. |
| TASS | tass@microgenesis.com | password123 | No Admin Panel. RMA AM picker uses the list. |
| Driver | driver@microgenesis.com | password123 | No Admin Panel and no writes (403). `GET` on the AM and company lists works and returns the same minimal data as other non-Admin roles (AMs: `id`, `name`, `is_active` only), as found in QA. A Driver login cannot be linked to an AM. |

## 4. Automated checks (run first)

```bash
cd server && npx tsc --noEmit && cd ..
cd client && npx tsc --noEmit && cd ..
npm run test:server
npm run test:client
```

The tests specific to this feature are:

```bash
cd server && node --import tsx --test tests/accountDirectory.test.ts tests/majorDefects.test.ts && cd ..
cd client && node --import tsx --test tests/adminDirectory.test.ts tests/rmaAutofill.test.ts && cd ..
```

Expected result: everything passes. In the developer run, all server and client tests passed, and the PostgreSQL-only tests were skipped because they need `*_TEST_DATABASE_URL`.

**E2E (Playwright):** this feature has no E2E spec yet. Run the existing role suites to check for regressions:

```bash
npm run e2e:sc
npm run e2e:integration
```

If you automate the manual checks below, put the spec in `e2e/tests/admin-directory.spec.ts`, report it in **Results**, and leave it uncommitted.

## 5. Acceptance criteria and checks

Each criterion has a manual check (M) and an automated reference (A) where one exists. Record **Pass**, **Fail** or **Blocked** for each one in section 7.

| ID | Acceptance criterion |
| :--- | :--- |
| AC-01 | Admin sees **Account Managers** and **Companies** tabs in the Admin Panel. |
| AC-02 | Admin can add an AM. The name is trimmed and spaces are collapsed. Duplicates are rejected, ignoring case and spacing. |
| AC-03 | Admin can link an AM to one active, non-Driver portal login. A login already linked to another AM is not offered. |
| AC-04 | Admin can edit, deactivate and reactivate an AM. Old records keep their saved AM name. |
| AC-05 | Admin can add a company. Name and SAP number are required, both are unique, and the default AM is optional. |
| AC-06 | Admin can edit, deactivate and reactivate a company. An inactive company is hidden from new-record pickers. |
| AC-07 | Stale edits are rejected (version conflict) and the user sees a refresh message. |
| AC-08 | Non-Admin roles cannot create or change AMs or companies, in the UI or through the API. |
| AC-09 | Record forms list only active AMs and active companies. Picking a company fills its default AM. |
| AC-10 | The server rejects a new or changed record AM that is not an active AM, and rejects an inactive company on new records. |
| AC-11 | AM email and the 4 PM summary use the linked login. A deactivated AM gets nothing. Unlinked AMs use the exact unique-name fallback. |
| AC-12 | Every AM and company create or update writes a System Audit Log entry. |
| AC-13 | The migration seeds existing names, links logins only on an exact unique name match, and stops on duplicate company names or SAP numbers. |

### AC-01: Tabs visible
- **M:** Log in as Admin and open **Admin Panel**. The tabs include **Account Managers** and **Companies**. Each loads a table with search, status filter buttons showing counts, and an Add button.
- **Expected:** both tabs load without errors, and **Active** is the default filter.

### AC-02: Add an AM
- **M1:** On Account Managers, click **Add Account Manager**, enter `  Test   Manager `, leave Email blank and click **Add Account Manager**. **Expected:** the row "Test Manager" appears with status Active and the notice "Saved Test Manager."
- **M2:** Add `test manager` again. **Expected:** the dialog shows the server error "An Account Manager with this name already exists, including inactive ones" (409). No row is added.
- **M3:** Enter the name `X`. **Expected:** the inline error "Enter a name of 2 to 100 characters." Nothing is sent.
- **M4:** Enter the email `not-an-email`. **Expected:** the inline error "Enter a valid email address."
- **A:** `server/tests/accountDirectory.test.ts` (create and validation tests) and `client/tests/adminDirectory.test.ts`.

### AC-03: Link a login
- **M1:** Edit "Test Manager" and open the **Portal login** list. **Expected:** it shows active non-Driver accounts only. John Doe (Driver) and any inactive account are missing.
- **M2:** Link Maria Reyes (sales@microgenesis.com) and save. The **Portal login** column shows "Maria Reyes". Edit another AM. **Expected:** Maria Reyes is no longer offered.
- **M2b (API):** `PATCH /api/v1/account-managers/<other AM id>` with `{ "expected_version": <its version>, "user_id": "<Maria Reyes id>" }`. **Expected:** 409 "That portal user is already linked to another Account Manager".
- **M3 (API):** `POST /api/v1/account-managers` with `{ "name": "Driver Link", "user_id": "<driver user id>" }` as Admin. **Expected:** 400 "Link an active portal user who is not a Driver".

### AC-04: Edit, deactivate and reactivate an AM
- **M1:** Note an existing record that uses "C. Lim" (or create one), then deactivate **C. Lim**. **Expected:** a confirm dialog says "They will no longer appear on new or edited records. Existing records, reports and the AM Directory keep their name." After you confirm, C. Lim appears under the **Inactive** filter.
- **M2:** Open the record from M1 in its workspace. **Expected:** the AM still shows "C. Lim", and you can save other fields without changing the AM.
- **M3:** Reactivate C. Lim. **Expected:** it is back under Active.

### AC-05: Add a company
- **M1:** On Companies, click **Add Company** and enter Name `QA Test Co`, SAP `SAP-QA-1` and Default AM `P. Soriano`, then save. **Expected:** the row appears with Default AM "P. Soriano" and status Active.
- **M2:** Add another company with SAP `sap-qa-1`. **Expected:** the SAP field shows "Another company already uses this SAP number" (the check ignores case).
- **M3:** Add `qa  test  co` with a new SAP. **Expected:** the name field shows "A company with this name already exists, including inactive ones" (409).
- **M4:** Leave SAP blank. **Expected:** the inline error "SAP number is required."
- **M5:** The Default AM list shows active AMs only. Deactivate an AM, then reopen the form. **Expected:** that AM is gone from the list.
- **M6 (API):** `POST /api/v1/companies` with the id of an inactive AM as `default_account_manager_id`. **Expected:** 409 "Choose an active Account Manager".

### AC-06: Company lifecycle
- **M1:** Deactivate `QA Test Co`. **Expected:** the confirm dialog says "It will no longer be offered on new records. Existing records stay linked to it and keep showing its name." Log in as Sales Coordinator and open **Deliveries → New Record**. **Expected:** QA Test Co is not in the Company Name list.
- **M2:** Existing records linked to an inactive company still show the company name.
- **M3:** Reactivate it. **Expected:** it is back in the picker.

### AC-07: Stale edit
- **M:** Open the same company edit dialog in two browser tabs as Admin. Save a change in tab 1, then save a different change in tab 2. **Expected:** tab 2 shows "Someone else changed this company. Close this window to see the latest details, then try again." Close the dialog. **Expected:** the list shows tab 1's change.
- **API:** the raw 409 bodies are "This company was changed by someone else. Refresh and try again." and "This Account Manager was changed by someone else. Refresh and try again." The Account Managers tab shows "Someone else changed this Account Manager. Close this window to see the latest details, then try again."
- **A:** `server/tests/accountDirectory.test.ts` ("edits need the current version").

### AC-08: Non-Admin denial
- **M1:** As Sales Coordinator, Logistics or TASS, there is no Admin Panel in the sidebar.
- **M2 (API, with each non-Admin session cookie):** send `POST /api/v1/companies`, `PATCH /api/v1/companies/<id>`, `POST /api/v1/account-managers` and `PATCH /api/v1/account-managers/<id>`. **Expected:** 403 for every call, and no rows or audit entries are created.
- **M3:** As Sales Coordinator, `GET /api/v1/account-managers`. **Expected:** each item has only `id`, `name` and `is_active`.
- **A:** `server/tests/accountDirectory.test.ts` ("only Admin can create or change", "pickers get Account Manager names only") and `server/tests/permissionEnforcement.test.ts`.

### AC-09: Record form pickers
- **M1:** As Sales Coordinator, open **New Record** in Deliveries. **Expected:** the Account Manager list contains active AMs only. The list changes when an Admin adds or deactivates an AM, after a reload.
- **M2:** Pick `QA Test Co`, whose default AM is P. Soriano. **Expected:** Account Manager fills in with "P. Soriano". Change the AM to someone else, then pick another company. **Expected:** your manual choice is kept.
- **M3:** Click **Auto Fill**. **Expected:** the AM is the company's default AM, or a random active AM when the company has none.
- **M4:** Repeat M1 to M3 in Accounting Collection **New Record**, and in the RMA create form as TASS.
- **M5:** As Admin, open **Data Sampler** in manual mode. **Expected:** the AM list contains active AMs only.
- **A:** `client/tests/adminDirectory.test.ts` ("record forms offer active Account Managers…"), `client/tests/rmaAutofill.test.ts`, `client/tests/rmaCompletionWorkspace.test.ts`.

### AC-10: Server record validation
- **M1 (API, as Sales Coordinator):** `POST /api/v1/records` with a valid body and `"account_manager": "Not On The List"`. **Expected:** 400 "Choose an active Account Manager from the list."
- **M2:** The same request with `"account_manager": "  p.  soriano "`. **Expected:** 201, and the stored `account_manager` is "P. Soriano" (the directory spelling).
- **M3:** The same request with the id of an inactive company. **Expected:** 400 "This company is inactive. Choose an active company."
- **M4:** Edit an old record whose AM is now inactive, change only the remarks and save. **Expected:** the save succeeds. Change its AM to the inactive name on another record. **Expected:** 400.
- **A:** `server/tests/majorDefects.test.ts` ("new records need an active company and an active Account Manager…") and `server/tests/accountDirectory.test.ts` ("records accept blank, unchanged or active…").

### AC-11: AM email and 4 PM summary
Email runs in mock mode locally. Check the results in the `NotificationLog` table (Prisma Studio) and through **Admin Panel → Integrations → test email**, if one is configured.
- **M1:** Link AM "P. Soriano" to the account Maria Reyes. Create and complete (Delivered) a Delivery whose AM is P. Soriano. **Expected:** the NotificationLog row for the Accomplished trigger has `recipientName` "Maria Reyes" and status MOCKED or SENT, not SKIPPED.
- **M2:** Deactivate P. Soriano and repeat. **Expected:** the AM notification is SKIPPED, with the message ending "Skipped: no unique active recipient with record access; review recipient mapping and permissions."
- **M3:** For an unlinked AM whose name exactly matches one active account, mail goes to that account. Two accounts with the same name: SKIPPED.
- **M4 (4 PM summary):** it runs on a schedule. If it can't be triggered locally, mark it **Blocked** and rely on the automated test.
- **A:** `server/tests/accountDirectory.test.ts` ("AM mail goes to the linked login first…"), `server/tests/notificationDelivery.test.ts`, `server/tests/permissionVisibility.test.ts`.

### AC-12: Audit
- **M:** After AC-02 through AC-06, open **Admin Panel → System Audit Log**. **Expected:** entries with record type `AccountManager` / `Company`, actions CREATE / UPDATE, showing before and after values for name, SAP number, default AM, linked user and active status.
- **A:** `server/tests/accountDirectory.test.ts` (audit assertions using `safeBusinessAudit`).

### AC-13: Migration
- **M1:** On a fresh disposable database, `npx prisma migrate deploy` succeeds. The `AccountManager` table has the 7 default names plus any distinct `accountManager` values found on existing records. Case and spacing variants are merged.
- **M2:** An AM gets a `userId` only when exactly one active, non-Driver user has the same name (case and spacing ignored).
- **M3 (optional, disposable database only):** before migrating, insert two companies named `Dup Co` and `dup  co`. **Expected:** the migration stops with "Duplicate Company names (ignoring case/spacing) exist. Merge them before applying this migration." and nothing is applied. Duplicate SAP numbers stop it with "Duplicate Company SAP numbers exist. Correct them before applying this migration."
- **M4:** Row Level Security is enabled on `AccountManager`: `SELECT relrowsecurity FROM pg_class WHERE relname='AccountManager'` returns `true`.

## 6. Out of scope

- The Customers page (a separate merchant directory, not linked to records).
- AM Directory analytics changes (it still groups by the record's AM text).
- Bulk CSV import of AMs or companies.
- Renaming the AM on old records when an AM is renamed. Old records keep their saved name by design.
- New screens or permission catalog keys. The feature uses the existing Admin Panel and `companies` and `admin` permissions on purpose.
- Real email delivery through Graph or SMTP. Only the mock or logged outcome is checked locally.
- Staging or production deployment.

## 7. Results

**Build tested:** branch `feature/admin-account-managers-companies`, commit `e6f7138859aff8e613cf596b5767725ac7d9e362`, date `2026-11-10`.

**Database:** `mg_portal_sandbox` from `server/.env` (`localhost:5433`). The connected database also reported `current_database() = mg_portal_sandbox`. Disposable target and guarded seed values matched. Account Manager RLS is enabled.

**Setup:** Node `v25.2.1` and npm `11.7.0` passed the required first check. `npm install` completed and audited 758 packages; npm reported 25 vulnerabilities (9 moderate, 13 high, 3 critical). It changed the tracked lockfile, so that generated diff was restored; the final tracked diff is only this handoff file. `npx prisma migrate deploy` found 16 migrations and no pending work; `20261110030000_account_manager_directory` is already recorded as applied. `npx prisma generate` passed. The guarded `npm run seed` exited safely with “Seed skipped — database already has 5 user(s).” Frontend and backend were already listening on ports 3000 and 4000, so no new dev server was started.

**Test data left in the disposable database:** Account Manager `Test Manager Updated` (active, unlinked), companies `QA Test Co Updated` (`SAP-QA-1`, default AM `P. Soriano`) and `QA No Default AM`, plus two QA Draft records. The Sales Coordinator E2E integration test also left record `REC-64bcbfcf-b211-4bb5-97ac-9f528d293fad`; its cleanup request returned 403. No code, migration, seed, or other tracked file was changed. No branch, commit, push, or stash operation was performed.

**Round 1 browser limitation:** the computer-use browser host was unavailable on the initial check, retry, and reinitialization. Browser screenshots and visual interaction were blocked in Round 1. Round 2 browser results are recorded below.

### Automated checks

| Command | Result (pass / fail / skipped counts) | Notes |
| :--- | :--- | :--- |
| Server `npx tsc --noEmit` | Pass (exit 0) | No diagnostics. |
| Client `npx tsc --noEmit` | Pass (exit 0) | No diagnostics. |
| `npm run test:server` | Pass (495 / 0 / 7) | 502 total; 7 PostgreSQL-only checks skipped without a designated test database. |
| `npm run test:client` | Pass (325 / 0 / 1) | 326 total. |
| Focused server tests | Pass (26 / 0 / 0) | `accountDirectory.test.ts` and `majorDefects.test.ts`. |
| Focused client tests | Pass (8 / 0 / 0) | `adminDirectory.test.ts` and `rmaAutofill.test.ts`. |
| `npm run e2e:sc` | Failed before test selection | On Windows PowerShell, the script passes the apostrophe in `--project='Sales Coordinator'`; Playwright reports project `'Sales` not found. |
| Direct Sales Coordinator Playwright project | Fail (17 / 3) | `TSK-126` had no On-Hold rows for its expected count; the size test could not open `C:\tmp\big_test_file.pdf`; the Delivered-record test lacked its UAT fixture. |
| `npm run e2e:integration` | Failed before test selection | Same quoting issue; Playwright reports project `'Cross` not found. |
| Direct Cross Role Integration Playwright project | Pass (4 / 0) | TSK-120 cleanup returned 403 for the Draft created by that test; record is listed above. |

The direct E2E commands were run from `e2e` with PowerShell-safe project quoting. They were `npx playwright test --config playwright.config.ts --project "Sales Coordinator"` and `npx playwright test --config playwright.config.ts --project "Cross Role Integration"`.

### Acceptance criteria (Round 1)

| ID | Result (Pass / Fail / Blocked) | Evidence (response, audit row, automated check) | Notes |
| :--- | :--- | :--- | :--- |
| AC-01 | Blocked (superseded: Pass in Round 2) | `adminDirectory.test.ts` exercises both tab components; API list reads returned 200. | Top-level Admin Panel tab visibility, table counts, and rendered default filter were not visually observed. |
| AC-02 | Pass | Admin API created `Test Manager` from `  Test   Manager ` (201); case/spacing duplicate returned 409; short name and invalid email returned 400. | Client form validation and create behavior also passed. |
| AC-03 | Pass | Admin linked `Test Manager` to Maria Reyes (200); duplicate login link returned 409; Driver link returned 400. | Client test verified only active, non-Driver, unlinked logins are offered. Maria Reyes was unlinked from the QA AM after the check. |
| AC-04 | Pass | AM rename, deactivate, and reactivate returned 200. Existing record retained `Test Manager` after rename/deactivation and saved a remarks edit; changing it to the inactive AM returned 400. | Client test also verified retired AM values remain available on existing records. |
| AC-05 | Pass | Created `QA Test Co` with `SAP-QA-1` and default `P. Soriano`; missing SAP returned 400; case-insensitive SAP duplicate and normalized-name duplicate returned 409. A company without a default AM returned 201. | Default AM was present in the company response. |
| AC-06 | Pass | Company edit/deactivate/reactivate returned 200; inactive company disappeared from `GET /companies?active=true`; new record using it returned 400. | Reactivated company appeared in the active list again. |
| AC-07 | Blocked (superseded: Pass in Round 2) | Stale AM and Company updates both returned 409 with the server refresh message. | Rendered conflict message was not observed because browser access was unavailable. |
| AC-08 | Pass | Sales, Logistics, TASS, and Driver each received 403 for AM/Company POST and PATCH; no denied rows appeared. Non-Admin AM responses contained only `id`, `name`, and `is_active`. | Sales sidebar regression E2E and the read-only Companies component test passed. Driver list-read ambiguity is recorded below. |
| AC-09 | Blocked (superseded: Pass in Round 2) | Active-only API lists contained active AMs/companies; the company response exposed default `P. Soriano`. Client active-AM choice and RMA Auto Fill tests passed. | Visible form behavior, default-AM fill/manual-choice preservation, Accounting Collection, RMA picker, and Data Sampler were not manually observed. |
| AC-10 | Pass | Unknown and inactive AM choices returned 400; `  p.  soriano ` created a record stored as `P. Soriano`; inactive company returned 400. An old record saved other fields with its inactive historical AM unchanged. | Direct requests used the Sales Coordinator session. |
| AC-11 | Blocked | Server test “AM mail goes to the linked login first…” passed. Six existing AM NotificationLog rows were inspected; they were `SKIPPED`. | A completed Delivery notification was not triggered for this run, and the scheduled 4 PM summary was not triggered. |
| AC-12 | Pass | Admin audit API returned 10 matching entries: AccountManager CREATE 1 / UPDATE 5; Company CREATE 1 / UPDATE 3. Before/after snapshots contained the expected directory fields. | Includes the QA login unlink update. |
| AC-13 | Blocked | Migration is recorded as applied; all seven handoff names plus pre-existing `Demo Account` were present before QA data; no duplicate normalized AM names; RLS query returned `true`. | No fresh migration or pre-migration duplicate-company guard test was run. No original AM had an exact active non-Driver login match. The migration’s matching/duplicate-stop behavior was not re-exercised on a fresh database. |

### Defects found

| # | AC | Severity (Critical / High / Medium / Low) | Steps to reproduce | Expected | Actual | `path:line` if known |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | QA harness | Low | On Windows PowerShell, run `npm run e2e:sc` or `npm run e2e:integration`. | Each wrapper selects its named Playwright project. | Embedded single quotes are passed through; Playwright looks for projects `'Sales` / `'Cross` and exits before running tests. Direct quoted Playwright commands work. | `e2e/package.json:9`, `e2e/package.json:12` |

No Admin Account Managers or Companies functional defect was confirmed by the API and automated checks. The three Sales Coordinator E2E failures are listed above as fixture/path blockers; they did not exercise this feature.

### Open questions

- The handoff says Driver has “No access,” while the feature overview says other roles may read the lists. In this run Driver GETs for both directories returned 200 with the minimal AM projection. Should Driver directory reads be denied, or is read-only list access intended for every role?
- AC-13 duplicate-stop checks require a fresh pre-migration disposable database. Should a separate `*_test` database be provisioned for that optional check?
- The Round 2 browser checks for AC-01, AC-07 and AC-09 are recorded below. The scheduled 4 PM summary remains untriggered.
- `npm run seed` skipped because the sandbox already had five users; the Sales Coordinator suite consequently lacked its UAT Delivered fixture. Which guarded UAT fixture command should be used for the regression suite on this sandbox?

### Round 1 Sign-off

- QA verdict: **Blocked — no feature sign-off yet.** API behavior, directory audit, type checks, focused tests, and full unit/component suites passed. Visual UI checks and the fresh-migration/notification checks remain blocked, and the Sales Coordinator E2E suite has three fixture/path failures.
- Tested by: ChatGPT Codex

### Round 2 — Browser checks (2026-11-10)

**Scope:** Browser-only checks at `http://localhost:3000`; backend `4000` was already running. No setup, automated suites, database API calls, or saved QA artifacts were used in this round. Temporary responsive viewport was `390 × 844` and was reset after inspection.

| Item | Result | Evidence |
| :--- | :--- | :--- |
| AC-01 — Admin tabs and lists | Pass | Account Managers and Companies tabs both opened. Account Managers showed `Search account managers`, `ACTIVE 9`, `INACTIVE 0`, `ALL 9`, and `ADD ACCOUNT MANAGER`; Companies showed `Search companies`, `ACTIVE 47`, `INACTIVE 0`, `ALL 47`, and `ADD COMPANY`. Active was selected by default on both initial views. After Round 2 test records were added and restored active, the counts were `ACTIVE 10 / INACTIVE 0 / ALL 10` for AMs and `ACTIVE 49 / INACTIVE 0 / ALL 49` for companies. |
| AC-07 — Company stale edit | Pass | Two Admin tabs opened the same `QA R2 Company A 20261110` edit form before either save. After tab 1 saved Contact Person `QA R2 Tab1 Contact`, tab 2’s different save displayed `Someone else changed this company. Close this window to see the latest details, then try again.` Closing it showed `QA R2 Tab1 Contact` in the list; tab 2’s address was not applied. |
| AC-07 — Account Manager stale edit | Pass | Two Admin tabs opened the same fresh AM before either save. After tab 1 saved `QA R2 Account Manager Tab1 20261110`, tab 2’s different save displayed `Someone else changed this Account Manager. Close this window to see the latest details, then try again.` Closing it showed tab 1’s name in the list. |
| AC-09 — Deliveries, Sales Coordinator | Pass | Selecting `QA R2 Company A 20261110` filled `QA R2 Account Manager Tab1 20261110`. After choosing `D. Macaraeg`, selecting Company B (default `P. Soriano`) kept `D. Macaraeg`. With the QA AM temporarily inactive, typing its name showed no suggestion; typing `P. Soriano` showed that active suggestion. Auto Fill sampling produced Company A with `QA R2 Account Manager Tab1 20261110` (trial 2), matching its configured default. A no-default sample also produced Mercury Drug (Default AM `None`) with an active AM. |
| AC-09 — Accounting Collection, Sales Coordinator | Pass | Company A filled `QA R2 Account Manager Tab1 20261110`; manually choosing `D. Macaraeg` then selecting Company B kept `D. Macaraeg`. With the QA AM inactive, its name was absent from the Account Manager menu. Auto Fill produced Company A with `QA R2 Account Manager Tab1 20261110` (trial 9), matching its configured default. A no-default Shakey’s sample used active `R. Pagkalinawan`. |
| AC-09 — RMA create form, TASS | Pass | Company A filled `QA R2 Account Manager Tab1 20261110`; manually choosing `D. Macaraeg` then selecting Company B kept `D. Macaraeg`. With the QA AM inactive, typing its name showed no suggestion; active `P. Soriano` was offered. Auto Fill produced Company B with `P. Soriano` (trial 5), matching its configured default. A no-default Pancake House sample used active `Test Manager Updated`. |
| AC-09 — Data Sampler manual mode, Admin | Pass | After deactivating the fresh QA AM and reloading, `Manual with Suggestions` → Deliveries showed active choices including `A. Santos`, `C. Lim`, `D. Macaraeg`, `P. Soriano`, `R. Pagkalinawan`, and `Test Manager Updated`; `QA R2 Account Manager Tab1 20261110` was absent. No sample record was saved. |
| Deactivate/reactivate confirmation dialogs | Pass | Company deactivate text: `It will no longer be offered on new records. Existing records stay linked to it and keep showing its name.` Reactivate text: `It will be offered again on record forms.` AM deactivate text: `They will no longer appear on new or edited records. Existing records, reports and the AM Directory keep their name.` Reactivate text: `They will appear again in the Account Manager list on record forms.` The test company and AM were reactivated after the checks. |
| Phone-width pages | Pass | At `390 × 844`, both Admin tabs showed their tab controls, search, status counts, Add button, and table rows. The Company table container exposed horizontal scrolling (`overflow-x-auto`, 364 px client width / 768 px content width). The Add Company dialog fit within the phone viewport with all fields and Cancel/Add buttons visible. |

**Round 2 test data:** AM `QA R2 Account Manager Tab1 20261110` was left active. Company `QA R2 Company A 20261110` (`QA-R2-20261110-01`) was left active with default AM `QA R2 Account Manager Tab1 20261110` and Contact Person `QA R2 Tab1 Contact`. Company `QA R2 Company B 20261110` (`QA-R2-20261110-02`) was left active with default AM `P. Soriano`. Browser forms were canceled without submitting records.

### Round 2 defects

No feature defect was confirmed in the Round 2 browser checks. The Round 1 low-severity Playwright wrapper quoting defect remains listed above.

### Round 2 verdict

**Pass for the Round 2 browser scope. Overall feature QA remains Blocked** by Round 1 items that were not part of this browser-only round: AC-11’s completed-Delivery notification and scheduled 4 PM summary checks, and AC-13’s fresh-migration/duplicate-stop checks.

### Overall status

- **Passed:** AC-01 to AC-10 and AC-12 (API and automated checks in Round 1, browser checks in Round 2). Type checks and the full server and client unit suites pass.
- **Not tested, accepted for this release by Dylan (2026-11-10):** AC-11 completed-Delivery email and 4 PM summary (only the unit test ran) and AC-13 fresh-database migration and duplicate-stop (staging was checked for duplicates beforehand). Re-test after release if needed.
- **Open decision:** whether a Driver may read the AM and company lists (currently allowed, minimal data).
- **Known unrelated:** three Sales Coordinator E2E failures from missing fixtures and a hardcoded `C:\tmp` path; the Windows single-quote script problem in `e2e/package.json`.
