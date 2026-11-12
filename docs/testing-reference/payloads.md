# Payloads and request recipes

Profile: merged `dev` `8660bde`, including the RMA completion recipe from merged PR #240 in [latest-pr.md](latest-pr.md). Examples use synthetic data and symbolic IDs: replace placeholders with IDs created by isolated fixtures. They are illustrative payloads, not records captured from a live database. [Endpoint catalog](endpoint-catalog.md) contains the exact response expressions for every registered route, including routes not wrapped by the client. [Payload types](payload-types.md) contains full named DTO declarations and serializers.

## 1. Transport and global failures

- Base path `/api`; development browser origin `http://localhost:3000`, Vite proxies the API to port 4000. Production can use the Cloudflare Worker or Express same-origin serving.
- JSON requests use `Content-Type: application/json`, cookies/`credentials: include`. Multipart uploads let the browser create the boundary; do not force JSON Content-Type.
- Authenticate through login; retain the httpOnly cookie in a cookie jar. Read `X-CSRF-Token` from login or `/auth/me`, then send it on authenticated POST/PUT/PATCH/DELETE. Never copy JWT into request JSON or local storage.
- Origin restrictions apply to all state-changing requests. Login/logout/Microsoft initiation are token-exempt, not origin-exempt. A valid session with missing token fails 403 before the route. No/invalid session falls through to auth and fails 401 on protected routes.
- Optional proxy-only mode rejects direct API access with 403; health remains public. Prefer the configured application origin in E2E, not a direct backend URL that bypasses its deployment contract.
- Successful JSON is normally a bare object/array, **not** `{data:...}`. `201` creates, `204` deletes files/deactivates roster entries with **no JSON body**. Microsoft callback redirects. Attachment preview/download streams bytes.
- Dates: `delivery_date`/`purchase_date` are `YYYY-MM-DD` business days. Timestamps include timezone/UTC; JSON serializes server Dates to strings. `is_draft` is `"Yes" | "No"`, not boolean. Category and record status display values differ from stored enums; Transaction Center/Admin charts can expose stored enums.
- Common route failures use `{error:string}`. Customer field validation adds `fields`; attachment quota adds `code`; safe user delete adds `linked_records`. Unexpected errors through the shared handler become 500 `{error:"Internal server error"}`. Do not assume every legacy async handler maps every DB failure consistently.

| Failure | Status / marker | Assert |
| --- | --- | --- |
| Missing/expired/deactivated session | 401 | No mutation; session clears where handler specifies |
| Role/screen/record scope | 403, or scoped detail 404 | No disclosure/mutation; use endpoint-specific status |
| Cross-site origin | 403 + `X-CSRF-Error: origin` | Route/storage/mail never reached |
| Missing/stale CSRF token | 403 + `X-CSRF-Error: token` | Client refreshes `/auth/me` and retries once; no duplicate successful write |
| Invalid input/transition | 400 | Business state and audit unchanged where transaction rejects |
| Duplicate/stale/quota/protected last photo | 409 | Existing data retained; error context checked |
| Oversize file | 413 | No persisted file/metadata |
| Unsupported preview | 415 | DOC can still be explicitly downloaded |
| Microsoft not configured | 501 initiation | No auth session created |
| Unhealthy service | 503 health | `ok:false`, meaningful checks |
| Throttle | 429 + Retry-After/RateLimit | No side effect; isolate rate-limit tests from business tests |

Default limits: login failures 5/account+IP and 20/IP in 15 min; mail 10/user/min; uploads 30/user/10 min; global API 600/user-or-IP/min except health. Microsoft limiter is mounted with `app.use('/api/auth/microsoft', ...)`: verify actual Express path matching before assuming every sibling `microsoft/*` URL shares that budget. Counters are per-process memory, not a distributed quota.

## 2. Authentication

POST `/api/auth/login`:

```json
{"email":"qa.sc@example.test","password":"<fixture-password>"}
```

200 example shape (screen/resource arrays depend on the fixture):

```json
{
  "id":"<user-id>","name":"QA Sales","email":"qa.sc@example.test","role":"SALES_COORDINATOR",
  "permissions":[],"effectiveScreens":["main","dashboard","deliveries"],
  "resources":["records","companies","drivers","dashboard"],"permissionVersion":"<sha256>"
}
```

