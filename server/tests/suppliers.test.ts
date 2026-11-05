import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';
import authRoutes from '../src/routes/auth';
import supplierRoutes from '../src/routes/suppliers';
import { Prisma } from '@prisma/client';
import { safeBusinessAudit } from '../src/services/businessAudit';

afterEach(() => mock.restoreAll());

const CREATED_AT = new Date('2026-10-07T01:00:00.000Z');
const catalog = () => [
  { id: 'hardware', name: 'Hardware', normalizedName: 'hardware', isActive: true, version: 1, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  { id: 'consumables', name: 'Consumables', normalizedName: 'consumables', isActive: true, version: 1, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  { id: 'inactive', name: 'Retired', normalizedName: 'retired', isActive: false, version: 1, createdAt: CREATED_AT, updatedAt: CREATED_AT },
];

const supplierRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'supplier-1', name: 'Acme Supplies', contactPerson: 'Ana', email: 'ana@acme.ph', phone: '02-8000-1111',
  address: '1 Ayala Ave', city: 'Makati', category: 'Hardware', createdById: 'u-1', createdAt: CREATED_AT,
  modifiedById: 'u-1', modifiedAt: CREATED_AT, version: 1,
  categories: [{ categoryId: 'hardware', category: catalog()[0] }, { categoryId: 'inactive', category: catalog()[2] }],
  createdBy: { name: 'Admin' }, modifiedBy: { name: 'Admin' },
  ...overrides,
});

const createUser = (role: string) => ({
  id: 'test-user', name: 'Test User', email: 'test@example.com', role, permissions: [], isActive: true,
  password: bcrypt.hashSync('test-password', 4),
});

const withApp = async (
  role: string,
  run: (url: string, headers: Record<string, string>, calls: Record<string, any[]>) => Promise<void>,
  options: { failAudit?: boolean } = {},
) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRoutes);
  app.use('/suppliers', supplierRoutes);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const calls: Record<string, any[]> = { transaction: [], supplierCreate: [], audit: [], locks: [], categoryCreate: [], categoryUpdate: [], supplierUpdate: [] };
  const row = createUser(role);
  let categories = catalog();
  let existing = supplierRow();
  const tx = {
    $queryRaw: async (_query: unknown, name: string) => [{ key: name.toLowerCase() }],
    $executeRaw: async () => { calls.locks.push(true); return 1; },
    supplierCategory: {
      findMany: async (args: any) => categories.filter(category => !args?.where?.id || args.where.id.in.includes(category.id)),
      findUnique: async ({ where }: any) => categories.find(category => where.id ? category.id === where.id : category.normalizedName === where.normalizedName) ?? null,
      create: async ({ data }: any) => {
        assert.equal(calls.locks.length, calls.transaction.length);
        calls.categoryCreate.push(data);
        if (categories.some(category => category.normalizedName === data.normalizedName)) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
        const created = { ...catalog()[0], id: 'category-new', ...data };
        categories.push(created); return created;
      },
      update: async ({ where, data }: any) => {
        calls.categoryUpdate.push(data);
        const previous = categories.find(category => category.id === where.id)!;
        const updated = { ...previous, ...data, version: previous.version + 1 };
        categories = categories.map(category => category.id === where.id ? updated : category);
        return updated;
      },
    },
    supplier: {
      findUnique: async ({ where }: any) => where.id === existing.id ? existing : null,
      update: async ({ data }: any) => {
        calls.supplierUpdate.push(data);
        existing = supplierRow({ ...existing, ...data, version: existing.version + 1,
          categories: data.categories.create.map((link: any) => ({ ...link, category: categories.find(category => category.id === link.categoryId) })) });
        return existing;
      },
      create: async (args: any) => {
        assert.equal(calls.locks.length, calls.transaction.length);
        calls.supplierCreate.push(args);
        return supplierRow({
          ...args.data,
          categories: args.data.categories.create.map((link: any) => ({ ...link, category: categories.find(category => category.id === link.categoryId) })),
          id: 'supplier-new',
          createdBy: { name: 'Test User' },
          modifiedBy: { name: 'Test User' },
        });
      },
    },
    auditLog: {
      create: async (args: any) => {
        calls.audit.push(args);
        if (options.failAudit) throw new Error('Audit write failed');
        return {};
      },
    },
  };
  const originals = { user: prisma.user.findUnique, transaction: prisma.$transaction, categoryRead: prisma.supplierCategory.findMany };
  prisma.supplierCategory.findMany = tx.supplierCategory.findMany as any;
  prisma.user.findUnique = mock.fn(async () => row) as any;
  (prisma as any).$transaction = mock.fn(async (fn: any) => {
    calls.transaction.push(true);
    return fn(tx);
  });

  try {
    const login = await fetch(`${url}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: row.email, password: 'test-password' }),
    });
    assert.equal(login.status, 200);
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
    await run(url, headers, calls);
  } finally {
    prisma.user.findUnique = originals.user;
    (prisma as any).$transaction = originals.transaction;
    prisma.supplierCategory.findMany = originals.categoryRead;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
};

test('creating a supplier writes its initial details and actor to the same transaction', async () => {
  await withApp('SALES_COORDINATOR', async (url, headers, calls) => {
    const res = await fetch(`${url}/suppliers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Bayani Foods',
        contact_person: 'Mila Cruz',
        email: 'mila@bayani.example',
        phone: '+63 2 8000 1111',
        address: '22 Makati Ave',
        city: 'Makati',
        category: 'Consumables',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json() as any;
    assert.equal(body.id, 'supplier-new');
    assert.equal(body.name, 'Bayani Foods');
    assert.equal(body.created_by, 'Test User');
    assert.equal(calls.transaction.length, 1);
    assert.equal(calls.supplierCreate.length, 1);
    assert.equal(calls.audit.length, 1);

    const audit = calls.audit[0].data;
    assert.equal(audit.recordId, 'supplier-new');
    assert.equal(audit.recordType, 'Supplier');
    assert.equal(audit.action, 'CREATE');
    assert.equal(audit.changedById, 'test-user');
    assert.equal(audit.previousValue, null);
    assert.deepEqual(JSON.parse(audit.newValue), {
      name: 'Bayani Foods',
      contact_person: 'Mila Cruz',
      email: 'mila@bayani.example',
      phone: '+63 2 8000 1111',
      address: '22 Makati Ave',
      city: 'Makati',
      category: 'Consumables',
      categories: [{ id: 'consumables', name: 'Consumables' }],
    });
  });
});

