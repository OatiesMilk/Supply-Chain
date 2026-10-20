import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import admin from '../src/routes/admin';

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

test('admin audit date filters cover the full Manila day', async () => {
  let queryWhere: any;
  stub(prisma.auditLog, 'findMany', async (query: any) => { queryWhere = query.where; return []; });
  stub(prisma.auditLog, 'count', async (query: any) => { queryWhere = query.where; return 0; });
  const route = (admin as any).stack.find((layer: any) => layer.route?.path === '/audit-log').route;
  const handler = route.stack[route.stack.length - 1].handle;

  await handler(
    { query: { from: '2026-10-06', to: '2026-10-06' } },
    { json() {} },
  );

  assert.equal(queryWhere.timestamp.gte.toISOString(), '2026-10-05T16:00:00.000Z');
  assert.equal(queryWhere.timestamp.lt.toISOString(), '2026-10-06T16:00:00.000Z');
  assert.equal(queryWhere.timestamp.lte, undefined);
});
