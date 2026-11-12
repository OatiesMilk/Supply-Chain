import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';
import authRoutes from '../src/routes/auth';
import customerRoutes from '../src/routes/customers';

afterEach(() => mock.restoreAll());

const MODIFIED_AT = new Date('2026-10-07T01:00:00.000Z');
const customerRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'cust-1', name: 'Acme Trading', contactPerson: 'Ana', email: 'ana@acme.ph', phone: '02-8000-1111',
  address: '1 Ayala Ave', city: 'Makati', createdById: 'u-1', createdAt: MODIFIED_AT,
  modifiedById: 'u-1', modifiedAt: MODIFIED_AT, createdBy: { name: 'Admin' }, modifiedBy: { name: 'Test User' },
  ...overrides,
});

const createUser = (role: string) => ({
  id: 'test-user', name: 'Test User', email: 'test@example.com', role, permissions: [], isActive: true,
  password: bcrypt.hashSync('test-password', 4),
});

const withApp = async (role: string, run: (url: string, headers: Record<string, string>, calls: Record<string, any[]>) => Promise<void>, current = customerRow()) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRoutes);
  app.use('/customers', customerRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const calls: Record<string, any[]> = { updateMany: [], audit: [], transaction: [], create: [] };
  const row = createUser(role);
  let saved = current;
  const tx = {
    customer: {
      findUnique: async () => current,
      updateMany: async (args: any) => { calls.updateMany.push(args); saved = { ...current, ...args.data, modifiedAt: new Date() }; return { count: 1 }; },
      findUniqueOrThrow: async () => saved,
      create: async (args: any) => { calls.create.push(args); return customerRow({ ...args.data, id: 'cust-new' }); },
    },
    auditLog: { create: async (args: any) => { calls.audit.push(args); return {}; } },
  };
  const originals = { user: prisma.user.findUnique, transaction: prisma.$transaction, auditFind: prisma.auditLog.findMany };
  prisma.user.findUnique = mock.fn(async () => row) as any;
  (prisma as any).$transaction = mock.fn(async (fn: any) => { calls.transaction.push(true); return fn(tx); });
  prisma.auditLog.findMany = mock.fn(async () => [{
    id: 'a-1', action: 'UPDATE', timestamp: MODIFIED_AT, changedBy: { name: 'Maria Reyes' },
    previousValue: JSON.stringify({ name: 'Acme', city: 'Makati' }),
    newValue: JSON.stringify({ name: 'Acme Trading', city: 'Makati', remarks: 'Registered name corrected' }),
  }]) as any;

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
    prisma.auditLog.findMany = originals.auditFind;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
};

const put = (url: string, headers: Record<string, string>, body: Record<string, unknown>) =>
  fetch(`${url}/customers/cust-1`, { method: 'PUT', headers, body: JSON.stringify(body) });

const validBody = { name: '  Acme Trading Corp  ', city: 'Taguig', remarks: 'Moved offices', expected_modified_at: MODIFIED_AT.toISOString() };

test('Sales Coordinator saves a customer edit with a trimmed value, actor and reason in the audit log', async () => {
  await withApp('SALES_COORDINATOR', async (url, headers, calls) => {
    const res = await put(url, headers, validBody);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.name, 'Acme Trading Corp');
    assert.equal(body.city, 'Taguig');

    const update = calls.updateMany[0];
    assert.deepEqual(update.where, { id: 'cust-1', modifiedAt: MODIFIED_AT });
    assert.deepEqual(update.data, { name: 'Acme Trading Corp', city: 'Taguig', modifiedById: 'test-user' });

    const audit = calls.audit[0].data;
    assert.equal(audit.recordType, 'Customer');
    assert.equal(audit.changedById, 'test-user');
    assert.equal(JSON.parse(audit.previousValue).city, 'Makati');
    assert.equal(JSON.parse(audit.newValue).remarks, 'Moved offices');
  });
});

