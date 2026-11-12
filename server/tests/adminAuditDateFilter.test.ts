import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import admin from '../src/routes/admin';
import users from '../src/routes/users';
import nodemailer from 'nodemailer';

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
    { user: { activeMode: 'LEGACY' }, query: { from: '2026-10-06', to: '2026-10-06' } },
    { json() {} },
  );

  assert.equal(queryWhere.timestamp.gte.toISOString(), '2026-10-05T16:00:00.000Z');
  assert.equal(queryWhere.timestamp.lt.toISOString(), '2026-10-06T16:00:00.000Z');
  assert.equal(queryWhere.timestamp.lte, undefined);
});

function handler(router: any, path: string) {
  const route = router.stack.find((layer: any) => layer.route?.path === path).route;
  return route.stack[route.stack.length - 1].handle;
}

test('admin audit rejects malformed pagination and date ranges before querying the database', async () => {
  let queries = 0;
  stub(prisma.auditLog, 'findMany', async () => { queries++; return []; });
  stub(prisma.auditLog, 'count', async () => { queries++; return 0; });
  for (const query of [
    { page: 'garbage' }, { page: '1x' }, { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: ['1', '2'] },
    { page: '9007199254740992' }, { page: '2147483648', limit: '200' },
    { limit: 'NaN' }, { limit: '0' }, { limit: '3.5' }, { limit: ['50'] },
    { from: 'not-a-date' }, { to: 'not-a-date' }, { from: '2026-02-30' }, { to: '2026-13-01' },
    { from: '2026-02-30T08:00:00Z' }, { to: '2026-02-30 08:00:00+08:00' },
    { from: ['2026-10-06'] }, { to: { date: '2026-10-06' } },
    { from: '2026-10-07', to: '2026-10-06' },
    { from: '2026-10-06T10:00:00Z', to: '2026-10-06T09:59:59Z' },
  ]) {
    let status = 200;
    let body: any;
    let forwarded: unknown;
    await handler(admin, '/audit-log')({ user: { activeMode: 'LEGACY' }, query }, {
      status(value: number) { status = value; return this; }, json(value: unknown) { body = value; },
    }, (error: unknown) => { forwarded = error; });
    assert.equal(status, 400, JSON.stringify(query));
    assert.equal(typeof body?.error, 'string');
    assert.equal(forwarded, undefined);
  }
  assert.equal(queries, 0);
});

test('admin audit preserves timestamp bounds, capped limits and empty optional dates', async () => {
  let actual: any;
  let payload: any;
  stub(prisma.auditLog, 'findMany', async (query: any) => { actual = query; return []; });
  stub(prisma.auditLog, 'count', async () => 0);
  await handler(admin, '/audit-log')({ user: { activeMode: 'LEGACY' }, query: {
    page: '2', limit: '500', from: '2026-10-06T08:30:00+08:00', to: '2026-10-06T12:30:00Z',
  } }, { json(value: unknown) { payload = value; } }, assert.ifError);
  assert.equal(actual.skip, 200);
  assert.equal(actual.take, 200);
  assert.equal(actual.where.timestamp.gte.toISOString(), '2026-10-06T00:30:00.000Z');
  assert.equal(actual.where.timestamp.lte.toISOString(), '2026-10-06T12:30:00.000Z');
  assert.equal(actual.where.timestamp.lt, undefined);
  assert.equal(payload.limit, 200);
  await handler(admin, '/audit-log')({ user: { activeMode: 'LEGACY' }, query: { from: '', to: '' } },
    { json() {} }, assert.ifError);
  assert.equal(actual.where.timestamp, undefined);
});

test('admin audit, integration status and user listing forward database failures to Express', async () => {
  const failure = new Error('Isolated database failure');
  stub(prisma.auditLog, 'findMany', async () => { throw failure; });
  stub(prisma.auditLog, 'count', async () => 0);
  stub(prisma, '$queryRaw', async () => { throw failure; });
  stub(prisma.user, 'count', async () => { throw failure; });
  stub(prisma.user, 'findMany', async () => { throw failure; });
  for (const [router, path, activeMode] of [
    [admin, '/audit-log', 'LEGACY'], [admin, '/audit-log', 'V1'],
    [admin, '/integration-status', 'LEGACY'], [users, '/', 'LEGACY'],
  ] as const) {
    let forwarded: unknown;
    let replies = 0;
    await handler(router, path)({ user: { activeMode }, query: {} }, { json() { replies++; } },
      (error: unknown) => { forwarded = error; });
    assert.equal(forwarded, failure, path);
    assert.equal(replies, 0);
  }
});

test('admin test email forwards unexpected transport setup errors without using a provider', async () => {
  const envKeys = ['SMTP_HOST', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const failure = new Error('Isolated transport setup failure');
  stub(nodemailer, 'createTransport', () => { throw failure; });
  try {
    for (const key of envKeys) delete process.env[key];
    process.env.SMTP_HOST = 'isolated-transport.test';
    let forwarded: unknown;
    await handler(admin, '/test-email')({ body: { to: 'admin@example.test' } }, {
      json() { assert.fail('A transport setup failure must reach error middleware'); },
    }, (error: unknown) => { forwarded = error; });
    assert.equal(forwarded, failure);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
