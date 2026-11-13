# Plan: Transport requests and in-transit records on role dashboards

Status: stage 1 (plan). Waiting for Dylan's approval. No code changes yet.
Date: 2026-11-12
Base: `feature/logistics-drivers-out` at `af019b0` (TODO item 1, not merged into `dev` yet). It holds the
shared driver-job rule (`driversOutFilter`, `driversInTransitFilter`, `driversWaitingFilter` in
`server/src/services/dashboardFilters.ts`) that this plan reuses.
Feature branch for stage 2: `feature/role-dashboard-in-transit` (created off `feature/logistics-drivers-out`;
rebased onto `dev` once that branch is merged).
Covers TODO items 2, 3 and 4. Items 5 (record ID length) and 6 (Main vs Dashboard pages) are handled separately.

## Approved decisions (2026-11-12)

1. SC "In transit" covers `DELIVERY`, `PROCUREMENT_PICKUP` and `SALES_ORDERS`, with a Type column (open question 8.1).
2. Transport requests are driver jobs with no Driver profile (`driverId = null`), the "needs driver only" reading
   of open question 8.2. The preview no longer needs a "no driver first" sort.
3. `log-rma-requests` stays exactly as it is. It still includes assigned RMA, so AC5 becomes: every RMA transport
   request is also in `log-rma-requests`.

## 1. Summary

| # | Dashboard | Today | After this change |
|---|-----------|-------|-------------------|
| 2 | Logistics | Panel "RMA transport requests" lists only RMA with Logistics transport. | Panel "Transport requests" lists every open driver job: Deliveries, RMA (Logistics transport), Procurement Pick-up and Sales Orders, with a type column and per-type "View all" links. |
| 3 | Sales Coordinator | Only a status chart. In-transit deliveries are a bar in the chart, with no list. | New panel "In transit" that lists the SC's deliveries currently on the road (see open question 8.1 for Pick-up and Sales Orders). |
| 4 | TASS | Panel "Open RMA needing attention" (On-Hold first, oldest). Nothing shows which RMA a driver is carrying now. | New panel "RMA in transit" listing Logistics-transport RMA whose transport has started and not finished. |

All three use the item 1 rule, so "in transit" means the same thing on the Logistics drivers panel, the SC
panel, the TASS panel and the Driver Board.

## 2. Current behaviour (verified in code on `feature/logistics-drivers-out`)

- `server/src/services/dashboardOverview.ts`, Logistics branch: `record_previews.rma_requests` and
  `counts.rma_requests` come from `dashboardRecordFilter('log-rma-requests')`, which is
  `category = 'RMA', rmaMovement = 'LOGISTICS_TRANSPORT', status != ACCOMPLISHED, rmaTransportStatus != COMPLETED`.
  No other job type is read.
- Sales Coordinator branch: four attention counts and `status_totals` for `DELIVERY` only. No record previews.
- TASS branch: open RMA counts and `record_previews.rma_attention`. No transport-state preview.
- `client/src/features/dashboard/LogisticsDashboard.tsx` renders the RMA table, `SalesCoordinatorDashboard.tsx`
  and `TassDashboard.tsx` have no in-transit panel.
- Drill-down: each dashboard filter id (`server dashboardRecordFilter`, mirrored by
  `client/src/utils/dashboardFilters.ts`) maps to one screen. `GET /records` intersects `dashboard_filter`
  with the screen's `category`, so one filter id that covers several types can be opened from each type's screen.
- Visibility: SC creates and reads Deliveries, Procurement Pick-up and Sales Orders and has no RMA access in
  operational rules. TASS reads only RMA and Accounting Collection (`readableCategories`). Logistics reads all four
  driver job types. Every read below stays inside `recordScope(user)`.

## 3. Definitions

**Driver job types**: `DELIVERY`, `PROCUREMENT_PICKUP`, `SALES_ORDERS`, and `RMA` with
`rmaMovement = 'LOGISTICS_TRANSPORT'`. RMA with any other movement never gets a driver and never counts.
Accounting Collection is not a driver job.

**Transport request** (Logistics, item 2): a driver job that still needs Logistics until the driver finishes it.

