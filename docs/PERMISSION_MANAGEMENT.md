# Administrative permission API (GH-245)

This step adds administrative persistence APIs on the V1 catalog/evaluator from
#243/#244. It does **not** activate action-aware business-route enforcement or
replace the existing frontend. Those integrations remain #247/#246/#248, and
the production rollout/rollback rehearsal remains #249.

## Activation and compatibility

`PERMISSION_MODE` is the single reserved coordinated rollout switch. Its default
is `LEGACY`; unknown values fail with 503. **Keep it unset or LEGACY for this
version.** Enabling `V1` before the action-aware business endpoints and matching
frontend are deployed would make saved policy diverge from business enforcement.
No deployment, environment change, or application database migration is part of
this change. No schema migration is needed beyond the foundation migration.

In LEGACY mode, existing session/editor fields and Boolean saves remain
compatible. V1 GETs expose candidate snapshots with `activeMode: LEGACY`, not a
claim that the candidate policy governs business routes. V1 saves/reset return
503 until coordinated activation. In V1 mode, Boolean saves return 400; lifecycle
mutations need a current V1 editor/preview token. Existing business auth/session
middleware remains legacy in this step; the switch must stay OFF until #247.

Before activation, quiesce legacy, role, identity and seed/converter writers;
verify every account checkpoint, quarantine and before/after effective operation
matrix using the foundation runbook. Editors return `conversionStatus` as
`CONVERTED` or `REQUIRED`. V1 mutations reject missing/unsupported actor or target
checkpoints, and role saves reject unconverted role members. A checkpoint alone
is not proof that the full rollout rehearsal passed. V1-created accounts receive
their empty-source checkpoint atomically and inherit their current role policy.

Compatibility writes serialize with conversion using the same advisory lock.
If a converted account is edited in LEGACY mode, its source hash and complete
derived override state must first match the retained checkpoint, and policies
must remain the frozen migration baseline with exclusively LEGACY_V1 overrides.
The writer atomically regenerates its derived overrides, updates the checkpoint,
retains quarantine evidence and records before/after authorization audit state.
Unexpected source/provenance drift or customized policies cause 409, not an
overwrite. Driver-directory identity edits outside this administrative API can
invalidate a source checkpoint; stop rollout and review/reconcile that evidence.
The converter's existing drift checks remain intact.

Do not revert to LEGACY or an old binary evaluator after action-specific edits.
An old Boolean Allow could restore prohibited writes. A rollback must preserve
action-aware server enforcement, or stop protected operations while an operator
restores a reviewed conservative policy snapshot. Do not delete conversion
checkpoints or manual overrides to force an old converter to accept new state.

## Requests and responses

All endpoints retain `requireAuth`, `requireRole('ADMIN')` and the existing admin
resource checks. V1 services also evaluate current administrative actions and
recheck current active ADMIN authority inside their transaction. Protected ADMIN
management stays enabled; this is not a universal ADMIN business bypass.

| Operation | Endpoint |
| --- | --- |
| Read role defaults/catalog | `GET /api/admin/roles/:role/permissions` |
| Save complete role defaults | `PUT /api/admin/roles/:role/permissions` |
| Read individual overrides and server snapshot | `GET /api/users/:id/permissions?contractVersion=1` |
| Preview role reassignment | `GET /api/users/:id/permissions?contractVersion=1&role=DRIVER` |
| Replace individual overrides | `PUT /api/users/:id/permissions` |
| Reset overrides to current role defaults | `POST /api/users/:id/permissions/reset` |

Role saves require the complete frozen catalog. Individual saves replace the
complete override list; absence means Inherit. Store explicit ALLOW/DENY even
when equal to a role default. Unknown fields, catalog keys, duplicates, effects,
versions and contradictory dependencies return 400. Read is required for Write;
specific operations require Write and any management-screen prerequisite. A
shared lookup Read never grants management Write. Immutable role/action ceilings
and protected ADMIN management are validated by the shared evaluator.

Save body:

```json
{
  "contractVersion": 1,
  "catalogVersion": 1,
  "expectedVersion": "v1:<64 hex characters from the editor>",
  "permissions": [
    { "permissionKey": "SCREEN:dashboard:READ", "effect": "DENY" }
  ]
}
```

