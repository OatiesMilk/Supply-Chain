import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import records from '../src/routes/records';
import skus from '../src/routes/skus';
import users from '../src/routes/users';
import customers from '../src/routes/customers';

const restorers: (() => void)[] = [];
function stub(target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key]; const replacement = mock.fn(implementation);
  target[key] = replacement; restorers.push(() => { target[key] = original; }); return replacement;
}
afterEach(() => { while (restorers.length) restorers.pop()!(); mock.restoreAll(); });
const actor = (role: string) => ({ id: 'actor', name: 'Actor', role, permissions: [], effectiveScreens: ['deliveries', 'inventory'] });
const row = { id: 'record', company: { name: 'Test company' }, companyId: 'company', reference: 'REF', category: 'DELIVERY', status: 'SCHEDULED', draft: true, timeIn: null, timeOut: null, driver: '', driverAssistants: '[]', deliveryDate: '2026-10-16', deletedAt: null };
async function invoke(router: any, method: string, path: string, role: string, body: unknown = {}) {
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  let status = 200; let response: any;
  const req = { params: { id: 'record' }, body, user: actor(role) };
  const res = { status(value: number) { status = value; return this; }, json(value: unknown) { response = value; return this; } };
  // Sessions/module ownership are separately covered by HTTP integration tests.
  await route.stack.at(-2).handle(req, res, () => {});
  if (response === undefined) await route.stack.at(-1).handle(req, res, (error: unknown) => { if (error) throw error; });
  return { status, body: response };
}

test('existing Draft submission refuses Logistics without writes and permits Sales/Admin', async () => {
  const update = mock.fn(async ({ data }: any) => ({ ...row, ...data }));
  const audit = mock.fn(async () => ({}));
  stub(prisma.user, 'findMany', async () => []);
  stub(prisma, '$transaction', async (fn: any) => fn({ $queryRaw: async () => [], deliveryRecord: { findUnique: async () => row, update }, auditLog: { create: audit }, remarkLog: { create: async () => ({}) } }));
  const denied = await invoke(records, 'patch', '/:id/status', 'LOGISTICS', { status: 'Scheduled', remarks: 'Submit' });
  assert.equal(denied.status, 403); assert.equal(update.mock.callCount(), 0); assert.equal(audit.mock.callCount(), 0);
  for (const role of ['SALES_COORDINATOR', 'ADMIN']) {
    const result = await invoke(records, 'patch', '/:id/status', role, { status: 'Scheduled', remarks: 'Submit' });
    assert.equal(result.status, 200); assert.equal(result.body.is_draft, 'No');
  }
  assert.equal(update.mock.callCount(), 2);
});

test('record deletion is forbidden for every role without record or audit mutation', async () => {
  const update = stub(prisma.deliveryRecord, 'update', async () => { throw new Error('unexpected write'); });
  const audit = stub(prisma.auditLog, 'create', async () => { throw new Error('unexpected audit'); });
  for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS']) assert.equal((await invoke(records, 'delete', '/:id', role)).status, 403);
  assert.equal(update.mock.callCount(), 0); assert.equal(audit.mock.callCount(), 0);
});

const createBody = { company_id: 'company', category: 'Deliveries', reference: 'REF', delivery_date: '2026-10-16' };
test('record creation validates dates and priorities before any database write', async () => {
  const transaction = stub(prisma, '$transaction', async () => { throw new Error('unexpected write'); });
  for (const invalid of [{ delivery_date: 'not-a-date' }, { delivery_date: '2026-02-30' }, { delivery_date: {} }, { priority: 'urgent-invalid' }, { priority: 1 }, { delivery_date: null }]) {
    assert.equal((await invoke(records, 'post', '/', 'SALES_COORDINATOR', { ...createBody, ...invalid })).status, 400);
  }
  assert.equal(transaction.mock.callCount(), 0);
});

