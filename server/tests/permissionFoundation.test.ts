import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { AuthUser } from '../src/middleware/auth';
import { permissionSnapshot, ROLE_DEFAULTS, SCREEN_LABELS, RESOURCE_SCREENS } from '../src/services/permissions';
import { readableCategories, recordScope } from '../src/services/recordAccess';
import { screenRestricted } from '../src/services/moduleAccessRules';
import { assertPermissionBackfillTarget, convertPermissionAccount, initializePermissionFoundation, planPermissionConversion } from '../src/services/permissionBackfill';
import { PERMISSION_CATALOG, POLICY_ROLES, POLICY_SCREENS, POLICY_CATEGORIES, defaultRolePermissions, LEGACY_POLICY_DEFAULT_SCREENS, legacyCapabilities, legacyPolicyScreens, policyKey, roleActionCeiling, type LegacyGrant, type PolicyRole } from '../src/services/permissionCatalog';

const account = (role: string, permissions: LegacyGrant[] = []) => ({ id: 'fixture-account', role, permissions });
const grant = (screen: string, granted: boolean): LegacyGrant => ({ id: `${screen}:${granted}`, screen, granted });
const value = (role: PolicyRole, key: string) => defaultRolePermissions(role).get(key);

test('frozen migration catalog detects legacy default/catalog drift before a future handoff', () => {
  assert.deepEqual(POLICY_SCREENS, Object.keys(SCREEN_LABELS));
  assert.deepEqual(LEGACY_POLICY_DEFAULT_SCREENS, ROLE_DEFAULTS);
  assert.deepEqual(PERMISSION_CATALOG.filter(p => p.scope === 'RESOURCE' && p.action === 'READ').map(p => p.module), Object.keys(RESOURCE_SCREENS));
});

test('five role baselines preserve operation-specific ceilings and revised RMA boundaries', () => {
  for (const role of POLICY_ROLES) {
    const defaults = defaultRolePermissions(role);
    assert.equal(defaults.size, PERMISSION_CATALOG.length);
    assert.equal(planPermissionConversion(account(role)).overrides.length, 0, 'absent is Inherit');
    for (const p of PERMISSION_CATALOG) if (defaults.get(p.key) === 'ALLOW') {
      assert.equal(roleActionCeiling(role, p), true, `${role} ${p.key}`);
      if (p.action !== 'READ') assert.equal(defaults.get(policyKey(p.scope, p.module, 'READ')), 'ALLOW', 'Write requires Read');
      if (!['READ', 'WRITE'].includes(p.action)) assert.equal(defaults.get(policyKey(p.scope, p.module, 'WRITE')), 'ALLOW');
    }
    for (const c of POLICY_CATEGORIES) assert.equal(value(role, policyKey('CATEGORY', c, 'DELETE')), 'DENY');
    assert.equal(value(role, 'CATEGORY:ACCOUNTING_COLLECTION:VERIFY_COLLECTION'), role === 'TASS' ? 'ALLOW' : 'DENY');
  }
  assert.equal(value('LOGISTICS', 'CATEGORY:DELIVERY:CREATE'), 'DENY');
  for (const action of ['CREATE', 'UPDATE', 'STATUS', 'POD', 'COMPLETE', 'RECEIVE', 'ASSIGN']) assert.equal(value('LOGISTICS', `CATEGORY:RMA:${action}`), 'DENY');
  assert.equal(roleActionCeiling('LOGISTICS', PERMISSION_CATALOG.find(p => p.key === 'CATEGORY:RMA:ASSIGN')!), true, 'approved ceiling does not activate a new legacy grant');
  assert.equal(roleActionCeiling('LOGISTICS', PERMISSION_CATALOG.find(p => p.key === 'SCREEN:rma:WRITE')!), true);
  assert.equal(value('LOGISTICS', 'SCREEN:rma:WRITE'), 'DENY');
  assert.equal(value('ADMIN', 'CATEGORY:RMA:RECEIVE'), 'DENY');
  assert.equal(value('ADMIN', 'CATEGORY:RMA:COMPLETE'), 'DENY');
  assert.equal(value('ADMIN', 'CATEGORY:RMA:ASSIGN'), 'ALLOW');
  assert.equal(value('TASS', 'CATEGORY:ACCOUNTING_COLLECTION:CREATE'), 'ALLOW', 'existing POST route exception');
  assert.equal(value('TASS', 'CATEGORY:ACCOUNTING_COLLECTION:UPDATE'), 'DENY');
  assert.equal(value('TASS', 'CATEGORY:PROCUREMENT_PICKUP:READ'), 'DENY');
  assert.equal(value('TASS', 'RESOURCE:suppliers:READ'), 'ALLOW');
  assert.equal(value('TASS', 'RESOURCE:suppliers:CREATE'), 'DENY');
  assert.equal(value('SALES_COORDINATOR', 'CATEGORY:RMA:READ'), 'DENY');
  assert.equal(value('LOGISTICS', 'RESOURCE:skus:READ'), 'ALLOW');
  assert.equal(value('LOGISTICS', 'RESOURCE:skus:ADJUST'), 'DENY', 'lookup does not imply SKU Master adjustment');
});

