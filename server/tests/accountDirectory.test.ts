import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/db';
import authRoutes from '../src/routes/auth';
import accountManagerRoutes from '../src/routes/accountManagers';
import companyRoutes from '../src/routes/companies';
import { safeBusinessAudit } from '../src/services/businessAudit';
import { localDirectoryKey, recordAccountManager, accountManagerMailUsers, summaryAccountManagerNames } from '../src/services/accountDirectory';

const AT = new Date('2026-11-10T01:00:00.000Z');
const unique = (target: string) => new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test', meta: { target: [target] } });
const users = [
  { id: 'u-sc', name: 'Paolo Soriano', email: 'paolo@example.test', role: 'SALES_COORDINATOR', isActive: true },
  { id: 'u-driver', name: 'Driver One', email: 'driver@example.test', role: 'DRIVER', isActive: true },
  { id: 'u-off', name: 'Former Staff', email: 'former@example.test', role: 'SALES_COORDINATOR', isActive: false },
];

function store() {
  const ams = [
    { id: 'am-1', name: 'P. Soriano', normalizedName: 'p. soriano', email: null as string | null, userId: null as string | null, isActive: true, version: 1, createdAt: AT, updatedAt: AT },
    { id: 'am-2', name: 'C. Lim', normalizedName: 'c. lim', email: null as string | null, userId: null as string | null, isActive: false, version: 1, createdAt: AT, updatedAt: AT },
  ];
  const companies = [
    { id: 'co-1', name: 'Acme Corp', normalizedName: 'acme corp', sapNumber: 'SAP-1', address: 'Makati', contactPerson: 'Ana',
      isActive: true, version: 1, defaultAccountManagerId: 'am-2' as string | null, createdAt: AT, updatedAt: AT },
  ];
  const withAmUser = (row: typeof ams[number]) => ({ ...row, user: users.find(user => user.id === row.userId) ?? null });
  const withCompanyAm = (row: typeof companies[number]) => ({ ...row, defaultAccountManager: ams.find(am => am.id === row.defaultAccountManagerId) ?? null });
  const calls = { locks: 0, transactions: 0, audit: [] as any[], writes: [] as string[] };
  const db = {
    $queryRaw: async (_query: unknown, name: string) => [{ key: name.toLowerCase() }],
    $executeRaw: async () => { calls.locks++; return 1; },
    user: { findUnique: async ({ where }: any) => users.find(user => user.id === where.id) ?? null },
    accountManager: {
      findMany: async ({ where }: any = {}) => ams.filter(am => where?.isActive === undefined || am.isActive === where.isActive).map(withAmUser),
      findUnique: async ({ where }: any) => { const row = ams.find(am => am.id === where.id); return row ? withAmUser(row) : null; },
      create: async ({ data }: any) => {
        assert.equal(calls.locks, calls.transactions, 'writes run under the directory lock');
        if (ams.some(am => am.normalizedName === data.normalizedName)) throw unique('normalizedName');
        if (data.userId && ams.some(am => am.userId === data.userId)) throw unique('userId');
        const row = { id: 'am-new', email: null, userId: null, isActive: true, version: 1, createdAt: AT, updatedAt: AT, ...data };
        ams.push(row); calls.writes.push('am.create'); return withAmUser(row);
      },
      update: async ({ where, data }: any) => {
        const index = ams.findIndex(am => am.id === where.id);
        if (data.normalizedName && ams.some(am => am.id !== where.id && am.normalizedName === data.normalizedName)) throw unique('normalizedName');
        ams[index] = { ...ams[index], ...data, version: ams[index].version + 1 };
        calls.writes.push('am.update'); return withAmUser(ams[index]);
      },
    },
    company: {
      findMany: async ({ where }: any = {}) => companies.filter(co => where?.isActive === undefined || co.isActive === where.isActive).map(withCompanyAm),
      findUnique: async ({ where }: any) => { const row = companies.find(co => co.id === where.id); return row ? withCompanyAm(row) : null; },
      findFirst: async ({ where }: any) => companies.find(co => co.sapNumber.toLowerCase() === where.sapNumber.equals.toLowerCase()
        && (!where.id || co.id !== where.id.not)) ?? null,
      create: async ({ data }: any) => {
        assert.equal(calls.locks, calls.transactions, 'writes run under the directory lock');
        if (companies.some(co => co.normalizedName === data.normalizedName)) throw unique('normalizedName');
        const row = { id: 'co-new', isActive: true, version: 1, createdAt: AT, updatedAt: AT, ...data };
        companies.push(row); calls.writes.push('company.create'); return withCompanyAm(row);
      },
      update: async ({ where, data }: any) => {
        const index = companies.findIndex(co => co.id === where.id);
        companies[index] = { ...companies[index], ...data, version: companies[index].version + 1 };
        calls.writes.push('company.update'); return withCompanyAm(companies[index]);
      },
    },
    auditLog: { create: async (args: any) => { calls.audit.push(args.data); return {}; } },
  };
  return { db, calls, ams, companies };
}

