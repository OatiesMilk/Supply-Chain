# RUN-20261014-01 preflight evidence

Date: 2026-10-14 (Asia/Manila)

## Repository and run selection

- `git rev-parse --short HEAD`: `2172fc8` (matches the planned baseline).
- `git branch --show-current`: `dev`.
- `RUN-20261014-01` was free in both `04-execution/` and `artifacts/` before this preflight.
- Preflight `git status --short` showed `?? quality-assurance/`; the QA package was already untracked before this run's output was added.

## Environment checks

- `.env` exists: yes. `server/.env` exists: yes. No environment-file values were recorded.
- A metadata-only safety check found that the database target configured in `server/.env` uses an allowed loopback host and `_sandbox` / `_test` suffix, and its local seed guard fields match that target. The root Docker `POSTGRES_DB` setting does not match the server target, so a matching disposable database cannot be confirmed.
- `node --version`: blocked; PowerShell could not find `node`.
- `npm --version`: blocked; PowerShell could not find `npm`.
- `docker compose ps`: blocked; PowerShell could not find `docker`.
- `GET http://localhost:4000/api/health`: unable to connect; no HTTP response.
- `GET http://localhost:3000/login`: unable to connect; no HTTP response.
- Playwright launch was not attempted because Node/npm are unavailable.

## Actions not taken

- `npm run seed:uat` was not run. It requires explicit user approval for this run, and the environment did not pass the disposable-database check.
- `npm run dev` was not run because Node/npm are unavailable.
- No account sign-ins or UAT cases were attempted. No application data was changed.
