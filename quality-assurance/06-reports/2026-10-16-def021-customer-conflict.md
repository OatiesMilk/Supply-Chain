# DEF-021 / #183: customer stale-edit verification

Run date: 2026-10-16 (Asia/Manila). Issue: [#183](https://github.com/MarcZxc1/Supply-Chain/issues/183).

## Tested environment

- Baseline: merged `dev` commit `5609b741cc9f6f8012ef77d097f42ffc6889fd40` (PR #184).
- Tested fix: working tree changes to `CustomerEditForm.tsx` and `CustomerWorkspace.tsx` on `fix/client-qa183-stale-edit-recovery`, relative to the baseline above.
- Windows, Chromium `153.0.8010.12`, existing frontend on localhost:3000 and API on localhost:4000.
- Separate Playwright browser contexts: seeded Sales Coordinator **Maria Reyes** and Logistics **Juan Santos**. These are local synthetic test identities.
- Disposable customer `QA183 stale edit mvamo0zo`, ID `cmvamo12600080olp03iqhlhw`, in a dedicated Docker PostgreSQL database `mg_portal_qa183_sandbox`.
- No staging or shared database writes. The API configuration and saved browser sessions were restored after the run; the isolated QA database is retained locally.

## Reproduction and results

Both sessions opened the same customer's edit form before either saved. Sales changed the phone with a reason; Logistics then changed the city with a reason in its original form. Network responses and persisted customer data were checked independently of the form display.

| Check | Merged baseline | Local fix |
| --- | --- | --- |
| Session A saves a changed phone with a reason | HTTP 200 | HTTP 200 |
| Session B saves its original stale version | HTTP 409 | HTTP 409 |
| Rejected B save leaves A's persisted phone and the prior city intact | Pass | Pass |
| B's city draft and reason remain after 409; save pending ends | Pass | Pass |
| Fail the customer-list GET during “Discard my edits and load the latest values” | Two failed requests, including the configured retry | Two failed requests, including the configured retry |
| State after failed reload | **Fail: form remount clears the draft, reason and conflict banner** | **Pass: draft and reason remain, an explanatory error appears, and retry is enabled** |
| Restore network and retry load latest | Not part of the failing baseline run | Pass: displays A's saved phone, clears discarded edits/reason and warning |
| Fresh B edit after successful reload | Not part of the failing baseline run | HTTP 200; PUT carries A's latest `expected_modified_at` |
| Fresh saved value, audit actors and reasons | Not part of the failing baseline run | Pass through API and visible Audit Trail |

The historical missing stale-edit protection is **not currently reproducible**: both versions returned 409 and protected the committed record. The confirmed UI defect is the failed reload recovery path. The failure was triggered by aborting only the Logistics context's GET `/api/customers`; writes continued to use the real local API.

The final successful run recorded these customer versions:

- Before A's save: `2026-10-16T07:14:27.130Z`.
- After A's save: `2026-10-16T07:15:41.209Z`.
- After B reloaded and saved a fresh edit: `2026-10-16T07:15:44.683Z`.

The fresh PUT's `expected_modified_at` exactly matched A's saved timestamp. Audit entries attributed the phone change to Maria Reyes and the fresh city change to Juan Santos, with their submitted reasons and field differences.

## Localized fix

The workspace now propagates a failed customer-list refresh and returns the refreshed customer only when present. The form replaces its draft and captured version only after a successful refresh. A failed refresh preserves the draft and reason, shows a retry message and ends the loading state. The form is no longer remounted to discard edits.

## Evidence and validation

- [Sanitized browser assertions and network statuses](../artifacts/RUN-20261016-DEF021/customer-conflict-results.json).
- [Draft and reason retained after failed reload](../artifacts/RUN-20261016-DEF021/failed-reload-draft-preserved.png).
- [Fresh save displayed in the Audit Trail](../artifacts/RUN-20261016-DEF021/fresh-save-audit.png).
- Two real browser contexts against the merged baseline: confirmed the failed reload defect.
- Two real browser contexts with the local fix: all stale-save, failed-refresh, retry, fresh-save, version and audit assertions passed.
- Node tests: **5/5 passed** using `node --import tsx --test tests/customerEditConflict.test.ts src/utils/__tests__/customerValidation.test.ts` from `client`.
- Client TypeScript: **passed** using `npm run lint` from `client` (`tsc --noEmit`).
- The dedicated [workspace regression](../../client/tests/customerEditConflict.test.ts) uses the real customer workspace and active query observer. It verifies a pending refresh, rejection without remount/draft loss, retry, refreshed values and the fresh save's version token.

Owner review/acceptance remains required before closing DEF-021. After publication/review, link this evidence from #165 for the consolidated UAT handoff. Full staging UAT and the #162 release gate remain separate acceptance steps.
