# Remaining modules QA — happy and sad paths

Date: 4 November 2026, approximately 15:53–16:18 Asia/Manila.
Target: http://localhost:3000 with existing backend/database. Source baseline: dev 9a6fe2a (merged PR #286). Browser roles: Admin, TASS, Sales Coordinator, Logistics, Driver. Permission editor displayed active V1 policies during this chat; actual account permissions, rather than assumed role defaults, governed access.

Result: broad browser QA completed across the previously uncovered modules, with two confirmed defects and one capability gap. This is a scoped acceptance pass, not full release sign-off. No application code, account permissions or existing operational records were changed.

## Confirmed findings

### Medium — Data Sampler bypasses required submission reference

As Admin, choose Data Sampler → Manual with Suggestions → Sales Orders, clear Reference, then Save Record. The application creates a Scheduled, non-draft record with a blank reference. The normal submission contract requires a reference. Logistics could assign it from Driver Board, and Driver could start and complete it with a recipient, photo and remarks.

Observed record: REC-a7e1dc7e-01f5-4de4-85a4-fe099a8adac0, Shakey's Pizza Asia Pacific Inc., Scheduled date 2026-10-16. Created at 16:01, assigned by Juan Santos at 16:07, started 16:08 and completed 16:09 by Leo Driver. Central audit explicitly showed a blank reference and is_draft No.

Source: client/src/features/admin/DataSamplerView.tsx:394 renders Reference without required validation. server/src/routes/data-sampler.ts:221 uses `overrides.reference ?? reference`, preserving an empty string. This path directly creates Scheduled records and does not call server/src/services/recordSubmission.ts:4, which rejects blank references. Normal records routes invoke that validator at lines 1146, 1199, 1488 and 1664.

Recommendation: validate the final sample record with the canonical non-RMA submission validator inside the creation flow; reject blank/whitespace reference overrides or deliberately generate a valid reference. Cover manual sample creation with a regression test.

Evidence: [sampler-empty-reference-audit.png](../artifacts/RUN-20261104-REMAIN/sampler-empty-reference-audit.png); [sales-order-completed.png](../artifacts/RUN-20261104-REMAIN/sales-order-completed.png).

### Medium — Supplier creation has no central audit entry

Created UAT-20261104-REMAIN Supplier at 15:58. It appears in the registry and detail with System Admin as creator. Central audit subsequently contained the later SKU and sampler events, but no supplier creation event.

Source: server/src/routes/suppliers.ts:30–62 authorizes and calls prisma.supplier.create directly without an audit write or transaction. server/src/db.ts uses the standard Prisma client without an audit extension; server/src/index.ts registers the supplier router directly. Creator metadata exists, but does not replace a central audit event.

Recommendation: save the supplier and its audit entry in one transaction using the project's audit convention. Verify actor and supplier identity in the central log.

Evidence: [supplier-created.png](../artifacts/RUN-20261104-REMAIN/supplier-created.png); source trace above.

## Capability gap

SKU workspace exposes eight unfinished tabs: Transactions, Purchase History, Sales History, Delivery History, RMA History, Accounting History, Documents & Attachments, Analytics & Forecasting. Each was opened. Transactions says its Transaction Center link is coming; the other seven say they are under development. These are explicit scaffolds, not a newly introduced regression.

Source: client/src/features/inventory/SkuWorkspace.tsx:543–564. Recommend hiding/marking unavailable tabs or completing the integrations before treating them as accepted features. Inventory, General and Audit Trail did function.

## Executed browser coverage

