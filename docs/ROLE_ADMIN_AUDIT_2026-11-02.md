# Role and Admin functionality audit — 2026-11-02

Audited revision: `0e33fa7`, including the existing uncommitted and untracked application changes present during this review. Findings concern the inspected working tree, not necessarily the deployed application. Existing edits were preserved. The initial audit added this report only; subsequent authorized Admin fixes are recorded below. No business-data writes, ticket changes or deployments were performed.

PR integration note: the proposed changes were subsequently applied to `dev` revision `4bf63c6`, which already includes the earlier role-workflow fixes. The findings and line references below preserve the original investigation. In the newer baseline, ordinary creation/submission alerts are transactional and the alternate draft-submission omission (finding 8) has been addressed; completion/assignment notification failure concerns need separate verification. Admin account metadata versions and ordinary record edit versions introduced upstream are retained. See the [current feature coverage matrix](FEATURE_TEST_COVERAGE.md) for the integrated baseline, remaining concerns and final validation; the counts in this historical report are not the PR's final test results.

The user's reported symptoms were nonworking Admin buttons and an Admin page that expands while scrolling. The review traced shared authentication, permission modes, Admin account actions, navigation/session handling and Sales → Logistics → Driver → TASS handoffs. This is a scoped source audit with isolated reproductions, not certification of every button or production workflow.

## Assessment

The project has substantive role and lifecycle protections: account authority is reloaded, Driver ownership uses linked profile IDs, Admin account changes serialize and audit together, and TASS retains collection verification and final RMA receipt/completion authority. The principal weaknesses found are inconsistent alternate entry paths, a LEGACY/V1 dependency in Admin controls, and error handling across database/storage/notification boundaries.

The Admin button failure was reproduced under a specific configuration below. The reported scrolling expansion is not reproduced and remains an explicit verification gap.

## Subsequent Admin fixes

After the user authorized implementation, findings 1, 4, 5 and 9 were addressed:

- Account actions require a V1 editor/version only for active V1 sessions. LEGACY Save, activation/deactivation, deletion and Driver linking retain the legacy contract. V1 still requires reviewed versions, role-change acknowledgement and conflict review.
- Users load independently from Driver profiles. Denied or failed profile lookups leave the user list usable, disable profile selection and expose a separate retry. A profile refresh failure after creation/linking does not report the successful write as failed.
- Admin audit, integration, test-email and user-list handlers forward asynchronous errors through existing Express error middleware. Invalid audit pagination and date ranges return 400 before querying. Integration failures expose an error and retry.
- Mock email diagnostics explicitly state that no email was sent.

The layout now uses paginated user rows, a focusable horizontal table scroller and an Access editor outside the table with bounded height. The main scrolling region has explicit minimum-size constraints. These changes address the identified layout pressure; the exact reported scroll expansion still requires real-browser verification. No browser was available and no extra development servers were started.

Regression coverage includes mounted Admin actions in LEGACY/V1, conflict handling, Driver denial, integration retry, mock outcomes, paging/deletion and Access open/close, plus server validation/error forwarding. The original findings below retain the audit's source-line references and describe pre-fix behavior. Findings 2, 3, 6, 7 and 8 remain outside this Admin-panel fix.

Final fix validation: `npm run test:client` passed 258 tests; `npm run test:server` passed 404 tests with the same 3 disposable-PostgreSQL tests skipped. Both workspace `tsc --noEmit` checks and `git diff --check` passed. The 11 new mounted Admin tests use API doubles/JSDOM, and server failure tests use database/transport doubles. No deployment, live database or real email-provider validation was performed.

## Confirmed findings

### 1. High — Admin account buttons can fail because LEGACY actions require the V1 editor

