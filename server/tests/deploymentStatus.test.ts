import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { signToken } from '../src/middleware/auth';
import { applySecurity } from '../src/middleware/security';
import adminRoutes from '../src/routes/admin';
import { databaseIdentity, deploymentStatus } from '../src/services/deploymentStatus';
import { podStorageProvider } from '../src/services/podStorage';
import { prisma } from '../src/db';

// Issue #164: the deployment check must describe what the process is connected
// to without ever returning a credential, and a misconfigured file store or
// proxy target must fail instead of silently falling back.

const SECRETS = {
  dbPassword: 'db-password-do-not-leak',
  dbUser: 'postgres.projectref',
  serviceKey: 'service-role-key-do-not-leak',
  proxySecret: 'proxy-secret-do-not-leak',
  jwtSecret: 'jwt-secret-do-not-leak',
};

const CLOUD_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: `postgresql://${SECRETS.dbUser}:${SECRETS.dbPassword}@db.example-pooler.com:6543/postgres?pgbouncer=true`,
  JWT_SECRET: SECRETS.jwtSecret,
  CLIENT_ORIGIN: 'https://portal.example.com',
  PROXY_SHARED_SECRET: SECRETS.proxySecret,
  REQUIRE_PROXY_SECRET: 'true',
  POD_STORAGE_PROVIDER: 'supabase',
  SUPABASE_URL: 'https://projectref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: SECRETS.serviceKey,
  SUPABASE_STORAGE_BUCKET: 'pod',
};

const request = (headers: Record<string, string> = {}) => ({
  get: (name: string) => headers[name.toLowerCase()],
  ip: '10.0.0.1',
  socket: { remoteAddress: '10.0.0.1' },
}) as unknown as express.Request;

const realFetch = globalThis.fetch;
const servers: Server[] = [];
afterEach(() => { globalThis.fetch = realFetch; });
after(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
});

function stubBucket(body: unknown, status = 200) {
  const calls: { url: string; method: string }[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}

test('the storage provider must be named exactly; a typo is refused, not treated as local disk', () => {
  assert.equal(podStorageProvider({}), 'local');
  assert.equal(podStorageProvider({ POD_STORAGE_PROVIDER: '  ' }), 'local');
  assert.equal(podStorageProvider({ POD_STORAGE_PROVIDER: 'local' }), 'local');
  assert.equal(podStorageProvider({ POD_STORAGE_PROVIDER: ' Supabase ' }), 'supabase');
  for (const typo of ['supabse', 'supabase-storage', 's3', '"supabase"']) {
    assert.throws(() => podStorageProvider({ POD_STORAGE_PROVIDER: typo }), /must be "local" or "supabase"/, typo);
  }
});

test('the database identity is host, port and name only', () => {
  assert.deepEqual(databaseIdentity(CLOUD_ENV.DATABASE_URL), { host: 'db.example-pooler.com', port: '6543', database: 'postgres', loopback: false });
  assert.deepEqual(databaseIdentity('postgresql://u:p@127.0.0.1/mg_portal'), { host: '127.0.0.1', port: '5432', database: 'mg_portal', loopback: true });
  assert.equal(databaseIdentity(undefined), null);
  assert.equal(databaseIdentity('not a connection string'), null);
});

test('a correctly proxied cloud deployment reports identities, no secrets and no warnings', async () => {
  const calls = stubBucket({ id: 'pod', name: 'pod', public: false, file_size_limit: 10485760, allowed_mime_types: ['image/png'] });
  const status = await deploymentStatus(
    request({ 'x-mg-proxy-secret': SECRETS.proxySecret, 'x-mg-client-ip': '203.0.113.9' }),
    CLOUD_ENV,
  );

  assert.deepEqual(status.database, { host: 'db.example-pooler.com', port: '6543', database: 'postgres', loopback: false });
  assert.deepEqual(status.storage, {
    provider: 'supabase', host: 'projectref.supabase.co', bucket: 'pod', reachable: true,
    public: false, file_size_limit: 10485760, allowed_mime_types: ['image/png'],
  });
  assert.deepEqual(status.origins, { cors: 'https://portal.example.com', trusted_for_writes: ['https://portal.example.com'] });
  assert.deepEqual(status.session_cookie, { http_only: true, secure: true, same_site: 'none' });
  assert.deepEqual(status.proxy, {
    shared_secret_configured: true, secret_required: true, request_carried_valid_secret: true, trusted_proxy_hops: 0,
    client_address: '203.0.113.9', client_address_source: 'worker-proxy',
  });
  assert.equal(status.settings_present.SUPABASE_SERVICE_ROLE_KEY, true);
  assert.equal(status.settings_present.APP_URL, false);
  assert.deepEqual(status.warnings, []);

  const serialized = JSON.stringify(status);
  for (const [name, value] of Object.entries(SECRETS)) assert.ok(!serialized.includes(value), `${name} must not be returned`);

  // The storage check is a single read of the bucket's settings: no write, no file access.
  assert.deepEqual(calls, [{ url: 'https://projectref.supabase.co/storage/v1/bucket/pod', method: 'GET' }]);
});

test('risky deployments are called out', async () => {
  stubBucket({ public: true });
  const direct = await deploymentStatus(request(), CLOUD_ENV);
  assert.equal(direct.proxy.request_carried_valid_secret, false);
  assert.equal(direct.proxy.client_address_source, 'socket');
  assert.match(direct.warnings.join('\n'), /did not carry the Worker proxy secret/);
  assert.match(direct.warnings.join('\n'), /bucket is public/);

  // A secret that is configured but not enforced leaves the API's own address open.
  stubBucket({ public: false });
  const unenforced = await deploymentStatus(request(), { ...CLOUD_ENV, REQUIRE_PROXY_SECRET: undefined });
  assert.equal(unenforced.proxy.secret_required, false);
  assert.match(unenforced.warnings.join('\n'), /REQUIRE_PROXY_SECRET is off/);
  assert.doesNotMatch(direct.warnings.join('\n'), /REQUIRE_PROXY_SECRET is off/);

  stubBucket({ message: 'denied' }, 403);
  const unreachable = await deploymentStatus(request(), CLOUD_ENV);
  assert.equal(unreachable.storage.provider === 'supabase' && unreachable.storage.reachable, false);
  assert.match(unreachable.warnings.join('\n'), /bucket could not be read: Bucket lookup failed \(403\)/);

  // Local disk, no proxy identity and a localhost database, all in production.
  const bare = await deploymentStatus(request(), { NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@localhost:5432/mg_portal' });
  assert.equal(bare.storage.provider, 'local');
  const warnings = bare.warnings.join('\n');
  assert.match(warnings, /localhost\) in production/);
  assert.match(warnings, /CLIENT_ORIGIN is not set/);
  assert.match(warnings, /Neither PROXY_SHARED_SECRET nor TRUST_PROXY/);
  assert.match(warnings, /stored on local disk/);

  const trusted = await deploymentStatus(request(), { NODE_ENV: 'production', DATABASE_URL: CLOUD_ENV.DATABASE_URL, CLIENT_ORIGIN: 'https://portal.example.com', TRUST_PROXY: '2', POD_STORAGE_PROVIDER: 'local' });
  assert.equal(trusted.proxy.client_address_source, 'trusted-proxy');
  assert.equal(trusted.proxy.trusted_proxy_hops, 2);
  assert.doesNotMatch(trusted.warnings.join('\n'), /PROXY_SHARED_SECRET/);
});

test('only an Admin can read the deployment check', async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  applySecurity(app);
  app.use('/api/admin', adminRoutes);
  const base = await new Promise<string>(resolve => {
    const server = app.listen(0, () => resolve(`http://127.0.0.1:${(server.address() as any).port}`));
    servers.push(server);
  });

  const lookup = prisma.user.findUnique;
  const as = (role: string) => {
    prisma.user.findUnique = (async () => ({ id: `${role}-1`, name: role, email: `${role}@example.com`, role, isActive: true, permissions: [], driverProfile: null })) as any;
    return { Cookie: `mg_session=${signToken({ id: `${role}-1`, name: role, email: `${role}@example.com`, role: role as any })}` };
  };

  try {
    assert.equal((await fetch(`${base}/api/admin/deployment-status`)).status, 401);
    for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER']) {
      assert.equal((await fetch(`${base}/api/admin/deployment-status`, { headers: as(role) })).status, 403, role);
    }
    const res = await fetch(`${base}/api/admin/deployment-status`, { headers: as('ADMIN') });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['database', 'node_env', 'origins', 'proxy', 'session_cookie', 'settings_present', 'storage', 'warnings']);
    assert.equal(body.storage.provider, 'local');
  } finally {
    prisma.user.findUnique = lookup;
  }
});

