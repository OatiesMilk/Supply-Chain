# Test Data

| Document control | |
|---|---|
| Title | UAT Test Data |
| Document ID | QA-TD-001 |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

All values here are test values for a **disposable local database**. No real credentials or secrets appear in this file. Passwords are supplied by the user at run time and must never be written to any file, log, report or screenshot caption.

## 1. Placeholders

| Placeholder | Meaning | Example |
|---|---|---|
| `<RUN>` | Run tag from the run ID, `R` + the run's two-digit sequence | `R01` for `RUN-20261015-01` |
| `<TODAY>` | Asia/Manila calendar date when the case runs, `YYYY-MM-DD` | `2026-10-15` |
| `<TODAY+n>` | `<TODAY>` plus n days | `<TODAY+3>` = `2026-10-18` |
| `{D-XXX-NN.id}` | Record ID returned when data item D-XXX-NN was created (shown in the "Record Created" banner, e.g. `REC-23817`) | `REC-23817` |
| `<password: KEY>` | Password the user supplies for account KEY | never written |

Codex keeps a run-local table of captured IDs in the execution log (§"Notes") so later cases can use them.

## 2. Accounts

Seeded by `npm run seed:uat` (`server/prisma/seeds/users.ts:6-10`). Their passwords are the demo values documented in `docs/GETTING_STARTED.md` §6; the user confirms or supplies them at run time.

| Key | Role | Name | Email | Password | Notes |
|---|---|---|---|---|---|
| U-SC | Sales Coordinator | Maria Reyes | `sales@microgenesis.com` | `<password: U-SC>` | Creator of most records |
| U-LOG | Logistics | Juan Santos | `logistics@microgenesis.com` | `<password: U-LOG>` | Dispatcher |
| U-TASS | TASS | Ana Cruz | `tass@microgenesis.com` | `<password: U-TASS>` | Verifier |
| U-ADM | Admin | System Admin | `admin@microgenesis.com` | `<password: U-ADM>` | |
| U-DRV | Driver | John Doe | `driver@microgenesis.com` | `<password: U-DRV>` | Linked to Driver profile "John Doe" |

Created during the run (passwords chosen by the user, at least 10 characters, never recorded):

| Key | Created by | Role | Name | Email |
|---|---|---|---|---|
| U-SC2 | TC-ADM-002 | Sales Coordinator | UAT Sales Two | `uat.sales2@microgenesis.test` |
| U-LOCK | TC-ADM-003 | Logistics | UAT Lockout | `uat.lockout@microgenesis.test` |
| U-DRVA | TC-ADM-007 | Driver (linked to profile "UAT Driver Alpha") | UAT Driver Alpha | `uat.driver.alpha@microgenesis.test` |
| U-DRV2 | TC-ADM-022 | Driver (new profile, then unlinked) | UAT Driver Two | `uat.driver2@microgenesis.test` |
| U-TEMP | TC-ADM-013 | TASS (deleted in the same case) | UAT Temp | `uat.temp@microgenesis.test` |

## 3. Seeded master data used by the cases

| Key | Value | Source |
|---|---|---|
| Companies | "Jollibee Foods Corp. - Quezon City Cluster", "Mercury Drug Corporation - Head Office", "Chowking Foods Corp. - South Manila Area", "Greenwich Pizza Corp.", "KFC Philippines (Lotte GRS Philippines Inc.)", "Mang Inasal Philippines Inc.", "Shakey's Pizza Asia Pacific Inc." | `server/prisma/seeds/accounts.ts:5-19` |
| Drivers | Lando Navarro, Manny Santos, Ronald de la Cruz, John Doe (linked to U-DRV) | `server/prisma/seeds/drivers.ts`; `seed-driver-demo.ts` |
| Assistants | Jayson Reyes, Bong Alvarez, Ricky Mendoza | `server/prisma/seeds/drivers.ts:21-33` |
| Account Managers | P. Soriano, D. Macaraeg, F. Valenzuela, R. Pagkalinawan, M. Reyes, A. Santos, C. Lim | `client/src/data.ts:104` |
| Areas | e.g. "Quezon City - Diliman", "Manila - Malate", "Makati CBD", "Pasay", "Ortigas Center (Pasig)" | `server/src/areaHierarchy.ts:8-55` |
| D-SEED-DEL, D-SEED-RMA, D-SEED-COL, D-SEED-PRC, D-SEED-SO | One Scheduled run per category assigned to John Doe, area "Quezon City - Diliman", Delivery Date = seed day, references `SAP-DEMO-<hash>` (Deliveries) and `SAP-DEMO-<hash>-<CATEGORY>` | `server/prisma/seed-driver-demo.ts` |
| D-SEED-DONE | `REC-UAT-DELIVERED-<YYYYMMDD>`, Delivered, reference `SAP-UAT-DELIVERED-PRIORITY`, one stored photo `uat-delivered-proof.png` | `server/prisma/seed-uat.ts:13-82` |

