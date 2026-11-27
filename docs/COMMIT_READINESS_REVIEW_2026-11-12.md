# Branch readiness review — 2026-11-12

**Branch:** `fix/fullstack-role-review-remediations`
**Original review target:** `1218fcd`
**Documentation/source follow-up:** `81214c5`, merged with `origin/dev` (`40c14af`), plus the P2 remediations, `AccessRequestModal` clipboard test/helper, and updated manual/export artifacts.
**Decision:** All four P2 defects identified in the initial readiness review have been resolved in the working tree, `origin/dev` (`40c14af`) has been merged cleanly, and TypeScript + unit/route suites pass (excluding 1 client and 12 server PostgreSQL-only checks). Ready for commit review and PR once intended files are staged (excluding untracked local skill directories) and any required live-PostgreSQL / browser UAT checks are completed.

## Recorded validation and its limits

The initial local server attempts inherited permission configuration incompatible
with LEGACY-shaped fixtures; a sandboxed attempt also failed to bind isolated
localhost listeners with `EPERM`. Neither attempt established a branch defect.
After allowing those listeners and selecting an explicit LEGACY default, the
focused directory/attachment-preview checks and full server suite passed.
Individual tests also select V1 explicitly; this is not deployed V1 activation.

| Check | Recorded result | Revision and limits |
| --- | --- | --- |
| `npm run lint --workspace=client` | Passed | `1218fcd` working tree; TypeScript only |
| `npm run lint --workspace=server` | Passed | Same tested working tree; TypeScript only |
| `npm run test:client` | 79 test files passed, 0 failed/skipped | Captured runner reports file-level results; do not equate this count with individual assertions |
| `PERMISSION_MODE=LEGACY node --import tsx --test --test-reporter=spec tests/accountDirectory.test.ts tests/attachmentPreview.test.ts` from `server/` | 27 passed, 0 failed/skipped | Isolated HTTP listeners/database and storage doubles; localhost binding allowed |
| `PERMISSION_MODE=LEGACY npm run test:server` | 536 total: 528 passed, 0 failed, 8 skipped | Recorded at `1218fcd`; doubles/router tests, not real PostgreSQL or provider delivery |
| `git diff --check dev` during the original follow-up | Passed | Local whitespace cleanup was present |
| Source recheck of the four defects below | Still present at `81214c5` | Documentation follow-up; application suites were not rerun on this newer revision |
| Post-merge (`40c14af`) + P2 fixes `npm run lint --workspace=client` & `server` | Passed | Current working tree; TypeScript only |
| Post-merge (`40c14af`) + P2 fixes `npm run test:client` | 442 total: 441 passed, 0 failed, 1 skipped | Current working tree; 1 skipped test requires isolated PostgreSQL |
| Post-merge (`40c14af`) + P2 fixes `PERMISSION_MODE=LEGACY npm run test:server` | 587 total: 575 passed, 0 failed, 12 skipped | Current working tree; doubles/router tests, 12 skipped checks require designated PostgreSQL |
| Post-review LEGACY permission fixes (`lint`, `test:client`, `PERMISSION_MODE=LEGACY npm run test:server`, V1 notification checks, `build`) | Client 442 total (441 passed, 0 failed, 1 skipped); Server LEGACY 590 total (578 passed, 0 failed, 12 skipped); Server V1 targeted 24/24 passed; lint & build passed | Working tree after `loadLegacySession` + `scopedSummaryVersion` (`rolePolicyRevision`) fix; doubles/router tests, PostgreSQL/E2E/provider delivery unchanged |

The eight skipped checks require designated PostgreSQL targets: permission
conversion, permission management, attachment deletion, RMA activation, seeded
API/session reads, submitted-at backfill, supplier migration and supplier
write rollback/concurrency. No browser UAT, live PostgreSQL or real email/storage
provider validation was performed in this review. The earlier local report's
`421/421` client result belongs to its initial evidence; the captured follow-up
runner reports 79 test files and uses a different counting unit.

## Resolved P2 defects (fixed in working tree post-merge)

### P2 — Drivers View rescheduling rejects non-Delivery categories (Resolved)