Reset takes the same version fields and **no** permissions field. Reset deletes
individual exceptions; it does not restore frozen role defaults. A role-default
change that makes an existing exception violate Read/Write dependencies returns
409 with affected `userIds` so the Admin can resolve those exceptions first.
Nothing automatically grants Read to make an old Write valid.

Editor responses contain `contractVersion`, `catalogVersion`, `activeMode`,
`expectedVersion`, decimal-string revisions, catalog and policy/override rows.
User responses include the complete server-computed `snapshot` with decisions,
capabilities and provenance. No password, JWT, Microsoft object ID or raw BigInt
is serialized. Keep V1 fields separate from legacy screen-level fields in new
frontend code; do not recompute authorization on the client.

Reassignment uses the existing `PATCH /api/users/:id` with `role`,
`contractVersion: 1`, and the **role preview's** `expectedVersion`. The preview
includes the destination role revision, retained overrides, removed overrides,
candidate snapshot and validation error. DENY exceptions remain explicit,
including harmless denies above the destination ceiling. ALLOW exceptions above
its ceiling and incompatible protected-management denials must be removed.
Send `removedOverrideKeys` acknowledging exactly those preview removals; otherwise
400. Dependency conflicts reject rather than silently expanding access. Leaving
DRIVER unlinks the profile in the same transaction. Role changes preserve valid
exceptions rather than resetting all users to their new defaults.

Activation/deactivation, deletion, profile linking and Microsoft identity updates
use the same V1 editor version fields. Existing LEGACY callers may omit them.
Present but unsupported contract versions/malformed tokens return 400; missing
or stale V1 lifecycle editors return 409. Name/email-only changes remain under
the same administrative transaction. Microsoft identity changes explicitly bump
the account authorization revision; role/active/Driver changes use foundation
triggers. Identity linking never implicitly activates an inactive account.

## Transactions, conflicts and audit

Administrative writers lock in this order: permission advisory lock `(243,1)`,
Driver-directory advisory lock `84750`, ordered role-policy rows, ordered
actor/target User rows. The directory lock must precede User locks because
Driver identity triggers also update User revisions. The shared advisory lock
coordinates these writers with the converter/initializer. Short administrative
reads use the same ordering for coherent editor responses.

Policy and account revisions come from foundation BIGINT triggers. They are
monotonic, may advance by more than one, and are serialized as strings. User
tokens incorporate account role/revision and role-policy revision; role-change
tokens additionally incorporate destination policy revision. Changes followed
by change-back still conflict. Old versions return 409 without lost updates.
Role and user policy no-ops preserve revisions. Successful saves return final
post-sync versions, including consecutive legacy saves on converted accounts.

Self-demotion, self-deactivation and self-deletion remain forbidden. Active-admin
removal rechecks the last-active-admin count under the administrative lock; a
competing administrator that has been demoted/deactivated cannot continue its
queued write using the authority from an earlier HTTP check.

Rows, account changes, revisions and before/after audits commit atomically;
audit failure rolls back the mutation. `/api/admin/audit-log` now projects safe
`previous`/`next` authorization state for RolePolicy, UserPermissionOverride and
UserAuthorization entries. The projection allowlists fields and permission keys;
it does not expose arbitrary stored JSON. Existing actor, target, action and
timestamp fields remain. Revisions are captured with policy changes and V1
account mutations. Legacy business/personnel audit formats remain unchanged.

Revocation is effective for subsequent authorization loads after commit. This
step does not claim cancellation of in-flight requests that already passed their
authorization checks, nor does it implement automatic frontend cache refresh.

## Verification

```bash
node --import tsx --test server/tests/permissionManagement.test.ts
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p client/tsconfig.json
npm run test:server
npm run test:client
```

The optional `server/tests/permissionManagement.postgres.test.ts` suite requires
an explicit `PERMISSION_TEST_DATABASE_URL` pointing at a local disposable
`*_test`/`*_sandbox` target, with existing foundation migrations applied. It never
uses the application's DATABASE_URL fallback. It uses UUID-owned fixtures and
restores the Sales role defaults it changes. Run it serially, separate from the
foundation database suite, because both edit shared role-policy rows. Without
the explicit target it skips. Mocked route tests and this real database suite
are distinct; only the latter proves PostgreSQL transaction/race behavior.
