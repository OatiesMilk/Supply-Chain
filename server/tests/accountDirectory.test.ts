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
import { companyDto, localDirectoryKey, localSapNumbersCreate, recordAccountManager, accountManagerMailUsers, summaryAccountManagerNames } from '../src/services/accountDirectory';

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
    { id: 'am-3', name: 'B. Reyes', normalizedName: 'b. reyes', email: null as string | null, userId: null as string | null, isActive: true, version: 1, createdAt: AT, updatedAt: AT },
  ];
  const companies = [
    { id: 'co-1', name: 'Acme Corp', normalizedName: 'acme corp', sapNumber: 'SAP-1', address: 'Makati', contactPerson: 'Ana',
      isActive: true, version: 1, defaultAccountManagerId: 'am-2' as string | null, createdAt: AT, updatedAt: AT },
    { id: 'co-2', name: 'BDO Unibank', normalizedName: 'bdo unibank', sapNumber: 'SAP-BDO-1', address: 'Makati', contactPerson: '',
      isActive: true, version: 1, defaultAccountManagerId: null as string | null, createdAt: AT, updatedAt: AT },
  ];
  const saps = [
    { id: 'sap-1', companyId: 'co-1', sapNumber: 'SAP-1', normalizedNumber: 'sap-1', position: 0 },
    { id: 'sap-2', companyId: 'co-2', sapNumber: 'SAP-BDO-1', normalizedNumber: 'sap-bdo-1', position: 0 },
    { id: 'sap-3', companyId: 'co-2', sapNumber: 'SAP-BDO-2', normalizedNumber: 'sap-bdo-2', position: 1 },
  ];
  const links = [{ companyId: 'co-1', accountManagerId: 'am-2' }];
  const withAmUser = (row: typeof ams[number]) => ({ ...row, user: users.find(user => user.id === row.userId) ?? null });
  const amChoice = (id: string | null) => { const am = ams.find(row => row.id === id); return am ? { id: am.id, name: am.name, isActive: am.isActive } : null; };
  const withCompanyAm = (row: typeof companies[number]) => ({ ...row, defaultAccountManager: amChoice(row.defaultAccountManagerId),
    sapNumbers: saps.filter(sap => sap.companyId === row.id).sort((a, b) => a.position - b.position)
      .map(({ id, sapNumber, position }) => ({ id, sapNumber, position })),
    accountManagers: links.filter(link => link.companyId === row.id)
      .map(link => ({ accountManagerId: link.accountManagerId, accountManager: amChoice(link.accountManagerId)! })) });
  const calls = { locks: 0, transactions: 0, audit: [] as any[], writes: [] as string[] };
  let nextSap = 1;
  /** Applies nested sapNumbers/accountManagers creates like Prisma, enforcing the normalizedNumber unique index. */
  const writeChildren = (companyId: string, data: any) => {
    const { sapNumbers, accountManagers, ...scalars } = data;
    for (const sap of sapNumbers?.create ?? []) {
      if (saps.some(row => row.normalizedNumber === sap.normalizedNumber)) throw unique('normalizedNumber');
      saps.push({ id: `sap-new-${nextSap++}`, companyId, ...sap });
    }
    for (const link of accountManagers?.create ?? []) links.push({ companyId, accountManagerId: link.accountManagerId });
    return scalars;
  };
  const removeWhere = <T extends { companyId: string }>(rows: T[], companyId: string) => {
    let count = 0;
    for (let index = rows.length - 1; index >= 0; index--) if (rows[index].companyId === companyId) { rows.splice(index, 1); count++; }
    return { count };
  };
  const db = {
    $queryRaw: async (_query: unknown, name: string) => [{ key: name.toLowerCase() }],
    $executeRaw: async () => { calls.locks++; return 1; },
    user: { findUnique: async ({ where }: any) => users.find(user => user.id === where.id) ?? null },
    accountManager: {
      findMany: async ({ where }: any = {}) => ams.filter(am => (where?.isActive === undefined || am.isActive === where.isActive)
        && (!where?.id?.in || where.id.in.includes(am.id))).map(withAmUser),
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
      create: async ({ data }: any) => {
        assert.equal(calls.locks, calls.transactions, 'writes run under the directory lock');
        if (companies.some(co => co.normalizedName === data.normalizedName)) throw unique('normalizedName');
        const id = `co-new-${companies.length}`;
        const row = { id, isActive: true, version: 1, createdAt: AT, updatedAt: AT, ...writeChildren(id, data) };
        companies.push(row); calls.writes.push('company.create'); return withCompanyAm(row);
      },
      update: async ({ where, data }: any) => {
        const index = companies.findIndex(co => co.id === where.id);
        companies[index] = { ...companies[index], ...writeChildren(where.id, data), version: companies[index].version + 1 };
        calls.writes.push('company.update'); return withCompanyAm(companies[index]);
      },
    },
    companySapNumber: {
      findFirst: async ({ where }: any) => saps.find(sap => where.normalizedNumber.in.includes(sap.normalizedNumber)
        && (!where.companyId || sap.companyId !== where.companyId.not)) ?? null,
      deleteMany: async ({ where }: any) => { calls.writes.push('sap.deleteMany'); return removeWhere(saps, where.companyId); },
    },
    companyAccountManager: {
      deleteMany: async ({ where }: any) => { calls.writes.push('am-link.deleteMany'); return removeWhere(links, where.companyId); },
    },
    auditLog: { create: async (args: any) => { calls.audit.push(args.data); return {}; } },
  };
  return { db, calls, ams, companies, saps, links };
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
    assert.deepEqual(await res.json(), [{ id: 'am-1', name: 'P. Soriano', is_active: true }, { id: 'am-2', name: 'C. Lim', is_active: false },
      { id: 'am-3', name: 'B. Reyes', is_active: true }]);
    assert.deepEqual((await (await request('/account-managers?active=true')).json()).map((am: any) => am.id), ['am-1', 'am-3']);
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

