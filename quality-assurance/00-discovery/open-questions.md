# Open Questions and Suspected Issues

| Document control | |
|---|---|
| Title | Open Questions and Suspected Issues (Discovery) |
| Document ID | QA-DISC-002 |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Open questions answered by the user; suspected issues awaiting UAT execution |
| Baseline | Branch `dev`, commit `2172fc8` |

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-14 | Initial discovery |
| 1.1 | 2026-10-14 | User answers to OQ-01..OQ-09 recorded (§0); SI-25, SI-26 added; SI-24 resolved; cycle-1 deferrals marked |

## 0. User decisions (2026-10-14) and their effect on cycle 1

| OQ | Question | User's answer | Effect on the UAT package |
|---|---|---|---|
| OQ-01 | Who records Time In on an RMA run? | Not known yet; focus only on Deliveries for now | RMA cases (TC-RMA-*, TC-ACC-017, TC-DRV-008) **deferred** |
| OQ-02 | Should TASS see RMA in the Transaction Center? | TASS responsibilities not yet defined (no interview yet) | TASS-specific cases (TC-ACC-005, 006, 010, TC-TXN-004, TC-RPT-003, TC-MD-011) **deferred**; TASS is kept only where it proves TASS cannot touch Deliveries or admin (TC-ACC-007, TC-ADM-018) |
| OQ-03 | Who may delete records? | **No deletion of records** for now | Expected result changed: no role may delete (TC-DEL-024 now expects refusal; SI-26 added). Absence of a UI delete button is correct (SI-24 resolved, not a defect) |
| OQ-04 | Future-dated read-only rule for every category? | Focus only on Deliveries for now | TC-DRV-010 **deferred**; the Deliveries rule (TC-DRV-009) stays |
| OQ-05 | Should Drivers create customers? | **No** | TC-ACC-014 expects 403 (unchanged) |
| OQ-06 | Should Logistics submit drafts? | **No** | TC-DEL-022 expects refusal; if Logistics can submit, it is a defect (SI-03 stays Major) |
| OQ-07 | Which department owns collection verification? | Not known yet | Accounting Collection cases (TC-COL-*, TC-POD-009) **deferred** |
| OQ-08 | Should the completion email go to a real address? | For now the system's in-app notification is enough | TC-NOT-005 (mock email) **deferred**; in-app notification cases stay |
| OQ-09 | Should Sales Coordinator get Calendar and Reports? | **Yes** | Expected results changed: SC must see "Delivery Calendar" and "Reports" (TC-ACC-001, TC-ACC-002, TC-RPT-006); today's code does not grant them (SI-25 added) |

Also deferred because the user asked to focus on Deliveries: Procurement Pick-up (TC-PRC-*) and Sales Orders (TC-SO-*). Bulk list actions are now tested on Deliveries instead (TC-DEL-029, TC-DEL-049). Deferred cases stay in the package for a later cycle; Codex records them as **Not Run** with the reason written in each case.

This file holds two kinds of items found while reading the code:

- **Suspected issues (SI-xx):** behaviour in the code that looks inconsistent with a project convention, the project's own documentation, or another part of the code. **Nothing here has been fixed or changed.** Each item names the test case(s) written to expose it, so Codex can confirm it (Fail) or disprove it (Pass).
- **Open questions (OQ-xx):** places where the intended business behaviour is not decidable from the code. The user should answer these; the answers may turn a Pass into a Fail or vice versa.

Code references are `path:line` at commit `2172fc8`.

---

## 1. Suspected issues

