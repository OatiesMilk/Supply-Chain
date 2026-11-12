import assert from 'node:assert/strict';
import { mock, test, type TestContext } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/db';
import type * as mailer from '../src/services/mailer';
import nodemailer from 'nodemailer';
import { notifyAccomplished } from '../src/services/notify';
import { defaultRolePermissions, type PolicyRole } from '../src/services/permissionCatalog';
import { canDispatchRecordMail } from '../src/services/mailPermissions';
import { sessionUser } from '../src/services/permissions';
import { signToken, type AuthUser } from '../src/middleware/auth';
import notifications from '../src/routes/notifications';

const account = (id: string, role: PolicyRole = 'TASS', extra: Record<string, unknown> = {}) => ({
  id, name: id, email: `${id}@example.test`, role, isActive: true, permissions: [],
  authorizationRevision: 1n, permissionOverrides: [], permissionConversion: { catalogVersion: 1 }, driverProfile: null, ...extra,
});
const record = (extra: Record<string, unknown> = {}) => ({ id: 'collection-1', category: 'ACCOUNTING_COLLECTION', status: 'ACCOMPLISHED',
  draft: false, deletedAt: null, company: { name: 'Test Company' }, reference: 'COL-1', deliveryDate: '2026-10-30', accountManager: 'am', ...extra });
const completed = { id: 'collection-1', companyName: 'Test Company', reference: 'COL-1', deliveryDate: '2026-10-30',
  accountManager: 'am', accomplishedByName: 'Driver' };

