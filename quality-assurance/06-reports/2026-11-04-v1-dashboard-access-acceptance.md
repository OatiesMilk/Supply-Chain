# Accepted V1 dashboard access model

| Document control | Value |
| --- | --- |
| Decision date | 2026-11-04 |
| Status | User accepted the policy model; live UAT execution pending |
| Verified application revision | `d863947` |
| Scope | V1 dashboard screen, resource and record-category Read permissions |

The user accepted keeping V1 screen access, resource access and category data access separate. This supersedes the combined screen/data interpretation in `docs/UAT_PLAN.md` D-1.2 and the screen-only denial setup of TC-RPT-004 when testing V1. It does not change LEGACY behavior, activate a permission mode, or grant deployment or complete UAT sign-off.

## Accepted expectations

| Control | Expected effect |
| --- | --- |
| `SCREEN:dashboard:READ` denied | Dashboard navigation/page access is denied. A separately allowed dashboard resource can still authorize API reads. |
| `RESOURCE:dashboard:READ` denied | Dashboard API reads are rejected with HTTP 403. A screen grant does not override this denial. |
| `SCREEN:deliveries:READ` denied | The Deliveries screen is unavailable. Delivery data may remain readable through an allowed dashboard or other permitted path when category Read remains allowed. |
| `CATEGORY:DELIVERY:READ` denied | Delivery data is excluded from dashboard aggregates and other record views; direct reads of denied Delivery records are rejected. |

When denying Read, also deny dependent Write/specific actions as needed to form a valid policy. Immutable role restrictions, ownership and record lifecycle rules still apply. Screen permission is not authority to write.

## Manual acceptance cases

Use a designated disposable target and a synthetic Sales Coordinator account, with a separate Admin session. Confirm the active mode from the authenticated session is V1 and that the permission foundation is available. Do not change rollout settings to execute these cases. Keep the Sales session signed in throughout.

Record the account's initial complete override list and policy version privately. Before each case, restore that exact baseline through the authorized editor and verify the stated prerequisites; do not reset an account's existing custom exceptions blindly. Use valid reviewed versioned saves. Do not record tokens, cookies or credentials in evidence. Test only data provisioned for this run.

| Case | Setup and steps | Expected result | Execution status |
| --- | --- | --- | --- |
| V1-DASH-01 | Keep dashboard resource Read and Delivery category Read allowed. Deny dashboard screen Read and dependent screen Write. Focus/reload the existing Sales session, inspect navigation and open `/dashboard`; directly request the dashboard stats API with that session. | Dashboard is hidden/unavailable; the API can return HTTP 200 with only authorized data. | Not Run |
| V1-DASH-02 | Keep dashboard screen Read allowed; deny dashboard resource Read. Visit Dashboard and directly request stats and overview. | Page access alone cannot reveal data; both APIs return HTTP 403. The UI reports unavailable/denied data rather than showing stale values as current. | Not Run |
| V1-DASH-03 | Keep dashboard screen/resource and Delivery category Read allowed. Deny Deliveries screen Read and dependent screen Write. Inspect Deliveries and Dashboard. | Deliveries is unavailable; authorized Delivery aggregates may remain on Dashboard. | Not Run |
| V1-DASH-04 | Keep dashboard screen/resource Read allowed. Deny Delivery category Read and its dependent Write/actions. Inspect dashboard stats/overview and directly request a known Delivery record. | Delivery aggregates/previews exclude denied data; direct record read is rejected. Other authorized categories remain available. | Not Run |
| V1-DASH-05 | Deny both dashboard screen Read and resource Read with valid dependencies. Inspect the page and directly request dashboard APIs. | Dashboard is unavailable and its APIs return HTTP 403. | Not Run |
| V1-DASH-06 | Restore the exact original override list after each case, using the current editor version. Focus the existing session and retry its prior views. | The server applies current authority on the next request; the UI updates on focus or its periodic refresh without re-login. Denied or previous-session cached data must not restore access. | Not Run |

Use the configured canonical API prefix for requests; the full-switch API migration selects `/api/v1/dashboard/stats`, `/api/v1/dashboard/overview` and `/api/v1/records/:id`. The earlier automated evidence below used `/api` on its recorded revision. Preserve that distinction when attaching a new run's evidence.

## Evidence and limits

The preceding audit passed 49 automated checks: 16 client lifecycle tests, 31 server evaluator/RMA rule tests, and two isolated reproduction tests. The RMA reproduction rendered Admin and TASS Overview in LEGACY and V1, confirming that an in-transit RMA hides Return to Draft even when its supplied status list includes Draft. The dashboard reproduction exercised actual HTTP routing and evaluator logic with synthetic account/database responses: screen denial permitted resource-authorized dashboard reads, resource denial returned 403, and category denial excluded Delivery counts.

These checks did not mutate business data. They are not a live browser UAT run or real PostgreSQL save/race/rollback evidence. The temporary reproduction files are not durable run artifacts. All manual cases above remain Not Run until a new execution log and evidence are recorded. Historical results and defect statuses remain unchanged.

## Source and traceability

- [Dashboard routes](../../server/src/routes/dashboard.ts), [resource enforcement](../../server/src/middleware/auth.ts), [record data scope](../../server/src/services/recordAccess.ts), [V1 evaluator](../../server/src/services/permissionEvaluator.ts).
- [Main UAT plan](../../docs/UAT_PLAN.md), [historical dashboard case TC-RPT-004](../02-test-design/test-cases/TC-RPT-dashboards-reports.md#tc-rpt-004-dashboard-counts-respect-per-user-category-denials), [UAT test plan](../01-plan/uat-test-plan.md).
