# HO-003: Codex to user, UAT preflight blocked

| Document control | |
|---|---|
| Title | HO-003 Codex to user: UAT preflight blocked |
| Version | 1.0 |
| Date | 2026-10-14 |
| Author agent | ChatGPT Codex |
| Status | Open |

| Field | Value |
|---|---|
| From | ChatGPT Codex (UAT executor and reporter) |
| To | User (UAT sign-off authority) |
| Date (Asia/Manila) | 2026-10-14 |
| Status | Blocked |
| Related run(s) | RUN-20261014-01 |
| Previous handoff | HO-002 |

## Summary

UAT stopped at the entry checks before any case was executed. Node/npm and Docker were unavailable in the shell, both application endpoints were unreachable, and the database settings in the root and server environment files did not match, so the disposable database could not be confirmed. No seed or sign-in was attempted.

## What was done

- Read the UAT operating manual, scope update, plan, test data, discovery documents, scenarios and test-case files in the required order.
- Confirmed HEAD `2172fc8` on branch `dev`; this matches the planned baseline.
- Created the run's execution log and a sanitized preflight evidence file under `quality-assurance/`.
- Did not run `npm run seed:uat`; the prompt requires explicit approval for this run, and the database check failed.
- Did not start the application, sign in, execute tests, or change application data.

## What is needed next

1. **User:** make Node.js 20, npm and Docker Compose available in the run shell.
2. **User:** resolve the mismatch between the root Docker database name and the server database target, and confirm both point to the same disposable local `_sandbox` or `_test` database. Keep all environment values private.
3. **User:** start PostgreSQL and the application, then confirm `GET http://localhost:4000/api/health` returns 200 and `http://localhost:3000/login` loads.
4. **User:** explicitly approve `npm run seed:uat` for a specific run after the disposable database is verified. This approval is required by the UAT prompt; no seed was run here.
5. **User:** provide the seeded-account passwords at runtime for sign-in. Passwords must not be written to files, logs, captions or reports.
6. **Codex:** resume only after the entry checks pass. Per the operating manual, a resumed run uses a new run ID; no test cases have been executed in RUN-20261014-01.

## Open issues

| ID | Description | Owner | Blocking? |
|---|---|---|---|
| ENV-01 | Node.js/npm and Docker Compose are unavailable in the shell. | User | Yes |
| ENV-02 | API health and client login endpoints are unreachable. | User | Yes |
| ENV-03 | Root Docker and server database targets do not match; disposability cannot be confirmed. | User | Yes |
| SEED-APPROVAL | Explicit approval for `npm run seed:uat` is still required for the run that eventually passes preflight. | User | Yes |
| AUTH-01 | Test account passwords are needed at runtime for sign-in. | User | Yes |

## Links to relevant files

- [Execution log](../04-execution/RUN-20261014-01/execution-log.md)
- [Preflight evidence](../artifacts/RUN-20261014-01/preflight-checks.md)
- [Evidence index](../artifacts/RUN-20261014-01/index.md)
- [Operating manual](../AGENTS.md)
- [Test plan](../01-plan/uat-test-plan.md)
