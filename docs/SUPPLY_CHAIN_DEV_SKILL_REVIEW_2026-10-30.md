# Supply Chain development skill review — 2026-10-30

## Publication note — 2026-10-31

This document preserves the original instruction review and the historical
validation reported during that update. The maintained instructions are
[AGENTS.md](../AGENTS.md), the [routing skill](../.gemini/skills/use-supply-chain-dev/SKILL.md)
and its [agent definition](../.gemini/agents/supply-chain-dev.md).
Application findings F1–F8 received later implementation in
[PR #269](https://github.com/OatiesMilk/Supply-Chain/pull/269), and the second workflow audit's findings in
[PR #270](https://github.com/OatiesMilk/Supply-Chain/pull/270). Statements about findings remaining open below
refer to the review's source snapshot, not a current status register. Installed
copies, temporary artifacts and validation results describe that earlier session;
they are not assertions about another developer's machine or a fresh test run.
See [AI context](AI_CONTEXT.md) for the document roles and publication checks.

## Verdict and scope

The original skill and agent were a useful foundation for routine development. The recommended instruction updates have now been implemented to cover the current permission model, role workflows and integrations.

This is an instruction review against repository commit `0e33fa7` and the [role functionality and integration audit](ROLE_FUNCTIONALITY_AUDIT_2026-10-30.md). It is not a controlled evaluation of the configured Claude model. The application defects do not establish that this skill produced those defects or that a particular model caused them.

The review below records the original gaps and rationale. The routing skill, agent definition, focused references and `AGENTS.md` have since been updated at the user's request. The instruction update itself left application code and the database unchanged; F1–F8 were still open at that review stage.

## Applied instruction update

- Added explicit implementation, audit and documentation modes, including read-only boundaries for audits and proportional clarification.
- Documented LEGACY/V1 authorization, shared record-operation enforcement, immutable role ceilings, Driver profile ownership and TASS receipt/verification authority.
- Added focused [permission/lifecycle](../.gemini/skills/use-supply-chain-dev/references/permissions-and-lifecycle.md) and [audit workflow](../.gemini/skills/use-supply-chain-dev/references/audit-workflow.md) references with workflow tracing, concurrency and truthful integration-result guidance.
- Corrected routing/API entry points, test discovery, migration targeting, async-error handling and runtime delegation fallback. Preserved the configured Antigravity model and tool metadata.
- Aligned repository setup instructions so installed copies include the reference files. Instruction maintenance uses the available skill-authoring workflow without recursive delegation.

Validation results for this update are recorded at the end of this document. Historical application-suite results below are not fresh execution of application tests for this instruction change.

## Files evaluated in the original review

| File | Purpose | Assessment |
| --- | --- | --- |
| [Routing skill](../.gemini/skills/use-supply-chain-dev/SKILL.md) | Selects and delegates work to `supply-chain-dev`. | Useful routing, but no distinct audit-only workflow or unavailable-agent fallback. |
| [Agent definition](../.gemini/agents/supply-chain-dev.md) | Supplies project context, implementation rules and validation expectations. | Useful baseline; permission guidance is incomplete and some paths/process rules have drifted. |
| [Repository guide](../AGENTS.md) | Describes setup and shared project conventions. | Must be kept consistent with any future revision of the skill and agent. |

The routing skill itself is not a full auditor. Most development guidance lives in the companion agent definition, so updating only `SKILL.md` would leave the main gaps unresolved.

## What should be retained

- Read the relevant source before making changes.
- Keep fixes within the requested scope and preserve authorization checks.
- Protect credentials and session cookies.
- Require atomic business writes and audit history.
- Use the repository's TypeScript checks and Node test runner.
- Register frontend navigation and backend routes consistently.
- Preserve the restriction against starting extra development servers or editing build artifacts directly.

## Recommended updates

### 1. Explain the current permission layers and rollout modes

The agent describes authorization mostly as `requireAuth` + `requireRole`, and describes `canAccess` as checking `UserPermission` records. The implementation also uses resource permissions, category/action permissions, immutable role ceilings, linked Driver ownership, lifecycle restrictions, permission conversion, and LEGACY/V1 modes.

**Why this matters:** A role check alone is insufficient for a new write action. Conversely, an audit can incorrectly report a missing check if it examines the route callback without tracing shared middleware. During the system audit, the collection-verification denial was found in `recordOperationError`, not directly in the callback.

**Proposed guidance:** Read the applicable helpers in [auth.ts](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/middleware/auth.ts), [recordOperations.ts](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/services/recordOperations.ts), [recordAccess.ts](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/services/recordAccess.ts), [permissionCatalog.ts](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/services/permissionCatalog.ts), and [permissionEvaluator.ts](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/server/src/services/permissionEvaluator.ts). Check frontend controls and direct API behavior. State which permission mode was exercised; do not infer deployment activation from code or expose environment values.

### 2. Add an explicit audit mode

The skill description includes audits, but its expected response and the agent's main process assume implementation. “Implement” and “fix failures before returning” are unsuitable defaults for a request to inspect and document.

**Proposed guidance:** Distinguish audit, implementation, and documentation work. Audit mode should preserve application state and produce prioritized findings with the role, scenario, file/line, expected/actual behavior, evidence, and suggested remedy. Separate confirmed defects, capability gaps, and unverified concerns. Documentation work should not silently become application changes.

The parent should assess delegated findings before presenting them; the routing skill currently says to present the response “as-is.” Shared authorization and integration findings especially need verification.

### 3. Trace complete workflows across roles

The current instructions say to read relevant frontend/backend files but do not define what a complete integration review means.

**Proposed guidance:** For the affected workflow, follow UI entry → API client → middleware → business rules → transaction → audit/evidence → notifications → next role's view. Include alternate paths that perform the same transition, such as create-and-submit, PUT draft submission, and PATCH status submission.

Use the current ownership boundaries as reference: Sales prepares Deliveries; Logistics assigns dispatch; Driver executes owned runs; TASS owns RMA receipt/final completion and collection verification. Admin privileges do not bypass every domain boundary. RMA transport completion must remain separate from physical receipt and final completion.

This would directly target the missing-date submission and overdue Driver visibility defects, rather than checking only whether individual modules render.

### 4. Strengthen transaction and concurrency guidance

“Use a transaction for multi-model writes” is useful but incomplete. It does not establish that an update is race-safe, idempotent, or protected against stale state.

**Proposed guidance:** Revalidate business prerequisites within the transaction, use row locks or conditional updates where competing requests matter, and commit the domain mutation and audit together. Support interactive `prisma.$transaction(async tx => ...)` as well as the array form, according to the work. Test duplicate submissions, stale versions, rollback, and conflicting actors for consequential transitions.

The collection-verification race is the concrete example. Existing RMA version/transaction handling and conditional customer edits provide local patterns to reuse.

### 5. Require evidence for integration success

The current guidance mentions notifications and APIs but does not distinguish configured, queued, mocked, sent, failed, or actually exported outcomes.

**Proposed guidance:** Follow a claimed side effect to the code that performs it and the result it returns. Check recipient resolution, failure behavior, retry/idempotency, and whether failures occur after a committed business write. A success toast, Delivered status, placeholder tab, or passing unit test is insufficient evidence of a completed integration.

For inventory work, identify whether an operation actually reserves/releases/moves stock. Record the current manual-stock boundary; do not introduce automatic inventory or financial behavior without an agreed business rule.

### 6. Correct discovery paths and test instructions

The agent calls `client/src/screenRouting.ts` the central mapping, but it re-exports [routes/screenRouting.ts](https://github.com/OatiesMilk/Supply-Chain/blob/0e33fa734a616294ab80e5c327ee6552a69b3907/client/src/routes/screenRouting.ts). Similarly, `client/src/api.ts` is an entry point; the implementation and query helpers need inspection too. Its instruction that tests must go in colocated `__tests__` folders conflicts with its own directory description and the actual workspace scripts.

**Proposed guidance:** Follow re-exports to the actual implementation. Place tests according to the affected workspace's existing conventions and confirm the package script discovers them. Record exact results and skips. Distinguish mocked router tests from real PostgreSQL tests, and automated checks from browser/external-service verification.

The baseline system audit passed 235 client tests and 372 server tests, with three PostgreSQL-specific tests skipped. Those results did not cover all demonstrated workflow defects. They are evidence for that audited snapshot, not fresh validation of a future skill revision.

### 7. Scope clarification, migration and delegation rules

The agent requires a clarifying question “before touching any file” when a task is vague. It also requires applying a migration whenever the schema changes. The routing skill assumes the named subagent exists in every runtime, and paths are tied to one developer's home directory.

**Proposed guidance:** Inspect available context first and ask only when a missing business decision materially affects the work. Preserve explicit user scope and authorization. Generate and review appropriate migrations for schema changes, and apply them to a suitable authorized target; do not infer authorization to reset or migrate a shared database. Distinguish disposable test listeners from extra development servers.

Resolve paths from the repository root. Document the supported delegation mechanism and an honest fallback if it is unavailable. The presence of `.gemini` files or a configured model name does not prove an agent is installed and available in another runtime. Keep ticket updates, publishing and other external mutations within their authorized scope.

## Proposed shape of a future revision

Keep the routing skill concise. Put shared project invariants and task-mode selection in the agent, with focused references for permission/lifecycle work and integration auditing where those references would reduce repetition. Point to maintained source-of-truth files instead of copying a large static role matrix into multiple instruction files.

Update the agent and repository guide together where guidance overlaps. If the local Antigravity plugin uses copied files, refresh those copies after the repository revision, following the existing setup instructions. Installed copies were outside the initial assessment; their synchronization is part of the subsequent instruction update.

## Acceptance criteria for a future update

A revised skill should be evaluated on observable behavior, not just matching wording:

1. An audit-only request produces a source-linked report without modifying application code or business data.
2. An authorization review follows shared middleware and tests direct API denial before alleging a bypass.
3. A draft-submission review checks every path into Scheduled and the next role's ability to act.
4. A Driver workflow review includes unfinished runs crossing midnight across categories.
5. A collection review checks evidence access, duplicate confirmation, stale state and audit rollback.
6. A notification review distinguishes mocked/skipped/failed outcomes from successful delivery.
7. Validation reports skipped database tests and untested browser/provider behavior explicitly.

Use an isolated evaluation workspace and suitable database doubles or a designated disposable database. Any future independent evaluation should assess an unfamiliar scenario as well as the known audit cases, so the instructions are tested for general usefulness.

## Recommended sequence

First update the permission guidance, task modes, and evidence requirements. Next align source paths, test conventions, concurrency guidance, and runtime setup. Then validate the revised instructions with realistic tasks before relying on them for broader audits.

Changing the instructions alone will not repair findings F1–F8 in the system audit. Those remain separate implementation tasks.

## Historical instruction-update validation results

| Check | Result |
| --- | --- |
| Skill creator's `quick_validate.py` | Passed for repository and installed routing skill |
| Markdown formatting, local references and agent metadata | Checked; original `claude-sonnet-4.6` model and tool declarations preserved |
| Independent collection-verification evaluation | Seven selected existing tests passed, plus isolated permission and actual-handler race/partial-write reproductions with database doubles |
| Independent customer-editing evaluation | Thirteen selected existing tests passed, plus isolated contact-edit, conditional-conflict and permission-contract assertions |
| Installed Antigravity copies | Agent, routing skill and both reference files synchronized and verified byte-for-byte |
| Full application suites, real PostgreSQL, browser and external-provider tests | Not rerun for instruction-only changes; the evaluation checks above were bounded and used doubles |

Both evaluation workers started without the earlier conversation and were excluded from reading the existing audit reports. They followed current source, traced shared authorization, distinguished evidence types and kept repository files and business data unchanged. These were evaluations using the current runtime's delegated workers, not execution of the configured Antigravity Claude model; they establish bounded workflow behavior, not a general model benchmark or complete coverage of all acceptance cases.

The collection evaluation correctly recognized TASS/action enforcement while reproducing competing confirmations and partial audit failure. It distinguished the missing evidence UI from the existing protected attachment APIs. The customer evaluation recognized the conditional concurrency update and transactional audit, and identified a separate contact-field shape mismatch and client/API audit-view permission mismatch. Those application findings were not fixed during instruction maintenance.

The collection worker noted that an audit with a report overlaps the mode table's documentation wording. The routing skill now explicitly keeps that case in Audit mode. The customer worker's first temporary reproduction had an invalid fixture field; it was corrected and rerun successfully, without treating the fixture error as an application defect.

Evaluation reports and reproduction commands are recorded in `/tmp/supply-chain-skill-eval-collections.md` and `/tmp/supply-chain-skill-eval-customers.md`. The source basis for the additional customer observations is the parsed Prisma/API snapshot merge in `server/src/routes/customers.ts:106` and Update-based audit-tab gate in `client/src/features/customers/CustomerWorkspace.tsx:221`, compared with the resource-Read API route. These temporary artifacts may be removed by later system cleanup.

The previous installed agent still recommended Vitest. It has been replaced with the revised `node:test` instructions. Before synchronization, the old installed agent/skill were backed up under `/tmp/supply-chain-dev-instructions-backup-gcnl70hv`. Existing installed model/tool settings matched the repository metadata and were preserved. No application source, schema, runtime service configuration or business data was changed.
