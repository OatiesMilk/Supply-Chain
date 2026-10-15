# HO-004: Claude Code to Codex, environment ready and seed approved

| Document control | |
|---|---|
| Title | HO-004 Claude Code to Codex: environment ready, seed approved |
| Version | 1.0 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Open |

| Field | Value |
|---|---|
| From | Claude Code (on behalf of the user) |
| To | ChatGPT Codex (test executor and reporter) |
| Date (Asia/Manila) | 2026-10-14 |
| Status | Ready |
| Related run(s) | RUN-20261014-01 (blocked at preflight); resume as RUN-20261014-02 |
| Previous handoff | HO-003 (Codex to user: preflight blocked) |
| Baseline | Latest `dev` commit `2172fc8` |

## Summary

The HO-003 blockers are resolved or explained. The servers are running and healthy, the target database is the disposable `mg_portal_sandbox`, and **the user approved `npm run seed:uat` for the resumed run** (user message, 2026-10-14 13:53 Manila). Resume as **RUN-20261014-02**.

## What was done (checked on the user's machine; no files outside `quality-assurance/` changed)

| HO-003 blocker | Finding |
|---|---|
| Node/npm/Docker not found | They are installed: Node v25.2.1, npm 11.7.0, Docker 29.8.0, under `C:\Program Files\nodejs` and Docker Desktop. Your PowerShell's PATH does not include them. Use a shell where `node -v` and `docker ps` work, or call `"C:\Program Files\nodejs\npm.cmd"` directly. The project documents Node 20; record the Node version you use in the execution log. |
| API and login unreachable | `npm run dev` is now running (started by Claude Code). `GET http://localhost:4000/api/health` returned **200** and `GET http://localhost:3000/login` returned **200**. Do not start a second copy; if the ports stop responding, ask the user. |
| Root Docker DB target ≠ server DB target | The root `.env` has no `POSTGRES_*` keys (it is a copy of the server settings), so `docker compose` cannot read it. This does not affect the run: the container `mg_portal_db` is already up on port 5433 and contains `mg_portal_sandbox`, the database `server/.env` targets on a loopback host, with `LOCAL_SEED_DATABASE` matching and `LOCAL_DESTRUCTIVE_SEED` set. Do not run `docker compose` commands and do not edit any `.env` file. |

## User decisions recorded

1. **Seed approved:** you may run `npm run seed:uat` **once**, at the start of RUN-20261014-02, against `mg_portal_sandbox`. It wipes that database (today 6 users and 67 records). No other destructive command is approved.
2. **Email:** this environment is configured to send **real email through Microsoft Graph**. The user decided to disregard email in this UAT. Therefore:
   - TC-NOT-007 and TC-ADM-017 are now **deferred** (they could email real mailboxes). Record them as Not Run.
   - Never click "Send Test" in Admin Panel → Integrations, and never call `/api/notifications/send-email` or `/api/admin/test-email`.
   - Completing a delivery triggers a completion email to an `@microgenesis.example` address (a reserved, non-deliverable domain). That is expected and is not part of any test.
3. **Servers:** already started for you (see above).

## What is needed next

1. **Codex:** read the updated `codex-prompt.md` and `AGENTS.md` v1.1 (§6 order; phase 8 and phase 14 no longer include the two email cases).
2. **Codex:** start RUN-20261014-02, run `npm run seed:uat` once, re-check the health endpoint, then execute phases 0-15.
3. **User:** supply the account passwords when Codex asks for them at sign-in.

## Open issues

| ID | Description | Owner | Blocking? |
|---|---|---|---|
| NODE | Node v25 instead of the documented Node 20; note it as an environment deviation | Codex | No |
| ROOT-ENV | Root `.env` lacks `POSTGRES_*`; only matters if the container must be recreated | User | No |

## Links to relevant files

- [`../codex-prompt.md`](../codex-prompt.md)
- [`../AGENTS.md`](../AGENTS.md)
- [`HO-003-codex-to-user-preflight-blocked.md`](HO-003-codex-to-user-preflight-blocked.md)
- [`HO-002-claude-to-codex-scope-update.md`](HO-002-claude-to-codex-scope-update.md)
