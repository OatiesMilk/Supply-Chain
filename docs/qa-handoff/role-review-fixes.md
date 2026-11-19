# QA Handoff: Role review fixes R1 to R6

| Item | Value |
| :--- | :--- |
| Feature | Fixes for findings R1 to R6 of `docs/ROLE_USER_REVIEW_2026-11-11.md` |
| For | ChatGPT Codex (QA execution) |
| Prepared | 2026-11-19 |
| Code location | Branch `fix/role-review-fixes-r1-r6` off `dev` (`3f3246b`). Five cherry-picked commits from PR 319 (author MarcZxc1) plus one commit that fits R4 into the current Drivers View. |
| Origin | PR 319 "Role review fixes R1 to R6" (closed unmerged on 2026-11-13), revived on top of today's `dev`. |
| Migration | None. No schema change and no data change. |

## Rules for this QA run

1. Test only. Do not change application code, tests, migrations, seeds or dependencies. Record failures in **Results**, with evidence.
2. Do not create branches, commit, push or open pull requests. Do not add co-author lines anywhere.
3. Run only against a **disposable local database** (`mg_portal_sandbox` or another `*_sandbox` / `*_test` database on loopback). Never run against staging or production.
4. Do not run `npm run db:reset`, `db:clean`, `seed:users-only` or `prisma migrate reset` unless the database is confirmed disposable.
5. Real email must not be sent. Leave SMTP unconfigured so mail is mocked. List any data you create under **Test data left**.
6. When something is ambiguous, write it under **Open questions** instead of guessing.
7. Quoted UI text is copied from the code. Treat a wording difference as a Low defect, not a failure of the criterion.

## 1. What changed

| ID | Change | Main files |
| :--- | :--- | :--- |
| R1 | The 4 PM reminder emails and in-app summaries are scoped per recipient, so a recipient never sees records they cannot open. The LEGACY RMA rule is kept. A stored summary becomes invalid when the recipient's authority changes (`rolePolicyRevision` in the summary version). The reminder code moved out of `server/src/index.ts`. | `server/src/services/scheduledNotifications.ts`, `sessionPermissions.ts`, `notificationVisibility.ts`, `mailPermissions.ts`, `server/src/index.ts` |
| R2 | SKU and notification routes pass database failures to the error handler, so a request returns an HTTP error instead of hanging. | `server/src/routes/skus.ts`, `notifications.ts` |
| R3 | A failed notification or email-log write after a save no longer turns a committed save into a 500. | `server/src/routes/records.ts` |
| R4 | Drivers View "Reschedule" gets a **New Delivery Date** picker (Manila date), only for Delivery records when the user is Logistics or Admin. Other categories and roles send no date. The save sends the record version from when the dialog opened (`expected_edit_version`). | `client/src/features/drivers/DriverView.tsx`, `driverStatusRules.ts`, `client/src/utils/recordLifecycle.ts` |
| R5 | The access request button copies the request text to the clipboard and reports clipboard failure honestly. It no longer claims the admin was notified. | `client/src/components/AccessRequestModal.tsx` |
| R6 | The notification log records SENT, MOCKED or FAILED from the real send result, and in-app alerts are created before emails. | `server/src/services/scheduledNotifications.ts` |

Conflict resolution notes (for context, do not retest separately):

- `docs/USER_MANUALS.md`, `docs/USER_MANUALS.docx` and `scripts/export-user-manual.cjs`: current `dev` version kept. The PR's manual edits were dropped.
- `README.md`: `dev` line kept, plus the Features Inventory and Performance Audit links.
- `DriverView.tsx`: current `dev` version kept (driver job cards, start confirmation, completion dialog). R4 was re-applied to the **Pending / Reschedule status dialog only**. Start and Complete use their own dialogs and are unchanged.

## 2. Setup

From the repository root:

```bash
git switch fix/role-review-fixes-r1-r6
git rev-parse HEAD                 # record in Results
git status --short                 # expect a clean tree

npm ci
cd server
npx prisma migrate deploy          # expect all migrations applied, none added by this branch
npx prisma generate
cd ..
```

