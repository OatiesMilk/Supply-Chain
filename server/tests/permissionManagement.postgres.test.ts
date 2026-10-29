import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { assertPermissionBackfillTarget, convertPermissionAccount, initializePermissionFoundation } from '../src/services/permissionBackfill';
import { administrativeTransaction, assertAdminSurvives, getRolePermissionEditor, getUserPermissionEditor, mutateAdminAccount, PolicyManagementError, saveRolePermissions, saveUserPermissions } from '../src/services/permissionManagement';
import { loadEffectivePermissions } from '../src/services/permissionEvaluator';
import { permissionEditor, replacePermissions } from '../src/services/permissions';
import { linkDriverLogin, unlinkDriverLogin } from '../src/services/driverLogin';

const connectionString = process.env.PERMISSION_TEST_DATABASE_URL;
const request = (expectedVersion: string, permissions: Array<{ permissionKey: string; effect: 'ALLOW' | 'DENY' }>) => ({ contractVersion: 1, catalogVersion: 1, expectedVersion, permissions });
const deniedDashboard = [{ permissionKey: 'SCREEN:dashboard:READ', effect: 'DENY' as const }, { permissionKey: 'SCREEN:dashboard:WRITE', effect: 'DENY' as const }];
const status = (n: number) => (error: unknown) => error instanceof PolicyManagementError && error.status === n;