test('Editing only the contact person updates the Prisma column and audit trail', async () => {
  await withApp('SALES_COORDINATOR', async (url, headers, calls) => {
    const res = await put(url, headers, {
      contact_person: 'Albert Wesker',
      remarks: 'Updated contact person',
      expected_modified_at: MODIFIED_AT.toISOString(),
    });
    assert.equal(res.status, 200);

    assert.deepEqual(calls.updateMany[0].data, {
      contactPerson: 'Albert Wesker',
      modifiedById: 'test-user',
    });
    const audit = calls.audit[0].data;
    assert.equal(JSON.parse(audit.previousValue).contact_person, 'Ana');
    assert.equal(JSON.parse(audit.newValue).contact_person, 'Albert Wesker');
    assert.equal(JSON.parse(audit.newValue).remarks, 'Updated contact person');
  });
});

test('TASS and Driver cannot edit customers through the API', async () => {
  for (const role of ['TASS', 'DRIVER']) {
    await withApp(role, async (url, headers, calls) => {
      const res = await put(url, headers, validBody);
      assert.equal(res.status, 403, role);
      assert.equal(calls.transaction.length, 0);
    });
  }
});

test('Invalid fields and a missing reason return inline field errors without saving', async () => {
  await withApp('LOGISTICS', async (url, headers, calls) => {
    const res = await put(url, headers, { name: '   ', email: 'not-an-email', phone: 'call me', expected_modified_at: MODIFIED_AT.toISOString() });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.match(body.fields.name, /required/);
    assert.match(body.fields.email, /valid email/);
    assert.match(body.fields.phone, /numbers/);
    assert.match(body.fields.remarks, /reason/);
    assert.equal(calls.transaction.length, 0);
  });
});

test('A stale edit is rejected with 409 instead of overwriting newer values', async () => {
  await withApp('ADMIN', async (url, headers, calls) => {
    const res = await put(url, headers, { ...validBody, expected_modified_at: '2026-10-06T00:00:00.000Z' });
    assert.equal(res.status, 409);
    assert.match((await res.json() as any).error, /Reload/);
    assert.equal(calls.updateMany.length, 0);
    assert.equal(calls.audit.length, 0);
  });
});

test('Saving without any field change is rejected', async () => {
  await withApp('ADMIN', async (url, headers, calls) => {
    const res = await put(url, headers, { name: 'Acme Trading', remarks: 'No-op', expected_modified_at: MODIFIED_AT.toISOString() });
    assert.equal(res.status, 400);
    assert.match((await res.json() as any).error, /No changes/);
    assert.equal(calls.audit.length, 0);
  });
});

test('Customer audit trail lists actor, reason and changed fields; TASS is denied', async () => {
  await withApp('SALES_COORDINATOR', async (url, headers) => {
    const res = await fetch(`${url}/customers/cust-1/audit`, { headers });
    assert.equal(res.status, 200);
    const [entry] = await res.json() as any[];
    assert.equal(entry.changed_by, 'Maria Reyes');
    assert.equal(entry.remarks, 'Registered name corrected');
    assert.deepEqual(entry.changes, [{ field: 'name', label: 'Customer name', from: 'Acme', to: 'Acme Trading' }]);
  });
  await withApp('TASS', async (url, headers) => {
    const res = await fetch(`${url}/customers/cust-1/audit`, { headers });
    assert.equal(res.status, 403);
  });
});

test('Creating a customer writes a CREATE audit entry with the initial values in the same transaction', async () => {
  await withApp('SALES_COORDINATOR', async (url, headers, calls) => {
    const res = await fetch(`${url}/customers`, { method: 'POST', headers, body: JSON.stringify({ name: 'Bayani Foods', city: 'Pasig' }) });
    assert.equal(res.status, 201);
    assert.equal(calls.transaction.length, 1);
    const audit = calls.audit[0].data;
    assert.equal(audit.action, 'CREATE');
    assert.equal(audit.recordType, 'Customer');
    assert.equal(audit.recordId, 'cust-new');
    assert.equal(audit.changedById, 'test-user');
    assert.equal(audit.previousValue, null);
    assert.equal(JSON.parse(audit.newValue).name, 'Bayani Foods');
  });
});