test('Admin creates walk-in Companies without a SAP number (Sec 5.1)', async () => {
  await withApp('ADMIN', async (request, state) => {
    for (const [index, extra] of [{}, { sap_numbers: [] }, { sap_number: '' }, { sap_number: '   ' }, { sap_number: null }].entries()) {
      const res = await request('/companies', 'POST', { name: `Walk-in Client ${index + 1}`, ...extra });
      assert.equal(res.status, 201, JSON.stringify(extra));
      const created: any = await res.json();
      assert.equal(created.sap_number, '');
      assert.deepEqual(created.sap_numbers, []);
      assert.deepEqual(created.account_managers, []);
      assert.equal(created.default_account_manager, null);
    }
    assert.equal(state.saps.filter(sap => sap.companyId.startsWith('co-new')).length, 0);
    assert.equal(state.companies.at(-1)!.sapNumber, '');
  });
});

test('Admin creates a Company with several SAP numbers and Account Managers (Sec 5.2/5.3)', async () => {
  await withApp('ADMIN', async (request, state) => {
    const res = await request('/companies', 'POST', { name: 'Beta Inc', sap_numbers: [' SAP-B1 ', 'SAP-B2'], address: 'Pasig', contact_person: 'Ben',
      account_manager_ids: ['am-1', 'am-3'] });
    assert.equal(res.status, 201);
    const created: any = await res.json();
    assert.deepEqual(created.sap_numbers, ['SAP-B1', 'SAP-B2']);
    assert.equal(created.sap_number, 'SAP-B1');
    assert.deepEqual(created.account_managers.map((am: any) => am.name), ['B. Reyes', 'P. Soriano'], 'sorted by name');
    assert.deepEqual(created.default_account_manager, { id: 'am-3', name: 'B. Reyes', is_active: true });
    const row = state.companies.at(-1)!;
    assert.equal(row.normalizedName, 'beta inc');
    assert.equal(row.sapNumber, 'SAP-B1', 'legacy snapshot is the first SAP number');
    assert.equal(row.defaultAccountManagerId, 'am-3', 'legacy snapshot is the first active AM');
    assert.deepEqual(state.saps.filter(sap => sap.companyId === row.id).map(sap => [sap.normalizedNumber, sap.position]), [['sap-b1', 0], ['sap-b2', 1]]);
    const audit = safeBusinessAudit('Company', state.calls.audit[0].newValue)!;
    assert.deepEqual(audit.sap_numbers, ['SAP-B1', 'SAP-B2']);
    assert.deepEqual(audit.account_managers, [{ id: 'am-3', name: 'B. Reyes' }, { id: 'am-1', name: 'P. Soriano' }]);
    assert.equal(audit.default_account_manager, 'B. Reyes');
  });
});