Seed the disposable database following `docs/GETTING_STARTED.md` ("Secure local seed and reset policy"):

```bash
# server/.env (local only, never commit)
NODE_ENV=development
LOCAL_DESTRUCTIVE_SEED=true
LOCAL_SEED_DATABASE=mg_portal_sandbox
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/mg_portal_sandbox?schema=public
JWT_SECRET=<any long random string>

cd server && npm run seed && cd ..
npm run dev            # http://localhost:3000 and http://localhost:4000
```

Record only the host, port and database name in Results, never the URL.

## 3. Test accounts and roles

| Role | Email | Password | Used for |
| :--- | :--- | :--- | :--- |
| Admin | admin@microgenesis.com | admin123 | R4 (Reschedule with date), R5 |
| Logistics | logistics@microgenesis.com | password123 | R4 (Reschedule with date), R3 assignment |
| Sales Coordinator | sales@microgenesis.com | password123 | R4 negative check, R5 |
| TASS | tass@microgenesis.com | password123 | R1 RMA exclusion, R5 |
| Driver | driver@microgenesis.com | password123 | R3 completion |

## 4. Automated checks (run first)

```bash
cd server && npx tsc --noEmit && cd ..
cd client && npx tsc --noEmit && cd ..
npm run test:server
npm run test:client
```

Tests added or extended by this work:

```bash
cd server && node --import tsx --test tests/scheduledNotifications.test.ts tests/permissionVisibility.test.ts tests/asyncRouteErrors.test.ts tests/rescheduleStatus.test.ts && cd ..
cd client && node --import tsx --test tests/driverStatusRules.test.ts tests/accessRequestModal.test.ts tests/recordEditConflict.test.ts && cd ..
```

Expected results from the developer run on this branch:

- Typecheck (client and server): no errors.
- Server: 602 tests, 590 pass, 12 skipped (PostgreSQL-only), 0 fail.
- Client: 489 tests, 488 pass, 1 skipped, 0 fail.

**Seeded E2E (read-only Playwright suite):**

```bash
cd e2e
npm ci
npm run typecheck:seeded
SEEDED_E2E_TARGET=local BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:3000/api/v1 npm run test:seeded -- --trace off
SEEDED_E2E_TARGET=local SEEDED_E2E_FIXTURES=current BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:3000/api/v1 npm run test:seeded -- --trace off
cd ..
```

Known result, **identical on plain `dev` (`3f3246b`)**, so not caused by this branch:

- Canonical fixtures: 18 pass, 6 fail. All six are TASS tests (`roles.spec.ts` x2, `tass.spec.ts` x3, `role-dashboard-in-transit.spec.ts` AC13). The canonical check says the seeded TASS screen grants differ from `LEGACY_POLICY_DEFAULT_SCREENS`.
- `SEEDED_E2E_FIXTURES=current`: 20 pass, 4 fail (`admin.spec.ts` x4) in the developer run on this branch. A second developer run with the same flag on this branch and on `dev` showed 5 fails (the same 4 plus `reports.spec.ts` Driver and Area dropdowns). Treat these as flaky or fixture-dependent.

Report any E2E failure that is **not** in these lists as a new defect.

## 5. Acceptance criteria and checks

