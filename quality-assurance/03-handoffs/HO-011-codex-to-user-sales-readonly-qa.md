# HO-011: Sales Coordinator read-only QA complete

| Document control | Value |
|---|---|
| Title | Sales Coordinator read-only QA complete |
| Date | 2026-10-15 |
| From | Codex |
| To | User |
| Status | Read-only phase Complete; remaining write and other-role phases Blocked |
| Related run | RUN-20261015-08 |
| Previous handoff | HO-010 |

## Summary

Continued QA with the user's Microsoft Sales Coordinator account. Reviewed 21 focused checks: 17 Pass, 4 Fail. The failures reproduce three existing findings: DEF-003 (approved Calendar/Reports access), DEF-005 (Delivery Date optional label, label subset only) and DEF-030 (direct Enter leaves global search open, Sales adaptation). No new duplicate defect reports were created.

Twenty checks used the Sales session; one verified a separate anonymous context. This is not 21 complete approved UAT cases. Four preliminary timing, endpoint and locator diagnostics were superseded explicitly in the report; their original evidence remains preserved.

## What was done

- Verified protected-route redirects, API denial, delivery filters/search, record/audit/document reads, Draft UI controls, dashboard drilldowns, transaction category scope, customer/supplier directories, AM Directory, notifications and refresh persistence.
- Verified the settled Sales chart shows five bars and Delivered tooltip 33; this does not close the historical Admin chart finding.
- Verified anonymous admin navigation reaches Login and records/users endpoints return HTTP 401.
- Captured screenshots, sanitized GET responses, post-login action traces, console logs and a complete artifact index. JSON evidence parses and trace network files are empty.
- Updated only result/status/evidence/defect cells for cases with recorded observations, with partial coverage explicit. Appended current retest evidence to the three existing defect reports.
- Added reproducible read-only case definitions and an in-memory session harness. QA TypeScript validation and diff whitespace checks pass.

The Microsoft browser session was closed after this phase. No passwords, session cookies or tokens were exported. No application code, business data, environment settings, permission grants, seeds, branches, commits or pushes changed.

## Blockers and next phase

The current API configuration did not pass the project's disposable local database guard. All create, edit, upload, comment and refusal writes were blocked, including the unexecuted POST step of TC-ACC-002 and submission step of TC-DEL-004. The user must provide a running API against a verified disposable local database before write QA resumes. This handoff does not authorize seeding or resetting it.

Logistics, Driver, TASS and Admin sessions were not available. Those workflows and cross-role tests remain Blocked; one Sales account was not used to impersonate them. Existing cycle exclusions remain Not Run. The recommendation remains No-Go for UAT sign-off because the Major access finding is open and essential write/multi-role coverage is incomplete.

## Open findings reproduced

| Finding | Existing severity | Current observation |
|---|---|---|
| DEF-003 | Major / P1 | Calendar and Reports absent/redirected; Reports API 403 |
| DEF-005 | Trivial / P4 | Delivery Date label still optional; submission not rerun |
| DEF-030 | Minor / P3 | Direct Enter leaves overlay open; ArrowDown then Enter works |

## Links

- [Focused QA summary](../06-reports/UAT-summary-RUN-20261015-08.md)
- [Execution log](../04-execution/RUN-20261015-08/execution-log.md)
- [Reviewed results](../artifacts/RUN-20261015-08/reviewed-results.json)
- [Artifact index](../artifacts/RUN-20261015-08/index.md)