async function withApp(role: string, run: (request: (path: string, method?: string, body?: unknown) => Promise<Response>, state: ReturnType<typeof store>) => Promise<void>) {
  const state = store();
  const account = { id: 'actor', name: 'Actor', email: 'actor@example.test', role, permissions: [], isActive: true, password: bcrypt.hashSync('pw-test-123', 4) };
  // Prisma delegates are proxies, so stubs are assigned and restored by hand.
  const restore: Array<() => void> = [];
  const stub = (target: any, key: string, fn: unknown) => { const original = target[key]; target[key] = fn; restore.push(() => { target[key] = original; }); };
  stub(prisma.user, 'findUnique', async ({ where }: any) => where.id === account.id || where.email === account.email ? account : null);
  stub(prisma.accountManager, 'findMany', state.db.accountManager.findMany);
  stub(prisma.company, 'findMany', state.db.company.findMany);
  stub(prisma, '$transaction', async (work: any) => { state.calls.transactions++; return work(state.db); });
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/auth', authRoutes); app.use('/account-managers', accountManagerRoutes); app.use('/companies', companyRoutes);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const login = await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: 'pw-test-123' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    await run((path, method = 'GET', body) => fetch(url + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), state);
  } finally {
    while (restore.length) restore.pop()!();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('pickers get Account Manager names only; Admin gets contact and linked-login details', async () => {
  await withApp('SALES_COORDINATOR', async request => {
    const res = await request('/account-managers');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [{ id: 'am-1', name: 'P. Soriano', is_active: true }, { id: 'am-2', name: 'C. Lim', is_active: false }]);
    assert.deepEqual((await (await request('/account-managers?active=true')).json()).map((am: any) => am.id), ['am-1']);
  });
  await withApp('ADMIN', async request => {
    const [first] = await (await request('/account-managers')).json() as any[];
    assert.deepEqual(Object.keys(first).sort(), ['created_at', 'email', 'id', 'is_active', 'linked_user', 'name', 'updated_at', 'version']);
  });
});

test('only Admin can create or change Account Managers and Companies', async () => {
  for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'TASS']) {
    await withApp(role, async (request, state) => {
      for (const [path, method] of [['/account-managers', 'POST'], ['/account-managers/am-1', 'PATCH'], ['/companies', 'POST'], ['/companies/co-1', 'PATCH']]) {
        assert.equal((await request(path, method, { name: 'Someone', sap_number: 'X', expected_version: 1 })).status, 403, `${role} ${method} ${path}`);
      }
      assert.deepEqual(state.calls.writes, []);
    });
  }
});

test('Admin creates an Account Manager with a normalized name, a linked login and an audit row', async () => {
  await withApp('ADMIN', async (request, state) => {
    const res = await request('/account-managers', 'POST', { name: '  Paolo   Soriano ', email: 'Paolo@Example.test', user_id: 'u-sc' });
    assert.equal(res.status, 201);
    const created: any = await res.json();
    assert.equal(created.name, 'Paolo Soriano');
    assert.equal(created.email, 'paolo@example.test');
    assert.equal(created.linked_user.id, 'u-sc');
    assert.equal(state.ams.at(-1)!.normalizedName, 'paolo soriano');
    assert.equal(state.calls.audit[0].recordType, 'AccountManager');
    assert.deepEqual(safeBusinessAudit('AccountManager', state.calls.audit[0].newValue),
      { name: 'Paolo Soriano', email: 'paolo@example.test', linked_user: 'Paolo Soriano', is_active: true, version: 1 });
  });
});