test('Company SAP numbers are validated, unique within the payload and across companies ignoring case', async () => {
  await withApp('ADMIN', async (request, state) => {
    const post = (extra: object) => request('/companies', 'POST', { name: 'Gamma Inc', ...extra });
    const conflict = await post({ sap_numbers: ['SAP-G1', 'sap-bdo-2'] });
    assert.equal(conflict.status, 409, "matches another company's second SAP number");
    assert.match((await conflict.json() as any).error, /SAP number "SAP-BDO-2"/);
    assert.equal((await post({ sap_number: ' sap-1 ' })).status, 409, 'legacy scalar ignores case and outer spaces');
    const duplicate = await post({ sap_numbers: ['SAP-100', 'sap-100'] });
    assert.equal(duplicate.status, 400);
    assert.match((await duplicate.json() as any).error, /Duplicate SAP number in list/);
    assert.equal((await post({ sap_numbers: ['SAP-1X', ' '] })).status, 400, 'blank list entries are rejected');
    assert.equal((await post({ sap_numbers: ['x'.repeat(51)] })).status, 400);
    assert.equal((await post({ sap_number: 'x'.repeat(51) })).status, 400);
    assert.equal((await post({ sap_numbers: 'SAP-1X' })).status, 400, 'sap_numbers must be a list');
    assert.equal((await post({ sap_numbers: Array.from({ length: 51 }, (_, i) => `S-${i}`) })).status, 400);
    assert.equal((await post({ sap_numbers: ['SAP-1X'], sap_number: 'SAP-1X' })).status, 400, 'list and legacy scalar are exclusive');
    assert.equal((await post({ account_manager_ids: ['am-1'], default_account_manager_id: 'am-1' })).status, 400, 'AM list and legacy id are exclusive');
    assert.deepEqual(state.calls.writes, []);
  });
});

test('a database unique violation on a SAP number is a 409, never a 500', async () => {
  await withApp('ADMIN', async (request, state) => {
    // Simulate a race the pre-check could not see: another company took the number first.
    state.db.companySapNumber.findFirst = async () => null;
    const res = await request('/companies', 'POST', { name: 'Race Inc', sap_numbers: ['SAP-1'] });
    assert.equal(res.status, 409);
    assert.match((await res.json() as any).error, /SAP number/);
  });
});

