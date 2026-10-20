# Docs Sync Report

> Date: 2026-10-09 · Base audited: `dev` at `ccbf192` · TSK-122 reconciliation: prepared against PR #132 at `2da3cb1`. PR #132 is not yet merged, so this documentation PR must be synchronized with `dev` after #132 merges and must not be merged first. Scope: documentation and example configuration only; no runtime source or migration files changed.

## 1. Result in brief

The existing docs were written for earlier versions of the system and disagreed with the code in many places. The largest gaps: the architecture doc said the system had **no tests**, the getting-started guide had a garbled section and wrong seed passwords, `DONT_BREAK_THIS.md` said every deploy re-seeds the database, the issues report predated ~60 merged tickets, and `CLAUDE.md`/`AGENTS.md` told contributors to run Vitest, which is not installed.

Created `docs/BUSINESS_REQUIREMENTS.md` (none existed). Rewrote the architecture, getting-started and API contract docs from the code. Re-verified every finding in the issues report and added seven new ones. Critical finding 13.1 is addressed by TSK-122/PR #132; the documentation now describes the guarded local Admin workflow without treating the still-unmerged PR as deployed or UAT-approved.

## 2. Files changed

| File | Change | Reason |
| :--- | :--- | :--- |
| `docs/BUSINESS_REQUIREMENTS.md` | **New** | No business requirements document existed; built from routes, services, UI and tickets, each item tagged Implemented/Partial/Planned/Open question |
| `docs/SYSTEM_ARCHITECTURE.md` | Rewritten | Was a template-style analysis claiming 0 tests, Zod validation and Swagger docs that the code does not use, `/api/dev` exposed everywhere, unknown file storage, missing models (Driver, LineItem, PodAttachment, UserPermission) and a wrong route table |
| `ARCHITECTURE.md` (root) | Now a pointer | Duplicate of an obsolete single-table/Swagger note; `docs/` is canonical. Older text remains in git history and `docs/archive/ARCHITECTURE.md` |
| `docs/GETTING_STARTED.md` | Rewritten (canonical) | Was a 15-line pointer to the root file; content moved here and fixed |
| `GETTING_STARTED.md` (root) | Now a pointer | Root copy had interleaved/garbled troubleshooting and "Further documentation" sections, wrong Admin password, no Driver account, no test commands |
| `docs/API_CONTRACT.md` | Rewritten | Covered about a third of the routes; wrong `send-email` body, removed `date_time` field, wrong status names, missing time-in, attachments, pagination, drivers, customers, transactions, admin, data sampler |
| `docs/MODULE_ACCESS.md` | Edited | Added the generated role × screen default matrix; fixed test commands (no `client/tests` glob covered co-located tests) and a removed "Status History" reference |
| `docs/PROJECT_ISSUES_REPORT.md` | Edited | Status line on all 49 findings, corrected header, scorecard caveat, roadmap corrections, new section 13 |
| `docs/UAT_PLAN.md` | Edited | v1.1: sidebar expectations, RMA label, Time In flow, retired Status History, new Part D for shipped tickets |
| `docs/CLOUDFLARE_DEPLOYMENT.md` | Edited | Documents the Worker `/api/*` proxy and the runtime `API_BASE_URL`; warns against bypassing it with `VITE_API_BASE_URL` |
| `DONT_BREAK_THIS.md` | Edited | Sections 3, 4, 6, 7, 8, 10 corrected (seed not run on deploy, Graph mailer, real POD storage, archived ROLES.md, Warehouses routing) |
| `README.md` | Rewritten | Escaped backticks rendered literally, stack listed unused shadcn/ui, missing links, no quick start |
| `CLAUDE.md`, `AGENTS.md`, `.gemini/agents/supply-chain-dev.md` | Facts only | Vitest → `node:test`; `.env` layout; `screenRouting.ts` description. **No rules or conventions were changed** (one clarifying annotation was added to the docs branch row in `AGENTS.md`) |
| `docs/git-cheat-sheet.md` | Edited | `SC-XX` → `TSK-XX`, `feat/` → `feature/` branch examples, current-practice note |
| `docs/driver-demo-seed.md`, `server/prisma/DRIVER_IMPORT.md`, `docs/uat/TSK-106-verification.md` | Edited | Stale references to name-based assignment and removed files (`notion.ts`, `fix_cust.cjs`) |
| `teams/README.md` | Edited | Added verification note and SSO provisioning warning |
| `docs/DOCS_SYNC_REPORT.md` | **New** | This report |

