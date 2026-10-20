# Docs Sync Audit — Prompt for Claude Code

Paste everything below the line into Claude Code at the repo root.

---

## Role


You are a senior technical writer and staff engineer for the Microgenesis **Supply Chain Management System**. Your job is to make every document in this repository an accurate reflection of what the system does **today**. The code is the source of truth; docs that disagree with it are wrong.

## Objective

Audit every documentation file against the current codebase, then update them so that a new developer, a QA tester, and a business stakeholder can each rely on them without cross-checking the code.

## Ground rules

1. **Code over docs.** Never copy a claim from one doc to another without verifying it in code (`server/src/routes/`, `server/prisma/schema.prisma`, `server/src/middleware/auth.ts`, `server/src/mappings.ts`, `client/src/screenRouting.ts`, `client/src/features/`, `client/src/api/`, `package.json` files, `.env` example/config, `docker-compose.yml`, `render.yaml`, `wrangler.json`, `worker.js`, `e2e/`).
2. **Do not touch the code. Strictly.** Edit documentation (`.md` files) only. Do not modify, create, rename, or delete any source, config, script, test, migration, or build file — including `client/`, `server/` (`src/`, `prisma/schema.prisma`, migrations), `e2e/`, `dist/`, `package.json`, `package-lock.json`, `docker-compose.yml`, `render.yaml`, `wrangler.json`, `worker.js`, and `.env*`. If the code looks wrong or a doc and the code disagree because of a bug, record it in the docs/report as an issue; never fix it. Never print or copy values from `.env` (`JWT_SECRET`, `DATABASE_URL`, `NOTION_API_KEY`); reference variable names only.
3. **No invention.** If you cannot verify something, do not guess. Mark it `> ⚠️ UNVERIFIED: <what and why>` and list it in the final report.
4. **Preserve intent and structure.** Keep each doc's existing headings, tone, and audience unless a section is obsolete. Prefer minimal, surgical edits over rewrites. Do not delete history; move superseded material to `docs/archive/` instead of removing it.
5. **Don't touch archives.** `docs/archive/**` is historical; read for context only.
6. **Docs location.** All documentation lives in the `docs/` folder of this repo. Any new doc you create (including `BUSINESS_REQUIREMENTS.md` and `DOCS_SYNC_REPORT.md`) goes directly in `docs/`. Where a root-level copy duplicates a `docs/` file, `docs/` is canonical and the root file becomes a short pointer to it (root `README.md`, `CLAUDE.md`, and `AGENTS.md` stay in place).
7. **Git.** Do **not** create a new branch. Work on the `dev` branch: run `git status` first, and if there are uncommitted changes that would conflict, stop and ask me before switching; otherwise `git checkout dev` and `git pull`. Existing untracked `PR-TSK-*.md` files and the modified `package-lock.json` are not yours: leave them as they are. Do not commit; I commit manually. Do not add a Co-Authored-By trailer to anything you draft for me.

## Phase 1 — Inventory (read-only)

1. Discover every doc: `git ls-files '*.md' '*.mdx' '*.txt'` plus `docs/*.docx`, excluding `node_modules`. Known set includes:
   - Root: `README.md`, `ARCHITECTURE.md`, `GETTING_STARTED.md`, `CLAUDE.md`, `AGENTS.md`, `DONT_BREAK_THIS.md`, untracked `PR-TSK-*.md`
   - `docs/`: `SYSTEM_ARCHITECTURE.md`, `GETTING_STARTED.md`, `API_CONTRACT.md`, `MODULE_ACCESS.md`, `PROJECT_ISSUES_REPORT.md`, `UAT_PLAN.md`, `CLOUDFLARE_DEPLOYMENT.md`, `driver-demo-seed.md`, `git-cheat-sheet.md`, `uat/*`, `prompts/*`
   - Others: `server/prisma/DRIVER_IMPORT.md`, `teams/README.md`, `.gemini/**`, `.agents/**`
2. Read **every** file fully. Note duplicates (e.g., root vs `docs/` copies of `ARCHITECTURE`/`GETTING_STARTED`) and which one is canonical.
3. Check `git log --oneline -50` and recent PR files (`PR-TSK-*.md`) to learn what shipped recently (e.g., TSK-83, 100, 114, 115–119) and make sure those changes are reflected.

## Phase 2 — Build a ground-truth fact sheet

Before editing, derive from code and keep as a scratch table (do not commit it):

- **Modules/screens:** every entry in `client/src/screenRouting.ts`, its feature folder, sidebar entry, and `canAccess` permission.
- **API surface:** every route file → method, path, `requireAuth`/`requireRole` roles, request/response shape. Flag any write route missing guards.
- **Data model:** every Prisma model, enum, relation, and recent migrations in `server/prisma/migrations`.
- **Roles & RBAC:** roles in `auth.ts`, role/status/category mappings in `mappings.ts`, and the per-module access matrix.
- **Integrations & services:** Notion, mailer, in-app notifications, driver directory, Cloudflare worker, data-sampler/dev routes.
- **Runtime & ops:** ports, scripts in each `package.json`, env var names, Docker/Render/Cloudflare config, test setup (Vitest, e2e).
- **Recent capabilities:** collapsed sidebar rail, Sonner toasts, dashboard KPI changes, driver import/seed, UAT-driven fixes.

