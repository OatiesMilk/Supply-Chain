import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';
import authRoutes from '../src/routes/auth';
import recordsRoutes from '../src/routes/records';

afterEach(() => mock.restoreAll());

const setupApp = async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRoutes);
  app.use('/records', recordsRoutes);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    },
  };
};

const createUser = (role = 'SALES_COORDINATOR') => ({
  id: 'test-user',
  name: 'Test User',
  email: 'test@example.com',
  role,
  permissions: [],
  isActive: true,
  password: bcrypt.hashSync('test-password', 4),
});

test('Logistics cannot create a Delivery but retains access to existing Delivery operations', async () => {
  const { url, close } = await setupApp();
  const row = createUser('LOGISTICS');
  const originalUserLookup = prisma.user.findUnique;
  prisma.user.findUnique = mock.fn(async () => row) as any;

  try {
    const headers = { ...(await loginAs(url, row)), 'Content-Type': 'application/json' };
    const response = await fetch(`${url}/records`, {
      method: 'POST', headers,
      body: JSON.stringify({ company_id: 'comp-1', reference: 'SAP-1', category: 'Deliveries' }),
    });
    assert.equal(response.status, 403);
    assert.match((await response.json() as any).error, /Only Sales Coordinator or Admin may create Deliveries/);
  } finally {
    prisma.user.findUnique = originalUserLookup;
    await close();
  }
});

test('RMA creation requires company, priority, area and account manager before database access', async () => {
  const { url, close } = await setupApp();
  const row = createUser('TASS');
  const originalUserLookup = prisma.user.findUnique;
  const originalCompanyLookup = prisma.company.findUnique;
  const companyLookup = mock.fn(async () => ({ id: 'comp-1' }));
  prisma.user.findUnique = mock.fn(async () => row) as any;
  prisma.company.findUnique = companyLookup as any;

  try {
    const headers = { ...(await loginAs(url, row)), 'Content-Type': 'application/json' };
    const complete = { company_id: 'comp-1', category: 'RMA', priority: '2 - Moderate', area: 'Carmona', account_manager: 'Alex AM' };
    for (const is_draft of ['Yes', 'No']) {
      for (const [field, error] of [['company_id', /company_id/], ['priority', /Priority is required/], ['area', /Area is required/], ['account_manager', /Account Manager is required/]] as const) {
        const response = await fetch(`${url}/records`, { method: 'POST', headers, body: JSON.stringify({ ...complete, [field]: ' ', is_draft }) });
        assert.equal(response.status, 400);
        assert.match((await response.json() as any).error, error);
      }
    }
    assert.equal(companyLookup.mock.callCount(), 0, 'invalid submissions are rejected before database lookup or write');
  } finally {
    prisma.user.findUnique = originalUserLookup;
    prisma.company.findUnique = originalCompanyLookup;
    await close();
  }
});

test('Sales Coordinator cannot assign drivers when creating a record', async () => {
  const { url, close } = await setupApp();
  const row = createUser('SALES_COORDINATOR');

  const originalUserLookup = prisma.user.findUnique;
  prisma.user.findUnique = mock.fn(async () => row) as any;

  try {
    const login = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: row.email, password: 'test-password' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' };

    const payload = {
      company_id: 'comp-1',
      reference: 'REF-001',
      category: 'Deliveries',
      driver: 'John Doe',
      is_draft: 'No',
    };

    const res = await fetch(`${url}/records`, { method: 'POST', headers, body: JSON.stringify(payload) });
    assert.equal(res.status, 403);
    const body = await res.json() as any;
    assert.match(body.error, /Sales Coordinator cannot assign drivers/);
  } finally {
    prisma.user.findUnique = originalUserLookup;
    await close();
  }
});

test('Logistics has view-only access to RMA records on update', async () => {
  const { url, close } = await setupApp();
  const row = createUser('LOGISTICS');

  const originalUserLookup = prisma.user.findUnique;
  const originalRecordLookup = prisma.deliveryRecord.findFirst;
  prisma.user.findUnique = mock.fn(async () => row) as any;

  // Mock the record finding
  prisma.deliveryRecord.findFirst = mock.fn(async ({ where }: any) => {
    if (where.id === 'REC-999') {
      return { id: 'REC-999', category: 'RMA', deletedAt: null };
    }
    return null;
  }) as any;

  try {
    const login = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: row.email, password: 'test-password' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' };

    // Try to update an RMA record as logistics
    const res = await fetch(`${url}/records/REC-999`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ driver: 'Logistics Assigned' })
    });
    assert.equal(res.status, 403);
    const body = await res.json() as any;
    assert.match(body.error, /Logistics has view-only access to RMA/);
  } finally {
    prisma.user.findUnique = originalUserLookup;
    prisma.deliveryRecord.findFirst = originalRecordLookup;
    await close();
  }
});

