import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { assertPermissionBackfillTarget, convertPermissionAccount, initializePermissionFoundation } from '../src/services/permissionBackfill';
import { POLICY_ROLES, type PolicyRole } from '../src/services/permissionCatalog';
import { comparePermissionRehearsal, type RehearsalAccount } from '../src/services/permissionRehearsal';
import { loadPermissionSession } from '../src/services/sessionPermissions';
import { getUserPermissionEditor, PolicyManagementError, saveUserPermissions } from '../src/services/permissionManagement';
import { replacePermissions } from '../src/services/permissions';

const root = path.resolve(__dirname, '..');
const foundation = '20261027091057_permission_foundation';

/** Never import db.ts/dotenv here: only an explicit local administrative
 * connection may create this runner's fresh databases. Existing DBs are never
 * reset, migrated, seeded or dropped. */
export function rehearsalAdminTarget(env: NodeJS.ProcessEnv): URL {
  let url: URL;
  try { url = new URL(env.PERMISSION_REHEARSAL_ADMIN_URL ?? ''); }
  catch { throw new Error('Set PERMISSION_REHEARSAL_ADMIN_URL to the dedicated local PostgreSQL administrative connection'); }
  if (url.pathname !== '/postgres' || url.search || url.hash) throw new Error('Rehearsal requires an explicit local postgres administrative database without query parameters');
  const probe = new URL(url); probe.pathname = '/permission_rehearsal_test';
  assertPermissionBackfillTarget({ ...env, NODE_ENV: env.NODE_ENV ?? 'test', DATABASE_URL: probe.toString(), PERMISSION_BACKFILL_DATABASE: 'permission_rehearsal_test' });
  return url;
}

function command(file: string, args: string[], env: NodeJS.ProcessEnv): string {
  try { return execFileSync(file, args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, timeout: 180000 }); }
  catch { throw new Error(`Rehearsal subprocess failed: ${path.basename(file)}. No connection details are logged.`); }
}
function pgEnvironment(url: URL): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // libpq PGHOSTADDR/PGSERVICE and distro PGCLUSTER can override PGHOST. Empty
  // PGSERVICEFILE still attempts to open an empty filename, so remove it.
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  return { ...env, PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGPASSFILE: '/dev/null', PGSSLMODE: 'disable' };
}
const stringify = (value: unknown) => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v);
const digest = (value: unknown) => createHash('sha256').update(stringify(value)).digest('hex');
function testSummary(output: string) {
  const number = (label: string) => {
    const value = output.match(new RegExp(`(?:ℹ|#) ${label} (\\d+)`));
    assert.ok(value, `missing test ${label} summary`);
    return Number(value[1]);
  };
  const result = { tests: number('tests'), passed: number('pass'), failed: number('fail'), skipped: number('skipped') };
  assert.ok(result.tests > 0);
  assert.equal(result.passed, result.tests, 'PostgreSQL evidence must execute every test');
  assert.equal(result.failed, 0); assert.equal(result.skipped, 0);
  return result;
}

async function tableSnapshot(pool: Pool, tables: string[]) {
  const result: Record<string, string[]> = {};
  for (const table of tables) {
    assert.match(table, /^[A-Za-z_]+$/);
    result[table] = (await pool.query<{ row: string }>(`SELECT row_to_json(t)::text AS row FROM "${table}" t ORDER BY 1`)).rows.map(row => row.row);
  }
  return result;
}
const policyTables = ['User', 'Driver', 'UserPermission', 'AuditLog', 'PermissionDefinition', 'RolePolicy', 'RolePermission', 'UserPermissionOverride', 'PermissionConversion', 'PermissionQuarantine'];

