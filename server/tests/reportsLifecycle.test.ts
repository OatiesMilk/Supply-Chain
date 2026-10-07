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
  await route.stack.at(-1).handle({ query }, { json(value: any) { body = value; } });
  return body;
}



test('statistical summary uses the same draft and started-run states as records', async () => {
  stub(prisma.deliveryRecord, 'findMany', async () => records);
  const all = await invoke('/summary', {});
  assert.deepEqual(all.by_status, [{ status: 'Draft', count: 1 }, { status: 'Scheduled', count: 1 }, { status: 'In Transit', count: 1 }]);
  const started = await invoke('/summary', { status: 'In Transit' });
  assert.equal(started.total, 1);
  assert.deepEqual(started.by_status, [{ status: 'In Transit', count: 1 }]);
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
