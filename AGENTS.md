# AGENTS.md — AI Agent Guide for Supply Chain

This document describes the AI agent(s) configured for this repository, their
capabilities, invocation patterns, and the project conventions they enforce.
Any AI tool or developer working in this codebase should read this file first.
For the maintained guidance, historical audit snapshots and remediation links,
see [AI context](docs/AI_CONTEXT.md).

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

cp -R .gemini/skills/use-supply-chain-dev/. \
   ~/.gemini/config/plugins/supply-chain-dev-plugin/skills/use-supply-chain-dev/
```

Re-run both copies whenever the agent, routing skill or its references change.
These files configure Antigravity; other runtimes must use their supported
delegation mechanism or apply the instructions directly when the named agent is
unavailable. Do not claim an unavailable agent or configured model executed.

### Purpose

A full-stack developer agent embedded in this project. It handles bug fixes,
feature implementation, API route changes, Prisma schema updates, and frontend
component work, code audits and technical documentation while enforcing the
project's authorization, lifecycle and transaction conventions.

### How it works

The agent selects a mode from the user's request:

- **Implementation:** read the source, make focused changes and validate the
  affected behavior with TypeScript and relevant tests.
- **Audit:** trace workflows and shared enforcement, reproduce proportionally,
  and report evidence without changing application code or business data.
- **Documentation:** verify source claims and write the requested documentation.

Inspect available context first. Ask only when a missing decision materially
affects the work. Report findings/changes, exact checks and skips, and material
verification limits. Validate delegated findings before presenting them.

### How to invoke

```
@supply-chain-dev <your task>
```

**Examples:**
```
@supply-chain-dev fix the Admin Panel permission check from TSK-55
@supply-chain-dev add a GET /api/records/:id/comments endpoint, admin and sales only
@supply-chain-dev write a node:test test for the Sidebar canAccess logic
@supply-chain-dev why does refreshing the page redirect back to the dashboard?
```

The companion routing skill (`use-supply-chain-dev`) will also auto-route
tasks to this agent when you ask for bug fixes, feature builds, route changes,
schema updates, test writing, audits or technical documentation. Instruction
maintenance uses the available skill-authoring workflow to avoid recursive
delegation to the skill being edited.

---

## Project Conventions the Agent Enforces

### Git Branching (from `docs/git-cheat-sheet.md`)

| Type | Pattern |
| :--- | :--- |
| Feature | `feature/<subsystem>-TSK-XX-<description>` |
| Bug fix | `fix/<subsystem>-TSK-XX-<description>` |
| Hotfix | `hotfix/<subsystem>-TSK-XX-<description>` |
| Refactor | `refactor/<subsystem>-TSK-XX-<description>` |
| Docs | `docs/<subsystem>-<description>` (CLAUDE.md uses `docs/<description>`) |
| Chore | `chore/<description>` |

Subsystems: `client`, `server`, `api`, `db`, `admin`

Commit message format: `<type>(<subsystem>): <message> (TSK-XX)`

### Backend (Express + Prisma)

- Every write route must have `requireAuth` + `requireRole(...)` from `server/src/middleware/auth.ts`
- Also enforce applicable resource, screen, category/action, ownership and
  lifecycle rules. Trace shared middleware and `services/recordOperations.ts`
  before alleging a missing check or introducing duplicate policy logic.
- Roles: `SALES_COORDINATOR | LOGISTICS | TASS | ADMIN | DRIVER`
- Related business writes and audit entries must use `prisma.$transaction`
  (array or interactive form). Revalidate mutable prerequisites inside it and
  protect competing requests with appropriate locks, conditional updates or
  versions; a transaction alone does not prevent lost updates.
- New routes must be registered in `server/src/index.ts`
- Use existing async error wrappers for fallible asynchronous handlers.
- Generate/review appropriate migrations for schema changes and validate them
  on a suitable authorized target. Do not infer permission to reset or migrate
  a shared database; schema comments do not require storage migrations.
- Never commit changes to `dist/` — those are build artifacts

### Frontend (React + TypeScript)

- New screens must be registered in `client/src/routes/screenRouting.ts` (the
  top-level `screenRouting.ts` re-exports it), wired in `routes/AppRouter.tsx`,
  navigation and applicable permission catalogs on the server and client.
- Sidebar buttons use `canAccess(screen)` from the current session permissions;
  screen visibility does not authorize writes or override role ceilings.
- API calls go through `client/src/api/index.ts` (re-exported by `api.ts`) or
  TanStack Query hooks in `client/src/api/`.
- UI/auth state uses Zustand stores; server data/cache uses TanStack Query.
  Preserve permission/session cache isolation and refresh affected details,
  lists and aggregates after writes.
- All code must pass `tsc --noEmit` (strict mode is on)

### Testing

- Tests use Node's built-in runner (`node:test` via `tsx`), not Vitest. Client tests live in `client/tests/` and in co-located `__tests__/` folders; server tests in `server/tests/`; Playwright E2E in `e2e/`
- Run: `npm run test:client` and `npm run test:server`
- Inspect workspace package-script globs when placing tests. Report passed,
  failed and skipped checks accurately, distinguishing database doubles from
  real PostgreSQL, browser and external-provider validation.
- Do **not** spin up new dev servers in tests — frontend is on `3000`, backend on `4000`
- Existing isolated HTTP tests on ephemeral ports are appropriate. PostgreSQL
  race/rollback tests require designated disposable targets.
- Documentation/instruction-only edits need link, format and consistency checks;
  application tests are needed when behavior/contracts change. Substantial skill
  revisions also need a scoped behavioral evaluation when available/permitted.

### Security

- JWT tokens are stored in `httpOnly` cookies (`mg_session`) — never expose in responses
- `JWT_SECRET` must be set in production — the server throws on startup if missing
- Do not log or expose `.env` values
- `permissionManagement.ts` supports LEGACY and V1 (default LEGACY). V1 needs
  initialized policies and verified conversion; code presence does not prove
  deployed activation. Permissions are reloaded from the account, not granted
  from stale JWT role claims alone.

### Role workflows and integrations

- Preserve linked Driver profile ownership, immutable role ceilings and
  action-level denials. Admin does not bypass every domain boundary.
- RMA transport completion, TASS physical receipt and final completion are
  separate events. Collection verification is TASS-owned.
- Trace UI → API → middleware/domain rules → transaction/audit/evidence →
  notifications/cache → next role's view, including alternate submission paths.
- Report configured, queued, mocked, sent, skipped and failed integration outcomes
  truthfully. Success messages and Delivered status do not prove email delivery.
- Operational stock movement is currently manual; do not add automatic stock or
  financial reconciliation as an incidental fix without an agreed business rule.
- Detailed audit and permission guidance lives in the routing skill's
  `references/` directory. Historical audit reports describe their source revision
  and do not replace checking the current implementation.

---

## Environment

| Service | Port |
| :--- | :--- |
| Frontend (Vite) | `3000` |
| Backend (Express) | `4000` |
| Database | PostgreSQL (via Prisma) |

Vite proxies `/api/*` → `http://localhost:4000` in development.

Root `.env` holds the Docker PostgreSQL settings; `server/.env` holds `DATABASE_URL`, `JWT_SECRET`
and the other API settings (see `docs/GETTING_STARTED.md`). `NOTION_API_KEY` is only used for ticketing.

---

## Notion Ticketing

The project uses a Notion Tickets database (`TSK-XX` prefix). The agent can:
- Read tickets by number
- Update ticket status and descriptions
- Cross-reference code changes with ticket IDs

Notion API key is stored in `.env` as `NOTION_API_KEY`.
Ticket updates, emails, publishing and other external mutations require explicit
task authorization; discovering a finding alone does not authorize them.
