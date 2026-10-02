# AGENTS.md — AI Agent Guide for Supply Chain

This document describes the AI agent(s) configured for this repository, their
capabilities, invocation patterns, and the project conventions they enforce.
Any AI tool or developer working in this codebase should read this file first.

---

## Engineering Roles

| Agent | Role | Responsibilities |
| :--- | :--- | :--- |
| Codex | Lead Engineer / Architect / Reviewer | Read tickets and source, define scope and acceptance criteria, choose the architecture, delegate implementation, review changes, and report the outcome to the user. |
| Antigravity (`supply-chain-dev`) | Implementation Sub-Agent | Implement the task handed off by Codex, follow project conventions, run the agreed checks, and return changes and evidence for review. |

Codex is the user's primary engineering contact. Implementation requests follow
the workflow in `docs/agent-workflow.md`. Codex keeps architecture decisions,
code review, and Notion coordination in the main thread. Antigravity returns
implementation results to Codex for review before work is reported complete.

For each implementation task, Codex supplies the ticket, expected behavior,
allowed files, relevant findings, and validation requirements. Antigravity
returns to Codex when the change requires expanding that scope. When the CLI
is unavailable or authentication fails, Codex reports the blocker and prepares
the handoff; it must not claim that another tool or model is Antigravity.

---

## Agent: `supply-chain-dev`

**Location (in-repo):** `.gemini/agents/supply-chain-dev.md`
**Companion skill:** `.gemini/skills/use-supply-chain-dev/SKILL.md`
**Model:** Selected in the Antigravity CLI session

### Setup for teammates

The agent definition lives inside this repository under `.gemini/` so it is
available to every developer who clones the project. To activate it locally,
install and enable the local plugin with the Antigravity CLI:

```bash
# Run from the project root
agy plugin install .gemini
agy plugin enable supply-chain-dev-plugin
agy agents
```

Re-run the installation whenever the agent definition is updated in the repo.
On Windows, use `./scripts/install-antigravity-agent.ps1` as documented in
`docs/agent-workflow.md`.

### Purpose

A full-stack implementation agent run through Antigravity and directed by
Codex. It handles bug fixes,
feature implementation, API route changes, Prisma schema updates, and frontend
component work — all while enforcing the project's security, RBAC, and
modularity conventions.

### How it works

For every delegated implementation, the agents:

1. **Codex reads and plans** — ticket, relevant source, scope, and acceptance criteria
2. **Codex hands off** — one bounded implementation task to Antigravity
3. **Antigravity reads and implements** — following the handoff and project conventions
4. **Antigravity validates** — the agreed TypeScript and relevant Vitest checks for code changes
5. **Codex reviews** — diff, acceptance criteria, security, API compatibility, and validation evidence
6. **Codex reports** — reviewed changes, check results, and any outstanding work

### How to invoke

```
@supply-chain-dev <your task>
```

**Examples:**
```
@supply-chain-dev fix the Admin Panel permission check from TSK-55
@supply-chain-dev add a GET /api/records/:id/comments endpoint, admin and sales only
@supply-chain-dev write a vitest test for the Sidebar canAccess logic
@supply-chain-dev why does refreshing the page redirect back to the dashboard?
```

The companion routing skill (`use-supply-chain-dev`) routes implementation
tasks to Antigravity after Codex prepares the handoff. Architecture, review,
repository workflow setup, and Notion ticket reads stay with Codex.

---

## Project Conventions the Agent Enforces

### Git Branching (from `docs/git-cheat-sheet.md`)

| Type | Pattern |
| :--- | :--- |
| Feature | `feature/<subsystem>-TSK-XX-<description>` |
| Bug fix | `fix/<subsystem>-TSK-XX-<description>` |
| Hotfix | `hotfix/<subsystem>-TSK-XX-<description>` |
| Refactor | `refactor/<subsystem>-TSK-XX-<description>` |
| Docs | `docs/<subsystem>-<description>` |
| Chore | `chore/<description>` |

Subsystems: `client`, `server`, `api`, `db`, `admin`

Commit message format: `<type>(<subsystem>): <message> (TSK-XX)`

### Backend (Express + Prisma)

- Every write route must have `requireAuth` + `requireRole(...)` from `server/src/middleware/auth.ts`
- Roles: `SALES_COORDINATOR | LOGISTICS | TASS | ADMIN | DRIVER`
- Multi-model writes must use `prisma.$transaction([...])`
- New routes must be registered in `server/src/index.ts`
- Never commit changes to `dist/` — those are build artifacts

### Frontend (React + TypeScript)

- New screens must be registered in `client/src/screenRouting.ts`
- Sidebar buttons use `canAccess(screen)` — new screens require a permission entry
- API calls go through `client/src/api.ts` or TanStack Query hooks in `client/src/api/`
- State is managed via Zustand stores in `client/src/store/`
- All code must pass `tsc --noEmit` (strict mode is on)

### Testing

- Component tests: Vitest + React Testing Library, co-located in `__tests__/` folders
- Run: `cd client && npx vitest run`
- Do **not** spin up new dev servers in tests — frontend is on `3000`, backend on `4000`

### Security

- JWT tokens are stored in `httpOnly` cookies (`mg_session`) — never expose in responses
- `JWT_SECRET` must be set in production — the server throws on startup if missing
- Do not log or expose `.env` values

---

## Environment

| Service | Port |
| :--- | :--- |
| Frontend (Vite) | `3000` |
| Backend (Express) | `4000` |
| Database | PostgreSQL (via Prisma) |

Vite proxies `/api/*` → `http://localhost:4000` in development.

`.env` is located at the project root and contains `DATABASE_URL`, `JWT_SECRET`,
and `NOTION_API_KEY`.

---

## Notion Ticketing

The project uses a Notion Tickets database (`TSK-XX` prefix). The agent can:
- Read tickets by number
- Update ticket status and descriptions
- Cross-reference code changes with ticket IDs

Notion API key is stored in `.env` as `NOTION_API_KEY`.