- `draft = false`, `deletedAt = null`, in scope.
- Non-RMA types: `status != ACCOMPLISHED`.
- RMA: `rmaMovement = 'LOGISTICS_TRANSPORT'`, `status != ACCOMPLISHED`, `rmaTransportStatus != 'COMPLETED'`
  (exactly today's `log-rma-requests` rule, unchanged).
- With or without a driver. On-Hold and Rescheduled stay in (Logistics has to re-dispatch them), as they do for
  RMA today.

This is the current RMA rule extended to the other three types. It is an assumption: if you meant "only jobs that
still need a driver", the panel would show the "Needs driver" subset only (say so when approving).

**In transit** (items 3 and 4): the started subset from item 1, `driversInTransitFilter`:

- Non-RMA: `status = IN_TRANSIT`, or Time In recorded (legacy Scheduled + Time In), and status not
  `ACCOMPLISHED`, `ON_HOLD`, `RESCHEDULED`, assigned to a Driver profile.
- RMA: Logistics transport, `rmaTransportStatus = 'IN_TRANSIT'`, final status not `ACCOMPLISHED`, `ON_HOLD`,
  `RESCHEDULED`, assigned to a Driver profile.
- Any planned date: a run started yesterday and still open is in transit.

## 4. Changes

### 4.1 Server

1. `dashboardFilters.ts`
   - `transportRequestFilter()`: the rule in 3, as one exported function.
   - New filter ids in `dashboardRecordFilter`:
     - `log-transport-requests` → `transportRequestFilter()`.
     - `sc-in-transit` → `driversInTransitFilter(today)` limited to the SC categories (see 8.1; default
       `DELIVERY` only).
     - `tass-rma-in-transit` → `driversInTransitFilter(today)` limited to `category = 'RMA'`.
   - `log-rma-requests` is kept and becomes `AND(transportRequestFilter(), { category: 'RMA' })`, so old links
     keep working and cannot drift from the new rule.
2. `dashboardOverview.ts`
   - Logistics: `counts['log-transport-requests']`, `transport_requests_by_type` (one `groupBy({ by: ['category'] })`),
     `record_previews.transport_requests` (10 rows: no driver first via `driverId nulls first`, then
     `deliveryDate`, `createdAt`, `id`). `rma_requests` is still returned for one release so a cached client keeps
     working, then removed.
   - Sales Coordinator: `counts['sc-in-transit']`, `record_previews.in_transit` (10 rows, oldest planned date first,
     then `createdAt`, `id`).
   - TASS: `counts['tass-rma-in-transit']`, `record_previews.rma_in_transit` (10 rows, oldest
     `rmaTransportStartedAt` first, nulls last, then `id`).
   - All reads are bounded counts, one `groupBy`, and `take: 10` previews. No history is loaded.
3. `server/src/routes/dashboard.ts` (KPI stats route): no change. The new numbers come from the overview.

Response shape, additive only (`client/src/api/index.ts` updated):

```ts
record_previews: {
  rma_requests: DeliveryRecord[];        // kept for one release
  rma_attention: DeliveryRecord[];
  transport_requests: DeliveryRecord[];  // Logistics
  in_transit: DeliveryRecord[];          // Sales Coordinator
  rma_in_transit: DeliveryRecord[];      // TASS
};
transport_requests_by_type: Partial<Record<'DELIVERY' | 'RMA' | 'PROCUREMENT_PICKUP' | 'SALES_ORDERS', number>>;
```

No database migration and no data writes.

### 4.2 Client

- `client/src/utils/dashboardFilters.ts`: add `log-transport-requests`, `sc-in-transit`, `tass-rma-in-transit` to
  `DASHBOARD_FILTERS` and `matchesDashboardFilter`, mirroring the server. `DASHBOARD_FILTERS[id].screen` stays a
  single default screen; the Logistics panel passes the screen per type.
- `LogisticsDashboard.tsx`: "RMA transport requests" becomes "Transport requests".
  - Columns: Type (Delivery, RMA, Procurement Pick-up, Sales Order, using `jobTypeLabel`), Record (RMA reference for
    RMA, record id otherwise), Company, Area, Date, Driver ("Needs driver" warning when empty), Status.
  - Row click opens the record on its own screen (`screenKeyForCategory`), only if `canAccess(screen)`.
  - Footer: "Showing X of Y requests" plus one "View N <type>" link per type with a non-zero count, each opening that
    type's screen with `log-transport-requests`. Links for screens the user cannot open are plain text.
  - Empty state: "No transport requests need dispatch".
- `SalesCoordinatorDashboard.tsx`: new full-width panel "In transit" under the chart row.
  - Columns: Record, Company, Area, Planned date, Driver, Started (Time In), Status. Type column only if 8.1 adds
    more types.
  - Footer: "Showing X of Y" and "View all N in transit" to `deliveries` with `sc-in-transit`.
  - Empty state: "No deliveries are in transit".
- `TassDashboard.tsx`: new panel "RMA in transit" under "Open RMA needing attention".
  - Columns: RMA (reference, record id below), Company, Area, Driver, Transport started, Final RMA status.
  - Footer: "View all N in transit" to `rma` with `tass-rma-in-transit`.
  - Empty state: "No RMA are in transit".
- Panels reuse `DashboardPanel`, `RecordTable`, `EmptyState`, `PanelError`, `TileSkeleton`; loading and error states
  match the existing panels. No KPI tile changes.

## 5. Permissions

No change to roles, module access or `recordScope`. Each role only sees records it can already read:
TASS never gets non-RMA rows (its scope excludes them), SC never gets RMA rows. Links to screens the viewer cannot
open render as text (`canAccess`), the pattern the dashboards already use. Admin's dashboard is unchanged.

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Depends on `feature/logistics-drivers-out`, which is not merged. | Build on it; rebase onto `dev` after it merges. If item 1 changes in review, this branch picks up the same functions. |
| The Logistics panel gets longer with four types. | Preview stays at 10 rows, unassigned first; per-type counts and links in the footer. |
| A client from before this release reads `rma_requests`. | Kept for one release, removed in a follow-up. |
| Started legacy rows with no Driver profile are not "in transit". | Same as item 1, intended. The read-only `server/prisma/report-driver-identity.ts` shows how many on staging. |
| Three to four more small queries per dashboard load. | Count, groupBy and `take: 10` on indexed columns (`[deletedAt, category, status]`, `[category, rmaMovement, rmaTransportStatus]`, `driverId`). |
| Client and server filter mirrors drift. | Shared fixture test asserts the client `matchesDashboardFilter` and server filter pick the same rows. |

## 7. Acceptance criteria (testable)

Fixture: Driver profiles A and B, one record of each driver job type per role scope, Manila today.

**Logistics (item 2)**

1. Transport requests include an open `DELIVERY`, `PROCUREMENT_PICKUP`, `SALES_ORDERS` and Logistics-transport RMA,
   with and without a driver. `counts['log-transport-requests'] = 4` and `transport_requests_by_type` has 1 for each.
2. Not included: drafts, soft-deleted, `ACCOMPLISHED` records, RMA with `rmaTransportStatus = COMPLETED`, RMA with a
   movement other than `LOGISTICS_TRANSPORT`, Accounting Collection.
3. On-Hold and Rescheduled jobs of every type are included.
4. Preview holds at most 10 rows, rows with no driver come first, then oldest date.
5. `log-rma-requests` returns exactly the RMA subset of `log-transport-requests`.
6. UI: panel title "Transport requests", a Type column with the four labels, "Needs driver" for unassigned rows,
   row click opens the record on its own screen, footer per-type links open that screen filtered by
   `log-transport-requests` and the list shows the same rows the panel counted.

**Sales Coordinator (item 3)**

7. A `DELIVERY` with status `IN_TRANSIT` (any planned date) and a legacy `SCHEDULED` + Time In delivery both appear;
   `counts['sc-in-transit'] = 2`.
8. Not included: Scheduled without Time In, Pending, On-Hold, Rescheduled, Accomplished, drafts, deliveries with no
   Driver profile, and (unless 8.1 says yes) Pick-up and Sales Orders.
9. Only records in the SC's `recordScope` are counted or previewed.
10. UI: "In transit" panel with the columns in 4.2, "View all N in transit" opens Deliveries filtered to the same rows,
    empty state when none.

**TASS (item 4)**

11. A Logistics-transport RMA with `rmaTransportStatus = IN_TRANSIT` appears; `counts['tass-rma-in-transit'] = 1`.
12. Not included: transport `PENDING` or `COMPLETED`, final status On-Hold, Rescheduled or Accomplished, other movement
    methods, and every non-RMA record.
13. UI: "RMA in transit" panel shows driver and transport start time, oldest start first, "View all" opens RMA
    filtered to the same rows, empty state when none.

**Shared**

14. The SC and TASS in-transit sets equal the in-transit jobs the Logistics "Drivers out for delivery" panel counts
    for the same data, limited to each role's types.
15. Client `matchesDashboardFilter` and server `dashboardRecordFilter` select the same records for the three new ids.
16. No regressions: existing server dashboard tests, client dashboard tests, `npm run typecheck` and lint pass.

## 8. Open questions for Dylan

1. **SC in-transit panel types.** SC also creates Procurement Pick-up and Sales Orders. Should the SC "In transit"
   panel show only Deliveries (as the TODO says) or all three SC types? Recommendation: all three, with a Type column,
   since SC follows up on all of them and drivers run all of them. Default if no answer: Deliveries only.
2. **Transport requests definition.** Plan assumes every open job until transport is done (current RMA rule). Confirm,
   or say "needs driver only".

Not in scope, noted for later: a TASS view of RMA whose transport is complete and awaiting physical receipt.

## 9. Stage 2 phases (one commit each, tests alongside)

1. `feat(api)`: `transportRequestFilter`, new filter ids, `log-rma-requests` rebased on it + filter tests (AC1 to AC3,
   AC5, AC7, AC8, AC11, AC12).
2. `feat(api)`: overview fields for Logistics, SC, TASS + `dashboardOverview.test.ts` cases (AC4, AC9, AC14).
3. `feat(client)`: client filter mirror + parity test (AC15).
4. `feat(client)`: Logistics "Transport requests" panel + component test (AC6).
5. `feat(client)`: SC "In transit" and TASS "RMA in transit" panels + component tests (AC10, AC13).
6. `test(e2e)`: seeded check per role dashboard (AC6, AC10, AC13).
