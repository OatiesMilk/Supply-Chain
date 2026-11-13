# QA Handoff: Transport requests and in-transit panels on role dashboards

| Item | Value |
| :--- | :--- |
| Feature | Logistics "Transport requests", Sales Coordinator "In transit", TASS "RMA in transit" (TODO items 2, 3, 4) |
| For | ChatGPT Codex (QA execution) |
| Prepared | 2026-11-12 |
| Code location | Branch `feature/role-dashboard-in-transit` off `dev` (`88d2e37`). Feature commits `01aa208` to `74282aa`, plus the commit that adds this file. |
| Plan | `docs/plans/role-dashboard-in-transit.md` (see "Approved decisions" at the top) |
| Migration | None. No schema change and no data change. |

## Rules for this QA run

1. Test only. Do not change application code, tests, migrations, seeds or dependencies. Record failures in **Results**, with evidence.
2. Do not create branches, commit, push or open pull requests. Do not add co-author lines anywhere.
3. Run only against a **disposable local database** (`mg_portal_sandbox` or another `*_sandbox` / `*_test` database on loopback). Never run against staging or production.
4. Do not run `npm run db:reset`, `db:clean`, `seed:users-only` or `prisma migrate reset` unless the database is confirmed disposable.
5. The only data writes this QA needs are the optional fixture steps in section 2.1 (assign a driver, start a run), done through the app on the disposable database. List anything you create under **Test data left**.
6. When something is ambiguous, write it under **Open questions** instead of guessing.
7. Quoted UI text is copied from the code. Treat a wording difference as a Low defect, not a failure of the criterion.

## 1. What the feature does

Definitions (server: `server/src/services/dashboardFilters.ts`, client mirror: `client/src/utils/dashboardFilters.ts`):

- **Driver job types:** Delivery, Procurement Pick-up, Sales Orders, and RMA whose movement is Logistics transport. Accounting Collection and other RMA movements are never driver jobs.
- **Transport request** (`log-transport-requests`): a driver job that is not a draft, not deleted, not Accomplished (RMA: transport not Completed either) and has **no Driver profile** (`driverId` empty). On-Hold and Rescheduled jobs stay in. A record that only has an old driver *name* but no Driver profile still counts.
- **In transit** (`sc-in-transit`, `tass-rma-in-transit`): the started subset of the Logistics "Drivers out for delivery" rule. The job is assigned to a Driver profile, it is not On-Hold, Rescheduled or Accomplished, and it has started. Non-RMA jobs have started when the status is In Transit or Time In is recorded. RMA have started when the transport status is In Transit. The planned date does not matter.
- `log-rma-requests` (the old RMA-only list) is **unchanged** and still includes RMA that already have a driver.

What users see:

- **Logistics dashboard:** the panel "RMA transport requests" is replaced by **"Transport requests"**. Columns: Record, Type, Company, Area, Date, Driver ("Needs driver"), Status. Up to 10 rows, oldest date first. The footer reads "Showing X of Y requests" and has one "View N <type>" link per type with requests. Each link opens that type's list filtered by `log-transport-requests`. Clicking a row opens the record on its own screen.
- **Sales Coordinator dashboard:** a new full-width panel **"In transit"** below the chart row. Columns: Record, Type, Company, Area, Planned date, Driver, Started (Time In, Manila time), Status. Up to 10 rows. The footer reads "Showing X of Y" and has links "View Deliveries in transit", "View Procurement Pickups in transit" and "View Sales Orders in transit". There is one link per type because each list screen shows only its own category.
- **TASS dashboard:** a new panel **"RMA in transit"** below "Open RMA needing attention". Columns: RMA (reference, record id below), Company, Area, Driver, Transport started, RMA status. Up to 10 rows, oldest transport start first. The footer reads "View all N in transit" and opens RMA filtered by `tass-rma-in-transit`.
- Links and rows for screens the viewer cannot open show as plain text. The Admin dashboard is unchanged.
- API (`GET /api/v1/dashboard/overview`), additive only:
  - Logistics: `counts['log-transport-requests']`, `transport_requests_by_type`, `record_previews.transport_requests`. The old `record_previews.rma_requests` and `counts.rma_requests` are still returned for one release.
  - SC: `counts['sc-in-transit']`, `record_previews.in_transit`.
  - TASS: `counts['tass-rma-in-transit']`, `record_previews.rma_in_transit`.
  - `GET /api/v1/records?dashboard_filter=<id>` accepts the three new ids.

## 2. Setup

From the repository root:

```bash
git switch feature/role-dashboard-in-transit
git rev-parse HEAD                 # record in Results
git status --short                 # expect a clean tree (an untracked e2e/artifacts/ folder is fine)

npm install
cd server
npx prisma migrate deploy          # expect "No pending migrations"; this feature adds none
npx prisma generate
cd ..
```

Seed the disposable local database only if it is empty. Follow the guarded process in `docs/GETTING_STARTED.md` ("Secure local seed and reset policy"). Then start the app in a separate terminal, or reuse the running servers if ports 3000 and 4000 already answer:

```bash
npm run dev            # frontend http://localhost:3000, backend http://localhost:4000
```

**Check the database target before testing.** `server/.env` `DATABASE_URL` must point at a loopback host and a `*_sandbox` / `*_test` database. Do not print the URL in Results; record only the host, port and database name.

### 2.1 Fixture data

Read the current numbers first. While logged in as each role, open `GET /api/v1/dashboard/overview` (the browser address bar works: `http://localhost:3000/api/v1/dashboard/overview`).

During development, the local seed had 26 transport requests (Delivery 19, Procurement Pick-up 3, Sales Orders 4) and 1 RMA in transit, but **0 SC jobs in transit**. If a count you need is 0, create the fixture on the disposable database:

- **SC in transit:** as Logistics, assign the Driver profile linked to `driver@microgenesis.com` to a Delivery, Pick-up or Sales Order created by `sales@microgenesis.com`, dated today. Log in as the Driver and start that job (records Time In). It should then appear in the SC "In transit" panel.
- **Transport request of every type:** if a type is missing, create a non-draft record of that type with no driver (as Sales Coordinator; for RMA as TASS, with movement "Logistics transport").
- **RMA in transit:** assign a driver to a Logistics-transport RMA and start its transport as the Driver.

## 3. Test accounts and roles

These are the seeded accounts from `server/prisma/seeds/users.ts`. They are local demo values only.

| Role | Email | Password | Expected for this feature |
| :--- | :--- | :--- | :--- |
| Logistics | logistics@microgenesis.com | password123 | "Transport requests" panel, all four types |
| Sales Coordinator | sales@microgenesis.com | password123 | "In transit" panel, Delivery / Pick-up / Sales Order only, own record scope |
| TASS | tass@microgenesis.com | password123 | "RMA in transit" panel, RMA only |
| Driver | driver@microgenesis.com | password123 | Only used to start runs for fixtures |
| Admin | admin@microgenesis.com | admin123 | Dashboard unchanged |

Note: on the developer machine the local TASS account had no `procurement_pickup` screen grant. If yours is the same, the seeded E2E suite needs `SEEDED_E2E_FIXTURES=current` (see section 4).

## 4. Automated checks (run first)

```bash
cd server && npx tsc --noEmit && cd ..
cd client && npx tsc --noEmit && cd ..
npm run test:server
npm run test:client
```

Tests specific to this feature:

```bash
cd server && node --import tsx --test tests/transportRequestFilters.test.ts tests/dashboardOverview.test.ts tests/driversOutFilter.test.ts && cd ..
cd client && node --import tsx --test tests/dashboardFilterParity.test.ts tests/logisticsDashboard.test.ts tests/salesCoordinatorDashboard.test.ts tests/tassDashboard.test.ts tests/dashboardOverview.test.ts && cd ..
```

Expected results from the developer run:

- Server: 553 tests, 544 pass, 8 skipped (PostgreSQL-only), and **1 known failure that is not caused by this feature**. `tests/submittedAt.test.ts` › "migration adds a nullable column…" fails on a Windows checkout because `migration.sql` gets CRLF line endings. Record it but do not count it against this feature. If it fails on a non-Windows checkout, report it.
- Client: 432 tests, 431 pass, 1 skipped.
- Typecheck (both): no errors.

**E2E (Playwright, read-only seeded suite):** the spec is `e2e/seeded/role-dashboard-in-transit.spec.ts`. The suite blocks every non-GET business request.

```bash
cd e2e
npm run typecheck:seeded
SEEDED_E2E_TARGET=local SEEDED_E2E_FIXTURES=current BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:3000/api/v1 npx playwright test --config seeded.config.ts seeded/role-dashboard-in-transit.spec.ts
cd ..
```

On PowerShell, set the variables first, e.g. `$env:SEEDED_E2E_TARGET='local'; $env:SEEDED_E2E_FIXTURES='current'; ...`. Expected: 3 passed. When a count is 0, a test only checks the empty state, so say in Results whether each test ran its drill-down.