test('Company Account Manager assignments: active only when new, inactive may be kept, unknown ids rejected', async () => {
  await withApp('ADMIN', async (request, state) => {
    assert.equal((await request('/companies', 'POST', { name: 'Delta Inc', account_manager_ids: ['am-2'] })).status, 409, 'inactive AM cannot be newly assigned');
    assert.equal((await request('/companies', 'POST', { name: 'Delta Inc', default_account_manager_id: 'am-2' })).status, 409, 'legacy field too');
    for (const id of ['missing', 'u-sc']) assert.equal((await request('/companies', 'POST', { name: 'Delta Inc', account_manager_ids: ['am-1', id] })).status, 400, id);
    assert.equal((await request('/companies', 'POST', { name: 'Delta Inc', account_manager_ids: ['am-1', 'am-1'] })).status, 400, 'duplicates');
    assert.equal((await request('/companies', 'POST', { name: 'Delta Inc', account_manager_ids: 'am-1' })).status, 400, 'must be a list');
    // co-1 already has inactive am-2: it may stay while an active AM is added.
    const kept = await request('/companies/co-1', 'PATCH', { account_manager_ids: ['am-2', 'am-1'], expected_version: 1 });
    assert.equal(kept.status, 200);
    const body: any = await kept.json();
    assert.deepEqual(body.account_managers.map((am: any) => [am.id, am.is_active]), [['am-2', false], ['am-1', true]]);
    assert.equal(body.default_account_manager.id, 'am-1', 'the active AM wins the legacy default');
    assert.equal(state.companies[0].defaultAccountManagerId, 'am-1');
    const removed = await request('/companies/co-1', 'PATCH', { account_manager_ids: ['am-1'], expected_version: 2 });
    assert.deepEqual((await removed.json() as any).account_managers.map((am: any) => am.id), ['am-1']);
    assert.equal((await request('/companies/co-1', 'PATCH', { account_manager_ids: ['am-1', 'am-2'], expected_version: 3 })).status, 409,
      'once removed, an inactive AM cannot come back');
    const cleared = await request('/companies/co-1', 'PATCH', { account_manager_ids: [], expected_version: 3 });
    const clearedBody: any = await cleared.json();
    assert.deepEqual(clearedBody.account_managers, []);
    assert.equal(clearedBody.default_account_manager, null);
    assert.equal(state.companies[0].defaultAccountManagerId, null);
    assert.equal(state.links.filter(link => link.companyId === 'co-1').length, 0);
  });
});

test('Company edits add, reorder, re-case and clear SAP numbers without conflicting with themselves', async () => {
  await withApp('ADMIN', async (request, state) => {
    const patch = (version: number, extra: object) => request('/companies/co-2', 'PATCH', { ...extra, expected_version: version });
    const reordered = await patch(1, { sap_numbers: ['sap-bdo-2', 'SAP-BDO-1', 'SAP-BDO-3'] });
    assert.equal(reordered.status, 200);
    const body: any = await reordered.json();
    assert.deepEqual(body.sap_numbers, ['sap-bdo-2', 'SAP-BDO-1', 'SAP-BDO-3']);
    assert.equal(body.sap_number, 'sap-bdo-2');
    assert.equal(body.version, 2);
    assert.equal(state.companies[1].sapNumber, 'sap-bdo-2');
    assert.deepEqual(state.calls.writes, ['sap.deleteMany', 'company.update'], 'old rows go before new ones are created');
    assert.equal((await patch(2, { sap_numbers: ['SAP-1'] })).status, 409, 'cannot take another company\'s number');
    const cleared = await patch(2, { sap_number: null });
    assert.deepEqual((await cleared.json() as any).sap_numbers, []);
    assert.equal(state.saps.filter(sap => sap.companyId === 'co-2').length, 0);
    assert.equal(state.companies[1].sapNumber, '');
    const legacy = await patch(3, { sap_number: ' SAP-BDO-9 ' });
    assert.deepEqual((await legacy.json() as any).sap_numbers, ['SAP-BDO-9'], 'legacy scalar still accepted');
  });
});

test('Company edits keep an existing inactive default AM, check versions and allow deactivation', async () => {
  await withApp('ADMIN', async (request, state) => {
    assert.equal((await request('/companies/co-1', 'PATCH', { address: 'Taguig', expected_version: 3 })).status, 409);
    assert.equal((await request('/companies/missing', 'PATCH', { address: 'Taguig', expected_version: 1 })).status, 404);
    const res = await request('/companies/co-1', 'PATCH', { address: 'Taguig', default_account_manager_id: 'am-2', is_active: false, expected_version: 1 });
    assert.equal(res.status, 200);
    const updated: any = await res.json();
    assert.equal(updated.address, 'Taguig');
    assert.equal(updated.is_active, false);
    assert.equal(updated.default_account_manager.id, 'am-2');
    assert.deepEqual(state.calls.writes, ['company.update'], 'an unchanged AM list is not rewritten');
    const cleared = await request('/companies/co-1', 'PATCH', { default_account_manager_id: null, expected_version: 2 });
    const clearedBody: any = await cleared.json();
    assert.equal(clearedBody.default_account_manager, null);
    assert.deepEqual(clearedBody.account_managers, []);
  });
});