Look up seeded record IDs in the list views (search "SAP-DEMO") and record them in the execution log.

## 4. Records created during the run

All created through the UI unless the case says otherwise. Field labels are those of the create form ("New Record").

| Key | Created by (case) | Module | Company Name | Priority | Reference | Area | Address | Account Manager | Delivery Date | Item Type | Remarks | Other |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D-DEL-01 | SC, TC-DEL-002 | Deliveries | Jollibee Foods Corp. - Quezon City Cluster | 2 - Moderate | `UAT-<RUN>-DEL-01` | Quezon City - Diliman | 12 E. Rodriguez Jr. Ave | M. Reyes | `<TODAY>` | Small Item | UAT main chain delivery | Line item UTK-PRN-TH80 × 2 |
| D-DEL-02 | LOG, TC-DEL-010 | Deliveries | Mercury Drug Corporation - Head Office | 2 - Moderate | `UAT-<RUN>-DEL-02` | Makati CBD | 7 Jupiter St. | P. Soriano | `<TODAY>` | Medium Item | UAT chain A | |
| D-DEL-03 | SC, TC-DEL-001 | Deliveries | Chowking Foods Corp. - South Manila Area | 2 - Moderate (default) | (empty; later `UAT-<RUN>-DEL-03`) | Manila - Malate | | | (empty; later `<TODAY>`) | | | Saved as Draft |
| D-DEL-04 | LOG, TC-DIR-015 | Deliveries | Shakey's Pizza Asia Pacific Inc. | 1 - Low | `UAT-<RUN>-DEL-04` | Ortigas Center (Pasig) | | D. Macaraeg | `<TODAY+3>` | Small Item | UAT future delivery | Assigned to John Doe |
| D-DEL-05 | LOG, TC-DEL-010 | Deliveries | Mercury Drug Corporation - Head Office | 3 - High | `UAT-<RUN>-DEL-05` | Quezon City - Fairview | | F. Valenzuela | `<TODAY>` | Large / Pallet | UAT chain B | |
| D-DEL-06 | SC, TC-DEL-024 | Deliveries | Greenwich Pizza Corp. | default | (empty) | | | | | | | Draft, soft-deleted |
| D-DEL-07 | SC, TC-POD-005 | Deliveries | KFC Philippines (Lotte GRS Philippines Inc.) | default | `UAT-<RUN>-DEL-07` | | | | `<TODAY>` | | | Quota test |
| D-DEL-08 | LOG, TC-DEL-029 | Deliveries | Mang Inasal Philippines Inc. | 2 - Moderate | `UAT-<RUN>-DEL-08` | Pasay | | C. Lim | `<TODAY>` | Small Item | UAT bulk 1 | |
| D-DEL-09 | LOG, TC-DEL-029 | Deliveries | Greenwich Pizza Corp. | 2 - Moderate | `UAT-<RUN>-DEL-09` | Pasay | | C. Lim | `<TODAY>` | Small Item | UAT bulk 2 | |
| D-COL-01 | SC, TC-COL-001 (deferred) | Accounting Collection | Jollibee Foods Corp. - Quezon City Cluster | 2 - Moderate | `UAT-<RUN>-COL-01` | Quezon City - Diliman | | M. Reyes | `<TODAY>` | Small Item | UAT collection main chain | Amount to Collect `25000.00`; Item Description `Collect payment for UAT-<RUN>-DEL-01` |
| D-COL-02 | SC, TC-COL-001 (deferred) | Accounting Collection | Mercury Drug Corporation - Head Office | 1 - Low | `UAT-<RUN>-COL-02` | Makati CBD | | P. Soriano | `<TODAY>` | Small Item | UAT collection unverified | Amount to Collect `5000.00` |
| D-RMA-01 | SC, TC-RMA-001 (deferred) | RMA | Mang Inasal Philippines Inc. | 2 - Moderate | `UAT-<RUN>-RMA-01` | Ortigas Center (Pasig) | | A. Santos | `<TODAY>` | Medium Item | UAT RMA pull-out | |
| D-RMA-02 | SC, TC-RMA-001 (deferred) | RMA | Shakey's Pizza Asia Pacific Inc. | 1 - Low | `UAT-<RUN>-RMA-02` | Makati CBD | | A. Santos | `<TODAY>` | Small Item | UAT RMA assignment probe | |
| D-RMA-03 | SC, TC-RMA-008 (deferred) | RMA | Mang Inasal Philippines Inc. | default | `UAT-<RUN>-RMA-03` | | | | | | | Saved as Draft |
| D-PRC-01 | SC, TC-PRC-001 (deferred) | Procurement Pick-up | Mercury Drug Corporation - Head Office | 2 - Moderate | `UAT-<RUN>-PRC-01` | Makati CBD | Supplier depot, Pasig | C. Lim | `<TODAY>` | Large / Pallet | UAT pick-up | |
| D-SO-01 | SC, TC-SO-001 (deferred) | Sales Orders | Jollibee Foods Corp. - Quezon City Cluster | 2 - Moderate | `UAT-<RUN>-SO-01` | Quezon City - Diliman | | M. Reyes | `<TODAY>` | Small Item | UAT sales order 1 | |
| D-SO-02 | SC, TC-SO-001 (deferred) | Sales Orders | Chowking Foods Corp. - South Manila Area | 2 - Moderate | `UAT-<RUN>-SO-02` | Manila - Malate | | R. Pagkalinawan | `<TODAY>` | Small Item | UAT sales order 2 | |
| D-SO-03 | SC, TC-SO-001 (deferred) | Sales Orders | KFC Philippines (Lotte GRS Philippines Inc.) | 1 - Low | `UAT-<RUN>-SO-03` | Makati CBD | | C. Lim | `<TODAY+3>` | Small Item | UAT future sales order | Assigned to John Doe by Logistics |

