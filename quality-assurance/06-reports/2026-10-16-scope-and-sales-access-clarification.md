# Sales access clarification and implementation scope

| Document control | Value |
|---|---|
| Date | 2026-10-16 |
| Status | User policy accepted; implementation and automated validation complete; live acceptance pending |

The user confirmed that Delivery Calendar and Reports are intentionally disabled by default for Sales Coordinator. The user granted both modules through Admin Module Access and verified that they work on their Sales Coordinator account. The permission behavior is accepted as Pass; DEF-003 is closed by requirement clarification. The requirement is optional per-account grants, rather than a default role grant. This supersedes the default-grant interpretation of OQ-09 in the original UAT package.

Historical execution logs, failed observations and totals are preserved. This clarification is not an executor rerun of the complete access-control cases. Future execution of TC-ACC-001, TC-ACC-002 and the Sales-access portion of TC-RPT-006 must use the actual permission setup: denied access without a grant is expected, and access after an Admin grant must succeed. Other role restrictions remain applicable.

The user also reported an initial Logistics Reports failure followed by a successful second attempt. The supplied server log identifies `prisma.deliveryRecord.count()` in `server/src/routes/reports.ts`, with Date-valued range bounds passed to the String `timeOut` field. DEF-029 remains open pending correction and exact-range retesting. The later successful attempt does not invalidate the failed request.

The user authorized adding Admin SKU creation and fixing Reports. Admin SKU ownership remains consistent with BR-SKU-01. Other findings, including draft-submission authorization, record deletion, duplicate-email handling and invalid stock adjustment types, remain outside this implementation scope and are not cleared by the Sales-access decision.

Related documents: [DEF-003](../05-defects/DEF-003-sales-coordinator-is-denied-approved-calendar-and-reports-access.md), [original UAT results](UAT-summary-RUN-20261014-02.md), [subsequent authorized major-issue remediation](2026-10-16-major-issues-remediation.md). The earlier focused Sales run remains a separate local QA record; it is not required to review this implementation.

## Implementation and validation

Admin SKU creation is available through SKU Master → Create SKU. The form uses the existing authenticated Admin-only API, refreshes the catalog on success and preserves input on a rejected save. Product, zero-stock inventory and CREATE audit are saved in one transaction. Creation validates required fields, category, finite non-negative cost/price and a non-negative integer reorder point; duplicate codes return HTTP 409. These changes do not add SKU editing or change stock adjustment permissions or validation.

Reports now passes UTC ISO string bounds to the String `timeOut` field, preserving the inclusive Manila start and exclusive next-day boundary. Prisma filter typing prevents reintroducing the Date/String mismatch. The handler uses the existing async error middleware, allowing the existing frontend catch/finally behavior to display an error and stop loading on rejection.

Validation on the working tree:

- `npm run test:server`: 226 tests passed, zero failed. The sandbox run stalled; a local bind probe returned EPERM. The approved unrestricted rerun passed.
- `npm run test:client`: 27 reported test files passed, zero failed.
- Focused cases: Reports lifecycle 5/5, SKU server creation 5/5, client SKU/report checks 4/4.
- `npx tsc --noEmit -p server/tsconfig.json` and `npx tsc --noEmit -p client/tsconfig.json`: passed.
- `git diff --check`: passed.

Database behavior in the new focused tests is mocked; UI interactions use a DOM test environment. These are regression results, not live four-role UAT sign-off. No live database mutation, migration, role-default change, commit or branch creation was performed for this implementation.

Manual acceptance still needed: as Admin, create a disposable SKU and verify zero stock, warehouse location, audit and duplicate-code rejection. As Logistics, repeat the exact failing Reports date range (2026-07-01 through 2026-12-31 Manila, based on the supplied log), using the same other filters, and confirm the first request returns a report. The user reported success for Sales access after a grant; this decision is independent of the report generation fix. DEF-024/DEF-029 and the creation portion of DEF-025 are implemented pending live acceptance; DEF-017 is addressed only for duplicate SKU creation. Remaining historical findings stay open unless separately accepted or retested.
