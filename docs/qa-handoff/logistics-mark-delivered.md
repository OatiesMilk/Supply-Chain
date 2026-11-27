# QA handoff: Logistics "Mark as delivered" and "Start transport" dialogs

Branch: `feature/logistics-mark-delivered` (off `dev`, after `feature/logistics-rma-transport` merged). Plan: `docs/plans/logistics-mark-delivered.md`.
Do not push to `staging` or `main`. Do not touch any live database. Use only a throwaway local PostgreSQL.

## What changed
Client-only change. No API, server, permission or database change. Every record type gets one **Next step** card with
one button: **Start transport**, then **Mark as delivered** (**Mark as collected** on Accounting Collection). Each button
opens a dialog that holds what that step needs:
- Start transport: required remarks.
- Mark as delivered / collected: proof photo (JPG or PNG), Received by (1 to 120 characters), required remarks, and a live
  "Still needed" line.

The always-on proof uploader, the "Delivered" status option, Received By before delivery and the blue Record Time In box
are gone from the record page, Accounting Collection, the RMA panel and Drivers > View. Screens covered: record page
Status & Actions (Deliveries, Sales Orders, Procurement Pick-up, RMA), Accounting Collection > Overview > Collection
Status, Drivers > View.

## Setup
```bash
npm ci && (cd e2e && npm ci)
# Throwaway DB only. Never staging, production or a shared database.
export DATABASE_URL='postgresql://<user>:<pw>@localhost:5432/sc_qa_test?schema=public' NODE_ENV=test JWT_SECRET=<32+ chars>
cd server && npx prisma generate && npx prisma migrate deploy && npm run seed:uat
```
For the RMA checks (AC11, AC12) also apply the RMA Logistics transport switch on the same throwaway DB, from `server`:
`npm run permissions:activate-rma-logistics-transport` (dry run), then add `-- --apply`. Alternatively seed with
`npx tsx prisma/seed-rma-dispatch-e2e.ts` (accounts below, password `sc255-test-password`).

Start services separately (do not use `npm run dev` inside tests):
`cd server && PORT=4000 CLIENT_ORIGIN=http://localhost:3000 APP_URL=http://localhost:3000 POD_UPLOAD_DIR=/tmp/pod npx tsx src/index.ts`
and `cd client && npx vite --port 3000 --host localhost`.

| Email | Password | Role |
| :--- | :--- | :--- |
| logistics@microgenesis.com | password123 | Logistics |
| admin@microgenesis.com | admin123 | Admin |
| sales@microgenesis.com | password123 | Sales Coordinator |
| tass@microgenesis.com | password123 | TASS |
| driver@microgenesis.com | password123 | Driver (John Doe) |
| sc255-2@example.test | sc255-test-password | Logistics (RMA seed) |
| sc255-1@example.test | sc255-test-password | TASS (RMA seed) |
| sc255-0@example.test | sc255-test-password | Admin (RMA seed) |
| sc255-3@example.test | sc255-test-password | Driver (RMA seed) |

## Commands
```bash
(cd client && npx tsc --noEmit && npm test)
(cd server && npx tsc --noEmit && npm test)     # unchanged, must still pass
# Logistics Delivery E2E (needs services running, UAT seed)
(cd e2e && npx playwright test --config playwright.config.ts --project=Logistics --trace off -g "B-2.5d")
# Logistics RMA E2E (needs the RMA seed and switch)
(cd e2e && npx playwright test --config rma-dispatch.config.ts --trace off -g "Logistics starts and completes")
```
Expected counts on the reference run: client 476 pass / 1 skipped, server 579 pass / 12 skipped, 0 failures.
Known: the RMA E2E case "three online sessions synchronize..." fails at its Logistics board step on unmodified `dev` too.
Not part of this change.

Test files per area: `client/src/utils/__tests__/completionDialog.test.ts`, `client/tests/markDeliveredDialog.test.ts`,
`client/tests/logisticsNextStep.test.ts` (record page), `client/tests/rmaCompletionWorkspace.test.ts` (RMA),
`client/tests/accountingMarkCollected.test.ts`, `client/tests/driverViewMarkDelivered.test.ts`.

## Checks mapped to acceptance criteria
Setup unless stated: signed in as Logistics; a submitted Delivery assigned to a driver, Time In recorded, status In Transit.
RMA cases assume the RMA switch is applied. Photo = any small JPG or PNG.

