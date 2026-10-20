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
async function invoke(path: string, query: Record<string, string>, userOverride?: Partial<{ role: string; effectiveScreens: string[] }>) {
  const route = (reports as any).stack.find((layer: any) => layer.route?.path === path).route;
  let body: any;
  const user = { role: 'ADMIN', name: 'Admin', permissions: [], effectiveScreens: ['statistical_reports'] as string[], ...userOverride };
  await route.stack.at(-1).handle({ query, user }, { json(value: any) { body = value; } }, (error: unknown) => { if (error) throw error; });
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
    gte: '2026-10-05T16:00:00.000Z',
    lt: '2026-10-06T16:00:00.000Z',
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

test('date-filtered summary counts the exact Manila boundary using Prisma String filters', async () => {
  stub(prisma.deliveryRecord, 'findMany', async () => []);
  stub(prisma.deliveryRecord, 'count', async ({ where }: any) => {
    assert.equal(typeof where.timeOut.gte, 'string');
    assert.equal(typeof where.timeOut.lt, 'string');
    return ['2026-10-05T15:59:59.999Z', '2026-10-05T16:00:00.000Z', '2026-10-06T15:59:59.999Z', '2026-10-06T16:00:00.000Z']
      .filter(value => value >= where.timeOut.gte && value < where.timeOut.lt).length;
  });
  const report = await invoke('/summary', { deliveryDateFrom: '2026-10-06', deliveryDateTo: '2026-10-06' });
  assert.equal(report.completed_in_range, 2);
});

test('summary forwards database failures to Express instead of leaving the request pending', async () => {
  const error = new Error('report database failure');
  stub(prisma.deliveryRecord, 'findMany', async () => { throw error; });
  stub(prisma.deliveryRecord, 'count', async () => 0);
  await assert.rejects(invoke('/summary', {}), error);
});

// ── DEF-029 acceptance: additional boundary cases ─────────────────────────────

test('single lower bound without upper returns records from that date onward in the cohort', async () => {
  let cohortQuery: any;
  stub(prisma.deliveryRecord, 'findMany', async (q: any) => { cohortQuery = q; return []; });
  stub(prisma.deliveryRecord, 'count', async () => 0);
  await invoke('/summary', { deliveryDateFrom: '2026-10-01' });
  assert.deepEqual(cohortQuery.where.deliveryDate, { gte: '2026-10-01' });
});

test('single upper bound without lower returns records up to and including that date in the cohort', async () => {
  let cohortQuery: any;
  stub(prisma.deliveryRecord, 'findMany', async (q: any) => { cohortQuery = q; return []; });
  stub(prisma.deliveryRecord, 'count', async () => 0);
  await invoke('/summary', { deliveryDateTo: '2026-10-31' });
  assert.deepEqual(cohortQuery.where.deliveryDate, { lte: '2026-10-31' });
});

test('unbounded summary (no dates) returns a result without a deliveryDate filter', async () => {
  let cohortQuery: any;
  stub(prisma.deliveryRecord, 'findMany', async (q: any) => { cohortQuery = q; return []; });
  stub(prisma.deliveryRecord, 'count', async () => 0);
  const result = await invoke('/summary', {});
  assert.equal(result.total, 0);
  assert.equal(cohortQuery.where.deliveryDate, undefined);
});

test('inverted date range (from after to) is rejected with 400 before any database query', async () => {
  const findMany = stub(prisma.deliveryRecord, 'findMany', async () => []);
  const count    = stub(prisma.deliveryRecord, 'count',    async () => 0);
  const route = (reports as any).stack.find((layer: any) => layer.route?.path === '/summary').route;
  let status = 200; let body: any;
  const req = { query: { deliveryDateFrom: '2026-12-31', deliveryDateTo: '2026-07-01' }, user: { role: 'ADMIN', name: 'Admin', permissions: [], effectiveScreens: ['statistical_reports'] } };
  const res = { status(v: number) { status = v; return this; }, json(v: any) { body = v; return this; } };
  await route.stack.at(-1).handle(req, res, (err: unknown) => { if (err) throw err; });
  assert.equal(status, 400);
  assert.ok(body?.error, 'should include an error message');
  assert.equal(findMany.mock.callCount(), 0);
  assert.equal(count.mock.callCount(), 0);
});

test('Sales Coordinator without a statistical_reports grant is denied with 403', async () => {
  const route = (reports as any).stack.find((layer: any) => layer.route?.path === '/summary').route;
  let status = 200; let body: any;
  const req = { query: {}, user: { role: 'SALES_COORDINATOR', name: 'Sales', permissions: [], effectiveScreens: ['deliveries', 'dashboard'] } };
  const res = { status(v: number) { status = v; return this; }, json(v: any) { body = v; return this; } };
  let nextCalled = false;
  await route.stack.at(-2).handle(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(status, 403);
  assert.equal(body?.error, 'Module access denied');
});

test('Sales Coordinator with Admin-granted statistical_reports screen receives a summary', async () => {
  stub(prisma.deliveryRecord, 'findMany', async () => []);
  stub(prisma.deliveryRecord, 'count', async () => 5);
  const result = await invoke('/summary', {}, { role: 'SALES_COORDINATOR', effectiveScreens: ['statistical_reports'] });
  assert.equal(result.completed_in_range, 5);
});

test('two sequential requests receive independent results and the first error does not taint a later success', async () => {
  let shouldFail = true;
  stub(prisma.deliveryRecord, 'findMany', async () => {
    if (shouldFail) {
      shouldFail = false;
      throw new Error('transient failure');
    }
    return [];
  });
  stub(prisma.deliveryRecord, 'count', async () => 3);
  await assert.rejects(invoke('/summary', {}));   // first request fails
  const second = await invoke('/summary', {});    // second must see its own result
  assert.equal(second.completed_in_range, 3);
});

test('first request with exact failing date range (2026-07-01 to 2026-12-31) succeeds and repeat succeeds immediately', async () => {
  let completionQuery: any;
  stub(prisma.deliveryRecord, 'findMany', async () => records);
  stub(prisma.deliveryRecord, 'count', async (q: any) => { completionQuery = q; return 2; });

  const query = { deliveryDateFrom: '2026-07-01', deliveryDateTo: '2026-12-31', category: 'Deliveries' };
  const first = await invoke('/summary', query);
  assert.equal(first.total, 3);
  assert.equal(first.completed_in_range, 2);
  assert.deepEqual(completionQuery.where.timeOut, {
    gte: '2026-06-30T16:00:00.000Z',
    lt: '2026-12-31T16:00:00.000Z',
  });

  // Second immediate attempt without any retry delay or intervening reset
  const repeat = await invoke('/summary', query);
  assert.equal(repeat.total, 3);
  assert.equal(repeat.completed_in_range, 2);
});

