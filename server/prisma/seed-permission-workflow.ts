import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { assertPermissionBackfillTarget, convertPermissionAccount, initializePermissionFoundation } from '../src/services/permissionBackfill';
import { getUserPermissionEditor, saveUserPermissions } from '../src/services/permissionManagement';
import { PERMISSION_CATALOG } from '../src/services/permissionCatalog';

/** Synthetic live-browser fixture. Refuses non-disposable or populated targets. */
async function main() {
  const url = process.env.PERMISSION_LIVE_DATABASE_URL;
  if (!url) throw new Error('Explicit PERMISSION_LIVE_DATABASE_URL is required');
  const database = new URL(url).pathname.slice(1);
  assertPermissionBackfillTarget({ DATABASE_URL: url, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: database });
  if (database !== 'gh250_live_test') throw new Error('Use the dedicated empty gh250_live_test database');
  const pool = new Pool({ connectionString: url });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  const oldMode = process.env.PERMISSION_MODE;
  try {
    if (await db.user.count() || await db.company.count()) throw new Error('Live fixture refuses a populated database');
    const password = await bcrypt.hash('GH250-synthetic-local-only', 10);
    const accounts = [
      ['admin', 'ADMIN'], ['admin2', 'ADMIN'], ['logistics', 'LOGISTICS'],
      ['sales', 'SALES_COORDINATOR'], ['tass', 'TASS'], ['driver', 'DRIVER'], ['noaccess', 'SALES_COORDINATOR'],
    ];
    for (const [name, role] of accounts) await db.user.create({ data: {
      id: `gh250-live-${name}`, name: `GH250 ${name}`, email: `${name}@gh250.invalid`, password, role,
    } });
    await db.driver.create({ data: { id: 'gh250-live-driver-profile', name: 'GH250 Driver', type: 'DRIVER', userId: 'gh250-live-driver', createdBy: 'GH250 fixture', modifiedBy: 'GH250 fixture' } });
    process.env.PERMISSION_MODE = 'LEGACY';
    await initializePermissionFoundation(db, 'gh250-live-admin');
    for (const [name] of accounts) await convertPermissionAccount(db, `gh250-live-${name}`, 'gh250-live-admin');
    const company = await db.company.create({ data: { id: 'gh250-live-company', name: 'GH250 Synthetic Company', sapNumber: 'GH250', address: 'Synthetic local fixture', contactPerson: 'Fixture' } });
    await db.deliveryRecord.create({ data: { id: 'gh250-live-record', companyId: company.id, priority: '2 - Moderate', reference: 'GH250-LIVE-DELIVERY', status: 'SCHEDULED',
      area: 'Carmona', accountManager: 'GH250 sales', deliveryDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()),
      category: 'DELIVERY', itemType: 'Small Item', createdById: 'gh250-live-sales', modifiedById: 'gh250-live-sales',
      driverId: 'gh250-live-driver-profile', driver: 'GH250 Driver', vehicle: 'Synthetic van' } });
    process.env.PERMISSION_MODE = 'V1';
    const noAccess = await getUserPermissionEditor(db, 'gh250-live-admin', 'gh250-live-noaccess');
    await saveUserPermissions(db, 'gh250-live-admin', 'gh250-live-noaccess', { contractVersion: 1, catalogVersion: 1, expectedVersion: noAccess.expectedVersion,
      permissions: PERMISSION_CATALOG.map(row => ({ permissionKey: row.key, effect: 'DENY' })) });
    console.log('Created seven synthetic accounts and one assigned Delivery in the isolated live-test database.');
  } finally {
    await db.$disconnect(); await pool.end();
    if (oldMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = oldMode;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
