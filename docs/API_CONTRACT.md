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
| GET | `/auth/microsoft/callback` | Public | SSO callback; matches `microsoftOid` then email; unknown users are created as `SALES_COORDINATOR` |
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
| GET | `/records` | any with access | List records in the caller's scope, newest first. Optional `company_id`, `category`, `limit` (1-100) and `cursor` (record id; requires `limit`) |
| GET | `/records/status-history-counts` | any with access | Status counts by day (`dateFrom`/`dateTo`, applied to `createdAt`) |
| GET | `/records/:id` | any with access | One record |
| GET | `/records/:id/audit` | any with access | Audit entries |
| GET | `/records/:id/remarks` | any with access | Append-only remark history |
| GET | `/records/:id/comments` | any with access | Comments |
| POST | `/records/:id/comments` | SC, LOG, ADM, DRV, TASS | Add a comment `{ "body": "..." }` |
| GET | `/records/:id/attachments` | any with access | POD attachment metadata |
| POST | `/records/:id/attachments` | SC, LOG, ADM, DRV | Upload one file (multipart field `file`, 10 MB max). Photos must be genuine JPG/PNG. Drivers: assigned runs only |
| GET | `/records/:id/attachments/:attachmentId/download` | any with access | Download through the API |
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
| PATCH | `/users/:id` | Update details/role (an admin cannot remove their own admin role) |
| PATCH | `/users/:id/deactivate`, `/activate` | Toggle (not for yourself) |
| DELETE | `/users/:id` | Delete (not yourself) |
| GET | `/users/:id/permissions` | Permission editor snapshot |
| PUT | `/users/:id/permissions` | `{ permissions: [{ screen, granted }], expectedVersion }`; `400` invalid, `409` stale |

## 6. Dashboard, reports, notifications, admin

| Method | Path | Guards / roles | Purpose |
| :--- | :--- | :--- | :--- |
| GET | `/dashboard/stats` | Auth, Res:dashboard | Role-specific KPI payload (SC, LOG, TASS, ADM, DRV variants) |
| GET | `/reports/summary` | Auth, Screen:statistical_reports | Summary; filters `dateFrom`, `dateTo`, `category`, `area`, `driver`, `status` |
| GET | `/notifications` | Auth | The caller's bell notifications |
| GET | `/notifications/unread-count` | Auth | Unread count |
| PATCH | `/notifications/read-all` | Auth | Mark all read |
| PATCH | `/notifications/:id/read` | Auth | Mark one read |
| POST | `/notifications/send-email` | Auth, Res:records | `{ recordId, trigger, recipients[] }`; record must be in the caller's scope |
| GET | `/admin/audit-log` | Res:admin; ADM | System-wide audit log |
| GET | `/admin/integration-status` | Res:admin; ADM | Mailer/SSO/storage status |
| POST | `/admin/test-email` | Res:admin; ADM | `{ to }` |

## 7. Data sampler and demo seeding

| Method | Path | Guards / roles | Purpose |
| :--- | :--- | :--- | :--- |
| GET | `/data-sampler/counts` | Res:dataSampler; ADM | Row counts |
| POST | `/data-sampler/generate` | Res:dataSampler; ADM | `{ module, count, fields }` generate sample records |
| POST | `/data-sampler/reset` | Res:dataSampler; ADM | `{ mode }` reset or reseed |
| POST | `/dev/reset-seed` | Res:admin; ADM | Re-run the demo seed; `403` when `NODE_ENV=production` |
| POST | `/dev/public-seed` | **Public** | Re-runs the demo seed with `force`; no auth and no production guard. See issues report 13.1 |
| POST | `/dev/public-seed-uat` | **Public** | UAT dataset; `403` unless `NODE_ENV!=production` and `UAT_SEED_ENABLED=true` |

## 8. Module access session contract (TSK-55)

Both `POST /api/auth/login` and `GET /api/auth/me` return `id`, `name`, `email`, `role`, account `permissions`, resolved `effectiveScreens`, allowed `resources` and `permissionVersion`. Protected UI must wait for this complete snapshot.

`GET /api/users/:id/permissions` additionally returns `catalog`, `roleDefaults` and `editableScreens`. `PUT /api/users/:id/permissions` takes `{ permissions: [{ screen, granted }], expectedVersion }` and returns the updated editor snapshot. Invalid input returns 400, a stale version returns 409, and unauthorized module access returns 403. An empty permission array resets overrides. See [Module access](MODULE_ACCESS.md) for authorization semantics and verification.
