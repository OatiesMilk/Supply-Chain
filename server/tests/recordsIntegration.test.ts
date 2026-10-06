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