test('conversion matches independent legacy navigation/category oracle for 4005 single/pair fixtures', () => {
  let count = 0;
  for (const role of POLICY_ROLES) {
    const singles = POLICY_SCREENS.flatMap(s => [grant(s, true), grant(s, false)]);
    const cases: LegacyGrant[][] = [[], ...singles.map(p => [p])];
    for (let i = 0; i < singles.length; i++) for (let j = i + 1; j < singles.length; j++) if (singles[i].screen !== singles[j].screen) cases.push([singles[i], singles[j]]);
    for (const permissions of cases) {
      const snapshot = permissionSnapshot(role, permissions);
      const legacy = legacyCapabilities(role, legacyPolicyScreens(role, permissions), permissions);
      const plan = planPermissionConversion(account(role, permissions));
      const restored = defaultRolePermissions(role);
      for (const p of plan.overrides) restored.set(p.permissionKey, p.effect);
      assert.deepEqual(restored, legacy);
      // Stored baselines are frozen; module rules (TASS has no Procurement Pick-up) apply on top.
      assert.deepEqual(POLICY_SCREENS.filter(s => restored.get(policyKey('SCREEN', s, 'READ')) === 'ALLOW' && !screenRestricted(role, s)), snapshot.effectiveScreens);
      const categories = readableCategories({ ...snapshot, id: 'test', name: 'Fixture', email: 'fixture@example.test', role } as AuthUser);
      assert.deepEqual(POLICY_CATEGORIES.filter(c => restored.get(policyKey('CATEGORY', c, 'READ')) === 'ALLOW'), categories);
      for (const p of PERMISSION_CATALOG) if (restored.get(p.key) === 'ALLOW') assert.equal(roleActionCeiling(role, p), true, `${role} ${p.key}`);
      count++;
    }
  }
  assert.equal(count, 4005);
});

test('explicit equal-to-default overrides survive; protected entries quarantine; aggregate reads do not grant screens', () => {
  const plan = planPermissionConversion(account('TASS', [grant('rma', true), grant('inventory', false), grant('admin', true), grant('unknown', false)]));
  assert.equal(plan.overrides.find(p => p.permissionKey === 'SCREEN:rma:READ')?.effect, 'ALLOW');
  assert.equal(plan.overrides.find(p => p.permissionKey === 'SCREEN:inventory:READ')?.effect, 'DENY');
  assert.equal(plan.quarantine.length, 2);
  assert.ok(!plan.overrides.some(p => p.permissionKey.startsWith('SCREEN:admin')));
  const withoutCategoryScreen = planPermissionConversion(account('ADMIN', [grant('deliveries', false)]));
  assert.equal(withoutCategoryScreen.overrides.find(p => p.permissionKey === 'CATEGORY:DELIVERY:READ')?.effect, 'DENY');
  assert.equal(value('LOGISTICS', 'CATEGORY:SALES_ORDERS:READ'), 'ALLOW');
  const aggregateOnly = planPermissionConversion(account('SALES_COORDINATOR', [grant('calendar', true)]));
  assert.ok(!aggregateOnly.overrides.some(p => p.permissionKey === 'SCREEN:rma:READ'));
  const tass = legacyCapabilities('TASS', ['main'], []);
  assert.equal(tass.get('CATEGORY:ACCOUNTING_COLLECTION:READ'), 'ALLOW');
  assert.equal(tass.get('CATEGORY:ACCOUNTING_COLLECTION:VERIFY_COLLECTION'), 'DENY');
});