Regression: run the full seeded suite once with the same variables (`npm run test:seeded`).

## 5. Acceptance criteria and checks

AC numbers match the plan. AC5 is reworded per approved decision 3.

### Logistics (log in as Logistics)

| AC | Check | Expected |
| :--- | :--- | :--- |
| AC1 | Compare `counts['log-transport-requests']` and `transport_requests_by_type` in the overview with `GET /api/v1/records?category=<Deliveries/RMA/Procurement Pick-up/Sales Orders>&dashboard_filter=log-transport-requests&paged=true&limit=1` (`total`) for each type. | Per-type totals match, and their sum equals the overall count. Each type with an open record that has no driver is counted. |
| AC2 | In the drill-down lists, look for drafts, Accomplished records, records with a driver, RMA with transport Completed, RMA with another movement, and Accounting Collection. Use automated tests for cases the seed lacks. | None appear. `transportRequestFilters.test.ts` passes. |
| AC3 | Put a no-driver Delivery On-Hold or Rescheduled (or find one). | It stays in the count and the list. |
| AC4 | Dashboard panel. | At most 10 rows, oldest Date first. "Showing X of Y requests" uses the full total. |
| AC5 | Every RMA in the `log-transport-requests` RMA list is also in `GET /records?category=RMA&dashboard_filter=log-rma-requests`. | True. `log-rma-requests` still includes RMA that have a driver (unchanged). |
| AC6 | UI: the title reads "Transport requests" and "RMA transport requests" is gone. The Type column shows Delivery / RMA / Procurement Pickup / Sales Order. Every row's Driver cell reads "Needs driver". Click a row, then click each "View N <type>" link. | A row opens the record on its own screen (an RMA row opens `/rma?item=…`). Each link opens that type's screen, its `/records` request carries `dashboard_filter=log-transport-requests`, and the list total equals N. |

### Sales Coordinator (log in as SC)

| AC | Check | Expected |
| :--- | :--- | :--- |
| AC7 | With the fixture from 2.1, a started job (In Transit, or Scheduled with Time In, any planned date) appears. | Counted in `counts['sc-in-transit']` and listed in the panel with Started time in Manila time. |
| AC8 | A Scheduled job with no Time In, a Pending job with no Time In, On-Hold, Rescheduled, Accomplished, a draft, a job without a Driver profile, any RMA. | None counted or listed. `transportRequestFilters.test.ts` passes. |
| AC9 | Records outside the SC's record scope. | Not counted or listed (compare with the same filter as Admin or Logistics if needed). |
| AC10 | UI panel "In transit": the columns from section 1, then the three "View … in transit" links, then the empty state. | Each link opens Deliveries / Procurement Pick-up / Sales Orders with `dashboard_filter=sc-in-transit`. The three list totals add up to the panel count. With 0, the panel shows "No jobs are in transit". |

### TASS (log in as TASS)

| AC | Check | Expected |
| :--- | :--- | :--- |
| AC11 | A Logistics-transport RMA with transport In Transit and a driver. | `counts['tass-rma-in-transit']` includes it and the panel lists it. |
| AC12 | Transport Pending or Completed, RMA status On-Hold / Rescheduled / Accomplished, other movement, any non-RMA record. | Not counted or listed. |
| AC13 | UI panel "RMA in transit": RMA reference with the record id below, Driver, Transport started, RMA status; oldest start first; "View all N in transit"; empty state. | The link opens `/rma` with `dashboard_filter=tass-rma-in-transit` and total N. With 0, the panel shows "No RMA are in transit". |

### Shared

| AC | Check | Expected |
| :--- | :--- | :--- |
| AC14 | For the same data, the in-transit jobs counted on the Logistics "Drivers out for delivery" panel (the "· N in transit" figures), limited to SC types / RMA. | They match the SC and TASS in-transit sets. The unit test "SC and TASS in-transit sets split…" passes. |
| AC15 | `client/tests/dashboardFilterParity.test.ts`. | Passes for all three ids. In the browser, a drill-down list shows the same rows as the server total. |
| AC16 | Section 4 commands. | No regressions apart from the known `submittedAt` CRLF failure. |
| Extra | Without screen access (if you can test with a `current` fixture that lacks a screen), links and rows for that screen. | Plain text, not buttons. Covered by the component tests. |

## 6. Out of scope

