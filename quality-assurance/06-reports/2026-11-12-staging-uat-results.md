# Staging UAT results — 2026-11-12

## Decision

**Requires fixes and additional verification before release sign-off.** The tested four-role Accounting Collection workflow passed end to end. One CSV data defect is confirmed. This is a finalized record of scoped execution, not a claim that every case in the baseline plan passed. No application fixes are included.

## Environment and evidence limits

- Website: https://supply-chain-88g.pages.dev
- Reference branch: staging; canonical plan: [UAT_PLAN.md](../../docs/UAT_PLAN.md).
- Execution date/time zone: November 12, 2026, Asia/Manila.
- Hosted build SHA was not established. A branch reference does not prove which commit was deployed. Local tests/source inspection were not treated as deployment evidence.
- Evidence consists of observed browser states, actual authenticated HTTP responses, and downloaded CSV contents during this session. Screenshots were displayed during execution but no durable screenshot bundle is attached.
- No password, cookie, CSRF token, environment secret, or connection string is included.
- No staging reset or seed was run. Only the explicitly authorized synthetic sample was created and advanced; unrelated records were left unchanged.
- No fresh automated suites, PostgreSQL concurrency/rollback checks, or exhaustive API matrix were run.

## Synthetic fixture and final state

| Field | Value |
| --- | --- |
| Reference | UAT-4ROLE-20261112-01 |
| Record ID | REC-d420eb76-f6b2-49f2-8019-cc5ca35bc733 |
| Module | Accounting Collection |
| Company | Bo's Coffee Club Inc. |
| Amount | PHP 1.00, synthetic; no actual payment or dispatch |
| Scheduled date | 2026-11-12 |
| Sales creator | Julius Caesar Mendoza |
| Logistics assigner | Roel Andre Magbitang |
| Linked Driver | Khalil Gatling Gun |
| Time In | 05:39 PM |
| Time Out | 05:48 PM |
| Receiver | UAT TEST RECEIVER — SYNTHETIC |
| Final operational status | Accomplished / Delivered (UI labels vary by view) |
| Verification | Marc Dagode, TASS, 05:49 PM |
| POD | UAT_SYNTHETIC_PROOF.png, valid synthetic 100 × 100 PNG, 286 bytes |

The fixture remains in staging as completed and verified for review. Its remarks explicitly identify synthetic testing. No real collection took place.

## Confirmed execution results

| Check | Result and observed evidence |
| --- | --- |
| Sales login/dashboard | Passed; role-specific menu and two pre-existing deliveries loaded. |
| Delivery search | Passed; unmatched query returned zero rows; clearing filters restored the list. |
| Empty delivery submission | Passed; company, reference and delivery date validation appeared. No record was saved by this check. |
| Sales workspace boundaries | Observed no dispatch tab on delivery workspace; audit history and customer/transaction lists loaded. This does not establish direct API write enforcement. |
| Accounting/Procurement empty states | Loaded correctly before fixture creation. |
| Sales creates submitted collection | Passed; sample persisted with amount PHP 1.00 and Scheduled status. |
| Sales → Logistics visibility | Passed; same ID/reference and amount visible to Logistics. |
| Logistics assignment | Passed through Drivers → Board → Reassign; sample moved to Khalil's group. |
| Logistics → Driver visibility | Passed; assigned sample appeared as one active run on Khalil's dashboard. |
| Required Time In remarks | Passed; confirmation disabled without remarks. |
| Driver Time In | Passed; status changed to In Transit, server timestamp shown. |
| Completion prerequisites | Passed in UI; missing receiver/photo or remarks prevented confirmation. |
| Invalid photo rejection | Passed; invalid/empty fixtures rejected, sample remained In Transit. |
| Valid POD and completion | Passed; valid PNG saved, completion succeeded and counters became 2 accomplished / 0 remaining (including an existing RMA). |
| Completed record evidence | Passed; details displayed Time In/Out, receiver, remarks, image preview and protected download link. |
| TASS visibility and queue | Passed; sample visible; pending sign-off count became 1 after accomplishment. |
| Premature TASS verification | Correctly unavailable while sample was In Transit. |
| Final TASS verification | Passed; saved proof visible, then “Collection Verified,” Marc Dagode and 05:49 PM displayed. |
| Cross-role audit | Passed for creation, assignment and Time In; three events identified Sales, Logistics and Driver with before/after values. Final completion/verification audit events were not separately inspected. |
| Admin navigation | Passed on retest; users, linked Driver profile, permission viewer and integrations loaded. |
| Admin aggregate refresh | Observed four records and three audit events after fixture creation/assignment/Time In. Final post-verification aggregate refresh not separately checked. |
| Logistics views | Dispatch controls, Driver Manager, calendar and Reports page loaded. Report generation/filter correctness not fully exercised. |

