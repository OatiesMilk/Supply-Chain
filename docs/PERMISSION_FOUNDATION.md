# Permission data foundation (GH-243)

This is Step 01 of tracker #241, under the approved contract in #242. The
additive migration retains `UserPermission`, users and existing audits. Existing
session payloads, middleware and routes continue to use legacy permissions.
This change does **not** activate the new evaluator, new admin APIs or UI.

## Data contract for subsequent steps

- `PermissionDefinition.key` is `SCOPE:module:ACTION`, with separate SCREEN,
  RESOURCE and CATEGORY entries. Navigation READ never comes from category READ.
  Shared-resource READ never implies management WRITE. Enums, unique keys,
  foreign keys and SQL checks reject unknown catalog keys/effects.
- `RolePolicy` has one header per built-in role, a catalog version, and a complete
  `RolePermission` matrix. Missing entries must fail closed in Step 02.
- `UserPermissionOverride` stores ALLOW/DENY per catalog key. No row means Inherit.
  Explicit exceptions remain stored even when equal to a default. WRITE requires
  READ; operation-specific keys also require module WRITE plus their immutable
  role/action ceilings and the existing business guards.
- `RolePolicy.revision` and `User.authorizationRevision` are positive PostgreSQL
  BIGINT values. Serialize them as decimal **strings** in future API payloads
  (raw JavaScript BigInt cannot be JSON serialized). Database triggers reject
  revision decreases and increment revisions on actual permission mutations.
  Account role/active-state and linked Driver identity changes also increment
  account revisions. Revisions may advance by more than one during bulk saves.
- `PermissionConversion` records an atomic per-user source hash/checkpoint.
  `PermissionQuarantine` retains unknown/protected source evidence independently
  of later legacy-row edits. A changed source after conversion stops a rerun;
  it is not silently overwritten. Existing new-policy overrides without a
  checkpoint and non-baseline/incomplete role policies also stop conversion.
- New user/demo seeds initialize complete role policies through the seeded active
  Admin. They do not replace existing customized policies. The standalone
  converter requires the operator's explicit active Admin account and records
  that actor in transactional audits; it does not impersonate converted users.

The V1 catalog and conversion rules are frozen in
`server/src/services/permissionCatalog.ts`. Updating this catalog requires a new
reviewed migration/version, not editing V1 conversion semantics during rollout.

## Preserved boundaries

The conversion derives effective category and resource capabilities from actual
legacy screens and explicit exceptions, without synthesizing category screen
grants from dashboard/calendar/aggregate access. Explicit category false applies
across aggregate entry points, including protected Driver category denials.
Protected navigation entries are quarantined; their historical category denial
is preserved where the old record scope applied it. Unknown entries quarantine
without granting access. No legacy rows or audit records are deleted.

Logistics cannot create Delivery or generally edit/complete RMA. Its approved
future RMA assignment ceiling is represented separately from default grants:
the migration leaves that new operation denied. Driver RMA transport ceilings
likewise remain denied in the legacy baseline until downstream implementation.
Driver grants always require the linked profile, matching assignment, non-draft,
eligible movement/date/state; an unlinked login owns nothing. No profile,
assignment or timestamps are fabricated by this migration.

Step 00 reserves physical RMA receiving and final completion for TASS, including
for Admin. Existing Admin RMA assignment is retained. Only TASS may verify
Accounting Collection, and only with category edit access and the existing
accomplished/unverified checks. Existing TASS Accounting Collection creation and
comments remain permitted by their current routes, while general PUT/status/POD
updates outside RMA remain denied. TASS's Procurement screen still supplies a
supplier lookup without Procurement record data or supplier writes. SKU lookup
never grants SKU adjustment; Logistics needs the explicit SKU Master screen.
Record deletion remains denied for every role.

This matrix does not replace per-field restrictions (for example Logistics
cannot create/rename Driver identities), transaction-category limits, inventory
transaction role limits, record ownership, current-state restrictions or any
existing route guards. Step 02 must continue intersecting these restrictions;
Admin is not a universal business-operation bypass. Steps 02/03 define snapshot
computation and audited policy writes; Step 07 owns rollout/rollback rehearsal.

