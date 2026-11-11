# Staging readiness audit — 2026-11-04

Revision: `c1efd101eb801d48f6dd1671918737e338373d7a`. Working tree was clean at audit start. This is a repository readiness assessment, not verification of a deployed staging environment.

**Decision: hold unrestricted staging/UAT promotion.** The build and existing regression gates pass, including isolated PostgreSQL checks and the recorded CI browser job. Address the reachable vulnerable spreadsheet dependency, triage the other dependency advisories, and resolve or explicitly accept the two reproduced failure-path defects before promotion. Hosted configuration remains a separate release gate. An isolated engineering preview with synthetic data is a narrower use case than staging sign-off.

No application code, business data, shared database, deployment, tickets or provider state was changed. The audit regenerated the local Prisma client, used temporary build/test artifacts and runner-owned PostgreSQL databases, and added this report.

## Findings

### S1 — High: vulnerable spreadsheet parser is used for uploaded attachment previews

- [package-lock.json](../package-lock.json#L9422) locks `xlsx` to 0.18.5. [PodAttachmentPreview.tsx](../client/src/components/PodAttachmentPreview.tsx#L49) passes uploaded spreadsheet bytes to `XLSX.read` in the browser.
- `npm audit --omit=dev --json` reports SheetJS prototype-pollution and regular-expression denial-of-service advisories. [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) identifies versions before 0.20.2 as vulnerable and states that the npm package has no patched release. [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) covers prototype pollution.
- Trigger: an authorized reviewer previews a crafted uploaded workbook. The parser is reachable; exploitability of a particular malicious workbook was not reproduced. Display row/column limits do not establish that the parser vulnerability is mitigated.
- Remedy: replace the parser or obtain a reviewed patched distribution, retaining preview limits and regression checks. Recheck the dependency tree after updating.
- The full scan reports **26 affected packages: 1 critical, 13 high, 12 moderate**. These are package-level audit counts, not 26 demonstrated application exploits. Other flagged dependencies include DOMPurify, MSAL Node, Multer, Nodemailer and Zod. DOMPurify's critical advisory requires specific modes; those modes were not demonstrated here. Vite is listed as a production dependency but its development-server advisories do not automatically apply to the static staging bundle. Triage actual call paths rather than blindly running a forced audit fix.

### S2 — Medium: database failures leave core record reads hanging

- [records.ts](../server/src/routes/records.ts#L307) registers the record list as a raw async Express 4 handler. The same pattern occurs at lines 622, 756, 1089 and 1772 for history counts, detail, remarks and comments.
- A rejected query escapes Express error middleware. [index.ts](../server/src/index.ts#L47) logs unhandled rejections but cannot finish the request. Authentication/resource middleware wraps its own callback, not the downstream leaf handler.
- Reproduction mounted the actual list leaf on an isolated HTTP listener, injected a rejected `deliveryRecord.findMany`, and installed error middleware. Result: `{"outcome":"TimeoutError","unhandledRejection":true,"errorMiddlewareReached":false}` at a 300 ms request timeout.
- Impact: transient database errors strand loading states and requests instead of producing a controlled retryable response.
- Remedy: use the existing `asyncRoute` wrapper and cover database-rejection responses. This finding is independently reproduced with a database double, not a live database outage.

### S3 — Medium: completion can report failure after committing successfully

- [records.ts](../server/src/routes/records.ts#L1701) commits completion and audit before awaiting `notifyAccomplished` at line 1718 and the collection-to-TASS alert at line 1723. [notify.ts](../server/src/services/notify.ts#L24) can reject during database lookup/logging. Only the provider send has a local catch.
- An isolated HTTP reproduction used the actual status handler, a transaction double, and real PNG decoding with mocked storage. Injecting notification lookup failure after commit returned `{"httpStatus":500,"committed":true,"persistedStatus":"ACCOMPLISHED"}`.
- Impact: Driver/Logistics sees an apparent failure although completion is saved; a retry may be refused by lifecycle checks, and the TASS handoff can be missed. Ordinary assignment has analogous post-commit exposure at [records.ts](../server/src/routes/records.ts#L1545), confirmed by source trace rather than a separate execution.
- Remedy: persist notification intent transactionally with durable retries and return the committed business outcome accurately. Ordinary creation/submission notifications already execute transactionally; the older creation defect is not being reported again.

### S4 — Medium, conditional: deployment blueprint needs manual proxy/readiness configuration

- [render.yaml](../render.yaml#L11) supplies neither `PROXY_SHARED_SECRET` nor `TRUST_PROXY`. Without the documented manual configuration, [rateLimits.ts](../server/src/middleware/rateLimits.ts#L53) can count anonymous users under a shared proxy address, allowing one user's failed sign-ins to throttle others.
- The blueprint also omits `healthCheckPath`, despite the database-aware `/api/health` endpoint at [index.ts](../server/src/index.ts#L72).
- Remedy: configure the verified proxy identity path and the health endpoint before UAT. [Staging configuration](STAGING_CONFIGURATION.md) documents the proxy settings correctly. This is a blueprint gap, not evidence that hosted settings are wrong.

## Verification

| Check | Result and scope |
| --- | --- |
| `npm run lint --workspace=client` | Passed; TypeScript only |
| `npm run prisma:generate --workspace=server` | Passed; refreshed stale local generated client |
| `npm run lint --workspace=server` | Passed after regeneration |
| `npm run prisma:validate --workspace=server` | Passed |
| `npm run test:client` | 298 passed, 0 failed, 1 skipped; the integrated V1 PostgreSQL/client test requires its own opt-in target |
| `npm run test:server` with isolated environment and database opt-ins unset | 456 passed, 0 failed, 5 skipped; database doubles/router tests, not live provider evidence |
| `npm run test:seeded-db` | Passed: 44 tests across five runner-owned PostgreSQL suites, 0 failed/skipped; fresh migrations, seeded role/session API checks, deletion rollback/recovery, permission foundation, permission management races and RMA activation |
| `npm run build --workspace=client -- --mode staging --outDir /tmp/supply-chain-staging-build` | Passed; bundle-size warning, largest reported chunk ExcelJS about 940 kB uncompressed |
| `cmp worker.js client/public/_worker.js` | Passed |
| Two isolated fault-injection reproductions | Confirmed S2 and S3; no real provider or business database used |
| `npm audit --omit=dev --json` | 26 affected packages; requires remediation/triage as described above |
| CI for the exact audited SHA | [Run 41584880723](https://github.com/OatiesMilk/Supply-Chain/actions/runs/41584880723) succeeded: quality gate and Playwright E2E job. Includes backend build, migrations and SC/Logistics/Driver/cross-role browser suites |
| Local browser E2E | Not run: existing ports 3000 and 4000 were unavailable. No extra application servers started |
| `postman status` | CLI available, no initialized project resources or signed-in account. Existing repository tests were used; no collection was published |

The initial backend typecheck found a stale generated Prisma client missing `podStorageDeletion`; generation resolved it. The initial unsanitized backend test attempt had failures and was stopped; the reported successful run explicitly selected LEGACY by default, disabled external providers, used an unreachable ordinary database URL and unset database opt-ins. Individual tests exercise V1 where specified. The initial temporary PostgreSQL attempt was interrupted and cleaned up; the complete second run is the result reported above. This separates local setup issues from release defects.

## Coverage and remaining release gates

Reviewed current authentication, shared record authorization, role ceilings, Driver ownership, record versions/transactions, RMA transport versus TASS receipt/completion, collection verification, notification delivery, attachment cleanup, session/cache isolation, build/CI and deployment configuration. Existing guards and tests are substantive. This was not an exhaustive every-screen or load test.

Before signing off the deployed staging environment:

1. Verify the intended database and all migrations, including `20261103010000_pod_storage_deletion_outbox`; confirm a usable backup/restore procedure. Fresh-database migration success does not verify an upgrade of existing staging data.
2. Check Worker API target, HTTPS origins/cookies/CSRF, proxy secrets/hops and readiness monitoring on the actual deployment.
3. Verify private attachment upload, preview, download, deletion retry and persistence across restart against the intended storage provider. Local-file tests do not prove Supabase behavior.
4. Record the deployed permission mode. LEGACY is the default; V1 needs verified policy conversion/activation. Exercise Admin/TASS browser journeys and cross-role handoffs; the default CI browser job is not complete V1/Admin/TASS coverage.
5. Verify Microsoft tenant/redirect configuration and intended billing/AM recipients. Use approved staging mail recipients; configured, mocked and provider-accepted outcomes are not inbox delivery evidence. Teams embedding remains unverified.

In-process reminders and rate limits also assume a single instance; missed schedule catch-up and duplicate reminders need consideration before horizontal scaling. Automatic operational stock/financial reconciliation is outside current scope and was not treated as a regression.
