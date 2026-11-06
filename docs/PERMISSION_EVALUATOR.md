# Read and Write permission evaluator (GH-244)

Step 02 implements the shared evaluator for #241 under the approved #242
contract and the frozen V1 catalog delivered by #243. It leaves the existing
session/editor payloads, auth middleware and routes on legacy evaluation.
Steps #245–#248 own API/UI integration and coordinated enforcement activation;
this change does not activate new RMA transport permissions or deploy policy.

## Server and client handoff

`server/src/services/permissions.ts` re-exports the V1 API:

- `loadEffectivePermissions(db, userId)` reads the active state, role,
  authorization revision, overrides, active Driver identity and complete role
  policy in one PostgreSQL Repeatable Read transaction. It returns `null` for a
  missing user and a denied snapshot for invalid/inactive context. It selects no
  password or JWT. Use a fresh load on subsequent requests; do not put a snapshot
  in a JWT or cache it across policy changes. Administrative mutations must
  additionally recheck the actor's authority in their write transaction.
- `evaluatePermissions(input)` is the pure evaluator for already coherently
  loaded data. `PermissionEvaluationInput` matches the foundation's policy and
  override rows. Role/account revisions accept positive PostgreSQL BIGINT values
  as `bigint` or canonical decimal strings; all output revisions are strings.
- `actionPermissionInputError(input)` validates the **complete proposed state**
  after merging role-policy or user edits. Absence of an override means Inherit;
  store only ALLOW/DENY rows and preserve explicit Allow equal to its default.
  Reset removes overrides. This validator does not perform persistence, audit,
  authority/version checking or resolve save conflicts; #245 owns those writes.
- `hasActionPermission(snapshot, scope, module, action)` checks a catalog key.
  Unknown keys/actions deny. Generic `RESOURCE:records:WRITE` and
  `RESOURCE:transactions:WRITE` do not exist; record writes require their
  category and specific operation keys.

`EffectivePermissionSnapshot` provides `effectiveScreens`, `resources`,
`readableCategories`, and complete typed `capabilities.screens`, `.resources`,
`.categories` maps. Each module has `read`, `write` and the catalog's `actions`.
The flat `decisions` map adds role/override effects, the selected policy source,
restriction/dependency reasons, and key/scope/module/action metadata. API
consumers can serialize it without converting BigInt. Keep existing session
fields during the compatibility transition agreed in #242; use this contract
for new fields rather than making the client recompute authorization.

`valid` means the account is active and the input is structurally valid: built-in
role, matching V1 policy, positive revisions, every catalog key exactly once,
and known, nonduplicate, correctly owned overrides. Invalid/incomplete context
denies every capability. A structurally valid snapshot may still contain an
invalid stored dependency combination (for example Write Allow plus Read Deny):
the affected Write/operations deny with reasons, while unrelated capabilities
remain usable. Proposed writes must pass `actionPermissionInputError`, which
rejects those combinations, grants above immutable ceilings and changes to
protected ADMIN management access. Valid stored ADMIN management denials are
ignored to preserve locked management access, with their provenance retained;
this protection does not apply to ADMIN business operations.

Individual Deny wins over a role Allow. Individual Allow overrides a role Deny
only within immutable role/action restrictions. Write requires Read; specific
operations require module Write. Supplier/customer/Driver/SKU/admin management
also requires the corresponding screen Write capability. Shared lookup Read
never synthesizes management Write. Screen visibility and category capabilities
remain separate: aggregate category access does not create navigation grants,
and category Deny cannot be bypassed through a visible aggregate screen.

## Record and transaction integration

`recordAccess.ts` exports opt-in helpers accepting only a V1 snapshot:

- `readablePolicyCategories` and `policyRecordScope` intersect category Read,
  generic resource access and the chosen navigation/resource path. Use the scope
  for every list, detail, audit, search, calendar, dashboard and report query.
  Scopes exclude deleted rows and preserve Driver profile ownership/non-draft
  restrictions. Transaction paths also intersect the role's transaction-category
  ceiling, identically for list predicates and instance checks.
