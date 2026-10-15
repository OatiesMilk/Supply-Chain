# UAT Summary Report: RUN-<YYYYMMDD>-<NN>

| Document control | |
|---|---|
| Title | UAT Summary Report RUN-<YYYYMMDD>-<NN> |
| Version | 1.0 |
| Date | <YYYY-MM-DD> |
| Author agent | ChatGPT Codex |
| Status | Draft for sign-off |

> Save as `06-reports/UAT-summary-RUN-<YYYYMMDD>-<NN>.md`.

## 1. Execution summary

Three to six sentences: what was tested, in which environment and build, how far execution got, and the headline outcome.

| Field | Value |
|---|---|
| Run ID(s) covered | |
| Execution window (Asia/Manila) | |
| Build / commit hash | |
| Environment | |
| Test package version | |
| Execution log | `../04-execution/RUN-<YYYYMMDD>-<NN>/execution-log.md` |

## 2. Results overall

| Total | Pass | Fail | Blocked | Not Run | Pass rate (Pass / executed) |
|---|---|---|---|---|---|
| | | | | | |

### 2.1 By module

| Module (file) | Total | Pass | Fail | Blocked | Not Run |
|---|---|---|---|---|---|
| TC-AUTH | | | | | |

### 2.2 By role

| Role | Total | Pass | Fail | Blocked | Not Run |
|---|---|---|---|---|---|
| Sales Coordinator | | | | | |
| Logistics | | | | | |
| TASS | | | | | |
| Admin | | | | | |
| Driver | | | | | |
| Unauthenticated / API | | | | | |

## 3. Coverage

- Scenarios executed: <n> of <total> (list any not executed and why)
- Requirements / rules with at least one executed case: <n> of <total> (from `../02-test-design/traceability-matrix.md`)
- Requirements left uncovered by this run and why

## 4. Results of every test case

| Test Case ID | Title | Role | Status | Defect ID | Evidence |
|---|---|---|---|---|---|
| TC-XXX-000 | | | | | [screenshot](../artifacts/RUN-.../TC-XXX-000-01-desc.png) |

## 5. Findings (one subsection per defect, in severity order)

### DEF-<NNN>: <title>

- **Severity / Priority:** Major / P2
- **Role and workflow step:** e.g. Logistics, TS-001 step 4 (assign driver)
- **What failed:** detailed description of the observed behaviour, with on-screen and API error text quoted verbatim
- **Expected:** what the test case required
- **Impact:** who is affected and what it blocks downstream
- **Linked cases:** TC-...
- **Full report:** [DEF-<NNN>](../05-defects/DEF-<NNN>-<desc>.md)

![DEF-<NNN> key screenshot: <caption>](../artifacts/RUN-<YYYYMMDD>-<NN>/<TC-ID>-<step>-<desc>.png)

## 6. Open defects by severity

| Severity | Count | Defect IDs |
|---|---|---|
| Critical | | |
| Major | | |
| Minor | | |
| Trivial | | |

## 7. Suspected issues from discovery: confirmation status

For every suspected issue (SI-NN) listed in `../00-discovery/open-questions.md`, state whether execution confirmed it (Fail, with DEF ID), disproved it (Pass) or could not determine it (Blocked / Not Run).

| SI ID | Covering case(s) | Outcome | Defect ID |
|---|---|---|---|
| | | | |

## 8. Risks and observations

Residual risks, environment limitations, and anything that reduces confidence in the results.

## 9. Recommendation

**Go / Conditional Go / No-Go**, applying the exit criteria in `../01-plan/uat-test-plan.md` §11, with a short justification. For Conditional Go, list each condition.

## 10. Sign-off

| Role | Name | Decision | Date | Signature |
|---|---|---|---|---|
| UAT executor | ChatGPT Codex | Report submitted | | n/a |
| UAT sign-off authority | (user) | Go / Conditional Go / No-Go | | |
