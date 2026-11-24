import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import dashboard from '../src/routes/dashboard';
import { sessionUser } from '../src/services/permissions';

const restorers: (() => void)[] = [];
function stub(target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  target[key] = mock.fn(implementation);
  restorers.push(() => { target[key] = original; });
}
afterEach(() => {
  while (restorers.length) restorers.pop()!();
  mock.restoreAll();
});

async function stats(role: string) {
  const queries: any[] = [];
  stub(prisma.deliveryRecord, 'count', async (query: any) => { queries.push(query.where); return 0; });
  stub(prisma.deliveryRecord, 'groupBy', async () => []);
  stub(prisma.user, 'count', async () => 0);
  stub(prisma.user, 'groupBy', async () => []);
  stub(prisma.auditLog, 'count', async () => 0);
  stub(prisma.auditLog, 'findMany', async () => []);
  const route = (dashboard as any).stack.find((layer: any) => layer.route?.path === '/stats').route;
  const handler = route.stack[route.stack.length - 1].handle;
  let response: any;
  await handler({ user: sessionUser({ id: 'test', name: 'Test', email: 'test@example.test', role, permissions: [] }) }, { json(body: any) { response = body; } });
  return { queries, response };
}

test('dashboard today uses Manila midnight and excludes drafts from assignment counts', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T16:01:00Z').getTime() });
  const { queries, response } = await stats('LOGISTICS');
  assert.equal(response.role, 'LOGISTICS');
  assert.equal(queries[0].deliveryDate, '2026-10-06');
  assert.equal(queries[0].category, undefined);
  assert.equal(queries[0].draft, false);
  assert.deepEqual(queries[0].NOT, { driverId: null });
  assert.deepEqual(queries[0].OR.map((part: any) => part.category), [{ in: ['DELIVERY', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'] }, 'RMA']);
  // No driver assigned: every driver job type with no Driver profile, drafts excluded.
  assert.equal(queries[1].draft, false);
  assert.equal(queries[1].driverId, null);
  assert.deepEqual(queries[1].OR.map((part: any) => part.category), [{ in: ['DELIVERY', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'] }, 'RMA']);
  // On hold or rescheduled: spans all operational record types, drafts excluded.
  assert.equal(queries[3].category, undefined);
  assert.equal(queries[3].draft, false);
  assert.deepEqual(queries[3].status, { in: ['ON_HOLD', 'RESCHEDULED'] });
});

test('Sales Coordinator dashboard counts only Delivery records and completes by sign-off time with a Time Out fallback', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T16:01:00Z').getTime() });
  const { queries, response } = await stats('SALES_COORDINATOR');
  assert.equal(response.role, 'SALES_COORDINATOR');
  for (const query of queries) {
    assert.equal(query.category, 'DELIVERY');
    assert.equal(query.draft, false);
  }
  assert.deepEqual(queries[4].OR, [
    { completionSignedOffAt: { gte: '2026-10-05T16:00:00.000Z', lt: '2026-10-06T16:00:00.000Z' } },
    { completionSignedOffAt: null, timeOut: { gte: '2026-10-05T16:00:00.000Z', lt: '2026-10-06T16:00:00.000Z' } },
  ]);
  assert.equal(queries[4].updatedAt, undefined);
});

test('TASS dashboard count definitions remain category-specific', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T16:01:00Z').getTime() });
  const { queries, response } = await stats('TASS');
  assert.equal(response.role, 'TASS');
  // RMA-only metrics: TASS has no Procurement Pick-up or Accounting Collection module.
  assert.deepEqual(Object.keys(response).sort(), ['open_rma', 'rma_aging', 'rma_in_transit', 'rma_on_hold', 'role']);
  assert.equal(queries.length, 4);
  assert.deepEqual([queries[0].category, queries[1].category, queries[3].category], ['RMA', 'RMA', 'RMA']);
  assert.equal(queries[1].status, 'ON_HOLD');
  assert.ok(Array.isArray(queries[2].AND) && queries[2].AND.length === 2, 'in-transit keeps the record scope beside its own AND');
  assert.deepEqual(queries[2].AND[1].AND[1], { category: 'RMA' });
  // Every count keeps the TASS record scope, which is RMA-only.
  for (const query of queries) assert.deepEqual(query.AND[0].category, { in: ['RMA'] });
});

test('admin weekly statistics start at Sunday midnight in Manila', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-03T16:01:00Z').getTime() });
  const { queries } = await stats('ADMIN');
  assert.equal(queries[0].createdAt.gte.toISOString(), '2026-10-03T16:00:00.000Z');
});