test('the Worker refuses to proxy without a configured API target and never forwards spoofed proxy headers', async () => {
  for (const file of ['worker.js', 'client/public/_worker.js']) {
    const worker = (await import(pathToFileURL(path.join(__dirname, '..', '..', file)).href)).default;
    const forwarded: Request[] = [];
    globalThis.fetch = (async (input: any) => { forwarded.push(input as Request); return new Response('{}'); }) as typeof fetch;
    const browserRequest = () => new Request('https://portal.example.com/api/records?page=2', {
      headers: { 'cf-connecting-ip': '203.0.113.9', 'x-mg-proxy-secret': 'forged', 'x-mg-client-ip': '198.51.100.1' },
    });

    const unconfigured = await worker.fetch(browserRequest(), {});
    assert.equal(unconfigured.status, 503, file);
    assert.deepEqual(await unconfigured.json(), { error: 'API proxy is not configured' });
    assert.equal(forwarded.length, 0, 'nothing is sent to a default host');

    const invalid = await worker.fetch(browserRequest(), { API_BASE_URL: 'not a url' });
    assert.equal(invalid.status, 502, file);
    assert.equal(forwarded.length, 0);

    await worker.fetch(browserRequest(), { API_BASE_URL: 'https://api.example.com' });
    assert.equal(forwarded[0].url, 'https://api.example.com/api/records?page=2');
    assert.equal(forwarded[0].headers.get('x-mg-proxy-secret'), null, 'no secret configured: forged headers are dropped');
    assert.equal(forwarded[0].headers.get('x-mg-client-ip'), null);

    await worker.fetch(browserRequest(), { API_BASE_URL: 'https://api.example.com', PROXY_SHARED_SECRET: 'real' });
    assert.equal(forwarded[1].headers.get('x-mg-proxy-secret'), 'real');
    assert.equal(forwarded[1].headers.get('x-mg-client-ip'), '203.0.113.9');

    // The secret is sent even when Cloudflare supplied no visitor address.
    await worker.fetch(new Request('https://portal.example.com/api/records', { headers: { 'x-mg-client-ip': '198.51.100.1' } }), { API_BASE_URL: 'https://api.example.com', PROXY_SHARED_SECRET: 'real' });
    assert.equal(forwarded[2].headers.get('x-mg-proxy-secret'), 'real');
    assert.equal(forwarded[2].headers.get('x-mg-client-ip'), null);
  }
});