## 5. Directory, master data and stock

| Key | Case | Values |
|---|---|---|
| D-DRV-A | TC-DIR-001 | Driver "UAT Driver Alpha", coverage "Makati CBD" |
| D-AST-B | TC-DIR-002 | Assistant "UAT Assistant Beta", no coverage |
| D-CMP-01 | TC-MD-001 | Company "UAT Company Alpha <RUN>", SAP `SAP-CO-UAT1`, address "1 UAT St", contact "Uma Tester" (API) |
| D-CUS-01 | TC-MD-003 | Customer Name "UAT Customer Alpha <RUN>", Contact Person "Carla Dizon", Email `carla.dizon@uat.test`, Phone `+63 917 555 0101`, City "Quezon City", Address "45 Katipunan Ave" |
| D-SUP-01 | TC-MD-010 | Supplier Name "UAT Supplier Alpha <RUN>", Contact Person "Rico Tan", Email `rico.tan@uat.test`, Phone `02 8555 0102`, City "Pasig", Address "Supplier depot, Pasig", Category "Electronics" |
| D-SKU-01 | TC-SKU-002 | `sku_code` `UAT-SKU-<RUN>-01`, name "UAT Thermal Printer", category "A", unit cost 4500, unit price 6200, reorder point 5, warehouse "Warehouse Zone A" (API) |
| Stock postings | TC-SKU-006..009 | `GRN-UAT-<RUN>-01` +50; `SALE-UAT-1` −51 (refused); `SALE-UAT-2` −50; `ADJ-UAT-3` +10; `UAT-LOG-2` +1 |

## 6. File fixtures

Codex creates these once under `quality-assurance/e2e/fixtures/` (generated, not copied from anywhere else). They contain no real data.

| Key | File name | How to create | Purpose |
|---|---|---|---|
| F-JPG | `uat-photo.jpg` | A real JPEG, e.g. 64×64 solid colour generated with Playwright `page.screenshot({type:'jpeg'})` of a blank page or any image library | Valid delivery photo |
| F-PNG | `uat-photo.png` | A real PNG generated the same way | Valid delivery photo |
| F-PDF | `uat-doc.pdf` | Playwright `page.pdf()` of a page containing "UAT document" | Valid supporting document |
| F-DOCX | `uat-doc.docx` | A minimal Word document (any Word-compatible generator; must be a genuine .docx, not renamed) | Valid supporting document |
| F-TXT | `uat-note.txt` | Text "UAT note" | Disallowed type |
| F-FAKEJPG | `uat-fake.jpg` | Text "not an image" saved with a .jpg extension | Content verification |
| F-BIG | `uat-big.pdf` | 11 × 1024 × 1024 bytes (any content) with a .pdf extension | Over the 10 MB limit |

## 7. Negative and boundary values

| Key | Value | Used in |
|---|---|---|
| N-DATE-1 | `2026-13-45` | TC-DEL-005 |
| N-DATE-2 | `2026-02-30` | TC-DEL-019 |
| N-DATE-PAST | `2020-01-01` | TC-DEL-032 |
| N-PRIO | `9 - Urgent` | TC-DEL-006 |
| N-COMPANY | `does-not-exist` | TC-DEL-007 |
| N-SEARCH | 101 × `a` | TC-DEL-021 |
| N-EMAIL | `not-an-email` | TC-MD-005, TC-ADM-004 |
| N-PHONE | `CALL-ME!!` | TC-MD-005 |
| N-QTY | `0`, `-51` (with on-hand 50) | TC-SKU-007, TC-SKU-008 |
| N-COVER | `Atlantis` | TC-DIR-007 |
| N-WRONGPW | `WrongPass!9` | TC-AUTH-006 |
