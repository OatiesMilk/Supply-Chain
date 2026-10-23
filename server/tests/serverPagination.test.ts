import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';
import authRoutes from '../src/routes/auth';
import recordsRoutes, { encodeCursor, decodeCursor } from '../src/routes/records';

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

const createUser = (role = 'ADMIN') => ({
  id: 'test-admin',
  name: 'Admin User',
  email: 'admin@example.com',
  role,
  permissions: [],
  isActive: true,
  password: bcrypt.hashSync('test-password', 4),
  driverProfile: null,
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

const withRecordsMocks = async (
  role: string,
  run: (url: string, headers: Record<string, string>, calls: { findMany: any[]; count: any[]; groupBy?: any[] }) => Promise<void>,
  mockFindManyResult: any[] = []
) => {
  const { url, close } = await setupApp();
  const row = createUser(role);
  const calls: { findMany: any[]; count: any[]; groupBy?: any[] } = { findMany: [], count: [] };
  const originalUserLookup = prisma.user.findUnique;
  const originalFindMany = prisma.deliveryRecord.findMany;
  const originalCount = prisma.deliveryRecord.count;

  prisma.user.findUnique = mock.fn(async () => row) as any;
  prisma.deliveryRecord.findMany = mock.fn(async (args: any) => {
    calls.findMany.push(args);
    return mockFindManyResult;
  }) as any;
  prisma.deliveryRecord.count = mock.fn(async (args: any) => {
    calls.count.push(args);
    return 100;
  }) as any;

  try {
    await run(url, await loginAs(url, row), calls);
  } finally {
    prisma.user.findUnique = originalUserLookup;
    prisma.deliveryRecord.findMany = originalFindMany;
    prisma.deliveryRecord.count = originalCount;
    await close();
  }
};

// ── Unit Tests for Tuple Cursor Encoding & Decoding ──

test('encodeCursor and decodeCursor correctly serialize and deserialize tuple', async () => {
  const date = new Date('2026-10-13T10:00:00.000Z');
  const token = encodeCursor({ createdAt: date, id: 'REC-00123' });
  assert.ok(token.startsWith('c_'));

  const decoded = await decodeCursor(token);
  assert.ok(decoded);
  assert.equal(decoded!.createdAt.toISOString(), date.toISOString());
  assert.equal(decoded!.id, 'REC-00123');
});

test('decodeCursor handles legacy raw record ID gracefully', async () => {
  const originalFindUnique = prisma.deliveryRecord.findUnique;
  const legacyDate = new Date('2026-10-13T09:00:00.000Z');
  prisma.deliveryRecord.findUnique = mock.fn(async () => ({ createdAt: legacyDate, id: 'REC-10001' })) as any;
  try {
    const decoded = await decodeCursor('REC-10001');
    assert.ok(decoded);
    assert.equal(decoded!.id, 'REC-10001');
    assert.equal(decoded!.createdAt.toISOString(), legacyDate.toISOString());
  } finally {
    prisma.deliveryRecord.findUnique = originalFindUnique;
  }
});

test('decodeCursor returns null on corrupted or invalid token', async () => {
  assert.equal(await decodeCursor('c_invalid!!!'), null);
  assert.equal(await decodeCursor('c_bm90LWpzb24='), null); // valid base64url of "not-json"
});

// ── Integration Tests for Paged Endpoint & Tuple Cursor ──

test('GET /records?paged=true returns structured payload with rows, count, nextCursor, and hasMore', async () => {
  const mockRows = [
    {
      id: 'REC-1',
      category: 'DELIVERY',
      status: 'SCHEDULED',
      createdAt: new Date('2026-10-13T10:00:00.000Z'),
      updatedAt: new Date('2026-10-13T10:00:00.000Z'),
      company: { id: 'c1', name: 'Company 1' },
    },
    {
      id: 'REC-2',
      category: 'DELIVERY',
      status: 'SCHEDULED',
      createdAt: new Date('2026-10-13T09:00:00.000Z'),
      updatedAt: new Date('2026-10-13T09:00:00.000Z'),
      company: { id: 'c2', name: 'Company 2' },
    },
    {
      id: 'REC-3',
      category: 'DELIVERY',
      status: 'SCHEDULED',
      createdAt: new Date('2026-10-13T08:00:00.000Z'),
      updatedAt: new Date('2026-10-13T08:00:00.000Z'),
      company: { id: 'c3', name: 'Company 3' },
    },
  ];

  await withRecordsMocks('ADMIN', async (url, headers, calls) => {
    const res = await fetch(`${url}/records?paged=true&limit=2`, { headers });
    assert.equal(res.status, 200);
    const body = await res.json() as any;

    assert.equal(Array.isArray(body.rows), true);
    assert.equal(body.rows.length, 2);
    assert.equal(body.total, 100);
    assert.equal(body.limit, 2);
    assert.equal(body.page, 1);
    assert.ok(body.nextCursor);
    assert.equal(body.hasMore, true);

    // Verify Prisma query requested limit + 1 (3 items) for hasMore detection
    assert.equal(calls.findMany[0].take, 3);
    assert.deepEqual(calls.findMany[0].orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  }, mockRows);
});

test('Tuple cursor constructs exact composite comparison filter (createdAt < cursorDate OR (createdAt = cursorDate AND id < cursorId))', async () => {
  const cursorDate = new Date('2026-10-13T10:00:00.000Z');
  const cursorToken = encodeCursor({ createdAt: cursorDate, id: 'REC-00100' });

  await withRecordsMocks('ADMIN', async (url, headers, calls) => {
    const res = await fetch(`${url}/records?paged=true&limit=25&cursor=${cursorToken}`, { headers });
    assert.equal(res.status, 200);

    const queryArgs = calls.findMany[0];
    assert.ok(Array.isArray(queryArgs.where.AND));

    // Find the cursor condition inside AND
    const cursorCondition = queryArgs.where.AND.find((c: any) => Array.isArray(c.OR));
    assert.ok(cursorCondition, 'Tuple cursor OR condition must be present in where.AND');
    assert.deepEqual(cursorCondition.OR, [
      { createdAt: { lt: cursorDate } },
      { createdAt: cursorDate, id: { lt: 'REC-00100' } },
    ]);
  });
});

test('Cursor navigation succeeds even if the cursor record was concurrently deleted', async () => {
  // With tuple-based cursor, the query doesn't depend on the row existing in the table:
  // It filters directly on the scalar values (createdAt, id), so deletion never triggers Prisma P2025.
  const deletedRowDate = new Date('2026-10-13T08:00:00.000Z');
  const deletedRowCursor = encodeCursor({ createdAt: deletedRowDate, id: 'REC-DELETED-ROW' });

  await withRecordsMocks('ADMIN', async (url, headers, calls) => {
    const res = await fetch(`${url}/records?paged=true&cursor=${deletedRowCursor}`, { headers });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok(body.rows);

    const cursorCondition = calls.findMany[0].where.AND.find((c: any) => Array.isArray(c.OR));
    assert.ok(cursorCondition);
    assert.equal(cursorCondition.OR[1].id.lt, 'REC-DELETED-ROW');
  });
});

test('Negative validation: rejects limit > 100, limit <= 0, and malformed cursor with 400', async () => {
  await withRecordsMocks('ADMIN', async (url, headers, calls) => {
    const badQueries = [
      'paged=true&limit=0',
      'paged=true&limit=101',
      'paged=true&limit=-5',
      'paged=true&limit=abc',
      'paged=true&cursor=c_corrupted!!!',
      'dateFrom=2026-99-99',
      'dateTo=invalid-date',
    ];

    for (const q of badQueries) {
      const res = await fetch(`${url}/records?${q}`, { headers });
      assert.equal(res.status, 400, `Expected 400 for query: ${q}`);
    }
    assert.equal(calls.findMany.length, 0);
  });
});

test('Server-side filters are mapped accurately into Prisma where clauses', async () => {
  await withRecordsMocks('ADMIN', async (url, headers, calls) => {
    const urlParams = new URLSearchParams({
      paged: 'true',
      category: 'Accounting Collection',
      status: 'In Transit',
      driver: 'Juan Dela Cruz',
      area: 'Makati',
      account_manager: 'Maria Santos',
      priority: '3 - High',
      search: 'INV-2026',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
    });

    const res = await fetch(`${url}/records?${urlParams.toString()}`, { headers });
    assert.equal(res.status, 200);

    const where = calls.findMany[0].where;
    assert.equal(where.category, 'ACCOUNTING_COLLECTION');

    const andConditions = where.AND;
    assert.ok(Array.isArray(andConditions));

    // Area filter
    assert.ok(andConditions.some((c: any) => c.area === 'Makati'));

    // Driver filter
    assert.ok(andConditions.some((c: any) => c.driver && c.driver.contains === 'Juan Dela Cruz'));

    // Account Manager filter
    assert.ok(andConditions.some((c: any) => c.accountManager && c.accountManager.contains === 'Maria Santos'));

    // Priority filter
    assert.ok(andConditions.some((c: any) => c.priority === '3 - High'));

    // Delivery date range
    assert.ok(andConditions.some((c: any) => c.deliveryDate && c.deliveryDate.gte === '2026-10-01' && c.deliveryDate.lte === '2026-10-31'));

    // Status filter maps In Transit to status IN_TRANSIT with timeIn
    assert.ok(andConditions.some((c: any) => Array.isArray(c.OR) && c.OR.some((sub: any) => sub.status === 'IN_TRANSIT')));

    // Search query maps to OR across id, reference, company name
    const searchCondition = andConditions.find((c: any) => Array.isArray(c.OR) && c.OR.some((sub: any) => sub.reference));
    assert.ok(searchCondition);
  });
});

test('Location hierarchy filters constrain paged records to canonical areas', async () => {
  await withRecordsMocks('ADMIN', async (url, headers, calls) => {
    const query = new URLSearchParams({
      paged: 'true',
      region: 'Visayas',
      subregion: 'Cebu',
    });
    const res = await fetch(`${url}/records?${query}`, { headers });
    assert.equal(res.status, 200);

    const locationFilter = calls.findMany[0].where.AND.find(
      (condition: any) => condition.area?.in,
    );
    assert.deepEqual(locationFilter.area.in, ['Cebu City', 'Mandaue City, Cebu', 'Lapu-Lapu City, Cebu']);
  });
});

test('Subregion filters exclude areas outside Nueva Ecija and Pangasinan grouping', async () => {
  await withRecordsMocks('ADMIN', async (url, headers, calls) => {
    const query = new URLSearchParams({
      paged: 'true',
      subregion: 'Nueva Ecija / Pangasinan / Benguet',
    });
    const res = await fetch(`${url}/records?${query}`, { headers });
    assert.equal(res.status, 200);

    const locationFilter = calls.findMany[0].where.AND.find(
      (condition: any) => condition.area?.in,
    );
    assert.deepEqual(locationFilter.area.in, [
      'Cabanatuan City, Nueva Ecija',
      'Dagupan City, Pangasinan',
      'Baguio City, Benguet',
    ]);
    assert.equal(locationFilter.area.in.includes('Quezon City - Diliman'), false);
  });
});

test('Personnel filters accept partial autocomplete input', async () => {
  await withRecordsMocks('ADMIN', async (url, headers, calls) => {
    const query = new URLSearchParams({
      paged: 'true',
      driver: 'Leo Drive',
      account_manager: 'P. Sorian',
    });
    const res = await fetch(`${url}/records?${query}`, { headers });
    assert.equal(res.status, 200);

    const andConditions = calls.findMany[0].where.AND;
    assert.ok(andConditions.some((condition: any) => condition.driver?.contains === 'Leo Drive'));
    assert.ok(andConditions.some((condition: any) => condition.accountManager?.contains === 'P. Sorian'));
  });
});

test('Draft status filter maps to is_draft Yes', async () => {
  await withRecordsMocks('ADMIN', async (url, headers, calls) => {
    const res = await fetch(`${url}/records?paged=true&status=Draft`, { headers });
    assert.equal(res.status, 200);

    const andConditions = calls.findMany[0].where.AND;
    assert.ok(Array.isArray(andConditions));
    assert.ok(andConditions.some((c: any) => c.draft === true));
  });
});

test('Backward compatibility: unpaginated request returns plain DeliveryRecord array', async () => {
  const mockRows = [
    {
      id: 'REC-LEGACY-1',
      category: 'DELIVERY',
      status: 'SCHEDULED',
      createdAt: new Date('2026-10-13T10:00:00.000Z'),
      updatedAt: new Date('2026-10-13T10:00:00.000Z'),
      company: { id: 'c1', name: 'Company 1' },
    },
  ];

  await withRecordsMocks('ADMIN', async (url, headers) => {
    const res = await fetch(`${url}/records`, { headers });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body), true);
    assert.equal(body[0].id, 'REC-LEGACY-1');
  }, mockRows);
});

test('GET /records/calendar-summary returns bounded records up to 500 for requested range', async () => {
  await withRecordsMocks('ADMIN', async (url, headers, calls) => {
    const res = await fetch(`${url}/records/calendar-summary?dateFrom=2026-10-01&dateTo=2026-10-31`, { headers });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body), true);

    const query = calls.findMany[0];
    assert.equal(query.take, 500);
    assert.deepEqual(query.where.deliveryDate, { gte: '2026-10-01', lte: '2026-10-31' });
  });
});
