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
| Driver | driver@microgenesis.com | password123 | No access. A Driver login cannot be linked to an AM. |

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

## 7. Results (Codex fills in)

**Build tested:** branch `__________`, commit `__________`, date `__________`
**Database:** `__________` (confirm it is disposable)

### Automated checks

| Command | Result (pass / fail / skipped counts) | Notes |
| :--- | :--- | :--- |
| `server: npx tsc --noEmit` | | |
| `client: npx tsc --noEmit` | | |
| `npm run test:server` | | |
| `npm run test:client` | | |
| `npm run e2e:sc` | | |
| `npm run e2e:integration` | | |

### Acceptance criteria

| ID | Result (Pass / Fail / Blocked) | Evidence (screenshot, response body, log row) | Notes |
| :--- | :--- | :--- | :--- |
| AC-01 | | | |
| AC-02 | | | |
| AC-03 | | | |
| AC-04 | | | |
| AC-05 | | | |
| AC-06 | | | |
| AC-07 | | | |
| AC-08 | | | |
| AC-09 | | | |
| AC-10 | | | |
| AC-11 | | | |
| AC-12 | | | |
| AC-13 | | | |

### Defects found

| # | AC | Severity (Critical / High / Medium / Low) | Steps to reproduce | Expected | Actual | `path:line` if known |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| | | | | | | |

### Open questions

-

### Sign-off

- QA verdict: **Ready to merge into `dev`** / **Needs fixes** (pick one)
- Tested by: ChatGPT Codex
