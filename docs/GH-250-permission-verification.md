# Integrated permission verification (GH-250)

Verification date: 2026-10-30. Final baseline: `d5ababa` on `dev`, containing
#246, #247, #248 and #249 plus the current export/attachment update. This report describes executed checks, not deployment
authorization. No existing application database, production configuration or
deployed permission activation was changed. The functional integration and UI
checks required by #250 are recorded below; production release still requires
the normal deployment approval.

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

`e2e/permissions-live.config.ts` additionally executes the complete built
application against its actual API entry point and a disposable PostgreSQL
database, without mocked responses. Four browser journeys cover:

- Real Admin role-default and individual edits/reset reaching another signed-in
  browser, unchanged original cookies, retained explicit Allow intent,
  readable-but-not-writable controls, direct API rejection and an empty registry.
- Two real Admin editors producing a 409, preserving the draft, requiring
  refreshed-policy review, displaying safe audit changes, and checking locked
  controls, keyboard navigation, unsaved changes and narrow layout.
- Distinct real logins for all five roles, including Sales RMA exclusion, TASS
  record/directory boundaries and a linked Driver's assigned-record queue.
- Record deep links, committed category revocation clearing an open workspace,
  forbidden deep links, explicit no-access UI, and deactivation invalidating the
  original authenticated browser.

The guarded seed refuses non-disposable or already populated targets. The
scoped Windows runner refuses occupied ports, binds its helpers to localhost,
removes mail/cloud credentials from the test API process, uses a local temporary
upload directory and stops only the child processes it started. V1 is enabled
only for that isolated test process and synthetic database.

## Executed results

| Check | Result |
| --- | --- |
| Client TypeScript | Passed |
| Server TypeScript | Passed |
| Full client node:test suite | 241 passed, 1 optional workflow-DB test skipped |
| Full server node:test suite | 377 passed, 3 optional PostgreSQL tests skipped |
| Separate HTTP/client/PostgreSQL workflow suite | 5 passed, zero skipped |
| Offline Chromium permission UI | 6 passed, zero skipped; desktop and narrow |
| Real built application + API + PostgreSQL Chromium journeys | 4 passed, zero skipped; all five roles, real UI saves/reset, two-admin conflict/review, same-cookie revocation, audit, narrow/keyboard, deep links, empty/no-access and deactivation |
| Production frontend build | Passed; existing large-chunk advisory |
| Fresh #249 rehearsal on isolated PostgreSQL 17 | Passed; 13 management and 7 foundation PostgreSQL checks, zero skipped |
| Migration comparison | 23 migrated accounts, 7,544 comparisons; zero unexplained expansions/regressions; 255 separately identified Driver-link/inactive-account checks |
| Recovery | Conversion rerun byte-identical; legacy and action-aware backups restored exactly; all four rehearsal-owned databases removed |

The workflow database was a separate disposable PostgreSQL 16 database at local
port 55450. Rehearsal ran on a separate PostgreSQL 17 cluster at local port 55451.
The first-phase task clusters were stopped after verification; synthetic
workflow users were confirmed removed. A fresh `gh250_live_test` database on the
isolated PostgreSQL 16 cluster was then created, migrated and seeded for live
browser verification. The scoped live helpers stopped after the successful
four-journey run. Synthetic live fixtures remain only inside the dedicated
disposable container for reproducibility. No application databases on ports
5432/5433 were used.
Private logs, JSON evidence, screenshots and dumps are not committed.

The original live checks used the free requested ports 3000/4000. After the
three core journeys had individually passed, unrelated application processes
occupied those ports. They were preserved. The final clean four-journey run used
the same built application and real API at isolated localhost ports 3001/4001,
with a test-only preview proxy pointing exclusively to the isolated API. Its
Admin deployment-status endpoint verified `gh250_live_test`, loopback and
database port 55450 before any browser mutation. This port deviation changes no
production configuration and is explicitly distinguished from testing the
unrelated services on 3000/4000.

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
| Roles, overrides/reset, revocation and two-admin conflicts | Real application browser journeys, PostgreSQL HTTP/client workflow, component draft-review tests and fresh management PostgreSQL race tests |
| Create/edit, bulk/status, comments, uploads, assignment, verification and email rejection | Existing `server/tests/permissionEnforcement.test.ts` uses actual routes and explicit side-effect sentinels; `client/tests/permissionsV1.test.ts` verifies browser rejection before network. These fixtures are not a complete live browser journey. |
| Aggregate/category/Driver visibility | Existing `permissionVisibility.test.ts`, enforcement tests and persisted migration comparison |
| Migration, real concurrent saves and audit-failure rollback | Fresh #249 rehearsal executes real foundation/management PostgreSQL suites, including audit rollback and competing policy/account updates |
| Keyboard, narrow layout, protected controls, unsaved drafts | Six Chromium component checks with built CSS plus actual Admin Panel browser journey; reference screenshot matching is not claimed |
| Deep links, empty/no-access and stale workspaces | Actual application browser journeys, route/permission node tests and real session refresh workflow |
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

For the actual application browser journeys, create a separate empty
`gh250_live_test` database on a disposable loopback PostgreSQL cluster at 55450,
apply the existing migrations only there, and set `PERMISSION_LIVE_DATABASE_URL`
to its explicit URL. The following commands seed synthetic data and run built
frontend/API helpers with a controlled lifetime:

```powershell
node --import tsx server/prisma/seed-permission-workflow.ts
./e2e/run-permissions-live.ps1
# If 3000/4000 belong to another app, preserve it and use the isolated port pair:
./e2e/run-permissions-live.ps1 -FrontendPort 3001 -ApiPort 4001
```

The runner assumes the current client has already been built and both root and
e2e dependencies are installed. It does not migrate, reset or seed an existing
application. It refuses occupied chosen ports and stops its own helpers in
`finally`; database creation/removal belongs to the explicitly identified
disposable cluster lifecycle. A direct `npm run test:permissions:live --prefix
e2e` is also available when the isolated application is already running; set
`PERMISSION_LIVE_CONFIRM_DATABASE=gh250_live_test` and the matching optional
`PERMISSION_LIVE_BASE_URL` first. The test repeats the deployment identity check.

## Limits and release gate

- The three Step 00 reference screenshots remain unavailable; no claim of
  reference matching or human visual approval is made. #250's explicit keyboard,
  narrow-screen, locked-control, unsaved-change, deep-link and empty/no-access
  checks were executed. The four final real application journeys used the
  isolated alternate port pair described above.
- This verification covers Chromium, not every browser/assistive technology or
  deployment topology. It uses synthetic local accounts and data, not deployed
  account shadow comparison or production traffic.
- Follow the coordinated backup, conversion, shadow comparison, activation,
  monitoring and recovery procedure in the #249 runbook. After Read/Write
  divergence, do not roll back to the legacy Boolean evaluator. Retain
  action-aware enforcement or gate protected writes while reconciling a
  conservative recovery policy. No production migration or activation is
  authorized by this report.
