import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from '../src/routes/auth';
import usersRoutes from '../src/routes/users';
import { signToken } from '../src/middleware/auth';
import { prisma } from '../src/db';
import { createSsoState } from '../src/services/ssoState';

const GUID = 'ce7af71e-cdd0-4be6-93a9-ec280e1c10df';
const TENANT = '7411f7e0-fb01-415c-8136-f9c30b06393f';
const admin = { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', isActive: true, permissions: [], driverProfile: null };
const sales = { ...admin, id: 'sales-1', role: 'SALES_COORDINATOR' };
const target = { ...sales, id: 'target-1', email: 'approved@example.com', microsoftOid: null as string | null };
afterEach(() => mock.restoreAll());

async function appServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRoutes);
  app.use('/users', usersRoutes);
  app.use((_error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: 'internal' }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  return {
    url: 'http://127.0.0.1:' + (server.address() as { port: number }).port,
    close: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
  };
}
const cookieFor = (user: typeof admin) => 'mg_session=' + signToken(user);

test('Microsoft callback rejects missing and mismatched browser state before contacting Microsoft/DB', async () => {
  const previous = { ...process.env };
  const app = await appServer();
  const consumed = prisma.oAuthLoginState.deleteMany;
  let dbHits = 0;
  prisma.oAuthLoginState.deleteMany = mock.fn(async () => { dbHits++; throw new Error('State DB should not be called'); }) as any;
  Object.assign(process.env, { AZURE_CLIENT_ID: 'client', AZURE_CLIENT_SECRET: 'secret', AZURE_TENANT_ID: TENANT, APP_URL: 'http://localhost:3000', NODE_ENV: 'development' });
  const state = createSsoState();
  try {
    const paths = [
      { url: '/auth/microsoft/callback?code=code', cookie: '' },
      { url: '/auth/microsoft/callback?code=code&state=' + state, cookie: '' },
      { url: '/auth/microsoft/callback?code=code&state=' + state, cookie: 'mg_sso_state=' + createSsoState() },
    ];
    for (const { url, cookie } of paths) {
      const res = await fetch(app.url + url, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : undefined });
      assert.equal(res.status, 302);
      assert.match(res.headers.get('location') || '', /sso_invalid_state/);
      assert.match(res.headers.get('set-cookie') || '', /mg_sso_state=/);
    }
    assert.equal(dbHits, 0);
  } finally {
    prisma.oAuthLoginState.deleteMany = consumed;
    for (const key of ['AZURE_CLIENT_ID','AZURE_CLIENT_SECRET','AZURE_TENANT_ID','APP_URL','NODE_ENV']) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await app.close();
  }
});

test('Microsoft account prelink is Admin-only, audited, rejects bad IDs and duplicates', async () => {
  const originalUserLookup = prisma.user.findUnique;
  const originalTransaction = prisma.$transaction;
  const app = await appServer();
  let actedOn = { ...target };
  const entries: any[] = [];
  let updates = 0;
  prisma.user.findUnique = mock.fn(async ({ where }: any) => where.id === admin.id ? admin : where.id === sales.id ? sales : actedOn) as any;
  prisma.$transaction = mock.fn(async (fn: any) => fn({
    user: {
      findUnique: async () => actedOn,
      update: async ({ data }: any) => {
        updates++;
        if (data.microsoftOid === '00000000-0000-0000-0000-000000000000') throw { code: 'P2002' };
        actedOn = { ...actedOn, microsoftOid: data.microsoftOid };
        return actedOn;
      },
    },
    auditLog: { create: async ({ data }: any) => { entries.push(data); return data; } }
  })) as any;
  try {
    const path = app.url + '/users/' + target.id + '/microsoft-identity';
    const req = (actor: typeof admin | null, value: unknown) => fetch(path, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(actor ? { Cookie: cookieFor(actor) } : {}) },
      body: JSON.stringify({ microsoft_oid: value })
    });
    assert.equal((await req(null, GUID)).status, 401);
    assert.equal((await req(sales, GUID)).status, 403);
    assert.equal((await req(admin, 'common')).status, 400);
    assert.equal(updates, 0);
    const linked = await req(admin, GUID);
    assert.equal(linked.status, 200);
    assert.deepEqual(await linked.json(), { user_id: target.id, microsoft_linked: true });
    assert.equal(actedOn.microsoftOid, GUID);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].changedById, admin.id);
    assert.equal((await req(admin, '00000000-0000-0000-0000-000000000000')).status, 409);
    const removed = await req(admin, null);
    assert.equal(removed.status, 200);
    assert.equal(actedOn.microsoftOid, null);
  } finally {
    prisma.user.findUnique = originalUserLookup;
    prisma.$transaction = originalTransaction;
    await app.close();
  }
});