function fixture(t: TestContext, mode = 'V1') {
  const env = Object.fromEntries(['PERMISSION_MODE', 'BILLING_NOTIFICATION_USER_EMAIL', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'SMTP_HOST'].map(key => [key, process.env[key]]));
  for (const key of ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'SMTP_HOST']) delete process.env[key];
  process.env.PERMISSION_MODE = mode;
  delete process.env.BILLING_NOTIFICATION_USER_EMAIL;
  const logs: any[] = [], sends: mailer.MailMessage[] = [];
  let users = [account('billing'), account('actor', 'ADMIN')];
  let saved = record();
  process.env.SMTP_HOST = 'isolated-transport.test';
  let ok = true;
  let throwSend = false;
  const restorers: Array<() => void> = [];
  const stub = (object: any, key: string, fn: (...args: any[]) => any) => {
    const old = object[key]; object[key] = mock.fn(fn); restorers.push(() => { object[key] = old; });
  };
  stub(prisma, '$transaction', async (work: any) => work(prisma));
  stub(prisma.user, 'findUnique', async ({ where }: any) => users.find(user => user.id === where.id) ?? null);
  stub(prisma.user, 'findMany', async ({ where }: any) => users.filter(user => user.isActive &&
    (where.email ? user.email.toLowerCase() === where.email.equals.toLowerCase()
      : where.name ? user.name.toLowerCase() === where.name.equals.toLowerCase() : user.role === where.role)));
  // No directory rows: AM mail uses the exact unique-name rule these tests cover.
  stub(prisma.accountManager, 'findUnique', async () => null);
  stub(prisma.rolePolicy, 'findUnique', async ({ where }: any) => ({ role: where.role, revision: 1n, catalogVersion: 1,
    permissions: [...defaultRolePermissions(where.role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) }));
  stub(prisma.deliveryRecord, 'findFirst', async () => saved);
  stub(prisma.notificationLog, 'create', async ({ data }: any) => { logs.push(data); return data; });
  // Replace the actual transport boundary. No provider credentials or network
  // requests are used, even if the developer environment contains mail settings.
  stub(nodemailer, 'createTransport', () => ({ sendMail: async (message: mailer.MailMessage) => {
    sends.push(message);
    if (throwSend || !ok) throw new Error('Simulated transport rejection');
    return {};
  } }));
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  t.after(() => {
    while (restorers.length) restorers.pop()!();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  return { logs, sends, setUsers(value: typeof users) { users = value; }, setRecord(value: typeof saved) { saved = value; },
    configureBilling() { process.env.BILLING_NOTIFICATION_USER_EMAIL = 'billing@example.test'; },
    setResult(value: mailer.SendMethod, success = true) { if (value === 'mock') delete process.env.SMTP_HOST; else process.env.SMTP_HOST = 'isolated-transport.test'; ok = success; }, throwSend() { throwSend = true; } };
}

for (const mode of ['LEGACY', 'V1']) {
  test(`${mode}: collection completion resolves approved billing account with read access and persists actual outcome`, async t => {
    const state = fixture(t, mode); state.configureBilling();
    assert.deepEqual(await notifyAccomplished(completed), { sent: 1, failed: 0, mocked: 0, skipped: 0 });
    assert.equal(state.sends[0].to, 'billing@example.test');
    assert.match(state.sends[0].subject, /Collection Collected/);
    assert.equal(state.logs[0].recipientRole, 'BILLING');
    assert.equal(state.logs[0].status, 'SENT');
    assert.match(state.logs[0].message, /Record: collection-1/);
  });
  test(`${mode}: missing billing mapping is recorded as skipped without sending`, async t => {
    const state = fixture(t, mode);
    assert.deepEqual(await notifyAccomplished({ ...completed, recipientOverride: 'Billing Department' }), { sent: 0, failed: 0, mocked: 0, skipped: 1 });
    assert.equal(state.sends.length, 0); assert.equal(state.logs[0].status, 'SKIPPED');
  });
  test(`${mode}: billing mapping cannot bypass current account denial, inactivity or ambiguous identity`, async t => {
    const state = fixture(t, mode); state.configureBilling();
    const denied = mode === 'V1' ? { permissionOverrides: [{ permissionKey: 'CATEGORY:ACCOUNTING_COLLECTION:READ', effect: 'DENY' }] }
      : { permissions: [{ screen: 'accounting_collection', granted: false }] };
    for (const users of [
      [account('billing', 'TASS', denied)], [account('billing', 'TASS', { isActive: false })],
      [account('billing'), account('duplicate', 'TASS', { email: 'billing@example.test' })],
    ]) {
      state.setUsers(users);
      assert.equal((await notifyAccomplished(completed)).skipped, 1);
    }
    assert.equal(state.sends.length, 0); assert.equal(state.logs.length, 3);
  });
}

test('automatic AM notifications use an exact authorized identity, never a generated address', async t => {
  const state = fixture(t, 'LEGACY'); state.setRecord(record({ category: 'DELIVERY' }));
  assert.equal((await notifyAccomplished(completed)).skipped, 1);
  state.setUsers([account('am', 'SALES_COORDINATOR')]);
  assert.equal((await notifyAccomplished(completed)).sent, 1);
  assert.equal(state.sends[0].to, 'am@example.test');
  state.setUsers([account('am', 'SALES_COORDINATOR'), account('other', 'SALES_COORDINATOR', { name: 'am' })]);
  assert.equal((await notifyAccomplished(completed)).skipped, 1);
  assert.equal(state.sends.length, 1);
});

test('mock delivery and provider failures are never counted as sent', async t => {
  const state = fixture(t); state.configureBilling(); state.setResult('mock');
  assert.equal((await notifyAccomplished(completed)).mocked, 1);
  state.setResult('smtp', false);
  assert.equal((await notifyAccomplished(completed)).failed, 1);
  state.throwSend();
  assert.equal((await notifyAccomplished(completed)).failed, 1);
  assert.deepEqual(state.logs.map(log => log.status), ['MOCKED', 'FAILED', 'FAILED']);
});

async function endpoint(t: TestContext) {
  const app = express(); app.use(express.json(), cookieParser()); app.use('/notifications', notifications);
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const actor = account('actor', 'ADMIN');
  return (recipients: string[], trigger = 'Accomplished') => fetch(`http://127.0.0.1:${(server.address() as any).port}/notifications/send-email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `mg_session=${signToken({ id: actor.id, name: actor.name, email: actor.email, role: actor.role })}` },
    body: JSON.stringify({ recordId: 'collection-1', trigger, recipients }),
  });
}

test('email endpoint reports real, mocked, failed and skipped outcomes and deduplicates destinations', async t => {
  const state = fixture(t); state.setRecord(record({ category: 'DELIVERY' }));
  const post = await endpoint(t);
  state.setUsers([account('actor', 'ADMIN'), account('am', 'LOGISTICS')]);
  state.setResult('mock');
  const mockResponse = await post(['AM', 'LOGISTICS', 'TASS']);
  assert.equal(mockResponse.status, 200);
  assert.deepEqual(await mockResponse.json(), { ok: false, sent: 0, failed: 0, mocked: 1, skipped: 1, resolvedCount: 1 });
  assert.equal(state.sends.length, 0, 'mock delivery never invokes a real transport');
  assert.deepEqual(state.logs.map(log => log.status), ['SKIPPED', 'MOCKED']);
  assert.equal(state.logs[1].recipientRole, 'ACCOUNT_MANAGER,LOGISTICS');
  state.setResult('smtp');
  assert.deepEqual(await (await post(['AM'])).json(), { ok: true, sent: 1, failed: 0, mocked: 0, skipped: 0, resolvedCount: 1 });
  state.setResult('smtp', false);
  assert.deepEqual(await (await post(['AM'])).json(), { ok: false, sent: 0, failed: 1, mocked: 0, skipped: 0, resolvedCount: 1 });
});

test('mail lifecycle checks never infer collection verification from accomplishment in either mode', () => {
  for (const activeMode of [undefined, 'V1'] as const) {
    const actor = { ...sessionUser(account('actor', 'LOGISTICS')), activeMode } as AuthUser;
    assert.equal(canDispatchRecordMail(actor, record({ collectionVerified: false }), 'Collection Verified'), false);
    assert.equal(canDispatchRecordMail(actor, record({ collectionVerified: true }), 'Collection Verified'), false);
  }
});
