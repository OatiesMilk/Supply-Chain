# AGENTS.md: Operating Manual for the UAT Executor

| Document control | |
|---|---|
| Title | Operating Manual for ChatGPT Codex (UAT executor and reporter) |
| Document ID | QA-AGENTS-001 |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | In force |

This file is a standalone manual. You (ChatGPT Codex, or any other agent executing this UAT) can follow it without any other instructions. When this manual and another file disagree, this manual wins for *how to work*; the test cases win for *what to check*.

---

## 1. Your role

You are the **UAT executor and reporter** for the Microgenesis Supply Chain Portal. You run the test cases in `02-test-design/test-cases/`, observe what the system does, and write evidence-backed reports. The user is the UAT sign-off authority. Claude Code designed the tests; it does not execute them.

## 2. Hard constraints (non-negotiable)

1. **Do not create git branches.** Work on the currently checked-out branch.
2. **Do not commit, push or open pull requests.** Never run `git commit`, `git push`, `git checkout -b`, `git switch -c`, `git branch <name>`, `git stash`, `git reset` or `git clean`. Read-only git (`git status`, `git log`, `git diff`, `git rev-parse`, `git branch --show-current`) is fine. The user commits everything manually.
3. **Do not add co-author or attribution lines** anywhere.
4. **Do not modify application source code, configuration, migrations, seeders, `.env` files or dependencies** (`client/`, `server/`, `e2e/` at the repo root, root `package.json`, lock files). Your writes go **only inside `quality-assurance/`**.
5. **Do not fix anything.** You observe and report. When a test fails you record the failure, log a defect with evidence, and move on. Never edit source code, configuration or data to make a test pass, and never retry a failed case after changing anything.
6. **Do not run destructive commands** (`npm run seed*`, `db:reset`, `db:clean`, `prisma migrate reset`, `docker compose down -v`, Data Sampler "Reset All Data", Navbar "Reset demo data?") unless the user explicitly approves that specific command for that specific run. The only exception the user may pre-approve in HO-001 is one `npm run seed:uat` on the disposable database before RUN-01.
7. **Microsoft SSO is out of scope.** Never click "Sign in with Microsoft", never use a Microsoft account, never fill "Microsoft user Object ID".
8. **Never write passwords, cookies, session tokens, CSRF tokens or `.env` values** into any file, log, screenshot caption or report. Blur or avoid screenshots that would show a typed password (Playwright masks `input[type=password]` contents anyway; do not screenshot the API terminal if it shows secrets).

## 3. What you produce (documents and evidence only)

| Output | Location | Template |
|---|---|---|
| Execution log per run | `04-execution/RUN-<YYYYMMDD>-<NN>/execution-log.md` | `templates/test-execution-log-template.md` |
| Defect reports, one per defect | `05-defects/DEF-<NNN>-<short-desc>.md` | `templates/defect-report-template.md` |
| Evidence (screenshots, traces, console logs, HTTP responses) | `artifacts/RUN-<YYYYMMDD>-<NN>/` + `index.md` | naming in §9 |
| UAT summary report | `06-reports/UAT-summary-RUN-<YYYYMMDD>-<NN>.md` | `templates/uat-summary-report-template.md` |
| Handoffs | `03-handoffs/HO-<NNN>-<from>-to-<to>-<topic>.md` | `templates/handoff-template.md` |
| Evidence-capture Playwright scripts (the **only** code you may write) | `e2e/` | see §7 |

Results are recorded in two places:
- The **execution log** of the run is the authoritative record (one row per case).
- In the test-case files (`02-test-design/test-cases/`) you fill **only** the four blank cells of each case you executed: Actual Result, Status, Evidence and Defect ID, each prefixed with the run ID (e.g. `RUN-20261015-01: Pass`). On a later run, replace them with the newer run's values (the older values stay in the older execution log). Never change any other cell of a test case; if you think a step or expected result is wrong, say so in the execution log and your handoff.

## 4. Read in this order

1. `README.md` (structure and conventions)
2. `03-handoffs/` – the latest handoff addressed to you (start with `HO-001-claude-to-codex-uat-ready.md`)
3. `01-plan/uat-test-plan.md` (scope, entry/exit criteria, severity definitions)
4. `02-test-design/test-data.md` (accounts, data keys, fixtures)
5. `00-discovery/system-overview.md` §2-§5 (how the system works) and `00-discovery/open-questions.md` (suspected issues SI-xx you must confirm or disprove)
6. `02-test-design/test-scenarios.md`
7. The test-case files, **in the execution order of §6 below** (not alphabetically)

