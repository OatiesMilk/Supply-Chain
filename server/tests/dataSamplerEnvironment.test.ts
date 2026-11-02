import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import dataSampler from '../src/routes/data-sampler';
import { prisma } from '../src/db';
import { signToken } from '../src/middleware/auth';
import { dataSamplerEnabled } from '../src/services/dataSamplerEnvironment';

test('Data Sampler permits local development/test but fails closed for deployed environments', () => {
  for (const env of [{}, { NODE_ENV: 'development' }, { NODE_ENV: 'test' }, { NODE_ENV: 'development', APP_ENV: 'development' }]) {
    assert.equal(dataSamplerEnabled(env), true);
  }
  for (const mode of ['staging', 'production', 'preview', '']) {
    assert.equal(dataSamplerEnabled({ NODE_ENV: mode }), false);
    assert.equal(dataSamplerEnabled({ NODE_ENV: 'development', APP_ENV: mode }), false);
    assert.equal(dataSamplerEnabled({ NODE_ENV: mode, APP_ENV: 'development' }), false);
  }
  for (const key of ['RENDER', 'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL', 'RAILWAY_ENVIRONMENT', 'VERCEL', 'FLY_APP_NAME', 'K_SERVICE', 'HEROKU_APP_NAME']) {
    assert.equal(dataSamplerEnabled({ NODE_ENV: 'development', [key]: 'hosted' }), false);
  }
});

test('every Data Sampler endpoint is 404 in staging/production before auth or database access, even for Admin', async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, APP_ENV: process.env.APP_ENV };
  const original = { find: prisma.user.findUnique, count: prisma.deliveryRecord.count, transaction: prisma.$transaction };
  const find = mock.fn(async () => { throw new Error('Disabled tools must not load accounts'); });
  const count = mock.fn(async () => { throw new Error('Disabled tools must not read records'); });
  const transaction = mock.fn(async () => { throw new Error('Disabled tools must not write'); });
  prisma.user.findUnique = find as any;
  prisma.deliveryRecord.count = count as any;
  prisma.$transaction = transaction as any;
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/data-sampler', dataSampler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookie = `mg_session=${signToken({ id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'ADMIN' })}`;
  try {
    for (const env of [
      { NODE_ENV: 'staging', APP_ENV: 'development' },
      { NODE_ENV: 'production', APP_ENV: 'development' },
      { NODE_ENV: 'development', APP_ENV: 'staging' },
      { NODE_ENV: 'development', APP_ENV: 'production' },
    ]) {
      Object.assign(process.env, env);
      for (const authenticated of [false, true]) {
        for (const [path, method, body] of [
          ['/counts', 'GET', undefined], ['/generate', 'POST', { module: 'deliveries', count: 1 }],
          ['/reset', 'POST', { mode: 'seed' }], ['/reset', 'POST', { mode: 'full' }],
        ] as const) {
          const response = await fetch(base + '/api/data-sampler' + path, {
            method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie } : {}) },
            body: body && JSON.stringify(body),
          });
          assert.equal(response.status, 404, `${JSON.stringify(env)} ${method} ${path}`);
        }
      }
    }
    assert.equal(find.mock.callCount(), 0);
    assert.equal(count.mock.callCount(), 0);
    assert.equal(transaction.mock.callCount(), 0);
  } finally {
    for (const key of ['NODE_ENV', 'APP_ENV'] as const) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    prisma.user.findUnique = original.find;
    prisma.deliveryRecord.count = original.count;
    prisma.$transaction = original.transaction;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
