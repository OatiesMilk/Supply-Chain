# Test Cases: SKU Master and Stock Adjustments

| Document control | |
|---|---|
| Title | Test Cases: SKU Master and Stock Adjustments |
| Document ID | QA-TC-SKU |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

SKU Master is an Admin default screen. In the UI only Stock Adjustment is writable; SKU create/edit exist only in the API (SI-18).

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-SKU-001](#tc-sku-001-admin-browses-and-filters-the-sku-master) | Admin browses and filters the SKU Master | Admin | Medium | Positive | TS-014 | Run |
| [TC-SKU-002](#tc-sku-002-admin-can-create-a-sku) | Admin can create a SKU | Admin | High | Positive | TS-014 | Run |
| [TC-SKU-003](#tc-sku-003-sku-numeric-fields-are-validated) | SKU numeric fields are validated | Admin | Medium | Boundary | TS-014 | Run |
| [TC-SKU-004](#tc-sku-004-duplicate-sku-code-gets-a-prompt-clear-error) | Duplicate SKU code gets a prompt, clear error | Admin | Medium | Negative | TS-014 | Run |
| [TC-SKU-005](#tc-sku-005-required-sku-fields-are-enforced) | Required SKU fields are enforced | Admin | Low | Negative | TS-014 | Run |
| [TC-SKU-006](#tc-sku-006-goods-receipt-stock-adjustment-updates-on-hand) | Goods Receipt stock adjustment updates On Hand | Admin | High | Positive | TS-014 | Run |
| [TC-SKU-007](#tc-sku-007-stock-cannot-go-below-zero-boundary) | Stock cannot go below zero (boundary) | Admin | High | Boundary | TS-014 | Run |
| [TC-SKU-008](#tc-sku-008-adjustment-input-validation) | Adjustment input validation | Admin | Medium | Negative | TS-014 | Run |
| [TC-SKU-009](#tc-sku-009-logistics-needs-sku-master-access-to-adjust-stock) | Logistics needs SKU Master access to adjust stock | Logistics | High | Access Control | TS-014 | Run |
| [TC-SKU-010](#tc-sku-010-sku-audit-trail-is-admin-only-and-records-changes) | SKU audit trail is Admin-only and records changes | Admin | Medium | Positive | TS-014 | Run |
| [TC-SKU-011](#tc-sku-011-sku-writes-are-admin-only) | SKU writes are Admin-only | Sales Coordinator | Medium | Access Control | TS-010 | Run |

## Test cases

### TC-SKU-001: Admin browses and filters the SKU Master

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-001 |
| Title | Admin browses and filters the SKU Master |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | R-ADM, WF-8 (InventoryView.tsx:183-227) |
| Role | Admin |
| Priority | Medium |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. Sidebar "SKU Master".<br>2. Read the column headers.<br>3. Type `zzzz-no-match` in "Search SKU code, product name, or description..."; then "Clear All". |
| Expected Result | • Columns: SKU Code, Product Name, On Hand, Allocated, ATP, Reorder Pt, Unit Cost, Bin, Status.<br>• Search shows "No matching SKU inventory entries found. Try adjusting your filters."; "Clear All" restores the list. |
| Actual Result | RUN-20261014-02: The search returned No matching SKU inventory entries found. Try adjusting your filters. Clear All did not restore the SKU list. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-SKU-001-01-no-match.png](../../artifacts/RUN-20261014-02/TC-SKU-001-01-no-match.png); [TC-SKU-001-02-list-restored.png](../../artifacts/RUN-20261014-02/TC-SKU-001-02-list-restored.png) |
| Defect ID | RUN-20261014-02: DEF-023 |
### TC-SKU-002: Admin can create a SKU

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-002 |
| Title | Admin can create a SKU |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | R-ADM, BR-26, SI-18 (skus.ts:132-181; client/src/api/index.ts:606) |
| Role | Admin |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | D-SKU-01 |
| Steps | 1. In SKU Master look for a control to create a SKU.<br>2. In the Admin session, send with the API helper (AGENTS.md §8): `POST /api/skus` body `{"sku_code":"UAT-SKU-<RUN>-01","name":"UAT Thermal Printer","category":"A","unit_cost":4500,"unit_price":6200,"reorder_point":5,"warehouse_location":"Warehouse Zone A"}`<br>3. Reload SKU Master; search `UAT-SKU-<RUN>-01`. |
| Expected Result | • Step 1: a create control exists (BR-SKU-01). Fail (SI-18) if none.<br>• Step 2: 201; `inventory.on_hand_qty` 0, `warehouse_location` "Warehouse Zone A".<br>• Step 3: the SKU is listed with On Hand 0. |
| Actual Result | RUN-20261014-02: No SKU create control was available in the Admin UI. POST /api/skus succeeded with HTTP 201; the created SKU had On Hand 0 and Warehouse Zone A. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-SKU-002-01-api-created-sku.png](../../artifacts/RUN-20261014-02/TC-SKU-002-01-api-created-sku.png) |
| Defect ID | RUN-20261014-02: DEF-024 |
### TC-SKU-003: SKU numeric fields are validated

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-003 |
| Title | SKU numeric fields are validated |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | BR-26, SI-06 (skus.ts:140-153) |
| Role | Admin |
| Priority | Medium |
| Type | Boundary |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Admin session, send with the API helper (AGENTS.md §8): `POST /api/skus` body `{"sku_code":"UAT-SKU-<RUN>-NEG","name":"Bad","category":"A","unit_cost":-5,"unit_price":"abc","reorder_point":1}` with `AbortSignal.timeout(15000)`<br>2. Search SKU Master for `UAT-SKU-<RUN>-NEG`. |
| Expected Result | • A 400 naming the invalid fields within 15 s.<br>• No SKU `UAT-SKU-<RUN>-NEG` exists. Fail (SI-06) if created, 500, or no response. |
| Actual Result | RUN-20261014-02: POST /api/skus accepted unit_cost -5 and unit_price abc with HTTP 201; inventory had on_hand_qty 0, cost -5, and price null. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: DEF-025 |
### TC-SKU-004: Duplicate SKU code gets a prompt, clear error

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-004 |
| Title | Duplicate SKU code gets a prompt, clear error |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | BR-26, SI-05 (skus.ts:132; schema.prisma:203) |
| Role | Admin |
| Priority | Medium |
| Type | Negative |
| Preconditions | Depends on TC-SKU-002. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Admin session, send with the API helper (AGENTS.md §8): `POST /api/skus` body `{"sku_code":"UAT-SKU-<RUN>-01","name":"UAT Thermal Printer","category":"A","unit_cost":4500,"unit_price":6200,"reorder_point":5}` with `AbortSignal.timeout(15000)` |
| Expected Result | Within 15 s a 4xx (409 or 400) saying the SKU code exists. Fail (SI-05) on timeout or 500. |
| Actual Result | RUN-20261014-02: The duplicate SKU code request received no response within 15 seconds instead of a 4xx duplicate-code error. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: DEF-017 |
### TC-SKU-005: Required SKU fields are enforced

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-005 |
| Title | Required SKU fields are enforced |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | BR-26 (skus.ts:134-138) |
| Role | Admin |
| Priority | Low |
| Type | Negative |
| Preconditions | Signed in as Admin in its own browser context (session from TC-AUTH-004). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Admin session, send with the API helper (AGENTS.md §8): `POST /api/skus` body `{"sku_code":"UAT-SKU-<RUN>-02"}` |
| Expected Result | 400 "Missing required fields: name, category, unit_cost, unit_price, reorder_point". |
| Actual Result | RUN-20261014-02: Observed the case expected result: 400 "Missing required fields: name, category, unit_cost, unit_price, reorder_point". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-SKU-006: Goods Receipt stock adjustment updates On Hand

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-006 |
| Title | Goods Receipt stock adjustment updates On Hand |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | R-ADM, BR-25 (skus.ts:185-267; SkuWorkspace.tsx:340-394) |
| Role | Admin |
| Priority | High |
| Type | Positive |
| Preconditions | Depends on TC-SKU-002. |
| Test Data | Type Goods Receipt, Qty `50`, Reference `GRN-UAT-<RUN>-01` |
| Steps | 1. Open `UAT-SKU-<RUN>-01` → tab "Inventory".<br>2. "Adjustment Type" Goods Receipt; "Qty Change (+ for in, − for out)" `50`; "Reference" `GRN-UAT-<RUN>-01`; "Post Adjustment". |
| Expected Result | • "Adjustment saved and inventory updated."<br>• On Hand 50; recent transactions show Goods Receipt +50, balance 50. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • "Adjustment saved and inventory updated."; • On Hand 50; recent transactions show Goods Receipt +50, balance 50. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-SKU-006-01-inventory-tab.png](../../artifacts/RUN-20261014-02/TC-SKU-006-01-inventory-tab.png); [TC-SKU-006-02-grn-form.png](../../artifacts/RUN-20261014-02/TC-SKU-006-02-grn-form.png); [TC-SKU-006-03-grn-posted.png](../../artifacts/RUN-20261014-02/TC-SKU-006-03-grn-posted.png) |
| Defect ID | RUN-20261014-02: — |
### TC-SKU-007: Stock cannot go below zero (boundary)

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-007 |
| Title | Stock cannot go below zero (boundary) |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | BR-25 (skus.ts:205-211) |
| Role | Admin |
| Priority | High |
| Type | Boundary |
| Preconditions | Depends on TC-SKU-006. |
| Test Data | None beyond preconditions |
| Steps | 1. Post Adjustment type Sale, qty `-51`, reference `SALE-UAT-1`.<br>2. Post Adjustment type Sale, qty `-50`, reference `SALE-UAT-2`.<br>3. Post Adjustment type Adjustment, qty `10`, reference `ADJ-UAT-3`. |
| Expected Result | • Step 1: refused with "Insufficient stock. Current on-hand quantity is 50, cannot deduct 51." (or "Stock adjustment failed." with that text).<br>• Step 2: success; On Hand 0.<br>• Step 3: success; On Hand 10. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: refused with "Insufficient stock. Current on-hand quantity is 50, cannot deduct 51." (or "Stock adjustment failed." with that text).; • Step 2: success; On Hand 0.; • Step 3: success; On Hand 10. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-SKU-007-01-insufficient-stock.png](../../artifacts/RUN-20261014-02/TC-SKU-007-01-insufficient-stock.png); [TC-SKU-007-02-stock-zero.png](../../artifacts/RUN-20261014-02/TC-SKU-007-02-stock-zero.png); [TC-SKU-007-03-adjusted-ten.png](../../artifacts/RUN-20261014-02/TC-SKU-007-03-adjusted-ten.png) |
| Defect ID | RUN-20261014-02: — |
### TC-SKU-008: Adjustment input validation

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-008 |
| Title | Adjustment input validation |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | BR-25, SI-07 (skus.ts:192-200; schema.prisma:237) |
| Role | Admin |
| Priority | Medium |
| Type | Negative |
| Preconditions | Depends on TC-SKU-006. |
| Test Data | None beyond preconditions |
| Steps | 1. Post Adjustment with qty `0`.<br>2. Post Adjustment with qty `5` and empty reference.<br>3. In the Admin session, send with the API helper (AGENTS.md §8): `POST /api/skus/{D-SKU-01.id}/adjust` body `{"type":"Gift","qty_change":1,"reference":"UAT-ODD"}` |
| Expected Result | • Step 1: "Quantity must be a non-zero number."<br>• Step 2: "Reference is required."<br>• Step 3: 400 (type must be Goods Receipt, Sale, Adjustment or Transfer). Fail (SI-07) if 200. |
| Actual Result | RUN-20261014-02: POST /api/skus/{id}/adjust with type Gift returned HTTP 200 and posted +1 stock; zero quantity and missing reference guards returned expected errors. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-SKU-008-01-zero-qty.png](../../artifacts/RUN-20261014-02/TC-SKU-008-01-zero-qty.png); [TC-SKU-008-02-empty-reference.png](../../artifacts/RUN-20261014-02/TC-SKU-008-02-empty-reference.png) |
| Defect ID | RUN-20261014-02: DEF-026 |
### TC-SKU-009: Logistics needs SKU Master access to adjust stock

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-009 |
| Title | Logistics needs SKU Master access to adjust stock |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | R-LOG, BR-25, BR-30 (skus.ts:185) |
| Role | Logistics |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). and Signed in as Admin in its own browser context (session from TC-AUTH-004). Depends on TC-SKU-002. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `POST /api/skus/{D-SKU-01.id}/adjust` body `{"type":"Adjustment","qty_change":1,"reference":"UAT-LOG-1"}`<br>2. Admin: Admin Panel → Juan Santos → "Access" → toggle "SKU Master" on → "Save Changes".<br>3. Logistics: reload; sidebar "SKU Master" → open the SKU → "Inventory" → Adjustment `+1`, reference `UAT-LOG-2` → "Post Adjustment".<br>4. Admin: "Reset to Role Default" for Juan Santos → "Save Changes". |
| Expected Result | • Step 1: 403 "Module access denied".<br>• Step 3: "Adjustment saved and inventory updated."<br>• After step 4 "SKU Master" disappears for Logistics. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 403 "Module access denied".; • Step 3: "Adjustment saved and inventory updated."; • After step 4 "SKU Master" disappears for Logistics. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-SKU-009-01-sku-access-enabled.png](../../artifacts/RUN-20261014-02/TC-SKU-009-01-sku-access-enabled.png); [TC-SKU-009-02-logistics-adjustment.png](../../artifacts/RUN-20261014-02/TC-SKU-009-02-logistics-adjustment.png) |
| Defect ID | RUN-20261014-02: — |
### TC-SKU-010: SKU audit trail is Admin-only and records changes

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-010 |
| Title | SKU audit trail is Admin-only and records changes |
| Scenario ID | TS-014 |
| Requirement / Rule Ref | R-ADM, R-SC (skus.ts:76-92) |
| Role | Admin |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-SKU-007. |
| Test Data | None beyond preconditions |
| Steps | 1. Open the SKU → tab "Audit Trail".<br>2. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `GET /api/skus/{D-SKU-01.id}/audit` |
| Expected Result | • Entries: CREATE and the stock UPDATEs by System Admin.<br>• SC: 403 "Forbidden for this role". |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Entries: CREATE and the stock UPDATEs by System Admin.; • SC: 403 "Forbidden for this role". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-SKU-010-01-admin-audit.png](../../artifacts/RUN-20261014-02/TC-SKU-010-01-admin-audit.png) |
| Defect ID | RUN-20261014-02: — |
### TC-SKU-011: SKU writes are Admin-only

| Field | Description |
|---|---|
| Test Case ID | TC-SKU-011 |
| Title | SKU writes are Admin-only |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-SC, R-LOG, BR-26 |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Access Control |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/skus` body `{"sku_code":"UAT-SKU-<RUN>-SC","name":"UAT Thermal Printer","category":"A","unit_cost":4500,"unit_price":6200,"reorder_point":5}`<br>2. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `PUT /api/skus/{D-SKU-01.id}` body `{"unit_price":1}` |
| Expected Result | Both 403 "Forbidden for this role". |
| Actual Result | RUN-20261014-02: Observed the case expected result: Both 403 "Forbidden for this role". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |