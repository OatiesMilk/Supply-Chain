# QA handoff: Logistics RMA transport for drivers

Branch: `feature/logistics-rma-transport` (off `dev` at `40c14af`). Plan: `docs/plans/logistics-rma-transport.md`.
Do not push to `staging` or `main`. Do not touch any live database. Use only a throwaway local PostgreSQL.

## What changed
Logistics can Start transport, upload the proof photo and Complete transport on an assigned Logistics-transport RMA, for the
assigned driver. This is off until a per-environment switch runs. Same rules as the driver, plus required remarks on Start.

## Setup
```bash
npm ci && (cd e2e && npm ci)
# Throwaway DB; the name must match sc255_<name>_test
export DATABASE_URL='postgresql://<user>:<pw>@localhost:5432/sc255_qa_test?schema=public' NODE_ENV=test JWT_SECRET=<32+ chars>
cd server && npx prisma generate && npx prisma migrate deploy && npx tsx prisma/seed-rma-dispatch-e2e.ts
```
The seed creates test accounts and applies the switch. Password for all: `sc255-test-password`.

| Email | Role |
| :--- | :--- |
| sc255-0@example.test | Admin |
| sc255-1@example.test | TASS |
| sc255-2@example.test | Logistics |
| sc255-3@example.test | Driver (RMA Driver 3) |
| sc255-4@example.test | Driver (RMA Driver 4) |

Start services separately: `cd server && PORT=4000 CLIENT_ORIGIN=http://localhost:3000 APP_URL=http://localhost:3000 POD_UPLOAD_DIR=/tmp/pod npx tsx src/index.ts` and `cd client && npx vite --port 3000 --host localhost`.

## Commands
```bash
(cd server && npx tsc --noEmit && npm test)
(cd client && npx tsc --noEmit && npm test)
# PostgreSQL switch test (needs a DB named sc255_*_test)
(cd server && RMA_DISPATCH_TEST_DATABASE_URL='postgresql://<user>:<pw>@localhost:5432/sc255_qa_test' node --import tsx --test tests/rmaDispatch.postgres.test.ts)
(cd e2e && npx playwright test --config rma-dispatch.config.ts --trace off -g "Logistics starts and completes")
```
Known: the E2E case "three online sessions synchronize..." fails at its Logistics board step on unmodified `dev` too. Not part of this change.

## Checks mapped to acceptance criteria
Setup unless stated: submitted RMA, movement Logistics transport, assigned driver, planned date today (Asia/Manila), transport Pending.

| AC | Check | Expected |
| :--- | :--- | :--- |
| AC1 | Logistics `PATCH /records/:id/rma-transport` `IN_TRANSIT` with remarks | 200, In Transit, started time set, remark and audit under the Logistics user |
| AC2 | Same without remarks | 400, nothing saved |
| AC3 | Planned date tomorrow | 403; UI shows no buttons and "Transport can start on <date>." |
| AC4 | No assigned driver, draft, Supplier collection, Internal, already received, already Completed | 403 each |
| AC5 | Logistics uploads a JPG/PNG while In Transit; while Pending | 201; 403 |
| AC6 | `COMPLETED` with remarks, Received By and saved photo; then without Received By, over 120 chars, without photo | 200 and RMA status unchanged, receipt unconfirmed; then 400 each |
| AC7 | Stale `expected_version` | 409 |
| AC8 | Logistics: `PATCH /status` (Pending, On-Hold, Rescheduled, Delivered), `PUT /records/:id`, `POST /time-in`, `POST /rma-receipt`, attachment delete | 403 each |
| AC9 | Revoke the switch (below), repeat AC1 and AC5; check `GET /rma-capabilities` | 403; `transport:false`, `pod:false` |
| AC10 | Driver starts and completes own RMA (Received by required in the panel); other driver's RMA | works; 403 |
| AC11 | TASS, Admin, Sales Coordinator on `rma-transport` | 403 |
| AC12 | Switch script, from `server` with `RMA_DISPATCH_ADMIN_ID=sc255-user-0`: dry run, `-- --apply`, repeat, `-- --revoke`; then change one Logistics policy row and `-- --apply` | dry run writes nothing; apply changes 2 rows with 1 audit entry; repeat unchanged; revoke sets both DENY; customized policy skipped, exit 1 |
| AC13 | UI as Logistics: RMA > Status & Actions, and Drivers > View for the run | remarks and Start transport; then uploader, Received by, Complete transport; Overview stays read-only |
| AC14 | Driver job card while Logistics acts | shows the new state without reload |
| AC15 | Commands above | all pass |

Switch script: `npm run permissions:activate-rma-logistics-transport` (dry run), add `-- --apply` or `-- --revoke`.

## Out of scope
Logistics editing RMA, confirming receipt, final completion, status changes; Admin; notifying drivers; other categories.

## Results (Codex fills in)
| AC | Pass/Fail | Notes and evidence |
| :--- | :--- | :--- |
| AC1 | | |
| AC2 | | |
| AC3 | | |
| AC4 | | |
| AC5 | | |
| AC6 | | |
| AC7 | | |
| AC8 | | |
| AC9 | | |
| AC10 | | |
| AC11 | | |
| AC12 | | |
| AC13 | | |
| AC14 | | |
| AC15 | | |

Failures go back to stage 2 with the AC number and the exact request or screen.
