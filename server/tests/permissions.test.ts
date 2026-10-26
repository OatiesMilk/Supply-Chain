import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';
import authRoutes from '../src/routes/auth';
import usersRoutes from '../src/routes/users';
import skusRoutes from '../src/routes/skus';
import dashboardRoutes from '../src/routes/dashboard';
import transactionsRoutes from '../src/routes/transactions';
import recordsRoutes from '../src/routes/records';
import driversRoutes from '../src/routes/drivers';
import { effectiveScreens, permissionEditor, permissionInputError, permissionSnapshot, replacePermissions, sessionUser, type Permission } from '../src/services/permissions';
import { canCreateCategory, canWriteCategory, recordScope } from '../src/services/recordAccess';
import type { AuthUser } from '../src/middleware/auth';

afterEach(() => mock.restoreAll());
const account = (role = 'SALES_COORDINATOR', permissions: Permission[] = []) => ({
  id: 'test-account', name: 'Test User', email: 'test@example.com', role, permissions,
  isActive: true, password: bcrypt.hashSync('test-password', 4),
});

test('editor, login and restored sessions share defaults, overrides, catalog and locked modules', () => {
  for (const role of ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER']) {
    const user = account(role, [{ screen: 'main', granted: false }, { screen: 'dashboard', granted: false }]);
    const session = sessionUser(user);
    const editor = permissionEditor(user);
    assert.deepEqual(session.effectiveScreens, editor.effectiveScreens);
    assert.equal(session.permissionVersion, editor.permissionVersion);
    assert.ok(!session.effectiveScreens.includes('main'));
    assert.ok(!session.effectiveScreens.includes('dashboard'));
    for (const screen of editor.roleDefaults) assert.ok(editor.catalog.some(s => s.screen === screen));
  }
  assert.deepEqual(effectiveScreens('UNKNOWN', []), []);
  assert.ok(!effectiveScreens('LOGISTICS', [{ screen: 'admin', granted: true }]).includes('admin'));
  assert.ok(effectiveScreens('ADMIN', [{ screen: 'admin', granted: false }]).includes('admin'));
  assert.deepEqual(effectiveScreens('DRIVER', [{ screen: 'driver_dashboard', granted: false }]), []);
  for (const screen of ['rma', 'procurement_pickup', 'suppliers', 'transactions']) {
    assert.ok(permissionEditor(account('TASS')).roleDefaults.includes(screen as any));
  }
  // TSK-118: SKU Master is an Admin default only; others keep read-only SKU lookup via Transaction Center.
  for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'TASS']) {
    const session = sessionUser(account(role));
    assert.ok(!permissionEditor(account(role)).roleDefaults.includes('inventory'), role);
    assert.ok(!session.effectiveScreens.includes('inventory'), role);
    assert.ok(session.resources.includes('skus'), role);
  }
  assert.ok(permissionEditor(account('ADMIN')).roleDefaults.includes('inventory'));
  assert.ok(sessionUser(account('LOGISTICS', [{ screen: 'inventory', granted: true }])).effectiveScreens.includes('inventory'), 'Admin can grant SKU Master per user');
  assert.ok(!sessionUser(account('LOGISTICS', [{ screen: 'transactions', granted: false }])).resources.includes('skus'));
});