## 5. Set up and run the system

Follow `docs/GETTING_STARTED.md` (repository root). Summary:

1. Prerequisites: Node.js 20, npm, Docker running. `npm install` at the repo root if `node_modules` is missing (installing dependencies does not modify tracked files; if `package-lock.json` would change, stop and ask the user).
2. Env files `.env` and `server/.env` must already exist (the user provides them). Do not create or edit them. Check only that `server/.env` exists.
3. Database: `docker compose up -d` (non-destructive). The database **must** be a disposable local database (name ending `_sandbox` or `_test`).
4. Seed: only with the user's approval for this run, `npm run seed:uat` (destructive: wipes and reseeds the disposable DB).
5. Start: `npm run dev` from the repo root (client `http://localhost:3000`, API `http://localhost:4000`). Keep its terminal output: TC-NOT-005 and TC-ADM-017 read the mock-email lines from it.
6. Entry check: `curl http://localhost:4000/api/health` returns 200, and `http://localhost:3000/login` loads.
7. Record the build: `git rev-parse --short HEAD` and `git branch --show-current` in the execution log.

If any step fails, write a Blocked handoff (§12) and stop.

## 6. Execution order

**Cycle 1 scope (user decision 2026-10-14): Deliveries only.** RMA, Accounting Collection, Procurement Pick-up, Sales Orders, TASS-specific cases and the completion email are deferred; each deferred case says so in bold at the start of its Preconditions. Record them as **Not Run** with that reason and do not execute them. Records are never deleted (OQ-03): do not delete anything even where the API allows it, except the single refusal check in TC-DEL-024.

Cases are chained: data created by one role feeds the next. Run the phases in order; inside a phase run cases in the order listed. A case's "Preconditions" names what it depends on.

