# AI context and historical reports

Start with [AGENTS.md](../AGENTS.md), then read the
[routing skill](../.gemini/skills/use-supply-chain-dev/SKILL.md) and
[agent definition](../.gemini/agents/supply-chain-dev.md) when the task calls for
the project development workflow. The routing skill links focused permission,
lifecycle and audit references. The Antigravity agent's configured model does not
establish that the same agent/model is available in another runtime.

Current source and the user's task determine application behavior and scope.
Historical reports explain previous decisions and findings; they do not grant
permission to change application data, send notifications, publish, migrate a
shared database or activate permission policies.

## Health/readiness follow-up (2026-11-05)

The focused health repair is implemented locally on dev baseline `419b8bf`,
awaiting PR/merge/deployment. [Health routes](../server/src/routes/health.ts)
retain database/required-production-setting readiness while exposing only
an uncached boolean and 200/503 status. [render.yaml](../render.yaml) now selects
/api/v1/health. Authenticated Admin diagnostics still provide detailed checks.

Validation: 476 server tests passed with 5 optional PostgreSQL checks skipped;
4 client availability/recovery tests and both TypeScript checks passed.
The local in-app browser showed the minimal response and a working signed-in
Admin Integrations panel. Failure tests use doubles; Render application of the
setting and a real database outage were not exercised. See the
[implementation record](SUPPLY_CHAIN_IMPLEMENTATION_STATUS_2026-11-05.md#healthreadiness-follow-up).
Do not reimplement this repair from the older open SEC-10/AUD-011 descriptions.
Durable scheduled jobs remain open, independently of this health configuration.

## Current backlog reconciliation (2026-11-05)

### User decisions after PR #297

Recorded on 2026-11-05 against local dev at `15a7cd1`:

- Local-account password-policy work is deferred while development continues,
  at the user's request for easier development logins. This is deferred scope,
  not a completed security repair.
- Supplier categories will use an Admin-managed catalog, and each supplier may
  have multiple categories. This approved future requirement supersedes the
  proposed fixed-five-category validation repair; it is not implemented yet.
- Data Sampler is temporary development tooling and is excluded from the final
  product. The user requested no further fixes for it and its removal when
  development is complete. The previous category-permission decision is no
  longer an active fix request. Keep existing safeguards until the planned
  removal; this documentation update does not remove the module or its data.

See the [decision and retirement record](SUPPLY_CHAIN_IMPLEMENTATION_STATUS_2026-11-05.md#user-decisions-after-pr-297)
and [administration requirement](BUSINESS_REQUIREMENTS.md#39-administration-and-access).

### Reconciliation evidence

Start with the [current reconciliation](SUPPLY_CHAIN_IMPLEMENTATION_STATUS_2026-11-05.md#current-reconciliation)
and [AUD ticket mapping](AUDIT_DEVELOPMENT_BACKLOG.md#ticket-mapping-and-recommended-order).
They were source-checked against clean local dev at `6aad0f7` before the
documentation edits. The current register maps the original 11 AUD tickets,
32 QA defect records and recent role-audit findings to source evidence, required
decisions and acceptance checks. Source inspection and existing test files are
not a fresh browser, database or provider test run.

Creation-time attachments, SSO state/approved OID checks, CSRF/rate limits/headers
and ordinary record pagination already have implementations. Their original
backlog statements must not trigger duplicate repairs. Transaction Center still
has residual status/date and full-set query concerns. Current UI source also
matches the older Calendar/AM reference-label and View Full Log findings.
Password/supplier validation, audit action filtering, access-request confirmation
and Global Search selection retain the qualified scope in the register.

The three repairs in PRs #293–#295 are implemented; real PostgreSQL supplier
rollback and the other named acceptance checks remain separate tasks. Larger
master-data, inventory, Warehouse and scheduler changes need the stated business
or operating decisions. Several historical QA Open labels and the October
security/issues-report counts predate later fixes. Preserve those observations
and use the dated reconciliation to decide what to implement or retest.

## Initial implementation status snapshot (2026-11-05)

Read the [implementation status snapshot](SUPPLY_CHAIN_IMPLEMENTATION_STATUS_2026-11-05.md)
before relying on older audits for what is currently implemented. It records a
read-only browser cross-check of the five application roles, the source revision
reviewed (`e56a8da`), confirmed open fixes, capability decisions, and checks that
still need a disposable target. The November 4 UAT report was based on
`9a6fe2a`; its observations and synthetic data remain historical evidence.

The source reviewed at `e56a8da` had three confirmed open fixes: LEGACY
notification record visibility, Data Sampler submission validation, and atomic
supplier creation/audit. Logistics assignment notifications and completion
email handling also happen after their record transaction; failure behavior
remains unverified. The status snapshot records these findings and the proposed
fix order. This documentation update did not change application code or tests.
SKU workspace tabs and a separate Warehouse screen are capability/scope
decisions, not assumed accepted features.

## Follow-up implementation status (2026-11-05)

The refreshed `dev` branch at `2c4211d` includes PR #293 (LEGACY notification
visibility), PR #294 (Data Sampler validation), and PR #295 (atomic Supplier
creation/audit), resolving the three findings from the initial snapshot. The
Supplier fix passed three route tests; the server suite passed 467 tests with
5 optional PostgreSQL tests skipped, and the strict server TypeScript check
passed. An in-app check against `mg_portal_sandbox` showed the Supplier CREATE
event and its seven initial values in the System Audit Log; the temporary
supplier and audit row were removed, restoring the prior counts. PostgreSQL
rollback behavior remains unverified. The status snapshot distinguishes this
follow-up from the historical browser/source review at `e56a8da`.

| Document | Source and purpose |
| --- | --- |
| [Implementation status](SUPPLY_CHAIN_IMPLEMENTATION_STATUS_2026-11-05.md) | Current source reconciliation at `6aad0f7`, AUD/DEF dispositions and verification queue; preserves the earlier `e56a8da` review and PR #293–#295 merge evidence. |
| [Audit backlog](AUDIT_DEVELOPMENT_BACKLOG.md) | Original AUD-001–AUD-011 ticket scope with dated current implementation/decision notes; Notion mapping remains separate. |
| [Role functionality audit](ROLE_FUNCTIONALITY_AUDIT_2026-10-30.md) | Audit of `0e33fa7`; original findings F1–F8 and role/integration boundaries. Application-source links are pinned to that revision. |
| [Development skill review](SUPPLY_CHAIN_DEV_SKILL_REVIEW_2026-10-30.md) | Historical rationale for the maintained guidance and bounded evaluation evidence. Installed-copy and temporary-path details describe the original session. |
| [Role workflow audit](ROLE_WORKFLOW_IMPLEMENTATION_AUDIT_2026-10-30.md) | Audit of `82974de`; findings WF-01–WF-07 after the earlier remediation. |
| [PR #269 remediation](https://github.com/OatiesMilk/Supply-Chain/blob/75deb607e9248d2e53076581c4d40175f0195d7a/docs/ROLE_AUDIT_FIXES_2026-10-30.md) | Canonical F1–F8 implementation report, including the later validation added in its PR checkout. |
| [PR #270 remediation](https://github.com/OatiesMilk/Supply-Chain/blob/521aede81caefb24f4f184c01abaf45eb162f5a7/docs/ROLE_WORKFLOW_FIXES_2026-10-31.md) | WF-01–WF-07 implementation, API preconditions and verification limits at that follow-up commit. |

The remediation links intentionally point to fixed commits rather than an older
local draft or a moving branch. Consult [PR #269](https://github.com/OatiesMilk/Supply-Chain/pull/269)
and [PR #270](https://github.com/OatiesMilk/Supply-Chain/pull/270) for current changes,
checks and merge status; neither a report nor a merged PR proves deployment or
provider delivery. Recheck relevant source before reproducing an old finding.

When updating this context, keep historical source revisions and original evidence
intact. Add dated publication/status notes, distinguish proposed from merged and
deployed behavior, and retain explicit skips and unverified boundaries. Reference
credentials by variable name only; never copy environment values, tokens, cookies,
connection strings or business records into reports.

Earlier documentation-only publications contain guidance and historical reports;
their checks and limits remain with their original PRs. This current status
snapshot records the documentation-only review; application tests, CI, and
deployment evidence remain separate.