test('RMA access defaults keep Sales out, TASS as owner, Logistics read-only, and Admin unchanged', () => {
  const sales = permissionEditor(account('SALES_COORDINATOR'));
  assert.ok(!sales.roleDefaults.includes('rma'));
  assert.ok(!sales.effectiveScreens.includes('rma'));
  assert.ok(!sales.editableScreens.includes('rma'));
  assert.ok(!effectiveScreens('SALES_COORDINATOR', [{ screen: 'rma', granted: true }]).includes('rma'));
  assert.ok(!recordScope(sessionUser(account('SALES_COORDINATOR')) as AuthUser).category.in.includes('RMA'));
  assert.equal(canWriteCategory(sessionUser(account('SALES_COORDINATOR')) as AuthUser, 'RMA'), false);

  const logistics = permissionEditor(account('LOGISTICS'));
  const logisticsUser = sessionUser(account('LOGISTICS')) as AuthUser;
  assert.ok(logistics.roleDefaults.includes('rma'));
  assert.ok(logistics.effectiveScreens.includes('rma'));
  assert.ok(recordScope(logisticsUser).category.in.includes('RMA'));
  assert.equal(canWriteCategory(logisticsUser, 'RMA'), false);
  assert.equal(canCreateCategory(logisticsUser, 'RMA'), false);
  assert.equal(canWriteCategory(logisticsUser, 'DELIVERY'), true, 'Logistics keeps its existing delivery operations');
  assert.equal(canCreateCategory(logisticsUser, 'DELIVERY'), false, 'only Sales Coordinator/Admin create Deliveries');

  const tass = permissionEditor(account('TASS'));
  const tassUser = sessionUser(account('TASS')) as AuthUser;
  assert.ok(tass.roleDefaults.includes('rma'));
  assert.ok(tass.effectiveScreens.includes('rma'));
  assert.ok(recordScope(tassUser).category.in.includes('RMA'));
  assert.equal(canWriteCategory(tassUser, 'RMA'), true);
  assert.equal(canCreateCategory(tassUser, 'RMA'), true);
  assert.ok(recordScope(tassUser).category.in.includes('ACCOUNTING_COLLECTION'));

  const admin = permissionEditor(account('ADMIN'));
  assert.ok(admin.roleDefaults.includes('rma'));
  assert.ok(canWriteCategory(sessionUser(account('ADMIN')) as AuthUser, 'RMA'));
  assert.ok(canCreateCategory(sessionUser(account('ADMIN')) as AuthUser, 'DELIVERY'));
});

test('invalid, unknown and duplicate permission inputs fail validation', () => {
  for (const input of [null, {}, [null], [{ screen: 'dashboard', granted: false, userId: 'another-account' }], [{ screen: 'dashboard', granted: 'false' }], [{ screen: 'constructor', granted: true }], [{ screen: 'unknown', granted: true }], [{ screen: 'main', granted: false }, { screen: 'main', granted: true }]]) {
    assert.ok(permissionInputError(input));
  }
  assert.equal(permissionInputError([]), null);
  assert.equal(permissionInputError([{ screen: 'driver_manager', granted: false }, { screen: 'statistical_reports', granted: true }]), null);
});

test('permission replacement is atomic, audited, rejects stale editors and can reset to defaults', async () => {
  let row = account();
  let audits: unknown[] = [];
  let auditFailure = false;
  const db = { $transaction: async (fn: any) => {
    const before = structuredClone(row);
    const beforeAudits = [...audits];
    try {
      return await fn({
        $queryRaw: async () => [{ id: row.id }],
        user: { findUnique: async () => row },
        userPermission: {
          deleteMany: async () => { row.permissions = []; },
          createMany: async ({ data }: any) => { row.permissions = data.map(({ screen, granted }: Permission) => ({ screen, granted })); },
        },
        auditLog: { create: async (data: unknown) => { if (auditFailure) throw new Error('audit failed'); audits.push(data); } },
      });
    } catch (error) { row = before; audits = beforeAudits; throw error; }
  } } as unknown as PrismaClient;
  const originalVersion = permissionSnapshot(row.role, row.permissions).permissionVersion;
  const denied = await replacePermissions(db, row.id, 'admin', [{ screen: 'dashboard', granted: false }], originalVersion);
  assert.ok(!denied.effectiveScreens.includes('dashboard'));
  assert.equal(audits.length, 1);
  await assert.rejects(replacePermissions(db, row.id, 'admin', [], originalVersion), /changed/);
  await assert.rejects(replacePermissions(db, row.id, 'admin', [{ screen: 'admin', granted: true }], denied.permissionVersion), /cannot customize/);
  auditFailure = true;
  await assert.rejects(replacePermissions(db, row.id, 'admin', [], denied.permissionVersion), /audit failed/);
  assert.deepEqual(row.permissions, [{ screen: 'dashboard', granted: false }]);
  auditFailure = false;
  const reset = await replacePermissions(db, row.id, 'admin', [], denied.permissionVersion);
  assert.ok(reset.effectiveScreens.includes('dashboard'));
  assert.equal(audits.length, 2);
});