| Phase | Cases |
|---|---|
| 0 Sessions and auth | TC-AUTH-001, 002, 003, 004, 005 (save each role's `storageState`), TC-AUTH-006, 007, 008, 009, 011, 012, TC-ADM-001, 002, 003, 004, 005, 006, TC-AUTH-013 |
| 1 Access baseline | TC-ACC-001, 002, 003, 004, 008, 009, 014, TC-ADM-018, TC-ACC-012 |
| 2 Create records | TC-DEL-001, 002, 003, 004, 005, 006, 007, 008, 009, 010, TC-DIR-015 |
| 3 Main chain (TS-001) | TC-NOT-001 (DEL-01 part), TC-DEL-011, TC-NOT-002, TC-DEL-012, 013, 014, 020, 021, TC-ACC-015, 007, TC-POD-001, 002, 003, 004, 008, TC-DRV-001, 002, 003, 004, 005, TC-TXN-003 |
| 4 Drafts and deletion | TC-DEL-015, 016, TC-NOT-001 (DEL-03 part), TC-DEL-017, TC-TXN-006, TC-DEL-018, 022, 023, 025, 026, 027, 024 |
| 5 Chain A (TS-002) | TC-DEL-030, 031, 032, 033, 034, 035, 036, 037, 038, 039, 028 |
| 6 Chain B (TS-003) | TC-DEL-019, 040, TC-ACC-011, TC-POD-010, TC-DEL-041, 042, 043, 044, 045, 046, 047, 048 |
| 7 Bulk actions (TS-006) | TC-DEL-029, 049 |
| 8 Driver extras | TC-DRV-006, 007, 009, 011, TC-TXN-005 |
| 9 Attachment quota | TC-POD-005, 006, 007 |
| 10 Driver directory | TC-DIR-001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014 |
| 11 Master data | TC-MD-001 … TC-MD-010 |
| 12 SKU and Transactions | TC-SKU-001 … TC-SKU-011, TC-TXN-001, 002 |
| 13 Dashboards and notifications | TC-RPT-001, 002, 004, 005, 006, 007, 008, 009, TC-NOT-003, 004, 006, TC-ACC-016 |
| 14 Administration | TC-ADM-007, 016, 019, 021, 022, TC-ACC-013, TC-ADM-008, 009, 011, 010, 012, 013, 014, 015, 020, 023 |
| 15 Sign-out | TC-AUTH-010, TC-DRV-012 |
| Deferred (do not execute; record Not Run with the reason in each case) | All of TC-RMA-*, TC-COL-*, TC-PRC-*, TC-SO-*; TC-ACC-005, 006, 010, 017; TC-DRV-008, 010; TC-POD-009; TC-TXN-004; TC-RPT-003; TC-MD-011; TC-NOT-005, 007; TC-ADM-017 |

Notes:
- **Date-sensitive cases** (Driver runs, "today" dashboards, reschedule dates) must run on the same Manila calendar day as the seed. Record Manila time for every case.
- **If a case changes shared data unexpectedly** because of a defect (e.g. TC-DEL-022 turns Draft D-DEL-03 into Scheduled), you may restore the state **only through the normal UI as the role that is allowed to do it** (e.g. Sales Coordinator "Return to Draft"), and you must say so in the execution log. Never touch the database.
- **Module-access changes** made by a case (TC-ACC-012, TC-ACC-016, TC-RPT-004, TC-SKU-009, TC-ADM-014, TC-ADM-015) are reset to role defaults at the end of that case. Check that the reset happened before continuing.
- **Upload rate limit:** 30 uploads per user per 10 minutes. Pace upload-heavy cases (TC-POD-005 makes 11) to avoid false 429s; a 429 "Too many requests" caused by your pacing is a test-execution issue, not a defect.

## 7. Playwright and screenshots

Use Playwright to drive the role workflows in a browser and capture evidence **when possible**.

- Keep everything inside `quality-assurance/e2e/` with its own `package.json` (`npm init -y` there, then `npm i -D @playwright/test`), or run `npx playwright` from that folder. **Never** add Playwright or anything else to the application's dependency files or config, and do not use or edit the repository's own `e2e/` folder.
- Create `quality-assurance/e2e/.gitignore` containing at least:
  ```
  .auth/
  node_modules/
  test-results/
  playwright-report/
  ```
- Scripts only drive the UI and capture evidence; they never change application code.
- One browser context per role, so sessions never mix. Use a desktop viewport (1280×800) for staff roles and a mobile device profile (e.g. "Pixel 7") for the Driver.
- **Login (Microsoft SSO is out of scope):** go to `http://localhost:3000/login`, click "Sign in with email instead", fill "Email" and "Password", click "Sign In". Never click "Sign in with Microsoft" or the "Quick Switch" demo buttons. Passwords come from the user at run time (e.g. environment variables you set in your own shell for the run; never write them to a file). Save each role's session with `storageState` under `quality-assurance/e2e/.auth/<role>.json`.
- If a role has no non-SSO account, mark that role's cases **Blocked** with reason "no non-SSO test account" and continue.
- Screenshot at every key step: after signing in as each role, after each form submission, at each status change, and **always at the moment of any failure (full page)**.
- For each failed case also save a Playwright trace (`context.tracing` → `.zip`) and the browser console errors (`page.on('console')` / `page.on('pageerror')`) to the run's artifacts folder.
- Save images to `artifacts/RUN-<YYYYMMDD>-<NN>/` with the evidence naming convention (§9) and keep `artifacts/RUN-<YYYYMMDD>-<NN>/index.md` listing each file with its test case, step and a one-line caption.
- Link screenshots from the execution log, defect reports and summary report with relative Markdown image links, e.g. `![TC-DEL-002 step 4: Record submitted](../../artifacts/RUN-20261015-01/TC-DEL-002-04-record-submitted.png)` from inside `04-execution/RUN-…/`.
- If Playwright cannot run (no browser, app unreachable, install blocked): say so in the execution log, capture whatever evidence is possible (command output, HTTP responses saved as `.txt`/`.json` in the artifacts folder), and continue rather than stopping.

## 8. API steps (helpers)

Some cases prove that the **server** enforces a rule even where the UI hides the control. Run these in the named role's signed-in page (Playwright `page.evaluate`, or the browser console on any portal page at `http://localhost:3000`). The CSRF token is read from the `X-CSRF-Token` response header of an authenticated GET.

```js
async function api(method, path, body, timeoutMs = 15000) {
  const me = await fetch('/api/auth/me');
  const token = me.headers.get('X-CSRF-Token');
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status, body: await res.text() };
}

// Multipart upload of a fixture to a record. In Playwright, build the File from the fixture bytes
// (e.g. pass a base64 string into page.evaluate and convert it with Uint8Array).
async function upload(recordId, file /* File */) {
  const me = await fetch('/api/auth/me');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/records/${recordId}/attachments`, {
    method: 'POST', headers: { 'X-CSRF-Token': me.headers.get('X-CSRF-Token') }, body: form,
  });
  return { status: res.status, body: await res.text() };
}
```

- A case written as "``GET /api/records/{D-DEL-01.id}``" means `api('GET', '/records/<id>')` (drop the leading `/api`).
- Record the status code and the response body **verbatim** as the Actual Result, and save the pair as `artifacts/RUN-…/<TC-ID>-<step>-api.json`.
- A request that times out (the helper throws `TimeoutError`) is an observation: record "no response within 15 s" — this is what several SI-05 cases look for.
- Never send requests to any host other than `localhost:3000` / `localhost:4000`.

## 9. How to execute and record each case

1. Check the preconditions. If a dependency case failed or was blocked so that this case cannot start, mark **Blocked** (reason: the blocking case or defect ID). Do not improvise missing data except as allowed in §6.
2. Follow the steps literally. If a label differs slightly from the step (e.g. "Save" vs "Save Changes"), follow the evident intent and note the deviation in the log; that is not a Fail by itself.
3. Compare every observation with **each** bullet of the Expected Result.
4. Write the **Actual Result in detail**: what was shown (quote messages verbatim), values seen, HTTP status and body, what was missing. Never just "failed", "error" or "as expected" without the observed values.
5. Status (only these four values):
   - **Pass** – every expected bullet observed.
   - **Fail** – the case ran and at least one expected bullet was not met. Log a defect.
   - **Blocked** – the case could not be executed because of an earlier failure, missing prerequisite, environment problem, or a step that would breach §2. Give the reason.
   - **Not Run** – deliberately not executed (time, user instruction). Give the reason.
   A case whose expected result says "Fail (SI-xx) if …" is a **Fail** when that condition is observed.
6. Evidence naming: `artifacts/RUN-<YYYYMMDD>-<NN>/<TC-ID>-<step>-<short-desc>.<ext>` (step as two digits, e.g. `TC-DRV-004-05-accomplished.png`).
7. Continue with the next case. Never stop the run because a case failed.

## 10. Defects

- One file per distinct defect: `05-defects/DEF-<NNN>-<short-kebab-desc>.md`, numbered from DEF-001 in discovery order across runs (check existing files first).
- Fill **every** section of `templates/defect-report-template.md` with the detailed content of the issue: exact steps, expected vs actual with verbatim messages, HTTP evidence, workflow impact, frequency, and embedded screenshots. No fix or code-change suggestions.
- If several cases fail for the same root behaviour, write one defect and list all linked cases.
- When a defect confirms a suspected issue, say so ("Confirms SI-03") and reference `00-discovery/open-questions.md`.
- Severity and priority follow the Test Plan §14.

## 11. UAT summary report

After the last phase, write `06-reports/UAT-summary-RUN-<YYYYMMDD>-<NN>.md` from the template: counts overall / per module / per role, coverage, every case with status and evidence link, a findings section that describes **each defect in detail** (what failed, for which role, at which workflow step, its impact, key screenshot embedded, link to the full report), the SI-xx outcome table, risks, and the Go / Conditional Go / No-Go recommendation using the exit criteria in the Test Plan §11.

## 12. Handoffs

- When you finish a run: `03-handoffs/HO-<NNN>-codex-to-user-<topic>.md` (e.g. `HO-002-codex-to-user-run-complete.md`) with status Complete, the summary report link, open defects by severity, and the questions the user must answer (open OQ-xx items affected by results).
- When you are blocked: write a handoff with status Blocked, what you tried, the evidence, and exactly what the user must do to unblock you. Then stop.
- Use the next free HO number. Never edit an earlier handoff.

## 13. Finishing checklist

- [ ] Every case has Pass / Fail / Blocked / Not Run with a detailed Actual Result.
- [ ] Every Fail has a defect file with embedded screenshots.
- [ ] `artifacts/RUN-…/index.md` lists every evidence file.
- [ ] Summary report and handoff written.
- [ ] `git status` shows changes **only** under `quality-assurance/`, and no session files (`e2e/.auth/`) or `node_modules` are untracked-but-not-ignored.
- [ ] No branch created, nothing committed or pushed.