test('unknown company is a clean validation failure and a disappearing company maps P2003 to 400', async () => {
  const company = stub(prisma.company, 'findUnique', async () => null);
  const transaction = stub(prisma, '$transaction', async () => { throw Object.assign(new Error('FK'), { code: 'P2003' }); });
  assert.equal((await invoke(records, 'post', '/', 'SALES_COORDINATOR', createBody)).status, 400);
  assert.equal(transaction.mock.callCount(), 0);
  company.mock.mockImplementation(async () => ({ id: 'company' }));
  assert.equal((await invoke(records, 'post', '/', 'SALES_COORDINATOR', createBody)).status, 400);
  assert.equal(transaction.mock.callCount(), 1);
});

test('valid creation preserves Scheduled defaults and an optional empty Draft date', async () => {
  stub(prisma.company, 'findUnique', async () => ({ id: 'company' }));
  stub(prisma.user, 'findMany', async () => []);
  stub(prisma, '$transaction', async (fn: any) => fn({ deliveryRecord: { create: async ({ data }: any) => ({ ...row, ...data, lineItems: [] }) }, auditLog: { create: async () => ({}) } }));
  const scheduled = await invoke(records, 'post', '/', 'LOGISTICS', createBody);
  assert.equal(scheduled.status, 201); assert.equal(scheduled.body.priority, '2 - Moderate');
  const draft = await invoke(records, 'post', '/', 'SALES_COORDINATOR', { company_id: 'company', category: 'Deliveries', status: 'Draft' });
  assert.equal(draft.status, 201); assert.equal(draft.body.is_draft, 'Yes');
});

test('stock adjustments reject unsupported types and non-finite/fractional quantities without writes', async () => {
  const transaction = stub(prisma, '$transaction', async () => { throw new Error('unexpected write'); });
  const body = { type: 'Adjustment', qty_change: 1, reference: 'REF' };
  for (const invalid of [{ type: 'Gift' }, { type: {} }, { qty_change: Infinity }, { qty_change: 'Infinity' }, { qty_change: 1.5 }, { qty_change: '' }, { qty_change: true }, { qty_change: 0 }, { qty_change: 2147483648 }, { reference: {} }]) {
    assert.equal((await invoke(skus, 'post', '/:id/adjust', 'ADMIN', { ...body, ...invalid })).status, 400);
  }
  assert.equal(transaction.mock.callCount(), 0);
});

function stockTx(failAudit = false) {
  let balance = 10; let committedBalance = 10; const ledger: any[] = []; const audits: any[] = [];
  const product = { id: 'sku', skuCode: 'SKU', inventory: { onHandQty: 10, allocatedQty: 0 } };
  stub(prisma.product, 'findFirst', async () => product);
  stub(prisma, '$transaction', async (fn: any) => {
    balance = committedBalance;
    const result = await fn({
      inventoryItem: { findUnique: async () => ({ onHandQty: balance }), update: async ({ data }: any) => { balance = data.onHandQty; } },
      inventoryTransaction: { create: async ({ data }: any) => { ledger.push(data); } },
      product: { update: async () => product, findUniqueOrThrow: async () => ({ ...product, inventory: { onHandQty: balance, allocatedQty: 0 }, transactions: [] }) },
      auditLog: { create: async ({ data }: any) => { if (failAudit) throw new Error('audit unavailable'); audits.push(data); } },
    });
    committedBalance = balance; return result;
  });
  return { balance: () => committedBalance, ledger, audits };
}
test('all supported stock types preserve integer changes with an audit in the transaction', async () => {
  const state = stockTx();
  for (const type of ['Goods Receipt', 'Sale', 'Adjustment', 'Transfer']) {
    assert.equal((await invoke(skus, 'post', '/:id/adjust', 'LOGISTICS', { type, qty_change: -1, reference: 'REF' })).status, 200);
  }
  assert.equal(state.balance(), 6); assert.equal(state.audits.length, 4); assert.equal(state.ledger.length, 4);
});
test('stock audit failure aborts transaction and reaches error handling; insufficient stock is 400', async () => {
  const state = stockTx(true);
  await assert.rejects(invoke(skus, 'post', '/:id/adjust', 'ADMIN', { type: 'Adjustment', qty_change: 1, reference: 'REF' }), /audit unavailable/);
  assert.equal(state.balance(), 10);
  assert.equal((await invoke(skus, 'post', '/:id/adjust', 'ADMIN', { type: 'Adjustment', qty_change: -11, reference: 'REF' })).status, 400);
});