### Retest corrections

Earlier claims that the Driver completed queue/account menu and Admin navigation were broken are **not reproduced** and must not be carried forward as confirmed defects. Driver queue and account menu worked on retest; Admin Panel also opened. A narrow viewport requires opening the sidebar before selecting its entries.

Initial POD attempts used a path transferred incorrectly (0-byte staged file) and then an invalid PNG fixture. The corrected path and a generated valid PNG succeeded. These were test setup failures, not confirmed application upload defects.

The Sales RMA menu mismatch with the older plan is unresolved at the **active-policy** level: the inspected role viewer shows RMA Deny, but explicitly labels itself a read-only candidate V1 policy while LEGACY remains active. Candidate settings alone do not prove the active LEGACY configuration. Do not change permissions based solely on this observation.

## Direct deployed API negative tests

Authenticated requests used each account's own session and matching CSRF header where needed. No credentials are reproduced. These five tests passed; they are not exhaustive authorization coverage.

| Account role | Request | HTTP | Response |
| --- | --- | --- | --- |
| Driver | GET /api/v1/users | 403 | Module access denied |
| Driver | PATCH /api/v1/records/{sample-id}/verify-collection | 403 | Forbidden for this role |
| TASS | GET /api/v1/users | 403 | Module access denied |
| TASS | GET /api/v1/records/REC-771d09a4-0cc3-4d3e-8e1c-8392bcc0a894 | 403 | Record access denied |
| Sales Coordinator | PATCH /api/v1/records/{sample-id}/verify-collection | 403 | Forbidden for this role |

The denied verification requests did not change the already verified sample.

## Notifications and integrations

| Check | Outcome |
| --- | --- |
| TASS completion notification | Confirmed in TASS bell: “Collection ready for verification”; company/reference correct, message says accomplishment requires verification. |
| Sales assignment notification | Confirmed in Sales authenticated notification response: Khalil assigned, matching company/reference/record ID. |
| Sales verification notification | Confirmed in Sales response: collection verified by Marc Dagode, matching company/reference/record ID. |
| Real email delivery | Not available: Admin diagnostics reported method mock, emails logged to console only. No provider delivery claimed. |
| Microsoft SSO | Not configured according to Admin diagnostics; not tested. |
| Other recipients, denied notification reads, retries/duplicates | Not comprehensively tested. |

## Confirmed defect UAT-CSV-01

**Severity: Medium — collection amount missing from CSV.**

Reproduction:
1. As TASS, open the completed and verified sample.
2. Export → Export CSV → review preview → Download CSV.
3. Inspect the downloaded UTF-8 CSV.

Expected: Amount (PHP) contains 1.00 for the synthetic PHP 1.00 collection.

Actual: the header contains `Amount (₱)`, but that row's amount cell is empty. The record view displayed PHP 1.00. The CSV otherwise contained the correct ID, reference, Driver, Delivered status, Verified marker and verifier.

Downloaded filename: `ac-record-REC-d420eb76-f6b2-49f2-8019-cc5ca35bc733-2026-11-12.csv`.

Relevant row tail (Created By, Created At, Amount, Collection Verified, Verified By, Verified At):
```csv
"Julius Caesar Mendoza","Nov 12, 2026 5:34 PM","","Verified","Marc Dagode","Nov 12, 2026 5:49 PM"
```

Impact: exported collection reports omit monetary values. Remedy: trace the deployed export amount mapping and add an appropriate regression check; no source cause or fix is asserted here.

The first download wait timed out because Export CSV opened a preview, not a download. Clicking Download CSV successfully saved the file. That timeout is not an application defect.

## Outstanding acceptance checks

- Repair UAT-CSV-01; retest CSV with positive, zero and decimal amounts as allowed by the business rules.
- PDF, Excel and Word export generation, downloaded contents and layout remain untested.
- Final completion and verification audit entries, final cross-role aggregates, duplicate verification rejection and reload persistence of all final fields need explicit checks.
- Full role/category/action/ownership denial matrix, stale sessions, direct upload authorization, alternate write paths and concurrent requests remain outside this scoped run.
- Full notification recipient isolation, denial, duplicates/retries and external delivery remain unverified.
- Validate active LEGACY Sales RMA access against current intended scope; candidate V1 settings are insufficient evidence.
- SSO and real email require configured staging integrations before acceptance.
- Broader baseline cases (additional creates/edits, attachments/types/sizes, drafts, date filters, overdue/future runs, customer edits, all report filters) are not signed off by this report.

## Sign-off record

Technical execution record finalized; business/release approval remains pending. The four-role sample handoff is accepted only as an observed scoped test. Full release approval is withheld due to the confirmed CSV defect and the outstanding checks above.