- TODO items 5 (record ID length) and 6 (Main vs Dashboard pages).
- Removing `rma_requests` from the overview (a later release).
- A TASS view of RMA whose transport is complete and awaiting physical receipt.
- KPI tile changes, Admin dashboard, Driver Board.
- The `submittedAt.test.ts` CRLF failure (separate fix).
- Staging or production deployment.

## 7. Results

**Build tested:** branch `feature/role-dashboard-in-transit`, commit `e06ee0ce2e2c222ce7eebdcb3ed1a1538bd142de`, date `2026-11-12`.

**Database:** host / port / database name: `localhost / 5433 / mg_portal_sandbox`. Confirmed disposable: yes.

**Setup notes:** `npm install` completed; its package-lock metadata-only change was restored. Prisma found 18 migrations, `migrate deploy` reported no pending migrations, and `prisma generate` succeeded. The database was already seeded (5 users, 94 records, 7 driver profiles), so no seed/reset was run. Existing services on ports 3000 and 4000 were reused. The DB is a local Docker Desktop container and the app connected via `localhost`; Docker currently publishes port 5433 on `0.0.0.0` and `::` as well. No staging or live database was used.

**Test data left in the disposable database:** one AC7 fixture, Delivery `REC-7e30d207-92b2-48a0-a746-4fcca06b4928`, reference `QA-RDIT-20261112-001`, Alfamart Philippines Inc., planned for 2026-11-12. It was created by the Sales Coordinator, assigned to John Doe by Logistics, and started by the Driver account; it remains In Transit with Time In recorded at 1:33 PM Manila time. No other records were created.

### Automated checks

| Command | Result (pass / fail / skipped counts) | Notes |
| :--- | :--- | :--- |
| Server `npx tsc --noEmit` | Pass (exit 0) | No errors. |
| Client `npx tsc --noEmit` | Pass (exit 0) | No errors. |
| `npm run test:server` | 544 pass / 1 fail / 8 skipped (exit 1) | The sole failure was the documented Windows CRLF failure in `tests/submittedAt.test.ts`; excluded from the feature verdict as instructed. |
| `npm run test:client` | 431 pass / 0 fail / 1 skipped (exit 0) | |
| Focused server tests | 22 pass / 0 fail / 0 skipped (exit 0) | Includes transport filter, overview and driver in-transit criteria. |
| Focused client tests | 50 pass / 0 fail / 0 skipped (exit 0) | Includes parity for all three new filter IDs and dashboard panels. |
| `npm run typecheck:seeded` | Pass (exit 0) | |
| Seeded spec `role-dashboard-in-transit.spec.ts` | 3 pass / 0 fail / 0 skipped (exit 0) | Initial run: Logistics drilled into Delivery; TASS drilled into its RMA; SC had 0 and checked only the empty state. After creating the AC7 fixture, rerun: all three roles had rows and ran their drill-down checks. |
| Full seeded suite | 16 pass / 7 fail / 0 skipped (exit 1) | Ran once with `SEEDED_E2E_FIXTURES=current`. The feature spec's three tests passed. Seven other Admin, Driver and TASS checks failed; see AC16 and defects below. |

### Acceptance criteria

