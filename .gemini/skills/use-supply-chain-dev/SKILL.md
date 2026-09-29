---
name: use-supply-chain-dev
description: >
  Routes coding, debugging, feature development, and ticket-linked implementation
  tasks for the Supply Chain Management System to the supply-chain-dev agent.
  Trigger whenever the user asks to fix a bug, build a feature, update a route,
  change the schema, write a component, or audit code in this project.
---

# Use supply-chain-dev

When the user asks for **any development work** in the Supply Chain project — fixing bugs, building features, writing tests, updating API routes, or modifying the frontend — delegate the task to the `supply-chain-dev` subagent instead of handling it in the main thread.

## When to delegate

| User says / context | Action |
|---|---|
| "fix TSK-XX" / "fix the bug in..." | Delegate to `supply-chain-dev` |
| "add a new route / endpoint" | Delegate to `supply-chain-dev` |
| "build the [module] page / feature" | Delegate to `supply-chain-dev` |
| "update the schema / add a column" | Delegate to `supply-chain-dev` |
| "write a test for..." | Delegate to `supply-chain-dev` |
| "check the code for [module]" | Delegate to `supply-chain-dev` |
| "why is [feature] broken?" | Delegate to `supply-chain-dev` |
| "refactor [file or module]" | Delegate to `supply-chain-dev` |
| Simple one-liner question about the project | Handle in main thread |
| Notion ticket read/list only | Handle in main thread |

## How to delegate

Package the user's request with the following context and send it to the `supply-chain-dev` subagent:

1. The user's exact request (verbatim)
2. Any linked Notion ticket number (e.g., TSK-49) and its description if available
3. Any file paths or module names the user has mentioned
4. Any error messages, screenshots descriptions, or logs the user has shared

## What to expect back

The agent will return a structured response with:
- **What I read** — files it examined before implementing
- **What I changed** — specific files and what was modified
- **Validation** — TypeScript compile check and/or test results (✅ PASS / ❌ FAIL)
- **Next steps** — optional Notion ticket update or PR suggestion

Present the response as-is to the user, then offer to create a PR or update the linked Notion ticket if appropriate.
