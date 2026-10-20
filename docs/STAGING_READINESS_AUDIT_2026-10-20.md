# Staging readiness audit — 2026-10-20

**Original audit recommendation: hold promotion until the record disclosure and stock concurrency defects below are fixed or explicitly accepted for isolated staging.** The findings below describe the audited baseline; see the remediation follow-up for subsequent changes.

Reviewed `dev` at `8a75e692571f709a678354df56679ad6888496a4` against local staging reference `c637547a0c4577b10a59550a2485b72ab9e7529c`. This is a focused staging-readiness audit of the current project, not a claim that every finding was introduced after staging. No application code, deployment settings, accounts, or business data were changed. Existing untracked QA outputs were preserved.

## Release context checked against GitHub

- [PR #93](https://github.com/MarcZxc1/Supply-Chain/pull/93) is open, points at the audited dev commit, and reports merge state `clean`.
- Current-head checks report success: Lint, Validate & Build; Playwright E2E Tests; Cloudflare Pages; GitGuardian Security Checks.
- [Release gate #162](https://github.com/MarcZxc1/Supply-Chain/issues/162) remains open, but its **2026-10-16 07:06:49 UTC owner clearance comment supersedes the earlier NO-GO notes**: the database is confirmed as staging/testing, the archived seed-data column drop is approved without a blocking manual backup, Driver linking is planned during post-deployment UAT, and the specific SSO problem and Monthly Driver Report decision are not staging blockers. Do not reopen these decisions based only on the older repository preflight report.
- No migration, seed, reset, merge, or deployment was performed during this audit. Effective cloud configuration was not independently re-inspected.

## Findings

### 1. High — linked collections bypass record visibility

**Locations:** `server/src/routes/records.ts:43` (`recordInclude`), `server/src/mappings.ts:96`, `server/src/services/recordAccess.ts:35`.

The parent DeliveryRecord is filtered by `recordScope`, but its `linkedCollection` relation is included without the same visibility constraints. `serializeRecord` checks only whether the linked record is a draft before returning its ID, reference, company name, status, and collection verification flag.

A Driver reading their own delivery can therefore receive details of a linked collection assigned to another Driver. Similarly, a user explicitly denied Accounting Collection can receive collection details through an otherwise readable delivery. The link-edit lookup also omits the target's record scope. This defeats the policy that category denials and Driver profile ownership apply to record reads.

**Evidence:** source tracing from scoped parent reads to the unconditional relation and serializer; a synthetic serializer probe confirmed that a parent owned by `own-profile` returns `OTHER-REF` from a linked collection owned by `other-profile`. This was not a live HTTP or cloud-data test.

**Required change:** apply the caller's scope to linked-record resolution and output, including list/detail and write responses. Decide explicitly whether even the linked ID may be returned when the target is unreadable. Add negative tests for different Driver ownership and explicit category denial.

### 2. High — concurrent stock adjustments lose inventory updates

**Location:** `server/src/routes/skus.ts:179`.

The transaction reads `onHandQty`, calculates a new balance, then writes that absolute value without locking the inventory row or using a conditional atomic update. A transaction alone does not serialize these read/compute/write steps at the default isolation level.

Two requests can both read stock 10 and each accept a sale of 7. Both write stock 3 and each inserts a transaction for -7. Actual stock and transaction history disagree; the insufficient-stock guard has allowed a combined oversell.

**Evidence:** a deterministic handler probe paused both mocked inventory reads before either update. Both requests returned 200; final quantity was 3 while the transaction deltas implied -4. This demonstrates the handler's interleaving; it is not a PostgreSQL load test.

**Required change:** lock and re-read the inventory row inside the transaction, or perform a conditional atomic decrement and reject when insufficient stock remains. Create ledger/audit rows using the committed balance. Verify simultaneous deductions against an isolated PostgreSQL database.

### 3. Medium — existing drafts submit without a required delivery date

**Locations:** `server/src/routes/records.ts:1039` (PUT draft transition), `server/src/routes/records.ts:1165` (PATCH status submission), `client/src/features/deliveries/DeliveryRecordWorkspace.tsx:300`.

Creation correctly permits an undated draft and requires a date for a newly submitted record. However, submitting an existing draft validates its reference without validating the resulting delivery date. The workspace Submit button sends only status and remarks, so this is reachable through the UI.

An undated delivery enters dispatch, while Driver actions subsequently reject its invalid date. It can also disappear from date-based views until staff correct it.

**Evidence:** invoked the real PATCH status handler with a synthetic draft containing a reference and empty `deliveryDate`. It returned 200 with `is_draft: No` and `delivery_date: ''`.

**Required change:** share submission validation across creation, PUT, and PATCH. Check the final merged fields while holding the record lock, and guide the user to complete the date before submitting.

### 4. Medium — automatic completion mail uses a placeholder recipient

**Location:** `server/src/services/notify.ts:24`.

The Delivered path invokes `notifyAccomplished`, which constructs the recipient from a display name plus `@microgenesis.example`. The Accounting Collection override does the same for Billing Department. It does not resolve the configured user's real email address.

Enabling SMTP or Graph therefore cannot make this automatic notification reach the intended Account Manager/Billing mailbox through this path. The optional output-action email endpoint has a separate recipient resolver and does not fix the automatic trigger. Mock transport can obscure this during local checks.

**Evidence:** direct call-path review of the Delivered handler, `notifyAccomplished`, and mailer. No external email was sent.

**Required change:** resolve an approved real recipient identity/address; report unresolved recipients clearly. Test with mocked mail transport and then verify delivery using the intended staging mail policy.

## Validation

| Check | Result |
| --- | --- |
| `npm run test:server` | PASS: 240 tests, zero failures/skips |
| `npm run test:client` | PASS: 29 reported test files, zero failures/skips |
| Client `tsc --noEmit` | PASS |
| Server `tsc --noEmit` | PASS |
| Prisma schema validation | PASS |
| Frontend staging build (`--mode staging`) | PASS; bundle-size warning |
| Canonical Worker vs Pages `_worker.js` | Byte-identical |
| Current-head GitHub CI and Playwright | PASS, read from GitHub |
| Focused synthetic probes | All three asserted defect scenarios reproduced |
| `git diff --check staging...dev` | FAIL: trailing whitespace in source, docs and QA files; low priority |

The initial sandboxed server suite stalled; an approved unrestricted rerun completed successfully. The synthetic probes use mocked database calls and no application listener; their script is `/tmp/sc-audit-probe.cjs`. Local client/server test output is in `/tmp/sc-audit-client.log` and `/tmp/sc-audit-server-unrestricted.log`; build output is in `/tmp/sc-audit-build.log`.

Not performed: new live browser UAT, cloud DB migration rehearsal, real storage upload/download, mail delivery, dependency advisory scan, or a PostgreSQL concurrency reproduction. Existing QA report `automated-RUN-20261020-05.md` records API/browser layers as BLOCKED and is not full UAT sign-off. Current GitHub Playwright success is separate evidence.

## Promotion path

Fix or explicitly accept findings 1–2 for this isolated staging environment; fix findings 3–4 before accepting the affected workflows. Run focused regression tests, retain the current release-owner clearance, and execute the agreed post-deployment Driver linking and SC → Logistics → Driver handoff UAT on the exact promoted build. Include private POD reload/download, denied-role reads, date completeness, stock integrity, and notification outcomes in acceptance evidence.

## Remediation follow-up — 2026-10-20

The staging audit fix branch addresses both high-priority findings. Record responses redact unreadable linked collections and IDs, and link edits enforce the caller's record scope. Audit-history and transaction-timeline responses also filter historical linked-record snapshots against current permissions and ownership, including legacy field names, missing/deleted targets and conflicting IDs. Stored audit evidence is preserved; target visibility is resolved in one batch per response.

Stock adjustments acquire PostgreSQL row locks on the product and inventory rows before reading the balance, with an additional per-product process mutex. Competing deductions therefore read the committed balance before stock validation and ledger creation. Regression coverage includes the two competing deductions of 7 from an opening quantity of 10: one succeeds and one is rejected.

Findings 3–4 remain outside this remediation. Mocked regression coverage does not replace post-deployment UAT or a multi-process PostgreSQL concurrency exercise. The original baseline validation above must not be interpreted as CI results for the fix branch.

Local remediation validation: 247 server tests and all 29 reported client test files passed with no failures or skips; client and server TypeScript checks passed. The two new history-route regression tests also passed when executed directly. Current-branch diff whitespace checks passed.