The abbreviated arrays above illustrate the shape, not the complete SC default snapshot. Obtain expected defaults from `permissions.ts`. `/auth/me` returns the freshly resolved snapshot; Driver sessions add server-linked profile identity. `/auth/logout` body absent → `{ok:true}`. POST `/auth/microsoft` body absent → `{url:"<Microsoft authorization URL>"}` and state cookie; GET `/auth/microsoft/status` → `{configured:boolean}`; callback query `{state,code}` or provider error → 302 Location `/` or `/?error=<safe-code>`.

## 3. Record DTO: the shared response

Every create/detail/update/status action returns `serializeRecord(...)`; legacy list returns `Record[]`, paged list wraps rows. The following field groups cover the serialized keys (read the extracted serializer for conditional/null rules):

| Fields | Type / meaning |
| --- | --- |
| `id`, `company_id`, `company_name` | Server record identity and Company directory identity/name |
| `category` | Deliveries / RMA / Accounting Collection / Procurement Pick-up / Sales Orders |
| `priority` | `1 - Low`, `2 - Moderate`, `3 - High` |
| `reference` | String; RMA aliases manual document reference, other categories use ordinary reference |
| `rma_reference`, `legacy_sap_reference` | RMA strings/null, otherwise null; do not confuse legacy SAP with manual document reference |
| `status`, `allowed_statuses` | Effective display status and graph candidates; role filtering still applies |
| `is_draft` | `Yes`/`No` |
| `driver`, `driver_id`, `driver_assistants`, `vehicle` | Display name, stable profile ID/null, string array, vehicle text |
| `area`, `account_manager`, `address` | Operational location/personnel/address text |
| `delivery_date` | Date-only string; can be empty in drafts/RMA/historical data |
| `time_in`, `time_out`, `received_by` | Timestamp strings/null and recipient text/null; server-owned run clocks except authorized corrections |
| `overdue`, `days_late`, `completed_late` | Delivery-only properties; not universally present for other categories |
| `rma_type`, `purchase_date`, `customer_contact_name`, `customer_contact_email`, `customer_contact_phone` | RMA metadata, nullable; no forced historical values |
| `item_type`, `item_description`, `line_items` | Text fields; line array `{id,sku,quantity}` |
| `document_attachment`, `attachments` | Legacy filename metadata and derived filename array; **not** uploaded bytes or POD metadata |
| `collection_verified`, `collection_verified_by`, `collection_verified_at`, `amount` | Verification boolean/name/timestamp and amount/null |
| `linked_collection_id`, `linked_collection` | Null/redacted if denied; nested `{id,reference,company_name,status,collection_verified}` when permitted and not draft |
| `remarks` | Latest editable reason/text, separate from append-only history |
| `created_by`, `created_by_id`, `created_at`, `modified_by`, `modified_by_id`, `modified_at`, `deleted_at` | Server-attributed names/IDs/timestamps; deletion currently unavailable through operational API |

Do not make every nullable/conditional field mandatory in a generic snapshot or compare clocks/IDs to fixed values. Assert shape, actor identity, monotonic time bounds and relevant field preservation.

## 4. List, pagination and aggregate queries

```http
GET /api/records?paged=true&category=Deliveries&status=Scheduled&dateFrom=2026-10-27&dateTo=2026-10-29&driver=Alex&limit=100
```

Response:

```json
{"rows":[],"nextCursor":null,"hasMore":false,"total":0,"page":1,"limit":100}
```

Allowed filters: `company_id`, `category`, `status`, `dateFrom`, `dateTo`, `search`, `driver`, `area`, `region`, `subregion`, `account_manager`, `priority`, `dashboard_filter`, `limit`, `cursor`, `page`, `paged`, `dateSort`. `paged=true|1`; list limit 1..100; search <=100 trimmed chars, Driver/AM substring searches <=100 chars; area exact; region/subregion expand canonical areas. Date-only values must be real calendar dates; From<=To. Cursor is opaque, preserve it exactly. `nearest|oldest|furthest` require paged mode, reject cursor and return page-based results with null nextCursor. No `paged` → legacy array, even if a limit applies.