| ID | Suspected issue | Evidence | Exposed by | Proposed severity if confirmed |
|---|---|---|---|---|
| SI-01 | TASS gets the **Procurement Pick-up** screen by default, but the server never returns Procurement Pick-up records to TASS, so the module is always empty for TASS. | Default screens `server/src/services/permissions.ts:21`; record scope excludes the category for TASS `server/src/services/recordAccess.ts:17`. Project docs flag it too (`docs/BUSINESS_REQUIREMENTS.md` §9). | TC-ACC-006, TC-PRC-006 | Minor |
| SI-02 | Role dashboards count records the role cannot open: the TASS dashboard counts Procurement Pick-ups (`pending_procurement_pickup`), and no dashboard count applies the user's record scope or per-user category denials. | `server/src/routes/dashboard.ts:13-20`, `:58-79` (no `recordScope`), compare `server/src/routes/records.ts:367-380` which does scope. | TC-RPT-003, TC-RPT-004 | Minor |
| SI-03 | A role other than Sales Coordinator/Admin can **submit a Draft** through the status action. `transitionError` restricts only the target `Draft`; the status route restricts only the Sales Coordinator. Logistics (and TASS for an RMA draft) can change Draft to Scheduled, although the edit route and the docs say only Sales Coordinator/Admin may submit drafts. | `server/src/services/deliveryLifecycle.ts:77-83`; `server/src/routes/records.ts:1125`, `:1143`; edit-route rule `server/src/routes/records.ts:902`, `:1025`; `docs/BUSINESS_REQUIREMENTS.md` BR-REC-03. | TC-DEL-022, TC-RMA-008 | Major |
| SI-04 | Record **creation** does not validate the Delivery Date format, the Priority value or that the Company exists. The edit route validates the date. An unknown `company_id` is expected to produce a database error (HTTP 500) instead of a 400. | `server/src/routes/records.ts:818-858` (create) vs `:1001-1003` (edit). | TC-DEL-005, TC-DEL-006, TC-DEL-007 | Major |
| SI-05 | Many route handlers are `async` but **not wrapped in `asyncRoute`** on Express 4. When the database rejects a write (for example a unique-constraint violation), the error never reaches the error handler, so the HTTP request is expected to **hang with no response** (only `[unhandledRejection]` in the server log). Examples: duplicate SKU code, editing a user to an email that already exists, creating a customer with a non-text name. | `server/src/middleware/asyncRoute.ts:3-5` (explains the need); unwrapped handlers e.g. `server/src/routes/skus.ts:132`, `:95`, `server/src/routes/users.ts:149`, `server/src/routes/customers.ts:32`; `server/src/index.ts:42-43`. | TC-SKU-004, TC-ADM-008, TC-MD-006 | Major |
| SI-06 | SKU creation writes the product, its inventory row and its audit entry as three separate statements, not one transaction (project convention: multi-model writes use `prisma.$transaction`). Numeric fields are converted with `Number()` and never range-checked, so negative or non-numeric cost/price/reorder point are not rejected cleanly. | `server/src/routes/skus.ts:140-178`; `CLAUDE.md` "Multi-model writes use `prisma.$transaction`". | TC-SKU-003, TC-SKU-005 | Minor |
| SI-07 | Stock adjustment accepts any free-text `type` although the schema documents four values (Goods Receipt, Sale, Adjustment, Transfer); its audit entry is written after, outside, the stock transaction. | `server/prisma/schema.prisma:237`; `server/src/routes/skus.ts:192-229`, `:248-255`. | TC-SKU-008 | Minor |
| SI-08 | Collection verification and record soft delete update the record and write the audit entry in separate statements (no transaction), contrary to the convention. A failure between the two leaves an unaudited change. Not directly observable in UAT; covered by checking the audit entry exists. | `server/src/routes/records.ts:1216-1234`, `:1252-1265`. | TC-COL-006, TC-DEL-024 | Minor |
| SI-09 | `POST /api/notifications/send-email` is a **write route with no `requireRole`** (convention: every write route has `requireAuth` + `requireRole`). Any role with record access, including Driver, can make the server email every active Logistics and TASS user. The Account Manager recipient is resolved by a last-name substring match, so it may email the wrong user. | `server/src/routes/notifications.ts:100-150`, AM lookup `:72-86`; `CLAUDE.md` Backend conventions. | TC-NOT-007 | Major |
| SI-10 | Admin user changes (edit name/email/role, deactivate, activate, delete) write **no audit log entry**, while user creation with a Microsoft identity, Driver login links and module-access changes do. | `server/src/routes/users.ts:149-300` vs `:56-65`, `:117-146`, `server/src/services/permissions.ts:111-114`. | TC-ADM-010 | Minor |
| SI-11 | The Admin audit-log action filter only accepts CREATE, UPDATE and DELETE, so `LINK_LOGIN` / `UNLINK_LOGIN` entries written by Driver login linking cannot be filtered (the filter is silently ignored). | `server/src/routes/admin.ts:22-25`; actions written at `server/src/services/driverLogin.ts:14-18`. | TC-ADM-016 | Trivial |
| SI-12 | Customer **creation** skips the validation applied to customer **edits** (email format, allowed phone characters, length limits, trimmed required name). | `server/src/routes/customers.ts:32-58` vs `server/src/services/customerValidation.ts:4-54`. | TC-MD-005 | Minor |
| SI-13 | Supplier `category` is not checked against the documented list (Hardware, Consumables, Electronics, Packaging, Services); suppliers have no edit or delete route. | `server/src/routes/suppliers.ts:30-45`; `server/prisma/schema.prisma:105`. | TC-MD-010 | Trivial |
| SI-14 | TASS can **assign a driver, vehicle and assistants and set a linked collection** on RMA records through the edit route (TASS shares the Logistics field branch), while the project's capability table says TASS cannot assign drivers. | `server/src/routes/records.ts:915-917`, `:934-973`; `docs/BUSINESS_REQUIREMENTS.md` §4 "Assign driver/vehicle: TASS No". | TC-RMA-006 | Major |
| SI-15 | Users created by Admin have no password strength or email format check. | `server/src/routes/users.ts:33-47`. | TC-ADM-004 | Minor |
| SI-16 | Transaction Center inventory date filter uses the server's local time (`setHours`) rather than Asia/Manila; delivery-row status filter compares raw stored values (`SCHEDULED`, `ACCOMPLISHED`), so a Draft or a legacy started run is not filtered by its displayed state. | `server/src/routes/transactions.ts:54`, `:94-99`. | TC-TXN-006 | Trivial |
| SI-17 | **TASS has no UI to work RMA records.** The record workspace tabs (Overview, Dispatch & Logistics, Comments, Remarks History, Audit Trail, Documents) are all limited to Sales Coordinator, Logistics and Admin, so a TASS user opening an RMA sees no tabs, although the server lets TASS edit and change the status of RMA records. | `client/src/features/deliveries/DeliveryRecordWorkspace.tsx:93-100`; server `server/src/routes/records.ts:889-892`, `:1124`; `docs/BUSINESS_REQUIREMENTS.md` §8.3 | TC-RMA-003 | Critical |
| SI-18 | **SKU create and edit exist only in the API.** No screen calls `createSku`/`updateSku`; SKU Master is read-only except Stock Adjustment, while the docs list SKU create/edit as an Admin feature. | `client/src/api/index.ts:606`; `server/src/routes/skus.ts:95`, `:132`; `docs/BUSINESS_REQUIREMENTS.md` BR-SKU-01 | TC-SKU-002 | Major |
| SI-19 | The "Request Temporary Access" modal tells the user "Request Sent / Your admin has been notified." but makes no API call; no admin is notified. | `client/src/components/AccessRequestModal.tsx:25-34`, `:44-45` | TC-ACC-016 | Minor |
| SI-20 | The Accounting Collection **Documents** tab is a placeholder ("This section is under development…"); collections can only get files through the Overview Proof of Delivery uploader. | `client/src/features/accounting/AccountingCollectionWorkspace.tsx:151-160`, `:758` | TC-COL-008 | Minor |
| SI-21 | The create form labels **Delivery Date "(optional)"**, but Submit fails with "Delivery Date is required". | `client/src/features/deliveries/RecordCreateForm.tsx:496`; `client/src/utils/recordLifecycle.ts:8`; `server/src/routes/records.ts:819` | TC-DEL-004 | Trivial |
| SI-22 | Main → **"New Delivery"** is offered to TASS (its category list includes RMA, Accounting Collection and Procurement Pick-up) but the server refuses record creation for TASS (403 "Forbidden for this role"). | `client/src/pages/MainView.tsx:114-121`, `:195-209`; `server/src/routes/records.ts:793` | TC-ACC-010 | Minor |
| SI-23 | The Verification tab says "Verification requires TASS or Admin role." but the API allows TASS only, so Admin gets 403 if a Verify button is offered. | `client/src/features/accounting/AccountingCollectionWorkspace.tsx:370`; `server/src/routes/records.ts:1197` | TC-COL-007 | Minor |
| SI-24 | Record **soft delete has no UI**: the API exists for Sales Coordinator but no screen calls it. | `client/src/api/index.ts:542` (only attachment delete); `server/src/routes/records.ts:1248` | TC-DEL-025 | **Resolved 2026-10-14: not a defect** (OQ-03, no deletion; the missing button is correct) |
| SI-25 | **Sales Coordinator lacks "Delivery Calendar" and "Reports".** The user decided (OQ-09) that Sales Coordinator should have both, but the role defaults grant neither, so the screens are hidden and `GET /api/reports/summary` returns 403. | `server/src/services/permissions.ts:19` (no `calendar` or `statistical_reports`); `server/src/routes/reports.ts:13` | TC-ACC-001, TC-ACC-002, TC-RPT-006 | Major |
| SI-26 | **Records can be deleted by Sales Coordinator through the API**, although the user decided (OQ-03) that records are not deleted at all for now. | `server/src/routes/records.ts:1248-1268` | TC-DEL-024 | Major |

