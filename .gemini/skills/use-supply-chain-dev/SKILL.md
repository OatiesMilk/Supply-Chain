---
name: use-supply-chain-dev
description: >
  Routes Supply Chain implementation, debugging, code audits, and technical
  documentation to the supply-chain-dev workflow. Use for project routes,
  permissions, role workflows, modules, schema changes, and their integrations.
---

# Use supply-chain-dev

Preserve the user's requested outcome and choose the task mode before routing:

| Request | Mode and result |
| --- | --- |
| Fix, implement, refactor, or write tests | Implementation: focused changes and relevant validation |
| Audit, review, assess, or explain a defect | Audit: evidence and recommendations; no application changes unless requested |
| Document findings or explain architecture | Documentation: verified documentation within the requested scope |

An audit that includes writing its findings stays in Audit mode; use Documentation mode when the requested work is documenting existing findings or verified behavior.

Read the repository's `AGENTS.md` and [agent definition](../../agents/supply-chain-dev.md). Resolve application paths from the repository root; resolve links in this skill from its directory.

## Routing

Delegate substantial project work to `supply-chain-dev` when the runtime exposes that agent. Pass the user's exact request, selected mode, scope, constraints, relevant files, and ticket details if supplied. A worker already fulfilling this role should execute the task without delegating it back to itself.

The `.gemini` definition and its model field describe Antigravity configuration; they do not establish availability in other runtimes. When the named agent is unavailable, use the runtime's supported delegation mechanism if permitted and provide the agent instructions. Otherwise apply those instructions directly and state the fallback briefly. Do not claim a particular agent or model ran unless it did.

Simple factual questions and ticket reads can stay in the main thread. Updating this skill or its agent is instruction-maintenance work: apply the skill-authoring workflow available in the runtime rather than recursively delegating to the skill being edited.

## Focused references

- For permission, identity, dispatch, or lifecycle work, read [permissions and lifecycle](references/permissions-and-lifecycle.md).
- For code audits or integration reviews, read [audit workflow](references/audit-workflow.md). Implementation work needs this reference only when its integration risks warrant it.

## Returning results

Check delegated findings against their source and validation evidence before summarizing them. Resolve contradictory claims, especially checks hidden in shared middleware. Report severity, evidence, changes if any, exact checks and skips, and remaining limits. Audit findings do not authorize fixes, ticket updates, commits, publishing, or database changes beyond the user's scope.
