# Driver Start Confirmation QA Results

**Branch:** `feature/driver-start-confirmation`  
**Date:** 2026-11-13  
**Target:** Local app on `localhost:3000`, API on `localhost:4000`, database verified as `mg_portal_sandbox` on loopback port `5433`.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC1 | **Pass** | As Driver John Doe, opened Start transport for Delivery `DEL-26-00036`; the sheet showed an optional note and enabled Confirm while blank. Confirm succeeded. The record became `IN_TRANSIT` with `time_in=2026-11-13T01:48:04.350Z`; one `TIME_IN` remark `Transport started` and one matching Driver audit update were recorded. |
| AC2 | **Pass** | As Driver, started Logistics-transport RMA `RMA-26-00021` with the note blank. `rma_transport_status` became `IN_TRANSIT`, `rma_transport_started_at` was set, and TASS and Logistics each received one `RMA transport updated` notification (`RMA-26-00021 · In transit.`). |
| AC3 | **Pass** | For blank Delivery `DEL-26-00036`, the new history row was exactly `Transport started` / `TIME_IN` / Driver; one corresponding Driver `UPDATE` audit was recorded. For blank RMA `RMA-26-00021`, the new row was exactly `Transport started` / `RMA_TRANSPORT` / Driver and one corresponding audit was recorded. The RMA remark/audit counts increased from 2/3 to 3/4. |
| AC4 | **Pass** | Logistics posted `/records/REC-95cee1a2-957a-4a3d-97a0-403eba6a3735/time-in` with `{}` and received HTTP 400, `Remarks are required when recording Time In.` Admin posted the same blank action for writable Accounting Collection `COL-26-00014` and received the same 400/message. In the Logistics UI, the unstarted Delivery showed “Enter remarks below before starting” and a disabled Record Time In button. Admin is view-only for Deliveries, so its Delivery request correctly returned 403; the Admin required-remarks check was exercised on a writable category. |
| AC5 | **Pass** | Driver started Delivery `DEL-26-00032` with `   QA typed start note   `; the saved `TIME_IN` body was `QA typed start note`. Driver started QA RMA `RMA-26-00026` with `   QA RMA typed start note   `; the saved `RMA_TRANSPORT` body was `QA RMA typed start note`. Both were trimmed. |
| AC6 | **Pass** | Driver POST `/time-in` with numeric `remarks: 42` and PATCH `/rma-transport` with numeric `remarks: 42` each returned HTTP 400, `Remarks must be text.` No start/completion was applied by these requests. |
| AC7 | **Pass** | Driver PATCH to complete Delivery `DEL-26-00036` without remarks returned HTTP 400, `Remarks are required when changing status.` RMA `RMA-26-00026` transport `COMPLETED` without remarks returned HTTP 400, `Remarks are required for this RMA action.` Playwright `C-2.10` passed: the Delivery completion sheet’s Confirm button was disabled with no remarks. |
| AC8 | **Fail** | Delivery `DEL-26-00032` Remarks History displayed “Transport started”; its generated Delivery manifest Documentation Trail showed context “Transport started” for `QA typed start note`. RMA `RMA-26-00026` Remarks History displayed “RMA TRANSPORT” for `QA RMA typed start note`. However, its generated RMA PDF omitted the Documentation Trail and Remarks History context table, so the PDF did not show the mapped “RMA transport” context label. See failure details below. |
| AC9 | **Pass** | Driver POST `/time-in` for unassigned `DEL-26-00013` returned HTTP 403, `Record access denied`. Driver POST for future assigned `DEL-26-00030` (delivery date 2026-11-15) returned HTTP 400, `This delivery is scheduled for a future date and is read-only until that date.` A read-only permission-evaluator check with `CATEGORY:DELIVERY:TIME_IN = DENY` returned `allowed=false`; no live account permission was changed. |
| AC10 | **Fail** | Server/client typechecks and unit suites passed. `e2e/tests/integration.spec.ts` passed 3/3, including its blank-note Delivery start. The fresh-auth run of `e2e/tests/driver.spec.ts` had 12 passed and 2 failed; `C-2.1` performed the typed-note start but failed its ambiguous text assertion, and `C-3.2` failed because the expected `SAP-UAT-DELIVERED-PRIORITY` fixture was absent. The E2E acceptance is therefore not fully passing. See details below. |

## Checks run

- `cd server && npx tsc --noEmit`: **Pass**.
- `cd server && npm test`: **569 passed, 12 skipped, 0 failed** (581 total).
- `cd client && npx tsc --noEmit`: **Pass**.
- `cd client && npm run test`: **437 passed, 1 skipped, 0 failed** (438 total).
- `e2e/tests/integration.spec.ts`: **3 passed**. The test logged `cleanup returned 403` for its created Delivery; that record was subsequently exercised by X-1 and remains as `DEL-26-00038` (`SAP-TSK120-1794535377032`), `IN_TRANSIT`, assigned to John Doe, in the local sandbox.
- `e2e/tests/driver.spec.ts`: after refreshing saved test auth and restoring the original auth-state files, **12 passed, 2 failed**. The initial no-dependency run used expired saved auth and was superseded by this fresh-auth result. All three saved auth-state files were hash-checked after restoration.

### AC8 failure details

1. Opened RMA `RMA-26-00026` in Logistics, selected Remarks History, and confirmed the visible `RMA TRANSPORT` label and typed remark.
2. Selected Download PDF, confirmed the paper size, and inspected the generated RMA PDF.

**Expected:** The RMA manifest PDF’s documentation trail includes the remark context as “RMA transport,” rather than omitting the context or exposing a raw code.  
**Actual:** The RMA PDF contained record fields including Movement method `Logistics transport`, Transport status `In Transit`, Transport started timestamp, and the typed remark, but it had no Documentation Trail/Remarks History context row. The equivalent Delivery PDF did show “Transport started.”

### AC10 failure details

- **C-2.1:** Clicked Start transport, entered `Started run via mobile app`, and confirmed. The app persisted the start and the note on `COL-26-00014`. The following test assertion expected `/transport started:/` to resolve uniquely; it matched seven existing started-run labels and failed with a Playwright strict-mode violation.
- **C-3.2:** Opened Done today and expected a card containing `SAP-UAT-DELIVERED-PRIORITY`. That record was not present in the sandbox, so the assertion timed out.

## QA data and artifacts

Manual QA assigned `DEL-26-00036` and `DEL-26-00032` to John Doe and started them. TASS created `RMA-26-00026`; Logistics assigned it to John Doe; Driver started its transport. These records remain in the local disposable database. The E2E-created `DEL-26-00038` also remains in that database after the cleanup warning above.

The app-generated PDFs used to inspect AC8 remain in Downloads as `manifest-DEL-26-00032-2026-11-10.pdf` and `manifest-RMA-26-00026-2026-11-13.pdf`; rendered previews and Playwright outputs are under `%TEMP%`. A cleanup command for these generated artifacts was blocked by automatic file review, so I left them intact. No application source or test files were edited. The pre-existing `package-lock.json` modification and `e2e/artifacts/` directory were left untouched.

## Overall verdict

**FAIL** — AC8 and AC10 did not fully pass.
