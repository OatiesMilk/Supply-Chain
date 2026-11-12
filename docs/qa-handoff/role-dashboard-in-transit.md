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

**Build tested:** branch `________`, commit `________`, date `________`.

**Database:** host / port / database name: `________`. Confirmed disposable: yes / no.

**Setup notes:** `________`

**Test data left in the disposable database:** `________`

### Automated checks

| Command | Result (pass / fail / skipped counts) | Notes |
| :--- | :--- | :--- |
| Server `npx tsc --noEmit` | | |
| Client `npx tsc --noEmit` | | |
| `npm run test:server` | | |
| `npm run test:client` | | |
| Focused server tests | | |
| Focused client tests | | |
| `npm run typecheck:seeded` | | |
| Seeded spec `role-dashboard-in-transit.spec.ts` | | Did each test run its drill-down or only the empty state? |
| Full seeded suite | | |

### Acceptance criteria

| ID | Result (Pass / Fail / Blocked) | Evidence (response, screenshot, automated check) | Notes |
| :--- | :--- | :--- | :--- |
| AC1 | | | |
| AC2 | | | |
| AC3 | | | |
| AC4 | | | |
| AC5 | | | |
| AC6 | | | |
| AC7 | | | |
| AC8 | | | |
| AC9 | | | |
| AC10 | | | |
| AC11 | | | |
| AC12 | | | |
| AC13 | | | |
| AC14 | | | |
| AC15 | | | |
| AC16 | | | |

### Defects found

| # | AC | Severity (Critical / High / Medium / Low) | Steps to reproduce | Expected | Actual | `path:line` if known |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| | | | | | | |

### Open questions

-
