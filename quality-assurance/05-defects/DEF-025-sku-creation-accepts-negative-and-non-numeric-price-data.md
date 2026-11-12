# DEF-025: SKU creation accepts negative and non-numeric price data

| Document control | |
|---|---|
| Title | DEF-025 SKU creation accepts negative and non-numeric price data |
| Version | 1.0 |
| Date | 2026-10-15 |
| Author agent | ChatGPT Codex |
| Status | Open |

## 1. Classification

| Field | Value |
|---|---|
| Defect ID | DEF-025 |
| Title | SKU creation accepts negative and non-numeric price data |
| Linked test case(s) | [TC-SKU-003](../02-test-design/test-cases/TC-SKU-sku-master.md#tc-sku-003-sku-numeric-fields-are-validated) |
| Linked scenario | TS-014 |
| Role and account used | Admin, admin@microgenesis.com; passwords are not recorded |
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

- TC-SKU-003: Signed in as Admin in its own browser context (session from TC-AUTH-004). Test data: None beyond preconditions

## 4. Steps to reproduce

### TC-SKU-003 — SKU numeric fields are validated

1. In the Admin session, send with the API helper (AGENTS.md §8): `POST /api/skus` body `{"sku_code":"UAT-SKU-<RUN>-NEG","name":"Bad","category":"A","unit_cost":-5,"unit_price":"abc","reorder_point":1}` with `AbortSignal.timeout(15000)`
2. Search SKU Master for `UAT-SKU-<RUN>-NEG`.

## 5. Expected result

- TC-SKU-003: • A 400 naming the invalid fields within 15 s.; • No SKU `UAT-SKU-<RUN>-NEG` exists. Fail (SI-06) if created, 500, or no response.

## 6. Actual result (in full)

- TC-SKU-003: POST /api/skus accepted unit_cost -5 and unit_price abc with HTTP 201; inventory had on_hand_qty 0, cost -5, and price null.

The report records observed behavior from the linked case and does not assert an unverified root cause or prescribe a code change.

## 7. Workflow impact

| Field | Value |
|---|---|
| Where in the workflow it occurred | TS-014; see linked case steps |
| What it blocks downstream | Invalid cost and price values can enter inventory and affect purchasing or valuation workflows. |
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

### Implementation follow-up: 2026-10-16

As part of authorized Admin SKU creation, the working-tree POST route now rejects negative or non-finite cost/price and invalid reorder points before writing. Automated regression validation is recorded in the [scope follow-up](../06-reports/2026-10-16-scope-and-sales-access-clarification.md). This concerns creation only; no SKU edit or stock-adjustment acceptance is implied. Historical results remain unchanged pending live acceptance.

| Run ID | Date | Result | Notes |
|---|---|---|---|
| | | | |


### Confirmed-issue remediation: 2026-10-16

SKU editing now shares the creation validation for finite non-negative numeric values and integer reorder points. Product edits and their audit entry are transactional; duplicate codes return 409.

Focused mocked-handler regressions passed. Full validation and browser acceptance status are tracked in the [remediation record](../06-reports/2026-10-16-major-issues-remediation.md). Historical test outcomes remain unchanged; this is an implementation follow-up, not live UAT closure.