| Route | Input | Success |
| --- | --- | --- |
| GET `/records/active-counts` | none | `{deliveries,rma,sales_orders,accounting_collection,procurement_pickup}` numeric |
| GET `/records/am-summary` | none | `[{name,total,delivered,pending,onHold,rescheduled,scheduled,companies:string[]}]` |
| GET `/records/calendar-summary` | optional dateFrom/dateTo | Up to 500 serialized records, sorted scheduled date/ID |
| GET `/records/status-history-counts` | category/area/region/subregion/driver/status + one date basis | `{ever_held,current,total_records,date_basis,history_basis:"lifetime",time_zone:"Asia/Manila"}` |

History date basis: `deliveryDateFrom/To` for scheduled date; `createdAtFrom/To` for creation; legacy `dateFrom/To` defaults to creation unless `dateBasis` says otherwise. Mixing bases fails 400. Current/ever-held maps use Draft, Scheduled, In Transit, Delivered, Pending, On-Hold, Rescheduled. Lifetime status counts are distinct record memberships, not event frequencies or period-limited history.

## 5. Create, draft, edit, assign, status and verification recipes

SC/Admin POST `/api/records`:

```json
{
  "company_id":"<existing-company-id>","category":"Deliveries","reference":"QA-SO-001",
  "delivery_date":"2026-10-27","priority":"2 - Moderate","area":"Makati CBD",
  "account_manager":"QA AM","item_type":"Unit","item_description":"QA test unit",
  "line_items":[{"sku":"QA-SKU-001","quantity":1}],"remarks":"Created for isolated test"
}
```

201 Record: Scheduled, unassigned, no run clocks; creation/audit/optional remark persisted. Non-draft create requires existing Company/category/reference/Delivery Date except RMA rules. `is_draft:"Yes"` permits incomplete ordinary reference/date; a draft still needs Company/category. RMA requires priority/area/AM for either draft or submission. Never assign a Driver during create; SC assignment attempt 403, other create assignment attempts 400. Ordinary form-required metadata can be stricter than this minimum API requirement. Delivery line items do not decrement stock.

TASS/Admin RMA create:

```json
{
  "company_id":"<existing-company-id>","category":"RMA","priority":"2 - Moderate",
  "area":"Makati CBD","account_manager":"QA AM","rma_type":"Return to Supplier",
  "rma_reference":"RTS-QA-001","purchase_date":"2026-09-01",
  "customer_contact_name":"QA Contact","customer_contact_email":"contact@example.test",
  "customer_contact_phone":"+63 900 000 0000","remarks":"QA return entry"
}
```

Delivery date/reference/contact/purchase metadata can be omitted under the RMA rules; no supplier relationship or completion/receipt is created automatically. `reference` is not the correct RMA update key. Purchase-date/contact semantics beyond current validation remain an open business requirement in #230.

| Action | Request | Success / important rejection |
| --- | --- | --- |
| Staff metadata edit | PUT `/records/:id` `{area,account_manager,item_description,remarks,...}` | 200 Record; fields persisted depend on role/category; nonblank remarks required for substantive edits |
| Assign Driver | PUT `/:id` `{driver_id:"<active-driver-profile-id>",vehicle:"QA Van",driver_assistants:[],remarks:"Assign run"}` | Logistics/Admin only; not draft, preserve stable profile ID; SC fields do not confer dispatch |
| Clear Driver | PUT `/:id` `{driver_id:null,remarks:"Unassign"}` | Only if directory/run assignment rules permit; never transfer by matching login display name |
| Submit draft | PATCH `/:id/status` `{status:"Scheduled",remarks:"Submit"}` or supported PUT draft action | SC/Admin or TASS RMA; ordinary reference required; see category-specific validation |
| Start | POST `/:id/time-in` `{remarks:"Start route"}` | Driver/Logistics/Admin; server stamps Time In, In Transit; repeat/no assignment/draft rejected |
| Complete ordinary run | PATCH `/:id/status` `{status:"Delivered",remarks:"Handed over",received_by:"QA Recipient"}` | Requires valid Time In + actual saved JPG/PNG; server stamps Time Out; RMA behavior differs in PR #240 |
| Hold/Pending | PATCH `/:id/status` `{status:"On-Hold",remarks:"Recipient unavailable"}` or Pending | Graph/role restrictions; ordinary Pending requires valid Time In |
| Reschedule Delivery | PATCH `/:id/status` `{status:"Rescheduled",delivery_date:"<different-today-or-future-Manila-day>",remarks:"Customer requested"}` | Logistics/Admin must include new valid day; clears clocks/recipient for ordinary run |
| Timestamp correction | PUT `/:id` `{time_in:"2026-10-27T01:30:00Z",remarks:"Correct entry"}` | Logistics/Admin, existing stamp only; no fabricated first Time In; Time Out>=Time In |
| Link collection | PUT `/:id` `{linked_collection_id:"<accessible-Accounting-Collection-id>",remarks:"Link billing record"}` | Logistics/Admin; null/empty clears; wrong category/denied target 400 |
| Verify collection | PATCH `/:id/verify-collection`, no body | TASS only, accomplished Accounting Collection, once; 200 Record |
| Delete record | DELETE `/:id` | 403 for all roles (earlier guards may reject first); no deletion mutation |