## Local development/test conversion

Identify a dedicated disposable PostgreSQL database first. Do not use a fallback
connection, an unidentified environment file, or a production/staging database.
The CLI accepts only an explicit local `*_test`/`*_sandbox` database, matching
confirmation, development/test environment and an active Admin operator. It
rejects deployed environment markers and query parameters that can override the
connection target. `schema=public` is the only allowed URL query parameter.

Quiesce legacy permission, account-role and Driver-link writers before the
conversion and keep them quiesced through verification. Each account commits
atomically, so interruption can be resumed with the same command. A checkpoint
source mismatch requires review; do not delete checkpoints/overrides or rerun a
destructive reset to bypass it. Verify all users have checkpoints and investigate
quarantine before any activation. This foundation does not authorize deployment
or migration on other environments.

Historical example on the explicitly designated local test instance used for
this change (requires the disposable instance to be running). The instance is
stopped after validation; its data directory is retained at
`/tmp/supply-chain-243-pg`. To repeat locally, start that explicitly identified
instance with `pg_ctl -D /tmp/supply-chain-243-pg start` using the installed
PostgreSQL toolchain, or provision another disposable test target and update
all confirmations accordingly:

```bash
cd server
export DATABASE_URL=postgresql://issue243@127.0.0.1:55443/supply_chain_243_upgrade_test
export NODE_ENV=test
export PERMISSION_BACKFILL_DATABASE=supply_chain_243_upgrade_test
export PERMISSION_BACKFILL_ACTOR_ID=upgrade-ADMIN
npx prisma migrate dev
npx prisma generate
npm run permissions:backfill
npm run permissions:backfill
```

The actor must already exist and be an active Admin. For an empty local demo
sandbox, existing approved seed commands provision it and initialize role
policies. Do not run the example against an application's normal database.

## Validation

```bash
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p client/tsconfig.json
npm run test:server
PERMISSION_TEST_DATABASE_URL=postgresql://issue243@127.0.0.1:55443/supply_chain_243_fixture_test \
  node --import tsx --test server/tests/permissionFoundation.test.ts
```

Foundation tests compare 4,005 no/single/pair-override cases across all five roles
with independent legacy navigation/category helpers. Fixtures cover true, false,
absent, equal-to-default, unknown/protected, aggregate and linked/unlinked Driver
cases. Database tests cover byte-identical policy/revision/audit/checkpoint state
on rerun, unchanged legacy rows/audits, key/effect/uniqueness constraints, failed
transaction rollback and retry, and monotonic revisions. The database test is
skipped unless its dedicated target is explicitly supplied.

The Prisma migration was generated with `migrate dev --create-only` and exercised
with `migrate dev` on a newly initialized local PostgreSQL instance bound to
127.0.0.1:55443. A separate upgrade database starts from the previous 11 migrations
and has users, legacy permissions and an audit sentinel inserted **before** the
new migration, allowing retention to be checked across actual DDL application.
No existing application database, repository environment file or server process
is used for migration testing.

Verified 2026-10-27:

- Client and server `tsc --noEmit`: passed.
- Full client suite: 189 passed, 0 failed.
- Full server suite: 293 passed, 0 failed, 1 database test skipped without an
  explicit database URL. Final focused foundation run: all 7 passed, including
  the database test and 4,005 independent-oracle fixtures.
- Populated upgrade retained all pre-existing user columns, 15 legacy permission
  rows and the prior audit sentinel after applying the new migration.
- Upgrade CLI first run: `converted=5, unchanged=0, quarantined=7`; second run:
  `converted=0, unchanged=5, quarantined=7`. Complete policy/user/legacy/audit/
  revision/quarantine/checkpoint JSON snapshots were byte-identical on rerun.

The installed Prisma PostgreSQL adapter emits a pg concurrent-query deprecation
warning during nested writes; all database assertions pass. This change does
not change the dependency versions.