- **Trigger:** An existing deployment runs in LEGACY mode with permission tables migrated but its role policies not initialized. Click Edit → Save, Deactivate/Activate/Delete, or change a Driver profile link.
- **Expected:** Active legacy account actions use legacy authorization; V1 actions require their reviewed version tokens.
- **Actual:** Every listed UI action first requests `getUserPermissionEditor`, which executes V1 policy authorization even in LEGACY. Missing policy rows return 503 before the intended mutation; action confirmation remains disabled when no editor loads.
- **Evidence:** [AdminPanel.tsx](../client/src/features/admin/AdminPanel.tsx), lines 250, 320, 379 and 982; [API client](../client/src/api/index.ts), line 624; [permissionManagement.ts](../server/src/services/permissionManagement.ts), lines 53–55 and 167–175. A service double reproduced editor 503 while `mutateAdminAccount` succeeded in the same LEGACY configuration. Mounted React/JSDOM checks reproduced blocked Edit/Save and disabled Deactivate confirmation.
- **Scope:** Normal [seedUsers](../server/prisma/seeds/users.ts), line 23, initializes the foundation. This does not affect every LEGACY installation. Migration/deployment alone does not establish populated policies, and the deployed policy state was not inspected.
- **Remedy:** Make the preflight depend on the active permission contract; preserve V1 concurrency tokens without introducing a V1 prerequisite for legacy actions. Add a regression case for migrated LEGACY accounts without policy provisioning.

### 2. High — Data Sampler bypasses category creation denials and normal submission validation

- **Trigger:** A valid V1 Admin retains Data Sampler Write but has Delivery Create explicitly denied; call `/api/data-sampler/generate` for Deliveries.
- **Expected:** Alternate creation routes honor the same category/action denials and submission invariants as normal record creation.
- **Actual:** The route checks only Admin and Data Sampler access, then creates operational records directly. A denied Admin receives 201. An overridden `delivery_date: "not-a-date"` also reaches the create payload unchanged. Counts query categories without applying record visibility.
- **Evidence:** [data-sampler.ts](../server/src/routes/data-sampler.ts), lines 21–27, 132 and 221–245. Isolated execution of the route after authenticated identity injection used a structurally valid evaluated snapshot: canonical creation permission was false, sampler returned 201 and invoked the database double once with the invalid date.
- **Impact:** Admin restrictions and lifecycle validation can be bypassed through an alternative module.
- **Remedy:** Reuse canonical category/action checks, submission validation and assignment prerequisites; scope counts. Keep sample operations within their intended environment and authorization boundaries.

### 3. High — Attachment removal can lose the file even when its transaction fails

- **Trigger:** An authorized user removes an attachment; storage deletion succeeds, then metadata deletion, audit persistence or database commit fails.
- **Expected:** Failed removal leaves the attachment retrievable or provides a recoverable deletion state.
- **Actual:** The physical file is removed before the transaction finishes. PostgreSQL rollback cannot restore it, so rolled-back metadata can reference a missing file.
- **Evidence:** [records.ts](../server/src/routes/records.ts), lines 1006–1015. An isolated Admin router reproduction invoked storage removal and then injected audit failure. The removal had already occurred when the handler rejected. The rollback consequence follows from the operation ordering; no live PostgreSQL rollback test was performed.
- **Remedy:** Use reversible file removal or a transactionally recorded deletion job with retries and explicit attachment state.

### 4. Medium — Driver-directory denial prevents unrelated Admin user management

- **Trigger:** A valid V1 Admin retains protected user/admin authority but is denied Driver-directory Read.
- **Expected:** User Management remains usable; only controls requiring Driver profiles are unavailable.
- **Actual:** `Promise.all([getUsers(), getDrivers(true)])` discards the successful users result when the profile lookup rejects. Initial User Management and individual permission targeting show no loaded accounts.
- **Evidence:** [AdminPanel.tsx](../client/src/features/admin/AdminPanel.tsx), lines 228–238. A mounted React/JSDOM reproduction used a valid evaluated Admin snapshot with Driver resource denials: users fetched successfully, the real client permission guard rejected the profile lookup, and the page displayed an empty user list and load error.
- **Remedy:** Load users independently; handle denied or failed profile lookup within profile-specific controls.

### 5. Medium — Admin database failures can leave requests and controls pending

