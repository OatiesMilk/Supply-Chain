# Integrated permission verification (GH-250)

Verification date: 2026-10-30. Baseline: `0e33fa7` on `dev`, containing
#246, #247, #248 and #249. This report describes executed checks, not deployment
authorization. No application database, production configuration or permission
activation was changed. The issue must remain open until the live-application
and reference-layout acceptance below is recorded.

## Added coverage

`client/tests/permissionWorkflow.integration.test.ts` combines the actual client
API and auth/UI stores with the real Express auth, admin, user and customer
routes, signed synthetic session cookies, CSRF middleware and PostgreSQL. It
does not mock policy persistence, revision triggers, administrative locking,
audits, the session serializer or evaluator. The only fetch bridge supplies the
isolated fixture origin and the chosen synthetic actor's cookie.

It verifies role-default changes reaching the complete browser contract;
readable-but-not-writable Customer access; client rejection before fetch and
direct HTTP rejection with the same original cookie; explicit equal-to-default
Allow preservation; individual Deny and reset to current role defaults; refresh
clearing a stale workspace; two administrators racing actual HTTP saves with
one complete winner and one 409; stale-editor rejection and safe audit output;
protected Admin access; Write-requires-Read validation with no revision change;
and deactivation invalidating the original cookie.

The suite is opt-in. Before importing `server/src/db.ts`, it validates an explicit
local `*_test`/`*_sandbox` target and replaces the process's database URL. Without
`PERMISSION_WORKFLOW_DATABASE_URL` it skips rather than using the application's
database fallback. It restores role defaults, removes UUID-owned synthetic
accounts/overrides/conversion records/audits, closes the HTTP fixture and
disconnects. Run it serially against a dedicated disposable database; it edits
shared Logistics policy rows during the test.

`e2e/permissions.config.ts` is a separate offline Chromium configuration without
global login setup, storage state, application servers or live database writes.
It bundles the real permission editor and evaluator with synthetic editor API
responses. Tests exercise labelled keyboard controls and visible focus, locked
Admin controls, 409 draft preservation/refreshed-review/resubmission, native
unsaved-change confirmation, announcements and horizontal fit at 1280×800 and
390×844. It uses the current production build's CSS; only the external Google
font import is removed so the application's system-font fallback works offline.
This is browser component evidence, not a claim that the deployed application
or reference screenshots were accepted. Desktop/narrow screenshots are retained
locally in the ignored browser result directory.

## Executed results

| Check | Result |
| --- | --- |
| Client TypeScript | Passed |
| Server TypeScript | Passed |
| Full client node:test suite | 235 passed, 1 optional workflow-DB test skipped |
| Full server node:test suite | 372 passed, 3 optional PostgreSQL tests skipped |
| Separate HTTP/client/PostgreSQL workflow suite | 5 passed, zero skipped |
| Offline Chromium permission UI | 6 passed, zero skipped; desktop and narrow |
| Production frontend build | Passed; existing large-chunk advisory |
| Fresh #249 rehearsal on isolated PostgreSQL 17 | Passed; 13 management and 7 foundation PostgreSQL checks, zero skipped |
| Migration comparison | 23 migrated accounts, 7,544 comparisons; zero unexplained expansions/regressions; 255 separately identified Driver-link/inactive-account checks |
| Recovery | Conversion rerun byte-identical; legacy and action-aware backups restored exactly; all four rehearsal-owned databases removed |

The workflow database was a separate disposable PostgreSQL 16 database at local
port 55450. Rehearsal ran on a separate PostgreSQL 17 cluster at local port 55451.
Both task clusters were stopped after verification; synthetic workflow users
were confirmed removed. No application databases on ports 5432/5433 were used.
Private logs, JSON evidence, screenshots and dumps are not committed.

An initial rehearsal used PostgreSQL 17 dump/restore clients against PostgreSQL
16 and failed restoring `SET transaction_timeout`, which PostgreSQL 16 does not
support. This was a toolchain compatibility failure, not a permission comparison
failure. The successful rerun used matching PostgreSQL 17 server/client tools.
Use matching PostgreSQL major versions for backup and restore rehearsal; a
successful comparison alone must not hide a failed recovery step.

## Acceptance evidence map

| Requirement | Evidence and practical limit |
| --- | --- |
| Inherit/Allow/Deny, dependencies and immutable ceilings | Integrated workflow plus existing `client/tests/permissionsV1.test.ts`, `adminPolicyEditor.test.ts`, server evaluator and management suites |
| Roles, overrides/reset, revocation and two-admin conflicts | Real PostgreSQL HTTP/client workflow; component draft-review test; fresh management PostgreSQL race tests |
| Create/edit, bulk/status, comments, uploads, assignment, verification and email rejection | Existing `server/tests/permissionEnforcement.test.ts` uses actual routes and explicit side-effect sentinels; `client/tests/permissionsV1.test.ts` verifies browser rejection before network. These fixtures are not a complete live browser journey. |
| Aggregate/category/Driver visibility | Existing `permissionVisibility.test.ts`, enforcement tests and persisted migration comparison |
| Migration, real concurrent saves and audit-failure rollback | Fresh #249 rehearsal executes real foundation/management PostgreSQL suites, including audit rollback and competing policy/account updates |
| Keyboard, narrow layout, protected controls, unsaved drafts | Six actual Chromium component checks with built CSS; reference screenshot matching remains unavailable |
| Deep links, no-access and stale workspaces | Existing route/permission node tests plus real session refresh workflow; full live-app navigation remains outstanding |
| Release/setup/recovery readiness | This report and [GH-249 runbook](GH-249-permission-rollout.md); deployment approval remains separate |

## Reproduce

Install repository workspace dependencies with `npm ci` at the root, and browser
dependencies with `npm ci --prefix e2e`. The offline bundle uses esbuild supplied
by the root Vite dependency tree, so installing only `e2e` is insufficient.
Install the Playwright Chromium runtime if it is not already available.

```powershell
node node_modules/typescript/bin/tsc --noEmit -p client/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p server/tsconfig.json
npm run test:client
npm run test:server
npm run build
npm run test:permissions --prefix e2e
```

For the real workflow test, provision an explicitly identified disposable local
database, apply the existing migrations only to that database, and set
`PERMISSION_WORKFLOW_DATABASE_URL` to its URL. From `client/`, run:

```powershell
node --import tsx --test tests/permissionWorkflow.integration.test.ts
```

Do not use a database serving the existing application. Do not load application
environment files or use its `DATABASE_URL` as a shortcut. Run the migration
rehearsal using the isolated target and instructions in the #249 runbook; a
default suite with skipped PostgreSQL tests is not database concurrency evidence.

## Remaining acceptance and release gate

- The existing application services at ports 3000 and 4000 were unavailable
  (`ECONNREFUSED`) during verification. No replacement development servers were
  started. Complete live application login/navigation and combined Admin UI →
  policy persistence → second-user revocation journeys on the identified test
  environment, including deep links, empty/no-access states and stale open tabs.
- The three Step 00 reference screenshots remain unavailable. Compare the actual
  Admin Panel against those references and record responsible human acceptance.
  The offline component screenshots do not establish that approval.
- Complete these missing checks and attach the final PR/validation evidence
  before marking #250 resolved or updating the parent tracker as complete.
- Follow the coordinated backup, conversion, shadow comparison, activation,
  monitoring and recovery procedure in the #249 runbook. After Read/Write
  divergence, do not roll back to the legacy Boolean evaluator. Retain
  action-aware enforcement or gate protected writes while reconciling a
  conservative recovery policy. No production migration or activation is
  authorized by this report.
