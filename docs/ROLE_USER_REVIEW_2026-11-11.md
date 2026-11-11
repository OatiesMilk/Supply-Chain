# Supply Chain: review from the users' perspective

Reviewed 2026-11-11 on local `dev`, application revision `1e2b900`.

## Overall assessment

The application has a substantial operational core: preparing records, coordinating dispatch, executing assigned runs, collecting evidence, receiving returns and verifying collections. Its strongest design choice is separating responsibilities between Sales Coordinator, Logistics, Driver and TASS, with Admin managing identities and access rather than bypassing every business boundary.

My assessment is **a useful operations portal with specific reliability and usability work remaining before broad operational reliance**. It should not yet be described as a complete warehouse, inventory, accounting or ERP system. This judgment is based on source walkthroughs and isolated checks, not a completed live user acceptance test.

The most important improvements are trustworthy save/notification outcomes, consistently scoped reminders, usable Driver job details, and finishing or removing controls that imply functionality which is not implemented.

## Scope and method

Reviewed the current role screens, route registration, API clients, permissions, record lifecycle services, transactions/audit, attachments, notifications, directories, inventory and reports. Included Logistics because it connects Sales preparation to Driver execution, even though the requested roles were Admin, TASS, Sales Coordinator and Driver.

Applied the repository [routing skill](../.gemini/skills/use-supply-chain-dev/SKILL.md), [agent instructions](../.gemini/agents/supply-chain-dev.md) and audit references. The named Antigravity agent was unavailable; available review agents applied its instructions, and their principal findings were checked against source and/or rerun reproductions.

No application code, permissions, business data, deployment settings or tickets were intentionally changed. This document is the review deliverable. Existing untracked files were left alone. Browser automation had no available browser, so no login, visual/mobile usability session or live role workflow was performed. Frontend and backend health endpoints responded HTTP 200; this establishes reachability only.

## What each user can do, and how it feels

| Role | Implemented experience | Assessment from that user's perspective |
| --- | --- | --- |
| Admin | Account creation and lifecycle, Driver profile linking, Companies and Account Managers, module/policy access tooling, audit logs, integration/deployment diagnostics, supplier categories, SKU maintenance and manual adjustments, reporting and operational oversight | “I have meaningful control and traceability. I still need dependable failure reporting, actionable shortcuts and a clear distinction between completed modules and placeholders.” |
| Sales Coordinator | Prepare Delivery, Procurement Pick-up, Sales Order and Collection records subject to grants; save/submit drafts; maintain permitted customer/supplier data; attach documents; inspect status/history; use dashboard attention lists, Transaction Center and outputs | “The preparation and follow-up workflow is useful. I need searching to open the entity I selected, accurate handoff feedback and an access-request process that actually reaches Admin.” |
| TASS | RMA preparation and workflow, physical receipt and final completion distinct from transport; collection evidence review and verification; relevant operational views, supplier lookup and transaction history | “The separation of transport, receipt and final completion fits accountability. I need reliable alerts when work reaches my queue, clear business references, and confidence that a failed response did not conceal a successful save.” |
| Driver | Standalone mobile-oriented assigned-work queue, overdue work, Time In/start, evidence upload, receiver and remarks, completion/pending/on-hold actions; eligible assigned RMA transport via its own workflow | “The action screen is focused and proof requirements are clear. For ordinary runs, I still need a proper job-details view with the exact destination and full manifest so I can execute without separate instructions.” |
| Logistics handoff | Driver/assistant/vehicle assignment after submission, Drivers View/Board/Manager, calendar, dispatch status and rescheduling, route slips and reports, bounded RMA dispatch | “The dispatch tools are substantial, but Reschedule must work in every view, and assignment should not look unsuccessful after it has already saved.” |

Default screens and actual authority are different. See [role defaults](../server/src/services/permissions.ts), [record access](../server/src/services/recordAccess.ts), [record operations](../server/src/services/recordOperations.ts) and [permission evaluation](../server/src/services/permissionEvaluator.ts). RMA dispatch also depends on initialized/provisioned permissions. The presence of V1 code does not establish deployed activation.

## Strengths worth preserving