test('a Company PATCH with identical lists and fields is a no-op: same version, no audit', async () => {
  await withApp('ADMIN', async (request, state) => {
    const res = await request('/companies/co-2', 'PATCH', { name: 'BDO Unibank', sap_numbers: ['SAP-BDO-1', 'SAP-BDO-2'], account_manager_ids: [],
      address: 'Makati', expected_version: 1 });
    assert.equal(res.status, 200);
    assert.equal((await res.json() as any).version, 1);
    assert.equal(state.calls.audit.length, 0);
    assert.deepEqual(state.calls.writes, []);
    const sameSet = await request('/companies/co-1', 'PATCH', { account_manager_ids: ['am-2'], expected_version: 1 });
    assert.equal((await sameSet.json() as any).version, 1);
    assert.equal(state.calls.audit.length, 0);
    assert.equal((await request('/companies/co-1', 'PATCH', { expected_version: 1 })).status, 400, 'nothing to change');
  });
});

test('Company list includes status, every SAP number and every Account Manager for each reader', async () => {
  await withApp('LOGISTICS', async request => {
    const [company, bdo] = await (await request('/companies')).json() as any[];
    assert.equal(company.is_active, true);
    assert.equal(company.sap_number, 'SAP-1');
    assert.deepEqual(company.sap_numbers, ['SAP-1']);
    assert.deepEqual(company.account_managers, [{ id: 'am-2', name: 'C. Lim', is_active: false }]);
    assert.deepEqual(company.default_account_manager, { id: 'am-2', name: 'C. Lim', is_active: false });
    assert.deepEqual(bdo.sap_numbers, ['SAP-BDO-1', 'SAP-BDO-2']);
    assert.equal(bdo.sap_number, 'SAP-BDO-1');
    assert.equal((await (await request('/companies?active=true')).json() as any[]).length, 2);
  });
});

test('Company DTO falls back to legacy columns for rows written before the child tables', () => {
  const dto = companyDto({ id: 'co-x', name: 'Old Co', normalizedName: 'old co', sapNumber: ' SAP-OLD ', address: '', contactPerson: '', isActive: true, version: 1,
    defaultAccountManagerId: 'am-1', defaultAccountManager: { id: 'am-1', name: 'P. Soriano', isActive: true }, sapNumbers: [], accountManagers: [],
    createdAt: AT, updatedAt: AT });
  assert.deepEqual(dto.sap_numbers, ['SAP-OLD']);
  assert.equal(dto.sap_number, 'SAP-OLD');
  assert.deepEqual(dto.account_managers, [{ id: 'am-1', name: 'P. Soriano', is_active: true }]);
  const blank = companyDto({ ...dto as any, sapNumber: '', defaultAccountManager: null, sapNumbers: [], accountManagers: [], contactPerson: '', normalizedName: '', isActive: true,
    createdAt: AT, updatedAt: AT });
  assert.deepEqual(blank.sap_numbers, []);
  assert.equal(blank.default_account_manager, null);
});

test('Company business audit projects SAP and Account Manager lists and strips unknown keys', () => {
  const safe = safeBusinessAudit('Company', JSON.stringify({ name: 'BDO', sap_numbers: ['SAP-1', 7, null, 'SAP-2'],
    account_managers: [{ id: 'am-1', name: 'P. Soriano', email: 'secret@example.test' }, 'junk', { name: 'No Id' }], password: 'x' }))!;
  assert.deepEqual(safe, { name: 'BDO', sap_numbers: ['SAP-1', 'SAP-2'], account_managers: [{ id: 'am-1', name: 'P. Soriano' }, { name: 'No Id' }] });
});

test('seed SAP helper writes one normalized child row, or none for a blank number', () => {
  assert.deepEqual(localSapNumbersCreate(' SAP-CO-1 '), { create: [{ sapNumber: 'SAP-CO-1', normalizedNumber: 'sap-co-1', position: 0 }] });
  assert.equal(localSapNumbersCreate('  '), undefined);
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