test('Driver policy never fabricates a profile or assignment for linked/unlinked accounts', () => {
  const linked = { ...account('DRIVER'), driverProfile: { id: 'profile-one', type: 'DRIVER', isActive: true } };
  const unlinked = account('DRIVER');
  assert.deepEqual(planPermissionConversion(linked).overrides, planPermissionConversion(unlinked).overrides);
  assert.equal(planPermissionConversion(linked).report.driverLinked, true);
  assert.equal(planPermissionConversion(unlinked).report.driverLinked, false);
  const session = { ...permissionSnapshot('DRIVER', []), id: 'driver', name: 'Fixture', email: 'fixture@example.test', role: 'DRIVER' } as AuthUser;
  assert.deepEqual((recordScope(session) as any).id, { in: [] });
  assert.equal((recordScope({ ...session, driverProfileId: 'profile-one' }) as any).driverId, 'profile-one');
  const protectedDenial = planPermissionConversion(account('DRIVER', [grant('deliveries', false)]));
  assert.equal(protectedDenial.overrides.find(p => p.permissionKey === 'CATEGORY:DELIVERY:READ')?.effect, 'DENY');
  assert.equal(protectedDenial.quarantine[0].reason, 'PROTECTED_SCREEN_CATEGORY_DENIAL_PRESERVED');
});

test('backfill target validation rejects unknown, deployed and query-overridden connections', () => {
  const env = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://issue243@127.0.0.1:55443/supply_chain_243_test', PERMISSION_BACKFILL_DATABASE: 'supply_chain_243_test' };
  assert.doesNotThrow(() => assertPermissionBackfillTarget(env));
  for (const change of [{ DATABASE_URL: '' }, { NODE_ENV: 'production' }, { APP_ENV: 'production' }, { APP_ENV: 'staging' }, { RENDER: 'true' }, { CI: 'true' }, { PERMISSION_BACKFILL_DATABASE: 'different_test' }, { DATABASE_URL: 'postgresql://user@prod.example.com/supply_chain_243_test' }, ...['host', 'hostaddr', 'user', 'username', 'database', 'dbname', 'db', 'port', 'options'].map(key => ({ DATABASE_URL: `${env.DATABASE_URL}?${key}=unexpected` }))]) assert.throws(() => assertPermissionBackfillTarget({ ...env, ...change }));
  assert.throws(() => planPermissionConversion(account('UNKNOWN')));
});

