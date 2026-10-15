# Test Execution Log: RUN-<YYYYMMDD>-<NN>

| Document control | |
|---|---|
| Title | Test Execution Log RUN-<YYYYMMDD>-<NN> |
| Version | 1.0 |
| Date | <YYYY-MM-DD> |
| Author agent | ChatGPT Codex |
| Status | In Progress / Complete / Suspended |

> Copy this file to `04-execution/RUN-<YYYYMMDD>-<NN>/execution-log.md` and fill every field.
> Status values allowed: **Pass, Fail, Blocked, Not Run**. No other values.

## 1. Run information

| Field | Value |
|---|---|
| Run ID | RUN-<YYYYMMDD>-<NN> |
| Start date and time (Asia/Manila) | |
| End date and time (Asia/Manila) | |
| Executor | ChatGPT Codex |
| Environment | Local dev (`http://localhost:3000` client, `http://localhost:4000` API) / other: |
| Browser and version (Playwright) | |
| Build / commit hash | output of `git rev-parse --short HEAD` |
| Branch | output of `git branch --show-current` |
| Database | Disposable local database name only (never the connection string) |
| Seed used | `npm run seed:uat` / `npm run seed` / other: |
| Seed date (the Manila "today" the seed used) | |
| Test package version | UAT package version from `01-plan/uat-test-plan.md` |
| Evidence folder | `artifacts/RUN-<YYYYMMDD>-<NN>/` |

## 2. Environment checks before execution

| Check | Result | Evidence |
|---|---|---|
| `GET http://localhost:4000/api/health` returns HTTP 200 | | |
| Login page loads at `http://localhost:3000/login` | | |
| Each role account in `02-test-design/test-data.md` can sign in | | |
| Playwright can launch a browser | | |

## 3. Case-by-case results

Record cases in the order executed. "Actual Result" must describe what was observed in detail (values shown, messages quoted verbatim, HTTP status codes), never just "failed" or "error".

| # | Test Case ID | Role | Status | Actual Result (detailed) | Evidence (relative links) | Defect ID | Executed at (Manila time) |
|---|---|---|---|---|---|---|---|
| 1 | TC-XXX-000 | | | | `../../artifacts/RUN-.../TC-XXX-000-01-desc.png` | | |

## 4. Blocked cases

| Test Case ID | Blocked by (case, defect, or environment) | Reason |
|---|---|---|
| | | |

## 5. Deviations from the test procedure

Describe any place where the steps could not be followed literally (renamed button, extra dialog, data already changed) and what was done instead. Do not change application code, configuration or data to work around a problem.

## 6. Run totals

| Pass | Fail | Blocked | Not Run | Total |
|---|---|---|---|---|
| | | | | |

## 7. Notes

Free text: environment problems, Playwright limitations, anything the next run should know.
