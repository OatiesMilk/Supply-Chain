# HO-001: Claude Code to Codex, UAT package ready

| Document control | |
|---|---|
| Title | HO-001 Claude Code to Codex: UAT package ready |
| Version | 1.0 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Open |

| Field | Value |
|---|---|
| From | Claude Code (test designer) |
| To | ChatGPT Codex (test executor and reporter) |
| Date (Asia/Manila) | 2026-10-14 |
| Status | Ready |
| Related run(s) | RUN-<YYYYMMDD>-01 (first run, not started) |
| Previous handoff | none |

## Summary

The UAT package for the Microgenesis Supply Chain Portal (branch `dev`, commit `2172fc8`) is complete and ready to execute: 17 scenarios and 211 test cases covering all five roles, every status transition and every business rule found in the code, plus 24 suspected issues to confirm or disprove. Your job is to observe and report only. Read [`../AGENTS.md`](../AGENTS.md) first; it is your operating manual.

## What was done

- Read the server (roles, permissions, record lifecycle, every API route) and the client (screens, labels, per-role controls) and wrote the system model with code references.
- Wrote the test plan, scenarios, test cases, test data, traceability matrix and the four templates.
- Recorded 24 suspected issues and 9 open questions instead of fixing anything. No application file was changed.

## Documents (read in this order)

| # | Document | Purpose |
|---|---|---|
| 1 | [`../README.md`](../README.md) | Structure and conventions |
| 2 | [`../AGENTS.md`](../AGENTS.md) | Your operating manual, constraints, execution order (§6), API helper (§8) |
| 3 | [`../01-plan/uat-test-plan.md`](../01-plan/uat-test-plan.md) | Scope, entry/exit criteria, severity, risks |
| 4 | [`../02-test-design/test-data.md`](../02-test-design/test-data.md) | Accounts, data keys, file fixtures |
| 5 | [`../00-discovery/system-overview.md`](../00-discovery/system-overview.md) | How the system works, with evidence |
| 6 | [`../00-discovery/open-questions.md`](../00-discovery/open-questions.md) | SI-01..SI-24 to confirm; OQ-01..OQ-09 |
| 7 | [`../02-test-design/test-scenarios.md`](../02-test-design/test-scenarios.md) | TS-001..TS-017 |
| 8 | [`../02-test-design/test-cases/`](../02-test-design/test-cases/) | 16 files, 211 cases |
| 9 | [`../02-test-design/traceability-matrix.md`](../02-test-design/traceability-matrix.md) | Coverage map |
| 10 | [`../templates/`](../templates/) | Execution log, defect report, summary report, handoff |

## Recommended execution order

Follow `AGENTS.md` §6 phases 0-16. In short: sessions and auth → access baseline → create records → main chain TS-001 → drafts → chain A → chain B → collection → RMA → pick-up / sales orders / driver → attachment quota → driver directory → master data → SKU and transactions → dashboards and notifications → administration → sign-out.

## What is needed next

1. **User:** provide the environment prerequisites below and confirm the passwords for the five seeded accounts at run time (never written to files).
2. **User:** approve (or run) one `npm run seed:uat` on the disposable database before RUN-01.
3. **User (optional, before or after the run):** answer OQ-01..OQ-09 in `00-discovery/open-questions.md`; the answers decide the expected result of a few cases.
4. **Codex:** execute RUN-<YYYYMMDD>-01 per `AGENTS.md`, then write the summary report and HO-002 to the user.

## Environment prerequisites the user must provide

| Need | Detail |
|---|---|
| Node.js 20 + npm, Docker running | `docs/GETTING_STARTED.md` §Prerequisites |
| `.env` and `server/.env` | Copied from the examples, pointing at a **disposable** local database (name ending `_sandbox` or `_test`), with `LOCAL_DESTRUCTIVE_SEED=true` and `LOCAL_SEED_DATABASE` set; no SMTP/Azure values (mock mailer) |
| Seeded data | `npm run seed:uat` on the run day (Driver cases depend on the seed's Manila date) |
| Running servers | `npm run dev` (client 3000, API 4000), with access to the API terminal output |
| Passwords | For U-SC, U-LOG, U-TASS, U-ADM, U-DRV and for the accounts Codex creates (U-SC2, U-LOCK, U-DRVA, U-DRV2, U-TEMP) |

## Open issues / known gaps

| ID | Description | Owner | Blocking? |
|---|---|---|---|
| EXCL-SSO | Microsoft SSO login is excluded from this cycle by the user's decision; never use it | User | No |
| SCHED | 4 PM / 6 PM / Monday 8 AM reminders are not testable on demand; not covered | User | No |
| OQ-01..OQ-09 | Business intent questions; cases record the observed behaviour either way | User | No |
| SI-17 | TASS likely has no UI to work RMA records (TC-RMA-003); TS-004 uses Admin and API steps so the chain can continue | Codex to confirm | No |
| LABELS | UI labels were read from source code; if a label differs at run time, follow the intent and log the deviation | Codex | No |
| NOT-005 / ADM-017 | Need the API terminal output to see mock emails; mark Blocked if unavailable | User / Codex | No |

## Links to relevant files

- [`../AGENTS.md`](../AGENTS.md)
- [`../01-plan/uat-test-plan.md`](../01-plan/uat-test-plan.md)
- [`../00-discovery/open-questions.md`](../00-discovery/open-questions.md)
- [`../02-test-design/traceability-matrix.md`](../02-test-design/traceability-matrix.md)
- `docs/GETTING_STARTED.md` (repository root)