test('Account Manager validation rejects duplicates, bad input and ineligible logins', async () => {
  await withApp('ADMIN', async (request, state) => {
    const duplicate = await request('/account-managers', 'POST', { name: 'p.  SORIANO' });
    assert.equal(duplicate.status, 409);
    assert.match((await duplicate.json() as any).error, /already exists/);
    assert.equal((await request('/account-managers', 'POST', { name: 'X' })).status, 400);
    assert.equal((await request('/account-managers', 'POST', { name: 'New AM', email: 'not-an-email' })).status, 400);
    assert.equal((await request('/account-managers', 'POST', { name: 'New AM', role: 'ADMIN' })).status, 400, 'unknown fields are rejected');
    for (const user_id of ['u-driver', 'u-off', 'missing']) assert.equal((await request('/account-managers', 'POST', { name: 'New AM', user_id })).status, 400, user_id);
    assert.deepEqual(state.calls.writes, []);
  });
});

test('Account Manager edits need the current version and record what changed', async () => {
  await withApp('ADMIN', async (request, state) => {
    assert.equal((await request('/account-managers/am-1', 'PATCH', { is_active: false })).status, 400, 'expected_version is required');
    assert.equal((await request('/account-managers/am-1', 'PATCH', { is_active: false, expected_version: 2 })).status, 409);
    assert.equal((await request('/account-managers/missing', 'PATCH', { is_active: false, expected_version: 1 })).status, 404);
    const res = await request('/account-managers/am-1', 'PATCH', { is_active: false, user_id: 'u-sc', expected_version: 1 });
    assert.equal(res.status, 200);
    const updated: any = await res.json();
    assert.equal(updated.is_active, false);
    assert.equal(updated.version, 2);
    assert.equal(state.calls.audit[0].action, 'UPDATE');
    assert.equal(JSON.parse(state.calls.audit[0].previousValue).is_active, true);
    const unchanged = await request('/account-managers/am-1', 'PATCH', { is_active: false, expected_version: 2 });
    assert.equal((await unchanged.json() as any).version, 2, 'a no-op does not bump the version');
    assert.equal(state.calls.audit.length, 1);
  });
});

test('Admin creates a Company with a required unique SAP number and an active default Account Manager', async () => {
  await withApp('ADMIN', async (request, state) => {
    assert.equal((await request('/companies', 'POST', { name: 'Beta Inc' })).status, 400, 'SAP number is required');
    assert.equal((await request('/companies', 'POST', { name: 'Beta Inc', sap_number: 'sap-1' })).status, 409, 'SAP numbers are unique ignoring case');
    assert.equal((await request('/companies', 'POST', { name: 'ACME  corp', sap_number: 'SAP-9' })).status, 409, 'names are unique ignoring case and spacing');
    assert.equal((await request('/companies', 'POST', { name: 'Beta Inc', sap_number: 'SAP-2', default_account_manager_id: 'am-2' })).status, 409, 'inactive AM cannot be newly assigned');
    const res = await request('/companies', 'POST', { name: 'Beta Inc', sap_number: 'SAP-2', address: 'Pasig', contact_person: 'Ben', default_account_manager_id: 'am-1' });
    assert.equal(res.status, 201);
    const created: any = await res.json();
    assert.deepEqual(created.default_account_manager, { id: 'am-1', name: 'P. Soriano', is_active: true });
    assert.equal(state.companies.at(-1)!.normalizedName, 'beta inc');
    assert.equal(safeBusinessAudit('Company', state.calls.audit[0].newValue)!.default_account_manager, 'P. Soriano');
  });
});

test('Company edits keep an existing inactive default AM, check versions and allow deactivation', async () => {
  await withApp('ADMIN', async (request, state) => {
    assert.equal((await request('/companies/co-1', 'PATCH', { address: 'Taguig', expected_version: 3 })).status, 409);
    const res = await request('/companies/co-1', 'PATCH', { address: 'Taguig', default_account_manager_id: 'am-2', is_active: false, expected_version: 1 });
    assert.equal(res.status, 200);
    const updated: any = await res.json();
    assert.equal(updated.address, 'Taguig');
    assert.equal(updated.is_active, false);
    assert.equal(updated.default_account_manager.id, 'am-2');
    assert.equal(state.calls.writes.length, 1);
    const cleared = await request('/companies/co-1', 'PATCH', { default_account_manager_id: null, expected_version: 2 });
    assert.equal((await cleared.json() as any).default_account_manager, null);
  });
});

test('Company list includes status for every reader and can be narrowed to active rows', async () => {
  await withApp('LOGISTICS', async request => {
    const [company] = await (await request('/companies')).json() as any[];
    assert.equal(company.is_active, true);
    assert.equal(company.sap_number, 'SAP-1');
    assert.equal((await (await request('/companies?active=true')).json() as any[]).length, 1);
  });
});

