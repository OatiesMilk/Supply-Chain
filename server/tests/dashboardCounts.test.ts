import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import dashboard from '../src/routes/dashboard';
import records from '../src/routes/records';
import { dashboardOverview } from '../src/services/dashboardOverview';
import { OPEN_RMA_STATUSES, dashboardRecordFilter } from '../src/services/dashboardFilters';
import { recordActiveCounts } from '../src/services/activeRecordCounts';
import { sessionUser } from '../src/services/permissions';
import { recordScope } from '../src/services/recordAccess';
import type { AuthUser } from '../src/middleware/auth';

const restorers: (() => void)[] = [];
function stub(target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  target[key] = mock.fn(implementation);
  restorers.push(() => { target[key] = original; });
}
afterEach(() => { while (restorers.length) restorers.pop()!(); mock.restoreAll(); });

const actor = (role: string) => sessionUser({ id: 'counts-user', name: 'User', email: 'user@example.test', role, permissions: [] }) as AuthUser;
const NOW = new Date('2026-11-10T02:00:00Z').getTime(); // 10:00 in Manila on 2026-11-10
const TODAY = '2026-11-10';

function handlerFor(router: any, path: string) {
  const route = router.stack.find((layer: any) => layer.route?.path === path).route;
  return route.stack[route.stack.length - 1].handle;
}
async function statsQueries(role: string) {
  const queries: any[] = [];
  stub(prisma.deliveryRecord, 'count', async (query: any) => { queries.push(query.where); return 0; });
  stub(prisma.deliveryRecord, 'groupBy', async () => []);
  stub(prisma.user, 'count', async () => 0);
  stub(prisma.user, 'groupBy', async () => []);
  stub(prisma.auditLog, 'count', async () => 0);
  stub(prisma.auditLog, 'findMany', async () => []);
  const user = actor(role);
  await handlerFor(dashboard, '/stats')({ user }, { json() {} });
  return { queries, user };
}

test('Open RMA is every RMA that is not completed and not a draft', () => {
  assert.deepEqual([...OPEN_RMA_STATUSES].sort(), ['IN_TRANSIT', 'ON_HOLD', 'PENDING', 'RESCHEDULED', 'SCHEDULED']);
  assert.equal(OPEN_RMA_STATUSES.includes('ACCOMPLISHED'), false);
  assert.deepEqual(dashboardRecordFilter('tass-open-rma', TODAY), { category: 'RMA', draft: false, status: { in: OPEN_RMA_STATUSES } });
});

test('every role stats tile counts with exactly the filter its drill-down list uses', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: NOW });
  const expected: Record<string, string[]> = {
    SALES_COORDINATOR: ['sc-scheduled-today', 'sc-pending-assignment', 'sc-on-hold', 'sc-rescheduled', 'sc-completed-today'],
    LOGISTICS: ['log-assigned-today', 'log-transport-requests', 'log-completed-today', 'log-on-hold-rescheduled'],
    TASS: ['tass-open-rma', 'tass-rma-on-hold', 'tass-pending-pickups', 'tass-pending-verification', 'tass-verified-today'],
  };
  for (const [role, ids] of Object.entries(expected)) {
    const { queries, user } = await statsQueries(role);
    ids.forEach((id, index) => {
      assert.deepEqual(queries[index], { AND: [recordScope(user)], deletedAt: null, ...dashboardRecordFilter(id, TODAY) }, `${role} ${id}`);
      assert.equal(queries[index].draft, false, `${role} ${id} excludes drafts`);
    });
  }
});

test('Admin unverified collections use the shared filter and exclude drafts', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: NOW });
  const { queries } = await statsQueries('ADMIN');
  const shared = queries.find(where => where.category === 'ACCOUNTING_COLLECTION');
  assert.equal(shared.draft, false);
  assert.equal(shared.collectionVerified, false);
});