Aligned [DriverView](../client/src/features/drivers/DriverView.tsx) and [driverStatusRules](../client/src/features/drivers/driverStatusRules.ts) with the shared `rescheduleNeedsNewDate` rule in [recordLifecycle](../client/src/utils/recordLifecycle.ts) (matching [DeliveryRecordWorkspace](../client/src/features/deliveries/DeliveryRecordWorkspace.tsx) and [records.ts](../server/src/routes/records.ts)): `New Delivery Date *` and `delivery_date` are required and sent only when Logistics/Admin reschedules a `Deliveries` record. Verified by [driverStatusRules.test.ts](../client/tests/driverStatusRules.test.ts) and [rescheduleStatus.test.ts](../server/tests/rescheduleStatus.test.ts).

### P2 — 4 PM in-app summaries use a user ID as a DeliveryRecord ID (Resolved)

Extracted scheduled notification jobs into [scheduledNotifications.ts](../server/src/services/scheduledNotifications.ts) and updated `notify4PM` to store `recordType: 'ScopedSummary'` and `recordId: scopedSummaryVersion(session)` (matching [scopedSummaries.ts](../server/src/services/scopedSummaries.ts) in V1 while incorporating `rolePolicyRevision` alongside `permissionVersion` in LEGACY mode via [scopedSummaryVersion](../server/src/services/notificationVisibility.ts)). [notificationVisibility.ts](../server/src/services/notificationVisibility.ts) now checks `ScopedSummary` against `scopedSummaryVersion(user)` in both `V1` and `LEGACY` modes while preserving generic non-summary alerts in `LEGACY`. Verified by [scheduledNotifications.test.ts](../server/tests/scheduledNotifications.test.ts) and [permissionVisibility.test.ts](../server/tests/permissionVisibility.test.ts).

### P2 — 4 PM AM resolution bypasses directory identity rules (Resolved)

Updated `notify4PM` in [scheduledNotifications.ts](../server/src/services/scheduledNotifications.ts) to resolve AM accounts exclusively via [accountManagerMailUsers](../server/src/services/accountDirectory.ts#L149), load the full `LEGACY` session context via [loadLegacySession](../server/src/services/sessionPermissions.ts) (matching [auth.ts](../server/src/middleware/auth.ts) and [mailPermissions.ts](../server/src/services/mailPermissions.ts) so RMA `RolePolicy` and `UserPermissionOverride` denials apply), and filter records with [canReadRecord](../server/src/services/recordAccess.ts#L54). Deactivated AMs, inactive linked logins, and ambiguous duplicate names no longer receive alerts. Verified by [scheduledNotifications.test.ts](../server/tests/scheduledNotifications.test.ts).

### P2 — Mixed weekly email outcomes are collapsed into SENT (Resolved)

Updated `notifyWeeklyReport` in [scheduledNotifications.ts](../server/src/services/scheduledNotifications.ts) to persist one `NotificationLog` entry per recipient (`SENT`, `MOCKED`, or `FAILED`, and `SKIPPED` when no active recipients exist), matching [notify.ts](../server/src/services/notify.ts). Verified by [scheduledNotifications.test.ts](../server/tests/scheduledNotifications.test.ts).

## Corrections already present locally

- [AccessRequestModal](../client/src/components/AccessRequestModal.tsx) now reports unavailable/rejected clipboard operations as errors and sets copied success only after resolution via `copyAccessRequestText`, covered in [accessRequestModal.test.ts](../client/tests/accessRequestModal.test.ts).
- Trailing whitespace in the affected manuals/audits has been removed.
- The user manual now explains required Driver remarks, actual receipt/audit controls, supporting documents versus required photo proof, and separate RMA transport/receipt/final completion.
- The component report now separates historical heuristic counts from current AST inventory and withdraws unsupported functional-health claims. The feature inventory corrects the DriverDashboard link and related role/endpoint descriptions.

The R1–R6 commit contains useful error-wrapper, notification-response and UI
changes, but it did not add durable scheduler claims/catch-up or a retryable
notification handoff. Global Search entity selection and Transaction Center
scaling remain separate findings in the historical role review. This document
is not a new exhaustive audit of every module.

## Historical baselines

The original feature/performance/role reports describe `1e2b900`; the original
manual describes `d2cb412`; the staging report describes
`c1efd101eb801d48f6dd1671918737e338373d7a`. Targeted corrections are dated and
identify `81214c5`; they do not replace those reports' original verification
with a claim of fresh full-document, browser or deployment validation.
