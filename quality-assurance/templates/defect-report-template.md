# DEF-<NNN>: <Short, specific title naming what failed and where>

| Document control | |
|---|---|
| Title | DEF-<NNN> <title> |
| Version | 1.0 |
| Date | <YYYY-MM-DD> |
| Author agent | ChatGPT Codex |
| Status | Open |

> Save as `05-defects/DEF-<NNN>-<short-kebab-desc>.md`. One defect per file.
> This report describes the **observed failure only**. It contains no fix, no patch and no code change.
> A developer must be able to understand and reproduce the problem from this file alone, without re-running the test.

## 1. Classification

| Field | Value |
|---|---|
| Defect ID | DEF-<NNN> |
| Title | |
| Linked test case(s) | TC-<MODULE>-<NNN> (`../02-test-design/test-cases/<file>.md`) |
| Linked scenario | TS-<NNN> |
| Role and account used | e.g. Logistics, `logistics@microgenesis.com` (password never recorded) |
| Severity | Critical / Major / Minor / Trivial (definitions in `01-plan/uat-test-plan.md` §14) |
| Priority | P1 / P2 / P3 / P4 |
| Status | Open / Retest Passed / Retest Failed / Closed (user decides closure) |
| Found in run | RUN-<YYYYMMDD>-<NN> |

## 2. Environment

| Field | Value |
|---|---|
| URL | e.g. `http://localhost:3000/deliveries?item=REC-12345` |
| Browser and version | |
| Build / commit hash | |
| Date and time observed (Asia/Manila) | |
| Database / seed | Disposable local database name and seed command |

## 3. Preconditions and data used

State the system state before the first step and the exact data values used (record IDs, references, company, dates, file names). Refer to `02-test-design/test-data.md` keys where applicable.

## 4. Steps to reproduce

1. 
2. 
3. 

## 5. Expected result

Quote the expected result from the test case and, where it exists, the code reference the expectation comes from.

## 6. Actual result (in full)

Describe exactly what happened:
- On-screen messages and error text, quoted verbatim: "..."
- Wrong values shown (expected X, shown Y)
- What was missing or unexpected (element not shown, button enabled when it should be hidden, record not created)
- HTTP request and status code observed, with the response body's `error` text quoted verbatim

## 7. Workflow impact

| Field | Value |
|---|---|
| Where in the workflow it occurred | e.g. TS-001 step 4, Logistics assigning a driver |
| What it blocks downstream | e.g. Driver cannot record Time In, so TC-DRV-003..006 are Blocked |
| Workaround observed (if any, without changing code or data) | |

## 8. Frequency

| Field | Value |
|---|---|
| Reproducibility | Always / Intermittent |
| Attempts | e.g. 3 of 3 attempts failed |

## 9. Technical evidence

- Browser console errors (copied verbatim):
```text
```
- Network request and response (method, URL path, status, response body):
```text
```
- Server log lines, if visible in the terminal running the API (never include secrets, cookies or tokens):
```text
```
- Playwright trace: `../artifacts/RUN-<YYYYMMDD>-<NN>/<TC-ID>-trace.zip`

## 10. Screenshots

Embed every relevant screenshot with a relative link and a one-line caption.

![<TC-ID> step <n>: <caption>](../artifacts/RUN-<YYYYMMDD>-<NN>/<TC-ID>-<step>-<short-desc>.png)

## 11. Retest history

| Run ID | Date | Result | Notes |
|---|---|---|---|
| | | | |
