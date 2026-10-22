# Dashboard KPIs — issue #203

## Behavior and contract

The five roles keep separate operational views with four primary cards. Counts and matching lists use the server's `dashboardMetrics` predicates. The existing Driver action list, Time In, completion, POD and verification write routes remain in place.

- `GET /api/dashboard/overview`: server aggregates over all permitted, non-draft, non-deleted records; chart scope accepts module and scheduled-date range.
- `GET /api/dashboard/records`: matching, paginated read-only record list (25 rows per page, complete total). Accepts the same predicates plus KPI, status, overdue subset, age bucket or exact record ID.
- `GET /api/dashboard/users`: Admin-only active-account drill-down, 25 per page.
- `GET /api/dashboard/stats`: retained for compatibility and now applies category permission scope to record aggregates. New views use `/overview`.

Every new endpoint checks the authenticated dashboard screen. Records are scoped by `recordScope` **before** aggregation. Driver ownership uses the linked Driver profile ID. Explicit category denial cannot be overridden by a filter. The server supplies an operational detail destination only when the user can access that category screen.

The dashboard-owned list dialog is the authorized cross-module destination. This avoids navigating an all-module count into a category-only screen or Transaction Center with different permissions. Users can then open individual records in permitted category screens. Existing legacy list presets remain available to other consumers.

Chart filters affect the chart and its drill-down only. Fixed-scope cards do not change. Query keys include scope and page; cached results from another selection are not used as placeholders. Mutation invalidation retains the existing `dashboard-stats` prefix. Refresh failures retain cached results with a visible stale warning and last-successful timestamp.

## Date and assignment semantics

- All day boundaries use Asia/Manila; new week ranges are Monday through Sunday.
- Due Today includes completed records scheduled today. Completed Today uses actual completion time, including late completions scheduled earlier.
- Missing/invalid scheduled dates are counted separately, included in All dates and excluded from date ranges. They never become overdue.
- Open means non-completed. Legacy Scheduled records with valid Time In are shown as In Transit.
- Unassigned means no Driver profile ID. A name without an ID is unresolved; an assigned profile without a linked login is distinguished in lists.
- Verification ages are calendar days since completion: 0–1, 2–3, 4–7, 8+, Unknown. Missing, invalid or future completion times have Unknown age.
- Needs Attention deduplicates by record and shows all applicable reasons. Waiting age names its basis: scheduled date, completion or creation. Creation age is not claimed to be historical time since becoming unassigned.

## Implementation map

| Area | Main files |
| --- | --- |
| Shared predicates and validation | `server/src/services/dashboardMetrics.ts` |
| Authentication, scope, aggregates and matching lists | `server/src/routes/dashboardOverview.ts` |
| Typed client contract | `client/src/api/dashboardOverview.ts` |
| Role cards, charts, accessible list dialog and data states | `client/src/features/dashboard/OperationalDashboard.tsx` |
| Existing app integration | `DashboardView.tsx`, `DriverDashboard.tsx`, `useAppData.ts`, `pageDataState.ts` |
| Metric and authenticated API tests | `server/tests/dashboardMetrics.test.ts`, `server/tests/dashboardOverview.test.ts` |
| Browser tests | `e2e/tests/dashboard.spec.ts` (Dashboard project, no live data writes) |

## Verification and release boundaries

Unit and authenticated HTTP tests cover all five roles, paginated count/list parity, explicit denials, same-name Driver isolation, missing profiles, invalid parameters, database failures, drafts/deleted records, invalid dates, Manila midnight, Monday/Sunday boundaries, completion timestamps, verification ages and overdue subsets.

The Dashboard Playwright project uses intercepted API fixtures to cover role navigation, keyboard interaction, dialog pagination, chart/custom filters, mobile width, stale refresh and scope loading states. It complements the existing database-backed SC, Logistics, Driver and integration suites; it does not replace them.

No migrations, seeds, record rewrites, deployment or production configuration changes are included. Staging verification remains a release gate after normal review and approved deployment.

## Local validation results (2026-10-22)

- Full server suite: 283 passed, zero failures.
- Full client suite: 132 passed, zero failures.
- Dashboard Playwright suite: eight passed across all five roles, including chart filters, custom ranges, authorized navigation, keyboard/focus handling, pagination, mobile width, stale refresh and scope loading.
- Client and server TypeScript checks and production builds passed.
- Browser tests ran against local Vite with intercepted API fixtures and an environment-provided Chromium executable. The executable override is local only; CI uses its standard Playwright browser installation.
- Authenticated HTTP tests exercise the actual middleware and routes with stubbed database methods. Database-backed staging E2E was not run; no staging database was changed.

## Performance limits

The server currently reads a narrow permitted-record projection and aggregates it in memory. No attachments, line items or audit snapshots are loaded. The client receives aggregates and paginated list rows, not a partial-page-derived total. Dashboard navigation no longer fetches the full record/SKU/driver directories solely for chart counts.

Server work and memory still grow with the number of permitted records. This change makes no production performance claim and adds no speculative indexes. Measure query duration, heap usage and payload sizes against representative data before choosing SQL materialization, caching or additional indexes. Needs Attention is a complete deduplicated list and should also be measured at scale.
