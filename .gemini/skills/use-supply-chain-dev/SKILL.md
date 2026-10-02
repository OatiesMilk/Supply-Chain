---
name: use-supply-chain-dev
description: >
  Routes scoped Supply Chain implementation tasks to Antigravity's
  supply-chain-dev agent, with Codex leading planning, architecture, and review.
  Use for bug fixes, enhancements, components, API changes, schema work,
  refactoring, and requested tests after Codex prepares a handoff.
---

# Codex and Antigravity workflow

**Codex: Lead Engineer / Architect / Reviewer.**
**Antigravity (`supply-chain-dev`): Implementation Sub-Agent.**

Read `AGENTS.md` and `docs/agent-workflow.md`. Codex leads the task and prepares
a bounded implementation handoff. Antigravity implements that handoff and
returns changes and validation evidence to Codex for review.

## Routing

| Request | Owner |
| :--- | :--- |
| Fix a bug or implement an enhancement | Codex scopes; Antigravity implements; Codex reviews |
| Add a route, component, schema change, or refactor | Codex designs; Antigravity implements; Codex reviews |
| Write requested tests | Codex defines expected behavior; Antigravity implements; Codex reviews |
| Investigate why something is broken | Codex diagnoses; delegate bounded investigation or implementation when useful |
| Review code, audit security, or choose architecture | Codex |
| Set up agent instructions or the engineering workflow | Codex |
| Read or list Notion tickets | Codex |
| Update Notion tickets | Codex, within user authorization |

## Handoff requirements

Codex supplies:

1. Ticket ID and the user's request.
2. Objective, existing behavior, and expected behavior.
3. Relevant source findings and allowed files or directories.
4. Architecture decisions, API contracts, RBAC requirements, and scope limits.
5. Acceptance criteria and the checks to run.
6. Existing workspace changes and any explicitly authorized external actions.

Use the handoff template and CLI instructions in `docs/agent-workflow.md`.
Use Antigravity's actual CLI agent for implementation. A Codex sub-agent is
not an Antigravity session. If the CLI is unavailable or cannot authenticate,
report the blocker to the user and keep the prepared handoff available.

## Review requirements

Antigravity returns the changed files, a summary of behavior, acceptance
criteria coverage, exact checks and results, and outstanding issues. It sends
scope expansions and material ambiguities back to Codex.

Codex reads the diff, checks correctness and project conventions, assesses
validation evidence, and sends any needed corrections to Antigravity. Codex
then reports the reviewed result to the user. Do not simply forward the
implementation response as final approval.