test('PostgreSQL management transactions, revisions, races and rollback on an explicit disposable target', { skip: !connectionString, timeout: 60000 }, async t => {
  const database = new URL(connectionString!).pathname.slice(1);
  assertPermissionBackfillTarget({ DATABASE_URL: connectionString!, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: database });
  const pool = new Pool({ connectionString });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  const prefix = `gh245-${randomUUID()}`;
  const ids = ['admin', 'admin2', 'sales', 'driver', 'drift'].map(x => `${prefix}-${x}`);
  const [admin, admin2, sales, driver, drift] = ids;
  const oldMode = process.env.PERMISSION_MODE;
  let salesBaseline: Awaited<ReturnType<typeof getRolePermissionEditor>> | undefined;
  try {
    process.env.PERMISSION_MODE = 'LEGACY';
    for (const [id, role] of [[admin, 'ADMIN'], [admin2, 'ADMIN'], [sales, 'SALES_COORDINATOR'], [driver, 'DRIVER'], [drift, 'SALES_COORDINATOR']]) {
      await db.user.create({ data: { id, name: id, email: `${id}@example.test`, password: 'test-not-used', role } });
    }
    await initializePermissionFoundation(db, admin);
    for (const id of ids) await convertPermissionAccount(db, id, admin);
    salesBaseline = await getRolePermissionEditor(db, admin, 'SALES_COORDINATOR');

    await t.test('legacy converted saves return a usable final token and refuse source/provenance drift', async () => {
      let editor = permissionEditor((await db.user.findUniqueOrThrow({ where: { id: sales }, include: { permissions: true } })));
      editor = await replacePermissions(db, sales, admin, [{ screen: 'dashboard', granted: false }], editor.permissionVersion);
      editor = await replacePermissions(db, sales, admin, [], editor.permissionVersion);
      assert.ok(editor.effectiveScreens.includes('dashboard'));
      assert.equal(editor.permissionVersion, permissionEditor(await db.user.findUniqueOrThrow({ where: { id: sales }, include: { permissions: true } })).permissionVersion);
      await db.userPermissionOverride.create({ data: { userId: drift, permissionKey: 'SCREEN:dashboard:READ', effect: 'DENY', source: 'LEGACY_V1' } });
      const drifted = permissionEditor(await db.user.findUniqueOrThrow({ where: { id: drift }, include: { permissions: true } }));
      await assert.rejects(replacePermissions(db, drift, admin, [], drifted.permissionVersion), status(409));
      assert.equal(await db.userPermission.count({ where: { userId: drift } }), 0);
      await db.userPermissionOverride.deleteMany({ where: { userId: drift } });
    });

    process.env.PERMISSION_MODE = 'V1';
    await t.test('unconverted accounts block their V1 saves and role-default changes until conversion', async () => {
      const id = `${prefix}-unconverted`;
      ids.push(id);
      await db.user.create({ data: { id, name: id, email: `${id}@example.test`, password: 'unused', role: 'SALES_COORDINATOR' } });
      const userEditor = await getUserPermissionEditor(db, admin, id);
      assert.equal(userEditor.conversionStatus, 'REQUIRED');
      await assert.rejects(saveUserPermissions(db, admin, id, request(userEditor.expectedVersion, [])), status(409));
      const role = await getRolePermissionEditor(db, admin, 'SALES_COORDINATOR');
      await assert.rejects(saveRolePermissions(db, admin, 'SALES_COORDINATOR', request(role.expectedVersion, role.permissions as Parameters<typeof request>[1])), status(409));
      await convertPermissionAccount(db, id, admin);
      assert.equal((await getUserPermissionEditor(db, admin, id)).conversionStatus, 'CONVERTED');
    });
    await t.test('two simultaneous full replacements cannot lose updates; Deny and reset revoke/restore snapshots', async () => {
      const editor = await getUserPermissionEditor(db, admin, sales);
      const results = await Promise.allSettled([
        saveUserPermissions(db, admin, sales, request(editor.expectedVersion, deniedDashboard)),
        saveUserPermissions(db, admin, sales, request(editor.expectedVersion, [{ permissionKey: 'SCREEN:main:READ', effect: 'DENY' }, { permissionKey: 'SCREEN:main:WRITE', effect: 'DENY' }])),
      ]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.ok(results.some(r => r.status === 'rejected' && status(409)(r.reason)));
      const saved = await getUserPermissionEditor(db, admin, sales);
      assert.ok(!saved.snapshot.effectiveScreens.includes('dashboard') || !saved.snapshot.effectiveScreens.includes('main'));
      const reset = await saveUserPermissions(db, admin, sales, { contractVersion: 1, catalogVersion: 1, expectedVersion: saved.expectedVersion }, true);
      assert.deepEqual(reset.permissions, []);
      assert.ok(reset.snapshot.effectiveScreens.includes('dashboard'));
      assert.ok(BigInt(reset.authorizationRevision) > BigInt(editor.authorizationRevision));
      await assert.rejects(saveUserPermissions(db, admin, sales, request(editor.expectedVersion, [])), status(409));
    });

    await t.test('role defaults and change-back invalidate open editors and affect fresh snapshots', async () => {
      const staleUser = await getUserPermissionEditor(db, admin, sales);
      const before = await getRolePermissionEditor(db, admin, 'SALES_COORDINATOR');
      const nextRows = before.permissions.map(p => p.permissionKey === 'SCREEN:dashboard:READ' || p.permissionKey === 'SCREEN:dashboard:WRITE' ? { ...p, effect: 'DENY' as const } : p) as Parameters<typeof request>[1];
      const denied = await saveRolePermissions(db, admin, 'SALES_COORDINATOR', request(before.expectedVersion, nextRows));
      assert.ok(!(await loadEffectivePermissions(db, sales))!.effectiveScreens.includes('dashboard'));
      await assert.rejects(saveUserPermissions(db, admin, sales, request(staleUser.expectedVersion, [])), status(409));
      const restored = await saveRolePermissions(db, admin, 'SALES_COORDINATOR', request(denied.expectedVersion, before.permissions as Parameters<typeof request>[1]));
      assert.notEqual(restored.expectedVersion, before.expectedVersion);
      await assert.rejects(saveRolePermissions(db, admin, 'SALES_COORDINATOR', request(before.expectedVersion, nextRows)), status(409));
      await assert.rejects(saveUserPermissions(db, admin, sales, request(staleUser.expectedVersion, [])), status(409));
    });

    await t.test('a role default cannot silently invalidate an explicit Write exception', async () => {
      const user = await getUserPermissionEditor(db, admin, sales);
      const edited = await saveUserPermissions(db, admin, sales, request(user.expectedVersion, [{ permissionKey: 'SCREEN:deliveries:WRITE', effect: 'ALLOW' }]));
      const role = await getRolePermissionEditor(db, admin, 'SALES_COORDINATOR');
      const denied = role.permissions.map(p => ['SCREEN:deliveries:READ', 'SCREEN:deliveries:WRITE'].includes(p.permissionKey) ? { ...p, effect: 'DENY' as const } : p) as Parameters<typeof request>[1];
      await assert.rejects(saveRolePermissions(db, admin, 'SALES_COORDINATOR', request(role.expectedVersion, denied)), error => status(409)(error) && (error as PolicyManagementError).details !== undefined);
      assert.equal((await getRolePermissionEditor(db, admin, 'SALES_COORDINATOR')).expectedVersion, role.expectedVersion);
      await saveUserPermissions(db, admin, sales, { contractVersion: 1, catalogVersion: 1, expectedVersion: edited.expectedVersion }, true);
    });

    await t.test('role changes preserve allowed exceptions and require acknowledgement of removed exceptions', async () => {
      let editor = await getUserPermissionEditor(db, admin, sales);
      editor = await saveUserPermissions(db, admin, sales, request(editor.expectedVersion, [{ permissionKey: 'SCREEN:main:READ', effect: 'DENY' }, { permissionKey: 'SCREEN:main:WRITE', effect: 'DENY' }, { permissionKey: 'SCREEN:inventory:READ', effect: 'ALLOW' }]));
      const preview = await getUserPermissionEditor(db, admin, sales, 'DRIVER');
      // DENY exceptions remain harmless and explicitly stored even above a role ceiling.
      assert.deepEqual(preview.roleChange!.permissions, editor.permissions.filter(p => p.effect === 'DENY'));
      assert.deepEqual(preview.roleChange!.removedOverrides, [{ permissionKey: 'SCREEN:inventory:READ', effect: 'ALLOW' }]);
      const changeRole = () => mutateAdminAccount(db, admin, sales, { contractVersion: 1, expectedVersion: preview.expectedVersion }, async (tx, _actor, user) => {
        await assertAdminSurvives(tx, admin, user, 'DRIVER', true);
        return tx.user.update({ where: { id: sales }, data: { role: 'DRIVER' } });
      }, { role: 'DRIVER' });
      await assert.rejects(changeRole(), status(400));
      await mutateAdminAccount(db, admin, sales, { contractVersion: 1, expectedVersion: preview.expectedVersion }, async (tx, _actor, user) => {
        await assertAdminSurvives(tx, admin, user, 'DRIVER', true);
        return tx.user.update({ where: { id: sales }, data: { role: 'DRIVER' } });
      }, { role: 'DRIVER', removedOverrideKeys: ['SCREEN:inventory:READ'] });
      assert.equal((await loadEffectivePermissions(db, sales))!.role, 'DRIVER');
      const restore = await getUserPermissionEditor(db, admin, sales, 'SALES_COORDINATOR');
      await mutateAdminAccount(db, admin, sales, { contractVersion: 1, expectedVersion: restore.expectedVersion }, tx => tx.user.update({ where: { id: sales }, data: { role: 'SALES_COORDINATOR' } }), { role: 'SALES_COORDINATOR' });
      const final = await getUserPermissionEditor(db, admin, sales);
      await saveUserPermissions(db, admin, sales, { contractVersion: 1, catalogVersion: 1, expectedVersion: final.expectedVersion }, true);
    });

    await t.test('Driver unlink and inactive Microsoft identity changes invalidate account editors atomically', async () => {
      let editor = await getUserPermissionEditor(db, admin, driver);
      const profile = await mutateAdminAccount(db, admin, driver, { contractVersion: 1, expectedVersion: editor.expectedVersion }, (tx, actor, user) => linkDriverLogin(tx, user, undefined, actor));
      assert.ok(profile);
      const linked = await getUserPermissionEditor(db, admin, driver);
      assert.ok(BigInt(linked.authorizationRevision) > BigInt(editor.authorizationRevision));
      const preview = await getUserPermissionEditor(db, admin, driver, 'SALES_COORDINATOR');
      await mutateAdminAccount(db, admin, driver, { contractVersion: 1, expectedVersion: preview.expectedVersion }, async (tx, actor) => {
        await unlinkDriverLogin(tx, driver, actor);
        return tx.user.update({ where: { id: driver }, data: { role: 'SALES_COORDINATOR' } });
      }, { role: 'SALES_COORDINATOR' });
      assert.equal((await db.driver.findUniqueOrThrow({ where: { id: profile!.id } })).userId, null);
      editor = await getUserPermissionEditor(db, admin, driver);
      await mutateAdminAccount(db, admin, driver, { contractVersion: 1, expectedVersion: editor.expectedVersion }, tx => tx.user.update({ where: { id: driver }, data: { isActive: false } }));
      const inactive = await getUserPermissionEditor(db, admin, driver);
      await mutateAdminAccount(db, admin, driver, { contractVersion: 1, expectedVersion: inactive.expectedVersion }, tx => tx.user.update({ where: { id: driver }, data: { microsoftOid: randomUUID(), microsoftApprovedAt: new Date() } }), { identity: true });
      const changed = await getUserPermissionEditor(db, admin, driver);
      assert.equal(changed.snapshot.valid, false);
      assert.ok(BigInt(changed.authorizationRevision) > BigInt(inactive.authorizationRevision));
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: driver } })).isActive, false);
      await assert.rejects(saveUserPermissions(db, admin, driver, request(inactive.expectedVersion, [])), status(409));
    });

    await t.test('an audit failure rolls back permission rows and monotonic revisions', async () => {
      const editor = await getUserPermissionEditor(db, admin, sales);
      const countBefore = await db.auditLog.count({ where: { changedById: admin } });
      const failing = db.$extends({ query: { auditLog: { create() { throw new Error('injected audit failure'); } } } });
      await assert.rejects(saveUserPermissions(failing as unknown as PrismaClient, admin, sales, request(editor.expectedVersion, deniedDashboard)), /injected audit failure/);
      const after = await getUserPermissionEditor(db, admin, sales);
      assert.equal(after.expectedVersion, editor.expectedVersion);
      assert.deepEqual(after.permissions, editor.permissions);
      assert.equal(await db.auditLog.count({ where: { changedById: admin } }), countBefore);
    });

    await t.test('actor demotion while an admin save waits is rechecked after acquiring locks', async () => {
      const editor = await getUserPermissionEditor(db, admin, sales);
      let locked!: () => void, release!: () => void;
      const ready = new Promise<void>(resolve => { locked = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      const demotion = administrativeTransaction(db, admin2, admin, async (tx, _actor, user) => {
        await assertAdminSurvives(tx, admin2, user!, 'LOGISTICS', true);
        await tx.user.update({ where: { id: admin }, data: { role: 'LOGISTICS' } });
        locked(); await gate;
      });
      await ready;
      const pending = saveUserPermissions(db, admin, sales, request(editor.expectedVersion, deniedDashboard));
      release(); await demotion;
      await assert.rejects(pending, status(403));
      await db.user.update({ where: { id: admin }, data: { role: 'ADMIN' } });
      assert.deepEqual((await getUserPermissionEditor(db, admin, sales)).permissions, editor.permissions);
    });

    await t.test('competing administrators cannot both deactivate each other; self lockout is rejected', async () => {
      const one = await getUserPermissionEditor(db, admin, admin);
      await assert.rejects(mutateAdminAccount(db, admin, admin, { contractVersion: 1, expectedVersion: one.expectedVersion }, (tx, actor, user) => assertAdminSurvives(tx, actor.id, user, 'ADMIN', false)), status(400));
      const a = await getUserPermissionEditor(db, admin, admin2), b = await getUserPermissionEditor(db, admin2, admin);
      const deactivate = (actor: string, target: string, version: string) => mutateAdminAccount(db, actor, target, { contractVersion: 1, expectedVersion: version }, async (tx, currentActor, user) => {
        await assertAdminSurvives(tx, currentActor.id, user, user.role, false);
        return tx.user.update({ where: { id: target }, data: { isActive: false } });
      });
      const results = await Promise.allSettled([deactivate(admin, admin2, a.expectedVersion), deactivate(admin2, admin, b.expectedVersion)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.ok(results.some(r => r.status === 'rejected' && status(403)(r.reason)));
      assert.equal(await db.user.count({ where: { id: { in: [admin, admin2] }, role: 'ADMIN', isActive: true } }), 1);
      await db.user.updateMany({ where: { id: { in: [admin, admin2] } }, data: { isActive: true } });
    });
  } finally {
    process.env.PERMISSION_MODE = 'LEGACY';
    // Restore only the role this suite changed, then remove only its UUID-owned fixtures.
    if (salesBaseline) for (const p of salesBaseline.permissions) await db.rolePermission.update({ where: { role_permissionKey: { role: 'SALES_COORDINATOR', permissionKey: p.permissionKey } }, data: { effect: p.effect as 'ALLOW' | 'DENY' } });
    await db.auditLog.deleteMany({ where: { changedById: { in: ids } } });
    await db.permissionQuarantine.deleteMany({ where: { userId: { in: ids } } });
    await db.driver.deleteMany({ where: { createdBy: { in: ids } } });
    await db.userPermission.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    if (oldMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = oldMode;
    await db.$disconnect(); await pool.end();
  }
});
