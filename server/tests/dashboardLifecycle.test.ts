import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import dashboard from '../src/routes/dashboard';

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
  await handler({ user: { role } }, { json(body: any) { response = body; } });
  return { queries, response };
}

test('dashboard today uses Manila midnight and excludes drafts from assignment counts', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T16:01:00Z').getTime() });
  const { queries, response } = await stats('LOGISTICS');
  assert.equal(response.role, 'LOGISTICS');
  assert.equal(queries[0].deliveryDate, '2026-10-06');
  assert.equal(queries[0].draft, false);
  assert.equal(queries[1].draft, false);
  assert.equal(queries[2].updatedAt.gte.toISOString(), '2026-10-05T16:00:00.000Z');
  assert.equal(queries[2].updatedAt.lt.toISOString(), '2026-10-06T16:00:00.000Z');
});

test('admin weekly statistics start at Sunday midnight in Manila', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-03T16:01:00Z').getTime() });
  const { queries } = await stats('ADMIN');
  assert.equal(queries[0].createdAt.gte.toISOString(), '2026-10-03T16:00:00.000Z');
});