`PUT /records/:id` must not carry `status`; use status action (400). PATCH status rejects client `time_in`/`time_out`. Priority can be changed under the permitted role/category rules, but cannot change after Delivered. Recipient text must be a string and nonblank at completion. These APIs do not enforce a universal unknown-field rejection policy; always read/reload state to verify forbidden fields were not changed.

## 6. Supporting history, comments and actual files

| Route | Request | Response |
| --- | --- | --- |
| GET `/:id/audit` | none | `[{id,action,changed_by,previous_value,new_value,timestamp}]`, redacted snapshots, newest first |
| GET `/:id/remarks` | none | `[{id,body,context,author,author_role,created_at}]`, newest first |
| GET `/:id/comments` | none | `[{id,body,author,created_at,updated_at}]`, oldest first |
| POST `/:id/comments` | `{body:"QA comment"}` | 201 comment; blank invalid; role/category/date checks |
| GET `/:id/attachments` | none | `ApiPodAttachment[]` (actual saved files) |
| POST `/:id/attachments` | multipart `file=<bytes>` | 201 `ApiPodAttachment` |
| GET `/:id/attachments/:attachmentId/download` | none | Binary, Content-Type/Length, attachment filename |
| GET `/:id/attachments/:attachmentId/preview` | none | Binary inline image/PDF/DOCX, private no-store; unsupported DOC 415 |
| DELETE `/:id/attachments/:attachmentId` | `{remarks:"Remove duplicate"}` optional reason | 204; Driver denied; last proof on ordinary completed record protected |

Example saved attachment shape:

```json
{
  "id":"<attachment-id>","name":"qa-proof.png","mime_type":"image/png","is_photo":true,
  "size":2048,"uploaded_at":"<server-timestamp>",
  "download_url":"/api/records/<record-id>/attachments/<attachment-id>/download",
  "preview_url":"/api/records/<record-id>/attachments/<attachment-id>/preview"
}
```

Size example is illustrative; validate actual bytes. Accepted file formats/quotas are in modules.md. DOCX preview client extracts **plain text** with Mammoth into a React `<pre>`; it is not a full Word layout/HTML renderer. PDF uses inline preview; DOC requires explicit download/conversion. Save selected files only after record creation; preserve the record ID on upload failure and retry failed files, not the record POST.

## 7. Directory payloads

| Operation | Body | Success shape |
| --- | --- | --- |
| GET/POST `/companies` | POST `{name,sap_number?,address?,contact_person?}` | Company row/array `{id,name,sap_number,address,contact_person,created_at}`; create 201 |
| GET/POST `/customers` | POST `{name,contact_person?,email?,phone?,address?,city?}` | Customer row/array with `created_by/at`, `modified_by/at`; create 201 |
| PUT `/customers/:id` | Partial six editable fields + `{remarks,expected_modified_at}` | Updated Customer; stale 409, no-op/invalid 400 |
| GET `/customers/:id/audit` | none | `[{id,action,changed_by,timestamp,remarks,changes:[{field,label,from,to}]}]` |
| GET/POST `/suppliers` | POST `{name,category,contact_person?,email?,phone?,address?,city?}` | Supplier row/array with category and created/modified names/timestamps; create 201 |
| GET `/drivers?all=1` | none | Driver array `{id,name,type,coverage_areas,is_active,is_linked,created_by/at,modified_by/at}`; Admin also `linked_user` |
| POST `/drivers` | `{name,type:"DRIVER"|"ASSISTANT",coverage_areas?:string[]}` | 201 Driver; Admin Drivers, Logistics Assistants |
| PUT `/drivers/:id` | Partial `{name,type,coverage_areas,is_active}` | Driver; role/type/rename restrictions and 409 conflicts |
| DELETE `/drivers/:id` | none | 204, audited deactivation |

