# Dashboard metrics

Every number on a dashboard is counted by one shared definition, and the same definition drives
the list that the tile opens. If a tile and its list ever disagree, that is a bug.

## Where the definitions live

| What | Where |
| :--- | :--- |
| Filter per metric (server) | `server/src/services/dashboardFilters.ts`, `dashboardRecordFilter(id)` |
| Tile counts | `GET /api/dashboard/stats`, each role branch counts through `dashboardRecordFilter` |
| Panels, previews, extra counts | `GET /api/dashboard/overview` (`server/src/services/dashboardOverview.ts`) |
| Sidebar badges | `GET /api/records/active-counts` with `server/src/services/activeRecordCounts.ts` |
| Same filter on the client | `client/src/utils/dashboardFilters.ts`, only for list screens, never for tile numbers |

Every count is intersected with the viewer's record scope, excludes deleted records and, for
every metric below, excludes drafts.

## Open RMA

Open RMA is **every RMA that is not completed and not a draft**: Scheduled, Pending, In Transit,
On-Hold and Rescheduled (`OPEN_RMA_STATUSES`). It is used by:

- the TASS Open RMA tile (`tass-open-rma`) and the list it opens,
- the Open RMA needing attention table badge and its "View all" link,
- the sidebar RMA badge, which counts the same statuses.

The three always show the same number. Other categories keep their sidebar rule (Scheduled,
In Transit, Pending).

## Age of an open RMA

Age is the number of Manila calendar days since the record last left Draft (`submitted_at`).

| Event | `submitted_at` |
| :--- | :--- |
| Created as a draft | none |
| Created as submitted | creation time |
| Submitted from Draft | now |
| Returned to Draft | cleared |
| Submitted again | now, so the age restarts |

Colour is never the only signal. 0 to 3 days is plain, 4 to 7 days is amber with an icon and
"Getting old", and above 7 days is red with an icon and "Over 7 days". The aging count
(`tass-rma-aging`) is open RMA older than 7 Manila days. Rows that the backfill could not date fall
back to their creation time.

The migration backfills existing records from the latest audit entry where `is_draft` went from Yes
to No, then from creation time for other non-draft records, and leaves drafts empty. Run
`npm run records:submitted-at-dry-run --workspace=mg-portal-server` first. It performs no writes and
prints how many rows each rule would set.

## Tiles by role

| Role | Tile | Filter id |
| :--- | :--- | :--- |
| TASS | Open RMA | `tass-open-rma` |
| TASS | On hold (RMA) | `tass-rma-on-hold` |
| TASS | Pick-ups pending | `tass-pending-pickups` |
| TASS | Collections to verify | `tass-pending-verification` |
| Sales Coordinator | Scheduled today | `sc-scheduled-today` |
| Sales Coordinator | Pending driver assignment | `sc-pending-assignment` |
| Sales Coordinator | On hold | `sc-on-hold` |
| Sales Coordinator | Rescheduled | `sc-rescheduled` |
| Sales Coordinator | Completed today | `sc-completed-today` |
| Logistics | Assigned to drivers today | `log-assigned-today` |
| Logistics | No driver assigned | `log-unassigned` |
| Logistics | Completed today | `log-completed-today` |
| Logistics | On hold or rescheduled | `log-on-hold-rescheduled` |
| Logistics | RMA transport requests panel | `log-rma-requests` |
| Admin | Unverified collections | `admin-unverified-collections` |

Active users, records this week and audit events today are not record filters. They keep their own
queries.

The Logistics **Completed today** tile includes every visible record type: Deliveries,
Procurement Pickups, Sales Orders, Accounting Collections and RMAs. It uses Time Out in Manila,
or the final completion time recorded by TASS for RMA (with Time Out for older completed RMAs).
Finishing RMA transport or verifying a collection does not set the record's completion date.
The tile opens a paginated list with the same filter across all categories. The Sales Coordinator
tile counts Deliveries only.

## Design rules

Dashboards are built only from `client/src/features/dashboard/ui/`: `DashboardPage`, `KpiRow`,
`KpiTile`, `DashboardPanel`, `RecordTable`, `AgeIndicator`, `StatusPill`, `EmptyState`,
`PanelError` and `TileSkeleton`.

- Tiles show a skeleton until the server answers. They never count the in-memory record list.
- A tile is one button with an accessible name. Without access to its screen it has no button.
- If the overview fails, tiles still render and each panel shows an error with Try again.
- Nothing animates under reduced motion, and UI copy has no em dashes.
- Refresh invalidates stats, overview and the sidebar counts together.
