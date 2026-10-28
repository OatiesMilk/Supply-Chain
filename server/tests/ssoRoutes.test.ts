import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from '../src/routes/auth';
import usersRoutes from '../src/routes/users';
import { signToken } from '../src/middleware/auth';
import { prisma } from '../src/db';
import { createSsoState } from '../src/services/ssoState';
import bcrypt from 'bcryptjs';
import { approvedMicrosoftUser } from '../src/services/ssoIdentity';

const GUID = 'ce7af71e-cdd0-4be6-93a9-ec280e1c10df';
const TENANT = '7411f7e0-fb01-415c-8136-f9c30b06393f';
const admin = { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' as const, isActive: true,
  authorizationRevision: 1n, permissions: [], permissionOverrides: [], permissionConversion: null, driverProfile: null };
const sales = { ...admin, id: 'sales-1', role: 'SALES_COORDINATOR' as const };
const target = { ...sales, id: 'target-1', email: 'approved@example.com', microsoftOid: null as string | null, microsoftApprovedAt: null as Date | null };
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
const cookieFor = (user: typeof admin | typeof sales) => 'mg_session=' + signToken({ id: user.id, name: user.name, email: user.email, role: user.role });

test('Admin can approve Microsoft sign-in at creation, while ordinary accounts remain unlinked', async () => {
  const originalLookup = prisma.user.findUnique;
  const originalTransaction = prisma.$transaction;
  const app = await appServer();
  const rows: any[] = [];
  const audits: any[] = [];
  prisma.user.findUnique = mock.fn(async () => admin) as any;
  prisma.$transaction = mock.fn(async (fn: any) => fn({
    $executeRaw: async () => 1,
    $queryRaw: async () => [],
    user: { findUnique: async ({ where }: any) => where.id === admin.id ? admin : rows.find(row => row.id === where.id),
    create: async ({ data }: any) => {
      const row = { id: 'new-' + rows.length, authorizationRevision: 1n, microsoftOid: null, microsoftApprovedAt: null, createdAt: new Date(), ...data };
      rows.push(row);
      return row;
    } },
    auditLog: { create: async ({ data }: any) => { audits.push(data); return data; } },
  })) as any;
  const create = (microsoft_oid?: string) => fetch(app.url + '/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieFor(admin) },
    body: JSON.stringify({ name: 'New User', email: 'USER@example.com', password: 'password', role: 'SALES_COORDINATOR', ...(microsoft_oid ? { microsoft_oid } : {}) }),
  });
  try {
    const linked = await create(GUID.toUpperCase());
    assert.equal(linked.status, 201);
    const body = await linked.json() as any;
    assert.equal(body.microsoft_linked, true);
    assert.equal(body.role, 'SALES_COORDINATOR');
    assert.equal(body.email, 'user@example.com');
    assert.equal(body.password, undefined);
    assert.equal(rows[0].microsoftOid, GUID);
    assert.ok(rows[0].microsoftApprovedAt instanceof Date);
    const approval = await approvedMicrosoftUser({ user: { findUnique: async () => rows[0] } } as any, {
      oid: GUID, tid: TENANT, email: 'user@example.com',
    }, TENANT);
    assert.equal('user' in approval, true, 'created approval permits the matching tenant identity to sign in');
    assert.equal(await bcrypt.compare('password', rows[0].password), true);
    const identityAudits = audits.filter(entry => entry.recordType === 'User');
    assert.equal(identityAudits.length, 1);
    assert.equal(identityAudits[0].recordId, rows[0].id);
    assert.equal(identityAudits[0].changedById, admin.id);
    assert.equal(identityAudits[0].action, 'CREATE');
    assert.deepEqual(JSON.parse(identityAudits[0].newValue), { microsoft_linked: true, microsoft_oid: GUID, approved_at: rows[0].microsoftApprovedAt.toISOString() });
    const ordinary = await create();
    assert.equal(ordinary.status, 201);
    assert.equal((await ordinary.json() as any).microsoft_linked, false);
    assert.equal(rows[1].microsoftOid, null);
    assert.equal(rows[1].microsoftApprovedAt, null);
    assert.equal(audits.filter(entry => entry.recordType === 'User').length, 1);
    assert.equal(audits.filter(entry => entry.recordType === 'UserAuthorization').length, 2, 'both creations have attributable authorization audits');
  } finally {
    prisma.user.findUnique = originalLookup;
    prisma.$transaction = originalTransaction;
    await app.close();
  }
});