- **Trigger:** A database query rejects while loading the audit log, integration status or user list. Invalid audit pagination/date values can also cause query validation failures.
- **Expected:** A controlled error response ends loading and enables recovery.
- **Actual:** These fallible handlers are raw async callbacks under Express 4. Rejections do not reach error middleware. The process-level rejection listener logs them without completing the request. Integration status additionally swallows client errors and can render an empty panel.
- **Evidence:** [admin.ts](../server/src/routes/admin.ts), lines 22 and 88; [users.ts](../server/src/routes/users.ts), line 24; [index.ts](../server/src/index.ts), rejection listener; [AdminPanel.tsx](../client/src/features/admin/AdminPanel.tsx), lines 397–405. An injected audit-query rejection produced no response and no `next(error)` call. Audit numeric parsing can pass NaN to the query.
- **Remedy:** Apply the existing async wrapper, validate finite pagination and valid dates, and expose retryable load errors.

### 6. Medium — LEGACY notifications retain non-RMA information after access revocation

- **Trigger:** A user receives a record notification, then loses that category's access; or an ordinary Driver run is reassigned/deleted.
- **Expected:** Notification reads respect current record visibility and ownership.
- **Actual:** The LEGACY SQL predicate accepts any existing non-RMA record without checking category denial, Driver ownership, draft state or deletion. Previously stored messages can still expose company/reference details even though direct record reads are denied.
- **Evidence:** Complete source trace through [notificationVisibility.ts](../server/src/services/notificationVisibility.ts), lines 24–30; [notifications.ts](../server/src/routes/notifications.ts), list and unread-count queries; and [inAppNotify.ts](../server/src/services/inAppNotify.ts), persisted messages. Both independent source reviews confirmed the predicate. No live PostgreSQL execution was used for this finding.
- **Remedy:** Apply current readable-category, ownership and deletion predicates consistently to all record notifications in LEGACY as well as V1.

### 7. Medium — Notification failure reports a committed operation as failed

- **Trigger:** Create a submitted non-RMA record; its domain/audit transaction commits, but the subsequent Logistics notification fails.
- **Expected:** The response truthfully identifies whether the record was committed and how notification delivery can recover.
- **Actual:** The handler rejects after the record and audit are saved, before returning 201. A user retry can create another record. Completion/assignment paths also await notifications after committing; their durable state can diverge from the reported result.
- **Evidence:** [records.ts](../server/src/routes/records.ts), lines 1149–1157, 1465–1480 and 1647–1655. An isolated router reproduction saved a submitted record and audit, injected notification failure and observed a rejected request after the transaction callback succeeded. This used a database double rather than live persistence.
- **Remedy:** Record notification work transactionally in a durable outbox; return the committed business result with truthful pending/failed notification state and safe retry behavior.

### 8. Medium — Draft submission does not produce consistent Logistics handoffs

- **Trigger:** Submit a valid ordinary Delivery draft through `PUT is_draft: No`; or submit another non-RMA category through the status endpoint.
- **Expected:** The same newly submitted work produces the same appropriate handoff regardless of entry path.
- **Actual:** PUT has no ordinary draft-submission notification. PATCH notifies only for unassigned Delivery drafts, while direct POST notifies for every submitted non-RMA category.
- **Evidence:** [records.ts](../server/src/routes/records.ts), lines 1149, 1452–1480 and 1638–1645. An isolated Admin PUT reproduction returned 200, saved `draft: false`, and made zero Logistics notification calls.
- **Impact:** Work becomes visible in operational lists but the next role's alert depends on how it was submitted.
- **Remedy:** Centralize handoff decisions around the committed draft-to-submitted transition and agree which categories/assignment states require alerts.

### 9. Low — Admin email diagnostics call mock execution successful sending

