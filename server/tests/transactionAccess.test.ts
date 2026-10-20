import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/db';
import { signToken, type AuthUser } from '../src/middleware/auth';
import { sessionUser, type Permission } from '../src/services/permissions';
import { canAccessTransactions, canAccessInventoryTransactions, transactionCategories } from '../src/services/transactionAccess';
import transactionsRoutes from '../src/routes/transactions';
import skusRoutes from '../src/routes/skus';

afterEach(() => mock.restoreAll());

// Drivers own runs through their Admin-linked Driver profile id (TSK-100).
const account = (role = 'DRIVER', permissions: Permission[] = [], driverProfile: { id: string; type: string } | null = { id: 'profile-one', type: 'DRIVER' }) => ({
  id: 'driver-user', name: 'Driver One', email: 'driver@example.com', role, permissions, isActive: true,
  driverProfile: role === 'DRIVER' ? driverProfile : null,
});

test('transaction policy explicitly denies unknown roles and driver inventory despite forged module grants', () => {
  const driver = { ...sessionUser(account('DRIVER', [
    { screen: 'transactions', granted: true }, { screen: 'inventory', granted: true },
  ])), driverProfileId: 'profile-one' } as AuthUser;
  assert.deepEqual(transactionCategories('DRIVER'), ['DELIVERY', 'RMA', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS']);
  assert.deepEqual(transactionCategories('UNKNOWN'), []);
  assert.equal(canAccessTransactions(driver), true);
  assert.equal(canAccessInventoryTransactions(driver), false);
  assert.equal(driver.resources.includes('transactions'), false);
  assert.equal(driver.resources.includes('skus'), false);
  assert.equal(canAccessTransactions({ ...driver, role: 'UNKNOWN' as any, resources: ['transactions', 'skus'] }), false);
  assert.equal(canAccessInventoryTransactions({ ...driver, role: 'UNKNOWN' as any, resources: ['skus'] }), false);
  assert.equal(canAccessTransactions({ ...driver, driverProfileId: null }), false);
  assert.equal(canAccessTransactions({ ...driver, name: ' ' }), true, 'The display name no longer decides Driver identity');
});

// Evaluate the actual query predicates against fixtures, so missing ownership,
// category, and deletion restrictions expose records and fail the HTTP tests.
function matches(record: any, where: any): boolean {
  if (where.AND && !(Array.isArray(where.AND) ? where.AND : [where.AND]).every((part: any) => matches(record, part))) return false;
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return true;
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(record[key]);
    return record[key] === value;
  });
}