test('user creation requires Admin approval, a valid optional Object ID and a password', async () => {
  const originalLookup = prisma.user.findUnique;
  const originalTransaction = prisma.$transaction;
  const app = await appServer();
  let transactions = 0;
  prisma.user.findUnique = mock.fn(async ({ where }: any) => where.id === admin.id ? admin : sales) as any;
  prisma.$transaction = mock.fn(async () => { transactions++; throw new Error('must not write'); }) as any;
  const create = (actor: typeof admin | null, extra: object = {}) => fetch(app.url + '/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(actor ? { Cookie: cookieFor(actor) } : {}) },
    body: JSON.stringify({ name: 'User', email: 'user@example.com', password: 'password', role: 'SALES_COORDINATOR', microsoft_oid: GUID, ...extra }),
  });
  try {
    assert.equal((await create(null)).status, 401);
    assert.equal((await create(sales)).status, 403);
    for (const microsoft_oid of ['common', '', null, 123, {}, GUID + 'extra']) {
      assert.equal((await create(admin, { microsoft_oid })).status, 400);
    }
    assert.equal((await create(admin, { password: '' })).status, 400);
    assert.equal(transactions, 0);
  } finally {
    prisma.user.findUnique = originalLookup;
    prisma.$transaction = originalTransaction;
    await app.close();
  }
});

test('identity/email conflicts preserve 409 responses and an audit failure cannot commit a created user', async () => {
  const originalLookup = prisma.user.findUnique;
  const originalTransaction = prisma.$transaction;
  const app = await appServer();
  let failure = 'identity';
  const committed: any[] = [];
  prisma.user.findUnique = mock.fn(async () => admin) as any;
  // Stage writes until the transaction callback succeeds, as Prisma does.
  prisma.$transaction = mock.fn(async (fn: any) => {
    const pending: any[] = [];
    const result = await fn({
      $executeRaw: async () => 1,
      $queryRaw: async () => [],
      user: { findUnique: async ({ where }: any) => where.id === admin.id ? admin : null,
      create: async ({ data }: any) => {
        if (failure === 'adapter') throw { code: 'P2002', meta: { driverAdapterError: { cause: { constraint: { index: 'User_microsoftOid_key' } } } } };
        if (failure !== 'audit') throw { code: 'P2002', meta: { target: [failure === 'identity' ? 'microsoftOid' : 'email'] } };
        const row = { id: 'new-user', ...data };
        pending.push(row);
        return row;
      } },
      auditLog: { create: async () => { throw new Error('audit unavailable'); } },
    });
    committed.push(...pending);
    return result;
  }) as any;
  const create = () => fetch(app.url + '/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieFor(admin) },
    body: JSON.stringify({ name: 'User', email: 'user@example.com', password: 'password', role: 'SALES_COORDINATOR', microsoft_oid: GUID }),
  });
  try {
    const conflict = await create();
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { error: 'Microsoft identity is already linked to another account' });
    failure = 'adapter';
    const adapterConflict = await create();
    assert.equal(adapterConflict.status, 409);
    assert.deepEqual(await adapterConflict.json(), { error: 'Microsoft identity is already linked to another account' });
    failure = 'email';
    const emailConflict = await create();
    assert.equal(emailConflict.status, 409);
    assert.deepEqual(await emailConflict.json(), { error: 'An account with this email already exists.' });
    failure = 'audit';
    assert.equal((await create()).status, 500);
    assert.deepEqual(committed, []);
  } finally {
    prisma.user.findUnique = originalLookup;
    prisma.$transaction = originalTransaction;
    await app.close();
  }
});

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
    $executeRaw: async () => 1,
    $queryRaw: async () => [],
    user: {
      findUnique: async ({ where }: any) => where.id === admin.id ? admin : where.id === target.id ? actedOn : null,
      update: async ({ data }: any) => {
        if (data.authorizationRevision) {
          actedOn = { ...actedOn, authorizationRevision: actedOn.authorizationRevision + BigInt(data.authorizationRevision.increment) };
          return actedOn;
        }
        updates++;
        if (data.microsoftOid === '00000000-0000-0000-0000-000000000000') throw { code: 'P2002' };
        actedOn = { ...actedOn, microsoftOid: data.microsoftOid, microsoftApprovedAt: data.microsoftApprovedAt };
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
    assert.ok(actedOn.microsoftApprovedAt instanceof Date);
    assert.equal(entries.length, 2, 'identity prelink and authorization revision are audited together');
    assert.equal(entries[0].changedById, admin.id);
    assert.equal(actedOn.authorizationRevision, 2n);
    assert.equal((await req(admin, '00000000-0000-0000-0000-000000000000')).status, 409);
    const removed = await req(admin, null);
    assert.equal(removed.status, 200);
    assert.equal(actedOn.microsoftOid, null);
    assert.equal(actedOn.microsoftApprovedAt, null);
    assert.equal(actedOn.authorizationRevision, 3n);
  } finally {
    prisma.user.findUnique = originalUserLookup;
    prisma.$transaction = originalTransaction;
    await app.close();
  }
});
