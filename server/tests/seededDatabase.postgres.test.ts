import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { once } from 'node:events';
import { prisma } from '../src/db';
import { USERS } from '../prisma/seeds/users';
import { assertPermissionBackfillTarget, convertPermissionAccount } from '../src/services/permissionBackfill';
import { applySecurity } from '../src/middleware/security';
import auth from '../src/routes/auth';
import records from '../src/routes/records';
import users from '../src/routes/users';
import companies from '../src/routes/companies';
import customers from '../src/routes/customers';
import suppliers from '../src/routes/suppliers';
import drivers from '../src/routes/drivers';
import skus from '../src/routes/skus';
import dashboard from '../src/routes/dashboard';
import transactions from '../src/routes/transactions';
import reports from '../src/routes/reports';
import notifications from '../src/routes/notifications';
import admin from '../src/routes/admin';
import sampler from '../src/routes/data-sampler';
import { manilaToday } from '../src/services/deliveryLifecycle';

const target = process.env.SEED_TEST_DATABASE_URL;
const staff = ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS'];
// Expected business access, deliberately independent of the permission evaluator.
const reads: Array<[string, readonly string[]]> = [
  ['/auth/me', [...staff, 'DRIVER']], ['/records', [...staff, 'DRIVER']],
  ['/companies', [...staff, 'DRIVER']], ['/drivers', [...staff, 'DRIVER']],
  ['/customers', ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS']],
  ['/suppliers', staff], ['/skus', staff], // Transaction Center grants lookup, not stock adjustment.
  ['/dashboard/stats', staff], ['/transactions', [...staff, 'DRIVER']],
  ['/notifications', [...staff, 'DRIVER']], ['/notifications/unread-count', [...staff, 'DRIVER']],
  ['/users', ['ADMIN']], ['/admin/audit-log', ['ADMIN']],
  ['/reports/summary', ['ADMIN', 'LOGISTICS']], ['/data-sampler/counts', ['ADMIN']],
];

test('UAT seed accounts exercise real PostgreSQL API reads and session boundaries', { skip: !target, timeout: 120_000 }, async t => {
  assert.equal(process.env.DATABASE_URL, target, 'The app and test must use the same explicit disposable database');
  const database = new URL(target!).pathname.slice(1);
  assertPermissionBackfillTarget({ DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: database });
  assert.equal(process.env.POD_STORAGE_PROVIDER, 'local');
  const oldMode = process.env.PERMISSION_MODE;
  const app = express();
  app.use(express.json(), cookieParser());
  applySecurity(app);
  for (const [prefix, router] of Object.entries({ auth, records, users, companies, customers, suppliers, drivers, skus, dashboard, transactions, reports, notifications, admin, 'data-sampler': sampler })) {
    app.use(`/api/v1/${prefix}`, router);
  }
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'Unexpected seeded API failure' });
  });
  const listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const request = (route: string, cookie?: string, init: RequestInit = {}) => fetch(`${base}${route}`, {
    ...init, signal: AbortSignal.timeout(10_000), headers: { ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  });
  async function login(seed: typeof USERS[number]) {
    const response = await request('/auth/login', undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: seed.email, password: seed.password }) });
    assert.equal(response.status, 200, `${seed.role} seed login`);
    const body = await response.json();
    assert.equal(body.role, seed.role);
    assert.equal(body.password, undefined);
    assert.equal(body.token, undefined);
    const header = response.headers.get('set-cookie');
    assert.ok(header?.includes('HttpOnly'));
    return header!.split(';')[0];
  }
  async function write(route: string, cookie: string, body: unknown, method = 'POST') {
    const session = await request('/auth/me', cookie);
    const csrf = session.headers.get('x-csrf-token');
    assert.ok(csrf);
    return request(route, cookie, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
  }
  try {
    await t.test('seed prerequisites include five users, business directories, Driver ownership and persisted POD', async () => {
      for (const seed of USERS) {
        const account = await prisma.user.findUniqueOrThrow({ where: { email: seed.email } });
        assert.equal(account.role, seed.role);
        assert.equal(account.isActive, true);
      }
      assert.ok(await prisma.company.count() > 0);
      assert.ok(await prisma.customer.count() > 0);
      assert.ok(await prisma.supplier.count() > 0);
      const driver = await prisma.user.findUniqueOrThrow({ where: { email: USERS.find(u => u.role === 'DRIVER')!.email }, include: { driverProfile: true } });
      assert.ok(driver.driverProfile?.isActive);
      assert.ok(await prisma.deliveryRecord.count({ where: { driverId: driver.driverProfile!.id, draft: false } }) > 0);
      assert.ok(await prisma.podAttachment.count() > 0, 'UAT includes a completed record with stored proof');
    });
    await t.test('anonymous business reads and invalid password login fail', async () => {
      assert.equal((await request('/users')).status, 401);
      assert.equal((await request('/records')).status, 401);
      assert.equal((await request('/auth/login', undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: USERS[0].email, password: 'incorrect-seeded-password' }) })).status, 401);
    });
    for (const mode of ['LEGACY', 'V1'] as const) {
      process.env.PERMISSION_MODE = mode;
      if (mode === 'V1') {
        const operator = await prisma.user.findUniqueOrThrow({ where: { email: USERS.find(u => u.role === 'ADMIN')!.email } });
        for (const seed of USERS) {
          const account = await prisma.user.findUniqueOrThrow({ where: { email: seed.email } });
          await convertPermissionAccount(prisma, account.id, operator.id);
        }
      }
      for (const seed of USERS) await t.test(`${mode}: ${seed.role} seed login, directories, scoped records and forbidden modules`, async () => {
        const cookie = await login(seed);
        for (const [route, allowed] of reads) {
          const response = await request(route, cookie);
          assert.equal(response.status, allowed.includes(seed.role) ? 200 : 403, `${mode} ${seed.role} GET ${route}`);
          if (response.ok) assert.equal(response.headers.get('cache-control')?.includes('no-store'), true);
        }
        const response = await request('/records', cookie);
        const rows = await response.json() as Array<{ id: string; category: string; is_draft: string }>;
        if (seed.role === 'SALES_COORDINATOR') assert.ok(rows.every(r => r.category !== 'RMA'));
        if (seed.role === 'TASS') assert.ok(rows.every(r => ['RMA', 'Accounting Collection'].includes(r.category)));
        if (seed.role === 'DRIVER') {
          const account = await prisma.user.findUniqueOrThrow({ where: { email: seed.email }, include: { driverProfile: true } });
          const owned = await prisma.deliveryRecord.findMany({ where: { driverId: account.driverProfile!.id, draft: false }, select: { id: true } });
          const ids = new Set(owned.map(r => r.id));
          assert.ok(rows.length > 0);
          assert.ok(rows.every(r => ids.has(r.id) && r.is_draft === 'No'));
          const completed = await prisma.deliveryRecord.findFirstOrThrow({ where: { driverId: account.driverProfile!.id, status: 'ACCOMPLISHED' } });
          const files = await (await request(`/records/${completed.id}/attachments`, cookie)).json();
          assert.ok(files.length > 0);
          const download = await request(`/records/${completed.id}/attachments/${files[0].id}/download`, cookie);
          assert.equal(download.status, 200);
          assert.ok((await download.arrayBuffer()).byteLength > 0);
          assert.equal((await request('/transactions?source=inventory', cookie)).status, 403);
        }
      });
    }
    await t.test('seeded Admin SKU writes keep balances, ledger and audit atomic under competing deductions and rollback', async () => {
      const cookie = await login(USERS.find(u => u.role === 'ADMIN')!);
      const sales = await login(USERS.find(u => u.role === 'SALES_COORDINATOR')!);
      const payload = { sku_code: 'SEED-ATOMIC-STOCK', name: 'Seeded stock fixture', category: 'A', unit_cost: 10, unit_price: 15, reorder_point: 1 };
      assert.equal((await write('/skus', sales, payload)).status, 403);
      const created = await write('/skus', cookie, payload);
      assert.equal(created.status, 201);
      const product = await created.json();
      assert.equal(product.inventory.on_hand_qty, 0);
      assert.equal((await write('/skus', cookie, payload)).status, 409);
      assert.equal((await write(`/skus/${product.id}/adjust`, cookie, { type: 'Goods Receipt', qty_change: 10, reference: 'SEED-RECEIPT' })).status, 200);
      const competing = await Promise.all(['A', 'B'].map(reference => write(`/skus/${product.id}/adjust`, cookie,
        { type: 'Sale', qty_change: -7, reference: `SEED-SALE-${reference}` })));
      assert.deepEqual(competing.map(r => r.status).sort(), [200, 400]);
      assert.equal((await prisma.inventoryItem.findUniqueOrThrow({ where: { productId: product.id } })).onHandQty, 3);
      assert.equal(await prisma.inventoryTransaction.count({ where: { productId: product.id } }), 2);
      const auditCount = await prisma.auditLog.count({ where: { recordId: product.id } });
      await prisma.$executeRawUnsafe(`CREATE FUNCTION seeded_test_reject_stock_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."recordType" = 'SKU' AND NEW.action = 'UPDATE' THEN RAISE EXCEPTION 'seeded stock rollback fixture'; END IF; RETURN NEW; END $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER seeded_test_reject_stock_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION seeded_test_reject_stock_audit()`);
      try {
        assert.equal((await write(`/skus/${product.id}/adjust`, cookie, { type: 'Adjustment', qty_change: 2, reference: 'SEED-ROLLBACK' })).status, 500);
        assert.equal((await prisma.inventoryItem.findUniqueOrThrow({ where: { productId: product.id } })).onHandQty, 3);
        assert.equal(await prisma.inventoryTransaction.count({ where: { productId: product.id } }), 2);
        assert.equal(await prisma.auditLog.count({ where: { recordId: product.id } }), auditCount);
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER seeded_test_reject_stock_audit ON "AuditLog"`);
        await prisma.$executeRawUnsafe('DROP FUNCTION seeded_test_reject_stock_audit()');
      }
    });
    await t.test('two seeded Customer editors cannot overwrite each other and a stale retry creates no audit', async () => {
      const adminCookie = await login(USERS.find(u => u.role === 'ADMIN')!);
      const salesCookie = await login(USERS.find(u => u.role === 'SALES_COORDINATOR')!);
      const customer = await prisma.customer.findFirstOrThrow();
      const before = await prisma.auditLog.count({ where: { recordId: customer.id } });
      const results = await Promise.all([adminCookie, salesCookie].map((cookie, index) => write(`/customers/${customer.id}`, cookie,
        { city: `Seeded City ${index}`, remarks: 'Concurrent seeded directory edit', expected_modified_at: customer.modifiedAt.toISOString() }, 'PUT')));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const winner = results.findIndex(r => r.status === 200);
      assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).city, `Seeded City ${winner}`);
      assert.equal((await write(`/customers/${customer.id}`, salesCookie, { city: 'Stale retry', remarks: 'Stale version must fail', expected_modified_at: customer.modifiedAt.toISOString() }, 'PUT')).status, 409);
      assert.equal(await prisma.auditLog.count({ where: { recordId: customer.id } }), before + 1);
    });
    await t.test('seeded record editors require edit versions and preserve the winning PostgreSQL write on stale retries', async () => {
      const sales = await login(USERS.find(u => u.role === 'SALES_COORDINATOR')!);
      const adminCookie = await login(USERS.find(u => u.role === 'ADMIN')!);
      const company = await prisma.company.findFirstOrThrow();
      const createdResponse = await write('/records', sales, { category: 'Deliveries', company_id: company.id,
        reference: 'SEED-EDIT-VERSION', delivery_date: manilaToday(), remarks: 'Seeded versioned editor request' });
      assert.equal(createdResponse.status, 201);
      const created = await createdResponse.json();
      assert.match(created.edit_version, /^record:[a-f0-9]{64}$/);
      const auditCount = await prisma.auditLog.count({ where: { recordId: created.id } });
      const metadata = { address: 'Missing version must not save', remarks: 'Require editor precondition' };
      assert.equal((await write(`/records/${created.id}`, sales, metadata, 'PUT')).status, 428);
      assert.equal(await prisma.auditLog.count({ where: { recordId: created.id } }), auditCount);
      const edits = await Promise.all([sales, adminCookie].map((cookie, index) => write(`/records/${created.id}`, cookie,
        { address: `Seeded editor ${index}`, remarks: 'Competing seeded editor', expected_edit_version: created.edit_version }, 'PUT')));
      assert.deepEqual(edits.map(response => response.status).sort(), [200, 409]);
      const winner = edits.findIndex(response => response.status === 200);
      const saved = await prisma.deliveryRecord.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(saved.address, `Seeded editor ${winner}`);
      assert.equal((await write(`/records/${created.id}`, sales, { ...metadata, expected_edit_version: created.edit_version }, 'PUT')).status, 409);
      const latest = await (await request(`/records/${created.id}`, sales)).json();
      assert.equal(latest.address, saved.address);
      assert.notEqual(latest.edit_version, created.edit_version);
      assert.equal(await prisma.auditLog.count({ where: { recordId: created.id } }), auditCount + 1);
    });
    await t.test('seeded TASS RMA edits retain their numeric version contract on PostgreSQL', async () => {
      const tass = await login(USERS.find(u => u.role === 'TASS')!);
      const company = await prisma.company.findFirstOrThrow();
      const createdResponse = await write('/records', tass, { category: 'RMA', company_id: company.id, priority: '2 - Moderate',
        area: 'Carmona', account_manager: 'Seed AM', rma_reference: 'SEED-RMA-EDIT-VERSION',
        rma_movement: 'INTERNAL_NO_DRIVER', remarks: 'Seeded internal RMA request' });
      assert.equal(createdResponse.status, 201);
      const created = await createdResponse.json();
      const auditCount = await prisma.auditLog.count({ where: { recordId: created.id } });
      const change = { area: 'Makati', remarks: 'Correct RMA destination' };
      assert.equal((await write(`/records/${created.id}`, tass, change, 'PUT')).status, 400);
      const updated = await write(`/records/${created.id}`, tass, { ...change, expected_version: created.rma_version }, 'PUT');
      assert.equal(updated.status, 200);
      assert.equal((await updated.json()).rma_version, created.rma_version + 1);
      assert.equal((await write(`/records/${created.id}`, tass, { ...change, area: 'Stale destination', expected_version: created.rma_version }, 'PUT')).status, 409);
      const saved = await prisma.deliveryRecord.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(saved.area, change.area);
      assert.equal(saved.rmaVersion, created.rma_version + 1);
      assert.equal(await prisma.auditLog.count({ where: { recordId: created.id } }), auditCount + 1);
    });
    await t.test('already-issued sessions observe real account deactivation and recover only after reactivation', async () => {
      const seed = USERS.find(u => u.role === 'SALES_COORDINATOR')!;
      const cookie = await login(seed);
      const account = await prisma.user.findUniqueOrThrow({ where: { email: seed.email } });
      await prisma.user.update({ where: { id: account.id }, data: { isActive: false } });
      try { assert.equal((await request('/records', cookie)).status, 401); }
      finally { await prisma.user.update({ where: { id: account.id }, data: { isActive: true } }); }
      const restored = await login(seed);
      const session = await request('/auth/me', restored);
      const csrf = session.headers.get('x-csrf-token');
      assert.ok(csrf);
      assert.equal((await request('/auth/logout', restored, { method: 'POST', headers: { 'X-CSRF-Token': csrf! } })).status, 200);
    });
  } finally {
    if (oldMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = oldMode;
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
