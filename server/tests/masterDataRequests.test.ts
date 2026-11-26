import { before, test, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { PolicyRole } from '../src/services/permissionCatalog';

// Feature 4b: TASS Company/Supplier addition requests reviewed by ADMIN.
// Database doubles only (no PostgreSQL); live constraint, race and rollback
// behavior is covered by masterDataRequests.postgres.test.ts.

// Provider isolation happens BEFORE any application module loads. src/db.ts runs
// dotenv.config(), which never overrides a key that is already defined, so every
// provider key is blanked to '' (never deleted) and server/.env cannot rehydrate it.
const ISOLATED_PROVIDER_KEYS = [
  'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'AZURE_REDIRECT_URI',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET', 'SUPABASE_SIGNATURE_BUCKET',
  'NOTION_API_KEY', 'BILLING_NOTIFICATION_USER_EMAIL',
] as const;
function blankProviderEnv() {
  for (const key of Object.keys(process.env)) {
    if (/^(AZURE_|SMTP_|SUPABASE_|NOTION_|BILLING_NOTIFICATION_)/.test(key)) process.env[key] = '';
  }
  for (const key of ISOLATED_PROVIDER_KEYS) process.env[key] = '';
}
blankProviderEnv();

async function importAppModules() {
  blankProviderEnv();
  const [db, auth, routes, users, service, businessAudit, catalog, visibility, auditVisibility, evaluator] = await Promise.all([
    import('../src/db'),
    import('../src/middleware/auth'),
    import('../src/routes/masterDataRequests'),
    import('../src/routes/users'),
    import('../src/services/masterDataRequests'),
    import('../src/services/businessAudit'),
    import('../src/services/permissionCatalog'),
    import('../src/services/notificationVisibility'),
    import('../src/services/auditVisibility'),
    import('../src/services/permissionEvaluator'),
  ]);
  return { prisma: db.prisma, signToken: auth.signToken, routes: routes.default, usersRoutes: users.default, service, businessAudit, catalog, visibility, auditVisibility, evaluator };
}
type AppModules = Awaited<ReturnType<typeof importAppModules>>;
let m: AppModules;
before(async () => { m = await importAppModules(); });

type Mode = 'LEGACY' | 'V1';
const ROLES: PolicyRole[] = ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER'];
const key = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([field, value]: [string, any]) => {
    if (field === 'AND') return (Array.isArray(value) ? value : [value]).every(condition => matches(row, condition));
    if (field === 'OR') return value.some((condition: any) => matches(row, condition));
    if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
      if ('in' in value) return value.in.includes(row[field]);
      if ('not' in value) return row[field] !== value.not;
      if ('contains' in value) return String(row[field] ?? '').toLowerCase().includes(String(value.contains).toLowerCase());
      if ('has' in value) return Array.isArray(row[field]) && row[field].includes(value.has);
      return matches(row[field] ?? {}, value);
    }
    return row[field] === value;
  });
}

