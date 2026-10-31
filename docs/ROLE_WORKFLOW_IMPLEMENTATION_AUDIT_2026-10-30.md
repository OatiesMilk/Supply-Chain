# Role workflow implementation audit — 2026-10-30

## Publication note — 2026-10-31

This report preserves the audit of `82974de6f1db9d654241504eb4e560598dfeb5ad`.
WF-01–WF-07 were subsequently addressed in the implementation branch for
[PR #270](https://github.com/OatiesMilk/Supply-Chain/pull/270); see its
[remediation and API contract notes](https://github.com/OatiesMilk/Supply-Chain/blob/521aede81caefb24f4f184c01abaf45eb162f5a7/docs/ROLE_WORKFLOW_FIXES_2026-10-31.md).
The parent [PR #269](https://github.com/OatiesMilk/Supply-Chain/pull/269) covers the earlier F1–F8 fixes.
All assessments, known-issue recommendations and test results below refer to
the audited snapshot. Verify current source, PR checks/merge state and deployment
before applying them to current work. This publication does not establish that
any change has been merged or deployed.

## Scope and source

The acceptance baseline is the user's SharePoint-list replacement workflow:

- Admin oversees operations, creates accounts and manages permissions.
- Sales Coordinator creates client-related sales/delivery records.
- TASS manages RMA records.
- Logistics receives Sales/TASS work and assigns Drivers.
- Drivers use a mobile-responsive website to update assigned work, status, remarks, POD and completion.

This is an audit, not implementation work. No application source, permissions, business data, environment files or deployments were changed. This report is the only new repository artifact from the audit.

Remote `dev` was checked at `d5ababa5ece012769b27def211f2424eedbe076f`. PR [#269](https://github.com/OatiesMilk/Supply-Chain/pull/269) was open and unmerged when checked. Detailed traces and reproductions use its clean checkout at `82974de6f1db9d654241504eb4e560598dfeb5ad`, which includes the eight earlier fixes. The original working directory contains those fixes plus pre-existing instruction edits; it was not treated as a clean release revision. Code links below are pinned to the audited PR revision.

The seven findings below remain in the PR revision. Comparing their relevant paths against `dev` shows they are not addressed by PR #269. The new reproductions were run against the PR checkout, not independently repeated against `dev` or a deployed portal.

## Assessment

**All five role workflows have concrete UI and server implementations.** The portal is substantially aligned with the requested SharePoint replacement. The main gaps are audit usefulness, edit consistency and scaling, rather than absent role screens.

| Role / handoff | Implemented behavior | Qualification |
| --- | --- | --- |
| Admin | User creation and activation, built-in roles, Driver-login linking, permission editors, operational dashboards and system audit access. Account and permission changes use shared authorization and transactions. | Central business audit diffs and account identity history are incomplete. Admin oversight does not bypass TASS-owned receipt/completion boundaries. |
| Sales Coordinator | Client/company selection, Delivery preparation, drafts, submission, record monitoring and customer-directory screens. Assignment is reserved for Logistics/Admin. | The UI and API disagree about editing after dispatch/completion. Customer directory entries and the Company used on records are separate models. |
| TASS | RMA preparation, movement selection, submission, physical receipt and final completion. Driver-required movement is handed to Logistics. | RMA dispatch depends on initialized/provisioned role policies; code presence does not establish activation in a deployment. Supplier/internal movements intentionally differ from Driver transport. |
| Logistics | Submitted-record lists, Driver/assistant/vehicle assignment, dispatch management, calendar and monitoring; dedicated RMA assignment action. | An alternate ordinary draft-submission API path omits the Logistics alert. Saved records remain visible in the lists. |
| Driver | Separate mobile-oriented dashboard, linked-profile ownership, non-draft assignments, Time In, status/remarks, persisted POD, recipient and completion checks. RMA transport has separate actions. | Mobile layout exists in source but was not tested on a real browser/device. Completion details show the scheduled date as the accomplishment date. |

The primary delivery path is Sales Coordinator → submitted record → Logistics assignment → linked Driver → completion/POD → refreshed operational views. The RMA path is TASS → submitted transport requirement → Logistics assignment → Driver transport → TASS physical receipt → TASS final completion. Server registration includes both the ordinary record router and the dedicated RMA router. RMA actions use version checks, transactional state revalidation and separate ownership of assignment, transport, receipt and final completion.

Representative sources: [Driver application entry](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/client/src/App.tsx#L231), [RMA capabilities](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/routes/rmaDispatch.ts#L28), [route registration](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/index.ts#L99).

## Confirmed findings

### WF-01 — High: central Admin audit hides business before/after values

**Scenario:** Admin opens System Audit Log to investigate a Delivery, Customer, SKU or Driver change.

The endpoint applies `safePolicyAudit` to every row. That helper returns null unless the entity is RolePolicy, UserPermissionOverride or UserAuthorization. The UI likewise renders only policy diffs. Business audit rows retain actor, time and entity identity, but their changed values are unavailable in this central oversight view.

**Evidence:** The actual projection returned null for DeliveryRecord, Customer and Driver snapshots in an isolated reproduction. The per-record audit path remains separate and can still expose authorized business snapshots; this is not a claim that all audit data is absent or deleted.

**Impact:** Admin cannot answer “what changed?” from the system-wide audit view, which is a central goal of this replacement.

**Recommendation:** Add safe entity-specific business projections and a corresponding readable diff UI, preserving current category, ownership and linked-record redaction. Do not return arbitrary stored JSON or credentials.

Sources: [admin.ts:80](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/routes/admin.ts#L80), [safePolicyAudit:278](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/services/permissionManagement.ts#L278), [PolicyAuditDiff:23](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/client/src/features/admin/PolicyAuditDiff.tsx#L23).

### WF-02 — High: account name/email changes lack meaningful historical values

**Scenario:** Admin corrects a user's name or email through the supported account editor.

The route delegates to `mutateAdminAccount`. Its before/after audit state contains authorization fields but excludes account name and email. Metadata-only edits can therefore produce identical snapshots even though the identity fields changed. The original values are not recoverable from those audit entries.

**Evidence:** An isolated service/transaction-double reproduction changed an email and then a name. Both authorization-only audit entries omitted the changed identity values; one entry had identical previous/new snapshots.

**Recommendation:** Audit safe account metadata separately or extend an explicit allowlist with the relevant before/after fields. Never include passwords, cookie/session material or identity secrets. Activation and role changes already have authorization history; this finding specifically concerns name/email metadata.

Sources: [account update route:170](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/routes/users.ts#L170), [state projection:69](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/services/permissionManagement.ts#L69), [audit write:265](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/services/permissionManagement.ts#L265).

### WF-03 — Medium: ordinary views repeatedly fetch the entire permitted record set

`useAppData` enables the shared records query on operational screens. That query calls `getRecords()` without bounds and inherits a two-second refresh interval. The server's unpaginated contract applies no `take` unless supplied by the caller, and includes record relations. Paginated list components coexist with this full-set query.

**Evidence:** An actual-router HTTP reproduction with database doubles returned 6,001 rows and confirmed `take` was undefined. The equivalent paginated request returned 25 rows with a bounded query of 26. This establishes request behavior and the absence of a fixed 5,000-row application ceiling; it is not a PostgreSQL load test or proof of acceptable performance at that volume.

**Impact:** Data growth increases recurring database, network, serialization and browser work. Replacing SharePoint's view threshold does not itself demonstrate scalable navigation, search, dashboards or exports.

**Recommendation:** Replace ordinary full-set reads with purpose-specific paginated, assigned-run and aggregate queries. Validate representative record and attachment volumes with multiple concurrent users before scale acceptance.

Sources: [useAppData:102](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/client/src/hooks/useAppData.ts#L102), [useRecordsQuery:33](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/client/src/api/queries/useRecordsQuery.ts#L33), [refresh interval:7](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/client/src/api/queries/operationalSync.ts#L7), [unpaginated query:334](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/routes/records.ts#L334).

### WF-04 — Medium: stale record and account forms can overwrite newer metadata

The ordinary record form sends multiple metadata fields from its edit draft. Only RMA sends an expected version. Ordinary PUT locks the current row but applies the submitted data without checking the editor's original revision. Separately, V1 account editor tokens cover authorization/policy revisions; name/email changes do not advance that token. The PostgreSQL revision trigger was also inspected: it advances the User revision for role/activation changes, not name/email updates.

**Evidence:** In an actual ordinary-record router reproduction, coordinator A saved a new reference. A stale coordinator B form then changed the address while submitting the original reference. Both requests returned 200; B's save restored the original reference. Both writes retained audit entries. A separate account service reproduction accepted the original V1 editor token after an email change and let a stale form restore the old email.

**Impact:** Locks serialize writes but do not detect stale intent. A user can unknowingly undo another person's correction.

**Recommendation:** Use a server-enforced edit revision/conditional write for metadata, with a conflict response and draft-preserving reload/review UI. Keep the existing RMA and permission conflict protections.

Sources: [record form:263](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/client/src/features/deliveries/DeliveryRecordWorkspace.tsx#L263), [record transaction:1401](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/routes/records.ts#L1401), [record update:1474](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/routes/records.ts#L1474), [account editor token:62](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/services/permissionManagement.ts#L62), [User revision trigger:256](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/prisma/migrations/20261027091057_permission_foundation/migration.sql#L256).

### WF-05 — Medium: Sales metadata lifecycle protection differs between UI and API

The workspace permits full Sales edits only while Scheduled or Draft and tells users the record locks once Logistics advances it. The server's Sales metadata PUT path does not enforce that same state restriction.

**Evidence:** Actual-router reproductions changed an ACCOMPLISHED Delivery reference as Sales Coordinator and returned 200 in both LEGACY and V1. Explicit permission checks were retained; the gap is lifecycle enforcement, not a missing authentication check.

**Recommendation:** Establish the intended post-dispatch correction rule and enforce it on the server under the record lock. If corrections should remain permitted, make their authorization and UI explicit instead of claiming a lock. This audit does not invent a new business restriction.

Sources: [UI edit condition:150](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/client/src/features/deliveries/DeliveryRecordWorkspace.tsx#L150), [UI lock message:743](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/client/src/features/deliveries/DeliveryRecordWorkspace.tsx#L743), [Sales metadata mapping:1330](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/routes/records.ts#L1330).

### WF-06 — Medium: alternate draft submission omits the Logistics alert

Submitting an ordinary Delivery draft through PUT saves it but does not emit the Logistics alert that the equivalent PATCH status path emits. The normal workspace Submit action uses PATCH; this finding concerns the alternate supported path. RMA uses its own transactional handoff notifications.

**Evidence:** An actual-router reproduction submitted the same valid draft through each path. PUT returned 200, cleared Draft and created zero Logistics alerts. PATCH returned 200 and created one. The saved record remains visible to Logistics; this is notification inconsistency, not complete loss of the handoff.

**Recommendation:** Emit the same submission event for equivalent successful transitions, regardless of the API entry point, and test next-role list visibility and alerting separately.

Sources: [PUT post-save handoff:1483](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/routes/records.ts#L1483), [PATCH handoff:1669](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/server/src/routes/records.ts#L1669).

### WF-07 — Low: Driver accomplishment details show the scheduled date

The completed-run modal labels `delivery_date` as “Accomplished on”; it formats Time Out separately as a time without correcting that date label.

**Evidence:** Rendering the actual React modal for a run scheduled October 1 and completed October 3 displayed “Accomplished on 10/1/2026”. The saved `time_out` was October 3. This was an isolated static-render check, not a browser/device test.

**Recommendation:** Show the actual completion date from `time_out` in Asia/Manila and label the scheduled date separately.

Source: [DoneRecordModal:50](https://github.com/OatiesMilk/Supply-Chain/blob/82974de6f1db9d654241504eb4e560598dfeb5ad/client/src/features/dashboard/DoneRecordModal.tsx#L50).

## Configuration, policy and operational qualifications

1. **RMA dispatch policy activation is a deployment prerequisite.** The code has explicit provisioned Logistics/Driver grants and a guarded activation mechanism. Customized policies or individual Deny rules must not be overwritten to force the workflow to appear functional. The deployed permission mode and provisioned grants were not inspected.
2. **Inactive Driver roster profiles behave differently between modes.** With an active login linked to an inactive roster profile, an actual-middleware reproduction started an existing Delivery in LEGACY (200) but V1 denied it (403). Roster deactivation is distinct from login deactivation, and retaining existing assignments is intentional in the directory helper. Decide whether roster inactivity means “no new assignments” or “no field actions”, then align the modes. This is not evidence that a deactivated user account can authenticate.
3. **SSO diagnostics can overstate configuration readiness.** The integration-status predicate treats client credentials as configured even with an unsupported tenant such as `common`; the actual SSO configuration helper rejects it. This pure-helper inconsistency does not establish a sign-in bypass or live provider failure.
4. **Client identity needs a migration rule.** Operational records use Company, while Customer directory entries are a separate model. Client-related record creation is implemented; automatic synchronization between those master-data paths was not established.
5. **SharePoint replacement acceptance requires operational evidence.** Migration reconciliation, historical audit preservation, attachment integrity, backup restoration, representative-volume performance and actual device usability remain unverified. These are acceptance checks, not a request to add ERP/inventory/finance scope.

## Validation performed for this audit

| Check | Result / evidence type |
| --- | --- |
| Focused server suites: permissionEnforcement, recordAuditVisibility, serverPagination, rmaDispatch, driverIdentity, recordIntegrity | 55 passed, zero failed/skipped; router/service checks and database doubles |
| Focused client suites: adminPolicyLayout, adminPolicyEditor, accountPolicy, permissionsV1, recordLifecycleMutations, recordAttachments, collectionEvidence, operationalSync, recordLifecycle | 59 passed, zero failed/skipped; helpers and React/JSDOM |
| New ordinary-record stale-edit and unbounded/paged-query reproductions | Two passed against the actual router with database doubles; 6,001 synthetic returned rows, not a live database benchmark |
| New Sales post-completion LEGACY/V1 and PUT/PATCH handoff reproductions | Three passed against actual routers with database doubles |
| Admin metadata/audit/token and SSO helper reproduction | Four assertion groups passed using shared services, transaction doubles and pure helpers |
| Inactive Driver profile comparison | LEGACY 200 with one write; V1 403 with no additional write; actual middleware/handler with doubles |
| Driver completion-date rendering | Reproduced scheduled/actual date mismatch using the real React component |
| Local frontend/backend availability | Both connection checks returned HTTP 000; no new development servers were started |
| Repository/source integrity | PR checkout remained clean; original application/instruction edits preserved; report-only repository addition |

The focused server/client counts are separate runs; no claim is made that they exercise every business case. Earlier PR validation recorded 253 client tests, 405 server tests, three designated PostgreSQL skips, successful typechecks/builds and Prisma validation. Those are previous results for the same PR snapshot, not fresh full-suite results from this audit. No live PostgreSQL concurrency/rollback, browser E2E, real mobile device, SMTP/Graph, Microsoft tenant or object-storage verification was performed.

Temporary audit evidence is under `/tmp/supply-chain-role-workflow-audit/`; the actual-router handoff harness is `/tmp/supply-chain-role-handoff-audit/handoffs.test.ts`, the Admin service harness is `/tmp/supply-chain-admin-audit-repro.ts`, and Driver harnesses are under `/tmp/driver-workflow-audit/`. The first Driver render harness had a CJS/ESM query-provider context mismatch; the corrected `.mts` harness reproduced the date defect successfully. These temporary files may disappear; the scenarios, expected/actual results and source links above preserve the findings.

## UAT recommendation

**Conditional go for role-based functional UAT; no final SharePoint-replacement sign-off yet.** Deploy and identify the intended revision, prepare authorized role accounts and test records, verify RMA policy activation, then exercise both complete chains. Track the seven findings as known issues. Prioritize useful Admin/account audit history and stale-edit handling; demonstrate bounded navigation and acceptable behavior at expected data volumes before scale acceptance. Mobile source structure and passing isolated tests do not establish real-device acceptance.