## Phase 3 — Update the documents

For each item below, verify against the fact sheet and fix drift (missing features, removed features, renamed screens, wrong commands/ports, wrong roles, stale diagrams, dead links).

| Doc | What "updated" means |
| :--- | :--- |
| **Business system requirements** (find it: likely in `README.md`, `UAT_PLAN.md`, or `docs/`; if none exists, create `docs/BUSINESS_REQUIREMENTS.md`) | Functional requirements per module (Deliveries, RMA/TASS, Procurement, Accounting collection, Sales orders, Driver ops, Customers, Suppliers, Inventory, Admin, Reports, Notifications), each tagged **Implemented / Partial / Planned** with the roles that can perform it. Include actors, business rules, status lifecycles, and non-functional requirements (security, audit, availability). |
| **System architecture** (`docs/SYSTEM_ARCHITECTURE.md` canonical; root `ARCHITECTURE.md` becomes a pointer) | Current stack and versions, component/deployment diagram (Vite client, Express API, Prisma/PostgreSQL, Cloudflare worker, Render, Docker), auth flow (JWT in `httpOnly` `mg_session`), RBAC layers, request flow, data model overview, notification/email flow, folder map. |
| **Getting started** (`docs/GETTING_STARTED.md` canonical; root `GETTING_STARTED.md` becomes a pointer) | Prerequisites, clone → install → `.env` setup (names only) → migrate → seed → `npm run dev` on ports 3000/4000, demo accounts/seeds, test commands, typecheck commands, common errors. **Verify by reading** that each command's script exists in `package.json`; do not run anything that modifies the database or code. |
| **Project issues** (`docs/PROJECT_ISSUES_REPORT.md`) | Re-verify every listed issue: mark Open / Fixed (with commit or TSK ref) / Won't fix. Add newly discovered issues found during this audit (missing guards, dead code, doc/code mismatches, security risks) with severity, evidence (`file:line`), and suggested fix. |
| **API contract** (`docs/API_CONTRACT.md`) | Match every route exactly: path, method, auth, roles, body, response, error codes. Add missing routes, remove deleted ones. |
| **Module access** (`docs/MODULE_ACCESS.md`) | Regenerate the role × module matrix from `canAccess`/`requireRole`; it must match the code, not the old table. |
| **UAT plan & uat/** (`docs/UAT_PLAN.md`, `docs/uat/*`) | Test cases map to existing screens and flows; add cases for newly shipped features; drop cases for removed ones. Note the `.docx` copy is out of sync if it is — flag it, don't edit it. |
| **Deployment** (`docs/CLOUDFLARE_DEPLOYMENT.md`, `render.yaml`, `docker-compose.yml` references) | Steps and env var names match current config. |
| **Other docs** (`README.md`, `DONT_BREAK_THIS.md`, `CLAUDE.md`, `AGENTS.md`, `git-cheat-sheet.md`, `driver-demo-seed.md`, `DRIVER_IMPORT.md`, `teams/README.md`) | Fix stale paths, commands, rules, and links. `CLAUDE.md`/`AGENTS.md`: only correct facts that are verifiably wrong (structure, commands, ports, roles); do not change the rules or conventions. Keep `DONT_BREAK_THIS.md` aligned with the actual invariants in code. |

For every edited doc:
- Add or refresh a `Last verified: <YYYY-MM-DD> against commit <short-sha>` line at the top.
- Validate internal links and file paths exist.
- Keep diagrams as Mermaid where they already exist; update them to match reality.

## Phase 4 — Cross-checks

- Same fact (ports, roles, module list, env vars, commands) is identical across all docs.
- Every screen in `screenRouting.ts` appears in architecture, module access, requirements, and UAT docs.
- Every route file appears in the API contract.
- Run `git status` / `git diff --stat` and confirm that **only `.md` files changed** and no code or config file appears. If one does, revert that file immediately.

## Deliverables

1. Updated docs on the `dev` branch (uncommitted), all under `docs/` (plus root pointer files).
2. `docs/DOCS_SYNC_REPORT.md` containing:
   - Files reviewed (full list) and files changed, with a one-line reason each
   - Drift found, grouped by severity (wrong / missing / outdated / cosmetic)
   - Items marked UNVERIFIED and what is needed to resolve them
   - Duplicate docs and the recommended canonical file
   - New issues discovered (also added to `PROJECT_ISSUES_REPORT.md`)
   - Suggested commit message(s) in the format `docs(<subsystem>): <message>` (no Co-Authored-By trailer)

## Working style

- Use parallel read-only subagents (Explore) for Phase 1–2 fan-out if helpful; do the edits yourself.
- Work doc by doc; after each, state what changed in one or two lines.
- If a decision is genuinely mine (e.g., deleting a duplicate doc, creating a new file), ask once with a recommendation; otherwise proceed.
- Finish with a short summary and the report path.
