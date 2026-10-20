# DEF-008: Unknown company on delivery creation produces an internal server error

| Document control | |
|---|---|
| Title | DEF-008 Unknown company on delivery creation produces an internal server error |
| Version | 1.0 |
| Date | 2026-10-15 |
| Author agent | ChatGPT Codex |
| Status | Open |

## 1. Classification

| Field | Value |
|---|---|
| Defect ID | DEF-008 |
| Title | Unknown company on delivery creation produces an internal server error |
| Linked test case(s) | [TC-DEL-007](../02-test-design/test-cases/TC-DEL-deliveries.md#tc-del-007-api-refuses-an-unknown-company-cleanly) |
| Linked scenario | TS-011 |
| Role and account used | Sales Coordinator, sales@microgenesis.com; passwords are not recorded |
| Severity | Major |
| Priority | P2 |
| Status | Open |
| Found in run | RUN-20261014-02 |

## 2. Environment

| Field | Value |
|---|---|
| URL | http://localhost:3000 or the API path specified in the linked case steps |
| Browser and version | Microsoft Edge 155.0.4283.45 via Playwright 1.64.1 |
| Build / commit hash | 2172fc8 |
| Date and time observed (Asia/Manila) | Exact time not retained; see execution log. |
| Database / seed | mg_portal_sandbox; npm run seed:uat |

## 3. Preconditions and data used

- TC-DEL-007: Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Test data: None beyond preconditions

## 4. Steps to reproduce

### TC-DEL-007 — API refuses an unknown company cleanly

1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `POST /api/records` body `{"company_id":"does-not-exist","category":"Deliveries","reference":"UAT-<RUN>-NEG-05","delivery_date":"<TODAY>"}` with a 15-second timeout (`AbortSignal.timeout(15000)`).

## 5. Expected result

- TC-DEL-007: Within 15 s an HTTP 4xx (400 or 404) naming the company. Fail if HTTP 500 "Internal server error" or no response within 15 s (record which).

## 6. Actual result (in full)

- TC-DEL-007: Creating with an unknown company produced HTTP 500 instead of a clean 400 validation response.

The report records observed behavior from the linked case and does not assert an unverified root cause or prescribe a code change.

## 7. Workflow impact

| Field | Value |
|---|---|
| Where in the workflow it occurred | TS-011; see linked case steps |
| What it blocks downstream | Invalid company references fail as a server error instead of a clear validation response. |
| Workaround observed | See linked case actual result; no unrecorded workaround is inferred. |

## 8. Frequency

| Field | Value |
|---|---|
| Reproducibility | Observed in this run; not re-tested after failure |
| Attempts | Case execution only; see steps for multi-attempt probes. No independent retry was made. |

## 9. Technical evidence

- Browser console errors: no finding-specific console transcript retained.
- Network request and response: No separate request/response artifact was retained for these cases.
- Server log lines: no finding-specific server log transcript retained.
- Playwright trace: not retained.

## 10. Screenshots

No screenshot was retained for the linked failure.

## 11. Retest history

| Run ID | Date | Result | Notes |
|---|---|---|---|
| | | | |


### Confirmed-issue remediation: 2026-10-16

Delivery creation checks that the Company exists and returns 400 if it does not. A foreign-key failure during creation also maps to a clean 400 response.

Focused mocked-handler regressions passed. Full validation and browser acceptance status are tracked in the [remediation record](../06-reports/2026-10-16-major-issues-remediation.md). Historical test outcomes remain unchanged; this is an implementation follow-up, not live UAT closure.
