import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import records from '../src/routes/records';

const originalFindMany = prisma.deliveryRecord.findMany;
const originalCount = prisma.deliveryRecord.count;
afterEach(() => {
  prisma.deliveryRecord.findMany = originalFindMany;
  prisma.deliveryRecord.count = originalCount;
  mock.restoreAll();
});

async function list(query: Record<string, string>, rows: any[] = []) {
  const calls: any[] = [];
  prisma.deliveryRecord.findMany = mock.fn(async (args: any) => {
    calls.push(args);
    return rows;
  }) as any;
  prisma.deliveryRecord.count = mock.fn(async () => rows.length) as any;
  const layer = (records as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.get);
  assert.ok(layer, 'records list GET route must exist');
  let status = 200;
  let body: any;
  const req = {
    query: { category: 'Deliveries', paged: 'true', page: '1', limit: '2', ...query },
    user: { id: 'admin-qa', name: 'QA Admin', role: 'ADMIN', effectiveScreens: ['deliveries'], permissions: [] },
  };
  const res = {
    status(value: number) { status = value; return this; },
    json(value: any) { body = value; return this; },
  };
  await layer.route.stack.at(-1).handle(req, res, (error: unknown) => { if (error) throw error; });
  return { status, body, calls };
}

test('oldest and furthest date sorting order the scoped query before the page offset', async () => {
  for (const [sort, direction] of [['oldest', 'asc'], ['furthest', 'desc']] as const) {
    const result = await list({ dateSort: sort, page: '2' });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 1);
    assert.deepEqual(result.calls[0].orderBy, [{ deliveryDate: direction }, { id: 'asc' }]);
    assert.equal(result.calls[0].skip, 2);
    assert.equal(result.calls[0].take, 3);
    assert.ok(result.calls[0].where.AND.length > 0, 'scoped conditions retained');
  }
});

test('nearest sort collects bounded nearest candidates from both sides of today before slicing page two', async () => {
  const result = await list({ dateSort: 'nearest', page: '2' });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 3);
  assert.deepEqual(result.calls[0].orderBy, [{ deliveryDate: 'desc' }, { id: 'asc' }]);
  assert.deepEqual(result.calls[1].orderBy, [{ deliveryDate: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(result.calls[2].orderBy, [{ id: 'asc' }]);
  for (const call of result.calls) {
    assert.equal(call.take, 5);
    assert.ok(call.where.AND[0].AND, 'original role/category/date constraints must remain present');
  }
});

test('rejects an unsupported sort mode and disallows mixing cursor with non-default date sort', async () => {
  const invalid = await list({ dateSort: 'unexpected' });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /dateSort/);
  assert.equal(invalid.calls.length, 0);

  const mixed = await list({ dateSort: 'oldest', cursor: 'c_test' });
  assert.equal(mixed.status, 400);
  assert.match(mixed.body.error, /cursor/);
  assert.equal(mixed.calls.length, 0);
});