- `canReadPolicyRecord` performs the matching instance checks.
- `canWritePolicyCategory`/`canCreatePolicyCategory` check category and path
  Write/Create. They do not authorize every mutation in that category.
- `canPerformPolicyRecordAction` requires the specific operation, category/path
  access and record ownership. It also preserves established Delivery date,
  Time In and status-transition restrictions; STATUS to Delivered also requires
  COMPLETE, so it cannot bypass a completion denial. Draft submission and return
  to Draft both require SUBMIT, including when requested via STATUS. TASS alone verifies an
  accomplished/unverified Accounting Collection. Retain route role guards,
  per-field restrictions, input validation, required POD evidence, transaction
  locks/audit attribution and other business rules around these predicates. The
  API operation mapper must check every changed field's action: UPDATE is not a
  blanket grant for ASSIGN, STATUS, POD, receiving or completion fields.

`transactionAccess.ts` exposes `canAccessPolicyTransactions`,
`canAccessPolicyInventoryTransactions`, and `policyTransactionRecordScope`.
Inventory transaction access does not authorize stock adjustment; an adjustment
needs its own SKU resource/action and SKU Master Write. Driver transaction access
never grants Transaction Center navigation or inventory access.

## Revised RMA boundary and movement adapter

The evaluator honors #242 over older downstream issue wording: TASS owns RMA
entry, receiving and final completion; Logistics may only gain bounded transport
assignment; Drivers may only gain assigned eligible transport progress/POD.
ADMIN cannot bypass TASS-only receiving/final completion. The frozen migration
baseline leaves Logistics assignment and Driver RMA transport denied; a ceiling
alone does not grant them. Supplier collection is not restricted to RTS.

The current record schema has no authoritative Logistics-required/internal-driver
movement fields. The evaluator therefore requires a **trusted domain adapter**
before these future transport operations can be used. Do not bind these facts
directly from request booleans or infer them from `driverId` or the RMA subtype.
Instance helpers require explicit `RmaTransportContext` facts:
`requiresLogistics`, `requiresInternalDriver`, `eligible`; Driver writes also
require `actionAllowed` after the domain validates that transport action's date
and state. Driver STATUS cannot finalize the RMA. Future transport handlers must
keep transport progress separate from physical receipt/final RMA completion;
these helpers do not authorize writing driver progress into a final-status field.

Driver RMA query scopes deny those rows by default. An adapter may supply a set
of verified eligible RMA record IDs to `policyRecordScope` or
`policyTransactionRecordScope`; the helper still intersects category, profile,
draft and deletion constraints. Unknown, internal/no-driver and non-Logistics
movements must never enter that verified set. An empty set grants no RMA rows.

An **authorization read scope is not an actionable dispatch queue**. Logistics
and other authorized staff may view/print non-Logistics RMA records. Downstream
queue, assignment-notification and internal-driver-workload code must separately
filter using confirmed movement eligibility. Internal no-driver movements must
not require or fabricate assignment, Time In or Time Out. No new receiving
proof, corrections or inventory rules are invented here; those remain in the
separate receiving issues and the downstream domain integration.

## Validation

Run from the repository root with dependencies and the current generated Prisma
client available:

```bash
node --import tsx --test server/tests/permissionEvaluator.test.ts
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p client/tsconfig.json
npm run test:server
npm run test:client
```

The evaluator suite covers five role baselines, explicit override provenance and
later default changes, every missing catalog row, malformed/duplicate/unknown
context, protected ADMIN management, Read/Write/operation prerequisites,
immutable role restrictions, aggregate/path category denials, actual Prisma
predicate semantics, Driver profile ownership and Manila date boundaries,
RMA transport eligibility and TASS finalization, Accounting verification,
transaction-category limits, and all 4,005 migrated navigation/category fixtures
against the independent legacy helpers. Loader tests verify selected fields,
Repeatable Read usage and reload behavior with a mocked transaction; they do not
claim real PostgreSQL concurrency/rollout proof. That rehearsal remains #249.