Suspected issues whose only covering cases are deferred in cycle 1 (they stay open for a later cycle): SI-01, SI-08, SI-14, SI-17, SI-20, SI-22, SI-23. SI-02 is still tested through TC-RPT-004.

## 2. Open questions (answered 2026-10-14; see §0 for the answers and their effect)

| ID | Question | Why it matters | Code reference | Affects |
|---|---|---|---|---|
| OQ-01 | Who is supposed to record **Time In** on an RMA run? TASS may change RMA status but cannot record Time In; Logistics is view-only on RMA. Only Admin or an assigned Driver can start an RMA run, and Delivered/Pending need a Time In. | Decides whether the RMA completion path in TS-005 is expected to work for TASS. | Time In roles `server/src/routes/records.ts:1080`; Logistics RMA block `:30-35`, `server/src/services/recordAccess.ts:42` | TC-RMA-007 |
| OQ-02 | Should TASS see **RMA** in the Transaction Center? TASS works RMA records but the Transaction Center limits TASS to Accounting Collection. | Decides Pass/Fail of TC-TXN-004. | `server/src/services/transactionAccess.ts:13` | TC-TXN-004 |
| OQ-03 | Is it intended that only **Sales Coordinator** can soft-delete records, that they can delete any record (including Delivered and records created by others) without remarks, and that Admin cannot delete at all? | Defines expected results for delete cases. | `server/src/routes/records.ts:1248-1268` | TC-DEL-024, TC-DEL-025, TC-DEL-027 |
| OQ-04 | Should the Driver's "future-dated runs are read-only" rule apply to all categories? Today it applies only to **Deliveries**; a future-dated RMA, Collection, Pick-up or Sales Order run is actionable by the Driver. | Decides Pass/Fail of TC-DRV-010. | `server/src/services/deliveryLifecycle.ts:40-46` | TC-DRV-010 |
| OQ-05 | Customer creation is allowed for Driver in the code comment and the project docs (BR-DIR-02), but Driver accounts can never hold the Customers screen, so they can never create one. Which is intended? | Decides expected result of TC-ACC-014. | `server/src/routes/customers.ts:31-32`; `server/src/services/permissions.ts:28-30` | TC-ACC-014 |
| OQ-06 | Should Logistics be able to **submit drafts** (see SI-03)? If yes, SI-03 is not a defect. | Severity of SI-03. | as SI-03 | TC-DEL-022 |
| OQ-07 | Which department owns collection verification (TASS or Finance)? The project's own docs leave it open. | Context only; the test follows the code (TASS). | `docs/BUSINESS_REQUIREMENTS.md` BR-TASS-03 | TC-COL-005 |
| OQ-08 | Is the completion email meant to go to a real address? The code builds `<account.manager>@microgenesis.example` from the Account Manager's name. | Context only; UAT checks only the `NotificationLog` row through the UI/API. | `server/src/services/notify.ts:24-25` | TC-NOT-005 |
| OQ-09 | Should the Statistical Reports, Calendar and Driver Board be reachable by Sales Coordinator? They are not in the Sales Coordinator defaults. | Context; tests follow the defaults. | `server/src/services/permissions.ts:19` | TC-ACC-002 |

## 3. Known gaps in this UAT package

- Microsoft SSO is excluded by decision of the user (see the Test Plan §3.2). The `microsoft_oid` field in user creation is therefore not tested.
- Scheduled reminders (4 PM, 6 PM, Monday 8 AM) are not tested because they need the clock to reach a time of day.
- Exact on-screen labels were read from the client source code. If a label differs at run time, Codex follows the intent of the step and records the deviation in the execution log.
