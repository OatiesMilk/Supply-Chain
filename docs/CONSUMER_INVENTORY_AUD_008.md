# AUD-008: Consumer Inventory & API Contract Specification

> **Task Reference:** GitHub Issue [#154](https://github.com/MarcZxc1/Supply-Chain/issues/154) — `[Cycle 2][P2] AUD-008 — Server-side pagination, filtering and bounded record queries`  
> **Backlog:** `docs/AUDIT_DEVELOPMENT_BACKLOG.md` (AUD-008)  
> **Prerequisite:** PR #151 (route-level query gating & `GET /api/records/active-counts` merged)  
> **Reviewers:** Dylan (API/security), Julius (client/UAT)

---

## 1. Executive Summary

Prior to this work, `GET /api/records` had rudimentary optional `limit` and `cursor` parameters on the server, but frontend hooks and screens (`useAppData`, `useRecordsQuery`, `DeliveriesPage`, `AccountingCollectionView`, `MainView`) eagerly loaded the entire unpaginated `DeliveryRecord[]` table into client memory. 

As historical operational data scales (e.g. past 10,000 records), downloading the entire dataset causes:
1. Long initial page load latency and heavy network payload transfer.
2. High browser memory consumption and potential UI jank during in-memory filtering/sorting.
3. Wasteful queries for views that only need the current page or a scoped aggregate.

This document inventories every consumer in the application, categorizes their data access pattern, and defines a robust, secure, and backward-compatible server pagination contract.

---

## 2. Consumer Inventory & Access Pattern Classification

| Consumer Component / Hook | File Location | Access Pattern Category | Data Scope & Strategy |
| :--- | :--- | :--- | :--- |
| **Sidebar Active Counts** | `App.tsx`, `Sidebar.tsx` | **Server Aggregate** | Already uses `GET /api/records/active-counts`. Scoped SQL `groupBy` counts by category/status. Does not fetch records. |
| **Deliveries View** | `client/src/features/deliveries/DeliveryRecordsView.tsx` | **Paginated List** | Queries bounded page (e.g. 10/25/50/100) using `paged=true`, `page`, `limit`, `category=Deliveries`, and server-side filters. |
| **RMA View** | `DeliveriesPage.tsx` (`category='RMA'`) | **Paginated List** | Bounded page query with `category=RMA`. Logistics receives read-only view. |
| **Procurement Pick-up View** | `DeliveriesPage.tsx` (`category='Procurement Pick-up'`) | **Paginated List** | Bounded page query with `category=Procurement Pick-up`. |
| **Sales Orders View** | `DeliveriesPage.tsx` (`category='Sales Orders'`) | **Paginated List** | Bounded page query with `category=Sales Orders`. |
| **Accounting Collection View** | `client/src/features/accounting/AccountingCollectionView.tsx` | **Paginated List** | Bounded page query with `category=Accounting Collection`. |
| **Main View (All Operations)** | `client/src/pages/MainView.tsx` | **Paginated List** | Bounded page query with `category` (optional), status filters, date range, and pagination. |
| **Dashboard KPIs & Stats** | `client/src/features/dashboard/DashboardView.tsx` | **Server Aggregate** | Uses `GET /api/dashboard/stats` for role-specific KPI totals (Scheduled today, Unassigned, Completed today, etc.). |
| **Calendar View** | `client/src/features/deliveries/DeliveryCalendar.tsx` | **Date-Bounded Query** | Queries records bounded by the active calendar month date range (`dateFrom` to `dateTo`). |
| **Account Manager Directory** | `client/src/features/admin/AccountManagerDirectory.tsx` | **Server Aggregate / Bounded Detail** | Uses `GET /api/records/am-summary` for aggregated metrics per AM. Individual AM drill-downs query bounded records with `account_manager=X`. |
| **Driver Board / View** | `client/src/features/drivers/` | **Date & Active-Bounded List** | Bounded queries scoped to scheduled/active assignments. |
| **Driver Mobile Dashboard** | `client/src/features/dashboard/DriverDashboard.tsx` | **Driver-Scoped Bounded List** | Scoped strictly to the logged-in driver's active assignments via `recordScope(req.user)`. |
| **Global Search Modal** | `client/src/components/GlobalSearch.tsx` | **Server Search Query** | Live query via `GET /api/records?search=<query>&limit=8&paged=true` directly in the database. Returns top 8 matches across the entire authorized dataset without loading full history. |
| **Export Menus** | `ExportMenu.tsx`, `AllOpsExportMenu.tsx`, Route slips | **Explicitly Full / Export** | When triggered by user export action, fetches complete authorized records using deterministic cursor iteration (`limit=100`) or dedicated export stream. Never presents partial page as full export. |
| **Notification Deep-Link** | `client/src/utils/notificationNavigation.ts` | **Distinct Bounded Detail** | Single-record lookup via `GET /api/records/:id`. Preserved. |
| **Company History Modal** | `client/src/api/queries/useCompanyRecordsQuery.ts` | **Cursor-Paginated List** | Uses `useInfiniteQuery` with `company_id`, `category`, `limit=25`, and `cursor`. |

---

## 3. Server Pagination & Filter Contract

### Endpoint: `GET /api/records`

Guards: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

#### Query Parameters

| Parameter | Type | Validation / Rules | Description |
| :--- | :--- | :--- | :--- |
| `paged` | `boolean` (`"true"` \| `"1"`) | Optional boolean flag | When present and true, returns the paginated contract `{ rows, nextCursor, hasMore, total, page, limit }`. When absent, returns legacy `DeliveryRecord[]` for full backward compatibility. |
| `limit` | `integer` (1–100) | Default `25` when paged, max `100`. Reject non-numeric or out-of-range with `400`. | Number of rows to return per page. |
| `cursor` | `string` | Regex `^[\w=-]{1,128}$`. Opaque token encoding `createdAt` and `id` (or fallback record ID). Reject malformed with `400`. | Cursor for forward pagination. Survives concurrent deletes/inserts and same-timestamp records. |
| `page` | `integer` (>= 1) | Optional page number for offset-based pagination. Reject invalid with `400`. | When provided without cursor, calculates `skip = (page - 1) * limit`. |
| `category` | `string` | Valid display or DB category (`Deliveries`, `RMA`, `Accounting Collection`, `Procurement Pick-up`, `Sales Orders`). Reject unknown with `400`. | Filter by operational category. Logistics RMA remains view-only; TASS restricted to allowed categories. |
| `status` | `string` | Valid status name (`Draft`, `Scheduled`, `In Transit`, `Delivered`, `On-Hold`, `Rescheduled`, `Pending`). Reject unknown with `400`. | Filters by effective state (e.g. `Draft` matches `draft: true`, `In Transit` matches `status: 'IN_TRANSIT'` or started runs with `timeIn`). |
| `dateFrom` | `string` (`YYYY-MM-DD`) | Must be valid calendar date. Reject invalid with `400`. | Filters `deliveryDate >= dateFrom`. |
| `dateTo` | `string` (`YYYY-MM-DD`) | Must be valid calendar date. Reject invalid with `400`. | Filters `deliveryDate <= dateTo`. |
| `search` | `string` (max 100 chars) | Case-insensitive substring search across `id`, `reference`, `company.name`, `driver`, `area`, `accountManager`. | Search keyword. |
| `driver` | `string` (max 100 chars) | Driver name or profile ID. | Filter by assigned driver. |
| `area` | `string` (max 100 chars) | Specific geographic area. | Filter by operational area. |
| `account_manager` | `string` (max 100 chars) | Account Manager name. | Filter by Account Manager. |
| `priority` | `string` | Must be one of `'1 - Low'`, `'2 - Moderate'`, `'3 - High'`. Reject invalid with `400`. | Filter by priority level. |
| `dashboard_filter` | `string` | Recognized filter ID from `dashboardFilters.ts`. | Applies server-side preset for dashboard drill-downs. |
| `company_id` | `string` | Regex `^[\w-]{1,64}$`. | Scoped company history. |

#### Response Shape

**When `paged=true`:**
```json
{
  "rows": [ /* serialized DeliveryRecord objects */ ],
  "nextCursor": "c_eyJjIjoiMjAyNi0xMC0xM1Q...", // null if hasMore is false
  "hasMore": true,
  "total": 142,
  "page": 1,
  "limit": 25
}
```

**When unpaginated (legacy compatibility):**
```json
[
  /* serialized DeliveryRecord objects */
]
```

---

## 4. Deterministic Cursor Implementation Details

### Composite Ordering
Records are sorted strictly by `createdAt DESC, id DESC`.
Because `id` is globally unique, the tuple `(createdAt, id)` provides total ordering.

### Cursor Encoding
The cursor is encoded as a base64url string containing:
```json
{ "c": "2026-10-13T06:30:00.000Z", "id": "REC-12345" }
```
When querying with a cursor, the server applies:
```sql
WHERE (
  ("createdAt" < cursorCreatedAt)
  OR ("createdAt" = cursorCreatedAt AND "id" < cursorId)
)
```

### Invariants:
1. **Survives Concurrent Deletion:** Because the cursor encapsulates `cursorCreatedAt` and `cursorId`, the query does not depend on the cursor record still existing in the database.
2. **Survives Same-Timestamp Records:** Multiple records inserted within the exact same millisecond are deterministically ordered by `id < cursorId`.
3. **Survives Concurrent Inserts:** New records inserted ahead of the cursor have `createdAt > cursorCreatedAt` and do not cause existing rows to shift or repeat across page boundaries.
4. **Backward Compatibility:** If an older client sends a raw record ID (e.g. `REC-10001`), the server looks up the record's `createdAt` to form the tuple, falling back gracefully if not found.

---

## 5. Security & RBAC Enforcement

1. **Mandatory Scope Intersection:** Every query—regardless of filters or cursor—is intersected with `AND: [recordScope(req.user!)]`.
2. **No Data Leakage:** Filtering by a non-existent or out-of-scope company, driver, or category returns an empty list `{ rows: [], total: 0 }` with no disclosure of existence.
3. **Driver Isolation:** DRIVER logins without linked profile see 0 records; DRIVER with linked profile sees only assigned runs matching `driverId`.
4. **Logistics RMA Read-Only:** Preserved across all paged and mutation routes.
5. **TASS Scope:** Restricted to RMA and Accounting Collection records.

---

## 6. Deprecation & Migration Strategy

1. Existing unpaginated API calls (`GET /api/records` without `paged=true`) continue to function without breaking.
2. Frontend operational pages switch to `usePagedRecordsQuery` or `api.getPagedRecords({ paged: true, ... })`.
3. Export menus use `api.getAllRecordsForExport(filters)` which deterministically pages through records in bounded batches (100 rows each) until `hasMore: false`.
4. Global search hits `/api/records?search=<term>&limit=8&paged=true` on demand.