## 3. Files reviewed but not changed

- `PR-TSK-83/100/115/116/118/119.md` (untracked, yours): used as change history; PR-TSK-100 was read in part, the others only for titles. Not edited.
- `docs/prompts/*` (UAT brainstorm prompt and report, this audit prompt): historical working documents; not audited.
- `.agents/skills/sherlock-holmes/SKILL.md`, `.gemini/skills/use-supply-chain-dev/SKILL.md`: generic agent routing; no stale facts found in the parts read.
- `docs/archive/**`: read-only per the rules; not opened.
- `docs/UAT-Plan-Sales-Coordinator-Logistics-and-Driver.docx`: not opened or edited. It is almost certainly out of sync with `docs/UAT_PLAN.md` v1.1.

## 4. Drift found

**Wrong (contradicts the code)**
- Architecture: "Testing: None", "0% coverage", "File Attachments unknown", `/api/dev` open everywhere, Zod validation (installed but unused), "Swagger" docs (installed but unused).
- Getting started: Admin password documented as `password123` (seed uses a different value), Driver account missing, `docker compose` ports fine but two troubleshooting sections interleaved.
- `DONT_BREAK_THIS.md` #6 (deploy re-seeds), #8 (Warehouses blocked in `App.tsx`), #10 (attachments are filenames only), #7 (`docs/ROLES.md` moved to archive).
- API contract: notification email body, record create fields, status name "Accomplished" (UI/API use "Delivered"), `GET /reports/daily-status-history` (route removed).
- Issues report: "sameSite lax" fix (production is `none`), "Phase 1 100%", no tests, no real POD storage, IDORs, offline fallback, Status History items.
- `CLAUDE.md`/`AGENTS.md`/`.gemini`: Vitest, root `.env` contents.
- UAT plan: RMA labelled "TASS" for Logistics, SC sees SKU Master, Status History screen.

**Missing**
- Business requirements doc; models, routes and screens added since September (drivers/identity, line items, POD, customers edit/audit, Transaction Center scoping, Reports, AM Directory, Sales Orders, collapsible sidebar, toasts).
- Role/screen default matrix, seed command list, test commands, health endpoint behavior.

**Outdated / cosmetic**
- Dates, `SC-XX` ticket prefixes, README stack and links, stale absolute `file:///home/marc/...` links inside the issues report (left in place; see UNVERIFIED).

## 5. Marked UNVERIFIED

| Where | What | Needed to resolve |
| :--- | :--- | :--- |
| `SYSTEM_ARCHITECTURE.md` §12 | Microsoft SSO behavior in a live tenant (SSO is planned for company rollout, not live) | Test with Azure credentials before rollout |
| `SYSTEM_ARCHITECTURE.md` §12 | Live Render/Supabase/Cloudflare settings | Check dashboards |
| `CLOUDFLARE_DEPLOYMENT.md` | Whether the live Worker has the expected `API_BASE_URL` binding | Inspect the deployed Worker variables |
| `git-cheat-sheet.md` | Whether `main` remains a release branch | Confirm with the team |
| `teams/README.md` | Teams tab packaging end-to-end | Run `build.sh` and upload to a tenant |
| `CLAUDE.md` / `AGENTS.md` | `NOTION_API_KEY` presence in `.env` | `.env` was intentionally not read |
| Issues report 5.2, 5.3, 6.1–6.3, 7.2, 7.3 | Visual/responsive/UX findings | Manual UI review |
| UAT v1.1 Part D | Cases were written from code and tickets and then tightened against the code on 2026-10-09 (D-2.1, 2.3, 2.4, 3.4, 3.6); none have been executed | Run them on a staging environment |
| Playwright UAT suite | Test discovery succeeds (56 tests), but live execution requires running servers plus isolated fixtures. `logistics.spec.ts` still expects the retired TASS sidebar label and Status History screen | Update those two stale cases, then run the suite against an approved disposable environment |