Customer edit example:

```json
{"phone":"+63 900 000 0000","remarks":"Contact number corrected","expected_modified_at":"<exact-read-modified_at>"}
```

Keep `expected_modified_at` from the actual read. Do not substitute current browser time. Driver `coverage_areas` values come from canonical area/subregion data, not arbitrary tags. Companies/Customers/Suppliers do not all have full CRUD; unsupported operations have no specified JSON response contract.

## 8. SKU and stock payloads

```json
{"sku_code":"QA-SKU-001","name":"QA Unit","category":"A","unit_cost":100,"unit_price":150,"reorder_point":5,"description":"Synthetic test product","warehouse_location":"WH-A1"}
```

POST `/skus` returns 201 `ApiSku`; PUT updates selected catalog fields; GET list/detail returns `ApiSku[]`/`ApiSku`. DTO:

```json
{
  "id":"<sku-id>","sku_code":"QA-SKU-001","name":"QA Unit","category":"A",
  "unit_cost":100,"unit_price":150,"reorder_point":5,"description":"Synthetic test product",
  "created_by":"QA Admin","modified_by":"QA Admin","created_at":"<timestamp>","updated_at":"<timestamp>",
  "inventory":{"warehouse_location":"WH-A1","on_hand_qty":0,"allocated_qty":0,"atp":0},
  "recent_transactions":[]
}
```

Adjustment POST `/skus/:id/adjust`:

```json
{"type":"Goods Receipt","qty_change":10,"reference":"QA-GR-001"}
```

200 updated SKU with on-hand10/ATP10 and recent `{id,type,qty_change,resulting_balance,reference,date}`. Other accepted types Sale/Adjustment/Transfer; delta is signed by caller, integer/nonzero/bounded, never infer a negative Sale automatically. Concurrent adjustments use row locks. This request is independent from recording receipt of an operational movement.

## 9. Transactions, dashboards and reports

| Route | Query | Result |
| --- | --- | --- |
| GET `/transactions` | page,limit,source(all/delivery/inventory),category(stored category),from,to,status(stored operational status) | `{page,limit,total,pages,transactions:ApiTransaction[]}` |
| GET `/transactions/delivery/:id` | none | Operational metadata + stored status + audit `timeline[]`; no inventory mutation |
| GET `/transactions/inventory/:id` | none | Inventory delta/balance + product + last five other `related_transactions[]`; creator can be null |
| GET `/dashboard/stats` | none | Role-specific KPI DTO; see modules.md and extracted ApiDashboardStats, plus fallback `{role}` |
| GET `/reports/summary` | `deliveryDateFrom/To` or legacy dateFrom/To, category,area,driver,status | `ApiReportSummary` below |

```json
{
  "total":0,"accomplished":0,"completed_in_range":0,"on_hold":0,"pending":0,"completion_rate":0,
  "date_basis":{"cohort":"deliveryDate","completion":"timeOut","time_zone":"Asia/Manila"},
  "by_status":[],"by_category":[],"by_area":[],"by_driver":[]
}
```

Group entries are `{status,count}`, `{category,count}`, `{area,count}`, `{driver,count}`. `completed_in_range` is independently completion-clock based; do not assert it equals cohort accomplished. Record status Delivered maps to DB ACCOMPLISHED; do not send display statuses to Transaction Center expecting its handler to map them.

## 10. Admin, notifications and sampler payloads

