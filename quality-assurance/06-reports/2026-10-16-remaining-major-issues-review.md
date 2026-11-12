# Remaining major issues: current working-tree review

| Document control | Value |
|---|---|
| Date | 2026-10-16 |
| Build | dev, HEAD 665775f, including uncommitted SKU creation and Reports fixes |
| Scope | Verification only; no additional application fixes |
| Method | Source review and isolated mocked route-handler probes |

## Findings

| ID | Current evidence | Assessment |
|---|---|---|
| DEF-010 | Logistics action handler returned 200 and changed a Delivery draft to Scheduled (`draft: false`). | Still violates the recorded OQ-06 user decision that Logistics must not submit drafts. Permission to create a new Scheduled record is a separate operation. |
| DEF-011 | Sales deletion handler returned 200, `{ "ok": true }`, and set `deletedAt`. | Still violates the recorded OQ-03 user decision that records must not be deleted. This is soft deletion, not permanent database removal. |
| DEF-026 | Adjustment type `Gift` returned 200, increased mocked stock from 10 to 11, and persisted the unrecognized type. | Confirmed missing type validation in the action handler. |
| DEF-017 | Injected duplicate-email P2002 and malformed-customer validation errors rejected without a response or `next(error)`. | User edit and customer creation still lack async error forwarding. No fresh 15-second browser timeout was measured. Duplicate SKU creation was addressed in the preceding implementation and is not included in this unresolved portion. |
| DEF-006 / DEF-007 | Delivery create accepted `delivery_date: "not-a-date"` and `priority: "urgent-invalid"`, returned 201, and passed both values to the mocked write. | Required-field checks do not validate these values; both findings remain applicable. |
| DEF-008 | Injected company foreign-key error P2003 was forwarded; the application's generic error middleware returns 500. | Missing company validation/error mapping remains. This is fault injection plus source review, not a new live foreign-key failure. |
| DEF-019 | Monthly Driver Report CSV source emits aggregates and breakdowns without individual delivery reference rows. | Reported omission remains in code. Confirm whether individual detail is required or the intended output is an aggregate report before treating it as a release blocker. |
| DEF-021 | Customer update checks modification timestamps and returns 409; the form handles `ApiError(409)` and renders a reload-latest button. | Not confirmed by this review. Existing protection is present; reproduce the original two-session UI scenario before claiming a current failure. |

## Policy precedence

`docs/BUSINESS_REQUIREMENTS.md` BR-REC-07 still permits Sales soft deletion and its role table broadly allows Logistics status changes. The later user decisions recorded in [open questions, section 0](../00-discovery/open-questions.md) explicitly prohibit deletion (OQ-03) and Logistics draft submission (OQ-06). Those are the acceptance rules used here. The user's current clarification supersedes OQ-09 for default Sales Calendar/Reports access only; it does not reverse OQ-03 or OQ-06. The older requirements document needs alignment when those fixes are implemented.

## Evidence and limitations

See [probe results](../artifacts/REVIEW-20261016-major-issues/handler-probe-results.json) and [evidence index](../artifacts/REVIEW-20261016-major-issues/index.md). All database operations in these probes were stubbed. The probes exercise action role guards and final handlers using allowed-role fixtures; they do not exercise authentication, resource/module permissions, record-scope middleware or a browser. Prisma constraint/validation errors were injected where noted. No real records, user emails, stock or environment settings were changed, and no additional application code was edited.

Source references:

- Draft submission: `server/src/routes/records.ts:1106`, `server/src/services/deliveryLifecycle.ts:77`.
- Deletion: `server/src/routes/records.ts:1248`.
- Stock adjustments: `server/src/routes/skus.ts:184`.
- User email update: `server/src/routes/users.ts:149`; customer creation: `server/src/routes/customers.ts:32`.
- Delivery creation: `server/src/routes/records.ts:793`; generic errors: `server/src/index.ts:127`.
- CSV export: `client/src/utils/exportDriverReport.ts:1560`.
- Customer conflict UI: `client/src/features/customers/CustomerEditForm.tsx:83` and `:170`.

This review leaves the existing automated passing results and historical UAT counts unchanged. The confirmed handler-level permission/data-integrity failures remain reasons to hold business acceptance; the presence of an API failure does not mean every normal UI interaction exposes the same action.