## 6. Duplicates and canonical files

| Topic | Canonical | Other copy |
| :--- | :--- | :--- |
| Architecture | `docs/SYSTEM_ARCHITECTURE.md` | Root `ARCHITECTURE.md` → pointer; `docs/archive/ARCHITECTURE.md` historical |
| Getting started | `docs/GETTING_STARTED.md` | Root `GETTING_STARTED.md` → pointer |
| UAT plan | `docs/UAT_PLAN.md` | `.docx` copy is stale (not edited) |
| Branch conventions | `docs/git-cheat-sheet.md` | `CLAUDE.md` and `AGENTS.md` repeat the table; they differ on the docs branch pattern (`docs/<description>` vs `docs/<subsystem>-<description>`) |

## 7. New issues discovered

Added to [`PROJECT_ISSUES_REPORT.md` section 13](./PROJECT_ISSUES_REPORT.md#13-new-findings--october-9-2026):

1. **13.1 (Critical, fix pending review in PR #132)** `POST /api/dev/public-seed` was unauthenticated, unguarded in production and wiped all tables. TSK-122 removes both anonymous seed endpoints and adds fail-closed local-only safeguards.
2. **13.2 (Medium)** `render.yaml` has no `healthCheckPath`.
3. **13.3 (Medium)** TASS defaults include Procurement Pick-up, but TASS cannot see those records.
4. **13.4 (Medium)** Microsoft SSO auto-creates unknown users as Sales Coordinator.
5. **13.5 (Low)** Duplicate, unreachable `/api/health` route.
6. **13.6 (Low)** Stale SQLite/role comments in `schema.prisma`. Left as a documented issue so this documentation PR does not modify production schema source.
7. **13.7 (Low)** Inconsistent client API base handling and a `client/.env.example` comment that points to a `functions/api/[[catchall]].js` file that does not exist.

Also noted in the docs but not given their own entry: CI does not run any tests; the `CLAUDE.md` rule "register new screens in `client/src/screenRouting.ts`" no longer matches where screens are wired (`routes/AppRouter.tsx` and `services/permissions.ts`). The rule was left as written; a clarification was appended.

## 8. Decisions for you

- Review and merge PR #132 before this documentation PR; then rebase this branch on the resulting `dev` and re-run link/source validation.
- Whether to delete the stale `.docx` UAT plan or regenerate it from `docs/UAT_PLAN.md`.
- Whether `main` is still a release branch (cheat sheet).
- Business ownership of collection verification (TASS vs Finance).

## 9. Suggested commits

No Co-Authored-By trailer, per your preference. Subsystems follow `CLAUDE.md`.

```text
docs(admin): add business requirements and refresh system architecture
docs(api): rewrite API contract and module access matrix from current routes
docs(admin): consolidate getting started, root pointers and README
docs(admin): re-audit project issues report and add October findings
docs(admin): update UAT plan, DONT_BREAK_THIS, deployment and agent docs
docs(admin): add docs sync report
```

A single commit also works: `docs(admin): sync documentation with current system capabilities`.

## 10. Verification performed

- Every route in `server/src/routes/*.ts` was listed with its guards and compared with the API contract.
- Role defaults, record scope and transaction scope were read from `services/permissions.ts`, `recordAccess.ts` and `transactionAccess.ts`.
- Schema models, migrations, package scripts, `render.yaml`, `docker-compose.yml`, `wrangler.json`, `worker.js`, `.env.example` files (variable names only) and the CI workflow were read.
- Internal relative links in all changed `.md` files resolve.
- `git status` was reviewed: only `.md` files were changed by this audit. The pre-existing modification to `package-lock.json` and the untracked `PR-TSK-*.md` files were left as they were.
- Documentation links and source claims were checked locally. The repository quality gates are re-run before handoff; staging UAT remains unexecuted.