| Module | Happy path observed | Sad path / boundary observed | Outcome |
|---|---|---|---|
| RMA list | List, workspace, search reset | No-match search shows empty state; reset restores rows | Pass |
| RMA authority | TASS could select internal/no-driver movement | Logistics legacy fixture showed no available workflow action; Admin edit did not expose TASS movement control | Pass for inspected roles/records |
| RMA edit | Movement saved with actor/reason | Missing edit reason rejected: Remarks are required to save changes | Pass |
| RMA receipt | TASS recorded recipient and physical receipt | Receipt disabled with empty recipient/reason | Pass |
| RMA completion | Separate final Complete RMA action; status Complete; timestamp and four-event audit | Completion disabled until a new reason was supplied; receipt alone left status Scheduled | Pass |
| Collection list/detail | Scheduled and Collected records open | Admin Verification says TASS permission required | Pass |
| Collection readiness | Collected fixture offers verification to TASS | Scheduled fixture says verification available only once Collected | Pass; existing fixture was not verified |
| Collection field run | Synthetic record: Driver Time In → photo + recipient + remarks → completed queue | Completion initially disabled without Time In/recipient/photo | Pass |
| Collection handoff | TASS saw persisted photo preview/download, amount ₱1.00, verified synthetic record | After verification, button replaced by Verified by Ana Cruz and timestamp | Pass |
| Collection audit | Start, completion and TASS verification recorded with actor/times | No duplicate UI verification offered | Pass for UI guard; crafted duplicate API request not run |
| Procurement | Existing list/workspace, search reset and dispatch controls | No-match search; Save Changes without edits says No changes detected to save | Pass for inspected features |
| Procurement fixture | Admin created named synthetic Scheduled record assigned to Leo Driver | Date was future 2026-11-13; absent from Driver active work on Nov 4 | Creation observed; transport completion not run |
| Sales Orders list | List, completed record detail, priority lock | No-match search and Clear All recovery | Pass |
| Sales Order field workflow | Board assignment → Driver start → recipient + saved photo + reason → completion | Confirm disabled without remarks; accomplish disabled without required prerequisites | Pass for field workflow; invalid creation is a defect above |
| Suppliers | Registry/detail; created synthetic supplier, count 5→6; zero linked pickup state | Empty name rejected; malformed email invalid and not saved | Pass for UI validation/save; central audit defect above |
| AM Directory | Nine managers; alphabetical sorting; expand M. Reyes showing matching one-record detail | No write controls expected or exercised | Pass for inspected read paths |
| SKU search | Search reset restores inventory; Create SKU form exists | Nonsense search produces explicit no-match state | Pass; historical missing-create-control finding is no longer present |
| SKU create | Synthetic item created with zero stock | Missing required values kept form open; negative cost had rangeUnderflow; duplicate SKU rejected clearly | Pass |
| SKU adjustment | Goods Receipt +2 updated On Hand and ATP 0→2; ledger reference saved | Empty/zero adjustment rejected; -1 from zero rejected as insufficient stock | Pass |
| SKU audit | CREATE and receipt UPDATE displayed with actor and values | Failed deduction did not change stock | Pass |
| SKU secondary tabs | All eight tabs opened | Explicit unavailable scaffolds | Capability gap |
| Driver View | Driver runs and profile linkage labels displayed | Nonsense search gives No drivers found; clearing restores | Pass |
| Driver Manager | Added synthetic Assistant; assistants count 3→4, attributed to Juan Santos | Empty name rejected; Logistics type locked to Assistant with Only Admin can add drivers | Pass |
| Driver Board | Assignment updated group counts and record audit; assigned record appeared in Driver app | No existing record assignment changed | Pass for tested assignment |
| Admin audit | Latest events expand into readable changes | DELETE filter returned explicit zero-entry state | Pass |
| Admin integrations | Diagnostics loaded with configured SSO/GRAPH email and account totals | Empty-recipient Send Test left form unchanged; no valid recipient submitted | Read-only diagnostics checked; provider send not tested |
| Admin users | Seven accounts listed; create form opens/cancels | Empty Create left form open; no account created | Limited validation check only |
| Data Sampler | Named RMA/collection/procurement fixtures created, counts updated | Blank Sales Order reference accepted | Fail for blank reference |
| Sales supplied account | Login and allowed lists work | Main New Delivery disabled; RMA absent from navigation | Creation blocked under current account permissions; not labelled a defect without policy intent |
| TASS access | Correct TASS navigation after role switch | Direct /inventory redirected to dashboard | Pass for browser route guard; crafted API authorization not tested |

