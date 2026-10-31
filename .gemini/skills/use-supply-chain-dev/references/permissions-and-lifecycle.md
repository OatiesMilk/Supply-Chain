# Permissions and lifecycle reference

Read this for access, identity, dispatch and status work. Application paths below are relative to the repository root. Source code is authoritative for the audited revision; verify current behavior before changing it.

## Follow the full authorization path

1. `server/src/middleware/auth.ts` verifies the cookie and reloads the current account. V1 uses `services/sessionPermissions.ts` to load a consistent account/policy snapshot; JWT role claims alone are not current authority.
2. `services/permissionManagement.ts` selects LEGACY or V1; the code defaults to LEGACY. V1 requires initialized policies and verified account conversion. State which mode was exercised; code presence is not proof of runtime activation.
3. `services/permissions.ts` supplies legacy screens/resources. V1 uses `permissionCatalog.ts` and `permissionEvaluator.ts` for action decisions, prerequisites and immutable role ceilings. Screen grants alone cannot expand those ceilings.
4. Follow route middleware and domain helpers together. `routes/records.ts` delegates endpoint/field action checks through `services/recordOperations.ts`; `services/recordAccess.ts` applies category and linked Driver scope. Do not allege missing authorization from an isolated callback.
5. On the client, inspect `utils/permissions.ts`, `hooks/usePermissions.ts`, `api/permissionRuntime.ts` and session/cache handling. UI controls improve behavior; direct API enforcement remains necessary.

Verify denied reads as well as denied writes across detail, lists, aggregate views, audit history, attachments, notifications and exports where relevant. Do not restore role-default access when a permission snapshot is missing. Account deactivation, role changes, denial and Driver reassignment must affect already-issued sessions and cached data through the existing mechanisms.

## Preserve ownership and separate responsibilities

| Workflow boundary | Relevant authority |
| --- | --- |
| New Delivery preparation | Sales Coordinator/Admin; Logistics manages saved dispatch |
| Driver/vehicle/assistant assignment | Logistics/Admin, with active directory/profile checks |
| Field execution | Driver's Admin-linked profile ID, non-draft assigned records and allowed lifecycle state |
| RMA assignment and transport | Bounded Logistics/Admin assignment and eligible assigned Driver transport; inspect `rmaDispatchPermissions.ts` for provisioned grants |
| RMA physical receipt and final completion | TASS; transport completion alone does not establish receipt or final completion |
| Collection verification | TASS after an accomplished, unverified Accounting Collection |

Consult `permissionCatalog.ts`, `recordAccess.ts`, `deliveryLifecycle.ts`, `driverDirectory.ts`, `rmaMovement.ts` and `routes/rmaDispatch.ts` for the exact category/action/field rules. The table is orientation, not an independent permission policy. Preserve explicit denials and role ceilings even for Admin or an account granted a module.

## Review lifecycle invariants

- Compare initial creation, PUT edits, draft submit/return and PATCH status paths. Validate the final merged record and required dates/references consistently.
- Time In is a dedicated action. Completion of non-RMA runs requires the existing timestamps, recipient, remarks and verified persisted photo rules. Supporting filenames or staged files do not establish proof.
- Separate RMA movement eligibility, transport status, physical receipt and final status. Preserve expected-version checks and recheck authority/state within its transaction.
- Test relevant midnight boundaries in Asia/Manila, unfinished overdue work, started future-dated work, rescheduling, reassignment and completed-record restrictions across every affected category.
- A transaction does not by itself prevent lost updates. Verify its read/write predicates or locking, stale-version behavior, duplicate requests and audit rollback. Do not manufacture clocks or infer ownership from display names.

If the user requests a new business rule, explain its effect on these boundaries and implement only the authorized change. Existing documents may describe older RMA/TASS behavior; confirm against source.