- **Responsibility boundaries:** Sales cannot assign Drivers during preparation; linked Driver profile IDs determine ownership; collection verification belongs to TASS; RMA transport completion does not establish physical receipt or final completion.
- **Current-account authorization:** Authentication reloads account state rather than trusting stale JWT role claims. Cookies are httpOnly and writes have CSRF protection. V1 includes explicit Deny, role ceilings and version-aware policy editing. See [auth](../server/src/middleware/auth.ts), [policy evaluator](../server/src/services/permissionEvaluator.ts) and [management](../server/src/services/permissionManagement.ts).
- **Evidence and history:** Completion checks persisted proof, timestamps, receiver and remarks. Attachments have protected reads and content/format checks. Many operational writes include audit and remark entries in transactions; collection verification includes its notification atomically.
- **Conflict and cache handling:** Operational queries are scoped/paged, poll and refresh on focus/reconnect; mutations invalidate related lists, details, evidence, dashboards and notifications. Session changes clear previous-user state. RMA has separate version and sync safeguards. These are valuable foundations, although they do not apply uniformly to every screen.
- **Recent master-data work:** Companies and Account Managers have active/inactive handling and stale-edit protection. Supplier categories support an Admin-managed multi-category catalog, preserved historical assignments and atomic audits. These are implemented features, not outstanding versions of older findings.
- **Reporting:** Statistical Reports distinguish delivery-date cohorts from completion timestamps and explain Manila date semantics. Exports and route slips support practical operational paperwork.

## Confirmed issues, in recommended order

### R1 — High: LEGACY scheduled reminders can disclose records outside the recipient's scope

**Affected users:** Account Managers and restricted staff, with Admin responsible for access control.

The 4 PM LEGACY job fetches all unfinished records, including RMA, groups by the text Account Manager name, chooses an active user using `name contains`, and builds a preview containing business references and company names. It does not apply the recipient's record scope. The notification has no record type/ID, so the normal record-linked visibility filter cannot remove it. The same preview is passed to email.

