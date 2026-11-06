# Role functionality and integration audit — 2026-10-30

## Publication note — 2026-10-31

This is a historical audit of `0e33fa734a616294ab80e5c327ee6552a69b3907`. Findings F1–F8 were subsequently
addressed in the implementation branch for [PR #269](https://github.com/OatiesMilk/Supply-Chain/pull/269),
with its [remediation report](https://github.com/OatiesMilk/Supply-Chain/blob/75deb607e9248d2e53076581c4d40175f0195d7a/docs/ROLE_AUDIT_FIXES_2026-10-30.md).
[PR #270](https://github.com/OatiesMilk/Supply-Chain/pull/270) contains the later workflow follow-ups.
The assessment, finding wording and validation counts below describe the audited
snapshot, not the current branch or a deployed system. Check current source,
PR checks/merge state and deployment evidence before treating any finding as
open or resolved. Source links in this report are pinned to the audited snapshot.

Audited snapshot: `dev`, commit `0e33fa7`. Skills applied: `code-review-and-quality`, `architect-review`, and the repository's `use-supply-chain-dev` review workflow. This is a source and automated-test audit. No application source was changed, no development servers were started, and no live business data or external service delivery was tested.

## Assessment

The project has substantial functionality as an operations coordination and dispatch portal. The division between Sales Coordinator preparation, Logistics dispatch, Driver execution, and TASS receipt/verification is useful. RMA is particularly well modeled: transport completion, physical receipt, and final business completion are separate events with separate owners.

End-to-end supply-chain integration is less complete. Operational line items do not reserve or move stock; collection verification does not provide a complete evidence-review workflow; notification messages sometimes claim actions that have not happened. I would prioritize correcting these handoffs before expanding the number of screens.

This assessment does not establish production readiness. The active deployment permission mode, database conversion state, external integrations, browser behavior, and real PostgreSQL concurrency were not verified.

The companion [development skill review](SUPPLY_CHAIN_DEV_SKILL_REVIEW_2026-10-30.md) documents the agent-instruction gaps and the subsequent instruction update. Application findings below were unfixed at the audited snapshot; use the publication note for later remediation references.

## Findings requiring correction

### F1 — High: existing drafts can be submitted without a delivery date

**Roles affected:** Sales Coordinator, Logistics, Driver; Admin can encounter the same issue.

New non-RMA records require a date at [records.ts:1085](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/routes/records.ts#L1085). Existing-draft submission checks the reference but omits that requirement in both [PUT:1421](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/routes/records.ts#L1421) and [PATCH status:1590](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/routes/records.ts#L1590). The normal workspace [Submit button:370](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/features/deliveries/DeliveryRecordWorkspace.tsx#L370) sends status and remarks without running the creation validator.

**Effect:** A draft containing a reference and no date becomes Scheduled. Logistics can assign it, but a Driver cannot start the Delivery because the server requires a valid delivery date.

**Evidence:** An isolated test using the actual router and mocked Prisma returned HTTP 200, `is_draft: "No"`, and `delivery_date: ""` for that submission.

**Recommendation:** Use one submission validator for initial creation and both existing-draft submission paths. Validate the final merged record state inside the write transaction. Add a regression case for every operational category.

### F2 — High: unfinished non-delivery runs disappear from the Driver dashboard

**Roles affected:** Driver, Logistics, TASS.

[isDashboardRunActionable:80](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/utils/recordLifecycle.ts#L80) includes overdue or started Deliveries, but requires today's date for every other category. [DriverDashboard:95](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/features/dashboard/DriverDashboard.tsx#L95) uses that helper to build active cards. RMA uses a separate panel and is outside this particular defect.

**Effect:** Yesterday's unfinished Procurement Pick-up, Accounting Collection, or Sales Order disappears from the Driver's actionable list, including a run with Time In already recorded. Logistics must intervene to recover work that should still be visible.

**Evidence:** Executing the real helper for yesterday's date with a valid Time In returned true for Deliveries and false for the other three categories.

**Recommendation:** Define a shared active-run rule across Driver-owned categories. Keep unfinished overdue and started runs visible until completion or an explicit reassignment/reschedule.

### F3 — High: collection verification is not atomic or protected against duplicate confirmation

**Roles affected:** TASS, Admin oversight.

[verify-collection:1657](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/routes/records.ts#L1657) reads `collectionVerified`, then updates the record by ID alone, writes the audit entry separately, and finally creates a notification. There is no enclosing transaction, row lock, or conditional update that requires the collection to remain unverified.

**Effect:** Two verifiers can both succeed and overwrite who/when verified the collection. An audit-write failure can also leave the collection verified without the corresponding audit entry. The handler uses a bare async callback, so an unexpected rejection is not forwarded through the project's `asyncRoute` wrapper.

**Evidence:** With the actual router and a controlled database double that interleaved two requests after both reads, both returned HTTP 200 and both performed the update. This demonstrates the application race; it was not a live PostgreSQL concurrency test.

**Recommendation:** Perform authorization/state revalidation, a conditional update or locked read, and the audit insert in one transaction. Return a conflict or an idempotent existing result for subsequent confirmations. Queue notification delivery separately.

**Authorization clarification:** The action permission check is present through `requireRecordAccess` → [recordOperationError](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/services/recordOperations.ts#L31). A V1 `VERIFY_COLLECTION` denial returned 403 in the isolated test. This finding is about concurrency and audit integrity, not an authorization bypass.

### F4 — Medium: output actions can claim email delivery and PDF export without performing them

**Roles affected:** Sales Coordinator, Logistics, TASS, Admin.

[RecordCreateForm:331](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/features/deliveries/RecordCreateForm.tsx#L331) calls `runOutputActions` before record creation with no record ID or API client. [outputActions:70](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/outputActions.ts#L70) therefore skips dispatch but still produces “Email sent” and “notified” banners. The helper also ignores failed delivery counts, sets `emailSent` from configuration alone, and emits “Exported to PDF” without generating a PDF. [normalizeApiRecord:29](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/api/queries/useRecordsQuery.ts#L29) additionally derives `email_notification_sent` from Delivered status rather than notification delivery state.

**Effect:** Users can believe another department has been notified when it has not. The configured `internalOnly` option does not govern the separate server-side accomplished-email trigger.

**Evidence:** Calling the real helper without an API produced email-success banners. A stubbed dispatch returning zero sent and one failed still produced `emailSent: true` and an export-success banner.

**Recommendation:** Return explicit queued/sent/failed/skipped outcomes based on actual operations. Persist delivery results on the server. Generate the export before reporting success, or clearly describe an action as planned. Decide centrally whether output preferences govern automatic notifications.

### F5 — Medium: collection delivery is incorrectly mapped to collection verification

**Roles affected:** Logistics and TASS.

[getOutputTrigger:25](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/outputActions.ts#L25) maps Accounting Collection + Delivered to `Collection Verified`, although TASS verification is a later action. [canDispatchRecordMail](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/services/mailPermissions.ts#L24) correctly rejects this trigger until the collection is verified and the caller is TASS.

**Effect:** The Logistics Driver View path that runs output actions after completing a collection can save the status successfully and then receive a 403 for the output action. Actual verification uses a separate mutation and does not call this client helper.

**Evidence:** An actual-router request as Logistics for an accomplished, unverified collection with the generated trigger returned 403. The server check is correct; the client event is wrong.

**Recommendation:** Distinguish Collection Collected from Collection Verified. Emit each event from its owning successful server transition, rather than inferring verification from delivery status.

### F6 — Medium: collection billing email has no working recipient path in either notification mode

**Roles affected:** Logistics, TASS, billing stakeholders.

The completion handler passes `recipientOverride: 'Billing Department'` at [records.ts:1649](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/routes/records.ts#L1649). In V1, [notify.ts:21](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/services/notify.ts#L21) returns immediately whenever an override is present, without recording a skipped result. The legacy branch constructs an address under `microgenesis.example` rather than resolving an actual billing mailbox.

**Effect:** Completing a collection does create the separate TASS in-app alert, but the billing email handoff is absent or targets a placeholder. Account Manager delivery in V1 also depends on one exact matching active portal user who can read the record; an external AM without that mapping receives nothing.

**Recommendation:** Model approved billing and AM recipients explicitly. Preserve authorization checks, expose missing mappings as actionable integration status, and record skipped/failed delivery outcomes. Do not bypass the identity restrictions to make email appear functional.

### F7 — Medium: TASS cannot inspect collection attachments in the collection workspace

**Role affected:** TASS.

The [Documents tab:761](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/features/accounting/AccountingCollectionWorkspace.tsx#L761) renders a scaffold. The overview attachment component is inside the editing branch, whose [role condition:498](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/features/accounting/AccountingCollectionWorkspace.tsx#L498) excludes TASS. The Verification tab presents the amount and confirmation without a saved-evidence viewer.

**Effect:** The owning verifier cannot review the saved collection evidence through this workspace before confirming. Attachment APIs exist; the missing piece is their integration into this role's UI.

**Recommendation:** Reuse the attachment viewer with read-only access for TASS. Keep evidence review separate from upload/edit permissions.

### F8 — Medium: record IDs collide in a small random namespace

**Roles affected:** Every record-creating role.

[generateRecordId:72](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/routes/records.ts#L72) selects a random ID from only 40,000 values. Creation uses it as the primary key at line 1097, with no collision retry. Its error handling does not translate or recover from a unique-key collision.

**Effect:** Record creation can fail with a server error despite valid input. If 1,000 generated IDs are occupied, the next random draw has approximately a 2.5% collision probability; this is an illustration, not a count of the current database.

**Recommendation:** Use a UUID/cuid primary key and a separate display reference, or use a database sequence for the visible identifier.

## Functional assessment by role

| Role | Working responsibilities | Assessment and main gaps |
| --- | --- | --- |
| Sales Coordinator | Delivery preparation, drafts/submission, commercial metadata, company/customer work, status monitoring and Account Manager views. Assignment is reserved for Logistics/Admin. | Good ownership boundary. Fix F1 and misleading notification outcomes. Customer records and operational Company selection are separate master-data paths. |
| Logistics | Driver/assistant/vehicle assignment, dispatch board, calendar, run management, rescheduling, reports, driver coverage/status, bounded RMA transport assignment, manual stock adjustment when granted SKU access. | Substantial dispatch functionality. Overdue Driver visibility and submission handoffs need consistency. Manual stock changes remain separate from physical fulfillment. |
| Driver | Linked-profile assignment scope, non-draft runs, Time In, recipient capture, stored photo proof, completion, and separate RMA transport progress. | Strong ownership and evidence requirements. Fix F2. Offline execution and signature capture remain outside the implemented scope. |
| TASS | RMA creation/maintenance, physical receipt and final RMA completion, collection verification and role-specific dashboard. | RMA is one of the strongest workflows. Collection evidence access and atomic verification need attention. Procurement navigation is misleading while category access remains restricted. |
| Admin | Account lifecycle, Driver login linking, approved Microsoft identity linking, permission policy/override editing, audits, integration diagnostics, SKU administration and controlled demo tooling. | Useful oversight. Some SKU tabs remain placeholders. “Admin” does not bypass every business boundary: final RMA receipt/completion and collection verification are TASS responsibilities. |

Permissions can reduce each account's capabilities. Screen grants do not override immutable role, category, ownership, or lifecycle restrictions. RMA dispatch requires the relevant provisioned policy grants; code presence does not establish deployment activation.

## Module and integration assessment

| Integration | Current implementation | Implication |
| --- | --- | --- |
| Sales → Logistics → Driver | Shared records, role guards, stable Driver IDs, lifecycle validation, assignment alerts, polling/cache invalidation. | Broadly connected. Draft date validation and overdue visibility are concrete breaks. Draft-submission alerts also differ: creation notifies for all non-RMA categories, PATCH submission only for Delivery, and PUT submission has no equivalent non-RMA alert. |
| TASS → Logistics → Driver → TASS, RMA | Explicit movement methods; version checks; separate assignment, transport, receipt and final-completion actions. See [rmaDispatch.ts](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/routes/rmaDispatch.ts#L106). | Strong separation of responsibilities and transactional state checks. Preserve this pattern when repairing collections. |
| Operational records → inventory | [LineItem](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/prisma/schema.prisma#L457) stores free-text SKU and quantity without a Product relation. Stock is changed through [manual adjustment](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/routes/skus.ts#L192); operational workflows do not reserve/release/issue/return stock. | A material capability gap, already acknowledged in business requirements. ATP does not represent commitments from delivery records. Define stock ownership and accounting rules before implementing automatic movement. |
| SKU detail → related modules | General, inventory and audit functionality exist; Transactions, purchase/sales/delivery/RMA/accounting history, documents and analytics remain [scaffolds](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/features/inventory/SkuWorkspace.tsx#L543). | Screen availability overstates integration completeness. Wire existing transaction data first and label planned tabs honestly. |
| Customers/Suppliers → records | Operational records relate to Company; Customer and Supplier models remain separate. There is no canonical customer/supplier foreign-key relationship on the operational record. | Directory edits and historical operational identity can diverge. Define master-data ownership and preserve intentional historical snapshots. |
| Collections → finance | Amount and collection verification exist, but no complete invoice/payment allocation or ledger reconciliation workflow was established in the audited model. | Treat this as collection tracking. Confirm the owning department and reconciliation requirements before expanding financial claims. |
| Notifications/email/export | Real SMTP/Graph providers, in-app notifications and browser exports exist, alongside simulated output claims and incomplete recipient mapping. | Provider support does not establish successful delivery. F4–F6 need correction. Server automatic completion email and client output actions can also duplicate AM sends where both resolve and succeed. |
| Authentication/permissions | Cookie sessions, current-account reload, role/category/ownership checks; V1 granular actions, conversion checks and permission revisions. | Strong foundations. Both LEGACY and V1 branches exist; [permissionMode](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/services/permissionManagement.ts#L20) defaults to LEGACY. Report behavior against the actual deployed mode and conversion state. |
| Microsoft SSO | [approvedMicrosoftUser](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/services/ssoIdentity.ts#L6) requires an Admin-approved OID, correct tenant, active account and matching supplied identity email. | Stronger than the older documentation's auto-provisioning description. Live tenant/Teams operation was not verified. |
| POD storage | Storage abstraction, private-provider support, file validation, photo verification, protected downloads and bounded in-memory processing. | Substantial implementation. External storage durability/configuration was not exercised in this audit. |

## Architecture and maintainability

Keep the modular monolith. The immediate need is more consistent domain rules, rather than more services or frameworks.

- Use shared submission validation and a single domain command per business transition. Creation, metadata edits, status patches and client helpers currently duplicate parts of the same rules.
- Apply the RMA transaction/version pattern to collection verification. Customer editing and stock adjustment also already provide examples of concurrency protection in this repository.
- Introduce a transactional notification outbox with delivery attempts, explicit recipients and idempotency keys. Current email and several alerts occur after the business transaction, before the response; a notification failure can make a committed operation look unsuccessful. In-process scheduling in `server/src/index.ts` also has no durable missed-run recovery or cross-instance job ownership.
- Split the large record route and workspace by owning workflow. `records.ts` has 1,772 lines; `DeliveryRecordWorkspace.tsx` has 2,244. Extract submission, assignment, execution, completion and evidence services while keeping policy decisions centralized. Avoid maintaining a third independent set of rules.
- Synchronize role and integration documentation. Existing documents predate changes to TASS creation, RMA dispatch and approved Microsoft identity handling. Use the permission catalog, route enforcement and actual UI paths as evidence.

## Validation and boundaries

| Check | Result |
| --- | --- |
| Client `tsc --noEmit` | Passed |
| Server `tsc --noEmit` | Passed |
| `npm run test:client` | 235 passed, zero failed |
| `npm run test:server` | 372 passed, zero failed, three skipped; 375 total |
| Isolated audit reproductions against real helpers/routers with database doubles | Four passed: missing-date draft accepted; action Deny enforced plus duplicate verification accepted; false output claims; premature collection-verification email rejected |
| Additional Driver helper reproduction | Overdue started Deliveries visible; overdue started Procurement/Collection/Sales Orders excluded |
| Live PostgreSQL race/rollback suites | Three existing tests skipped because their designated disposable database inputs were unavailable |
| Browser E2E, production build, SMTP/Graph, Microsoft tenant/Teams, private object storage | Not run |

The audit reproduction script is `/tmp/supply-chain-role-audit/reproductions.test.ts`; it uses isolated database doubles and ephemeral HTTP test listeners, not the running business API. Suite logs are `/tmp/supply-chain-audit-client-tests.log` and `/tmp/supply-chain-audit-server-tests.log`.

The passing suites establish a useful baseline, but do not cover all the demonstrated handoff defects. Recommended additions are draft validation across submission paths, overdue Driver runs across categories, collection concurrency/audit rollback, TASS document inspection, real notification outcomes, and ID collisions. Real PostgreSQL tests should supplement the isolated concurrency reproduction on a designated disposable target.

## Recommended order

1. Fix F1–F3: submitted-record validity, unfinished Driver visibility, and atomic collection verification.
2. Fix F4–F7: truthful output results, correct collection events, recipient mapping and verifier evidence access. Unify notification ownership and prevent duplicate completion emails.
3. Replace random record IDs and standardize draft-to-Logistics alerts.
4. Agree on the next product boundary: inventory reservations/movements, finance reconciliation, or field execution improvements. Then implement one complete cross-role workflow at a time.

No application fixes were applied as part of this audit. Subsequent work updated the agent/skill instructions and repository guide, with its status recorded in the companion development skill review.
