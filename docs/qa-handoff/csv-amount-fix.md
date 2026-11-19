# QA handoff: Accounting Collection export Amount and Driver Assistant (UAT-CSV-01)

Branch: `fix/client-collection-csv-amount` (off `dev` at `1912aef`). Plan: `docs/plans/csv-amount-fix.md`.
Do not push to `staging` or `main`. Do not touch any live database. Use only a throwaway local PostgreSQL.

## What changed
- The Export menu on a single Accounting Collection record page now fills the `Amount (₱)` column (for example `₱1,234.50`) in CSV, Excel, PDF and Word. It was empty before.
- The `Driver Assistant` column was blank in every CSV, Excel and Word export that uses the shared delivery columns (Deliveries, RMA, Procurement Pick-up, Sales Orders, both Accounting Collection exports). It now lists the assistants, comma-separated.
- Client only. No server, API, database, migration or permission change.

## Setup
```bash
npm ci && (cd e2e && npm ci)
# Throwaway DB; the name must match sc255_<name>_test
export DATABASE_URL='postgresql://<user>:<pw>@localhost:5432/sc255_qa_test?schema=public' NODE_ENV=test JWT_SECRET=<32+ chars>
cd server && npx prisma generate && npx prisma migrate deploy && npx tsx prisma/seed-rma-dispatch-e2e.ts
```
The seed creates test accounts. Password for all: `sc255-test-password`.

| Email | Role |
| :--- | :--- |
| sc255-0@example.test | Admin |
| sc255-1@example.test | TASS |
| sc255-2@example.test | Logistics |

AC9 also needs a Sales Coordinator. The seed above does not create one; create one from the Admin user screen if none exists.

Start services separately: `cd server && PORT=4000 CLIENT_ORIGIN=http://localhost:3000 APP_URL=http://localhost:3000 npx tsx src/index.ts` and `cd client && npx vite --port 3000 --host localhost`.

Test data to create as Admin or TASS (Accounting Collection module):
- Record A: amount 1, with a driver and two driver assistants, then verify the collection.
- Record B: amount 1234.50. Record C: amount 150000.
- Record D: Draft saved without an amount.
- A Deliveries record with two driver assistants (for AC8).

## Commands
```bash
(cd client && npx tsc --noEmit && npm test)
(cd server && npx tsc --noEmit && npm test)
# Only the new tests
(cd client && node --import tsx --test src/utils/__tests__/collectionExport.test.ts)
```
Expected client unit result on this branch: 482 tests, 481 pass, 1 skipped, 0 fail. No server files change.

## Checks mapped to acceptance criteria
| AC | Check | Expected |
| :--- | :--- | :--- |
| AC1 | As TASS, open Record A. Export > Export CSV > Download CSV | `Amount (₱)` cell is `₱1.00`. Created By, Created At, Collection Verified (`Verified`), Verified By, Verified At are filled as on the record page |
| AC2 | Repeat AC1 as Admin | Same result |
| AC3 | From the same record menu, export Excel, Word and PDF | Excel and Word show `₱1.00` in the Amount column. PDF shows `PHP 1.00`; it may wrap over several lines (known, out of scope) |
| AC4 | Open the preview before the download | Amount column shows `₱1.00` |
| AC5 | CSV for Record B and Record C | `₱1,234.50` and `₱150,000.00`, matching the Overview tab "Amount to Collect" and the list export |
| AC6 | CSV for Record D | Amount cell is empty. No `₱0.00`, no error |
| AC7 | List page > Export CSV | Same columns, Amount values and Yes/No wording as before this change. The only difference is the Driver Assistant column |
| AC8 | Record export, list export and a Deliveries export for records with assistants; and one without | `Ben Two, Cara Three` style list; empty when none |
| AC9 | Log in as Sales Coordinator and Logistics; open the Accounting Collection list and a record | No Export menu. TASS and Admin do see it |
| AC10 | Unit tests. Temporarily remove `amount_fmt` from `client/src/utils/collectionExport.ts` and rerun the new test file | Passes as is. Fails on the column check with `amount_fmt` missing. Restore the line afterwards |
| AC11 | Commands above | All pass |

## Out of scope
Header wording, the record PDF layout (long amount wraps), Excel storing amounts as text, the list export wording, status wording (`Delivered`), the form saving an amount of 0 as no amount, and the unreachable Accounting Collection branch in `DeliveryRecordsView.tsx`.

Note: a Draft saved with amount 0 exports an empty cell; that is existing behavior.

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

Failures go back to stage 2 with the AC number and the exact request or screen.