async function seedLegacy(pool: Pool): Promise<RehearsalAccount[]> {
  const fixtures: RehearsalAccount[] = [];
  for (const role of POLICY_ROLES) for (const variant of ['baseline', 'category-deny', 'lookup-exception', 'quarantine']) {
    const id = `gh249-${role}-${variant}`;
    const permissions = variant === 'category-deny' ? [{ screen: 'deliveries', granted: false }, { screen: 'calendar', granted: true }]
      : variant === 'lookup-exception' ? [{ screen: 'inventory', granted: true }, { screen: 'suppliers', granted: false }]
      : variant === 'quarantine' ? [{ screen: 'unknown', granted: true }, { screen: 'admin', granted: false }, { screen: 'driver_dashboard', granted: true }] : [];
    fixtures.push({ id, role, isActive: true, permissions: permissions.map(p => ({ ...p, id: `${id}-${p.screen}` })),
      driverProfile: role === 'DRIVER' ? { id: `profile-${id}`, type: 'DRIVER', isActive: true } : null });
  }
  fixtures.push({ id: 'gh249-DRIVER-unlinked', role: 'DRIVER', isActive: true, permissions: [] },
    { id: 'gh249-DRIVER-inactive-profile', role: 'DRIVER', isActive: true, permissions: [], driverProfile: { id: 'profile-inactive', type: 'DRIVER', isActive: false } },
    { id: 'gh249-inactive-account', role: 'SALES_COORDINATOR', isActive: false, permissions: [] });
  for (const f of fixtures) {
    await pool.query('INSERT INTO "User" (id,name,email,password,role,"isActive","updatedAt") VALUES ($1,$1,$2,$3,$4,$5,NOW())',
      [f.id, `${f.id}@example.test`, 'synthetic-not-a-login', f.role, f.isActive]);
    for (const p of f.permissions) await pool.query('INSERT INTO "UserPermission" (id,"userId",screen,granted,"updatedAt") VALUES ($1,$2,$3,$4,NOW())', [p.id, f.id, p.screen, p.granted]);
    if (f.driverProfile) await pool.query('INSERT INTO "Driver" (id,name,type,"userId","isActive","createdBy","modifiedBy","modifiedAt") VALUES ($1,$2,\'DRIVER\',$2,$3,\'rehearsal\',\'rehearsal\',NOW())', [f.driverProfile.id, f.id, f.driverProfile.isActive]);
  }
  await pool.query('INSERT INTO "AuditLog" (id,"recordId","recordType",action,"changedById","newValue") VALUES (\'gh249-legacy-audit\',\'legacy\',\'LegacySentinel\',\'CREATE\',\'gh249-ADMIN-baseline\',\'{"preserve":true}\')');
  return fixtures;
}

