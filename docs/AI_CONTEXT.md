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

| Document | Source and purpose |
| --- | --- |
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

This documentation publication contains guidance and reports only. Its checks and
limits are recorded in the accompanying PR; application CI and deployment evidence
remain with the implementation PRs.