- **Trigger:** Send a test email with no real mail provider configured.
- **Actual:** The mailer logs a mock and returns `{ ok: true, method: 'mock' }`; the Admin panel displays “Test email sent successfully via MOCK.” No email was sent by a provider.
- **Evidence:** [mailer.ts](../server/src/services/mailer.ts), lines 91–95; [AdminPanel.tsx](../client/src/features/admin/AdminPanel.tsx), lines 857–864. Source trace only; no real email sent during this audit.
- **Remedy:** Display a distinct mock outcome explicitly stating that no email was sent.

## Reported scrolling issue — not yet confirmed

User Management has an automatically sized table inside `overflow-hidden` at [AdminPanel.tsx](../client/src/features/admin/AdminPanel.tsx), line 610. Its action controls are in an unwrapped flex row, and Access inserts a full permission editor inside a table-spanning row at line 753. This produces width/height pressure; unlike Audit Log, User Management has no horizontal scrolling wrapper. The user list is also unpaginated.

These facts identify where to investigate clipped actions and expanded rows. They do **not** establish continuous page growth on scroll. [MainLayout.tsx](../client/src/layouts/MainLayout.tsx) fixes the shell to `h-screen` and scrolls the main region. A browser check should measure document/main/table dimensions before and after scrolling and opening Access, using the affected viewport and account count.

No connected browser was available. Read-only checks to localhost ports 3000 and 4000 could not connect. No development servers were started. React/JSDOM reproductions cannot validate CSS geometry.

## Capability gap

The server supports linking/unlinking an existing account's Microsoft identity through `/api/users/:id/microsoft-identity`, but the Admin client exposes Object ID provisioning only during creation. Existing accounts show a badge without an identity-editing action. This is a UI capability gap requiring product scope, rather than evidence that the badge's handler is broken.

## Role coverage and strengths

| Role | Paths reviewed | Protections found |
| --- | --- | --- |
| Sales Coordinator | Creation, drafts/submission, shared views and assignment boundary | New Delivery creation remains separate from Logistics dispatch; RMA visibility is restricted |
| Logistics | Assignment, directory constraints, statuses and handoffs | Linked profile assignment and dispatch boundaries; drafts are excluded from Driver work |
| Driver | Session identity, assigned records, completion evidence and RMA transport | Stable profile ownership, non-draft scope, persisted proof checks; transport completion does not finalize RMA |
| TASS | Collection verification, physical RMA receipt and final completion | Verification and final receipt/completion remain separate actions under domain rules |
| Admin | Account lifecycle, role/user permissions, directory links, sampler, audits and integrations | Current authority is rechecked; self/last-admin safeguards; transactional audits; V1 version/conflict checks |

Session/cache code and existing tests also enforce fail-closed snapshots and isolate query data across account changes. These strengths do not establish complete browser or database-race coverage.

## Checks and limitations

| Check | Result |
| --- | --- |
| `npm run test:client` | 247 passed, 0 failed, 0 skipped |
| `npm run test:server` | 400 passed, 0 failed, 3 skipped; 403 total |
| `npm run lint --workspace=client` | Passed (`tsc --noEmit`) |
| `npm run lint --workspace=server` | Passed (`tsc --noEmit`) |
| Isolated Admin/service reproductions | Missing-foundation preflight, sampler denial bypass/invalid date, and raw async rejection reproduced with doubles |
| Isolated workflow router tests | 3 passed: attachment removal ordering, PUT handoff omission, post-commit notification failure |
| Mounted Admin React/JSDOM checks | 2 passed: LEGACY buttons and V1 Driver-denial user-list failure |
| Live PostgreSQL, browser geometry/E2E, external providers | Not exercised |

The three skipped tests require explicit disposable PostgreSQL targets: foundation conversion/constraints/revisions, management transactions/races/rollback, and RMA activation/notification access. Test execution unset their target variables and directed the ordinary database connection to an unavailable local endpoint; database doubles do not prove real PostgreSQL behavior. No production data or deployed permission mode was inspected.

Temporary investigation scripts were kept outside tracked application paths. Durable evidence above records their inputs, observed outcomes and limits. Passing existing suites did not cover the newly reproduced scenarios.