## Data created or changed by this pass

All new data remains for evidence. No deletion/reset performed.

- Supplier: UAT-20261104-REMAIN Supplier, id cmw1trmk50027eslpbn6gmwkg, synthetic email uat-remain@example.invalid, city UAT Test City, Hardware category.
- SKU: UAT-REMAIN-20261104 / UAT Remaining QA Item, id cmw1ttaf10028eslpwwhp4bed; unit cost 1, price 2, reorder point 0. One Goods Receipt +2, reference UAT-REMAIN-RECEIPT. Current stock/ATP 2. No existing SKU changed.
- Assistant: UAT-20261104-REMAIN Assistant, active, no coverage, created by Logistics. No login account created.
- Blank-reference Sales Order: REC-a7e1dc7e-01f5-4de4-85a4-fe099a8adac0, completed as described in finding. Remarks mark it as synthetic QA. One test PNG saved.
- RMA: UAT-20261104-REMAIN-RMA, id REC-3598b79b-cbd6-4bc7-b46e-5df97f5c792f; internal/no-driver, receipt by UAT RMA Receiver and final completion by TASS. Sampler date 2026-10-08.
- Collection: UAT-20261104-REMAIN-COL, id REC-3a9a7003-cd87-44ea-8f95-f24cebec4af1; synthetic amount 1, date 2026-10-08; assigned Leo Driver, started/completed with UAT Collection Receiver and test PNG, then verified by TASS. No funds moved.
- Procurement: UAT-20261104-REMAIN-PRC, assigned Leo Driver, future date 2026-11-13; remains Scheduled. Creation count increased 5→6.
- Assignment notifications/audit events may be generated by these normal test workflows. No external email was explicitly sent.

## Verification limits and remaining cases

- RMA tested internal/no-driver receipt and completion; Logistics transport, supplier-collection movement, reassignment races and stale-version conflicts were not executed in this pass.
- Procurement transport completion remains untested; the new fixture was future dated. A date-entry automation attempt did not persist the requested date; saved sampler dates above were read back, not assumed. This is not reported as a confirmed app defect.
- Sales standard record creation was unavailable for the supplied Sales account. Permissions were not altered to enable testing.
- No account creation/deactivation/deletion, password changes, permission grants, database reset, bulk sampler generation, destructive attachment deletion or existing merchant-record edits.
- Email/SSO provider delivery, export formats beyond the earlier CSV run, route slips, all-page pagination, concurrent requests and crafted API authorization were not validated.
- Browser checks used real local persistence and synthetic PNG fixtures. Source traces support the findings. No new automated test suite, TypeScript build or PostgreSQL race/rollback tests were run because this was QA, with no application edits.
- One Driver login attempt displayed Invalid email or password; a re-entry of the supplied credentials succeeded. Cause was not established; not classified as a defect.
- Earlier delivery and additional-feature reports remain separate; they are not counted as rerun here.

## Evidence files

- [assistant-created.png](../artifacts/RUN-20261104-REMAIN/assistant-created.png)
- [collection-verified.png](../artifacts/RUN-20261104-REMAIN/collection-verified.png)
- [fixtures-created.png](../artifacts/RUN-20261104-REMAIN/fixtures-created.png)
- [rma-completed.png](../artifacts/RUN-20261104-REMAIN/rma-completed.png)
- [sales-order-completed.png](../artifacts/RUN-20261104-REMAIN/sales-order-completed.png)
- [sampler-empty-reference-audit.png](../artifacts/RUN-20261104-REMAIN/sampler-empty-reference-audit.png)
- [sampler-record-assigned.png](../artifacts/RUN-20261104-REMAIN/sampler-record-assigned.png)
- [sku-created.png](../artifacts/RUN-20261104-REMAIN/sku-created.png)
- [sku-receipt.png](../artifacts/RUN-20261104-REMAIN/sku-receipt.png)
- [supplier-created.png](../artifacts/RUN-20261104-REMAIN/supplier-created.png)