const loginAs = async (url: string, row: ReturnType<typeof createUser>) => {
  const login = await fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: row.email, password: 'test-password' }),
  });
  assert.equal(login.status, 200);
  return { Cookie: login.headers.get('set-cookie')!.split(';')[0] };
};

const withListMocks = async (role: string, run: (url: string, headers: Record<string, string>, calls: any[]) => Promise<void>, driverProfile: { id: string; type: string } | null = { id: 'profile-1', type: 'DRIVER' }) => {
  const { url, close } = await setupApp();
  const row = { ...createUser(role), driverProfile: role === 'DRIVER' ? driverProfile : null };
  const calls: any[] = [];
  const originalUserLookup = prisma.user.findUnique;
  const originalFindMany = prisma.deliveryRecord.findMany;
  prisma.user.findUnique = mock.fn(async () => row) as any;
  prisma.deliveryRecord.findMany = mock.fn(async (args: any) => { calls.push(args); return []; }) as any;
  try {
    await run(url, await loginAs(url, row), calls);
  } finally {
    prisma.user.findUnique = originalUserLookup;
    prisma.deliveryRecord.findMany = originalFindMany;
    await close();
  }
};

test('Company history filters by company_id and keeps the role scope', async () => {
  await withListMocks('SALES_COORDINATOR', async (url, headers, calls) => {
    const res = await fetch(`${url}/records?company_id=comp-1&limit=25`, { headers });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
    const args = calls[0];
    assert.equal(args.where.companyId, 'comp-1');
    assert.equal(args.where.deletedAt, null);
    assert.equal(args.take, 25);
    assert.ok(Array.isArray(args.where.AND) && args.where.AND[0].category.in.length > 0);
  });
});

test('Company history for TASS stays limited to RMA and Accounting Collection', async () => {
  await withListMocks('TASS', async (url, headers, calls) => {
    const res = await fetch(`${url}/records?company_id=comp-1`, { headers });
    assert.equal(res.status, 200);
    const allowed: string[] = calls[0].where.AND[0].category.in;
    assert.ok(allowed.every(c => ['RMA', 'ACCOUNTING_COLLECTION'].includes(c)));
  });
});

test('Company history for drivers only returns their own non-draft records', async () => {
  await withListMocks('DRIVER', async (url, headers, calls) => {
    const res = await fetch(`${url}/records?company_id=comp-1`, { headers });
    assert.equal(res.status, 200);
    const scope = calls[0].where.AND[0];
    assert.equal(scope.driverId, 'profile-1');
    assert.equal(scope.driver, undefined);
    assert.equal(scope.draft, false);
  });
});

test('a Driver login without a linked profile sees no records, even with a matching name', async () => {
  await withListMocks('DRIVER', async (url, headers, calls) => {
    const res = await fetch(`${url}/records`, { headers });
    assert.equal(res.status, 200);
    const scope = calls[0].where.AND[0];
    assert.deepEqual(scope.id, { in: [] });
    assert.equal(scope.driverId, undefined);
  }, null);
});

test('Record list maps the category filter and paginates with a cursor', async () => {
  await withListMocks('SALES_COORDINATOR', async (url, headers, calls) => {
    const res = await fetch(`${url}/records?company_id=comp-1&category=RMA&limit=10&cursor=REC-10001`, { headers });
    assert.equal(res.status, 200);
    assert.equal(calls[0].where.category, 'RMA');
    assert.deepEqual(calls[0].cursor, { id: 'REC-10001' });
    assert.equal(calls[0].skip, 1);
  });
});

test('Record list rejects invalid filters', async () => {
  await withListMocks('SALES_COORDINATOR', async (url, headers, calls) => {
    for (const query of ['company_id=bad%20id', 'category=Unknown', 'limit=0', 'limit=101', 'limit=abc', 'cursor=REC-1']) {
      const res = await fetch(`${url}/records?${query}`, { headers });
      assert.equal(res.status, 400, query);
    }
    assert.equal(calls.length, 0);
  });
});
