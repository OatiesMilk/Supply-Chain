import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/db';
import { requireAuth, requireResource, requireRole, signToken } from '../src/middleware/auth';
import devRoutes, { createDevRouter } from '../src/routes/dev';
import dataSamplerRoutes, { createDataSamplerResetHandler, type DataSamplerResetOperations } from '../src/routes/data-sampler';
import { assertDisposableSeedTarget } from '../prisma/seed-safety';
import { runSeed } from '../prisma/seed';
import { runUatSeed } from '../prisma/seed-uat';

const admin = { id: 'seed-admin', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' as const, isActive: true, permissions: [], driverProfile: null };
const sales = { ...admin, id: 'seed-sales', role: 'SALES_COORDINATOR' as const };
const logistics = { ...admin, id: 'seed-logistics', role: 'LOGISTICS' as const };
const driver = { ...admin, id: 'seed-driver', role: 'DRIVER' as const };
const tass = { ...admin, id: 'seed-tass', role: 'TASS' as const };
const actors = [admin, sales, logistics, driver, tass];

async function startApp(options: {
  resetSeed?: () => Promise<void>;
  dataSamplerReset?: DataSamplerResetOperations;
} = {}) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/dev', options.resetSeed ? createDevRouter(options.resetSeed) : devRoutes);
  if (options.dataSamplerReset) {
    const resetRouter = express.Router();
    resetRouter.post('/reset', requireAuth, requireResource('dataSampler'), requireRole('ADMIN'), createDataSamplerResetHandler(options.dataSamplerReset));
    app.use('/api/data-sampler', resetRouter);
  } else {
    app.use('/api/data-sampler', dataSamplerRoutes);
  }
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

test('removed public reset endpoints remain 404 regardless of role and environment', async () => {
  const { url, close } = await startApp();
  try {
    for (const mode of ['development', 'staging', 'production']) {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = mode;
      try {
        for (const endpoint of ['/api/dev/public-seed', '/api/dev/public-seed-uat']) {
          for (const actor of [null, ...actors]) {
            const headers: Record<string, string> = {};
            if (actor) headers.Cookie = 'mg_session=' + signToken(actor);
            const response = await fetch(url + endpoint, { method: 'POST', headers });
            assert.equal(response.status, 404);
          }
        }
      } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
      }
    }
  } finally {
    await close();
  }
});

test('local-demo reset endpoints reject anonymous, wrong-role, and hosted Admin without database writes', async () => {
  const { url, close } = await startApp();
  const original = prisma.user.findUnique;
  const previous = { ...process.env };
  let hits = 0;
  const dbCount = prisma.deliveryRecord.count;
  prisma.user.findUnique = (async ({ where }: any) => actors.find(actor => actor.id === where.id) ?? null) as any;
  prisma.deliveryRecord.count = (async () => { hits++; throw Error('must not touch database'); }) as any;
  try {
    for (const mode of ['development', 'staging', 'production']) {
      Object.assign(process.env, sandbox, { NODE_ENV: mode, LOCAL_DESTRUCTIVE_SEED: 'false' });
      for (const actor of [null, sales, logistics, driver, tass, admin]) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (actor) headers.Cookie = 'mg_session=' + signToken(actor);
        for (const path of ['/api/dev/reset-seed', '/api/data-sampler/reset']) {
          for (const body of path.endsWith('/reset') ? [{ mode: 'full' }, { mode: 'seed' }] : [{}]) {
            const response = await fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body) });
            assert.equal(response.status, !actor ? 401 : 403);
          }
        }
      }
    }
    Object.assign(process.env, sandbox, { NODE_ENV: 'production', LOCAL_DESTRUCTIVE_SEED: 'true' });
    const response = await fetch(url + '/api/dev/reset-seed', {
      method: 'POST', headers: { Cookie: 'mg_session=' + signToken(admin) }
    });
    assert.equal(response.status, 403);
    assert.equal(hits, 0);
  } finally {
    prisma.user.findUnique = original;
    prisma.deliveryRecord.count = dbCount;
    for (const key of ['NODE_ENV', 'LOCAL_DESTRUCTIVE_SEED', 'LOCAL_SEED_DATABASE', 'DATABASE_URL']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    await close();
  }
});

test('capability reports enabled only for authenticated Admin on a permitted local demo database', async () => {
  const { url, close } = await startApp();
  const original = prisma.user.findUnique, previous = { ...process.env };
  prisma.user.findUnique = (async ({ where }: any) => where.id === admin.id ? admin : sales) as any;
  try {
    assert.equal((await fetch(url + '/api/dev/reset-capability')).status, 401);
    Object.assign(process.env, sandbox);
    for (const key of ['CI','RENDER','RENDER_SERVICE_ID','RENDER_EXTERNAL_URL']) delete process.env[key];
    const headers = { Cookie: 'mg_session=' + signToken(admin) };
    const local = await fetch(url + '/api/dev/reset-capability', { headers });
    assert.equal(local.status, 200);
    assert.equal((await local.json() as { enabled: boolean }).enabled, true);
    process.env.NODE_ENV = 'production';
    const hosted = await fetch(url + '/api/dev/reset-capability', { headers });
    assert.equal((await hosted.json() as { enabled: boolean }).enabled, false);
  } finally {
    prisma.user.findUnique = original;
    for (const key of ['CI', 'RENDER', 'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL', 'NODE_ENV', 'LOCAL_DESTRUCTIVE_SEED', 'LOCAL_SEED_DATABASE', 'DATABASE_URL']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    await close();
  }
});

test('approved local Admin can run both reset APIs through safely mocked operations', async () => {
  const previous = { ...process.env };
  const findUser = prisma.user.findUnique;
  let navbarResetCalls = 0;
  const calls = { count: 0, seed: 0, full: 0 };
  const resetOperations: DataSamplerResetOperations = {
    countRecords: async () => { calls.count++; return 7; },
    resetToSeed: async () => { calls.seed++; },
    fullReset: async () => { calls.full++; },
  };
  const { url, close } = await startApp({
    resetSeed: async () => { navbarResetCalls++; },
    dataSamplerReset: resetOperations,
  });
  prisma.user.findUnique = (async ({ where }: any) => where.id === admin.id ? admin : null) as any;
  try {
    Object.assign(process.env, sandbox);
    for (const key of ['CI', 'RENDER', 'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL']) delete process.env[key];
    const headers = { Cookie: 'mg_session=' + signToken(admin), 'Content-Type': 'application/json' };

    const navbarReset = await fetch(url + '/api/dev/reset-seed', { method: 'POST', headers });
    assert.equal(navbarReset.status, 200);
    assert.equal(navbarResetCalls, 1);

    const fullReset = await fetch(url + '/api/data-sampler/reset', {
      method: 'POST', headers, body: JSON.stringify({ mode: 'full' })
    });
    assert.equal(fullReset.status, 200);
    assert.deepEqual(await fullReset.json(), { deleted: 7, mode: 'full' });

    const seedReset = await fetch(url + '/api/data-sampler/reset', {
      method: 'POST', headers, body: JSON.stringify({ mode: 'seed' })
    });
    assert.equal(seedReset.status, 200);
    assert.deepEqual(await seedReset.json(), { deleted: 7, mode: 'seed' });
    assert.deepEqual(calls, { count: 2, seed: 1, full: 1 });
  } finally {
    prisma.user.findUnique = findUser;
    for (const key of ['CI', 'RENDER', 'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL', 'NODE_ENV', 'LOCAL_DESTRUCTIVE_SEED', 'LOCAL_SEED_DATABASE', 'DATABASE_URL']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
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