test('seed helper matches the migration key', () => {
  assert.equal(localDirectoryKey('  Jollibee   Foods Corp. '), 'jollibee foods corp.');
});

test('records accept blank, unchanged or active Account Manager names and store the directory spelling', async () => {
  const db = { accountManager: { findMany: async ({ where }: any) => [{ name: 'P. Soriano', normalizedName: 'p. soriano', isActive: true }, { name: 'C. Lim', normalizedName: 'c. lim', isActive: false }]
    .filter(row => row.normalizedName === where.normalizedName && row.isActive === where.isActive) } } as any;
  assert.deepEqual(await recordAccountManager(db, ''), { name: '' });
  assert.deepEqual(await recordAccountManager(db, '  p.   SORIANO '), { name: 'P. Soriano' });
  assert.deepEqual(await recordAccountManager(db, 'C. Lim', 'C. Lim'), { name: 'C. Lim' }, 'an old record keeps its retired name');
  assert.match((await recordAccountManager(db, 'C. Lim', 'P. Soriano') as any).error, /active Account Manager/);
  assert.match((await recordAccountManager(db, 'Someone New') as any).error, /active Account Manager/);
  assert.match((await recordAccountManager(db, 42) as any).error, /must be text/);
});

async function withDirectory(rows: any[], accounts: any[], run: () => Promise<void>) {
  const restore: Array<() => void> = [];
  const stub = (target: any, key: string, fn: unknown) => { const original = target[key]; target[key] = fn; restore.push(() => { target[key] = original; }); };
  stub(prisma.accountManager, 'findUnique', async ({ where }: any) => {
    const row = rows.find(am => am.normalizedName === where.normalizedName);
    return row ? { ...row, user: accounts.find(user => user.id === row.userId) ?? null } : null;
  });
  stub(prisma.accountManager, 'findMany', async () => rows);
  stub(prisma.user, 'findMany', async ({ where }: any) => accounts.filter(user => user.isActive && user.name.toLowerCase() === where.name.equals.toLowerCase()));
  try { await run(); } finally { while (restore.length) restore.pop()!(); }
}

test('AM mail goes to the linked login first, nobody for a deactivated AM, and the exact unique name otherwise', async () => {
  const accounts = [
    { id: 'u-paolo', name: 'Paolo Soriano', email: 'paolo@example.test', isActive: true },
    { id: 'u-lim', name: 'C. Lim', email: 'lim@example.test', isActive: true },
    { id: 'u-reyes-1', name: 'M. Reyes', email: 'r1@example.test', isActive: true },
    { id: 'u-reyes-2', name: 'M. Reyes', email: 'r2@example.test', isActive: true },
    { id: 'u-santos', name: 'A. Santos', email: 'santos@example.test', isActive: true },
  ];
  const rows = [
    { name: 'P. Soriano', normalizedName: 'p. soriano', isActive: true, userId: 'u-paolo' },
    { name: 'C. Lim', normalizedName: 'c. lim', isActive: false, userId: null },
    { name: 'M. Reyes', normalizedName: 'm. reyes', isActive: true, userId: null },
    { name: 'A. Santos', normalizedName: 'a. santos', isActive: true, userId: null },
  ];
  await withDirectory(rows, accounts, async () => {
    assert.deepEqual((await accountManagerMailUsers('P. Soriano')).map(user => user.id), ['u-paolo'], 'the linked login, even with a different display name');
    assert.deepEqual(await accountManagerMailUsers('C. Lim'), [], 'a deactivated AM receives no new mail');
    assert.deepEqual(await accountManagerMailUsers('M. Reyes'), [], 'an ambiguous name still resolves to nobody');
    assert.deepEqual((await accountManagerMailUsers(' a.  santos ')).map(user => user.id), ['u-santos'], 'unlinked names keep the exact-name rule');
    assert.deepEqual(await accountManagerMailUsers(''), []);
    const summary = await summaryAccountManagerNames(accounts);
    assert.equal(summary.get('u-paolo'), 'P. Soriano');
    assert.equal(summary.get('u-lim'), undefined, 'deactivated AM names are not summarised');
    assert.equal(summary.get('u-reyes-1'), undefined);
    assert.equal(summary.get('u-santos'), 'A. Santos');
  });
});
