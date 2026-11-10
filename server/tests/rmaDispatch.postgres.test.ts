import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { initializePermissionFoundation } from '../src/services/permissionBackfill';
import { provisionRmaDispatchPermissions, RMA_DISPATCH_GRANTS } from '../src/services/rmaDispatchPermissions';
import { PERMISSION_CATALOG } from '../src/services/permissionCatalog';
import { hasActionPermission, loadEffectivePermissions } from '../src/services/permissionEvaluator';
import { sessionUser } from '../src/services/permissions';
import { notificationVisibility } from '../src/services/notificationVisibility';
import { recordScope } from '../src/services/recordAccess';
import type { AuthUser } from '../src/middleware/auth';

const connectionString = process.env.RMA_DISPATCH_TEST_DATABASE_URL;

test('PostgreSQL activation respects trigger revisions, customized policies, user Deny and reassigned notification access', { skip: !connectionString, timeout: 60000 }, async () => {
  const source = new URL(connectionString!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname));
  assert.match(source.pathname, /^\/sc255_[a-z0-9_]+_test$/);
  // This suite owns a separate database. It never changes the browser fixtures
  // or shares policy mutations with another test process.
  const database = `sc255_policy_${randomUUID().replaceAll('-', '')}_test`;
  const pool = new Pool({ connectionString });
  const target = new URL(source); target.pathname = `/${database}`;
  let db: PrismaClient | undefined;
  let targetPool: Pool | undefined;
  try {
    await pool.query(`CREATE DATABASE "${database}"`);
    await promisify(execFile)(process.execPath, [path.resolve('../node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: target.toString() },
    });
    targetPool = new Pool({ connectionString: target.toString() });
    db = new PrismaClient({ adapter: new PrismaPg(targetPool) });
    for (const [id, role] of [['admin', 'ADMIN'], ['logistics', 'LOGISTICS'], ['driver-a', 'DRIVER'], ['driver-b', 'DRIVER']]) await db.user.create({ data: { id, name: id, email: `${id}@example.test`, password: 'not-used', role } });
    await initializePermissionFoundation(db, 'admin');
    const baseline = await db.rolePolicy.findUniqueOrThrow({ where: { role: 'LOGISTICS' } });
    assert.equal(baseline.revision, BigInt(PERMISSION_CATALOG.length + 1), 'catalog row insertion triggers advance the baseline revision');
    await db.userPermissionOverride.create({ data: { userId: 'logistics', permissionKey: 'CATEGORY:RMA:READ', effect: 'DENY' } });
    assert.deepEqual(await provisionRmaDispatchPermissions(db, 'admin'), { upgraded: ['LOGISTICS', 'DRIVER'], skipped: [] });
    const snapshot = (await loadEffectivePermissions(db, 'logistics'))!;
    assert.equal(hasActionPermission(snapshot, 'CATEGORY', 'RMA', 'READ'), false);
    assert.equal(hasActionPermission(snapshot, 'CATEGORY', 'RMA', 'ASSIGN'), false, 'an operation grant cannot bypass an individual Read Deny');
    const auditCount = await db.auditLog.count();
    assert.deepEqual(await provisionRmaDispatchPermissions(db, 'admin'), { upgraded: [], skipped: [] });
    assert.equal(await db.auditLog.count(), auditCount, 'repeat activation is idempotent');

    for (const id of ['driver-a', 'driver-b']) await db.driver.create({ data: { id: `profile-${id}`, name: id, type: 'DRIVER', userId: id, createdBy: 'admin', modifiedBy: 'admin' } });
    await db.company.create({ data: { id: 'company', name: 'Company', normalizedName: 'company', sapNumber: '255', address: 'Carmona', contactPerson: 'Test contact' } });
    const record = await db.deliveryRecord.create({ data: { id: 'rma', companyId: 'company', priority: '2 - Moderate', reference: '', rmaReference: 'POL-255', status: 'SCHEDULED', area: 'Carmona', accountManager: 'AM', deliveryDate: '2020-01-01', category: 'RMA', itemType: 'Unit', driverId: 'profile-driver-a', driver: 'driver-a', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'PENDING', createdById: 'admin', modifiedById: 'admin' } });
    await db.notification.createMany({ data: ['logistics', 'driver-a', 'driver-b'].map(userId => ({ userId, title: 'RMA assignment', message: 'POL-255', recordId: record.id, recordType: 'DeliveryRecord' })) });
    const auth = async (id: string): Promise<AuthUser> => {
      const user = await db!.user.findUniqueOrThrow({ where: { id }, include: { permissions: true } });
      const rmaPermissions = await loadEffectivePermissions(db!, id);
      return { ...sessionUser(user), rmaPermissions, driverProfileId: rmaPermissions?.driverProfileId } as AuthUser;
    };
    const visibleNotifications = async (id: string) => db!.$queryRaw<Array<{ id: string }>>`SELECT n."id" FROM "Notification" n LEFT JOIN "DeliveryRecord" r ON n."recordType" = 'DeliveryRecord' AND r."id" = n."recordId" WHERE n."userId" = ${id} AND ${notificationVisibility(await auth(id))}`;
    assert.equal((await visibleNotifications('logistics')).length, 0, 'old notification contents disappear after a category Deny');
    assert.equal((await visibleNotifications('driver-a')).length, 1);
    assert.equal((await visibleNotifications('driver-b')).length, 0);
    await db.deliveryRecord.update({ where: { id: 'rma' }, data: { driverId: 'profile-driver-b', driver: 'driver-b' } });
    assert.equal((await visibleNotifications('driver-a')).length, 0, 'previous Driver loses historical notification access');
    assert.equal((await visibleNotifications('driver-b')).length, 1);
    assert.equal(await db.deliveryRecord.count({ where: { AND: [recordScope(await auth('driver-a'))] } }), 0);
    assert.equal(await db.deliveryRecord.count({ where: { AND: [recordScope(await auth('driver-b'))] } }), 1);

    // A customized role changed back to baseline is still customized. The
    // revision prevents activation from erasing that intentional denial.
    for (const permissionKey of RMA_DISPATCH_GRANTS.DRIVER!) await db.rolePermission.update({ where: { role_permissionKey: { role: 'DRIVER', permissionKey } }, data: { effect: 'DENY' } });
    assert.deepEqual(await provisionRmaDispatchPermissions(db, 'admin'), { upgraded: [], skipped: ['DRIVER'] });
    assert.equal((await db.rolePermission.findUniqueOrThrow({ where: { role_permissionKey: { role: 'DRIVER', permissionKey: 'CATEGORY:RMA:READ' } } })).effect, 'DENY');
  } finally {
    await db?.$disconnect(); await targetPool?.end();
    await pool.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await pool.end();
  }
});
