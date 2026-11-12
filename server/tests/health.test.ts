import { after, afterEach, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createHealthRouter, HEALTH_PATH } from '../src/routes/health';
import { applySecurity } from '../src/middleware/security';

const savedEnv = { ...process.env };
before(() => {
  process.env.NODE_ENV = 'test';
  process.env.REQUIRE_PROXY_SECRET = 'true';
  process.env.PROXY_SHARED_SECRET = 'health-test-proxy-secret';
  delete process.env.TRUST_PROXY;
});
after(() => { process.env = savedEnv; });
afterEach(() => { mock.restoreAll(); });

const productionEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://test:fixture-only@database.invalid/health_test',
  JWT_SECRET: 'health-test-signing-secret',
  AZURE_CLIENT_ID: 'health-test-client',
  AZURE_CLIENT_SECRET: 'health-test-client-secret',
  AZURE_TENANT_ID: 'health-test-tenant',
  SMTP_HOST: 'mail.invalid',
};

async function withHealth(
  options: Parameters<typeof createHealthRouter>[0],
  run: (base: string) => Promise<void>,
) {
  const app = express();
  app.use(cookieParser());
  applySecurity(app);
  app.use(HEALTH_PATH, createHealthRouter(options));
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function readiness(base: string, expectedStatus: number, target = HEALTH_PATH) {
  const response = await fetch(`${base}${target}`);
  assert.equal(response.status, expectedStatus);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), { ok: expectedStatus === 200 });
}

test('public readiness exposes only availability despite configured provider and environment details', async () => {
  const checkDatabase = mock.fn(async () => [{ '?column?': 1 }]);
  await withHealth({ checkDatabase, env: productionEnv }, async base => {
    await readiness(base, 200);
    assert.equal(checkDatabase.mock.callCount(), 1);
  });
});

test('database failure returns minimal 503 and the next request can recover without cached readiness', async () => {
  const errorLog = mock.method(console, 'error', () => {});
  let available = true;
  const checkDatabase = mock.fn(async () => {
    if (!available) throw new Error('postgresql://private:secret@database.invalid/private_database');
  });
  await withHealth({ checkDatabase, env: productionEnv }, async base => {
    await readiness(base, 200);
    available = false;
    await readiness(base, 503);
    available = true;
    await readiness(base, 200);
    assert.equal(checkDatabase.mock.callCount(), 3);
    assert.equal(errorLog.mock.callCount(), 1);
    assert.doesNotMatch(JSON.stringify(errorLog.mock.calls[0].arguments), /private|secret|database\.invalid/);
  });
});

test('production readiness rejects missing required configuration without revealing which setting failed', async t => {
  for (const key of ['DATABASE_URL', 'JWT_SECRET'] as const) {
    for (const value of [undefined, '']) {
      await t.test(`${key} ${value === undefined ? 'missing' : 'empty'}`, async () => {
        await withHealth({ checkDatabase: async () => {}, env: { ...productionEnv, [key]: value } }, async base => {
          await readiness(base, 503);
        });
      });
    }
  }
});

test('development readiness retains its existing optional production-setting behavior', async () => {
  await withHealth({ checkDatabase: async () => {}, env: { NODE_ENV: 'development' } }, async base => {
    await readiness(base, 200);
  });
});

test('Render probes the public readiness route even when direct API access requires a proxy secret', async () => {
  const blueprint = fs.readFileSync(path.resolve(__dirname, '../../render.yaml'), 'utf8');
  const healthPath = blueprint.match(/^\s+healthCheckPath:\s*(\/[^\s#]+)\s*$/m)?.[1];
  assert.ok(healthPath, 'Render needs an HTTP readiness path');
  await withHealth({ checkDatabase: async () => {}, env: productionEnv }, async base => {
    await readiness(base, 200, healthPath);
    assert.equal((await fetch(`${base}/api/v1/admin/deployment-status`)).status, 403,
      'the health exemption must not open protected diagnostics to direct unauthenticated requests');
  });
});