| ID | Result (Pass / Fail / Blocked) | Evidence (response, screenshot, automated check) | Notes |
| :--- | :--- | :--- | :--- |
| AC1 | Pass | Logistics overview showed 26 requests: 19 Deliveries, 3 Procurement Pick-ups and 4 Sales Orders; those totals sum to 26. The current seed had no unassigned RMA transport request. The post-fixture E2E compared current per-type totals with filtered list totals; focused server tests cover the RMA rule. | The 4-type rule is exercised by `transportRequestFilters.test.ts`; RMA had no live request row/link in this seed. |
| AC2 | Pass | `transportRequestFilters.test.ts` passed exclusions for drafts, assigned/finished jobs, completed or other-movement RMA, and non-driver records including Accounting Collection. | Live seed lacked every exclusion case; unit test supplied coverage. |
| AC3 | Pass | Logistics preview included unassigned Rescheduled and On-Hold Deliveries; focused server test confirms On-Hold and Rescheduled jobs of every type stay in the count/list. | |
| AC4 | Pass | Logistics panel displayed 10 of 26, first dates Jul 8, Jul 9, Jul 10, etc., oldest first. Focused overview test passed bounded preview/full-total assertion. | |
| AC5 | Pass | Focused server test `log-rma-requests is unchanged and holds every RMA transport request` passed. | Confirms the legacy filter retains assigned RMA behavior. |
| AC6 | Pass | Panel title was `Transport requests`; old title absent; 10 rows showed `Needs driver`; footer had `View 19 Deliveries`, `View 3 Procurement Pickups`, `View 4 Sales Orders`. Seeded spec checked totals and opened the Delivery drill-down; client tests cover row and per-type navigation/filter mapping. | No RMA request/link existed in this seed. |
| AC7 | Pass | After the authorized fixture start, SC overview/panel showed 1 in transit: `QA-RDIT-20261112-001`, John Doe, Started Nov 12 at 1:33 PM. The post-fixture E2E checked the live row and drill-down. | Focused server test also covers started runs and any planned date. |
| AC8 | Pass | `transportRequestFilters.test.ts` passed the unstarted, held, finished, draft, unassigned and RMA exclusions. | |
| AC9 | Pass | Focused server overview test confirmed SC reads remain inside `recordScope`; the live SC dashboard reported 90 available records (70 operational records and 20 SKUs) from the 95-record database. | |
| AC10 | Pass | SC panel showed the expected eight columns, three type links and `Showing 1 of 1`. `View Deliveries in transit` opened `/deliveries`; the list showed the fixture row with the dashboard filter active. Post-fixture E2E confirmed the API filter and total. | Non-empty path exercised after fixture creation. |
| AC11 | Pass | TASS showed 1 RMA in transit, John Doe, transport started Nov 11 at 5:03 PM, status In Transit. The seeded drill-down returned the same single row. | |
| AC12 | Pass | Focused server filter test passed for Pending/Completed transport, held/rescheduled/accomplished RMA and other/non-RMA records. | |
| AC13 | Blocked | TASS showed 1 row, driver, transport start, RMA status, oldest-first ordering (one row), and `View all 1 in transit`; `/rma` opened with the filter active and returned that row. | The only seeded in-transit RMA has no `rma_reference`; the panel therefore displayed its record ID alone, not a reference with the ID below. Component test passes with a populated reference. See Open questions. |
| AC14 | Pass | After fixture start, Logistics `Drivers out for delivery` showed 2 in transit (1 Delivery + 1 RMA); SC and TASS each showed their matching 1-row set. The focused set-split test passed. | |
| AC15 | Pass | Focused client parity suite passed all three IDs: `log-transport-requests`, `sc-in-transit`, `tass-rma-in-transit`. | |
| AC16 | Fail | Typechecks, client suite, focused server/client suites and feature seeded spec passed; full server suite had only the excluded known CRLF failure. However, full seeded regression had 7 additional failures (16 passed), detailed below. | These seven failures were observed on this branch; no baseline-branch run was made to determine whether they predate it. |

### Defects found

| # | AC | Severity (Critical / High / Medium / Low) | Steps to reproduce | Expected | Actual | `path:line` if known |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | AC16 | Low | Run `npm run test:seeded` with `SEEDED_E2E_FIXTURES=current`; in Admin, open User accounts and target `sales@microgenesis.com`, then click Edit. | Inline edit starts for the Sales Coordinator row. | Playwright timed out waiting for that row's Edit button. | `e2e/seeded/admin.spec.ts:12` |
| 2 | AC16 | Low | Same suite; Admin → Roles & Permissions → View Admin permissions. | `RESOURCE:users:WRITE` checkbox is present and disabled. | Checkbox locator found no element. | `e2e/seeded/admin.spec.ts:61` |
| 3 | AC16 | Low | Same suite; Admin account page at 1280px, inspect first row. | Access button is visible and opens the permission editor. | Access button locator found no element; test timed out before opening editor. | `e2e/seeded/admin.spec.ts:93` |
| 4 | AC16 | Low | Same suite; Admin account page at 390px, inspect first row. | Access button is visible and opens the permission editor. | Access button locator found no element; test timed out before opening editor. | `e2e/seeded/admin.spec.ts:93` |
| 5 | AC16 | Low | Same suite; log in as Driver and open `driver_dashboard`. | A heading named John Doe is visible. | No such heading; the live Driver UI showed John Doe as a banner paragraph instead. | `e2e/seeded/roles.spec.ts:66` |
| 6 | AC16 | Low | Same suite; Admin logout → Driver email login. | A heading named John Doe is visible after login. | No such heading; Playwright timed out on the same heading locator. | `e2e/seeded/roles.spec.ts:66` |
| 7 | AC16 | Low | Same suite; log in as TASS, open dashboard and click the existing Open RMA panel link. | The `View RMA` link opens `/rma`. | Locator `View RMA` timed out; current dashboard button reads `View all 15 open RMA records`. | `e2e/seeded/tass.spec.ts:6` |