test('sidebar RMA badge counts the same statuses as the Open RMA tile', () => {
  const rows = ['SCHEDULED', 'PENDING', 'IN_TRANSIT', 'ON_HOLD', 'RESCHEDULED', 'ACCOMPLISHED']
    .map((status, index) => ({ category: 'RMA', status, _count: { _all: index + 1 } }));
  const tile = rows.filter(row => OPEN_RMA_STATUSES.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  assert.equal(recordActiveCounts(rows).rma, tile);
  assert.equal(recordActiveCounts(rows).rma, 1 + 2 + 3 + 4 + 5);
});

test('Rescheduled only joins the sidebar badge for RMA', () => {
  assert.deepEqual(recordActiveCounts([
    { category: 'DELIVERY', status: 'RESCHEDULED', _count: { _all: 9 } },
    { category: 'RMA', status: 'RESCHEDULED', _count: { _all: 2 } },
  ]), { deliveries: 0, rma: 2, sales_orders: 0, accounting_collection: 0, procurement_pickup: 0 });
});

test('/active-counts asks the database for Rescheduled rows so RMA can count them', async () => {
  let query: any;
  stub(prisma.deliveryRecord, 'groupBy', async (args: any) => { query = args; return []; });
  await handlerFor(records, '/active-counts')({ user: actor('TASS') }, { setHeader() {}, json() {} });
  assert.ok(query.where.status.in.includes('RESCHEDULED'));
  assert.equal(query.where.draft, false);
});

test('aging means more than 7 Manila days since submission, with createdAt as the fallback', () => {
  const filter: any = dashboardRecordFilter('tass-rma-aging', TODAY);
  const cutoff = new Date('2026-11-02T16:00:00.000Z'); // Manila midnight on 2026-11-03
  assert.equal(filter.category, 'RMA');
  assert.equal(filter.draft, false);
  assert.deepEqual(filter.OR, [{ submittedAt: { lt: cutoff } }, { submittedAt: null, createdAt: { lt: cutoff } }]);
});

test('TASS overview lists On-Hold RMA first, then the oldest submission, and adds aging counts', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: NOW });
  const reads: any[] = [];
  const row = (id: string, status: string) => ({ id, category: 'RMA', status, draft: false, company: { name: 'Client' }, driverAssistants: '[]',
    lineItems: [], reference: '', deliveryDate: '2026-11-03', createdAt: new Date(), updatedAt: new Date(), submittedAt: new Date() });
  const db: any = { deliveryRecord: {
    count: async (query: any) => { reads.push({ op: 'count', ...query }); return 14; },
    findMany: async (query: any) => { reads.push({ op: 'records', ...query }); return query.where.AND[2].status === 'ON_HOLD'
      ? [row('hold-1', 'ON_HOLD'), row('hold-2', 'ON_HOLD')] : Array.from({ length: query.take }, (_, i) => row(`open-${i}`, 'PENDING')); },
  } };
  const result: any = await dashboardOverview(db, actor('TASS'));
  assert.equal(result.generated_at, new Date(NOW).toISOString());
  assert.equal(result.counts['tass-open-rma'], 14);
  assert.equal(result.counts.rma_attention, 14);
  assert.ok('tass-rma-on-hold' in result.counts && 'tass-rma-aging' in result.counts);
  const previews = result.record_previews.rma_attention.map((record: any) => record.id);
  assert.deepEqual(previews.slice(0, 2), ['hold-1', 'hold-2']);
  assert.equal(previews.length, 10);
  const [first, second] = reads.filter(read => read.op === 'records');
  assert.deepEqual(first.where.AND[2], dashboardRecordFilter('tass-rma-on-hold', TODAY));
  assert.equal(second.take, 8);
  assert.deepEqual(second.where.AND[2].AND[1], { status: { not: 'ON_HOLD' } });
  for (const read of [first, second]) {
    assert.deepEqual(read.orderBy, [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }]);
  }
});

test('overview reports its generation time for every role', async () => {
  const db: any = { deliveryRecord: { count: async () => 0, aggregate: async () => ({ _sum: { amount: 0 } }), groupBy: async () => [], findMany: async () => [] } };
  for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'ADMIN']) {
    assert.match(String((await dashboardOverview(db, actor(role)) as any).generated_at), /^\d{4}-\d{2}-\d{2}T/);
  }
});

test('RMA transport requests use one shared filter for the Logistics panel total and its view-all list', () => {
  assert.deepEqual(dashboardRecordFilter('log-rma-requests', TODAY), {
    category: 'RMA', draft: false, rmaMovement: 'LOGISTICS_TRANSPORT', status: { not: 'ACCOMPLISHED' }, rmaTransportStatus: { not: 'COMPLETED' },
  });
});
