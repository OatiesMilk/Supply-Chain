# Codex and Antigravity Engineering Workflow

| Agent | Role |
| :--- | :--- |
| Codex | Lead Engineer / Architect / Reviewer |
| Antigravity (`supply-chain-dev`) | Implementation Sub-Agent |

Codex leads work from the user's request through final review. Antigravity
implements bounded tasks using the project's agent definition in
`.gemini/agents/supply-chain-dev.md`.

## Task lifecycle

1. Codex reads the ticket and relevant source, defines the expected behavior,
   identifies dependencies, and chooses the implementation scope.
2. Codex prepares a handoff using the template below. Start with one ticket
   per handoff. Coordinate shared files before starting additional work.
3. Antigravity reads the handoff and source, implements within scope, and runs
   the specified checks. It returns scope changes or blockers to Codex.
4. Codex reviews the actual diff for correctness, acceptance criteria, RBAC,
   API compatibility, and regression risks, and reviews the check results.
5. Antigravity addresses review findings through a follow-up handoff.
6. Codex reports the reviewed result and any remaining limitations to the user.
   Ticket updates, commits, pushes, merges, and deployments follow the user's
   authorization and the repository's Git workflow.

Before delegation, inspect the workspace for existing edits. Preserve the
user's work. Do not overwrite concurrent changes or use destructive Git
commands to make the workspace clean. Only report checks that actually ran.

## Handoff template

```text
To: Antigravity / supply-chain-dev
From: Codex / Lead Engineer, Architect, Reviewer
Ticket: TSK-XX
Workspace: <absolute path to the intended checkout>

User request:
<the user's request>

Objective and expected behavior:
<concrete trigger and resulting behavior>

Source findings and architecture:
<files inspected, root cause or investigation target, design and API decisions>

Allowed files or directories:
<bounded implementation scope>

Constraints:
<RBAC, compatibility, existing edits, dependencies, and scope limits>

Acceptance criteria:
<observable requirements>

Validation:
<exact checks to run, working directories, and required manual observations>

External actions authorized by the user:
<specific actions, if any>

Return to Codex:
Changed files and behavior, acceptance criteria coverage, exact check results,
outstanding issues, and any scope expansion needed. Ready for Codex review.
```

## CLI setup on Windows

Run the following from the repository root to install or refresh the project
agent and routing skill in the Antigravity configuration directory:

```powershell
& ./scripts/install-antigravity-agent.ps1
agy agents
```

The installer uses `agy plugin install` and `agy plugin enable` to register
and activate the plugin, then compares SHA256 hashes of the installed manifest,
agent definition, and routing skill with the repository sources. Installation
targets `~/.gemini/config/plugins/supply-chain-dev-plugin`. Re-run it after
updating those sources. It works from any current directory when invoked by
its full path.

Confirm `supply-chain-dev` appears in the agent list. The CLI must be signed
in before implementation can run. Run `agy` interactively to complete sign-in
if needed. In a sandboxed Codex session, installing into the user configuration
directory and accessing the authenticated CLI may require tool approval.

Codex writes a task handoff to a local file, then runs the agent from the
intended checkout:

```powershell
$implementationHandoff = Get-Content -LiteralPath '<handoff-file>' -Raw
agy --agent supply-chain-dev --mode accept-edits --print $implementationHandoff --output-format json
```

Keep the CLI's permission checks enabled. If a command cannot finish in print
mode because it needs interactive approval, report that blocker and run an
interactive session with the same handoff when authorized. Re-read the diff
after each invocation; the CLI may have made partial changes before failing.

## Current implementation queue

The user selected these bugs and enhancements assigned to Julius on October 2,
2026. This is the initial queue; re-read Notion before starting each ticket to
confirm its current scope and status.

| Ticket | Type | Objective |
| :--- | :--- | :--- |
| TSK-80 | Bug | Make seeded drivers appear in Driver View. |
| TSK-75 | Bug | Open the Route Slip date picker without opening the filter menu. |
| TSK-79 | Enhancement | Default paginated tables to 10 rows. |
| TSK-78 | Enhancement | Refine the Vehicle and Assistants fields in Driver View. |
| TSK-77 | Enhancement | Allow document size selection for exports. |

Queue membership does not start implementation or authorize publishing. Codex
prepares each concrete handoff when the user requests ticket work.
