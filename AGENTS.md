# AGENTS.md — AI Agent Guide for Supply Chain

This document describes the AI agent(s) configured for this repository, their
capabilities, invocation patterns, and the project conventions they enforce.
Any AI tool or developer working in this codebase should read this file first.

---

## Agent: `supply-chain-dev`

**Location (in-repo):** `.gemini/agents/supply-chain-dev.md`
**Companion skill:** `.gemini/skills/use-supply-chain-dev/SKILL.md`
**Model:** Claude Sonnet

### Setup for teammates

The agent definition lives inside this repository under `.gemini/` so it is
available to every developer who clones the project. To activate it locally,
copy the files into your Antigravity CLI config directory once:

```bash
# Run from the project root
mkdir -p ~/.gemini/config/plugins/supply-chain-dev-plugin/agents
mkdir -p ~/.gemini/config/plugins/supply-chain-dev-plugin/skills/use-supply-chain-dev

cp .gemini/agents/supply-chain-dev.md \
   ~/.gemini/config/plugins/supply-chain-dev-plugin/agents/supply-chain-dev.md

cp .gemini/skills/use-supply-chain-dev/SKILL.md \
   ~/.gemini/config/plugins/supply-chain-dev-plugin/skills/use-supply-chain-dev/SKILL.md
```

Re-run the copy whenever the agent definition is updated in the repo.

### Purpose

A full-stack developer agent embedded in this project. It handles bug fixes,
feature implementation, API route changes, Prisma schema updates, and frontend
component work — all while enforcing the project's security, RBAC, and
modularity conventions.

### How it works

Before writing a single line, the agent:
1. **Reads the relevant source files** — routes, middleware, schema, components
2. **Asks a clarifying question** if the request is underspecified
3. **Implements** following all project conventions (see below)
4. **Self-validates** by running `tsc --noEmit` and Vitest before returning
5. **Reports** what was changed and whether validation passed

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

The companion routing skill (`use-supply-chain-dev`) will also auto-route
tasks to this agent when you ask for bug fixes, feature builds, route changes,
schema updates, or test writing.

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