async function main() {
  process.umask(0o077);
  const adminUrl = rehearsalAdminTarget(process.env);
  const outputBase = process.env.PERMISSION_REHEARSAL_OUTPUT_DIR || tmpdir();
  mkdirSync(outputBase, { recursive: true, mode: 0o700 });
  const output = mkdtempSync(path.join(outputBase, 'permission-249-'));
  chmodSync(output, 0o700);
  const id = randomUUID().replace(/-/g, '');
  const database = `permission_249_${id}_test`, restoredDatabase = `permission_249_restore_${id}_test`;
  const admin = new Pool({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 10000 });
  const created: string[] = [];
  const open: Array<{ db: PrismaClient; pool: Pool }> = [];
  const previousMode = process.env.PERMISSION_MODE;
  const report: Record<string, unknown> = { issue: 249, startedAt: new Date().toISOString(), database, restoredDatabase,
    target: { host: adminUrl.hostname, port: adminUrl.port || '5432' }, output, status: 'FAILED' };
  const connect = async (name: string) => {
    assert.ok(created.includes(name));
    const url = new URL(adminUrl); url.pathname = `/${name}`;
    const pool = new Pool({ connectionString: url.toString() });
    const db = new PrismaClient({ adapter: new PrismaPg(pool) }); open.push({ db, pool });
    return { url, pool, db };
  };
  try {
    report.stage = 'create-disposable-databases';
    for (const name of [database, restoredDatabase]) {
      await admin.query(`CREATE DATABASE "${name}"`);
      created.push(name); // A failed CREATE never authorizes cleanup of an existing DB.
    }
    const target = await connect(database);
    const migrationsRoot = path.join(output, 'prisma');
    mkdirSync(path.join(migrationsRoot, 'migrations'), { recursive: true });
    copyFileSync(path.join(root, 'prisma/schema.prisma'), path.join(migrationsRoot, 'schema.prisma'));
    copyFileSync(path.join(root, 'prisma/migrations/migration_lock.toml'), path.join(migrationsRoot, 'migrations/migration_lock.toml'));
    const migrations = readdirSync(path.join(root, 'prisma/migrations'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
    assert.ok(migrations.includes(foundation));
    const addMigration = (name: string) => {
      mkdirSync(path.join(migrationsRoot, 'migrations', name));
      copyFileSync(path.join(root, 'prisma/migrations', name, 'migration.sql'), path.join(migrationsRoot, 'migrations', name, 'migration.sql'));
    };
    for (const migration of migrations.filter(m => m < foundation)) addMigration(migration);
    const migrate = () => command(process.execPath, [path.resolve(root, '../node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(migrationsRoot, 'schema.prisma')], { ...process.env, DATABASE_URL: target.url.toString() });
    report.stage = 'migrate-legacy-schema'; migrate();
    report.stage = 'seed-legacy-fixtures';
    const fixtures = await seedLegacy(target.pool);
    const legacyTables = ['UserPermission', 'AuditLog', 'Driver'];
    const beforeLegacy = await tableSnapshot(target.pool, legacyTables);
    const beforeUsers = (await target.pool.query('SELECT row_to_json(t)::text AS row FROM "User" t ORDER BY id')).rows;
    const preBackup = path.join(output, 'before-permission-migration.dump');
    report.stage = 'backup-pre-migration';
    command('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', preBackup], pgEnvironment(target.url));
    for (const migration of migrations.filter(m => m >= foundation)) addMigration(migration);
    report.stage = 'apply-additive-migrations'; migrate();
    report.migrations = { before: migrations.filter(m => m < foundation), applied: migrations.filter(m => m >= foundation) };
    assert.deepEqual(await tableSnapshot(target.pool, legacyTables), beforeLegacy, 'DDL preserves legacy rows, profiles and audit sentinel');
    const afterUsers = (await target.pool.query('SELECT (to_jsonb(t) - \'authorizationRevision\')::text AS row FROM "User" t ORDER BY id')).rows;
    assert.deepEqual(afterUsers.map(r => JSON.parse(r.row)), beforeUsers.map(r => JSON.parse(r.row)), 'DDL preserves all previous User fields');
    const operator = 'gh249-ADMIN-baseline';
    report.stage = 'convert-and-rerun';
    await initializePermissionFoundation(target.db, operator);
    for (const f of fixtures) assert.equal(await convertPermissionAccount(target.db, f.id, operator), 'converted');
    const first = await tableSnapshot(target.pool, policyTables);
    await initializePermissionFoundation(target.db, operator);
    for (const f of fixtures) assert.equal(await convertPermissionAccount(target.db, f.id, operator), 'unchanged');
    assert.deepEqual(await tableSnapshot(target.pool, policyTables), first, 'rerun changes no rows, revisions, audits, checkpoints or timestamps');
    assert.deepEqual((await tableSnapshot(target.pool, ['UserPermission'])).UserPermission, beforeLegacy.UserPermission);
    assert.ok((await target.db.auditLog.findUnique({ where: { id: 'gh249-legacy-audit' } })));
    report.stage = 'compare-persisted-sessions';
    const shadow = [];
    for (const account of fixtures) {
      const loaded = await loadPermissionSession(target.db, account.id);
      assert.ok(loaded);
      const comparison = comparePermissionRehearsal(account, loaded.session.snapshot);
      shadow.push(comparison);
    }
    report.shadow = { accounts: fixtures.length, comparisons: shadow.reduce((n, r) => n + r.comparisons, 0),
      expansions: shadow.flatMap(r => r.expansions), regressions: shadow.flatMap(r => r.regressions),
      intentionalTightening: shadow.flatMap(r => r.intentionalTightening), matrices: shadow };
    assert.deepEqual(shadow.flatMap(r => r.expansions), [], 'unexplained access expansion');
    assert.deepEqual(shadow.flatMap(r => r.regressions), [], 'compatibility regression');
    report.conversion = { converted: fixtures.length, rerunUnchanged: fixtures.length, byteIdenticalRerun: true,
      legacyRowsPreserved: beforeLegacy.UserPermission.length, quarantine: await target.db.permissionQuarantine.findMany({ orderBy: { legacyId: 'asc' }, select: { userId: true, screen: true, granted: true, reason: true } }) };

    // Rehearse recovery of a policy that the legacy Boolean payload cannot
    // represent: Read and general Write remain while one operation is denied.
    report.stage = 'diverge-read-write-and-reject-legacy-payload';
    process.env.PERMISSION_MODE = 'V1';
    const userId = 'gh249-SALES_COORDINATOR-baseline';
    const editor = await getUserPermissionEditor(target.db, operator, userId);
    await saveUserPermissions(target.db, operator, userId, { contractVersion: 1, catalogVersion: 1, expectedVersion: editor.expectedVersion,
      permissions: [{ permissionKey: 'CATEGORY:DELIVERY:POD', effect: 'DENY' }] });
    const divergentSession = await loadPermissionSession(target.db, userId);
    assert.equal(divergentSession!.session.snapshot.capabilities.categories.DELIVERY.read, true);
    assert.equal(divergentSession!.session.snapshot.capabilities.categories.DELIVERY.write, true);
    assert.equal(divergentSession!.session.snapshot.capabilities.categories.DELIVERY.actions.POD, false);
    await assert.rejects(replacePermissions(target.db, userId, operator, [], 'legacy-token'), e => e instanceof PolicyManagementError && e.status === 400);
    const actionState = await tableSnapshot(target.pool, policyTables);
    const sessions = await Promise.all(fixtures.map(f => loadPermissionSession(target.db, f.id)));
    const actionBackup = path.join(output, 'action-aware-policy.dump');
    report.stage = 'backup-and-restore-action-aware-policy';
    command('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', actionBackup], pgEnvironment(target.url));
    const restored = await connect(restoredDatabase);
    command('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', restoredDatabase, actionBackup], pgEnvironment(restored.url));
    assert.deepEqual(await tableSnapshot(restored.pool, policyTables), actionState, 'restored policy/account/driver/legacy/audit/checkpoint state is exact');
    assert.deepEqual(await Promise.all(fixtures.map(f => loadPermissionSession(restored.db, f.id))), sessions, 'fresh V1 sessions retain exact effective decisions and revisions');
    report.backupRestore = { preMigrationBackup: path.basename(preBackup), actionAwareBackup: path.basename(actionBackup),
      preMigrationBackupSha256: createHash('sha256').update(readFileSync(preBackup)).digest('hex'),
      actionAwareBackupSha256: createHash('sha256').update(readFileSync(actionBackup)).digest('hex'),
      policyStateSha256: digest(actionState), exactState: true, exactFreshSessions: true, legacyPayloadRejected: true,
      divergentOperationRetained: 'CATEGORY:DELIVERY:POD=DENY' };

    // The pre-DDL archive is also restored into its own newly created target,
    // proving recoverability of retained legacy data without touching the V1 DB.
    report.stage = 'restore-pre-migration-archive';
    const legacyRestoreDatabase = `permission_249_legacy_${id}_test`;
    await admin.query(`CREATE DATABASE "${legacyRestoreDatabase}"`); created.push(legacyRestoreDatabase);
    const legacyRestored = await connect(legacyRestoreDatabase);
    command('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', legacyRestoreDatabase, preBackup], pgEnvironment(legacyRestored.url));
    assert.deepEqual(await tableSnapshot(legacyRestored.pool, legacyTables), beforeLegacy);
    assert.deepEqual((await legacyRestored.pool.query('SELECT row_to_json(t)::text AS row FROM "User" t ORDER BY id')).rows, beforeUsers);
    report.preMigrationRestore = { database: legacyRestoreDatabase, exactLegacyRows: true, exactUserFields: true };

    // Management fixtures require baseline policies. Reset only the deliberate
    // per-user divergence, then exercise races on the runner's source database.
    report.stage = 'postgres-management-races';
    const current = await getUserPermissionEditor(target.db, operator, userId);
    await saveUserPermissions(target.db, operator, userId, { contractVersion: 1, catalogVersion: 1, expectedVersion: current.expectedVersion }, true);
    process.env.PERMISSION_MODE = 'LEGACY';
    const testOutput = command(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=spec', 'tests/permissionManagement.postgres.test.ts'],
      { ...process.env, PERMISSION_TEST_DATABASE_URL: target.url.toString() });
    writeFileSync(path.join(output, 'postgres-management-tests.txt'), testOutput, { mode: 0o600 });
    report.concurrency = { database, ...testSummary(testOutput), evidence: 'postgres-management-tests.txt' };
    report.stage = 'foundation-postgres-rollback-retry';
    // Independent fresh DB: foundation tests intentionally leave fixtures and
    // mutate role defaults, so they must never share the management target.
    const foundationDatabase = `permission_249_foundation_${id}_test`;
    await admin.query(`CREATE DATABASE "${foundationDatabase}"`); created.push(foundationDatabase);
    const foundationTarget = await connect(foundationDatabase);
    command(process.execPath, [path.resolve(root, '../node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { ...process.env, DATABASE_URL: foundationTarget.url.toString() });
    const foundationOutput = command(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=spec', 'tests/permissionFoundation.test.ts'],
      { ...process.env, PERMISSION_TEST_DATABASE_URL: foundationTarget.url.toString() });
    writeFileSync(path.join(output, 'postgres-foundation-tests.txt'), foundationOutput, { mode: 0o600 });
    report.foundation = { database: foundationDatabase, ...testSummary(foundationOutput), evidence: 'postgres-foundation-tests.txt' };
    report.stage = 'complete';
    report.status = 'PASSED';
  } finally {
    if (previousMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = previousMode;
    for (const { db, pool } of open.reverse()) {
      try { await db.$disconnect(); } catch { report.cleanupFailed = true; }
      try { await pool.end(); } catch { report.cleanupFailed = true; }
    }
    const removed: string[] = [];
    for (const name of created.reverse()) {
      try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); removed.push(name); }
      catch { report.cleanupFailed = true; }
    }
    try { await admin.end(); } catch { report.cleanupFailed = true; }
    if (report.cleanupFailed) report.status = 'FAILED';
    report.removedDatabases = removed;
    report.finishedAt = new Date().toISOString();
    writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ status: report.status, database, report: path.join(output, 'report.json'), cleanedUp: removed.length === created.length }));
  }
  assert.equal(report.cleanupFailed, undefined, 'rehearsal database cleanup failed');
}

if (require.main === module) main().catch(() => {
  console.error('Permission rehearsal failed. Review the private report, target configuration, migration files and PostgreSQL toolchain; no credentials are logged.');
  process.exitCode = 1;
});
