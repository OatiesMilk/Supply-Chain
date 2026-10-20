# Audit Development Backlog

Generated from the 2026-10-09 completeness audit, with emphasis on the Sales Coordinator and Logistics workflows. **Reconciled 2026-10-13** against `dev` at [`875612a`](https://github.com/MarcZxc1/Supply-Chain/commit/875612a363e5fb5611778bc81af4ba181b4292e5) (merge of PR #142). This is a planning and evidence record, **not** a declaration of staging or production readiness.

**Temporary source of truth:** all 11 original audit tickets (10 open and AUD-009 completed) are stored in this file for development while the replacement Notion workspace is being prepared. Migrate them into the new workspace when it is available, keep each `AUD-XXX` ID in the page body, and fill in the Notion ticket ID and URL in the mapping table below. Until then, use this Markdown file as the canonical ticket record.

## Working Agreement

- Read `AGENTS.md`, `CLAUDE.md`, and `DONT_BREAK_THIS.md` before implementation.
- Reproduce each issue against the latest branch before editing; cited line numbers may move.
- Preserve server-side RBAC, `recordScope`/`canWriteCategory`, Logistics read-only RMA, Driver ownership by profile ID, audit/remarks rules, and the Sales Coordinator -> Logistics -> Driver handoff.
- Use the existing React/TypeScript, TanStack Query, Zustand, Express, Prisma, `node:test`, and Playwright conventions. Do not edit `dist/`.
- Run both TypeScript checks and the focused test suites listed in the ticket. A successful build by itself is not completion.

## Ticket Mapping and Recommended Order

**Status definitions:** **Ready** means sufficiently specified to begin the scoped implementation and validation; **Decision needed** means a named policy, contract, or architecture choice must be approved before implementing that part of the ticket; **Done — merged** means the documented acceptance criteria were verified in merged work. A decision-dependent ticket may be investigated or tested in advance, but its unresolved policy must not be silently assumed. The Notion ID remains **Pending** until a corresponding page is verified and linked; it is independent of implementation status.

| Local ID | Notion ID | Priority | Status | Title | Dependency/decision |
| --- | --- | --- | --- | --- | --- |
| AUD-001 | Pending | P2 High | Ready | Creation-time attachments are discarded after save | None |
| AUD-002 | Pending | P1 Critical | Decision needed | Lock Microsoft SSO to approved accounts and validate OAuth state | Approve tenant, pre-provisioning and identity binding policy |
| AUD-003 | Pending | P1 Critical | Decision needed | Add CSRF protection, request rate limits, and HTTP security headers | Confirm production origins and Teams embedding policy |
| AUD-004 | Pending | P2 High | Decision needed | Let Sales Coordinators manage the Company master | Approve Company duplicate and edit policy |
| AUD-005 | Pending | P2 High | Decision needed | Replace hard-coded Account Manager picker with stable identities | Identity model |
| AUD-006 | Pending | P2 High | Decision needed | Managed vehicle fleet and dispatch conflict prevention | Scheduling/conflict policy |
| AUD-007 | Pending | P2 High | Decision needed | Link Suppliers and SKU items to operational records | Inventory business rules |
| AUD-008 | Pending | P2 High | Ready | Server-side record pagination and filters | API migration design |
| AUD-009 | Pending | P2 High | Done — merged | Make tests authoritative CI gates | PRs [#140](https://github.com/MarcZxc1/Supply-Chain/pull/140) and [#142](https://github.com/MarcZxc1/Supply-Chain/pull/142); CI passed |
| AUD-010 | Pending | P3 Medium | Decision needed | Align report date semantics | Date-semantics matrix |
| AUD-011 | Pending | P2 High | Decision needed | Externalize scheduled jobs and add deployment health checks | Approve scheduler, catch-up and retry policy |

**Recommended next sequence:** prioritize the two P1 security decisions and fixes, `AUD-002` and `AUD-003`, **before production enablement**; resolve tenant/provisioning and deployment/Teams-origin policies first. With those safeguards underway, implement the ready user-facing repair `AUD-001` and pagination `AUD-008`. Then address `AUD-004` and `AUD-011` once their explicit decisions are approved, followed by decision-dependent `AUD-005`–`AUD-007` and `AUD-010`. `AUD-009` is **complete** and is not pending implementation. Work on independent tasks can be parallelized without implying that unresolved security items are safe to defer for production.

---

## AUD-001 - Creation-time attachments are discarded after save

**Type:** Bug
**Modules:** Deliveries, RMA, Procurement Pick-up, Sales Orders, Accounting Collection
**Access:** Sales Coordinator, Logistics, Admin
**Priority:** P2 High

### Problem

Delivery and Accounting Collection create forms validate selected files but retain only their names. Saving creates a record with the legacy `documentAttachment` string; it does not create a `PodAttachment` or store the file. The UI can therefore imply that evidence was saved when the file was discarded.

### Evidence

- `client/src/features/deliveries/RecordCreateForm.tsx` stores attachment names and labels the upload as mock.
- `client/src/features/accounting/AccountingCollectionView.tsx` has the same filename-only behavior.
- `server/src/routes/records.ts` writes only the first supplied name to `DeliveryRecord.documentAttachment`.
- Real authenticated storage already exists at `POST /api/records/:id/attachments`.

### Implementation plan

1. Retain validated `File` objects and present them as staged files with removal and unsaved-change protection.
2. Create the record, then upload every staged file through the existing attachment API.
3. Make partial failure recoverable: retain the created record ID and failed files for retry, and never report full success while an upload failed.
4. Stop treating the legacy filename field as proof of an attachment; avoid destructive historical migration in this ticket.
5. Cover normal Delivery creation, Draft creation, and Accounting Collection creation while preserving magic-byte and 10 MiB checks.

### Acceptance criteria

- [ ] Selecting files stages them locally and sends no upload before Save/Submit.
- [ ] After success, every selected file is a persisted `PodAttachment` and survives reload/list/download.
- [ ] Partial upload failure identifies the created record, retains a retry path, and does not create a duplicate record on retry.
- [ ] Unsupported, oversized, and counterfeit image files remain rejected.
- [ ] Delivered completion still requires a server-verified stored JPG/PNG.
- [ ] Sales Coordinators do not gain dispatch fields; Logistics remains read-only for RMA.
- [ ] Focused client tests, server attachment tests, Accounting Collection coverage, and UAT A-2.6 pass.

### Out of scope

Offline Driver behavior, digital signatures, PDC/2307 capture, public file URLs, and completion-rule changes.

### Handoff

Report changed files, upload failure/retry behavior, test output, and manual reload verification.

---

## AUD-002 - Lock Microsoft SSO to approved accounts and validate OAuth state

**Type:** Security bug
**Modules:** Authentication, Administration
**Access:** All
**Priority:** P1 Critical

### Problem and evidence

The Microsoft authorization flow does not generate/validate OAuth `state`, and the callback creates unknown identities as active Sales Coordinators. See `server/src/routes/auth.ts`: authorization URL generation, callback, and unknown-user creation.

### Implementation plan

1. Generate cryptographically random, short-lived state bound to the browser in an `httpOnly` secure cookie/session value; validate it before code exchange and prevent replay.
2. Require a configured corporate tenant in production; reject unsafe defaults unless explicitly approved.
3. Allow Microsoft login only for pre-provisioned active users. Never auto-create an active operational account from callback claims.
4. Bind Microsoft OID through a reviewed collision-safe path; do not take over a password account by email claim alone.
5. Audit security outcomes without logging codes, state, tokens, or secrets.

### Acceptance criteria

- [ ] Missing, expired, mismatched, and replayed state fail before token exchange or database writes.
- [ ] Unknown and inactive identities cannot obtain a session or create a user.
- [ ] A pre-provisioned active user in the configured tenant can sign in.
- [ ] Production rejects unsafe tenant configuration.
- [ ] Tests cover success, state failures, unknown/inactive users, identity collisions, and production config.

### Decision needed

**Blocking decision:** approve the corporate tenant ID and pre-provisioning/OID-binding policy **before enabling Microsoft SSO in production**. State-validation and safe test scaffolding can be developed in parallel without choosing an identity policy implicitly.

---

## AUD-003 - Add CSRF protection, rate limits, and baseline HTTP security headers

**Type:** Security development
**Modules:** All
**Access:** All
**Priority:** P1 Critical

### Problem and evidence

Production uses an `httpOnly`, `Secure`, `SameSite=None` cookie while mutations lack CSRF validation. Login, mail, and upload routes lack throttling, and baseline headers/CSP are not configured in `server/src/index.ts`.

### Implementation plan

1. Confirm deployed same-site topology. Prefer same-origin routing with `SameSite=Lax`; otherwise use server-issued CSRF tokens for all mutations.
2. Validate `Origin`/`Sec-Fetch-Site` as defense in depth and document approved origins.
3. Add separate limits for login, Microsoft auth, mail, uploads, and a conservative global API limit.
4. Add Helmet/equivalent headers and a CSP compatible with Vite and the approved Teams embedding policy.
5. Return consistent `403`/`429` errors and preserve API contracts.

### Acceptance criteria

- [ ] Cross-site mutations without valid CSRF evidence produce no database, storage, or email change.
- [ ] Approved same-origin and Teams flows work.
- [ ] Abuse of login, mail, and upload routes returns `429`.
- [ ] Production-like responses have verified headers/CSP.
- [ ] Tests cover origins, tokens, throttling boundaries, proxy IP behavior, and role smoke flows.

### Decision needed

**Blocking decision:** confirm the deployed API/frontend origin topology and Microsoft Teams framing/embedding requirements before choosing cookie SameSite behavior and CSRF/CSP policies. Implement conservative protections and tests without relaxing cross-site defenses.

---

## AUD-004 - Let Sales Coordinators manage the Company master

**Type:** Feature
**Modules:** Customers, Deliveries, Sales Orders, Procurement Pick-up, Accounting Collection, RMA
**Access:** Sales Coordinator, Admin
**Priority:** P2 High

### Problem and evidence

Records require a `Company`, and the server permits Sales Coordinator/Admin creation, but the client has no Company-management workflow or mutation. The Customers directory writes a separate `Customer` entity that cannot be selected on records.

### Implementation plan

1. Add a clearly named Company management entry point for Sales Coordinator and Admin.
2. Add client query/mutation support and an accessible form for name, SAP number, address, and contact person.
3. Implement edit only under an approved contract; otherwise make the limitation explicit.
4. Establish normalized duplicate/SAP uniqueness behavior and actionable conflict errors.
5. Refresh selectors so a new Company is immediately selectable.
6. Audit master-data changes with the authenticated actor.

### Acceptance criteria

- [ ] Sales Coordinator/Admin can create a Company in the portal and immediately use it on a record.
- [ ] Logistics, Driver, and TASS gain no Company write access.
- [ ] Customer and Company entities remain visibly distinct.
- [ ] Invalid/duplicate submissions preserve entered data and show actionable errors.
- [ ] Creation/edit audit identifies actor and values.

### Decision needed

**Before implementing edit/duplicate handling:** approve whether Company names or SAP numbers must be unique, how conflicts are resolved, and which roles can edit existing Company master records. The existing SC/Admin-only create API does not resolve these business rules.

### Out of scope

Automatic Company/Customer merging, SAP integration, and historical ownership rewrites.

---

## AUD-005 - Replace the hard-coded Account Manager picker with stable identities

**Type:** Feature
**Modules:** Deliveries, Sales Orders, Accounting Collection, Administration
**Access:** Sales Coordinator, Admin
**Priority:** P2 High

### Problem and evidence

`client/src/data.ts` hard-codes Account Managers. Records store a free-text name, the directory aggregates those strings, and completion-email lookup relies on name matching. Renames, inactive staff, and spelling differences can break ownership and email routing.

### Required decision

Decide whether Account Managers are `User` records, a dedicated master entity, or both.

### Implementation plan

1. Add a stable relation plus a historical display snapshot.
2. Replace hard-coded selectors with active server-managed identities.
3. Migrate exact unique legacy values and report ambiguous/unmatched values without guessing.
4. Route notifications by stable active identity, not name matching.

### Acceptance criteria

- [ ] Roster changes require no frontend release.
- [ ] Renaming preserves ownership and notification routing.
- [ ] Inactive managers remain visible historically but cannot be newly assigned.
- [ ] Ambiguous legacy names remain unlinked and appear in a review report.
- [ ] Directory totals and drill-downs use stable identity and respect record scope.

---

## AUD-006 - Add a managed vehicle fleet and prevent conflicting dispatch assignments

**Type:** Feature
**Modules:** Driver Tools, Deliveries, Calendar
**Access:** Logistics, Admin
**Priority:** P2 High

### Problem and evidence

Vehicles are hard-coded frontend strings. The API accepts arbitrary values and does not detect overlapping Driver, Assistant, or vehicle assignments.

### Required decisions

Define date-only versus time-window scheduling, warn versus block behavior, override authority/reason, capacity fields, and whether assistants may be double-booked.

### Implementation plan

1. Add a stable, active/inactive Vehicle master with approved capacity fields.
2. Link records by vehicle ID while preserving a historical label.
3. Enforce approved Driver/Assistant/Vehicle conflicts transactionally and safely under concurrency.
4. Surface non-leaking conflict details in Dispatch, Driver Board, and Calendar.
5. Audit any approved override.

### Acceptance criteria

- [ ] Only active managed vehicles can be newly assigned.
- [ ] Conflict rules are consistent across API and Logistics views.
- [ ] Concurrent conflicting assignments cannot both commit unnoticed.
- [ ] Inactive vehicles remain readable historically.
- [ ] Existing Driver identity and RMA restrictions remain intact.

---

## AUD-007 - Link Suppliers and SKU line items to operational records

**Type:** Feature
**Modules:** Suppliers, Procurement Pick-up, SKU Master, Inventory, Deliveries, RMA, Sales Orders
**Access:** Sales Coordinator, Logistics, Admin
**Priority:** P2 High

### Problem and evidence

Suppliers are not linked to Procurement Pick-ups. Line items store free-text SKU/quantity without Product identity, serial/price fields, or inventory movement. The existing directories do not provide end-to-end traceability.

### Required decisions

Define which categories/lifecycle transitions affect stock, movement type, partial/serial/price/location requirements, and whether one record may use multiple Suppliers.

### Implementation plan

1. Add nullable/backfillable Supplier and Product relations while retaining legacy text.
2. Add permitted read-only lookups without granting SKU management.
3. Add Supplier update/deactivation, validation, uniqueness, and audit behavior.
4. Add idempotent transactional inventory ledger entries for approved lifecycle events.
5. Backfill exact unique matches and report ambiguous/unmatched rows.

### Acceptance criteria

- [ ] Procurement Pick-up persists stable Supplier identity across rename/deactivation.
- [ ] Line items select stable SKUs without granting unauthorized writes.
- [ ] Approved lifecycle events post exactly one auditable inventory movement per item.
- [ ] Negative stock, duplicate posting, and unauthorized mutations are rejected.
- [ ] Legacy data remains readable and ambiguous values are not guessed.

---

## AUD-008 - Replace unbounded record loading with server-side pagination and filters

**Type:** Development
**Modules:** All operational modules, Dashboard, Reports
**Access:** All roles
**Priority:** P2 High

### Problem and evidence

The main records query requests no limit; primary screens then filter and paginate the entire readable history in the browser. This will degrade startup, memory, filters, and exports as data grows.

### Implementation plan

1. Define a stable cursor response with rows and `nextCursor`/`hasMore`.
2. Add server filters for category, effective state, date range, search, driver, area, Account Manager, priority, and dashboard presets, always intersected with `recordScope`.
3. Include filters/cursor in TanStack Query keys and use appropriate previous-data/infinite-query behavior.
4. Give dashboards, calendars, directories, and exports purpose-built paged/summary endpoints.
5. Make exports explicitly fetch all authorized pages or use a bounded server job/stream.
6. Add indexes only after PostgreSQL query-plan evidence.

### Acceptance criteria

- [ ] Ordinary screens make bounded requests and do not download full history.
- [ ] Search/filter/sort pagination is deterministic with no skipped/duplicate records.
- [ ] Counts, Calendar, Account Manager totals, and exports remain complete.
- [ ] Permissions cannot be bypassed through filters or cursors.
- [ ] A 10,000-record fixture meets an agreed latency/memory target.

---

## AUD-009 - Make client, server, and role E2E suites authoritative CI gates

**Type:** Development
**Modules:** All
**Access:** All
**Priority:** P2 High

### Implementation status — Done, merged 2026-10-13

- [PR #140](https://github.com/MarcZxc1/Supply-Chain/pull/140) merged into `dev` at [`5cd1608`](https://github.com/MarcZxc1/Supply-Chain/commit/5cd160873cb1ff2d4f132ed38929ad22bfecb8e4). It made the full client/server unit suites and isolated role Playwright tests CI gates, repaired the client Node environment import issue, and aligned the Logistics UAT assertions.
- [PR #142](https://github.com/MarcZxc1/Supply-Chain/pull/142) merged into `dev` at [`875612a`](https://github.com/MarcZxc1/Supply-Chain/commit/875612a363e5fb5611778bc81af4ba181b4292e5). It added a real stored PNG and completed-delivery fixture, made the three previously skippable priority/POD cases mandatory, and used **John Doe** as the default seeded Driver display name.
- The [final PR #142 hosted CI run](https://github.com/MarcZxc1/Supply-Chain/actions/runs/38335807676) **passed**: **142/142 server tests, 83/83 client tests, and 66/66 Playwright role/integration tests** (19 Sales Coordinator, 28 Logistics, 15 Driver, 4 integration), with zero skipped tests in those suites. Both TypeScript checks and builds passed. This is CI evidence for the completed ticket, not production UAT approval.

### Original problem and evidence (historical — fixed by the PRs above)

At the 2026-10-09 baseline, five client test files crashed on import because `client/src/api/availability.ts` accessed `import.meta.env` under Node. CI ran only the server seed-reset security test and two Logistics Playwright assertions were stale. Original baseline: client 13 pass / 5 fail, server 142/142 pass. These are **historical results**, not the current CI status.

### Implementation plan

1. Make environment access safe under Node without creating a second API-base behavior.
2. Add explicit root/workspace commands for complete client and server `node:test` suites.
3. Update Logistics B-1.2 to RMA and B-5.2 to assert retired Status History is absent.
4. Run full unit/HTTP suites on every PR and isolated role Playwright smoke/handoff tests with failure artifacts.
5. Add deterministic timeouts/open-handle cleanup and keep secrets out of artifacts.

### Acceptance criteria — verified in merged CI

- [x] Documented client tests pass with zero import-time crashes (83/83).
- [x] All server tests run in CI and failures block merge (142/142).
- [x] Logistics stale assertions match canonical UAT behavior (B-1.2 and B-5.2).
- [x] The Sales Coordinator -> Logistics -> assigned Driver journey is an isolated gate, using the John Doe demo account.
- [x] Documented suite commands match the CI workflow (`npm run test:server`, `npm run test:client`, and isolated Playwright role/integration commands).
- [x] Completed-delivery priority/POD checks A-3.9, B-2.5b, and C-3.2 execute and pass without a seed-data skip (PR #142).

---

## AUD-010 - Align report date filters with Delivery Date and completion Time Out

**Type:** Bug
**Modules:** Reports, Dashboard, Deliveries
**Access:** Sales Coordinator, Logistics, Admin
**Priority:** P3 Medium

### Problem and evidence

Operational lists use Delivery Date and completed-today uses Time Out, while status-history counts apply `dateFrom`/`dateTo` to `createdAt`. Equivalent visible ranges can produce conflicting totals.

### Required decision

Approve a matrix: scheduled operations use `deliveryDate`; completion reports use `timeOut`; creation/audit reports use `createdAt`/event timestamp.

### Implementation plan

1. Rename ambiguous parameters or require an explicit date field/report type.
2. Use Manila-day semantics for date strings and UTC ranges derived from Manila dates for timestamps.
3. Update count/export consumers and labels to state their date basis.
4. Preserve record scope, categories, and effective Draft/In Transit logic.

### Acceptance criteria

- [ ] Operational list and status totals reconcile for the same Delivery Date range.
- [ ] Completed-today uses immutable completion Time Out on the Manila date.
- [ ] Creation/audit date reports are explicit.
- [ ] Boundary tests cover Manila midnight, drafts, legacy Time In, and categories.
- [ ] Exports name their date basis and match the screen.

---

## AUD-011 - Externalize scheduled jobs and configure deployment health checks

**Type:** Development
**Modules:** Administration, Reports
**Access:** Admin
**Priority:** P2 High

### Problem and evidence

The 4 PM reminder, 6 PM end-of-day, and Monday weekly jobs use in-process timers. Restarts can lose runs and multiple API instances can duplicate them. `render.yaml` omits `healthCheckPath` even though `/api/health` exists.

### Implementation plan

1. Move jobs to the approved durable scheduler/worker with explicit Asia/Manila schedules.
2. Add unique execution records/idempotency keys by job and schedule window.
3. Separate job handlers from scheduling and test with an injected clock.
4. Configure `healthCheckPath: /api/health`; define dependency/config readiness and return `503` when unhealthy.
5. Remove duplicate/unreachable health routing and minimize public diagnostic detail.
6. Document retries, catch-up/missed runs, alerting, staging verification, and rollback.

### Acceptance criteria

- [ ] Restarts/host sleep do not permanently lose eligible work under the approved catch-up policy.
- [ ] Concurrent workers produce at most one logical job result per schedule window.
- [ ] Retries are idempotent and failures observable without exposing secrets.
- [ ] Render gates traffic on `/api/health` and unhealthy readiness returns `503`.
- [ ] Tests cover the three Manila schedules, retries, and concurrency.

### Decision needed

**Blocking decision:** choose the production scheduler/worker, catch-up window, retry/idempotency guarantees, and alerting owner. The health-path configuration is separable work; it does not by itself make in-process schedules durable.

---

## Notion Sync Procedure

When Notion capacity is available:

1. Create one database page per section using the title, priority, type, modules, access, problem, evidence, plan, acceptance criteria, decisions, and out-of-scope text above.
2. Search by exact title before creation to avoid duplicates.
3. Put the provisional `AUD-XXX` ID in each Notion page body.
4. Update the mapping table with the assigned `TSK-XX` number and page URL.
5. Do not copy `.env` values, credentials, tokens, or secret-bearing logs into Notion.
