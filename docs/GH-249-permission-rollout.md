# Permission migration rehearsal and release procedure (GH-249)

This is Step 07 of [tracker #241](https://github.com/OatiesMilk/Supply-Chain/issues/241),
under the approved contract in [#242](https://github.com/OatiesMilk/Supply-Chain/issues/242).
It rehearses conversion and documents an operator procedure. It does not authorize
deployment, production database changes, or activation. Final integrated release
verification remains [#250](https://github.com/OatiesMilk/Supply-Chain/issues/250).

The earlier [foundation](PERMISSION_FOUNDATION.md),
[evaluator](PERMISSION_EVALUATOR.md), [management API](PERMISSION_MANAGEMENT.md),
[API enforcement inventory](GH-247-api-permission-inventory.md), and
[frontend contract](GH-246-frontend-permissions.md) describe the implementation.
Their statements that subsequent steps are pending describe those earlier
handoffs; this runbook is the coordinated procedure after those implementations.

## What counts as migration acceptance

Compare the retained legacy source with the actual persisted V1 policy, rather
than comparing two copies of the conversion planner. Include all accounts,
including inactive accounts, and verify every conversion checkpoint and source
hash. Retain a reviewed report with the release commit and catalog version.

| Boundary | Required comparison |
| --- | --- |
| Navigation | Exact effective screens for all five roles and individual exceptions. Aggregate/category access must never reveal a previously hidden screen. |
| Category data | Lists, direct details, dashboard, reports, calendar/driver scheduling, and transactions intersect category denials and ownership. |
| Shared resources | Lookup dependencies remain available only as permitted; lookup Read cannot supply management Write. |
| Operations | Screen Write, category/resource Write, the specific action, immutable role ceilings, and existing field/state guards must all agree. |
| TASS Procurement | The screen/supplier lookup may be visible while Procurement records and supplier writes remain denied. |
| Driver identity | Only an active linked Driver profile can own assigned eligible non-draft records. Names, inactive links, other drivers' records and missing links cannot grant access. |
| Legacy exceptions | Absent means Inherit; explicit equal-to-default exceptions survive. Unknown/protected entries are reported without activating protected navigation. Known protected category denials remain effective. |

Record every difference as one of: an explained tightening, an unexplained
regression, or an unexplained expansion. The frozen migration baseline already
embeds the Step 00 role/action ceilings, so it is not an independent oracle for
every historical route permission. Review actual business-route behavior using
the enforcement inventory and integrated workflow checks as well.

The automated comparison permits only identified Driver-link and inactive-account
fail-closed differences. Other differences, including any Read/Write dependency
or management-screen tightening, require explicit investigation. The frozen
baseline already contains the approved TASS-only physical RMA receipt/final
completion rule. A count alone is insufficient: record the affected
fixture/account, key/path, before/after result and reason.
Do not treat an unexplained difference as approved simply because it denies more.
Any unexplained expansion or regression blocks activation.

RMA transport is separate from receipt and final completion. Conversion does not
turn on new Logistics assignment or Driver RMA grants simply because the catalog
permits them. Any later intentional grant is a separate reviewed V1 policy edit.
Internal/no-driver movements must not fabricate assignments or driver clocks.
Ordinary Delivery, Accounting Collection, SKU and transaction restrictions remain.

## Isolated rehearsal

Use a fresh local PostgreSQL instance and dedicated disposable databases. Never
pass the application database, load an unidentified environment file, or reuse a
database serving ports 3000/4000. No new application server is needed.

Run from the repository root, with PostgreSQL client tools on `PATH` and an
explicit connection to an isolated **local** cluster's administrative database:

```bash
PERMISSION_REHEARSAL_ADMIN_URL=postgresql://issue249@127.0.0.1:55449/postgres \
  npm run permissions:rehearse --workspace=mg-portal-server
```

The URL above is an example for a separately provisioned local cluster, not an
application connection. Do not copy credentials from the application's `.env`.
The runner creates uniquely named disposable databases itself and drops only
those databases on completion. `PERMISSION_REHEARSAL_OUTPUT_DIR` can select a
private output directory; otherwise evidence goes to a fresh `/tmp` directory.
Retain the sanitized JSON report and test evidence for review. Database dumps
remain private local recovery artifacts.

The standalone backfill intentionally accepts only explicitly named local
`*_test`/`*_sandbox` targets, a matching `PERMISSION_BACKFILL_DATABASE`, test or
development mode, and an existing active Admin operator. Deployed-environment
markers and URL parameters that can redirect the connection are rejected.
These safeguards must remain in place. An approved deployment to a remote target
needs its own reviewed execution mechanism; changing the environment name or
removing the guard is not a deployment procedure.

Rehearsal must exercise the populated upgrade path: apply migrations preceding
the permission foundation, insert synthetic users/legacy exceptions/audit data,
apply the additive foundation and remaining migrations, then convert. Compare
retained legacy rows, user identity and audit sentinels across DDL application.
Run the converter twice and require unchanged policies, overrides, revisions,
quarantine, checkpoints and audits on the second pass. Inject a failed conversion
to verify atomic rollback and retry. A source mismatch or customized policy must
stop conversion; never delete checkpoints or overrides to force acceptance.

Run real PostgreSQL tests serially because they edit shared role policies.
Without an explicit disposable target the optional database suites skip; a
default unit-test pass with those skips is not concurrency evidence. Competing
user saves, role-policy saves and role changes must preserve a single committed
winner and reject the stale editor with 409. Also verify transaction rollback
on audit failure and recheck a demoted administrator after waiting for locks.

## Backup and restore rehearsal

Before any approved migration, record the application/frontend commits,
PostgreSQL version, migration head, catalog version, permission mode and release
operator. Quiesce legacy permission, account/role, Driver identity and seed
writers before the backup and keep them quiesced through shadow comparison.
Drain already-authorized requests before changing the deployment mode.

Keep a complete recoverable database backup and a policy/account manifest from
one consistent database view. Include `UserPermission`, `PermissionDefinition`,
`RolePolicy`, `RolePermission`, `UserPermissionOverride`, `PermissionConversion`,
`PermissionQuarantine`, account roles/active state/authorization revisions,
Driver links/active state, and authorization audit records. A policy-only dump
without account identity or revision state cannot prove recoverability.

For a **synthetic local rehearsal only**, PostgreSQL custom-format backup and
restore can use explicitly supplied connection variables:

```bash
umask 077
mkdir -p /tmp/gh249-backup
pg_dump --dbname="$REHEARSAL_DATABASE_URL" --format=custom --no-owner --no-acl \
  --file=/tmp/gh249-backup/before.dump
pg_restore --list /tmp/gh249-backup/before.dump > /tmp/gh249-backup/before.contents
pg_restore --dbname="$EMPTY_RESTORE_DATABASE_URL" --no-owner --no-acl --exit-on-error \
  /tmp/gh249-backup/before.dump
```

Both variables must name different, explicitly identified, disposable local
databases, and the restore database must be empty. Never use `--clean` against
an application database. Verify backup checksums and restore into that separate
database before considering the backup usable. Compare the policy/account
manifest and synthetic audit sentinel, then repeat conversion/shadow comparison
on the restored database. Keep backup files private; real dumps include account
and business data and must not be committed or attached to public tickets.

## Coordinated activation sequence

1. Obtain deployment authorization and finish #250's integrated backend/frontend
   workflow checks, including the Admin UI's outstanding visual acceptance.
   Record the chosen commits and reviewed comparison evidence. This issue's
   rehearsal is not that authorization.
2. Verify and rehearse restoration of the backup. Stop policy/account/identity
   writers and drain in-flight protected writes. Inventory all processes that
   can modify permissions, including seeds and background workers.
3. Apply the additive migrations through the reviewed deployment mechanism.
   Preserve legacy permissions and historical audits. Do not reset/reseed a
   deployed database. Deploy matching backend and frontend with
   `PERMISSION_MODE=LEGACY` while validation runs; V1 policy saves remain disabled.
4. Initialize complete policies and perform the idempotent backfill under the
   identified active Admin, using the approved target-specific execution path.
   Verify every account, all five complete role policies, source hashes,
   quarantine and Driver links. Rerun with zero changes. Stop on drift.
5. Compute the legacy/V1 shadow matrix without granting V1 authority to clients.
   Resolve all unexplained differences. Preserve navigation separately from
   implicit category visibility. Keep the accepted evidence and policy backup.
6. With traffic gated, activate the matching backend/frontend release together:
   every API instance uses `PERMISSION_MODE=V1`, including restarted workers.
   Do not serve a mixture of LEGACY and V1 instances. Load fresh server sessions;
   validate `contractVersion: 1`, `activeMode: V1`, valid complete snapshots and
   decimal-string revisions. Unconverted/incomplete accounts must fail closed.
7. Verify Boolean legacy permission writes return 400, stale V1 editors return
   409, unauthorized writes return 403, and valid versioned saves/reset work.
   Confirm policies, revisions and safe audits commit atomically. Confirm current
   sessions and subsequent direct API requests observe a committed revocation.
   Existing authorized in-flight operations are not retroactively cancelled.
8. Reopen traffic gradually and monitor. Re-enable only reviewed action-aware
   writers. Take a post-activation backup and preserve the pre-activation backup.

## Monitoring and stop conditions

Record counts by endpoint/action and role for 400 legacy-contract rejection,
401 inactive/invalid session, 403 denial, 409 stale editors, 503 missing/invalid
foundation, database lock/timeouts and authorization audit failures. Compare with
the pre-activation baseline; do not log cookies, tokens, credentials, complete
policy payloads or personal account data. The existing audit endpoint projects
allowlisted authorization changes; retain database audit evidence separately.

Check fresh `/api/auth/me` snapshots, hidden navigation, explicit category denial
through aggregates/direct details, TASS lookup boundaries, Driver ownership,
protected Admin access and Read-only users' write rejection. Confirm the client
refreshes permissions and clears stale cached views; server enforcement remains
authoritative during that refresh. Missing policies, unexplained expansions,
unexpected write acceptance, stale revocation, or repeated save/audit failures
stop release and gate affected traffic while the operator investigates.

## Rollback after Read and Write diverge

Do not switch to LEGACY, deploy an old Boolean evaluator, overwrite current policy
rows from a pre-activation dump, or delete conversion evidence after action-aware
edits. A legacy `true` can restore writes that were explicitly denied, and an old
backup can remove subsequent revocations or account deactivations.

Prefer a forward fix or a previous **action-aware** compatible release, keeping
`PERMISSION_MODE=V1`, current policies, immutable ceilings and account ownership.
Gate writes at the deployment boundary if business safety is uncertain; merely
making the frontend read-only does not stop direct API writes.

If no compatible action-aware binary is available, use read-only maintenance
with protected API writes blocked. Restore backups into a separate recovery
database for investigation, never over the running database. Reconcile current
policy rows, roles, active state, Driver identities and audits against the saved
snapshot. Build a reviewed conservative policy: retain current denials and
revocations, and permit only actions allowed by both the current and recovery
states and immutable business ceilings. Identity/role conflicts require manual
review; do not revive inactive users or guess Driver ownership.

Apply any approved recovery policy through the V1 versioned management API using
fresh editor tokens and transactional audits, resolving dependencies without
granting Read to satisfy old Write. Revisions must advance; do not restore lower
revision numbers or replay stale editor tokens. Preserve protected Admin recovery
access while retaining business restrictions. Repeat the matrix and integrated
checks before reopening writes. A full database disaster restore is a separately
authorized incident operation requiring reconciliation of post-backup business
data, permissions and revocations.

## Recorded local rehearsal: 2026-10-30

The rehearsal passed on PostgreSQL 18.6, bound to `127.0.0.1:55449`, using the
dedicated cluster `/tmp/supply-chain-249-pg-GSI0ki`. The source database was
`permission_249_c80845b33ba740f98d6d715560ddcccb_test`; separate action-aware
restore, pre-migration restore and foundation-test databases used the same unique
run identifier. All four were created by the runner and dropped after validation.
Existing application databases and dev servers were not used. The dedicated
cluster was stopped after validation; start it explicitly with the installed
PostgreSQL `pg_ctl -D /tmp/supply-chain-249-pg-GSI0ki start` before repeating the
example command, or provision another isolated cluster and change the URL.

| Evidence | Result |
| --- | --- |
| Migrated fixtures | 23 accounts across five roles, category/lookup exceptions, protected/unknown entries, linked/unlinked/inactive Driver identity and inactive account |
| Shadow matrix | 7,544 comparisons; zero unexplained expansions or compatibility regressions; no newly visible hidden screen |
| Explained differences | 116 Driver-link-required checks across two accounts; 139 inactive-account checks across one account. These are checks across overlapping paths/actions, not 255 separate grants. |
| Conversion/rerun | 23 converted, then 23 unchanged; full policy/account/revision/checkpoint/quarantine/audit state byte-identical on rerun |
| Retained legacy data | 35 legacy permission rows and the pre-migration audit sentinel preserved; 18 unknown/protected rows quarantined |
| Pre-migration recovery | Restored legacy rows, Driver profiles, audits and every previous User field exactly into a fresh database |
| Action-aware recovery | Exact policy/account/Driver/checkpoint/audit state and fresh V1 sessions after restore; Delivery Read/Write remained enabled while POD stayed denied; legacy Boolean replacement rejected with 400 |
| Actual PostgreSQL management tests | 13 passed, zero skipped: competing user saves, competing role defaults, role-change/save race, stale editors, actor demotion, self-lockout and audit rollback |
| Actual PostgreSQL foundation tests | 7 passed, zero skipped, on their own fresh database: 4,005 legacy fixtures, conversion failure rollback/retry, constraints and revision monotonicity |
| Rehearsal unit checks | 5 passed: matrix, classified tightening, expansion/regression detection, invalid identity/snapshot detection, target safety |
| Full client suite after rebasing onto `dev` | 235 passed; zero failed or skipped |
| Full server suite after rebasing onto `dev` | 372 passed; zero failed; 3 optional PostgreSQL tests skipped in the default run. The foundation and management database suites ran separately above with zero skips. |
| TypeScript | Client and server `tsc --noEmit` passed |

Private local evidence is retained under `/tmp/permission-249-1V2TFR/`:
`report.json`, `postgres-management-tests.txt`, `postgres-foundation-tests.txt`,
and the two synthetic recovery dumps. The directory is mode 0700 and artifacts
are mode 0600. The report includes the full comparison differences and database
cleanup evidence. Synthetic backup checksums:

```text
before-permission-migration.dump
394b57ce1684db1fa2573a3a8296b1bb721b56bc20e7b44cff83982c673295d6
action-aware-policy.dump
d3fc8cf1a39e1a095554cecfc1e51bcbe502bc32eadbfe7c60ad828670695dc4
```

These are reproducible fixture results, not a shadow scan of deployed accounts
or production activation evidence. Before deployment, repeat the approved
environment-specific backup/comparison and complete #250. Temporary artifacts
may be removed by the operating system; retain reviewed release evidence in the
team's private release archive when preparing the actual deployment.