test('supplier creation reports an audit write failure instead of returning success', async () => {
  await withApp('ADMIN', async (url, headers, calls) => {
    const res = await fetch(`${url}/suppliers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Bayani Foods', category: 'Consumables' }),
    });

    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'Audit write failed' });
    assert.equal(calls.transaction.length, 1);
    assert.equal(calls.supplierCreate.length, 1);
    assert.equal(calls.audit.length, 1);
  }, { failAudit: true });
});

test('supplier creation validates required fields before opening a transaction', async () => {
  await withApp('SALES_COORDINATOR', async (url, headers, calls) => {
    const res = await fetch(`${url}/suppliers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Bayani Foods' }),
    });

    assert.equal(res.status, 400);
    assert.match((await res.json() as any).error, /Category/);
    assert.equal(calls.transaction.length, 0);
    assert.equal(calls.supplierCreate.length, 0);
    assert.equal(calls.audit.length, 0);
  });
});

test('supplier create accepts multiple active IDs, returns both and audits their immutable identities and labels', async () => {
  await withApp('LOGISTICS', async (url, headers, calls) => {
    const res = await fetch(`${url}/suppliers`, { method: 'POST', headers, body: JSON.stringify({ name: 'Multi', category_ids: ['hardware', 'consumables'] }) });
    assert.equal(res.status, 201);
    const body = await res.json() as any;
    assert.deepEqual(body.categories.map((category: any) => category.id), ['consumables', 'hardware']);
    assert.equal(body.version, 1);
    assert.deepEqual(JSON.parse(calls.audit[0].data.newValue).categories, [{ id: 'consumables', name: 'Consumables' }, { id: 'hardware', name: 'Hardware' }]);
  });
});