| AC | Check | Expected |
| :--- | :--- | :--- |
| R1-1 | Run `scheduledNotifications.test.ts` and `permissionVisibility.test.ts`. | All pass. |
| R1-2 | Read the test names in `scheduledNotifications.test.ts` (directory-rule AM resolution, record-access filtering, LEGACY RMA denial, ScopedSummary linkage) and `permissionVisibility.test.ts` (summary version and `rolePolicyRevision`). | Cases present and passing. Report any case you expected but did not find. |
| R1-3 | Manual: as Admin, restrict TASS or a Sales Coordinator so some records are out of their scope. Trigger the 4 PM job in a test shell (see `server/src/services/scheduledNotifications.ts` exports; do not change code) or read the unit-test output. | The summary and the email preview list only records the recipient can open. No RMA appears for a recipient without RMA access under the LEGACY rule. |
| R1-4 | `server/src/index.ts` no longer contains the reminder logic. Confirm the server starts and the schedulers still register (server log). | Server starts without error. |
| R2-1 | Run `asyncRouteErrors.test.ts`. | Pass. Injected database failures on SKU and notification GET/read routes return an HTTP error. |
| R2-2 | Manual: with the app running, open the SKU list, a SKU audit view and the notification bell as an authorized user. | All load normally. |
| R3-1 | No dedicated unit test covers the failed-notification path. Review the `records.ts` diff (`git diff dev -- server/src/routes/records.ts`) and confirm notification and email-log calls after the commit are wrapped so errors are caught and logged. | Wrapped. Note any gap under Open questions. |
| R3-2 | Manual: as Logistics assign a driver to a submitted Delivery. As the Driver, complete a run (proof photo, Received by, remarks). | Both succeed and show the saved state. |
| R4-1 | As **Logistics**, open Drivers → View, select an assigned **Delivery**, click **Reschedule**. | A **New Delivery Date \*** date field shows. **Confirm** stays disabled until remarks and a valid date are entered. |
| R4-2 | Enter today's date (Manila), a past date, then a future date. | Same-day shows "The new delivery date must be different...", past shows a past-date message, future allows Confirm. The picker `min` is today in Manila. |
| R4-3 | Confirm with a future date. | The record status becomes Rescheduled and the delivery date changes to the chosen date. |
| R4-4 | Repeat R4-1 as **Admin**. | Same behavior as Logistics. |
| R4-5 | Click **Reschedule** on a Procurement Pick-up, Sales Order or Accounting Collection run (as Logistics or Admin). Also as **Sales Coordinator** on a Delivery, if the role can reach the dialog. | No date field. The request sends no `delivery_date`. |
| R4-6 | Version check: open the Reschedule dialog, then (in another browser or session) edit the same record so its version changes, then confirm in the first dialog. | The save is rejected with a conflict message and does not overwrite the other change. |
| R4-7 | **Regression, current Drivers View:** Pending still works with remarks only. Start transport and Complete delivery dialogs behave as on `dev`. Check at 390px width. | No change from `dev`. |
| R5-1 | Trigger the access request modal (open a screen the user is denied, for example a Driver or Sales Coordinator following a denied navigation). Click the copy/request button. | The text is copied to the clipboard and the modal says so. It does not say "Your admin has been notified". |
| R5-2 | Block clipboard permission in the browser, then click again. | The modal shows an honest error state. |
| R6-1 | Unit tests in `scheduledNotifications.test.ts` for MOCKED and FAILED outcomes. | Pass. |
| R6-2 | With SMTP unset, run a reminder and inspect the notification log rows (Admin → audit or database read). | Rows read MOCKED, not SENT. |
| R6-3 | The in-app alert exists even when the email fails or is mocked. | Alert present. |

## 6. Out of scope

- The user manual edits from PR 319 (current `dev` manuals kept).
- The remaining defects in `docs/COMMIT_READINESS_REVIEW_2026-11-12.md`.
- Start transport and Complete delivery dialogs (no R4 change).
- Real SMTP delivery, staging, and production.

## 7. Results (Codex fills in)

| Field | Value |
| :--- | :--- |
| Commit tested | |
| Date and tester | |
| Database (host, port, name) | |
| Typecheck client / server | |
| `npm run test:server` | |
| `npm run test:client` | |
| Seeded E2E canonical | |
| Seeded E2E current | |

| AC | Result (Pass / Fail / Blocked) | Evidence |
| :--- | :--- | :--- |
| R1-1 | | |
| R1-2 | | |
| R1-3 | | |
| R1-4 | | |
| R2-1 | | |
| R2-2 | | |
| R3-1 | | |
| R3-2 | | |
| R4-1 | | |
| R4-2 | | |
| R4-3 | | |
| R4-4 | | |
| R4-5 | | |
| R4-6 | | |
| R4-7 | | |
| R5-1 | | |
| R5-2 | | |
| R6-1 | | |
| R6-2 | | |
| R6-3 | | |

**Defects found:**

**Open questions:**

**Test data left:**
