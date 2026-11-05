import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';
import authRoutes from '../src/routes/auth';
import supplierRoutes from '../src/routes/suppliers';

afterEach(() => mock.restoreAll());

const CREATED_AT = new Date('2026-10-07T01:00:00.000Z');

const supplierRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'supplier-1', name: 'Acme Supplies', contactPerson: 'Ana', email: 'ana@acme.ph', phone: '02-8000-1111',
  address: '1 Ayala Ave', city: 'Makati', category: 'Hardware', createdById: 'u-1', createdAt: CREATED_AT,
  modifiedById: 'u-1', modifiedAt: CREATED_AT, createdBy: { name: 'Admin' }, modifiedBy: { name: 'Admin' },
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
  const calls: Record<string, any[]> = { transaction: [], supplierCreate: [], audit: [] };
  const row = createUser(role);
  const tx = {
    supplier: {
      create: async (args: any) => {
        calls.supplierCreate.push(args);
        return supplierRow({
          ...args.data,
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
  const originals = { user: prisma.user.findUnique, transaction: prisma.$transaction };
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
    assert.deepEqual(await res.json(), { error: 'name and category are required' });
    assert.equal(calls.transaction.length, 0);
    assert.equal(calls.supplierCreate.length, 0);
    assert.equal(calls.audit.length, 0);
  });
});
