# Plan: Logistics dashboard "Drivers out for delivery" shows the right drivers

Status: stage 1 (plan). Waiting for Dylan's approval. No code changes yet.
Date: 2026-11-12
Base branch: `dev` at `d2cb412` (PR #309 driver job cards merged)
Feature branch for stage 2: `feature/logistics-drivers-out` off `dev`
Screen: Logistics dashboard, panel "Drivers out for delivery"
(`client/src/features/dashboard/LogisticsDashboard.tsx`, data from `server/src/services/dashboardOverview.ts`)

## 1. Summary

The panel only looks at two of the four driver job types, only at jobs dated today, and groups by a
name snapshot as well as the driver id. So drivers on Procurement Pickup or Sales Order runs never show,
a driver who started yesterday's run and is still on the road disappears, on-hold and rescheduled jobs
make a driver look "out", and one driver can appear twice. The fix gives the panel one server-side
definition of "out for delivery" that covers all four job types and counts distinct drivers by their
Driver profile.

## 2. Current behaviour (verified in code on `dev`)

`dashboardOverview.ts` builds the panel from this filter:

```ts
{ draft: false, deliveryDate: today, driver: { not: '' }, status: { not: 'ACCOMPLISHED' }, OR: [
  { category: 'DELIVERY' },
  { category: 'RMA', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: { not: 'COMPLETED' } },
] }
```

then `groupBy({ by: ['driverId', 'driver'] })`, and `drivers_out_total = groups.length`.

| # | Problem | Effect on screen |
|---|---------|------------------|
| P1 | `PROCUREMENT_PICKUP` and `SALES_ORDERS` are not in the `OR`. | A driver whose jobs today are pickups or sales orders is missing, and other drivers' counts are too low. The Driver Board and the driver's own job cards (PR #309) do include these types, so the numbers disagree. |
| P2 | `deliveryDate: today` only. | A run that was started (Time In recorded, or RMA transport In Transit) on an earlier date and is still open is not counted, although the driver is on the road. |
| P3 | `status: { not: 'ACCOMPLISHED' }` keeps `ON_HOLD` and `RESCHEDULED`. | A driver whose only job today is on hold or moved to another day is shown as out for delivery. |
| P4 | Grouped by `driverId` **and** the `driver` name snapshot. | If a profile was renamed, or older rows have the same name with no `driverId`, the same person appears as two cards and the total counts them twice. The client also uses `key={driver}`, so two cards with the same name collide in React. |
| P5 | Rows with `driverId = null` but a `driver` name are counted. | Legacy rows that no Driver login can act on (ownership is decided by `driverId`, see `schema.prisma`) inflate the panel. |
| P6 | Card says "N active deliveries" for every job type, and links are in creation order. | RMA, pickup and sales order runs are labelled as deliveries; the run that is actually in transit may be hidden behind "+N more". |

Out of scope but noted: the "Assigned to drivers today" KPI (`log-assigned-today`) also counts
`DELIVERY` only. Its tile says "deliveries", so it is consistent with its label. Changing it is a
separate decision (see 8).

## 3. Definition of "out for delivery" (the rule this plan implements)

A driver is **out for delivery** when they have at least one **active job** visible to the Logistics user.
A record is an active job when all of these hold:

- `deletedAt` is null, `draft` is false, and it is inside `recordScope(user)` (unchanged).
- `driverId` is set (assigned to a Driver profile).
- It is one of the four driver job types:
  - `DELIVERY`, `PROCUREMENT_PICKUP`, `SALES_ORDERS`: `status` in `SCHEDULED`, `IN_TRANSIT`, `PENDING`
    (not `ACCOMPLISHED`, `ON_HOLD`, `RESCHEDULED`).
  - `RMA`: `rmaMovement = 'LOGISTICS_TRANSPORT'`, `rmaTransportStatus` in `PENDING`, `IN_TRANSIT`,
    and `status` not `ACCOMPLISHED`, `ON_HOLD`, `RESCHEDULED`. RMAs with another movement method
    (customer drop-off, internal handling without a driver) never count.
- It is for today **or** already started:
  - `deliveryDate = today` (Manila date, `manilaToday()`), or
  - started and not finished: non-RMA with `timeIn` set (covers legacy `SCHEDULED` + Time In, which
    `runState` treats as In Transit), or RMA with `rmaTransportStatus = 'IN_TRANSIT'`.

A job is **in transit** when it is started by the rule above. Accounting Collection is not a driver job
type and stays out.

## 4. Changes

### 4.1 Server

1. New `driversOutFilter(today)` in `server/src/services/dashboardFilters.ts`, returning the rule in 3,
   plus `inTransitFilter` for the started subset. One definition, exported for tests and reuse.
2. `dashboardOverview.ts` (Logistics branch):
   - `groupBy({ by: ['driverId'] })` on `scoped(driversOutFilter(today))`, ordered for display after the
     names are known. `drivers_out_total` = number of distinct `driverId`s.
   - A second `groupBy({ by: ['driverId'] })` with the in-transit filter gives `in_transit` per driver.
   - One `driver.findMany({ where: { id: { in: ids } }, select: { id, name } })` for the current profile
     name; fall back to the record's `driver` snapshot if the profile is missing.
   - Sort drivers: most jobs in transit first, then most active jobs, then name. Preview the first 10
     (`PREVIEW_LIMIT`, unchanged).
   - Per previewed driver, up to 3 linked records, in-transit first, then `deliveryDate`, `createdAt`, `id`.
   - All reads stay bounded counts/groupBys; no record history is loaded (same guarantee as today).
3. Response shape, additive only (`client/src/api/index.ts` type updated):
   ```ts
   drivers_out: Array<{ driver_id: string; driver: string; total: number; in_transit: number; records: DeliveryRecord[] }>;
   drivers_out_total: number;            // distinct drivers
   drivers_out_jobs_total: number;       // active jobs across all those drivers
   ```

No database migration and no data writes.

### 4.2 Client (`LogisticsDashboard.tsx`)

- `key={driver_id}` instead of the name.
- Card subtitle: "N active jobs · M in transit" (singular forms handled). "jobs" replaces "deliveries"
  because the card mixes types.
- Each linked record shows its type label ("Delivery", "RMA", "Procurement Pickup", "Sales Order"), same
  labels as the driver job card, and an "In transit" marker when started.
- Empty state text: "No drivers are out for delivery today".
- No change to layout, KPI row, or the other panels.

## 5. Permissions

No change. Data stays inside `recordScope(user)` and the existing Logistics dashboard route guards. The
record links still go through `screenKeyForCategory` and the target screen's own access checks; links
the user cannot open are rendered as text (same `canAccess` pattern the panel already uses for the footer).

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Legacy rows with a driver name but no `driverId` stop showing. | Intended (no driver can act on them). Before release, run the existing read-only `server/prisma/report-driver-identity.ts` on staging to see how many open rows are affected. |
| Overdue runs never started (date in the past, no Time In) are not shown here. | They are not "out"; they already appear in the flags / unassigned views and the Driver Board. Called out in QA. |
| Two more small queries per dashboard load. | Both are `groupBy` on indexed columns (`driverId`, `deliveryDate`, `[deletedAt, category, status]`); bounded to 10 drivers × 3 records for previews. |
| Manila "today" vs UTC. | Reuse `manilaToday()`, the same helper the rest of the dashboard uses. |

## 7. Acceptance criteria (testable)

Fixture for AC1 to AC8: Logistics user, today = Manila date, Driver profiles A, B, C, D.

1. **All four types.** A has only a `PROCUREMENT_PICKUP` job today (`SCHEDULED`), B only a `SALES_ORDERS`
   job today. Both appear, `drivers_out_total = 2`.
2. **RMA transport only.** C has an RMA with `LOGISTICS_TRANSPORT`, `rmaTransportStatus = PENDING`, today: C
   appears. An RMA with any other movement, or `rmaTransportStatus = COMPLETED`, does not count.
3. **Started earlier, still open.** D has a `DELIVERY` dated yesterday with Time In recorded and status
   `IN_TRANSIT` (and a second one `SCHEDULED` + Time In): D appears with `in_transit = 2`. A `DELIVERY`
   dated yesterday with no Time In does not count.
4. **On hold / rescheduled / done do not count.** A driver whose only jobs today are `ON_HOLD`,
   `RESCHEDULED` or `ACCOMPLISHED` does not appear. Draft and soft-deleted records do not count.
5. **Distinct drivers.** One driver with 5 jobs (mixed types) appears once with `total = 5`. If the
   record `driver` snapshot differs between those rows, still one card, showing the current profile name.
6. **No profile, no card.** A record with `driver = 'Old Name'` and `driverId = null` is not counted.
7. **Scope.** Records outside `recordScope(user)` are never counted or previewed.
8. **Ordering and preview.** Drivers with jobs in transit come first; at most 10 drivers and 3 records per
   driver are returned; the in-transit record is among the 3 when one exists; `total` still reflects all jobs.
9. **UI.** Card shows "N active jobs · M in transit", each link shows its type label, React keys are
   driver ids (no duplicate-key warning), footer "Showing X of Y drivers" appears only when Y > 10, empty
   state reads "No drivers are out for delivery today".
10. **Consistency.** For the same data, the set of drivers on the panel equals the drivers that have at
    least one active job dated today or started on the Driver Board.
11. **No regressions.** Existing `server/tests/dashboardOverview.test.ts`, dashboard counts and lifecycle
    tests, and client dashboard tests pass; `npm run typecheck` and lint pass.

## 8. Open question for Dylan

- Should "Assigned to drivers today" KPI also count all four job types? Recommendation: leave it as-is in
  this fix (its tile says "deliveries") and raise it separately if wanted.

## 9. Stage 2 phases (one commit each, tests alongside)

1. `feat(api)`: `driversOutFilter` / `inTransitFilter` + unit tests for AC1 to AC7 (filter shape).
2. `fix(api)`: dashboard overview grouping by `driverId`, profile names, in-transit counts, ordering, new
   fields + tests for AC5, AC8 in `dashboardOverview.test.ts`.
3. `fix(client)`: Logistics panel keys, labels, empty state + component test for AC9.
4. `test(e2e)`: Logistics dashboard check seeded with one job of each type (AC1, AC3, AC9).
