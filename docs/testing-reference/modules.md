# Module capabilities and boundaries

Default profile: merged `dev` at `8660bde`. Read [payload recipes](payloads.md), [every endpoint](endpoint-catalog.md), [extracted types](payload-types.md) and [merged PR #240 changes](latest-pr.md) alongside this document. API paths below include `/api`. “Can” always means that the role, effective module/resource permissions and record ownership all pass; a role label alone is insufficient.

## 1. Authentication, session and server availability

**Features.** Email/password login; Microsoft initiation/callback/status; current-session restoration; logout; role-specific landing page; safe Back/Forward/deep-link routing; session-scoped query-cache cleanup; server-unavailable/reconnect UI. JWT stays in the httpOnly `mg_session` cookie, valid for eight hours. Each protected request reloads the active account, role, permissions and linked Driver profile from the database.

**Sends/receives.** Login sends `{email,password}` and receives a user/permission snapshot, Set-Cookie and `X-CSRF-Token`. `/auth/me` receives no JSON body and returns that snapshot (Driver authenticated responses can also expose `driverProfileId`). Logout returns `{ok:true}` and clears the cookie. Microsoft initiation returns `{url}`; callback is a redirect, not a JSON user response. Health returns `{ok,checks:{database,mailer,environment}}` with 200 or 503.

**Boundaries.** Inactive/deleted accounts and invalid/expired cookies fail 401. Microsoft requires configured corporate tenant, browser-bound unexpired one-use state and an explicitly Admin-approved tenant object identity; it never auto-creates users. Password login still exists when SSO is unavailable. A configured mail mode or mock send is not proof of real email delivery. Availability checks do not prove deployment/database identity.

**Tests.** Missing fields; invalid credentials; inactive user; expiry; logout with delayed `/me`; logout failure/retry; no prior-user cache leak; refresh a permitted detail URL; denied deep link; removed module during a session; Microsoft absent/mismatched/replayed state; 501 initiation without config; provider redirect failures; health failure/malformed response/reconnect. Do not assert a token in JSON or local storage.

Sources: `server/src/routes/auth.ts`, `server/src/middleware/auth.ts`, `server/src/services/sso*.ts`, `client/src/store/authStore.ts`, `client/src/routes/screenRouting.ts`, `client/src/api/availability.ts`.

## 2. Module permissions and navigation

**Features.** Admin edits explicit screen overrides. The server resolves defaults + overrides into `effectiveScreens`, allowed shared `resources` and `permissionVersion`. Sidebar, router, search and protected queries use the authoritative snapshot. The Drivers item groups View/Board/Manager while retaining independent grants. Sales Orders has a real screen key/deep link, but no dedicated sidebar item in this baseline.

| Role | Default screen keys |
| --- | --- |
| Sales Coordinator | `main`, `dashboard`, `deliveries`, `accounting_collection`, `procurement_pickup`, `sales_orders`, `customers`, `suppliers`, `am_directory`, `transactions` |
| Logistics | `main`, `dashboard`, all five record screens, `customers`, `suppliers`, `driver`, `driver_manager`, `calendar`, `driver_board`, `transactions`, `statistical_reports` |
| TASS | `main`, `dashboard`, `rma`, `procurement_pickup`, `accounting_collection`, `transactions`, `suppliers` |
| Admin | All catalog screens except standalone `driver_dashboard` |
| Driver | Only `driver_dashboard` |

**Payloads.** GET `/users/:id/permissions` returns `{userId,permissions,effectiveScreens,resources,permissionVersion,roleDefaults,catalog,editableScreens}`. PUT sends `{permissions:[{screen,granted}],expectedVersion}` and returns the refreshed editor. Empty permissions resets overrides. Duplicate/unknown screens or nonboolean grants fail 400; stale version fails 409.

**Boundaries.** Screen grants never confer Admin powers. Driver accounts cannot render arbitrary staff screens. SC/Driver cannot gain RMA through screen overrides; Logistics RMA remains read-only. Explicit category denial also limits aggregate record reads. TASS record scope is restricted to RMA/Accounting Collection despite its Procurement Pick-up default screen and dashboard counter: preserve this observed discrepancy as an open question.

**Tests.** Default/override/revoke combinations; concurrent editors; immediate server revocation; no API requests from a denied mounted page; browser refresh/back; an unlinked Driver owns no records; changing a name cannot transfer ownership; grants cannot bypass per-action roles. There is no Settings/Help Center route in the pinned `AppRouter`/screen catalog; historical closed tickets are not evidence that those screens survive the accepted staging replacement.

Sources: `server/src/services/permissions.ts`, `recordAccess.ts`, `transactionAccess.ts`, `client/src/routes/AppRouter.tsx`, `client/src/layouts/Sidebar.tsx`.

## 3. Main workspace and shared record list/detail

**Features.** A cross-category work overview plus category-specific list and detail workspaces; search; company/status/date/personnel/location filters; pagination; date sorting; dashboard drill-down chips; record creation/drafts; edit reasons; comments; append-only remarks; audit history; attachments; print/export. All five operation categories share `DeliveryRecord`, not five independent backends.

**Reads.** `/records` supports legacy arrays and paged envelopes. `/records/:id`, `/active-counts`, `/:id/audit`, `/:id/remarks`, `/:id/comments` provide detail and supporting views. Lists intersect request filters with server record scope. Default page limit 25, maximum 100; default cursor order `(createdAt desc,id desc)`. Date sort uses page/offset, excludes cursor combinations and places undated rows last.

**Writes.** POST creates Draft/Scheduled with server ID/actor; PUT updates role-specific metadata; PATCH status is a separate action; POST comments accepts `{body}`; DELETE record is deliberately disabled. Create form may copy prior company/AM details or duplicate record data, but must still create a new record and must not copy assignment/completion proof as valid new work.

**Boundaries.** Missing/out-of-scope record access commonly fails 403 at shared middleware before a handler's 404; do not force one universal not-found status. Some unsupported edit fields are ignored by role branches rather than rejected, so negative tests must reload and prove no unauthorized mutation. `allowed_statuses` describes the record graph and is not a complete role/action authorization policy. Legacy attachment filename fields are not stored bytes. Draft and Scheduled share the stored SCHEDULED enum and differ by `draft`.

**Input-quality gaps.** Generic line-item mapping accepts numeric quantities directly and otherwise uses `parseInt(...) || 1`; it does not establish a positive-integer quantity contract (a zero string can become1, while numeric zero/negative/fraction values take a different path). Amount uses `parseFloat` without the SKU-style finite/nonnegative validator. Test these as validation discrepancies and obtain intended rules rather than claiming accounting/quantity correctness from successful persistence.

**Tests.** Save/reload; select existing company; missing/unknown company; invalid calendar dates/priorities; status smuggling via PUT; metadata versus dispatch field separation; scope on every subsidiary URL; search/filters preserve role scope; 100+ matching records with tie timestamps; duplicate-free pagination; no record deletion by any role; unsuccessful actions cause no partial audit/remarks. Comments reject blank content and are stored oldest-first; remarks/audit are newest-first. Logistics cannot mutate an RMA by adding comments or files either.

Sources: `server/src/routes/records.ts`, `server/src/mappings.ts`, `client/src/features/deliveries/*`, `client/src/pages/MainView.tsx`.

## 4. Deliveries and dispatch lifecycle

**Features.** SC/Admin encode, save draft or submit an unassigned delivery. Logistics/Admin assign active Driver profile, vehicle and assistants after submission. Assigned Driver starts with Time In, uploads actual proof, records recipient and completes. Staff can hold/reschedule, correct existing clocks and link Accounting Collection according to their role.

**Requests.** Create uses `{company_id,category:"Deliveries",reference,delivery_date,...}`. Assignment uses PUT `/:id` with `{driver_id,vehicle,driver_assistants,remarks}`. Time In uses POST `/:id/time-in` with `{remarks}`. Completion uses PATCH `/:id/status` with `{status:"Delivered",remarks,received_by}` after upload. Responses are full serialized records. Rescheduling by Logistics/Admin sends the new `delivery_date` in the same status request.

| Effective state | Graph candidates before prerequisites/role checks |
| --- | --- |
| Draft | Scheduled |
| Scheduled | On-Hold, Rescheduled, Draft |
| In Transit | Delivered, Pending, On-Hold, Rescheduled |
| Pending | Delivered, On-Hold, Rescheduled |
| On-Hold | Scheduled, Delivered, Pending, Rescheduled, Draft |
| Rescheduled | Scheduled, On-Hold, Draft |
| Delivered | None |

**Additional controls.** Only Time In enters In Transit. Time In requires submitted record, driver, eligible Scheduled/Rescheduled state, nonblank remarks and no existing Time In. Pending/Delivered require a valid Time In. Draft/Scheduled return options are suppressed after Time In. SC status powers are submit/return drafts only. Driver owns only assigned non-drafts and future Deliveries are read-only until the Manila date (overdue work is actionable; legacy already-started work follows its stamp). Delivered requires saved, server-decoded JPG/PNG, recipient, remarks and valid Delivery Date. Completion stamps server Time Out, `completed_late`/`days_late`, audit and remarks atomically.

**Corrections.** PUT timestamp correction only for Logistics/Admin, existing timestamp only, full ISO timezone required, Time Out cannot precede Time In, edit reason required. Client-supplied Time In/Out on PATCH status fails 400. Delivered priority is locked. Delivery reschedule date must exist, differ from current date and not be in the Manila past; it clears prior attempt clocks/recipient. Delivery can be linked only to an accessible Accounting Collection; unauthorized linked data is redacted from current and historical views.

**Side effects.** Non-draft creation notifies Logistics. Submitting an unassigned Delivery draft notifies Logistics. First Logistics assignment notifies the record creator. Completion invokes accomplishment email handling; Accounting Collection completion separately notifies TASS. These hooks are not all inside the record transaction: test failure/retry and avoid assuming business write rollback when a subsequent notification fails.

**Tests.** Complete SC → Logistics → assigned Driver handoff; Driver A versus B direct requests; draft assignment rejection; ambiguous/inactive Driver selection; midnight/future/late behavior; impossible or missing reschedule date; spoofed or deleted proof; concurrent upload/delete/complete; no premature Time Out; one server-attributed completion; redacted linked record after permission change.

## 5. RMA

**Merged features.** TASS/Admin own entry, drafts, submission, edits, priority, optional manual document reference, attachments and permitted lifecycle controls. Logistics can locate saved RMA records and print all fields, but every mutation is denied. SC and Driver cannot discover RMA through lists, search, detail, audits or Transaction Center. Handoff is the saved list, not a new approval status.

**Payloads.** Creation requires `company_id`, `category:"RMA"`, `priority`, `area`, `account_manager` even for drafts. `rma_reference` is optional text; the legacy `reference` response aliases that document reference, and `legacy_sap_reference` stays separate. RMA details include `rma_type`, optional `purchase_date`, and optional `customer_contact_name/email/phone`. PUT must use `rma_reference`, not `reference` (400).

**RMA categories.** `Sales Orders`, `Return to Customer`, `Return to Supplier`, `Pull-Out Slip`, `Advance Replacement Demo`, `Pick-Up`, `Others`. Old `Pull out`/`Return to suppliers` labels normalize on read. Nonempty purchase date must be a valid date-only string; nonempty contact email must validate. The sampler/UI restrict RMA item types to Small Item/Unit; the generic `rmaInputError` does not enforce that item-type enum. Test each entry point rather than assuming identical validation.

**Current lifecycle.** Merged #240 gives TASS/Admin a separate RMA state graph. Completion uses one status request with nonblank remarks and recipient/collector; it needs no internal Driver, Delivery Time In, scheduled date or POD photo. The server records `time_out` as Completed at with actor/audit/remarks atomically. RMA rescheduling preserves historical clocks; Scheduled RMA is not inferred In Transit from an old stamp. See [the complete graph and payload](latest-pr.md). Supplier identity/collection workflow from #231 remains outside #240.

**Tests.** All role boundaries at UI/API and subsidiary URLs; manual reference preserved through reload and exports; optional values/nulls; category normalization; required draft fields; historical SAP/reference separation; contact/date fields persist without guessing missing historic values; completed graph tests selected by profile. Confirm #230 contact source/requiredness and document behavior before calling that feature accepted.

## 6. Accounting Collection

**Features.** A dedicated list/workspace for records, collection amount, linked delivery context, run completion evidence and one-time TASS collection verification. TASS reads Accounting Collection and verifies accomplished records; this does not give TASS ordinary edit or status rights for that category.

**Payloads.** Standard record creates/updates use `category:"Accounting Collection"`, `reference`, `delivery_date`, optional `amount` and details subject to record roles. PATCH `/:id/verify-collection` sends no JSON body; response adds `collection_verified:true`, verifier name and server time. The action requires TASS, an Accounting Collection and stored ACCOMPLISHED status; duplicate verification is 400. Admin is not included in this endpoint's role guard.

**Side effects/boundaries.** Verification updates the record, then writes audit and notifies its creator; these are separate awaited operations, not one transaction in this handler. TASS PUT/status mutations for non-RMA are denied. Client views and the server's record-write guard are distinct. Missing/scope-denied IDs may fail shared access first.

**Tests.** SC creation → Logistics assignment → Driver completion → TASS verify; wrong category; not Delivered; duplicate request; Admin/SC/Logistics rejection; audit actor/time; actual persisted state if downstream audit/notification fails; simultaneous verification requests must be tested as a concurrency risk, not assumed atomic.

## 7. Procurement Pick-up

**Features.** Operational category for our team collecting goods from a supplier. Uses shared record list/forms, assignment, run lifecycle, remarks, attachments and exports. It is a movement direction, not a supplier collecting an RMA from us.

**Payloads.** Standard record shape with `category:"Procurement Pick-up"`; same create/date/reference and state prerequisites in the generic handlers. There is no explicit supplier relationship/movement-method field in the record serializer. Supplier directory lookup does not establish a persisted supplier-to-record link.

**Boundaries/tests.** Verify allowed role/screen/category combinations, especially TASS's screen-versus-record-scope discrepancy. Check no automatic supplier/RMA misclassification. A dedicated physical-receipt action, partial receipt and inventory posting are not established by this category's name; see #239 requirements.

## 8. Sales Orders

**Features.** A real shared record category accessible through its screen/deep links, the Main view and permitted navigation/search. It uses record forms, drafts, scheduling, supporting data and exports; there is no separate Sales Order API/database workflow.

**Payloads/boundaries.** `category:"Sales Orders"` with the common record payload. This does not imply pricing, tax calculation, line-level stock allocation, order approval, automatic conversion to Delivery or invoice generation. `line_items` are simple `{sku,quantity}` rows; no inventory reservation is performed by record creation.

**Tests.** Deep-link/list category identity, role scope, draft validation, line-item persistence/replacement and export. Record-to-inventory effects should be absent unless a separately implemented feature establishes them.

## 9. Attachments, POD and document preview

**Features.** Actual file upload after record creation, list, proof-photo verification, in-app preview, authenticated streaming download and authorized removal. Form selection can stage Files locally; creation then uploads bytes to the created record. A partial upload failure should retain the created ID and permit file-only retry without duplicate record creation.

**Payloads.** Multipart POST `/:id/attachments`, field `file`; JSON response `{id,name,mime_type,is_photo,size,uploaded_at,download_url,preview_url}`. GET list returns that array. DELETE optionally sends `{remarks}` and succeeds with 204/no body. Download/preview return binary bytes and headers, not base64 JSON. Preview supports valid images, PDF, DOCX; legacy DOC returns 415 and remains downloadable.

**Limits.** Maximum file 10 MiB (10 × 1024² bytes), 10 attachments/record, 50 MiB total/record. PDF, JPG/JPEG, PNG, DOC, DOCX accepted; DOCM rejected. Bytes are validated, not filename/MIME alone. Quotas are checked under record lock before storage. Uploads quarantine to disk and clean up on failure; object storage gets compensating removal if DB metadata/commit fails. Existing over-quota records stay readable/deletable but cannot accept more files until below limits.

**Ownership.** Driver uploads to assigned non-drafts only; future Delivery restrictions apply. TASS uploads/removes RMA documents only. Logistics cannot upload/delete RMA documents. Driver cannot remove an attachment via DELETE. Deleting the last valid proof photo from an accomplished non-RMA record is rejected with409. Merged #240 exempts RMA because its attachments are optional completion evidence.

**Tests.** Exact byte limits, 11th file/total-size edge, concurrent quota pressure, spoofed images/documents, missing actual storage bytes, download headers/length, safe inline headers, cross-record attachment ID, denied role, cancellation/partial failure, storage outage, retry without new record, last-photo replacement, DOCX HTML sanitization and external-resource isolation in the preview client. A 201 metadata response alone does not prove preview/download bytes work.

Sources: `records.ts`, `services/attachmentRules.ts`, `podPhotos.ts`, `podStorage.ts`, `client/src/utils/recordAttachments.ts`, `components/PodAttachmentPreview.tsx`.

## 10. Driver View, Board, Manager and standalone Driver Dashboard

**View/Board.** Staff inspect runs by Driver/date/area, unassigned work, workload and status; perform allowed assignments and run actions through record endpoints. Board editing must preserve per-record scope and report failures. Batch UI actions are multiple record requests unless an explicit batch transaction endpoint exists; no such endpoint is registered here. Do not claim all-or-nothing batch save.

**Manager.** GET `/drivers` returns active roster; `?all=1` includes inactive entries. Each row has `{id,name,type,coverage_areas,is_active,is_linked,...}`; only Admin sees `linked_user` identity details. Admin creates Drivers; Logistics creates Assistants only. Logistics may update permitted coverage/status/assistant details, while Driver renames/type changes are Admin-only. DELETE is audited deactivation (204), not hard deletion.

**Coverage.** Canonical area/subregion names; exact area matching and explicit subregion coverage, not substring/fuzzy matching. A single covered area does not imply coverage of its whole subregion. Assignment suggestions use coverage; verify any further action restrictions in `driverDirectory.ts` rather than treating a suggestion as authorization.

**Identity.** Only Admin user endpoints link/unlink a login to a stable Driver profile. Roster payloads with `user_id`, `userId` or `linked_user_id` are rejected (Admin 400, Logistics 403). Reads do not seed historical Drivers or silently rename profiles. Directory locks protect assignment against rename/deactivation races. Standalone Driver app uses linked profile ID, shows only assigned non-drafts, offers Time In/proof/recipient/status actions and map navigation; it has no general staff navigation or inventory access.

**Tests.** Unlinked profile; same display names; rename stable IDs; inactive and linked profiles; coverage boundaries; Driver/Assistant permissions; historical run preservation on deactivate; login relink updates ownership without transferring via name; Board accessible tabs and save failure; assigned Driver A/B API isolation; mobile capture and navigation URL encoding.

## 11. Customers, Companies and Suppliers

These are distinct directories; do not interchange their IDs. Operational record `company_id` links Companies, not Customers or Suppliers.

**Companies.** GET array `{id,name,sap_number,address,contact_person,created_at}`. POST SC/Admin `{name,sap_number?,address?,contact_person?}` returns 201 row. Name truthiness is checked; this route does not implement the richer Customer validator. No update/delete endpoint.

**Customers.** List, create, detail UI, edit and audit. API create includes SC/Logistics/Admin/Driver, but effective customer resource is still required (a default Driver does not have it). TASS denied. Edit/audit only SC/Logistics/Admin. Fields: name/contact person/email/phone/address/city. Create requires nonblank trimmed name; limits 120/120/254/30/300/80 respectively; optional email validates if present, phone permits numbers/spaces/+()-.; reason on edit 1–1000 characters. PUT adds `remarks` and `expected_modified_at`; stale timestamp is 409, no effective change 400, field errors `{error,fields}`. Create and update audit snapshots are transactional. Customer history is keyed by stable company relationship logic where available, not only matching display names. No Customer DELETE.

**Suppliers.** List/create; contact details, category filtering and read-only workspace. POST SC/Logistics/Admin/Driver plus supplier resource/screen; TASS can read by default but cannot create through this guard. API requires name and category and does not whitelist categories or apply Customer email/phone validation. No edit/delete endpoint. Any UI-only form constraints are not stronger API guarantees. No supplier login, automated supplier notification agreement or explicit record link is implied.

**Tests.** Correct directory IDs; all role/resource combinations; create->reload; customer whitespace/length/email/phone/optimistic concurrency; duplicate/no-op edits; audit before/after values; stable history links; supplier invalid category as a current validation gap; no invented CRUD methods.

## 12. SKU Master, Inventory and warehouse locations

**Features.** Product list/search/category filters; SKU detail, prices/costs/reorder point; on-hand/allocated/available-to-promise (ATP); recent stock transactions; Admin catalog create/edit/audit; authorized stock adjustment; location/bin grouping and warehouse exports. Warehouse views derive bins/zones from `inventory.warehouse_location`; no warehouse master CRUD API exists.

**Payloads.** POST `/skus` `{sku_code,name,category,unit_cost,unit_price,reorder_point,description?,warehouse_location?}` creates product plus zeroed inventory in one transaction, returns 201 `ApiSku`. PUT catalog fields is Admin-only. GET detail includes latest 20 transactions; list returns `recent_transactions:[]`. `atp = on_hand_qty - allocated_qty`. POST `/:id/adjust` `{type,qty_change,reference}` returns full SKU + recent transactions.

**Limits/roles.** SKU category A/B/C. Code/name trimmed nonblank; costs/prices finite nonnegative; reorder point nonnegative integer <= 2147483647. Numeric strings are accepted by server conversion for these values. Adjustment type Goods Receipt/Sale/Adjustment/Transfer; nonzero signed integer delta with abs <= 2147483647, nonblank reference, balance 0..2147483647. Logistics adjustment additionally requires the `inventory` screen, which it does not have by default. Transaction Center gives staff SKU read resource without SKU management rights. Adjustments lock product/inventory rows and atomically persist balance, transaction and audit.

**Boundaries.** Adjustment label does not automatically dictate delta sign; handler applies signed delta as provided. Transfer does not atomically move between bins/warehouses. Operational Delivery/Sales Order line items do not decrement/allocate inventory. SKU update accepts/validates warehouse text through the shared validator but the update handler does not persist warehouse relocation; test rather than assuming move support. There is no delete-SKU endpoint.

**Tests.** Create zero balance; duplicate code 409; invalid/overflow numbers; signed direction; unauthorized adjustment despite SKU read access; concurrent deductions cannot oversell; audit failure rolls back stock; ATP/null inventory; last 20 ordering; bin grouping and low-stock <= reorder threshold. Inventory-missing legacy row is a special integration fixture: handler does not create a missing inventory row on adjustment, so do not claim repair behavior.

## 13. Transaction Center

**Features.** Read-only unified operational/inventory activity, source/category/status/date filters, pagination and drill-down timeline/product related transactions. GET `/transactions` returns `{page,limit,total,pages,transactions}`; `/:source/:id` returns source-specific detail. No transaction write endpoint.

**Role boundaries.** SC: Delivery/Procurement/Sales Orders; Logistics: Delivery/RMA/Procurement; TASS: RMA/Accounting Collection; Admin all. Driver may access only scoped operational API reads with valid linked identity and driver-dashboard permission, not inventory or the staff screen. Intersect all with module and record scope. Inventory rows only Admin/SC/Logistics with SKU resource. Explicit inventory source for other roles fails 403.

**Payload differences.** Source `delivery` returns display category in `type` but stored enum in `status` (e.g. ACCOMPLISHED). The record reference is raw `record.reference`, unlike serialized RMA's manual-reference alias. Inventory rows have null status, signed delta/balance, no creator name, and a date-only field derived from transaction date. Do not normalize away these differences in contract tests; identify any desired changes separately.

**Limits/tests.** Page >=1 and limit 1..100 are clamped, not validated like record-list limits. Unknown source is 400; inaccessible detail 404. Related inventory detail returns latest five other product transactions. Test all/all-source visibility, category grants/revokes, ID guessing and linked audit redaction. Inventory date filtering uses server-local `setHours` for upper bound, while operation reports use explicit Manila semantics; test timezone boundaries as a known inconsistency. `status` filter currently targets stored operational status, not inventory.

## 14. Role dashboards, Calendar and AM Directory

**Dashboard API.** `/dashboard/stats` returns a role-discriminated object. SC gets scheduled-today/unassigned/held/rescheduled/accomplished-today. Logistics gets assigned-today/unassigned/completed-today/held-or-rescheduled. TASS gets open/held RMA, pending procurement, unverified collections/verified-today. Admin gets active users/breakdown, records this Manila week, unverified collections, today's audit count, stored-status chart and ten recent audits. Driver defaults to standalone client workflow; the stats fallback is `{role}`, not the staff KPI DTO.

**Boundaries.** Dashboard count queries are role-specific and do not universally apply `recordScope()` to every count. Explicit permission revocation may differ from list drill-down counts; test and track this instead of assuming aggregates hide every denied category. Today's completions use Time Out and Manila day boundaries, not record creation or scheduled date. Admin weekly count starts Sunday Manila. Admin chart uses stored status (Draft can be grouped with SCHEDULED).

**Calendar.** GET `/records/calendar-summary?dateFrom&dateTo` validates date range, applies record scope and returns at most 500 serialized rows ordered by scheduled date/ID. Calendar links open correct category+record. This is a bounded summary, not an exhaustive export for arbitrary large windows.

**AM Directory.** GET `/records/am-summary` aggregates scoped records by AM string (`Unknown` fallback), totals/status counts and sorted unique company names; there is no independent AM master CRUD. AM expanded/detail records must stay scoped. Draft counts contribute to its scheduled bucket; In Transit contributes to total but no dedicated metric. PR #240 adds category to normalization so old RMA stamps do not misclassify AM/history results.

**Tests.** Role DTO shapes and exact fixture counts; chart/drill-down cohort agreement; no double-counting union flags; UTC/Manila midnight, Sunday and cross-year boundaries; revoked category versus aggregate mismatch; calendar 500 cap; AM name grouping, no false company-name joins and no fabricated master updates.

## 15. Statistical reports, exports, route slips and monthly Driver reports

**Statistical API.** GET `/reports/summary` requires `statistical_reports` screen, applies record scope and supports category/area/Driver/status plus `deliveryDateFrom/To` (or legacy aliases, not mixed). Returns totals/accomplished/on_hold/pending/completion_rate and grouped status/category/top-ten-area/Driver counts. `completed_in_range` independently counts Time Out completion dates; it is not necessarily a subset of the scheduled-date cohort.

**Record export.** Generic CSV/Excel/PDF/Word outputs, comprehensive summaries, document sizes and current/lifetime-trail variants where exposed. Dates remain explicit business-date metadata. Full export fetch traverses server pagination; other export utilities can still consume caller-provided arrays and should not be assumed exhaustive.

**Merged PR #238 route slips.** Both dedicated and Driver-filtered general export paths share Single day, From date onward, From–To range controls with table dates. Driver-filtered general menu produces route-slip Excel/PDF/Word; CSV remains ordinary row export. Single-day maps both bounds equal; From has no upper bound; range requires both bounds. Whole scheduled Manila days, inclusive ends, excludes undated rows. Fetch all filtered pages (limit 100/cursor), preserve active category/status/search/location/AM/Driver/dashboard filters, group by actual Driver names (partial “Alex” search is not the printed Driver). No assigned-driver rows produces a visible error, no artifact. File heading shows Period, not generation day.

**Trail boundary.** Current counts reflect present status; trail counts each record's lifetime-ever-held statuses, so sum can exceed record count and is not “events inside the chosen period.” Per-record audit fetch currently falls back silently to current status on non-OK/error; do not assert complete history under an audit outage. All-page/open-ended exports can trigger many audit requests; include realistic-volume/error tests. No server-generated route-slip endpoint exists.

**Monthly Driver report.** Logistics/Admin Deliveries entry point; month/year, format CSV/Excel/PDF/Word, current/trail and document size. Produces performance, departure/arrival buckets, area, vehicle and remarks sections (Excel has report+summary sheets). It consumes the supplied records; #238's dedicated route-slip pagination fix does not prove all monthly-report inputs fetch all pages. Validate timezone/month boundaries and artifact fidelity separately. Browser-native download and external Office/PDF rendering need artifact inspection beyond JSDOM string matching.

**Single-record manifest/print.** Workspace fetches the permitted record's audit, remarks, comments and attachments, then calls browser `printSingleManifest(...)` to generate PDF with saved fields and documentation trail. RMA uses an “RMA Document Record” table containing the manual and legacy references, category, contact/purchase fields, all other saved fields and line items. This is not evidence of three separately approved POL/RTS/RTC template layouts or server-generated files. The utility also supports a Driver-day manifest, but verify the caller/input completeness before asserting a visible workflow. Company address lookup in the ordinary manifest currently matches Company name; include duplicate-name fixtures to expose a wrong-company lookup rather than assuming stable-ID matching everywhere. Printing may show an older field label (e.g. Time Out) even when #240's RMA workspace labels it Completed at.

**Tests.** Three period modes × formats × one/multiple Drivers × current/trail; same inclusions/labels across formats; invalid/empty/inverted period; 101+ matching rows; hidden cached nonmatching record; error UI and retry; status-trail failure handling; keyboard Escape/focus; mobile menu and long headings; monthly detail/summary reconciliation; generated document text/layout and no unauthorized data. No export operation should mutate lifecycle/receipt.

## 16. Notifications, comments and output actions

**Bell.** GET `/notifications` returns newest 50 for signed-in user. Unread count counts all unread, not only those 50. PATCH one validates owner (other user's ID is 404); PATCH read-all marks caller's unread only. Navigation follows record type/category and current permission checks. Mark-read response `{ok:true}` is not proof a referenced record remains accessible.

**Email.** POST `/notifications/send-email` requires authentication and records resource plus accessible target record, sends `{recordId,trigger,recipients:["AM","LOGISTICS","TASS"]}`. Returns `{ok:true,sent,failed,resolvedCount}`. AM resolves active users by AM name, then surname fallback; roles resolve active users. Trigger has predefined subject cases with fallback text. Unknown recipient labels resolve no addresses. No strict trigger enum or deduplication guarantee; a valid HTTP 200/ok can have zero resolved recipients or failed sends. Log mode distinguishes SENT/MOCKED/FAILED.

**Output configuration.** Browser-persisted Zustand defaults for notifyAM/Logistics/TASS, exportPDF, internalOnly; ticking “Do not notify” negates the positive flags. InternalOnly clears recipients and PDF output. This is not a server-owned shared organization configuration. Business mutation, automatic server notify and client-triggered output action are separate effects; verify that retry does not duplicate successful changes or mail.

**Output claims are not delivery evidence.** `runOutputActions()` can produce “Email sent/Exported to PDF” messages without a successful provider result or a PDF-generation call. Record creation invokes it without a record ID/API adapter, and returned output logs are not a server-persisted history contract. The helper itself does not generate PDF. Test the actual send/download and server audit/notification, not just a banner or `emailSent` flag. `getOutputTrigger()` maps Accounting Collection Delivered to the string “Collection Verified,” which must not be confused with TASS's separate verification mutation.

**Tests.** Ownership; >50 notifications/count consistency; double mark-read; inaccessible target navigation; AM missing/ambiguous/surname fallback; zero recipients resolved; partial failure; mocked send not accepted as inbox proof; notification/email failure after successful record save; persisted default migration; browser-session setting isolation expectations. Comments/remarks contracts remain in shared records, not a general chat system.

## 17. Administration, integrations, audit and diagnostics

**User features.** List/create/update role/name/email; deactivate/reactivate; safe delete; Driver login/profile linking; Microsoft identity approval/unlink; module override editor. All `/users` actions require Admin + users resource. Password hashes/OAuth tokens never returned. Create Driver can link an existing unlinked active profile or create a new profile atomically. Changing Driver role away from DRIVER unlinks ownership. Admin cannot demote/deactivate/delete self.

**Payloads.** User create `{name,email,password,role,driver_profile_id?,microsoft_oid?}`; updates `{name?,email?,role?}`. Profile link `{driver_profile_id:string|null}`; identity link `{microsoft_oid:guid|null}`. Responses vary: full Admin user row, `{user_id,driver_profile}` or `{user_id,microsoft_linked}`. Duplicate email/OID/profile links fail conflict. Safe deletion rejects linked business/audit data with 409 and `linked_records`, otherwise returns `{ok,deleted_id}`.

**Validation boundaries.** User PATCH validates nonblank name and email format; user POST checks presence/role/identity/profile but does not enforce the same email-format/strong-password policy in its route. Do not claim strict account-create validation merely from an HTML input or password helper elsewhere. Activation/name changes are not universally audited by these handlers; require source evidence for audit expectations.

**Audit.** `/admin/audit-log` filters page/limit/action/user/time; returns `{page,limit,total,pages,entries}` with identities/type/action/time, not record snapshot bodies. Default 50/max200; action filter accepts only CREATE/UPDATE/DELETE; unsupported actions are ignored. Per-record/customer/SKU audits have different DTOs. Date-only audit bounds are Manila; detailed validation is less strict than record-list filters.

**Diagnostics.** Integration status summarizes SSO/mail mode/account counts/config identities; test email sends `{to}` and returns `{ok,method,error}`. Deployment status reports safe database/storage/origin/cookie/proxy identity/flags, never credentials. The integration screen's configuration heuristic is not the definitive SSO readiness predicate; `/auth/microsoft/status` uses actual MSAL config validation. A test email route is a real side-effect boundary; use a mock provider in automation.

**Tests.** Role deny before mutation; self-lockout prevention; live session invalidation after deactivate; stale permission version; foreign Driver/Assistant linking; duplicate OID; removal of role/identity; delete account with audit/business records; transaction rollback; no credential/hash leakage; audit pagination/bounds; no false SSO ready flag; provider failure response. Missing or malformed input must complete with a response, not hang the process.

## 18. Data sampler, development reset and background work

**Sampler.** Admin + dataSampler resource; counts per operation category; generate `{module,count,fields?}` returns `{created,records}`. Module keys deliveries/rma/accounting_collection/procurement_pickup/sales_orders. Count is clamped 1..50; invalid fields object or explicit non-Scheduled status rejected. Requires existing Companies, uses actual active Driver profiles and validates supplied Driver. RMA override/category/item rules apply. It can generate dates/details randomly; it is not a deterministic test-fixture API.

**Reset.** `/dev/reset-capability`, `/dev/reset-seed`, `/data-sampler/reset` are Admin guarded and call the local disposable database policy. Capability returns `{enabled}`; resets reject disallowed targets. Read the code, not the misleading “dev router is empty” comment in index: guarded routes are still registered in this baseline. Do not call resets to discover capability. Fixtures should use an isolated test database and explicit setup. The removed anonymous seed endpoints are not capabilities.

**Background work.** Server startup writes a daily status snapshot and cleans stale quarantine files; intervals also perform scheduled snapshot/reminder/health work in `server/src/index.ts`. These are not user APIs. Test service functions with a controlled clock/DB/provider and verify scheduled registration separately; importing the process entry point can listen on a port and start jobs.

Schedules are16:00 Manila unassigned-work and AM reminders,18:00 remaining Scheduled/In Transit work plus daily snapshot, and Monday08:00 weekly operational report to active Logistics/Admin. Reminder queries are not universally restricted to Delivery category or scoped like a signed-in user's view. AM-day reminder logs have a dedup check; do not assume all other reminder sends or multiple server instances share dedup/leader election. Weekly notification-log SENT is not proof of email receipt. Self-ping is enabled only when the external URL setting exists.

**Tests.** Admin/resource gate; allowed modules; count clamps; missing prerequisite Companies; invalid Driver; sample records start Scheduled with no fabricated completion stamps; local reset policy rejects staging/production before writes; generated sample does not prove a real Driver login owns it; background idempotency/day boundary and provider outage. This documentation task did not invoke these endpoints or jobs.

## 19. Global search, local UI state and nonimplemented boundaries

**Search.** Navigation matching plus permitted records and available directory/SKU data. Record remote lookup uses paged search/limit8; local visible results and search resources remain permission-gated. Enter/click must close the overlay and open the correct screen/record without stale asynchronous results reopening it. No global `/search` endpoint exists.

**Local state.** Sidebar collapse, zoom and output-action defaults persist in browser `ui_store`; selected record, dashboard filter, search/open dialogs are session UI state cleared on logout. View preferences do not grant permissions. Browser storage disabled/private mode and lazy chunk loading/offline failure need component/browser tests.

**Not implemented by the inspected baseline.** Persisted access-request approval/expiry, supplier login/portal, comprehensive route optimization/GPS tracking, supplier-specific collection identity on RMA, dedicated physical receiving/partial receipt, automatic inventory posting from operational completion, historical Excel import, Warehouse CRUD and arbitrary CRUD on every directory. Do not invent request payloads for these. Access-request modal's “Request Sent/admin notified” is local-only state, with no network action.

**Tests.** Search permitted navigation and records; wrong-category/direct URL isolation; stale request cancellation; logout cache/UI cleanup; one permission source in sidebar/router; keyboard and mobile overlays; output defaults retained only as designed. Unsupported workflow expectations belong in separately approved requirements cases, not passing baseline E2E claims.