Evidence: [scheduler](../server/src/index.ts#L167), especially lines 191–205; [notification creation](../server/src/services/inAppNotify.ts#L28); [visibility filter](../server/src/services/notificationVisibility.ts); [notification reads](../server/src/routes/notifications.ts#L14). LEGACY is the code default in [permission management](../server/src/services/permissionManagement.ts#L18). V1 uses a different, scoped summary path; this finding is mode dependent and does not assert that the running deployment uses LEGACY.

**Remedy:** Use the linked Account Manager identity and current recipient scope for every summary; make already-stored summaries invalid when authority changes. Avoid fuzzy name resolution. Validate a recipient with denied RMA access and duplicate/overlapping names.

### R2 — High: some API failures escape the application's error handler

**Affected users:** SKU users and every role using the notification bell.

SKU GET/list/audit handlers and notification GET/read handlers await database calls in bare async callbacks. This is Express 4; rejected callbacks are not automatically forwarded to the global error handler. Users can receive an unanswered request, and the process can experience an unhandled rejection.

Evidence: [SKU handlers](../server/src/routes/skus.ts#L52), lines 52, 62 and 78; [notification handlers](../server/src/routes/notifications.ts#L14), lines 14, 34, 43 and 51; existing [async wrapper](../server/src/middleware/asyncRoute.ts). An isolated Express listener with an injected async rejection produced `{forwardedToErrorHandler:false, unhandledRejectionObserved:true, responseReceived:false}`. This is framework-level evidence, not an induced production outage.

**Remedy:** Apply the established async wrapper consistently and check that injected query failures yield recoverable HTTP errors.

### R3 — Medium: a successful assignment or completion can be reported as failed

**Affected users:** Logistics/Admin, Drivers, Sales Coordinator and TASS waiting for handoffs.

After committing an assignment and its audit, the route awaits a creator notification before responding. If that notification write fails, the API returns 500 although the Driver assignment remains saved. Completion similarly performs email-log and TASS notification work after the record transaction. A notification/log database failure can obscure a committed completion; the email trigger depends on entering the accomplished state, so an ordinary retry is not a reliable recovery mechanism. Provider-send failures caught by the mail service are a separate case; SMTP failure alone is not claimed to cause every 500.

Evidence: [assignment response path](../server/src/routes/records.ts#L1551); [completion response path](../server/src/routes/records.ts#L1729); [completion notification service](../server/src/services/notify.ts). An isolated HTTP request using a transaction double confirmed a 500 with the Driver assignment and audit retained. No real database/provider was used.

**Remedy:** Persist the handoff intent atomically with the record, dispatch it through retryable work, and return the saved record with truthful notification status. Make retries idempotent.

### R4 — Medium: Drivers View offers a Reschedule action that cannot succeed

**Affected users:** Admin and Logistics using Drivers → View for a Delivery.

The action sends status and remarks but has no new-date input. The server requires a changed delivery date in the same reschedule request. Users must leave the view and reschedule in the category workspace.

Evidence: [confirmation payload](../client/src/features/drivers/DriverView.tsx#L178), button around line 391; [server requirement](../server/src/routes/records.ts#L1645). This is a complete source trace; no live reschedule was performed.

**Remedy:** Reuse the existing date input and validation from the operational workspace.

### R5 — Medium: access requests report a notification that never occurs

**Affected users:** Staff denied a requested screen and Admin expected to respond.

Submit only changes local component state and starts a timer. The success text says “Request Sent” and “Your admin has been notified”; no API request or persisted notification exists in that path.

Evidence: [AccessRequestModal](../client/src/components/AccessRequestModal.tsx#L27), success text at lines 44–45; denied navigation opens it in [App](../client/src/App.tsx#L177).

**Remedy:** Implement a persisted request/Admin queue, or provide an honest contact instruction until that workflow is available.

### R6 — Medium: scheduled reminders lack durable execution and accurate email outcomes

**Affected users:** Admin and staff relying on end-of-day or weekly alerts.

Daily/weekly tasks use process timers. Downtime across a firing time misses the notification run; multiple instances independently schedule the same work. There is no persisted run claim/catch-up mechanism. Separately, the LEGACY AM job ignores the returned send result and records SENT whenever a user exists; that row suppresses further daily attempts. Weekly reporting records SENT before mail is attempted. Mocked/failed delivery can therefore appear successful in these paths, although the newer manual email endpoint handles outcomes more accurately.

Evidence: [daily timer](../server/src/index.ts#L138), [weekly timer](../server/src/index.ts#L258), [AM send/log](../server/src/index.ts#L203), [weekly log/send](../server/src/index.ts#L303), [mailer outcomes](../server/src/services/mailer.ts), [V1 summaries](../server/src/services/scopedSummaries.ts).

**Remedy:** Define missed-run behavior, persist unique job claims and retry outcomes, and distinguish SENT/MOCKED/FAILED/SKIPPED. A provider accepting mail still does not prove inbox delivery.

### R7 — Medium: Global Search loses selected directory entities

**Affected users:** Admin, Sales Coordinator, TASS and Logistics with applicable directory grants.

Selecting a customer, supplier or Driver result passes its ID into navigation, but navigation retains selections only for inventory and operational record screens. The directory pages receive no selected entity ID, so the user lands on the list and searches again.

Evidence: [search navigation](../client/src/components/GlobalSearch.tsx#L176), [selection storage](../client/src/store/uiStore.ts#L105), [page wiring](../client/src/routes/AppRouter.tsx).

**Remedy:** Preserve directory selection and open/focus the requested entity, including permission and missing/deactivated-item handling.

### R8 — Medium: Transaction Center still performs full-history work for a page

**Affected users:** Staff reviewing historical transactions as data grows.

The API fetches every matching delivery/inventory row, builds a merged array, sorts it and only then slices the requested page. A 25-row page therefore does not bound database/network-to-server/memory work. Inventory date bounds also mix UTC parsing with host-local end-of-day adjustment, unlike the explicit Manila helpers elsewhere. The latter warrants a timezone fixture before asserting a particular missing-row incident.

Evidence: [delivery fetch](../server/src/routes/transactions.ts#L64), [inventory bounds/fetch](../server/src/routes/transactions.ts#L94), [sort/slice](../server/src/routes/transactions.ts#L130).

**Remedy:** Page/count in the database with stable ordering and align inventory timestamp bounds with Manila semantics. Actual latency at production volume was not measured.

## Capability gaps and smaller usability issues

These should be scoped deliberately; they are not all regressions or approved new features.

| Gap | User impact and evidence | Suggested decision |
| --- | --- | --- |
| Ordinary Driver run details | Active cards show area/date and truncate item description to 40 characters; no full ordinary-run detail action exposes the exact address or manifest. [DriverDashboard](../client/src/features/dashboard/DriverDashboard.tsx#L293); Drivers use a standalone application in [App](../client/src/App.tsx#L224). | Add an assigned-job details view with existing destination fields/full items and appropriate map/contact actions; confirm which contact data exists for each category. |
| Partial inventory scope | General, balance/manual adjustment and audit are implemented; eight SKU tabs are scaffolds. [SkuWorkspace](../client/src/features/inventory/SkuWorkspace.tsx#L543). Operational records do not automatically reserve, issue or reconcile stock/finance. | Clearly label unfinished tabs and agree movement/reconciliation rules before implementing automation. |
| Warehouse scope | Warehouse components exist but are not mounted through a registered screen; InventoryPage mounts InventoryView. | Decide whether a Warehouse module belongs in this release. |
| Supplier maintenance | Creation and category management are implemented; supplier contact/name/address update and supplier retirement are absent from the route/UI workflow. [supplier routes](../server/src/routes/suppliers.ts), [workspace](../client/src/features/suppliers/SupplierWorkspace.tsx). | Define who maintains supplier details and add the corresponding audited lifecycle. |
| Local account recovery | No password change/recovery workflow found; account settings are read-only and user edits exclude password. [users](../server/src/routes/users.ts#L174). | Define support/recovery for local accounts separately from the previously deferred password-strength policy. |
| Shortcut destination | Admin dashboard “View Full Log” navigates to Admin, whose initial tab is Users. [AdminDashboard](../client/src/features/dashboard/AdminDashboard.tsx#L206), [AdminPanel](../client/src/features/admin/AdminPanel.tsx#L40). | Navigate directly to Audit. |
| Calendar accessibility/identification | Clickable day divs lack keyboard activation; calendar/AM history emphasize internal IDs instead of the business reference. [DeliveryCalendar](../client/src/features/deliveries/DeliveryCalendar.tsx#L149). | Use accessible buttons and show business references prominently. |

Additional concerns needing scoped validation:

- Transaction Center uses uncancelled local asynchronous fetching. A slower older filter request can overwrite a newer result; ordinary operational Query invalidation does not refresh this local state. [TransactionCenter](../client/src/features/transactions/TransactionCenter.tsx#L149). Verify with controlled response ordering and migrate it to the shared query model.
- Record APIs accept numeric line-item quantities `-2` and `0`; an isolated creation request returned 201 and retained both values in a database double. Creation/edit mappings pass numbers directly, while some string inputs are coerced/defaulted. See [mapping](../server/src/routes/records.ts#L1191) and corresponding edits at lines 1375, 1399 and 1422. Agree valid quantity semantics across categories, then enforce them consistently; no financial or return-sign rule is assumed here.
- Real deployment permission activation, provider delivery, storage failover, PostgreSQL races/rollback and missed-job behavior remain unverified in this review.

## Validation actually performed

| Check | Result | Limit |
| --- | --- | --- |
| `npm run lint --workspace=client` | Passed | TypeScript only |
| `npm run lint --workspace=server` | Passed | TypeScript only |
| `npm run test:client` | 326 total: 325 passed, 1 skipped, 0 failed | Skipped integrated PostgreSQL permission workflow; mounted/component and unit checks are not live browser UAT |
| `PERMISSION_MODE=LEGACY npm run test:server` with optional DB target variables unset | 509 total: 502 passed, 7 skipped, 0 failed | PostgreSQL permission conversion/management, POD deletion, RMA activation, seeded reads and two supplier checks skipped; suite also contains tests that explicitly exercise V1 |
| Isolated assignment failure + quantity reproductions | 2 passed | Actual router/HTTP, transaction/database doubles; no PostgreSQL/provider validation |
| Isolated Express async rejection | Confirmed unhandled rejection and no response | Framework failure simulation on an ephemeral listener |
| Frontend/backend health requests | HTTP 200 | Reachability only |
| Browser role walkthrough/E2E | Not run | No browser surface available; existing E2E workflows share/write live data and were not run as a substitute |

The initial plain server-suite attempt picked up the local V1 configuration, failed LEGACY-shaped authentication fixtures and did not finish; it was terminated. A focused attachment authorization test passed from the root context, and the explicit LEGACY suite above completed successfully. The tests should isolate permission mode rather than inherit local dotenv settings. The aborted attempt is not counted as a passed suite or evidence of a production application failure.

No new development servers, database resets/migrations, real emails, ticket updates, commits or deployments were performed.

## Recommended next work

1. Fix reminder scope/identity and async error propagation, then make assignment/completion handoffs durably retryable with truthful responses.
2. Repair Drivers View rescheduling and access-request messaging; make directory search open selected results.
3. Add ordinary Driver job details and validate real Sales → Logistics → Driver → TASS handoffs on an explicitly disposable environment, including failed-save/retry scenarios.
4. Make scheduler execution durable and Transaction Center queries bounded; test Manila timestamp edges and realistic history volume.
5. Agree release scope for inventory/Warehouse/supplier maintenance and account recovery. Keep manual stock and financial boundaries explicit until business rules are approved.

This is a current-source review of the major implemented surfaces, not a claim that every route, permission combination, device or failure mode has been exhaustively tested.