test('duplicate user email returns 409 and unexpected failures are forwarded', async () => {
  stub(prisma.user, 'findUnique', async () => ({ id: 'record', role: 'SALES_COORDINATOR' }));
  const transaction = stub(prisma, '$transaction', async () => { throw Object.assign(new Error('duplicate'), { code: 'P2002' }); });
  assert.equal((await invoke(users, 'patch', '/:id', 'ADMIN', { email: 'duplicate@example.com' })).status, 409);
  transaction.mock.mockImplementation(async () => { throw new Error('database unavailable'); });
  await assert.rejects(invoke(users, 'patch', '/:id', 'ADMIN', { email: 'test@example.com' }), /database unavailable/);
});
test('valid user email edits normalize email; invalid input is rejected without writing', async () => {
  stub(prisma.user, 'findUnique', async () => ({ id: 'record', role: 'SALES_COORDINATOR' }));
  const transaction = stub(prisma, '$transaction', async (fn: any) => fn({ user: { update: async ({ data }: any) => ({ id: 'record', ...data }) } }));
  for (const email of [null, {}, '', 'bad']) assert.equal((await invoke(users, 'patch', '/:id', 'ADMIN', { email })).status, 400);
  assert.equal(transaction.mock.callCount(), 0);
  const result = await invoke(users, 'patch', '/:id', 'ADMIN', { email: ' TEST@example.com ' });
  assert.equal(result.status, 200); assert.equal(result.body.email, 'test@example.com');
});

test('customer creation rejects malformed/empty/invalid text without writes', async () => {
  const transaction = stub(prisma, '$transaction', async () => { throw new Error('unexpected write'); });
  for (const body of [{ name: {} }, { name: ' ' }, {}, { name: 'Test', contact_person: 5 }, { name: 'Test', email: 'bad' }, { name: 'Test', phone: {} }, { name: 'a'.repeat(121) }]) {
    assert.equal((await invoke(customers, 'post', '/', 'ADMIN', body)).status, 400);
  }
  assert.equal(transaction.mock.callCount(), 0);
});
test('customer creation accepts trimmed fields/defaults and forwards unexpected errors', async () => {
  const transaction = stub(prisma, '$transaction', async (fn: any) => fn({ customer: { create: async ({ data }: any) => ({ id: 'customer', ...data, createdBy: { name: 'Admin' }, modifiedBy: { name: 'Admin' } }) }, auditLog: { create: async () => ({}) } }));
  const result = await invoke(customers, 'post', '/', 'ADMIN', { name: ' Test ' });
  assert.equal(result.status, 201); assert.equal(result.body.name, 'Test'); assert.equal(result.body.contact_person, '');
  transaction.mock.mockImplementation(async () => { throw new Error('database unavailable'); });
  await assert.rejects(invoke(customers, 'post', '/', 'ADMIN', { name: 'Test' }), /database unavailable/);
});

test('SKU editing shares numeric validation with creation and preserves valid updates', async () => {
  const transaction = stub(prisma, '$transaction', async () => { throw new Error('unexpected write'); });
  for (const body of [{ unit_price: 'abc' }, { unit_cost: -1 }, { unit_price: Infinity }, { reorder_point: 1.5 }]) assert.equal((await invoke(skus, 'put', '/:id', 'ADMIN', body)).status, 400);
  assert.equal(transaction.mock.callCount(), 0);
  stub(prisma.product, 'findFirst', async () => ({ id: 'sku' }));
  transaction.mock.mockImplementation(async (fn: any) => fn({ product: { update: async ({ data }: any) => ({ id: 'sku', ...data }) }, auditLog: { create: async () => ({}) } }));
  assert.equal((await invoke(skus, 'put', '/:id', 'ADMIN', { unit_price: 0, reorder_point: 2 })).status, 200);
});
