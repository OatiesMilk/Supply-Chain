# DEF-029: Logistics Statistical Reports stays loading with request errors

| Document control | |
|---|---|
| Title | DEF-029 Logistics Statistical Reports stays loading with request errors |
| Version | 1.0 |
| Date | 2026-10-15 |
| Author agent | ChatGPT Codex |
| Status | Open |

## 1. Classification

| Field | Value |
|---|---|
| Defect ID | DEF-029 |
| Title | Logistics Statistical Reports stays loading with request errors |
| Linked test case(s) | [TC-RPT-006](../02-test-design/test-cases/TC-RPT-dashboards-reports.md#tc-rpt-006-statistical-reports-summary-with-filters-and-range-validation) |
| Linked scenario | TS-015 |
| Role and account used | Logistics, logistics@microgenesis.com; passwords are not recorded |
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
| Date and time observed (Asia/Manila) | ~2026-10-14 23:50 (earliest retained evidence timestamp) |
| Database / seed | mg_portal_sandbox; npm run seed:uat |

## 3. Preconditions and data used

- TC-RPT-006: Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-038. Test data: None beyond preconditions

## 4. Steps to reproduce

### TC-RPT-006 — Statistical Reports summary with filters and range validation

1. Sidebar "Reports". "Delivery Date From (Manila)" and "To" = `<TODAY>`; Category "Deliveries"; "Generate Report".
2. Set From `<TODAY+1>`, To `<TODAY>`; "Generate Report".
3. Run as SC: `GET /api/reports/summary` (API helper).

## 5. Expected result

- TC-RPT-006: • Step 1: cards "Delivery Date Cohort", "Delivered in Cohort", "Completed by Time Out" etc. with values ≥ 1 delivered.; • Step 2: an error (server "dateFrom must be on or before dateTo") and no stale results.; • Step 3: 200 with a summary (Sales Coordinator should have Reports per OQ-09). Fail (SI-25) if 403 "Module access denied".

## 6. Actual result (in full)

- TC-RPT-006: The Logistics Reports page remained on Loading and the browser recorded 401/400 errors; the reversed-date step could not be submitted because its button was disabled. The separate Sales API check returned 403 {"error":"Module access denied"} (linked to DEF-003).

The report records observed behavior from the linked case and does not assert an unverified root cause or prescribe a code change.

## 7. Workflow impact

| Field | Value |
|---|---|
| Where in the workflow it occurred | TS-015; see linked case steps |
| What it blocks downstream | Logistics cannot obtain the expected delivery cohort report through the Reports page. |
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

![TC-RPT-006: 01 deliveries today](../artifacts/RUN-20261014-02/TC-RPT-006-01-deliveries-today.png)

## 11. Retest history

### Implementation follow-up: 2026-10-16

The user reproduced an initial failure and supplied a Prisma validation error: the Reports count query passed Date bounds to the String `timeOut` field. The working tree now uses UTC ISO string bounds for the Manila date range and forwards async query errors to the existing error handler. The existing browser error/finally path can then stop loading and show a retryable error. Automated validation is recorded in the [scope follow-up](../06-reports/2026-10-16-scope-and-sales-access-clarification.md). The exact live date range still needs browser acceptance; the historical finding remains open pending that check.

| Run ID | Date | Result | Notes |
|---|---|---|---|
| | | | |