test('malformed, unknown, inactive and ambiguous supplier choices cannot be written', async () => {
  await withApp('ADMIN', async (url, headers, calls) => {
    for (const choices of [{ category_ids: [] }, { category_ids: 'hardware' }, { category_ids: ['hardware', 'hardware'] },
      { category_ids: ['missing'] }, { category_ids: ['inactive'] }, { category: 'Invented' }, { category_ids: ['hardware'], category: 'Hardware' }]) {
      const res = await fetch(`${url}/suppliers`, { method: 'POST', headers, body: JSON.stringify({ name: 'Test', ...choices }) });
      assert.ok([400, 409].includes(res.status));
    }
    assert.equal(calls.supplierCreate.length, 0);
    assert.equal(calls.audit.length, 0);
  });
});

test('only Admin can manage the catalog and edit existing supplier categories', async () => {
  for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER']) await withApp(role, async (url, headers, calls) => {
    for (const [path, method, body] of [['categories', 'POST', { name: 'New' }], ['categories/hardware', 'PATCH', { name: 'Rename', expected_version: 1 }],
      ['supplier-1/categories', 'PUT', { category_ids: ['hardware'], expected_version: 1 }]] as const) {
      assert.equal((await fetch(`${url}/suppliers/${path}`, { method, headers, body: JSON.stringify(body) })).status, 403, role);
    }
    assert.equal(calls.transaction.length, 0);
  });
});

test('Admin catalog create, duplicate rejection, rename, deactivate, stale conflict and reactivate', async () => {
  await withApp('ADMIN', async (url, headers, calls) => {
    const request = (path: string, method: string, body: unknown) => fetch(`${url}/suppliers/${path}`, { method, headers, body: JSON.stringify(body) });
    assert.equal((await request('categories', 'POST', { name: '  Custom  ' })).status, 201);
    assert.equal(calls.categoryCreate[0].name, 'Custom');
    assert.equal((await request('categories', 'POST', { name: ' hArDwArE ' })).status, 409);
    assert.equal((await request('categories/hardware', 'PATCH', { name: 'Equipment', expected_version: 1 })).status, 200);
    assert.equal((await request('categories/hardware', 'PATCH', { is_active: false, expected_version: 1 })).status, 409);
    assert.equal((await request('categories/hardware', 'PATCH', { is_active: false, expected_version: 2 })).status, 200);
    assert.equal((await request('categories/hardware', 'PATCH', { is_active: true, expected_version: 3 })).status, 200);
    assert.equal(calls.audit.filter(call => call.data.recordType === 'SupplierCategory').length, 4);
    const renamed = calls.audit[1].data;
    assert.equal(JSON.parse(renamed.previousValue).name, 'Hardware');
    assert.equal(JSON.parse(renamed.newValue).name, 'Equipment');
  });
});

test('assignment edit keeps existing inactive choices, rejects stale edits and records before/after snapshots', async () => {
  await withApp('ADMIN', async (url, headers, calls) => {
    const update = (ids: string[], version: number) => fetch(`${url}/suppliers/supplier-1/categories`, { method: 'PUT', headers,
      body: JSON.stringify({ category_ids: ids, expected_version: version }) });
    assert.equal((await update(['hardware', 'inactive', 'consumables'], 1)).status, 200);
    assert.equal(calls.supplierUpdate.length, 1);
    assert.equal((await update(['hardware'], 1)).status, 409);
    assert.equal((await update(['hardware'], 2)).status, 200);
    assert.equal((await update(['hardware', 'inactive'], 3)).status, 409);
    assert.equal(calls.audit.length, 2);
    assert.equal(JSON.parse(calls.audit[0].data.previousValue).categories.length, 2);
    assert.equal(JSON.parse(calls.audit[0].data.newValue).categories.length, 3);
    assert.equal((await update(['hardware'], 3)).status, 200);
    assert.equal(calls.audit.length, 2, 'unchanged selection is a no-op');
  });
});

test('supplier audit category projection excludes unknown nested data and shows catalog changes', () => {
  assert.deepEqual(safeBusinessAudit('Supplier', JSON.stringify({ categories: [{ id: 'cat', name: 'Hardware', secret: 'hidden' }], password: 'hidden' })),
    { categories: [{ id: 'cat', name: 'Hardware' }] });
  assert.deepEqual(safeBusinessAudit('SupplierCategory', JSON.stringify({ name: 'Hardware', is_active: false, normalizedName: 'hidden', version: 2 })),
    { name: 'Hardware', is_active: false, version: 2 });
});