### Open questions

- AC13: The current in-transit seed RMA has no `rma_reference`, so the required reference-plus-record-ID display could not be verified with live data. Should this be treated as blocked until a populated reference fixture exists, or is the record-ID fallback acceptable?
- The seven full seeded-suite failures were not compared against the base branch, so their introduction point is unknown.

**Overall verdict: FAIL**


## 8. Addendum (round 2): No-driver tiles and Driver column

Changed after round 1, at Dylan's request (option A). Re-check only these items; round 1 results above stay as recorded.

**What changed**

- Logistics KPI **"No driver assigned"** now counts every driver job type with no Driver profile, using `log-transport-requests` (the same rule as the Transport requests panel). Its unit is "jobs". Clicking it scrolls to and focuses the Transport requests panel instead of opening the Deliveries list. Accessible name: `No driver assigned, N jobs. Show transport requests`.
- Logistics **"Unassigned records"** tile under "Needs attention" counts the same set (`counts['log-transport-requests']`), reads "Jobs of every type with no driver yet", and does the same scroll.
- The **Driver column** is removed from the Transport requests table (every row has no driver). Columns are now Record, Type, Company, Area, Date, Status.
- Unchanged: the `log-unassigned` filter still exists and the Sales Coordinator "Pending driver assignment" tile and saved links still use it (Deliveries only). The Logistics "Needs attention" flag count (`log-flags`) is also unchanged.

**Re-checks**

| ID | Check | Expected |
| :--- | :--- | :--- |
| R2-1 | As Logistics, compare the "No driver assigned" tile, the "Unassigned records" tile and the Transport requests panel badge. Also `GET /api/v1/dashboard/stats` `unassigned_count` and overview `counts['log-transport-requests']`. | All four numbers are equal (26 on the round 1 seed, if unchanged). |
| R2-2 | Click each of the two tiles (mouse, and Enter with keyboard focus). | The page scrolls to the Transport requests panel and focus moves to it. No list screen opens and the URL stays on the dashboard. With reduced motion turned on, the scroll is instant. |
| R2-3 | Transport requests table at desktop width and on a phone width (390px). | No Driver column or "Needs driver" text. The remaining columns and the per-type links work as in AC6. |
| R2-4 | As Sales Coordinator, the "Pending driver assignment" tile and its list. | Unchanged from before: Deliveries only, opens Deliveries filtered by `sc-pending-assignment`. |
| R2-5 | `npm run test:server`, `npm run test:client`, both typechecks, and the seeded spec `role-dashboard-in-transit.spec.ts` (it now also checks the tile count and focus). | Developer run: server 553 tests, 544 pass, 8 skipped, 1 known CRLF failure (`submittedAt.test.ts`); client 433 tests, 432 pass, 1 skipped; typechecks clean; seeded spec 3/3 pass. |

**Round 2 results**

| ID | Result (Pass / Fail / Blocked) | Evidence | Notes |
| :--- | :--- | :--- | :--- |
| R2-1 | Pass | Logistics UI showed 26 on both tiles and the Transport requests badge. Read-only API checks returned `unassigned_count=26`, `counts['log-transport-requests']=26`, and a per-type sum of 26. | All displayed and API counts matched the unchanged seed. |
| R2-2 | Pass | Mouse clicks and Enter activation on both tiles focused `#transport-requests-panel`; the URL stayed `/dashboard` and no list opened. `prefers-reduced-motion: reduce` was active; the panel was already positioned in the viewport after each activation. | Verified both tiles with both input methods. |
| R2-3 | Pass | At desktop 1355×884 and phone 390×844, headers were Record, Type, Company, Area, Date and Status, with no Driver column or “Needs driver” text in the panel. All three links opened their matching filtered lists: Deliveries (19), Procurement Pickups (3) and Sales Orders (4). | The “Transport requests” filter chip remained active in each list. No RMA link was present because its count was zero. |
| R2-4 | Pass | Sales Coordinator tile showed 19 deliveries and opened `/deliveries`; the list showed `Showing: Pending Driver Assignment (from Dashboard)` and only the Deliveries category. | Current seed returned 19 matching deliveries. |
| R2-5 | Pass | Server: 553 tests, 544 pass, 8 skipped, 1 known failure in `server/tests/submittedAt.test.ts`. Client: 433 tests, 432 pass, 1 skipped. Both typechecks passed. Seeded feature spec passed 3/3. | The Windows CRLF failure is recorded but excluded from the verdict per instruction. |
