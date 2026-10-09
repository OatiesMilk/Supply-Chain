import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/db';
import { signToken } from '../src/middleware/auth';
import devRoutes from '../src/routes/dev';
import dataSamplerRoutes from '../src/routes/data-sampler';
import { assertDisposableSeedTarget } from '../prisma/seed-safety';
import { runSeed } from '../prisma/seed';
import { runUatSeed } from '../prisma/seed-uat';

const admin = { id: 'seed-admin', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' as const, isActive: true, permissions: [], driverProfile: null };
const sales = { ...admin, id: 'seed-sales', role: 'SALES_COORDINATOR' as const };

async function startApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/dev', devRoutes);
  app.use('/api/data-sampler', dataSamplerRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  return {
    url: 'http://127.0.0.1:' + (server.address() as { port: number }).port,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  };
}

const sandbox: NodeJS.ProcessEnv = {
  NODE_ENV: 'development', LOCAL_DESTRUCTIVE_SEED: 'true',
  LOCAL_SEED_DATABASE: 'mg_portal_sandbox',
  DATABASE_URL: 'postgresql://tester:test@127.0.0.1:5433/mg_portal_sandbox?schema=public'
};

test('CLI seeding requires explicit local disposable database approval', () => {
  assert.doesNotThrow(() => assertDisposableSeedTarget(sandbox));
  const denied: NodeJS.ProcessEnv[] = [
    { ...sandbox, NODE_ENV: 'production' }, { ...sandbox, NODE_ENV: 'staging' },
    { ...sandbox, NODE_ENV: undefined }, { ...sandbox, LOCAL_DESTRUCTIVE_SEED: 'false' },
    { ...sandbox, LOCAL_DESTRUCTIVE_SEED: undefined }, { ...sandbox, LOCAL_SEED_DATABASE: undefined },
    { ...sandbox, LOCAL_SEED_DATABASE: 'other_sandbox' },
    { ...sandbox, DATABASE_URL: 'postgresql://user:pass@host.example.com/mg_portal_sandbox' },
    { ...sandbox, DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5433/mg_portal' },
    { ...sandbox, RENDER_SERVICE_ID: 'production' }, { ...sandbox, CI: 'true' },
    { ...sandbox, DATABASE_URL: undefined }, { ...sandbox, DATABASE_URL: 'not a URL' }
  ];
  for (const env of denied) {
    assert.throws(() => assertDisposableSeedTarget(env), /Destructive seeding is disabled/);
  }
});

test('production CLI seed requests are rejected before touching Prisma', async () => {
  const previous = { ...process.env };
  const originalCount = prisma.user.count;
  const originalQuery = prisma.$queryRaw;
  let touched = 0;
  prisma.user.count = (async () => { touched++; throw new Error('unexpected DB read'); }) as any;
  prisma.$queryRaw = (async () => { touched++; throw new Error('unexpected DB read'); }) as any;
  Object.assign(process.env, sandbox, { NODE_ENV: 'production' });
  try {
    await assert.rejects(runSeed(true), /Destructive seeding is disabled/);
    await assert.rejects(runUatSeed(), /Destructive seeding is disabled/);
    assert.equal(touched, 0);
  } finally {
    prisma.user.count = originalCount;
    prisma.$queryRaw = originalQuery;
    for (const key of ['NODE_ENV', 'LOCAL_DESTRUCTIVE_SEED', 'LOCAL_SEED_DATABASE', 'DATABASE_URL']) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('anonymous, Admin and other roles cannot reset through HTTP in any environment', async () => {
  const { url, close } = await startApp();
  const countUser = prisma.user.count, countRecords = prisma.deliveryRecord.count, removeRecords = prisma.deliveryRecord.deleteMany;
  const oldMode = process.env.NODE_ENV, oldFlag = process.env.LOCAL_DESTRUCTIVE_SEED;
  let dbTouches = 0;
  prisma.user.count = (async () => { dbTouches++; throw Error('unexpected seed'); }) as any;
  prisma.deliveryRecord.count = (async () => { dbTouches++; throw Error('unexpected reset'); }) as any;
  prisma.deliveryRecord.deleteMany = (async () => { dbTouches++; throw Error('unexpected delete'); }) as any;
  try {
    for (const mode of ['development', 'staging', 'production']) {
      process.env.NODE_ENV = mode;
      process.env.LOCAL_DESTRUCTIVE_SEED = 'true';
      for (const actor of [null, admin, sales]) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (actor) headers.Cookie = 'mg_session=' + signToken(actor);
        for (const path of ['/api/dev/public-seed', '/api/dev/public-seed-uat', '/api/dev/reset-seed', '/api/data-sampler/reset']) {
          for (const body of path.endsWith('/reset') ? [{ mode: 'full' }, { mode: 'seed' }] : [{}]) {
            const response = await fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body) });
            assert.equal(response.status, 404, mode + ' ' + path);
          }
        }
      }
    }
    assert.equal(dbTouches, 0);
  } finally {
    prisma.user.count = countUser;
    prisma.deliveryRecord.count = countRecords;
    prisma.deliveryRecord.deleteMany = removeRecords;
    if (oldMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldMode;
    if (oldFlag === undefined) delete process.env.LOCAL_DESTRUCTIVE_SEED;
    else process.env.LOCAL_DESTRUCTIVE_SEED = oldFlag;
    await close();
  }
});

test('Data Sampler read-only counts remain functional for Admin only', async () => {
  const { url, close } = await startApp();
  const findUser = prisma.user.findUnique, countRecords = prisma.deliveryRecord.count;
  let reads = 0;
  prisma.user.findUnique = (async ({ where }: any) => where.id === admin.id ? admin : sales) as any;
  prisma.deliveryRecord.count = (async () => { reads++; return 0; }) as any;
  try {
    assert.equal((await fetch(url + '/api/data-sampler/counts')).status, 401);
    assert.equal((await fetch(url + '/api/data-sampler/counts', { headers: { Cookie: 'mg_session=' + signToken(sales) } })).status, 403);
    const response = await fetch(url + '/api/data-sampler/counts', { headers: { Cookie: 'mg_session=' + signToken(admin) } });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as any[]).length, 5);
    assert.equal(reads, 5);
  } finally {
    prisma.user.findUnique = findUser;
    prisma.deliveryRecord.count = countRecords;
    await close();
  }
});
