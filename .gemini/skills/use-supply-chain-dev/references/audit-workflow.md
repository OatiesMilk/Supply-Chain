# Audit workflow

Use for requested code audits and substantive module/integration reviews. Resolve application paths from the repository root. Keep the review within the user's authorized scope.

## Establish coverage

Record the revision and working-tree state. Map the affected roles and workflows, distinguishing default screens, actual action authority and deployed activation. Inspect package scripts and relevant tests to understand existing coverage before claiming gaps. Inspect source before asking the user for information the repository can supply.

For each affected workflow trace:

`UI entry → API client → route/middleware → domain rules → transaction/audit/evidence → notification/cache updates → next role's view`

Follow imports and re-exports to implementations. Inspect shared middleware before alleging missing checks. Compare alternative entry paths into the same state and recovery after partial failure. For an entire-role review, cover Sales Coordinator, Logistics, Driver, TASS and Admin, including the handoffs between them.

## Evaluate the boundary that matters

| Concern | Evidence to seek |
| --- | --- |
| Permissions | Direct API behavior, category/ownership predicates, current-account reload, action Deny, stale sessions and hidden shared checks |
| State changes | Required inputs on all submission paths, allowed transitions, dates/timezones, duplicate requests, stale versions, transaction rollback |
| Evidence | Persisted verified content, accessible review for the approving role, protected downloads, failure/retry and attachment deletion rules |
| Notifications | Real recipient resolution and provider call; queued/mocked/sent/skipped/failed outcomes; duplicate triggers; post-commit failures; durable scheduling assumptions |
| Inventory/finance | Actual relations and ledger writes; reserve/release/issue/return ownership; whether tracking is being mistaken for reconciliation |
| Frontend integration | Permission refresh, cache invalidation, previous-session data isolation, list/detail consistency, next-role visibility and truthful success messages |
| Completeness and scale | Placeholder tabs, bounded lists, identifier uniqueness, missing relations and partial integrations with demonstrated operational impact |

Do not add stock or financial automation during an audit. A planned capability is not a regression. Configured credentials, provider support, a success toast or Delivered status do not prove an external side effect occurred.

## Verify proportionally

Use minimal source traces or isolated reproductions that can distinguish the suspected failure from correct behavior. For authorization, include a denial case and inspect all enforcement layers. For races, identify the interleaving and predicate/lock that permits it. Label mocked database evidence explicitly; it does not prove live PostgreSQL behavior.

Keep temporary reproductions outside tracked application paths and use database doubles or designated disposable targets. Do not write business data, send real email, reset databases or start extra development servers just to audit. Reuse existing appropriate tests; broaden checks when unresolved evidence warrants it. If a material concern cannot be verified, report it as unverified rather than a confirmed defect.

## Deliver a reviewable report

For each finding include severity, affected role/workflow, concrete trigger, expected/actual behavior, source file/line, evidence or reproduction, practical impact and suggested remedy. Order correctness/security/data-integrity findings before structural concerns. Separate:

- Confirmed defects: demonstrated incorrect behavior or a complete source trace.
- Capability gaps: planned/missing functionality needing a business decision.
- Unverified concerns: plausible risks with an explicit missing verification step.

Report strengths and role/module coverage as well as defects. State exact checks, counts and skips, and distinguish unit/router checks, real database tests, browser tests and external-provider verification. Do not equate passing suites with complete workflow coverage or production readiness.

A requested report may be written to `docs/`. Preserve the distinction between findings and fixes; do not commit, open/update tickets, publish, or alter application state unless the user authorizes that work. When temporary artifacts may disappear, record enough evidence in the durable report to understand the finding later.