const databaseUrl = process.env.PERMISSION_TEST_DATABASE_URL;
test('designated PostgreSQL: additive/idempotent conversion, constraints, atomic retry and monotonic revisions', { skip: !databaseUrl }, async () => {
  const database = new URL(databaseUrl!).pathname.slice(1);
  assertPermissionBackfillTarget({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, PERMISSION_BACKFILL_DATABASE: database });
  const pool = new Pool({ connectionString: databaseUrl });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  const prefix = `permission-fixture-${randomUUID()}`;
  const operatorId = `${prefix}-operator`;
  try {
    await db.user.create({ data: { id: operatorId, name: 'Fixture operator', email: `${operatorId}@example.test`, password: 'not-a-login', role: 'ADMIN' } });
    await initializePermissionFoundation(db, operatorId);
    const fixtures = POLICY_ROLES.flatMap((role, i) => [
      { role, name: `${role}-absent`, permissions: [] },
      { role, name: `${role}-explicit`, permissions: [grant(role === 'DRIVER' ? 'driver_dashboard' : 'inventory', i % 2 === 0), grant('deliveries', false), grant('unknown', true), grant('admin', false)] },
    ]);
    fixtures.push({ role: 'DRIVER', name: 'DRIVER-linked', permissions: [grant('driver_dashboard', true)] });
    const ids: string[] = [];
    for (const f of fixtures) {
      const id = `${prefix}-${f.name}`;
      ids.push(id);
      await db.user.create({ data: { id, name: f.name, email: `${id}@example.test`, password: 'not-a-login', role: f.role, permissions: { create: f.permissions.map((p, i) => ({ id: `${id}-grant-${i}`, screen: p.screen, granted: p.granted })) } } });
      if (f.name === 'DRIVER-linked') await db.driver.create({ data: { name: 'Fixture profile', userId: id, type: 'DRIVER', createdBy: 'Fixture', modifiedBy: 'Fixture' } });
    }
    const oldRows = await db.userPermission.findMany({ where: { userId: { in: ids } }, orderBy: { id: 'asc' } });
    const oldAudit = await db.auditLog.create({ data: { recordId: prefix, recordType: 'LegacyFixture', action: 'CREATE', changedById: operatorId, newValue: '{"preserve":true}' } });
    for (const id of ids) assert.equal(await convertPermissionAccount(db, id, operatorId), 'converted');
    const snapshot = async () => JSON.stringify({
      policies: await db.rolePolicy.findMany({ orderBy: { role: 'asc' }, include: { permissions: { orderBy: { permissionKey: 'asc' } } } }),
      users: await db.user.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, select: { id: true, authorizationRevision: true, permissionOverrides: { orderBy: { permissionKey: 'asc' } }, permissionConversion: true } }),
      quarantine: await db.permissionQuarantine.findMany({ where: { userId: { in: ids } }, orderBy: { legacyId: 'asc' } }),
      audits: await db.auditLog.findMany({ where: { recordId: { in: [...ids, prefix] } }, orderBy: { id: 'asc' } }),
    }, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
    const beforeRetry = await snapshot();
    await initializePermissionFoundation(db, operatorId);
    for (const id of ids) assert.equal(await convertPermissionAccount(db, id, operatorId), 'unchanged');
    assert.equal(await snapshot(), beforeRetry, 'retry changes no policy rows/revisions/checkpoints/audits/timestamps');
    assert.deepEqual(await db.userPermission.findMany({ where: { userId: { in: ids } }, orderBy: { id: 'asc' } }), oldRows);
    assert.deepEqual(await db.auditLog.findUnique({ where: { id: oldAudit.id } }), oldAudit);
    assert.equal(await db.rolePermission.count(), POLICY_ROLES.length * PERMISSION_CATALOG.length);
    const changedId = ids.find(id => id.endsWith('LOGISTICS-explicit'))!;
    await db.userPermission.updateMany({ where: { userId: changedId, screen: 'deliveries' }, data: { granted: true } });
    await assert.rejects(convertPermissionAccount(db, changedId, operatorId), /source changed/);
    await assert.rejects(convertPermissionAccount(db, ids[0], ids[0]), /active Admin/);

    const target = ids[0];
    let rev = (await db.user.findUniqueOrThrow({ where: { id: target } })).authorizationRevision;
    await db.user.update({ where: { id: target }, data: { isActive: false } });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: target } })).authorizationRevision, rev + 1n);
    await assert.rejects(db.user.update({ where: { id: target }, data: { authorizationRevision: rev - 1n } }), /revision cannot decrease/);
    rev = (await db.user.findUniqueOrThrow({ where: { id: target } })).authorizationRevision;
    await db.user.update({ where: { id: target }, data: { role: 'LOGISTICS' } });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: target } })).authorizationRevision, rev + 1n);
    const linkedUserId = ids.find(id => id.endsWith('DRIVER-linked'))!;
    const linkedRevision = (await db.user.findUniqueOrThrow({ where: { id: linkedUserId } })).authorizationRevision;
    await db.driver.update({ where: { userId: linkedUserId }, data: { userId: null } });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: linkedUserId } })).authorizationRevision, linkedRevision + 1n);
    const overrideData = { userId: operatorId, permissionKey: 'SCREEN:main:READ', effect: 'ALLOW' as const };
    rev = (await db.user.findUniqueOrThrow({ where: { id: operatorId } })).authorizationRevision;
    await db.userPermissionOverride.create({ data: overrideData });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: operatorId } })).authorizationRevision, rev + 1n);
    await assert.rejects(db.userPermissionOverride.create({ data: overrideData }));
    await db.userPermissionOverride.update({ where: { userId_permissionKey: { userId: operatorId, permissionKey: overrideData.permissionKey } }, data: { effect: 'DENY' } });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: operatorId } })).authorizationRevision, rev + 2n);
    await db.userPermissionOverride.delete({ where: { userId_permissionKey: { userId: operatorId, permissionKey: overrideData.permissionKey } } });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: operatorId } })).authorizationRevision, rev + 3n);
    const p = await db.rolePermission.findUniqueOrThrow({ where: { role_permissionKey: { role: 'LOGISTICS', permissionKey: 'SCREEN:main:READ' } } });
    await assert.rejects(db.rolePermission.create({ data: { role: p.role, permissionKey: p.permissionKey, effect: p.effect } }));
    const roleRev = (await db.rolePolicy.findUniqueOrThrow({ where: { role: 'LOGISTICS' } })).revision;
    await db.rolePermission.update({ where: { role_permissionKey: { role: p.role, permissionKey: p.permissionKey } }, data: { effect: 'DENY' } });
    assert.equal((await db.rolePolicy.findUniqueOrThrow({ where: { role: p.role } })).revision, roleRev + 1n);
    await assert.rejects(db.rolePolicy.update({ where: { role: p.role }, data: { revision: roleRev } }), /revision cannot decrease/);
    await db.rolePermission.update({ where: { role_permissionKey: { role: p.role, permissionKey: p.permissionKey } }, data: { effect: p.effect } });
    await assert.rejects(db.permissionDefinition.create({ data: { key: 'SCREEN:invented:READ', scope: 'SCREEN', module: 'invented', action: 'READ' } }));
    await assert.rejects(db.userPermissionOverride.create({ data: { userId: target, permissionKey: 'unknown', effect: 'ALLOW' } }));
    await assert.rejects(db.$executeRaw`INSERT INTO "UserPermissionOverride" ("userId", "permissionKey", effect, "updatedAt") VALUES (${target}, 'SCREEN:main:READ', 'INHERIT', NOW())`);
    await assert.rejects(db.rolePolicy.create({ data: { role: 'CUSTOM' } }));

    const failedId = `${prefix}-retry`;
    await db.user.create({ data: { id: failedId, name: 'Retry fixture', email: `${failedId}@example.test`, password: 'not-a-login', role: 'LOGISTICS', permissions: { create: { screen: 'inventory', granted: true } } } });
    const beforeFailure = (await db.user.findUniqueOrThrow({ where: { id: failedId } })).authorizationRevision;
    await db.$executeRawUnsafe(`CREATE FUNCTION permission_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture checkpoint failure'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER permission_fixture_failure BEFORE INSERT ON "PermissionConversion" FOR EACH ROW EXECUTE FUNCTION permission_fixture_failure()`);
    try { await assert.rejects(convertPermissionAccount(db, failedId, operatorId), /fixture checkpoint failure/); }
    finally { await db.$executeRawUnsafe('DROP TRIGGER permission_fixture_failure ON "PermissionConversion"'); await db.$executeRawUnsafe('DROP FUNCTION permission_fixture_failure()'); }
    assert.equal(await db.userPermissionOverride.count({ where: { userId: failedId } }), 0);
    assert.equal(await db.permissionConversion.count({ where: { userId: failedId } }), 0);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: failedId } })).authorizationRevision, beforeFailure);
    assert.equal(await convertPermissionAccount(db, failedId, operatorId), 'converted');
  } finally { await db.$disconnect(); await pool.end(); }
});