test('HTTP transaction reads enforce driver ownership, category, inventory denial and live module revocation', async () => {
  let user = account();
  let readFailure = false;
  const now = new Date('2026-10-01T00:00:00Z');
  const profileNames: Record<string, string> = { 'profile-one': 'Driver One', 'profile-two': 'Driver Two' };
  const record = (id: string, driverId: string | null, category = 'DELIVERY', deletedAt: Date | null = null) => ({
    id, driverId, driver: driverId ? profileNames[driverId] : '', category, deletedAt, draft: false, company: { name: 'Customer' }, companyId: 'customer',
    createdBy: { name: 'Coordinator' }, modifiedBy: { name: 'Coordinator' }, reference: id,
    status: 'SCHEDULED', deliveryDate: '2026-10-01', itemDescription: 'Shipment',
    driverAssistants: '[]', createdAt: now, updatedAt: now,
  });
  const rows = [
    { ...record('own-draft', 'profile-one'), draft: true },
    record('own', 'profile-one'), record('other', 'profile-two'), record('unassigned', null),
    record('own-rma', 'profile-one', 'RMA'), record('deleted', 'profile-one', 'DELIVERY', now),
    record('collection', 'profile-one', 'ACCOUNTING_COLLECTION'),
    record('unknown-category', 'profile-one', 'FORGED_CATEGORY'),
  ];
  // Prisma delegates are dynamic proxies; Node's mock.method requires ordinary
  // property descriptors. Assign mocked functions and restore them explicitly.
  const restores: Array<() => void> = [];
  const stub = (delegate: any, method: string, handler: (...args: any[]) => Promise<any>) => {
    const original = delegate[method];
    const mocked = mock.fn(handler);
    delegate[method] = mocked;
    restores.push(() => { delegate[method] = original; });
    return mocked;
  };
  stub(prisma.user, 'findUnique', async () => user);
  const reads = stub(prisma.deliveryRecord, 'findMany', async ({ where }: any) => {
    if (readFailure) throw new Error('Simulated read failure');
    return rows.filter(row => matches(row, where));
  });
  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => rows.find(row => matches(row, where)) ?? null);
  const auditRead = stub(prisma.auditLog, 'findMany', async () => []);
  const inventoryRead = stub(prisma.inventoryTransaction, 'findMany', async () => []);
  const inventoryDetail = stub(prisma.inventoryTransaction, 'findFirst', async () => null);
  const skuList = stub(prisma.product, 'findMany', async () => []);
  const skuDetail = stub(prisma.product, 'findFirst', async () => null);

  const app = express();
  app.use(cookieParser());
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/skus', skusRoutes);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { Cookie: `mg_session=${signToken(user as AuthUser)}` };
  const get = (path: string) => fetch(url + path, { headers });
  try {
    assert.equal((await fetch(`${url}/api/transactions`)).status, 401);
    for (const query of ['', '?source=delivery', '?driver=Driver%20Two&userId=other-account']) {
      const response = await get('/api/transactions' + query);
      assert.equal(response.status, 200);
      const body = await response.json() as any;
      assert.equal(body.total, 3);
      assert.deepEqual(body.transactions.map((txn: any) => txn.id), ['own', 'own-rma', 'collection']);
    }
    const filtered = await get('/api/transactions?source=all&category=RMA');
    assert.equal(filtered.status, 200);
    assert.deepEqual((await filtered.json() as any).transactions.map((txn: any) => txn.id), ['own-rma']);
    const forged = await get('/api/transactions?category=FORGED_CATEGORY');
    assert.equal((await forged.json() as any).total, 0);
    const paged = await get('/api/transactions?source=all&limit=1');
    const pagedBody = await paged.json() as any;
    assert.equal(pagedBody.total, 3);
    assert.equal(pagedBody.transactions.length, 1);
    assert.equal((await get('/api/transactions/delivery/own')).status, 200);
    assert.equal((await get('/api/transactions/delivery/own-rma')).status, 200);
    assert.equal(auditRead.mock.callCount(), 2);
    for (const id of ['own-draft', 'other', 'unassigned', 'unknown-category', 'deleted', 'missing']) {
      const response = await get(`/api/transactions/delivery/${id}`);
      assert.equal(response.status, 404, id);
      assert.deepEqual(await response.json(), { error: 'Delivery record not found' });
    }
    assert.equal(auditRead.mock.callCount(), 2, 'Denied records must not query audit history');
    for (const path of ['/api/transactions?source=inventory', '/api/transactions/inventory/known', '/api/transactions/inventory/missing', '/api/skus', '/api/skus/known']) {
      assert.equal((await get(path)).status, 403, path);
    }
    assert.equal(inventoryRead.mock.callCount(), 0);
    assert.equal(inventoryDetail.mock.callCount(), 0);
    assert.equal(skuList.mock.callCount(), 0);
    assert.equal(skuDetail.mock.callCount(), 0);
    assert.equal((await get('/api/transactions?source=invalid')).status, 400);
    readFailure = true;
    assert.equal((await get('/api/transactions')).status, 500, 'Rejected queries must reach the Express error handler');
    readFailure = false;

    // An unlinked login (e.g. an ambiguous legacy name left for Admin review)
    // and a login linked to a non-DRIVER profile own nothing and read nothing.
    for (const profile of [null, { id: 'profile-one', type: 'ASSISTANT' }]) {
      user = account('DRIVER', [], profile);
      const beforeUnlinkedReads = reads.mock.callCount();
      assert.equal((await get('/api/transactions')).status, 403);
      assert.equal((await get('/api/transactions/delivery/own')).status, 403);
      assert.equal(reads.mock.callCount(), beforeUnlinkedReads);
    }

    // Renaming the login changes presentation only; ownership stays on the profile id.
    user = { ...account(), name: 'Driver Two' };
    assert.deepEqual((await (await get('/api/transactions')).json() as any).transactions.map((txn: any) => txn.id), ['own', 'own-rma', 'collection']);
    // Relinking the login to another profile moves ownership immediately.
    user = account('DRIVER', [], { id: 'profile-two', type: 'DRIVER' });
    assert.deepEqual((await (await get('/api/transactions')).json() as any).transactions.map((txn: any) => txn.id), ['other']);
    assert.equal((await get('/api/transactions/delivery/own')).status, 404);
    user = account('DRIVER', [{ screen: 'driver_dashboard', granted: false }]);
    const readCount = reads.mock.callCount();
    assert.equal((await get('/api/transactions')).status, 403);
    assert.equal((await get('/api/transactions/delivery/own')).status, 403);
    assert.equal(reads.mock.callCount(), readCount);

    // The same signed cookie uses the role and module permissions reloaded from
    // the database, not stale token claims or client supplied identities.
    for (const role of ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS']) {
      user = account(role);
      const response = await get('/api/transactions');
      assert.equal(response.status, 200, role);
      const ids = (await response.json() as any).transactions.map((txn: any) => txn.id);
      assert.ok(ids.includes(role === 'TASS' ? 'collection' : 'other'), role);
      assert.equal((await get('/api/transactions?source=inventory')).status, role === 'TASS' ? 403 : 200);
    }
    user = account('LOGISTICS', [{ screen: 'deliveries', granted: false }]);
    assert.equal((await get('/api/transactions/delivery/own')).status, 404);
    assert.ok(!(await (await get('/api/transactions')).json() as any).transactions.some((txn: any) => txn.id === 'own'));
    // TSK-118: without SKU Master, Logistics keeps read-only inventory transactions through
    // Transaction Center; denying Transaction Center (below) removes them.
    user = account('LOGISTICS', [{ screen: 'inventory', granted: false }]);
    assert.equal((await get('/api/transactions?source=inventory')).status, 200);
    user = account('LOGISTICS', [{ screen: 'transactions', granted: false }]);
    assert.equal((await get('/api/transactions')).status, 403);
    assert.equal((await get('/api/transactions/delivery/own')).status, 403);
    user = account('UNKNOWN');
    assert.equal((await get('/api/transactions')).status, 403);
    assert.equal((await get('/api/transactions/inventory/known')).status, 403);
  } finally {
    restores.forEach(restore => restore());
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