| AC | Check | Expected |
| :--- | :--- | :--- |
| AC1 | Open the record > Status & Actions | Next step card first with Mark as delivered. No proof uploader, Received By input or "Delivered" status option on the tab. Pending, On-Hold, Rescheduled still offered |
| AC2 | Click Mark as delivered | Modal titled "Mark as delivered" showing company, type, reference, "Recording for <driver>. This is saved under your name.", photo picker, required Received by (max 120), required Remarks. Focus inside; page behind unusable |
| AC3 | Fill fields one at a time; try a PDF alone | Confirm disabled and "Still needed" lists each missing item until a JPG/PNG is staged, Received by has 1 to 120 chars and remarks are typed. A PDF alone does not count |
| AC4 | Complete all fields, Confirm; watch network | Upload, then `PATCH /records/:id/status` with `Delivered`, trimmed `received_by`, remarks. 200; dialog closes; "Marked as delivered"; record shows Delivered with Time out and Received by; card reads "Delivered <time>. Received by <name>." |
| AC5 | Force a failure (no verified photo 400, 403, network off) | Dialog stays open with the message and typed values; nothing saved |
| AC6 | Complete a record that has Accomplished output actions configured (account manager notification) | Same notification fired as the old Save path, same trigger and arguments |
| AC7 | Cancel, then Escape; then try both while saving | Nothing saved, typed values cleared, staged photos stay staged, focus returns to Mark as delivered. While saving, Cancel and Escape do nothing |
| AC8 | Repeat AC1 to AC7 on a Sales Order and a Procurement Pick-up | Same results |
| AC9 | Assigned Scheduled run without Time In; then one with no driver | Start transport button; dialog requires remarks, sends `POST /records/:id/time-in`; 200 and run is In Transit with Mark as delivered shown; blue Record Time In box gone. No driver: card says to assign one, no button |
| AC10 | Accounting Collection > Overview > Collection Status | Start transport then Mark as collected; dialog titled "Mark as collected"; 200 and status Collected; TASS gets "Collection ready for verification". No inline uploader, Received By or Collected status button for Logistics |
| AC11 | RMA, Logistics transport, In Transit | Transport card above the assignment form with Mark as delivered; transport proof photo; Confirm sends `PATCH /records/:id/rma-transport` `COMPLETED` with `received_by`, `remarks`, `expected_version`; 200; "Transport: Complete" and "Awaiting physical receipt confirmation by TASS."; RMA status unchanged. Stale version: 409 keeps dialog open with "This RMA changed in another session. Close this and try again." and refreshes |
| AC12 | RMA Pending; then planned date in the future | Start transport dialog sends `IN_TRANSIT` with remarks. Future date: "Transport can start on <date>." and no button. Save assignment still works with its own remarks |
| AC13 | Admin, TASS, Sales Coordinator; Logistics with Complete off for a category; before the RMA switch | Admin sees buttons on non-RMA records where it has rights and never on RMA transport; TASS and Sales Coordinator never; no Mark as delivered where Complete is off; no RMA transport button before the switch |
| AC14 | Draft; Delivered; RMA transport Completed or received; RMA movement not Logistics transport | No button on any of them |
| AC15 | Pick a status option, change a driver or type remarks without saving | Next step button disabled; card says "Save or revert your changes below first." |
| AC16 | Drivers > View for a run, and for an RMA run | Record time in and Mark as delivered open the same dialogs; no inline Received By or uploader; Pending and Reschedule work as before; RMA run shows the Transport card |
| AC17 | Keyboard only, then 390 x 844 viewport; screen reader | Every control in card and dialog reachable with Tab, visible focus ring, 44 px targets; dialog fits without sideways scroll; title, description, "Still needed" changes and errors announced |
| AC18 | Driver dashboard (driver@microgenesis.com, 390 x 844): job card, start sheet, complete sheet | Unchanged behaviour |
| AC19 | Commands above | All pass, including the Logistics Delivery and RMA E2E cases |

## Out of scope
Server, API, permission and database changes; the RMA permission switch (previous feature). Pending, On-Hold,
Rescheduled and Return to Draft keep their option buttons and Save Changes. TASS RMA actions and collection
verification. The driver dashboard. A server-side 120-character limit for Received By on non-RMA records.

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
| AC16 | | |
| AC17 | | |
| AC18 | | |
| AC19 | | |

Failures go back to stage 2 with the AC number and the exact request or screen.