| Route | Body/query | Success |
| --- | --- | --- |
| GET `/users` | none | Admin user rows with `driver_profile`, never password |
| POST `/users` | `{name,email,password,role,driver_profile_id?,microsoft_oid?}` | 201 Admin row; profile may be linked/created atomically |
| PATCH `/users/:id` | `{name?,email?,role?}` | Admin user row; this response omits `driver_profile` unlike list/create |
| PATCH `/:id/activate`, `/:id/deactivate` | no body | Admin user row; cannot change self or repeat current state |
| DELETE `/users/:id` | no body | `{ok:true,deleted_id}` or 409 `{error,linked_records}` |
| PUT `/:id/driver-profile` | `{driver_profile_id:string|null}` | `{user_id,driver_profile:{id,name}|null}` |
| PUT `/:id/microsoft-identity` | `{microsoft_oid:guid|null}` | `{user_id,microsoft_linked}` |
| GET/PUT `/:id/permissions` | PUT `{permissions:[{screen,granted}],expectedVersion}` | PermissionEditor snapshot |
| GET `/admin/audit-log` | page,limit,action,from,to,userId | `{page,limit,total,pages,entries:[{id,record_id,record_type,action,changed_by,changed_by_id,timestamp}]}` |
| GET `/admin/integration-status` | none | `{azure_sso:{configured,tenant,redirect_uri},email:{method,smtp_host,from},users:{total,active,microsoft_linked},app_url,node_env}` |
| GET `/admin/deployment-status` | none | Safe nested DB/storage/proxy/origin/cookie identities/checks/warnings; exact source shape below |
| POST `/admin/test-email` | `{to:"qa-inbox@example.test"}` | `{ok,method:"graph"|"smtp"|"mock",error:string|null}` |
| GET `/notifications` | none | Latest 50 caller-owned `ApiNotification[]` |
| GET `/notifications/unread-count` | none | `{count:number}` across all unread |
| PATCH `/notifications/read-all` or `/:id/read` | none | `{ok:true}` |
| POST `/notifications/send-email` | `{recordId,trigger,recipients:string[]}` | `{ok:true,sent,failed,resolvedCount}`; successful HTTP status does not guarantee sent>0 |
| GET `/data-sampler/counts` | none | `[{key,label,count}]` for five operation module keys |
| POST `/data-sampler/generate` | `{module,count,fields?}` | `{created:number,records:Record[]}`; count clamped1..50, random fixture data |
| GET `/dev/reset-capability` | none | `{enabled:boolean}`; read-only policy probe |
| POST `/dev/reset-seed` | none | `{ok:true}` only verified local disposable DB |
| POST `/data-sampler/reset` | `{mode:"full"|"seed"}` | `{deleted,mode}` only verified local disposable DB |

Deployment-status nested DTO is defined by `server/src/services/deploymentStatus.ts`; the source-extracted [payload types document](payload-types.md) includes that function's return contract. Database and storage **identities** are intentional diagnostics; passwords, shared secrets, tokens and connection credentials are not returned and must not be asserted/logged.

## 11. Browser-generated output payloads

There is no network JSON response for a browser-created file. Tests observe the data fetches and the actual downloaded artifact.

```ts
// Internal JS parameters for the shared route-slip generator, not an HTTP body.
{
  records: DeliveryRecord[],
  dateFrom: '2026-10-27',
  dateTo: '2026-10-29', // ''/omitted for From onward, same as dateFrom for Single day
  preparedBy: 'QA Logistics',
  filename: 'deliveries',
  variant: 'current', // or 'trail'
  documentSize: /* selected value from documentSize.ts */
}
```

Route-slip workflow: validate selection → GET all `/records?paged=true&limit=100&...` cursor pages → optionally GET each included record's `/audit` for lifetime trail → generate grouped XLSX/PDF/DOCX → download blob. Selection changes also update table dates. Generic CSV remains record rows. Verify file contents/period/group names, not merely a Blob URL or MIME type. For Word, inspect ZIP `word/document.xml`; Excel inspect worksheets/rows; PDF parse meaningful text/page count, then visually inspect layout where needed.

Monthly Driver report and other export utilities have their own client parameter contracts; inspect `exportDriverReport.ts`, `export.ts`, `exportDocx.ts`, `allOpsExport.ts`, `documentSize.ts`. Their existence does not establish all-page fetching on every calling screen.
