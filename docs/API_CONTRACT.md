# System API Contract

> Last verified: 2026-10-09 against commit `ccbf192` (`dev`). Derived from `server/src/routes/*.ts` and `server/src/index.ts`.

This document describes the REST API of the Microgenesis Supply Chain Portal. All endpoints are prefixed with `/api`. Unless marked **Public**, an endpoint requires a valid session cookie (`mg_session`), and the account and its permissions are reloaded on every request.

**Guard legend.** `Auth` = `requireAuth`. `Res:x` = `requireResource('x')` (the account's effective screens must grant the shared resource, see [Module access](./MODULE_ACCESS.md)). `Screen:x` = `requireScreen('x')`. `Rec` = `requireRecordAccess` (record category/ownership scope). Roles: SC = SALES_COORDINATOR, LOG = LOGISTICS, ADM = ADMIN, DRV = DRIVER, TASS.

**Common errors.** `400` validation, `401` no/invalid session or deactivated account, `403` role/screen/ownership denied, `404` not found or outside the caller's scope, `409` conflict (duplicate email, stale permission version), `501` Microsoft SSO not configured, `503` unhealthy (`/api/health`).

---

## 1. Health and authentication

| Method | Path | Guards / roles | Purpose |
| :--- | :--- | :--- | :--- |
| GET | `/health` | Public | Database ping, mailer mode (`graph`/`smtp`/`mock`), required env check. `200` or `503` |
| POST | `/auth/login` | Public | Email/password login; sets `mg_session`; returns the session user |
| POST | `/auth/logout` | Public | Clears the cookie |
| GET | `/auth/me` | Auth | Current session user (same shape as login), `Cache-Control: no-store` |
| POST | `/auth/microsoft` | Public | Starts Microsoft SSO (501 if not configured) |
| GET | `/auth/microsoft/callback` | Public | SSO callback: browser-bound state consumed atomically (5-min expiry), tenant verified; only Admin-prelinked active `microsoftOid` accounts may sign in; unknown identities denied |
| GET | `/auth/microsoft/status` | Public | `{ configured: boolean }` |

`POST /auth/login` request: `{ "email": "...", "password": "..." }`.
Login and `/auth/me` response (session DTO):

```json
{
  "id": "cuid", "name": "Maria Reyes", "email": "sales@microgenesis.com", "role": "SALES_COORDINATOR",
  "permissions": [{ "screen": "dashboard", "granted": false }],
  "effectiveScreens": ["main", "deliveries", "..."],
  "resources": ["records", "companies", "..."],
  "permissionVersion": "sha256-hex"
}
```

## 2. Records (`/records`)

All record routes use `Auth` + `Res:records` + `Rec`. Responses use display strings: categories `Deliveries | RMA | Accounting Collection | Procurement Pick-up | Sales Orders`; statuses `Draft | Scheduled | In Transit | Pending | On-Hold | Rescheduled | Delivered`. Each record includes `allowed_statuses`, `driver_id`, `time_in`, `time_out`, `received_by`, `overdue`, `days_late`, `completed_late` (deliveries) and attachment metadata.

| Method | Path | Roles | Purpose |
| :--- | :--- | :--- | :--- |
| GET | `/records` | any with access | List records in caller's scope, ordered `createdAt desc, id desc`. Supports unpaginated array (legacy) or `{ rows, nextCursor, hasMore, total, page, limit }` when `paged=true`. Filters: `company_id`, `category`, `status`, `dateFrom`, `dateTo`, `search`, `driver`, `area`, `account_manager`, `priority`, `dashboard_filter`, `limit` (1-100), `cursor`, `page`. See [AUD-008 Spec](./CONSUMER_INVENTORY_AUD_008.md). |
| GET | `/records/active-counts` | any with access | Grouped active counts `{ deliveries, rma, sales_orders, accounting_collection, procurement_pickup }` |
| GET | `/records/am-summary` | any with access | Account Manager summary `{ name, total, delivered, pending, onHold, rescheduled, scheduled, companies }[]` |
| GET | `/records/status-history-counts` | any with access | Current and lifetime-ever-held status counts for records in scope. Operational filters: `deliveryDateFrom`/`deliveryDateTo`; creation cohort filters: `createdAtFrom`/`createdAtTo`. Legacy `dateFrom`/`dateTo` aliases use `createdAt`. Date-only values are `YYYY-MM-DD` in `Asia/Manila`; timestamp ranges use half-open UTC bounds. Response identifies `date_basis`, `history_basis: lifetime`, and `time_zone`. |
| GET | `/records/:id` | any with access | One record |
| GET | `/records/:id/audit` | any with access | Audit entries |
| GET | `/records/:id/remarks` | any with access | Append-only remark history |
| GET | `/records/:id/comments` | any with access | Comments |
| POST | `/records/:id/comments` | SC, LOG, ADM, DRV, TASS | Add a comment `{ "body": "..." }` |
| GET | `/records/:id/attachments` | any with access | POD attachment metadata |
| POST | `/records/:id/attachments` | SC, LOG, ADM, DRV | Upload one file (multipart field `file`, 10 MB max). Content is verified and a per-record quota applies; see [Attachment rules](#11-attachment-rules-sec-07--sec-08). Drivers: assigned runs only |
| GET | `/records/:id/attachments/:attachmentId/download` | any with access | Download through the API (streamed, always `Content-Disposition: attachment`) |
| DELETE | `/records/:id/attachments/:attachmentId` | SC, LOG, ADM | Remove an attachment (audited) |
| POST | `/records` | SC, LOG, ADM | Create. LOG cannot create RMA; SC cannot assign drivers. Required: `company_id`, `category`, `reference` (Drafts: `company_id`, `category`) |
| PUT | `/records/:id` | SC, LOG, ADM, DRV, TASS | Edit fields; remarks required; field and category limits per role (TASS: RMA only; LOG: not RMA; DRV: own runs) |
| POST | `/records/:id/time-in` | DRV, LOG, ADM | Record Time In (`{ "remarks": "..." }`); moves the run to In Transit |
| PATCH | `/records/:id/status` | SC, LOG, ADM, DRV, TASS | Change status; transition and role rules in `deliveryLifecycle.ts` |
| PATCH | `/records/:id/verify-collection` | TASS | Verify a delivered Accounting Collection once |
| DELETE | `/records/:id` | SC | Soft delete |

Create example:

```json
{
  "company_id": "cuid", "category": "Deliveries", "reference": "SO-12345",
  "is_draft": "No", "priority": "2 - Moderate", "area": "NCR",
  "account_manager": "Jane Doe", "delivery_date": "2026-10-10",
  "item_type": "Hardware", "item_description": "2x Servers", "remarks": "Call on arrival"
}
```

Status example (`Delivered` also needs Time In, a saved JPG/PNG proof photo, recipient and remarks; otherwise `400`):

```json
{ "status": "Delivered", "remarks": "Delivered successfully", "received_by": "Warehouse Manager" }
```

Clients must not send `time_in` or `time_out` on `PATCH /status`; the server rejects them (`400`) and stamps Time Out on completion. `priority` on this route is accepted for LOG/ADM only.

## 3. Directories

| Method | Path | Guards / roles | Purpose |
| :--- | :--- | :--- | :--- |
| GET | `/companies` | Auth, Res:companies | List companies |
| POST | `/companies` | Res:companies; SC, ADM | Create `{ name, sap_number, address, contact_person }` |
| GET | `/customers` | Auth, Res:customers | List customers |
| POST | `/customers` | Res:customers; SC, LOG, ADM, DRV | Create |
| PUT | `/customers/:id` | Res:customers; SC, LOG, ADM | Edit with validation and reason for change |
| GET | `/customers/:id/audit` | Res:customers; SC, LOG, ADM | Customer audit trail |
| GET | `/suppliers` | Auth, Res:suppliers | List suppliers |
| POST | `/suppliers` | Res:suppliers, Screen:suppliers; SC, LOG, ADM, DRV | Create |
| GET | `/drivers` | Auth, Res:drivers | Driver/assistant directory (`?all=1` includes inactive). Reads never seed or import |
| POST | `/drivers` | Res:drivers, Screen:driver_manager; LOG, ADM | Create. Type `DRIVER` requires ADM; LOG may add assistants |
| PUT | `/drivers/:id` | same; LOG, ADM | Update. Driver renames and type changes are ADM only |
| DELETE | `/drivers/:id` | same; LOG, ADM | Deactivate (`204`) |

## 4. SKUs and transactions

| Method | Path | Guards / roles | Purpose |
| :--- | :--- | :--- | :--- |
| GET | `/skus`, `/skus/:id` | Auth, Res:skus | Products with inventory balance (read access also comes with Transaction Center) |
| GET | `/skus/:id/audit` | Res:skus; ADM | SKU audit log |
| POST | `/skus` | Res:skus; ADM | Create `{ sku_code, name, category, unit_cost, unit_price, reorder_point, description?, warehouse_location? }` |
| PUT | `/skus/:id` | Res:skus; ADM | Update |
| POST | `/skus/:id/adjust` | Res:skus, Screen:inventory; ADM, LOG | `{ type, qty_change, reference }`; transactional; balance may not go negative |
| GET | `/transactions` | Auth, transaction access | Merged delivery and inventory transactions. Query: `page`, `limit` (max 100), `source` (`all | delivery | inventory`), `category`, `from`, `to`, `status`. Categories per role: SC delivery/procurement/sales orders, LOG delivery/RMA/procurement, TASS accounting collection, ADM all; inventory rows for ADM/SC/LOG with SKU access |
| GET | `/transactions/:source/:id` | Auth, transaction access | Detail |

## 5. Users and module access (ADM only)

All `/users` routes use `Auth` + `Res:users` + ADM.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| GET | `/users` | List accounts |
| POST | `/users` | Create `{ name, email, password, role, driver_profile_id? }` (`409` on duplicate email) |
| PUT | `/users/:id/driver-profile` | Link/unlink a Driver login `{ driver_profile_id: string \| null }` |
| PUT | `/users/:id/microsoft-identity` | Admin | Pre-link or unlink Entra object GUID `{ microsoft_oid: uuid or null }` (audited, rejects duplicates) |
| PATCH | `/users/:id` | Update details/role (an admin cannot remove their own admin role) |
| PATCH | `/users/:id/deactivate`, `/activate` | Toggle (not for yourself) |
| DELETE | `/users/:id` | Delete (not yourself) |
| GET | `/users/:id/permissions` | Permission editor snapshot |
| PUT | `/users/:id/permissions` | `{ permissions: [{ screen, granted }], expectedVersion }`; `400` invalid, `409` stale |

## 6. Dashboard, reports, notifications, admin

| Method | Path | Guards / roles | Purpose |
| :--- | :--- | :--- | :--- |
| GET | `/dashboard/stats` | Auth, Res:dashboard | Role-specific KPI payload (SC, LOG, TASS, ADM, DRV variants) |
| GET | `/reports/summary` | Auth, Screen:statistical_reports | Record-scoped summary. `deliveryDateFrom`/`deliveryDateTo` filter the scheduled-operation cohort; legacy `dateFrom`/`dateTo` aliases remain accepted. `completed_in_range` uses the same Manila calendar range against completion `timeOut`, independently of the delivery-date cohort. Response identifies both bases. |
| GET | `/notifications` | Auth | The caller's bell notifications |
| GET | `/notifications/unread-count` | Auth | Unread count |
| PATCH | `/notifications/read-all` | Auth | Mark all read |
| PATCH | `/notifications/:id/read` | Auth | Mark one read |
| POST | `/notifications/send-email` | Auth, Res:records | `{ recordId, trigger, recipients[] }`; record must be in the caller's scope |
| GET | `/admin/audit-log` | Res:admin; ADM | System-wide audit log |
| GET | `/admin/integration-status` | Res:admin; ADM | Mailer/SSO/storage status |
| GET | `/admin/deployment-status` | Res:admin; ADM | Read-only identity of the connected database, file store, trusted origins, cookie flags and proxy trust, plus warnings. Never returns a secret value |
| POST | `/admin/test-email` | Res:admin; ADM | `{ to }` |

## 7. Data sampler and demo seeding

| Method | Path | Guards / roles | Purpose |
| :--- | :--- | :--- | :--- |
| GET | `/data-sampler/counts` | Res:dataSampler; ADM | Row counts |
| POST | `/data-sampler/generate` | Res:dataSampler; ADM | `{ module, count, fields }` generate sample records |
| GET | `/dev/reset-capability` | Res:admin; ADM | `{ enabled }`; true only for an approved local disposable sandbox |
| POST | `/data-sampler/reset` | Res:dataSampler; ADM | `{ mode: "full" | "seed" }`; `403` unless the same local sandbox policy passes |
| POST | `/dev/reset-seed` | Res:admin; ADM | Re-run the demo seed; local disposable sandbox only |

The former anonymous `/dev/public-seed` and `/dev/public-seed-uat` routes are
removed. All reset authorization and environment/database validation occurs on
the server before seed code or Prisma operations run. Staging and production
always deny destructive resets. Normal `/data-sampler/generate` remains
available to authorized Admin users.

## 8. Module access session contract (TSK-55)

Both `POST /api/auth/login` and `GET /api/auth/me` return `id`, `name`, `email`, `role`, account `permissions`, resolved `effectiveScreens`, allowed `resources` and `permissionVersion`. Protected UI must wait for this complete snapshot.

`GET /api/users/:id/permissions` additionally returns `catalog`, `roleDefaults` and `editableScreens`. `PUT /api/users/:id/permissions` takes `{ permissions: [{ screen, granted }], expectedVersion }` and returns the updated editor snapshot. Invalid input returns 400, a stale version returns 409, and unauthorized module access returns 403. An empty permission array resets overrides. See [Module access](MODULE_ACCESS.md) for authorization semantics and verification.


## 9. Microsoft SSO pre-approval (AUD-002)

Only a configured corporate tenant GUID is accepted. Unknown/unapproved users cannot sign in. Existing `microsoftOid` values inherited from historical auto-provisioning are explicitly unapproved (the new `microsoftApprovedAt` column starts NULL). An authorized Admin must link/reapprove the specific tenant's user object ID using `PUT /api/users/:id/microsoft-identity` with `{ "microsoft_oid": "<the Entra user object GUID>" }`; send `null` to revoke. The operation is audited and rejects duplicate OIDs; password login is unchanged. Check the UPN/email and the Entra tenant before approval. No user is auto-created from a Microsoft callback. OAuth state is stored only as a digest, expires after five minutes and is consumed with an atomic delete before token redemption.

## 10. Request security (AUD-003)

Applied to every `/api` request by `applySecurity()` in `server/src/middleware/security.ts`, before any route handler.

**CSRF.** The production session cookie is `SameSite=None` (required for the Microsoft Teams tab), so writes are checked explicitly:

| Check | Applies to | Failure |
| :--- | :--- | :--- |
| Origin: `Sec-Fetch-Site: same-origin`, or an `Origin` that is in `CLIENT_ORIGIN` / `APP_URL` / `TRUSTED_ORIGINS` or matches the request host | All `POST`, `PUT`, `PATCH`, `DELETE` | `403 { "error": "Cross-site request blocked" }`, header `X-CSRF-Error: origin` |
| Token: `X-CSRF-Token` request header equal to the session's token | The same methods when a valid session cookie is sent, except `/auth/login`, `/auth/logout`, `/auth/microsoft` | `403`, header `X-CSRF-Error: token` |

The token is returned in the `X-CSRF-Token` **response header** of a successful login and of every authenticated response (for example `GET /auth/me`). It is bound to one sign-in and is never placed in a cookie or response body. The web client stores it in memory and adds it automatically; other clients must read it from `/auth/me` and send it back on writes. Requests with neither `Origin` nor `Sec-Fetch-Site` (non-browser clients) pass the origin check but still need the token when they send a session cookie.

**Rate limits.** Exceeding a limit returns `429 { "error": "Too many requests. Please wait and try again." }` with `Retry-After` and `RateLimit` headers. Defaults are in `server/src/middleware/rateLimits.ts`.

| Scope | Counted per | Limit |
| :--- | :--- | :--- |
| `POST /auth/login`, failed attempts only | client address + email | 5 / 15 min |
| `POST /auth/login`, failed attempts only | client address | 20 / 15 min |
| `/auth/microsoft*` | client address | 60 / 15 min |
| `POST /notifications/send-email`, `POST /admin/test-email` | user | 10 / min |
| `POST /records/:id/attachments` | user | 30 / 10 min |
| All `/api` except `/health` | user, or client address when signed out | 600 / min |

Counters are in process memory (single API instance) and reset on restart. The client address is the socket peer unless the request carries the Worker's `PROXY_SHARED_SECRET` headers or `TRUST_PROXY` is set; `X-Forwarded-For` is otherwise ignored.

**Proxy-only access (optional).** When the API runs with `REQUIRE_PROXY_SECRET=true`, every `/api` request except `GET /health` must carry the Worker's `x-mg-proxy-secret` header. Without it the API answers `403 { "error": "Direct API access is not allowed" }` before any CSRF check, rate limit or route. Off by default.

**Response headers.** Helmet defaults plus a Content-Security-Policy that allows only same-origin scripts and connections and limits framing (`frame-ancestors`) to the portal itself and Microsoft Teams hosts. `X-Frame-Options` is intentionally not sent because it cannot allow Teams. `worker.js` sends the same policy with the frontend HTML.

## 11. Attachment rules (SEC-07 / SEC-08)

Enforced by `POST /records/:id/attachments`. Limits are constants in `server/src/services/attachmentRules.ts`.

| Rule | Value | Response when broken |
| :--- | :--- | :--- |
| Single file size | 10 MB | `413` |
| Accepted types | PDF, JPG/JPEG, PNG, DOC (legacy Word), DOCX. Macro-enabled Word files (`.docm`) are not accepted | `400` |
| Content must match the type | See below | `400` `{ "error": "This file is not a valid ... " }` |
| Attachments per record | 10 | `409` `{ "error": "...", "code": "ATTACHMENT_QUOTA_EXCEEDED" }` |
| Total attachment size per record | 50 MB | `409`, same `code` |

**Content verification.** The file extension only selects which format the bytes must prove to be; the browser's `Content-Type` is never trusted and the stored type comes from the server's allow-list.

- **JPG / PNG:** framing check plus a real pixel decode (unchanged).
- **PDF:** `%PDF-1.x` or `%PDF-2.x` at byte 0, and the file must end with its `startxref` pointer and `%%EOF` marker with only whitespace after it. Anything prepended or appended is rejected.
- **DOC:** a valid OLE compound file header that contains a `WordDocument` stream entry. Other OLE files (spreadsheets, installers) are rejected.
- **DOCX:** the whole file must be one well-formed ZIP archive with nothing before, between or after its parts and no archive comment. Its index must list `[Content_Types].xml`, `_rels/.rels` and `word/document.xml`, and the content-type manifest must declare an ordinary Word document. Rejected: other ZIP-based files (spreadsheets, Java archives, plain archives), macro content (`vbaProject.bin` or a macro-enabled manifest), encrypted entries, entry paths that escape the package, more than 1000 entries, or more than 200 MB of declared unpacked size. Only the manifest is ever decompressed.

**Quota.** Counted inside the same transaction that holds the record row lock, before anything is written to storage, so parallel uploads cannot exceed it and a refusal leaves no file or database row. Records that already hold more than the limit are grandfathered: their files remain listed, downloadable and deletable, and new uploads are refused until the record is back under both limits.

**Memory and temporary files.** Uploads are written to a private quarantine folder (`POD_TEMP_DIR`, default the OS temp folder) under a random name, never buffered in memory. At most three whole files are held in memory at once for content checks, across uploads, photo verification and listings. The quarantined file is deleted when the request ends, whatever the outcome, and files left by a crash are removed at startup. Downloads are streamed.
