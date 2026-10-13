import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import reports from '../src/routes/reports';
import { saveDailyStatusSnapshot } from '../src/services/dailyStatusSnapshot';

const restorers: (() => void)[] = [];
function stub(target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  const replacement = mock.fn(implementation);
  target[key] = replacement;
  restorers.push(() => { target[key] = original; });
  return replacement;
}
afterEach(() => { while (restorers.length) restorers.pop()!(); mock.restoreAll(); });

const records = [
  { category: 'DELIVERY', status: 'SCHEDULED', draft: true, timeIn: null, deliveryDate: '2026-10-06' },
  { category: 'DELIVERY', status: 'SCHEDULED', draft: false, timeIn: null, deliveryDate: '2026-10-06' },
  { category: 'DELIVERY', status: 'SCHEDULED', draft: false, timeIn: '2026-10-06T01:00:00Z', deliveryDate: '2026-10-06' },
];
async function invoke(path: string, query: Record<string, string>) {
  const route = (reports as any).stack.find((layer: any) => layer.route?.path === path).route;
  let body: any;
  await route.stack.at(-1).handle({ query, user: { role: 'ADMIN', name: 'Admin', permissions: [], effectiveScreens: ['statistical_reports'] } }, { json(value: any) { body = value; } });
  return body;
}



test('statistical summary uses the same draft and started-run states as records', async () => {
  stub(prisma.deliveryRecord, 'findMany', async () => records);
  stub(prisma.deliveryRecord, 'count', async () => 0);
  const all = await invoke('/summary', {});
  assert.deepEqual(all.by_status, [{ status: 'Draft', count: 1 }, { status: 'Scheduled', count: 1 }, { status: 'In Transit', count: 1 }]);
  const started = await invoke('/summary', { status: 'In Transit' });
  assert.equal(started.total, 1);
  assert.deepEqual(started.by_status, [{ status: 'In Transit', count: 1 }]);
});

test('statistical report applies Manila Delivery Date filters and counts completion by Time Out separately', async () => {
  let cohortQuery: any;
  let completionQuery: any;
  stub(prisma.deliveryRecord, 'findMany', async (query: any) => { cohortQuery = query; return records; });
  stub(prisma.deliveryRecord, 'count', async (query: any) => { completionQuery = query; return 2; });

  const summary = await invoke('/summary', {
    deliveryDateFrom: '2026-10-06', deliveryDateTo: '2026-10-06', category: 'Deliveries',
  });
  assert.deepEqual(cohortQuery.where.deliveryDate, { gte: '2026-10-06', lte: '2026-10-06' });
  assert.equal(cohortQuery.where.AND[0].category.in.includes('DELIVERY'), true);
  assert.deepEqual(completionQuery.where.timeOut, {
    gte: new Date('2026-10-05T16:00:00.000Z'),
    lt: new Date('2026-10-06T16:00:00.000Z'),
  });
  assert.equal(completionQuery.where.status, 'ACCOMPLISHED');
  assert.equal(completionQuery.where.AND[0].category.in.includes('DELIVERY'), true);
  assert.equal(summary.completed_in_range, 2);
  assert.deepEqual(summary.date_basis, {
    cohort: 'deliveryDate', completion: 'timeOut', time_zone: 'Asia/Manila',
  });
});

test('snapshot rollups keep Draft distinct and atomically replace today to remove stale counts', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T16:01:00Z').getTime() });
  stub(prisma.deliveryRecord, 'findMany', async () => records);
  const remove = stub(prisma.dailyStatusSnapshot, 'deleteMany', (args: any) => ({ remove: args }));
  const create = stub(prisma.dailyStatusSnapshot, 'createMany', (args: any) => ({ create: args }));
  const transaction = stub(prisma, '$transaction', async (operations: any[]) => operations);
  await saveDailyStatusSnapshot();
  assert.deepEqual(remove.mock.calls[0].arguments[0], { where: { date: '2026-10-06' } });
  const rows = create.mock.calls[0].arguments[0].data;
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.filter((row: any) => row.category === 'ALL').map((row: any) => [row.status, row.count]), [['DRAFT', 1], ['SCHEDULED', 1], ['IN_TRANSIT', 1]]);
  assert.equal(transaction.mock.calls[0].arguments[0].length, 2);
});