test('record scopes retain role limits and explicit denials even through shared views', () => {
  const user = sessionUser(account('LOGISTICS', [{ screen: 'deliveries', granted: false }])) as AuthUser;
  const scope = recordScope(user) as any;
  assert.ok(!scope.category.in.includes('DELIVERY'));
  assert.equal(canWriteCategory(user, 'DELIVERY'), false);
  const tass = recordScope(sessionUser(account('TASS')) as AuthUser) as any;
  assert.deepEqual(tass.category.in, ['RMA', 'ACCOUNTING_COLLECTION']);
  // Drivers are scoped by their linked profile id; an unlinked Driver owns nothing.
  const driver = sessionUser(account('DRIVER')) as AuthUser;
  const linked = recordScope({ ...driver, driverProfileId: 'profile-1' }) as any;
  assert.equal(linked.driverId, 'profile-1');
  assert.equal(linked.draft, false);
  assert.equal(linked.driver, undefined);
  assert.deepEqual((recordScope(driver) as any).id, { in: [] });
});

test('HTTP login includes denials immediately; the same cookie enforces subsequent revocations', async () => {
  let row = account('SALES_COORDINATOR', [
    { screen: 'main', granted: false }, { screen: 'dashboard', granted: false },
    { screen: 'inventory', granted: false }, { screen: 'transactions', granted: false },
    { screen: 'driver_manager', granted: false },
  ]);
  const originalUserLookup = prisma.user.findUnique;
  const originalProductLookup = prisma.product.findMany;
  prisma.user.findUnique = mock.fn(async () => row) as any;
  const productRead = mock.fn(async () => []);
  prisma.product.findMany = productRead as any;
  const app = express();
  app.use(express.json(), cookieParser());
  for (const [path, router] of [['auth', authRoutes], ['users', usersRoutes], ['skus', skusRoutes], ['dashboard', dashboardRoutes], ['transactions', transactionsRoutes], ['records', recordsRoutes], ['drivers', driversRoutes]] as const) app.use(`/${path}`, router);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: error.message }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const login = await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: row.email, password: 'test-password' }) });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('cache-control'), 'no-store');
    const body = await login.json() as any;
    assert.ok(!body.effectiveScreens.includes('main'));
    assert.ok(!body.effectiveScreens.includes('dashboard'));
    assert.equal(body.password, undefined);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    assert.deepEqual(await (await fetch(`${url}/auth/me`, { headers })).json(), body);
    for (const path of ['/skus', '/dashboard/stats', '/transactions', '/users']) {
      assert.equal((await fetch(url + path, { headers })).status, 403, path);
    }
    assert.equal(productRead.mock.callCount(), 0);
    row = { ...row, role: 'LOGISTICS' };
    assert.equal((await fetch(`${url}/drivers`, { method: 'POST', headers, body: '{}' })).status, 403);
    row = { ...row, permissions: [] };
    assert.equal((await fetch(`${url}/skus`, { headers })).status, 200);
    // TSK-118: Logistics has no SKU Master by default, so stock adjustment is denied before any write.
    assert.equal((await fetch(`${url}/skus/sku-1/adjust`, { method: 'POST', headers, body: JSON.stringify({ quantity: 1, remarks: 'x' }) })).status, 403);
    row = { ...row, permissions: [{ screen: 'inventory', granted: false }] };
    assert.equal((await fetch(`${url}/skus`, { headers })).status, 200, 'Read-only SKU lookup comes with Transaction Center');
    row = { ...row, permissions: [{ screen: 'inventory', granted: false }, { screen: 'transactions', granted: false }] };
    assert.equal((await fetch(`${url}/skus`, { headers })).status, 403);
    row = { ...row, permissions: permissionEditor(row).roleDefaults.map(screen => ({ screen, granted: false })) };
    assert.equal((await fetch(`${url}/records`, { headers })).status, 403);
    row = { ...row, role: 'ADMIN', permissions: [] };
    const invalid = await fetch(`${url}/users/test-account/permissions`, { method: 'PUT', headers, body: JSON.stringify({ permissions: [null], expectedVersion: 'old' }) });
    assert.equal(invalid.status, 400);
  } finally {
    prisma.user.findUnique = originalUserLookup;
    prisma.product.findMany = originalProductLookup;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
