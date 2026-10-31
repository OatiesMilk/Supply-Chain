# Role workflow follow-up fixes — 2026-10-31

This follow-up starts at `82974de6f1db9d654241504eb4e560598dfeb5ad`
(PR [#269](https://github.com/OatiesMilk/Supply-Chain/pull/269)). It addresses
WF-01 through WF-07 from the workflow audit of that revision. No database storage
migration or permission-mode activation is required. Operational stock movement
remains manual.

| Finding | Result | Principal implementation and regression evidence |
| --- | --- | --- |
| WF-01 | Central Admin audit shows allowlisted business before/after changes, subject to current resource/category/record access. Arbitrary stored JSON is not returned. | `server/src/services/businessAudit.ts`, `BusinessAuditDiff.tsx`; `adminBusinessAudit.test.ts`, `adminAuditFollowups.test.ts` |
| WF-02 | Account name/email are included in safe authorization audit state. Account edits retain a metadata precondition separately from policy review tokens. | `permissionManagement.ts`, `routes/users.ts`, `AdminPanel.tsx`; `adminBusinessAudit.test.ts`, `adminAuditFollowups.test.ts` |
| WF-03 | Mounted operational pages use scoped pagination and aggregates. The shared app no longer polls all record history. Legacy unpaged reads are bounded to 100 records. Explicit exports traverse pages. | `useAppData.ts`, `useOperationalViews.ts`, `dashboardOverview.ts`, `recordViewFilters.ts`; `recordViews.test.ts`, `dashboardOverview.test.ts`, `mainViewPaging.test.ts`, `operationalRecordPaging.test.ts` |
| WF-04 | Ordinary metadata edits compare a content token under the record lock. Stale account and record editors retain the user's draft and require review before retry. Existing RMA versions remain in use. | `recordEditVersion.ts`, `routes/records.ts`, `permissionManagement.ts`, record/account editors; `recordIntegrity.test.ts`, `recordEditConflict.test.ts`, `recordLifecycleMutations.test.ts` |
| WF-05 | Sales metadata writes enforce the existing Draft/Scheduled lifecycle restriction on the server inside the transaction. Existing Admin/domain authority remains in effect. | `routes/records.ts`; `recordIntegrity.test.ts` |
| WF-06 | Ordinary create and both supported draft-submission paths emit the same transactional Logistics handoff notification across all four ordinary categories. | `notifyOrdinarySubmission` in `routes/records.ts`, `inAppNotify.ts`; `recordIntegrity.test.ts` |
| WF-07 | Driver accomplishment details use actual Time Out in Asia/Manila; missing/invalid timestamps show that completion date is unavailable. | `DoneRecordModal.tsx`; `doneRecordModal.test.ts` |

## Pagination follow-through

Delivery and collection record links fetch their own selected detail, independently
of the current page. Loading, failed reads, retry, return and category mismatches
have explicit states; a failed detail refresh hides stale cached details. The
selected record remains part of workspace navigation even when off-page.

Bulk actions select only the displayed page and retain each selected metadata
version across background refreshes. Page/filter changes clear the selection.
Category-wide filter metadata comes from grouped queries rather than the current
page. Same-day Driver hints explicitly describe the current page. AM Scheduled
counts exclude ordinary runs already in transit, while preserving canonical RMA
status semantics. Monthly Driver reports query the chosen month's total and fetch
all its pages only when generating the export. A failed audit read cannot produce
a report labeled as a complete status trail.

Regression evidence: `deliveryPagingActions.test.ts`,
`selectedCollectionRecord.test.ts`, `monthlyDriverPaging.test.ts` and
`recordViews.test.ts`. The first three render actual components in JSDOM;
the last exercises isolated HTTP routes with Prisma doubles.

## API compatibility and caller obligations

Authentication continues to use the existing session cookie, CSRF protection,
current account permissions and domain rules. These contracts do not grant any
new role authority.

- `GET /api/records` without pagination still returns an array, now at most 100
  records. Callers needing a complete export must explicitly traverse
  `GET /api/records?paged=true&limit=100` using `hasMore`/`nextCursor`. Page-based
  browsing uses `page` and receives `rows`, `total`, `page`, `limit`, `hasMore`
  and `nextCursor`. Never treat one bounded response as complete history.
- List filters now support the purpose-specific `view` and `queue` predicates,
  `driver_exact`, `account_manager_exact` and `supplier_name`. These are combined
  with existing category, date, search and current-user scope. Unsupported views,
  invalid queues and invalid exact-filter values return 400.
- `GET /api/records/filter-options?category=Deliveries` requires a concrete valid
  category and record READ access. It returns sorted distinct nonblank
  `{ accountManagers: string[], drivers: string[], areas: string[] }` over the
  complete authorized, undeleted category. It is independent of active list
  filters and page; it uses grouped database queries and returns `no-store`.
  Invalid/missing categories return 400; authenticated scope restrictions also
  apply to these values.
- Operational aggregates include `/api/records/driver-overview`,
  `/api/records/calendar-counts?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`,
  `/api/records/supplier-pickup-counts?ids=...`, `/api/records/am-summary`, and
  `/api/dashboard/overview`. Calendar ranges accept at most 63 inclusive days;
  supplier batches accept 1–100 unique IDs and require supplier access too.
  These queries preserve current record scope and exclude deleted rows.
- Ordinary record responses include `edit_version`. Metadata `PUT /api/records/:id`
  must send that editor's original `expected_edit_version`. PATCH status requests
  that also change priority or reschedule date carry the same precondition.
  Missing/malformed preconditions return 428; stale state returns 409 with no
  metadata/audit write. Status-only operations retain their existing domain rules.
  Related attachment uploads do not themselves invalidate metadata editors.
- Account list/create/update responses include `metadata_version`.
  `PATCH /api/users/:id` callers must send `expectedMetadataVersion` from the
  account state they edited, in LEGACY and V1. Missing/stale values return 409.
  V1 callers must also preserve the existing permission editor/role-preview
  preconditions. Reloading a policy preview does not bless stale name/email data.
- RMA continues to use `expected_version`; its dispatch, receipt and completion
  boundaries remain separate.

Deploy the matching frontend/backend together. External API clients that edit
ordinary records or accounts must adopt these preconditions. Existing audit rows
that never stored name/email cannot reconstruct those historical values.

## Validation and limits

Final checks on the completed follow-up:

- `npm run lint --workspace=client` and `npm run lint --workspace=server`: passed
  (strict `tsc --noEmit`).
- `npm run test:client`: 276 passed, zero failed or skipped.
- `npm run test:server`: 437 passed, zero failed, three designated PostgreSQL
  tests skipped (440 total).
- `npm run build --workspace=client` and `npm run build --workspace=server`:
  passed. Vite retains its existing large-chunk warning.
- `git diff --check`, staged-path checks and local documentation links: passed.

The initial sandboxed suite attempt was not usable validation; isolated HTTP
listeners and Node/tsx workers were rerun outside that restriction. An export test
fixture initially omitted the new filter-options query; the fixture was corrected
and the complete client suite then passed. The final server rerun includes the
account-token regression after legacy permission conversion.
No business database, real email delivery, deployment or permission conversion is
part of this change. Prisma doubles establish route/service behavior, not live
PostgreSQL locking, rollback or performance under concurrent load. JSDOM checks do
not establish real browser/device behavior or downloaded file fidelity. Complete
role workflow UAT, representative-volume load checks and real PostgreSQL race tests
remain necessary for those claims.

See [the merge workflow](PR_MERGE_WORKFLOW_2026-10-31.md) for dependency order and
post-squash rebasing.