async function fixture(t: TestContext, mode: Mode) {
  const previousMode = process.env.PERMISSION_MODE;
  process.env.PERMISSION_MODE = mode;
  const { prisma } = m;
  const account = (id: string, role: PolicyRole, extra: Record<string, any> = {}) => ({
    id, name: extra.name ?? `${role} ${id}`, email: `${id}@example.test`, role, isActive: extra.isActive ?? true, authorizationRevision: 1n, password: 'x',
    permissions: extra.screens ?? [], permissionOverrides: (extra.deny ?? []).map((permissionKey: string) => ({ userId: id, permissionKey, effect: 'DENY' })),
    permissionConversion: { catalogVersion: 1 }, microsoftOid: null, microsoftApprovedAt: null, createdAt: new Date(), updatedAt: new Date(),
    driverProfile: extra.driverProfile ?? null,
  });
  const users = new Map<string, any>([
    ['tass', account('tass', 'TASS', { name: 'Roselyn Arguelles' })],
    ['tass2', account('tass2', 'TASS', { name: 'Abigail Celada' })],
    ['tass-revoked', account('tass-revoked', 'TASS', { deny: ['CATEGORY:RMA:READ'] })],
    // LEGACY: keeps Suppliers and record access but lost the RMA screen / only RMA write.
    ['tass-no-rma-screen', account('tass-no-rma-screen', 'TASS', { screens: [{ screen: 'rma', granted: false }] })],
    ['tass-no-rma-write', account('tass-no-rma-write', 'TASS', { deny: ['CATEGORY:RMA:WRITE'] })],
    ['admin', account('admin', 'ADMIN', { name: 'System Admin' })],
    ['admin2', account('admin2', 'ADMIN', { name: 'Second Admin' })],
    ['admin-off', account('admin-off', 'ADMIN', { isActive: false })],
    ['admin-no-company', account('admin-no-company', 'ADMIN', { deny: ['RESOURCE:companies:CREATE'] })],
    ['admin-no-supplier', account('admin-no-supplier', 'ADMIN', { deny: ['RESOURCE:suppliers:CREATE'] })],
    ['sales', account('sales', 'SALES_COORDINATOR')], ['logistics', account('logistics', 'LOGISTICS')],
    ['driver', account('driver', 'DRIVER', { driverProfile: { id: 'driver-one', type: 'DRIVER', isActive: true } })],
  ]);
  const policies = new Map(ROLES.map(role => [role, { role, revision: 1n, catalogVersion: 1,
    permissions: [...m.catalog.defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ role, permissionKey, effect })) }]));
  const accountManagers = [
    { id: 'am-1', name: 'Leanne Pavoreal', isActive: true }, { id: 'am-2', name: 'Paolo Soriano', isActive: true }, { id: 'am-off', name: 'Retired AM', isActive: false },
  ];
  const categories = [
    { id: 'cat-1', name: 'Printers', normalizedName: 'printers', isActive: true, version: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 'cat-off', name: 'Legacy', normalizedName: 'legacy', isActive: false, version: 1, createdAt: new Date(), updatedAt: new Date() },
  ];
  const companies: any[] = [{ id: 'co-bdo', name: 'BDO Unibank Inc.', normalizedName: 'bdo unibank inc.' }];
  const companySaps: any[] = [{ companyId: 'co-bdo', sapNumber: 'SAP-100', normalizedNumber: 'sap-100' }];
  const suppliers: any[] = [{ id: 'sup-1', name: 'Acme   Parts' }];
  const requests = new Map<string, any>();
  const notifications: any[] = [], audits: any[] = [];
  let sequence = 0;
  const restorers: Array<() => void> = [];
  const stub = (target: any, name: string, fn: (...args: any[]) => any) => {
    const original = target[name]; target[name] = mock.fn(fn); restorers.push(() => { target[name] = original; }); return target[name];
  };
  const userRef = (id: string | null) => id ? { id, name: users.get(id)?.name ?? '' } : null;
  const withIncludes = (row: any) => row && { ...structuredClone(row), requestedBy: userRef(row.requestedById), reviewedBy: userRef(row.reviewedById) };
  const sqlText = (args: any[]) => Array.isArray(args[0]) ? (args[0] as string[]).join('?') : String(args[0]?.sql ?? '');

  stub(prisma, '$transaction', async (work: any) => typeof work === 'function' ? work(prisma) : Promise.all(work));
  const executed = stub(prisma, '$executeRaw', async () => 1);
  const queried = stub(prisma, '$queryRaw', async (...args: any[]) => {
    const sql = sqlText(args), values = args.slice(1);
    if (sql.includes('SELECT lower(')) return [{ key: String(values[0]).toLowerCase() }];
    if (sql.includes('FROM "Supplier"')) return suppliers.filter(row => key(row.name) === values[0]).map(row => ({ name: row.name }));
    if (sql.includes('unnest("sapNumbers")')) {
      const needle = String(values[0]).replace(/^%|%$/g, '').replace(/\\(.)/g, '$1').toLowerCase();
      return [...requests.values()].filter(row => row.sapNumbers.some((sap: string) => sap.toLowerCase().includes(needle))).map(row => ({ id: row.id }));
    }
    if (sql.includes('FROM "MasterDataAdditionRequest"') && sql.includes('FOR UPDATE')) {
      const row = requests.get(values[0]); return row ? [{ id: row.id, entityType: row.entityType, status: row.status, version: row.version }] : [];
    }
    return [];
  });
  stub(prisma.user, 'findUnique', async ({ where }: any) => structuredClone(users.get(where.id) ?? null));
  stub(prisma.user, 'findMany', async ({ where }: any) => [...users.values()].filter(user => matches(user, where)).map(user => structuredClone(user)));
  stub(prisma.rolePolicy, 'findUnique', async ({ where }: any) => structuredClone(policies.get(where.role) ?? null));
  stub(prisma.company, 'findUnique', async ({ where }: any) => companies.find(row => row.normalizedName === where.normalizedName) ?? null);
  stub(prisma.companySapNumber, 'findFirst', async ({ where }: any) => companySaps.find(row => where.normalizedNumber.in.includes(row.normalizedNumber)) ?? null);
  stub(prisma.accountManager, 'findMany', async ({ where }: any) => accountManagers.filter(row => where.id.in.includes(row.id)).map(row => ({ ...row })));
  stub(prisma.supplierCategory, 'findMany', async ({ where }: any) => categories.filter(row => where.id.in.includes(row.id)).map(row => ({ ...row })));
  stub(prisma.masterDataAdditionRequest, 'findFirst', async ({ where }: any) => withIncludes([...requests.values()].find(row => matches(row, where))) ?? null);
  stub(prisma.masterDataAdditionRequest, 'findUniqueOrThrow', async ({ where }: any) => {
    const row = requests.get(where.id); if (!row) throw new Error('not found'); return withIncludes(row);
  });
  const listed = (where: any) => [...requests.values()].map(withIncludes).filter(row => matches(row, where));
  stub(prisma.masterDataAdditionRequest, 'findMany', async ({ where, skip = 0, take }: any) => listed(where)
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)).slice(skip, take === undefined ? undefined : skip + take));
  stub(prisma.masterDataAdditionRequest, 'groupBy', async ({ where }: any) => {
    const counts = new Map<string, number>();
    for (const row of listed(where)) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    return [...counts].map(([status, count]) => ({ status, _count: { _all: count } }));
  });
  stub(prisma.masterDataAdditionRequest, 'create', async ({ data }: any) => {
    const row = { id: `req-${++sequence}`, version: 1, reviewedById: null, reviewedAt: null, rejectionReason: null, reviewNotes: null,
      createdCompanyId: null, createdSupplierId: null, createdEntityName: null, createdAt: new Date(Date.now() + sequence), updatedAt: new Date(), ...data };
    requests.set(row.id, row); return withIncludes(row);
  });
  stub(prisma.masterDataAdditionRequest, 'update', async ({ where, data }: any) => {
    const row = requests.get(where.id);
    for (const [field, value] of Object.entries(data)) row[field] = value && typeof value === 'object' && 'increment' in (value as any) ? row[field] + (value as any).increment : value;
    return withIncludes(row);
  });
  stub(prisma.company, 'create', async ({ data }: any) => {
    const row = { id: `co-${++sequence}`, ...data, isActive: true, version: 1, createdAt: new Date(), updatedAt: new Date(),
      sapNumbers: data.sapNumbers.create.map((sap: any, index: number) => ({ id: `sap-${index}`, ...sap })),
      accountManagers: data.accountManagers.create.map((link: any) => ({ accountManagerId: link.accountManagerId, accountManager: accountManagers.find(am => am.id === link.accountManagerId) })),
      defaultAccountManager: accountManagers.find(am => am.id === data.defaultAccountManagerId) ?? null };
    companies.push(row);
    for (const sap of data.sapNumbers.create) companySaps.push({ companyId: row.id, ...sap });
    return row;
  });
  stub(prisma.supplier, 'create', async ({ data }: any) => {
    const row = { id: `sup-${++sequence}`, ...data, version: 1, createdAt: new Date(), modifiedAt: new Date(),
      createdBy: { name: users.get(data.createdById).name }, modifiedBy: { name: users.get(data.modifiedById).name },
      categories: (data.categories?.create ?? []).map((link: any) => ({ supplierId: 'x', categoryId: link.categoryId, category: categories.find(c => c.id === link.categoryId) })) };
    suppliers.push(row); return row;
  });
  stub(prisma.notification, 'createMany', async ({ data }: any) => { notifications.push(...data); return { count: data.length }; });
  stub(prisma.notification, 'create', async ({ data }: any) => { notifications.push(data); return data; });
  stub(prisma.auditLog, 'create', async ({ data }: any) => { audits.push(data); return data; });

  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/master-data-requests', m.routes);
  app.use('/api/v1/users', m.usersRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    while (restorers.length) restorers.pop()!();
    process.env.PERMISSION_MODE = previousMode ?? '';
  });
  const cookieFor = (id: string) => { const user = users.get(id); return `mg_session=${m.signToken({ id, name: user.name, email: user.email, role: user.role })}`; };
  const request = (as: string, path: string, init: { method?: string; body?: unknown } = {}) => fetch(origin + path, {
    method: init.method ?? 'GET', headers: { Cookie: cookieFor(as), ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const submit = (as: string, body: unknown) => request(as, '/api/v1/master-data-requests', { method: 'POST', body });
  const approve = (as: string, id: string, body: unknown) => request(as, `/api/v1/master-data-requests/${id}/approve`, { method: 'POST', body });
  const reject = (as: string, id: string, body: unknown) => request(as, `/api/v1/master-data-requests/${id}/reject`, { method: 'POST', body });
  return { request, submit, approve, reject, users, requests, companies, companySaps, suppliers, notifications, audits, executed, queried, stub, prisma };
}

const walkIn = { entity_type: 'COMPANY', name: '  Juan   Dela Cruz Repair ', contact_person: 'Juan', contact_phone: '0917 000 0000', notes: 'Walk-in repair, case CAS-31417' };

// ── Pure rules ──────────────────────────────────────────────────────────────
test('submission parsing enforces the allow-list and entity-specific fields', () => {
  const { parseSubmitInput, parseRejectInput, parseApproveInput, MasterDataRequestError } = m.service;
  const company = parseSubmitInput({ entity_type: 'COMPANY', name: ' BDO   Leasing ', sap_numbers: ['SAP-1', 'sap-2'], account_manager_ids: ['am-1', 'am-2'] });
  assert.deepEqual({ name: company.name, sap: company.sapNumbers, ams: company.accountManagerIds, cats: company.supplierCategoryIds, city: company.city },
    { name: 'BDO Leasing', sap: ['SAP-1', 'sap-2'], ams: ['am-1', 'am-2'], cats: [], city: '' });
  assert.deepEqual(parseSubmitInput({ entity_type: 'COMPANY', name: 'Walk In' }).sapNumbers, [], 'walk-in clients need no SAP number');
  const supplier = parseSubmitInput({ entity_type: 'SUPPLIER', name: 'Acme', email: 'Sales@Acme.TEST', city: 'Pasig', supplier_category_ids: [] });
  assert.deepEqual({ email: supplier.email, city: supplier.city, cats: supplier.supplierCategoryIds }, { email: 'sales@acme.test', city: 'Pasig', cats: [] });
  const bad: unknown[] = [
    { entity_type: 'COMPANY', name: 'A' }, { entity_type: 'PERSON', name: 'Acme' }, { entity_type: 'COMPANY', name: 'Acme', extra: 1 },
    { entity_type: 'COMPANY', name: 'Acme', sap_numbers: ['X', 'x'] }, { entity_type: 'COMPANY', name: 'Acme', sap_number: 'X', sap_numbers: ['Y'] },
    { entity_type: 'COMPANY', name: 'Acme', supplier_category_ids: ['cat-1'] }, { entity_type: 'COMPANY', name: 'Acme', city: 'Pasig' },
    { entity_type: 'SUPPLIER', name: 'Acme', account_manager_ids: ['am-1'] }, { entity_type: 'SUPPLIER', name: 'Acme', email: 'not-an-email' },
    { entity_type: 'SUPPLIER', name: 'Acme', sap_numbers: Array.from({ length: 11 }, (_, i) => `S${i}`) },
    { entity_type: 'COMPANY', name: 'Acme', notes: 'x'.repeat(1001) }, { entity_type: 'COMPANY', name: 'Acme', contact_phone: '1'.repeat(51) },
  ];
  for (const body of bad) assert.throws(() => parseSubmitInput(body), (error: any) => error.status === 400, JSON.stringify(body).slice(0, 80));
  assert.throws(() => parseRejectInput({ expected_version: 1, rejection_reason: '  no ' }), (error: any) => error instanceof MasterDataRequestError && error.status === 400);
  assert.throws(() => parseRejectInput({ expected_version: 0, rejection_reason: 'Duplicate of BDO' }), (error: any) => error.status === 400);
  assert.throws(() => parseApproveInput({ expected_version: 1, requested_by_id: 'x' }), (error: any) => error.status === 400);
  assert.equal(m.service.companyContactPerson('Juan', '0917', false), 'Juan (0917)');
  assert.equal(m.service.companyContactPerson('Juan (0917)', '0917', false), 'Juan (0917)');
  assert.equal(m.service.companyContactPerson('', '0917', false), '0917');
  assert.equal(m.service.companyContactPerson('Ana', '0917', true), 'Ana', 'an explicit Admin value is kept as given');
});

test('list query parsing rejects repeated (array) and non-string params instead of listing unfiltered', () => {
  const { parseListQuery, MasterDataRequestError } = m.service;
  const bad: Array<Record<string, unknown>> = [
    { status: ['PENDING', 'APPROVED'] }, { entity_type: ['COMPANY', 'SUPPLIER'] }, { page: ['1', '2'] }, { limit: ['10', '20'] },
    { search: ['a', 'b'] }, { status: 1 }, { entity_type: {} },
  ];
  for (const query of bad) {
    assert.throws(() => parseListQuery(query), (error: any) => error instanceof MasterDataRequestError && error.status === 400, JSON.stringify(query));
  }
  assert.deepEqual(parseListQuery({ status: ' pending ', entity_type: 'supplier' }), { status: 'PENDING', entityType: 'SUPPLIER', search: '', page: 1, limit: 50 });
  assert.deepEqual(parseListQuery({ status: '', entity_type: '  ' }), { status: undefined, entityType: undefined, search: '', page: 1, limit: 50 });
});

test('business audit projection keeps request fields and strips unknown keys', () => {
  const projected = m.businessAudit.safeBusinessAudit('MasterDataAdditionRequest', JSON.stringify({
    entity_type: 'COMPANY', status: 'APPROVED', name: 'BDO Leasing', sap_numbers: ['SAP-1', 7, null], requested_by_id: 'tass', password: 'x',
    account_managers: [{ id: 'am-1', name: 'Leanne', email: 'leak@example.test' }, 'junk'], supplier_categories: [{ id: 'cat-1', name: 'Printers', extra: 1 }],
    created_entity_name: 'BDO Leasing', version: 2,
  }));
  assert.deepEqual(projected, { entity_type: 'COMPANY', status: 'APPROVED', name: 'BDO Leasing', sap_numbers: ['SAP-1'],
    account_managers: [{ id: 'am-1', name: 'Leanne' }], supplier_categories: [{ id: 'cat-1', name: 'Printers' }], created_entity_name: 'BDO Leasing', version: 2 });
});

for (const mode of ['LEGACY', 'V1'] as const) {
  test(`${mode}: TASS submits company and supplier requests that notify active Admins and are audited`, async t => {
    const f = await fixture(t, mode);
    const response = await f.submit('tass', walkIn);
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.deepEqual({ name: created.name, status: created.status, version: created.version, sap: created.sap_numbers, by: created.requested_by },
      { name: 'Juan Dela Cruz Repair', status: 'PENDING', version: 1, sap: [], by: { id: 'tass', name: 'Roselyn Arguelles' } });
    assert.equal(f.requests.get(created.id).normalizedName, 'juan dela cruz repair');
    assert.ok(f.executed.mock.calls.some((call: any) => call.arguments[0].join('').includes('pg_advisory_xact_lock(731110, 1)')), 'company directory lock');
    const lockSql = f.executed.mock.calls.map((call: any) => call.arguments[0].join(''));
    assert.deepEqual(lockSql.slice(0, 2), ['SELECT pg_advisory_xact_lock_shared(243, 1)', 'SELECT pg_advisory_xact_lock(731110, 1)'],
      'the shared authorization lock is taken first, then the directory lock');
    const adminNotes = f.notifications.filter(n => n.recordId === created.id);
    const expectedAdmins = ['admin', 'admin-no-company', 'admin-no-supplier', 'admin2'];
    assert.deepEqual(adminNotes.map(n => n.userId).sort(), expectedAdmins, 'every active Admin with admin READ; never inactive Admins');
    assert.deepEqual({ title: adminNotes[0].title, recordType: adminNotes[0].recordType }, { title: 'New Company addition request', recordType: 'MasterDataAdditionRequest' });
    assert.match(adminNotes[0].message, /Roselyn Arguelles requested to add company "Juan Dela Cruz Repair"\./);
    assert.deepEqual(f.audits.map(a => [a.recordType, a.action, a.changedById, a.previousValue]), [['MasterDataAdditionRequest', 'CREATE', 'tass', null]]);

    const enterprise = await f.submit('tass', { entity_type: 'COMPANY', name: 'BDO Leasing', sap_numbers: ['SAP-200', 'SAP-201'], account_manager_ids: ['am-2', 'am-1'] });
    assert.equal(enterprise.status, 201);
    assert.deepEqual((await enterprise.json()).account_managers.map((am: any) => am.name), ['Paolo Soriano', 'Leanne Pavoreal']);

    const supplier = await f.submit('tass', { entity_type: 'SUPPLIER', name: 'Northwind Trading', email: 'po@northwind.test', city: 'Pasig', supplier_category_ids: ['cat-1'] });
    assert.equal(supplier.status, 201);
    assert.deepEqual((await supplier.json()).supplier_categories, [{ id: 'cat-1', name: 'Printers', is_active: true }]);
    assert.ok(f.executed.mock.calls.some((call: any) => call.arguments[0].join('').includes('pg_advisory_xact_lock(731105, 1)')), 'supplier catalog lock');
    assert.equal((await f.submit('tass', { entity_type: 'SUPPLIER', name: 'Contoso Supply' })).status, 201, 'categories are optional');
  });

  test(`${mode}: only TASS with RMA write may submit; every other role and revoked TASS get 403`, async t => {
    const f = await fixture(t, mode);
    for (const as of ['admin', 'sales', 'logistics', 'driver', 'tass-revoked']) {
      const response = await f.submit(as, walkIn);
      assert.equal(response.status, 403, as);
    }
    assert.equal(f.requests.size, 0); assert.equal(f.notifications.length, 0); assert.equal(f.audits.length, 0);
  });

  test(`${mode}: duplicates against the directory and pending requests are 409, resubmission after rejection succeeds`, async t => {
    const f = await fixture(t, mode);
    const cases: Array<[unknown, RegExp, string]> = [
      [{ entity_type: 'COMPANY', name: 'bdo  UNIBANK inc.' }, /company named "BDO Unibank Inc\." already exists/, 'name'],
      [{ entity_type: 'COMPANY', name: 'New Client', sap_numbers: ['sap-100'] }, /already uses SAP number "SAP-100"/, 'sap_numbers'],
      [{ entity_type: 'SUPPLIER', name: 'ACME parts' }, /supplier named "Acme   Parts" already exists/, 'name'],
    ];
    for (const [body, message, field] of cases) {
      const response = await f.submit('tass', body);
      assert.equal(response.status, 409, JSON.stringify(body));
      const json = await response.json();
      assert.match(json.error, message); assert.equal(json.field, field); assert.equal(json.fields[field], json.error);
    }
    assert.equal((await f.submit('tass', { entity_type: 'COMPANY', name: 'New Client', account_manager_ids: ['am-off'] })).status, 409, 'inactive AM');
    assert.equal((await f.submit('tass', { entity_type: 'COMPANY', name: 'New Client', account_manager_ids: ['am-gone'] })).status, 400, 'missing AM');
    assert.equal((await f.submit('tass', { entity_type: 'SUPPLIER', name: 'New Supplier', supplier_category_ids: ['cat-off'] })).status, 409, 'inactive category');
    const first = await (await f.submit('tass', { entity_type: 'COMPANY', name: 'Repeat Client' })).json();
    const duplicate = await f.submit('tass2', { entity_type: 'COMPANY', name: 'repeat   client' });
    assert.equal(duplicate.status, 409);
    assert.match((await duplicate.json()).error, /pending addition request for "repeat client" already exists/);
    assert.equal((await f.submit('tass', { entity_type: 'SUPPLIER', name: 'Repeat Client' })).status, 201, 'the same name may be requested as a supplier');
    assert.equal((await f.reject('admin', first.id, { expected_version: 1, rejection_reason: 'Need full legal name' })).status, 200);
    assert.equal((await f.submit('tass', { entity_type: 'COMPANY', name: 'Repeat Client' })).status, 201, 'resubmission after rejection');
  });

  test(`${mode}: TASS lists only its own requests, Admin sees the queue with counts, other roles are denied`, async t => {
    const f = await fixture(t, mode);
    const own = await (await f.submit('tass', walkIn)).json();
    const other = await (await f.submit('tass2', { entity_type: 'SUPPLIER', name: 'Northwind Trading' })).json();
    await f.reject('admin', other.id, { expected_version: 1, rejection_reason: 'Already handled offline' });
    const mine = await f.request('tass', `/api/v1/master-data-requests?requested_by_id=tass2&status=ALL`);
    assert.equal(mine.status, 200);
    assert.equal(mine.headers.get('cache-control'), 'no-store');
    const body = await mine.json();
    assert.deepEqual(body.requests.map((row: any) => row.id), [own.id], 'a foreign requester filter is ignored');
    assert.deepEqual(body.counts, { pending: 1, approved: 0, rejected: 0 });
    assert.equal((await f.request('tass', `/api/v1/master-data-requests/${other.id}`)).status, 404, 'another user\'s request is indistinguishable from a missing one');
    assert.equal((await f.request('tass', `/api/v1/master-data-requests/${own.id}`)).status, 200);
    const queue = await (await f.request('admin', '/api/v1/master-data-requests')).json();
    assert.deepEqual(queue.requests.map((row: any) => row.id).sort(), [own.id, other.id].sort());
    assert.deepEqual(queue.counts, { pending: 1, approved: 0, rejected: 1 });
    assert.deepEqual((await (await f.request('admin', '/api/v1/master-data-requests?status=REJECTED&entity_type=SUPPLIER')).json()).requests.map((row: any) => row.id), [other.id]);
    assert.equal((await f.request('admin', '/api/v1/master-data-requests?status=DONE')).status, 400);
    assert.equal((await f.request('admin', `/api/v1/master-data-requests/${other.id}`)).status, 200);
    for (const as of ['sales', 'logistics', 'driver']) {
      assert.equal((await f.request(as, '/api/v1/master-data-requests')).status, 403, as);
      assert.equal((await f.request(as, `/api/v1/master-data-requests/${own.id}`)).status, 403, as);
    }
  });

  test(`${mode}: listing is paginated and filtered on the server with exact counts beyond the first page`, async t => {
    const f = await fixture(t, mode);
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push((await (await f.submit('tass', { entity_type: i % 2 ? 'SUPPLIER' : 'COMPANY', name: `Client ${i}`,
      ...(i === 0 ? { sap_numbers: ['SAP-OLD-777'] } : {}), notes: i === 3 ? 'needs walk-in review' : '' })).json()).id);
    await f.reject('admin', ids[6], { expected_version: 1, rejection_reason: 'Duplicate request' });
    const page1 = await (await f.request('admin', '/api/v1/master-data-requests?status=PENDING&limit=2&page=1')).json();
    assert.deepEqual({ total: page1.total, pages: page1.pages, page: page1.page, limit: page1.limit, rows: page1.requests.length },
      { total: 6, pages: 3, page: 1, limit: 2, rows: 2 });
    assert.deepEqual(page1.counts, { pending: 6, approved: 0, rejected: 1 }, 'counts cover every page, not just the loaded rows');
    const last = await (await f.request('admin', '/api/v1/master-data-requests?status=PENDING&limit=2&page=3')).json();
    assert.ok(last.requests.some((row: any) => row.id === ids[0]), 'the oldest pending request is still reachable');
    const badge = await (await f.request('admin', '/api/v1/master-data-requests?limit=1')).json();
    assert.equal(badge.requests.length, 1);
    assert.equal(badge.counts.pending, page1.counts.pending, 'badge summary and the Pending tab agree');
    const suppliers = await (await f.request('admin', '/api/v1/master-data-requests?entity_type=SUPPLIER&status=ALL')).json();
    assert.deepEqual(suppliers.counts, { pending: 3, approved: 0, rejected: 0 }, 'counts follow the entity filter');
    assert.equal(suppliers.total, 3);
    assert.deepEqual((await (await f.request('admin', '/api/v1/master-data-requests?search=old-777')).json()).requests.map((row: any) => row.id), [ids[0]], 'SAP substring search');
    assert.deepEqual((await (await f.request('admin', '/api/v1/master-data-requests?search=WALK-IN')).json()).requests.map((row: any) => row.id), [ids[3]], 'notes search');
    const byRequester = await (await f.request('admin', '/api/v1/master-data-requests?search=roselyn&limit=100')).json();
    assert.equal(byRequester.total, 7, 'requester name search');
    for (const query of ['page=0', 'page=-1', 'page=abc', 'limit=0', 'limit=101', 'limit=2.5', `search=${'x'.repeat(201)}`, 'page=999999999999',
      'status=PENDING&status=APPROVED', 'entity_type=COMPANY&entity_type=SUPPLIER', 'page=1&page=2', 'limit=10&limit=20', 'search=a&search=b']) {
      const response = await f.request('admin', `/api/v1/master-data-requests?${query}`);
      assert.equal(response.status, 400, query);
      assert.equal('requests' in (await response.json()), false, `${query}: never an unfiltered list`);
    }
    const own = await (await f.request('tass', '/api/v1/master-data-requests?limit=1')).json();
    assert.deepEqual(own.capabilities, { can_submit_company: true, can_submit_supplier: true });
    assert.equal(own.counts.pending, 6);
  });

  test(`${mode}: one-click approval creates the company with SAP numbers and Account Managers and notifies the requester`, async t => {
    const f = await fixture(t, mode);
    const created = await (await f.submit('tass', { ...walkIn, sap_numbers: ['SAP-900', 'SAP-901'], account_manager_ids: ['am-2', 'am-1'] })).json();
    f.notifications.length = 0; f.audits.length = 0;
    for (const as of ['tass', 'sales', 'logistics', 'driver']) assert.equal((await f.approve(as, created.id, { expected_version: 1 })).status, 403, as);
    const locksBefore = f.executed.mock.calls.length;
    const response = await f.approve('admin', created.id, { expected_version: 1, entity_type: 'COMPANY' });
    assert.equal(response.status, 200);
    assert.equal(f.executed.mock.calls[locksBefore].arguments[0].join(''), 'SELECT pg_advisory_xact_lock_shared(243, 1)', 'approval takes the shared lock first');
    const result = await response.json();
    assert.deepEqual({ status: result.request.status, version: result.request.version, entity: result.request.created_entity_name, reviewer: result.request.reviewed_by },
      { status: 'APPROVED', version: 2, entity: 'Juan Dela Cruz Repair', reviewer: { id: 'admin', name: 'System Admin' } });
    assert.equal(result.request.created_company_id, result.created_company.id);
    assert.deepEqual({ name: result.created_company.name, sap: result.created_company.sap_numbers, contact: result.created_company.contact_person,
      ams: result.created_company.account_managers.map((am: any) => am.id), default: result.created_company.default_account_manager.id },
    { name: 'Juan Dela Cruz Repair', sap: ['SAP-900', 'SAP-901'], contact: 'Juan (0917 000 0000)', ams: ['am-1', 'am-2'], default: 'am-1' });
    const company = f.companies.at(-1);
    assert.deepEqual({ sapNumber: company.sapNumber, normalizedName: company.normalizedName }, { sapNumber: 'SAP-900', normalizedName: 'juan dela cruz repair' });
    assert.deepEqual(f.notifications.map(n => [n.userId, n.title, n.recordType]), [['tass', 'Company addition request approved', 'MasterDataAdditionRequest']]);
    assert.match(f.notifications[0].message, /approved by System Admin and added to the directory/);
    assert.deepEqual(f.audits.map(a => [a.recordType, a.action, a.changedById]), [['Company', 'CREATE', 'admin'], ['MasterDataAdditionRequest', 'UPDATE', 'admin']]);
    const audit = m.businessAudit.safeBusinessAudit('MasterDataAdditionRequest', f.audits[1].newValue)!;
    assert.equal(audit.status, 'APPROVED'); assert.equal(audit.created_entity_name, 'Juan Dela Cruz Repair');
    assert.equal(m.businessAudit.safeBusinessAudit('MasterDataAdditionRequest', f.audits[1].previousValue)!.status, 'PENDING');
    // Already approved; and a stale version on another pending request.
    const again = await f.approve('admin', created.id, { expected_version: 2 });
    assert.equal(again.status, 409); assert.match((await again.json()).error, /already been approved/);
    const next = await (await f.submit('tass', { entity_type: 'COMPANY', name: 'Second Client' })).json();
    const stale = await f.approve('admin', next.id, { expected_version: 3 });
    assert.equal(stale.status, 409); assert.match((await stale.json()).error, /updated in another session/);
    assert.equal((await f.approve('admin', next.id, { expected_version: 1, entity_type: 'SUPPLIER' })).status, 400, 'entity_type hint must match');
    assert.equal((await f.approve('admin', 'req-missing', { expected_version: 1 })).status, 404);
  });

  test(`${mode}: Admin review overrides apply, and directory conflicts at approval time are 409`, async t => {
    const f = await fixture(t, mode);
    const created = await (await f.submit('tass', { entity_type: 'COMPANY', name: 'Metro Bank Branch', contact_person: 'Ana', contact_phone: '555' })).json();
    const response = await f.approve('admin', created.id, { expected_version: 1, name: 'Metrobank - Ortigas', sap_numbers: ['SAP-777'], contact_person: 'Ana Cruz',
      account_manager_ids: ['am-2'], review_notes: 'Renamed to legal name' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual({ name: result.created_company.name, sap: result.created_company.sap_numbers, contact: result.created_company.contact_person },
      { name: 'Metrobank - Ortigas', sap: ['SAP-777'], contact: 'Ana Cruz' });
    assert.deepEqual({ name: result.request.name, notes: result.request.review_notes }, { name: 'Metrobank - Ortigas', notes: 'Renamed to legal name' });
    const clash = await (await f.submit('tass', { entity_type: 'COMPANY', name: 'Late Duplicate' })).json();
    const conflict = await f.approve('admin', clash.id, { expected_version: 1, name: 'BDO Unibank Inc.' });
    assert.equal(conflict.status, 409); assert.equal((await conflict.json()).field, 'name');
    const sapClash = await f.approve('admin', clash.id, { expected_version: 1, sap_numbers: ['SAP-777'] });
    assert.equal(sapClash.status, 409); assert.equal((await sapClash.json()).field, 'sap_numbers');
    assert.equal(f.requests.get(clash.id).status, 'PENDING', 'a failed approval leaves the request pending');
  });

  test(`${mode}: supplier approval creates the supplier with categories; rejection needs a reason and creates nothing`, async t => {
    const f = await fixture(t, mode);
    const created = await (await f.submit('tass', { entity_type: 'SUPPLIER', name: 'Northwind Trading', contact_person: 'Lee', contact_phone: '8888', email: 'po@northwind.test',
      city: 'Pasig', address: 'Ortigas', supplier_category_ids: ['cat-1'], sap_numbers: ['V-1'] })).json();
    const response = await f.approve('admin', created.id, { expected_version: 1, entity_type: 'SUPPLIER' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual({ name: result.created_supplier.name, phone: result.created_supplier.phone, email: result.created_supplier.email, city: result.created_supplier.city,
      category: result.created_supplier.category, categories: result.created_supplier.categories.map((c: any) => c.id), by: result.created_supplier.created_by },
    { name: 'Northwind Trading', phone: '8888', email: 'po@northwind.test', city: 'Pasig', category: 'Printers', categories: ['cat-1'], by: 'System Admin' });
    assert.equal(result.request.created_supplier_id, result.created_supplier.id);
    assert.ok(f.audits.some(a => a.recordType === 'Supplier' && a.action === 'CREATE' && a.changedById === 'admin'));
    const uncategorized = await (await f.submit('tass', { entity_type: 'SUPPLIER', name: 'Unknown Vendor' })).json();
    const plain = await (await f.approve('admin', uncategorized.id, { expected_version: 1 })).json();
    assert.equal(plain.created_supplier.category, ''); assert.deepEqual(plain.created_supplier.categories, []);

    const pending = await (await f.submit('tass', { entity_type: 'SUPPLIER', name: 'Rejected Vendor' })).json();
    const suppliersBefore = f.suppliers.length;
    f.notifications.length = 0; f.audits.length = 0;
    for (const reason of [undefined, '', '  ', 'no']) assert.equal((await f.reject('admin', pending.id, { expected_version: 1, rejection_reason: reason })).status, 400, String(reason));
    for (const as of ['tass', 'sales', 'logistics', 'driver']) assert.equal((await f.reject(as, pending.id, { expected_version: 1, rejection_reason: 'Duplicate' })).status, 403, as);
    assert.equal((await f.reject('admin', pending.id, { expected_version: 2, rejection_reason: 'Duplicate vendor' })).status, 409);
    const rejected = await f.reject('admin', pending.id, { expected_version: 1, rejection_reason: 'Duplicate of Acme Parts' });
    assert.equal(rejected.status, 200);
    const body = await rejected.json();
    assert.deepEqual({ status: body.request.status, version: body.request.version, reason: body.request.rejection_reason },
      { status: 'REJECTED', version: 2, reason: 'Duplicate of Acme Parts' });
    assert.equal(f.suppliers.length, suppliersBefore, 'rejection creates no supplier');
    assert.deepEqual(f.notifications.map(n => [n.userId, n.title]), [['tass', 'Supplier addition request rejected']]);
    assert.match(f.notifications[0].message, /rejected by System Admin: Duplicate of Acme Parts/);
    assert.deepEqual(f.audits.map(a => [a.recordType, a.action]), [['MasterDataAdditionRequest', 'UPDATE']]);
    assert.equal((await f.approve('admin', pending.id, { expected_version: 2 })).status, 409, 'a rejected request cannot be approved');
  });

  // V1 hard deletes additionally require a reviewed account-editor version; the linked-record guard is shared.
  if (mode === 'LEGACY') test(`${mode}: users who submitted requests cannot be hard-deleted`, async t => {
    const f = await fixture(t, mode);
    await f.submit('tass2', walkIn);
    for (const model of ['deliveryRecord', 'auditLog', 'product', 'customer', 'supplier', 'comment', 'remarkLog'] as const) f.stub((f.prisma as any)[model], 'count', async () => 0);
    f.stub(f.prisma.masterDataAdditionRequest, 'count', async ({ where }: any) => [...f.requests.values()].filter(row => row.requestedById === where.requestedById).length);
    f.stub(f.prisma.user, 'delete', async () => { throw new Error('foreign key violation'); });
    f.stub(f.prisma.rolePolicy, 'findMany', async () => []);
    const response = await f.request('admin', '/api/v1/users/tass2', { method: 'DELETE', body: {} });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Cannot delete a user with business records/);
  });
}

test('LEGACY: TASS keeping Suppliers and records but losing the RMA screen or RMA write gets false capabilities and 403', async t => {
  const f = await fixture(t, 'LEGACY');
  for (const as of ['tass-no-rma-screen', 'tass-no-rma-write']) {
    const list = await f.request(as, '/api/v1/master-data-requests?limit=1');
    assert.equal(list.status, 200, `${as} can still follow its requests`);
    assert.deepEqual((await list.json()).capabilities, { can_submit_company: false, can_submit_supplier: false }, as);
    for (const entity_type of ['SUPPLIER', 'COMPANY']) assert.equal((await f.submit(as, { entity_type, name: 'Blocked Client' })).status, 403, `${as} ${entity_type}`);
  }
  assert.equal(f.requests.size, 0);
});

test('V1: Admin approval follows directory creation denials; reject needs only Admin write', async t => {
  const f = await fixture(t, 'V1');
  const company = await (await f.submit('tass', { entity_type: 'COMPANY', name: 'Denied Company' })).json();
  const supplier = await (await f.submit('tass', { entity_type: 'SUPPLIER', name: 'Denied Supplier' })).json();
  assert.equal((await f.approve('admin-no-company', company.id, { expected_version: 1 })).status, 403);
  assert.equal((await f.approve('admin-no-supplier', supplier.id, { expected_version: 1 })).status, 403);
  assert.equal((await f.approve('admin-no-supplier', company.id, { expected_version: 1 })).status, 200, 'company approval does not need supplier creation');
  assert.equal((await f.approve('admin-no-company', supplier.id, { expected_version: 1 })).status, 200);
  assert.equal(f.requests.get(company.id).reviewedById, 'admin-no-supplier');
  const later = await (await f.submit('tass', { entity_type: 'COMPANY', name: 'Rejectable Company' })).json();
  assert.equal((await f.reject('admin-no-company', later.id, { expected_version: 1, rejection_reason: 'Not needed' })).status, 200);
});

test('V1: a TASS user who loses RMA write mid-session is rejected inside the transaction', async t => {
  const f = await fixture(t, 'V1');
  const original = f.prisma.user.findUnique;
  let calls = 0;
  // requireAuth loads the account first (allowed); the in-transaction re-read sees the revocation.
  f.stub(f.prisma.user, 'findUnique', async (args: any) => {
    const row = await original(args);
    if (args.where.id === 'tass' && ++calls > 1) row.permissionOverrides = [{ userId: 'tass', permissionKey: 'CATEGORY:RMA:WRITE', effect: 'DENY' }];
    return row;
  });
  const response = await f.submit('tass', walkIn);
  assert.equal(response.status, 403);
  assert.equal(f.requests.size, 0);
});

test('notification and audit visibility: Admin with admin READ, TASS own requests only, other roles never', () => {
  const sql = (value: any) => ({ text: value.strings.join('?'), values: value.values });
  const legacy = (role: string, resources: string[]) => ({ id: `${role}-id`, name: role, email: '', role, permissions: [], effectiveScreens: [], resources, permissionVersion: 'v' }) as any;
  const admin = sql(m.visibility.additionRequestNotificationVisibility(legacy('ADMIN', ['admin'])));
  assert.equal(admin.text, 'TRUE');
  assert.equal(sql(m.visibility.additionRequestNotificationVisibility(legacy('ADMIN', []))).text, 'FALSE');
  const tass = sql(m.visibility.additionRequestNotificationVisibility(legacy('TASS', ['companies'])));
  assert.match(tass.text, /EXISTS \(SELECT 1 FROM "MasterDataAdditionRequest" m WHERE m\."id" = n\."recordId"/);
  assert.deepEqual(tass.values, ['TASS-id', 'COMPANY'], 'only own requests for readable entity types');
  for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'DRIVER']) {
    assert.equal(sql(m.visibility.additionRequestNotificationVisibility(legacy(role, ['companies', 'suppliers', 'admin']))).text, 'FALSE', role);
  }
  const full = sql(m.visibility.notificationVisibility(legacy('SALES_COORDINATOR', ['companies'])));
  assert.match(full.text, /IS DISTINCT FROM \?\)/, 'the LEGACY catch-all excludes addition requests');
  assert.ok(full.values.includes('MasterDataAdditionRequest'));
  const v1 = (role: PolicyRole, deny: string[] = []) => {
    const snapshot = m.evaluator.evaluatePermissions({ userId: `${role}-id`, role, isActive: true, authorizationRevision: 1n, driverProfile: null,
      rolePolicy: { role, revision: 1n, catalogVersion: 1, permissions: [...m.catalog.defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ role, permissionKey, effect })) } as any,
      overrides: deny.map(permissionKey => ({ userId: `${role}-id`, permissionKey, effect: 'DENY' })) as any });
    return { ...legacy(role, snapshot.resources), activeMode: 'V1', snapshot } as any;
  };
  assert.equal(sql(m.visibility.additionRequestNotificationVisibility(v1('ADMIN'))).text, 'TRUE');
  assert.ok(sql(m.auditVisibility.auditVisibilitySql(v1('ADMIN'))).values.includes('MasterDataAdditionRequest'), 'V1 Admin audit log shows request entries');
  // Admin READ is protected for ADMIN in V1, so access is lost by demotion: a former Admin sees neither.
  for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'DRIVER'] as const) {
    assert.equal(sql(m.visibility.additionRequestNotificationVisibility(v1(role))).text, 'FALSE', role);
    assert.ok(!sql(m.auditVisibility.auditVisibilitySql(v1(role))).values.includes('MasterDataAdditionRequest'), role);
  }
  assert.deepEqual(sql(m.visibility.additionRequestNotificationVisibility(v1('TASS'))).values, ['TASS-id', 'COMPANY', 'SUPPLIER']);
  assert.deepEqual(sql(m.visibility.additionRequestNotificationVisibility(v1('TASS', ['RESOURCE:companies:READ']))).values, ['TASS-id', 'SUPPLIER']);
});
