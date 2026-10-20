import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { CSRF_HEADER, csrfToken, readSession, setSessionCookie, signToken } from '../src/middleware/auth';
import { applySecurity, CONTENT_SECURITY_POLICY } from '../src/middleware/security';
import { trustedOrigins } from '../src/middleware/csrf';
import { clientIp, RATE_LIMITS } from '../src/middleware/rateLimits';
import authRoutes from '../src/routes/auth';
import usersRoutes from '../src/routes/users';
import { prisma } from '../src/db';

// AUD-003: CSRF checks, rate limits and security headers, exercised over HTTP
// through the same applySecurity() wiring the API uses. The stub routes stand
// in for handlers that would write to the database, storage or email.
const TRUSTED = 'http://localhost:3000';
const FORGED = 'https://attacker.example';
const LIMITS = { ...RATE_LIMITS, mail: { windowMs: 60_000, limit: 2 }, upload: { windowMs: 60_000, limit: 2 }, api: { windowMs: 60_000, limit: 40 } };

let sideEffects = 0;
const servers: Server[] = [];
let url = '';
const savedEnv = { ...process.env };

function start(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  applySecurity(app, LIMITS);
  const effect = (_req: express.Request, res: express.Response) => { sideEffects++; res.json({ ok: true }); };
  app.post('/api/auth/login', (req, res) => {
    if (req.body?.password !== 'correct') return res.status(401).json({ error: 'Invalid email or password' });
    setSessionCookie(res, signToken({ id: 'user-1', name: 'Test User', email: req.body.email, role: 'LOGISTICS' }));
    res.json({ ok: true });
  });
  app.post('/api/auth/logout', effect);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/records', effect);
  app.post('/api/records', effect);
  app.put('/api/records/:id', effect);
  app.delete('/api/records/:id', effect);
  app.post('/api/records/:id/attachments', effect);
  app.post('/api/notifications/send-email', effect);
  app.post('/api/admin/test-email', effect);
  app.get('/api/whoami', (req, res) => res.json({ ip: clientIp(req) }));
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(`http://127.0.0.1:${(server.address() as any).port}`));
    servers.push(server);
  });
}

function session(id = 'user-1') {
  const jwt = signToken({ id, name: 'Test User', email: `${id}@example.com`, role: 'LOGISTICS' });
  const claims = readSession({ cookies: { mg_session: jwt } } as any)!;
  return { cookie: `mg_session=${jwt}`, token: csrfToken(claims) };
}

const call = (target: string, method: string, headers: Record<string, string> = {}, body?: unknown) =>
  fetch(`${url}${target}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  process.env.CLIENT_ORIGIN = TRUSTED;
  delete process.env.APP_URL;
  delete process.env.TRUSTED_ORIGINS;
  delete process.env.PROXY_SHARED_SECRET;
  delete process.env.REQUIRE_PROXY_SECRET;
  delete process.env.TRUST_PROXY;
  url = await start();
});
beforeEach(() => { sideEffects = 0; });
after(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  process.env = savedEnv;
});

test('forged cross-site writes are refused before any handler runs', async () => {
  const { cookie, token } = session();
  const forged: Array<[string, string, Record<string, string>]> = [
    ['POST', '/api/records', { Origin: FORGED, 'Sec-Fetch-Site': 'cross-site' }],
    ['PUT', '/api/records/1', { Origin: FORGED }],
    ['DELETE', '/api/records/1', { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' }],
    ['POST', '/api/records/1/attachments', { 'Sec-Fetch-Site': 'cross-site' }],
    ['POST', '/api/notifications/send-email', { Origin: 'https://sub.localhost:3000', 'Sec-Fetch-Site': 'same-site' }],
    // A cross-site page cannot read the token, but the origin check must hold even if it leaks.
    ['POST', '/api/records', { Origin: FORGED, [CSRF_HEADER]: token }],
    // Login and logout CSRF: no session token exists yet, so the origin decides.
    ['POST', '/api/auth/login', { Origin: FORGED, 'Sec-Fetch-Site': 'cross-site' }],
    ['POST', '/api/auth/logout', { Origin: FORGED, 'Sec-Fetch-Site': 'cross-site' }],
  ];
  for (const [method, target, headers] of forged) {
    const res = await call(target, method, { Cookie: cookie, ...headers }, { email: 'a@example.com', password: 'correct' });
    assert.equal(res.status, 403, `${method} ${target} ${JSON.stringify(headers)}`);
    assert.equal(res.headers.get('x-csrf-error'), 'origin');
    assert.deepEqual(await res.json(), { error: 'Cross-site request blocked' });
  }
  assert.equal(sideEffects, 0);
});

test('cookie-authenticated writes need the token of that exact session', async () => {
  const { cookie, token } = session();
  const sameOrigin = { Cookie: cookie, Origin: TRUSTED, 'Sec-Fetch-Site': 'same-origin' };
  const other = session('user-2').token;
  const stale = csrfToken({ id: 'user-1', iat: 1 });

  for (const sent of [undefined, '', 'guess', other, stale]) {
    const res = await call('/api/records', 'POST', sent === undefined ? sameOrigin : { ...sameOrigin, [CSRF_HEADER]: sent });
    assert.equal(res.status, 403, `token ${sent}`);
    assert.equal(res.headers.get('x-csrf-error'), 'token');
  }
  // A non-browser client holding the cookie gets no pass for omitting browser headers.
  assert.equal((await call('/api/records/1', 'DELETE', { Cookie: cookie })).status, 403);
  assert.equal(sideEffects, 0);

  for (const method of ['POST', 'PUT', 'DELETE']) {
    const target = method === 'POST' ? '/api/records' : '/api/records/1';
    assert.equal((await call(target, method, { ...sameOrigin, [CSRF_HEADER]: token })).status, 200, method);
  }
  // Older browsers send Origin without Fetch Metadata.
  assert.equal((await call('/api/records', 'POST', { Cookie: cookie, Origin: TRUSTED, [CSRF_HEADER]: token })).status, 200);
  assert.equal(sideEffects, 4);
});

test('reads, sign-in and requests without a session are not blocked by the token check', async () => {
  const { cookie } = session();
  assert.equal((await call('/api/records', 'GET', { Cookie: cookie, Origin: FORGED, 'Sec-Fetch-Site': 'cross-site' })).status, 200);
  // No session cookie: nothing to forge. The real routes answer 401 from requireAuth.
  assert.equal((await call('/api/records', 'POST', { Origin: TRUSTED, 'Sec-Fetch-Site': 'same-origin' })).status, 200);
  // An expired or tampered cookie must not lock the user out of signing in again.
  const login = await call('/api/auth/login', 'POST', { Cookie: 'mg_session=tampered', Origin: TRUSTED, 'Sec-Fetch-Site': 'same-origin' }, { email: 'a@example.com', password: 'correct' });
  assert.equal(login.status, 200);
  assert.ok(login.headers.get(CSRF_HEADER), 'sign-in issues the token for the new session');
  assert.equal((await call('/api/auth/logout', 'POST', { Cookie: cookie, Origin: TRUSTED })).status, 200);
});

test('trusted origins come from configuration and ignore malformed entries', () => {
  const origins = trustedOrigins({ CLIENT_ORIGIN: 'https://portal.example.com/', APP_URL: 'https://app.example.com/path', TRUSTED_ORIGINS: ' https://staging.example.com , not a url ,' });
  assert.deepEqual([...origins].sort(), ['https://app.example.com', 'https://portal.example.com', 'https://staging.example.com']);
  assert.deepEqual([...trustedOrigins({})], [TRUSTED]);
});

test('repeated failed sign-ins return 429 per account and address; successes are not counted', async () => {
  const origin = { Origin: TRUSTED, 'Sec-Fetch-Site': 'same-origin' };
  const attempt = (email: string, password: string) => call('/api/auth/login', 'POST', origin, { email, password });

  for (let i = 0; i < 10; i++) assert.equal((await attempt('ok@example.com', 'correct')).status, 200);

  const limit = RATE_LIMITS.loginPerAccount.limit;
  for (let i = 0; i < limit; i++) assert.equal((await attempt('Victim@example.com', 'wrong')).status, 401, `attempt ${i + 1}`);
  const blocked = await attempt('victim@example.com', 'correct');
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { error: 'Too many requests. Please wait and try again.' });
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.ok(blocked.headers.get('ratelimit'));

  // Another account from the same address is still served until the address budget is spent.
  assert.equal((await attempt('other@example.com', 'correct')).status, 200);
  for (let i = limit; i < RATE_LIMITS.loginPerIp.limit; i++) await attempt(`spray-${i}@example.com`, 'wrong');
  assert.equal((await attempt('other@example.com', 'correct')).status, 429);
});

test('mail and upload routes are throttled per signed-in user', async () => {
  const first = session('mail-user-1');
  const second = session('mail-user-2');
  const headers = (user: { cookie: string; token: string }) => ({ Cookie: user.cookie, Origin: TRUSTED, 'Sec-Fetch-Site': 'same-origin', [CSRF_HEADER]: user.token });

  for (const target of ['/api/notifications/send-email', '/api/records/7/attachments']) {
    sideEffects = 0;
    for (let i = 0; i < LIMITS.mail.limit; i++) assert.equal((await call(target, 'POST', headers(first))).status, 200);
    assert.equal((await call(target, 'POST', headers(first))).status, 429, target);
    assert.equal(sideEffects, LIMITS.mail.limit, 'a throttled request causes no side effect');
    assert.equal((await call(target, 'POST', headers(second))).status, 200, 'another user has a separate budget');
  }
  // Both mail routes draw on the same per-user budget.
  assert.equal((await call('/api/admin/test-email', 'POST', headers(first))).status, 429);
});

test('the general API limit returns 429 but never throttles the health check', async () => {
  const user = session('busy-user');
  const statuses: number[] = [];
  for (let i = 0; i < LIMITS.api.limit + 1; i++) statuses.push((await call('/api/records', 'GET', { Cookie: user.cookie })).status);
  assert.equal(statuses.filter(status => status === 200).length, LIMITS.api.limit);
  assert.equal(statuses.at(-1), 429);
  for (let i = 0; i < LIMITS.api.limit + 5; i++) assert.equal((await call('/api/health', 'GET')).status, 200);
});

test('a forwarded client address is believed only with the proxy secret', async () => {
  const whoami = async (base: string, headers: Record<string, string>) => (await (await fetch(`${base}/api/whoami`, { headers })).json()).ip;
  const spoof = { 'X-Forwarded-For': '203.0.113.9', 'X-MG-Client-IP': '203.0.113.9' };

  // No secret configured: forwarded headers are ignored entirely.
  assert.match(await whoami(url, spoof), /127\.0\.0\.1$/);
  assert.match(await whoami(url, { ...spoof, 'X-MG-Proxy-Secret': '' }), /127\.0\.0\.1$/);

  process.env.PROXY_SHARED_SECRET = 'worker-secret-for-tests';
  assert.match(await whoami(url, { ...spoof, 'X-MG-Proxy-Secret': 'wrong' }), /127\.0\.0\.1$/);
  assert.equal(await whoami(url, { ...spoof, 'X-MG-Proxy-Secret': 'worker-secret-for-tests' }), '203.0.113.9');
  assert.match(await whoami(url, { 'X-MG-Client-IP': 'not-an-ip', 'X-MG-Proxy-Secret': 'worker-secret-for-tests' }), /127\.0\.0\.1$/);
  delete process.env.PROXY_SHARED_SECRET;

  // TRUST_PROXY counts hops from the right, so a client-supplied left entry is not used.
  process.env.TRUST_PROXY = '1';
  const proxied = await start();
  assert.equal(await whoami(proxied, { 'X-Forwarded-For': '203.0.113.9, 198.51.100.7' }), '198.51.100.7');
  delete process.env.TRUST_PROXY;
});

// Issue #167: with REQUIRE_PROXY_SECRET on, only requests that came through
// the Worker (and so carry the shared secret) are served.
test('requests that bypass the Worker are refused when the proxy secret is required', async () => {
  const SECRET = 'worker-secret-for-tests';
  const viaWorker = { 'X-MG-Proxy-Secret': SECRET };
  const refused = async (res: Response, label: string) => {
    assert.equal(res.status, 403, label);
    assert.deepEqual(await res.json(), { error: 'Direct API access is not allowed' });
    assert.equal(res.headers.get('x-csrf-error'), null, 'refused before the CSRF checks');
  };

  process.env.PROXY_SHARED_SECRET = SECRET;
  process.env.REQUIRE_PROXY_SECRET = 'true';
  try {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    applySecurity(app, LIMITS);
    let reached = 0;
    const effect = (_req: express.Request, res: express.Response) => { reached++; res.json({ ok: true }); };
    app.get('/api/health', effect);
    app.post('/api/health', effect);
    app.get('/api/health/details', effect);
    app.get('/api/records', effect);
    app.post('/api/records', effect);
    app.use('/api/auth', authRoutes);
    const base = await new Promise<string>(resolve => {
      const server = app.listen(0, () => resolve(`http://127.0.0.1:${(server.address() as any).port}`));
      servers.push(server);
    });
    const send = (target: string, method = 'GET', headers: Record<string, string> = {}) => fetch(`${base}${target}`, { method, headers, redirect: 'manual' });

    for (const [label, headers] of Object.entries({
      missing: {}, empty: { 'X-MG-Proxy-Secret': '' }, wrong: { 'X-MG-Proxy-Secret': 'guess' }, prefix: { 'X-MG-Proxy-Secret': SECRET.slice(0, -1) },
    })) {
      await refused(await send('/api/records', 'GET', headers), `GET ${label}`);
      await refused(await send('/api/records', 'POST', headers), `POST ${label}`);
    }
    // A signed-in direct caller is refused too, and gets no hint about CSRF.
    const { cookie, token } = session();
    await refused(await send('/api/records', 'POST', { Cookie: cookie, Origin: TRUSTED, [CSRF_HEADER]: token }), 'signed-in direct write');
    assert.equal(reached, 0, 'a refused request causes no side effect');

    // Only GET /api/health is open to the host's health check and the self-ping.
    assert.equal((await send('/api/health')).status, 200);
    await refused(await send('/api/health', 'POST'), 'POST /api/health');
    await refused(await send('/api/health/details'), 'a path under /api/health');
    await refused(await send('/api/health/'), 'trailing slash');
    assert.equal(reached, 1);

    // Through the Worker everything behaves as before, including the CSRF checks.
    assert.equal((await send('/api/records', 'GET', viaWorker)).status, 200);
    assert.equal((await send('/api/records', 'POST', { ...viaWorker, Cookie: cookie, Origin: TRUSTED, [CSRF_HEADER]: token })).status, 200);
    const forged = await send('/api/records', 'POST', { ...viaWorker, Cookie: cookie, Origin: FORGED, 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(forged.status, 403);
    assert.equal(forged.headers.get('x-csrf-error'), 'origin');

    // The Microsoft sign-in callback reaches its route through the Worker only.
    assert.equal((await send('/api/auth/microsoft/callback?code=code', 'GET', { ...viaWorker, 'Sec-Fetch-Site': 'cross-site' })).status, 302);
    await refused(await send('/api/auth/microsoft/callback?code=code', 'GET', { 'Sec-Fetch-Site': 'cross-site' }), 'direct SSO callback');

    // Off by default: the app started before the setting was turned on is unaffected.
    assert.equal((await call('/api/records', 'GET')).status, 200);
  } finally {
    delete process.env.PROXY_SHARED_SECRET;
    delete process.env.REQUIRE_PROXY_SECRET;
  }
});

test('requiring the proxy secret without one, or with an unrecognised value, stops startup', () => {
  const boot = (env: Record<string, string>) => {
    Object.assign(process.env, env);
    try {
      applySecurity(express(), LIMITS);
    } finally {
      for (const key of Object.keys(env)) delete process.env[key];
    }
  };
  assert.throws(() => boot({ REQUIRE_PROXY_SECRET: 'true' }), /needs PROXY_SHARED_SECRET/);
  assert.throws(() => boot({ REQUIRE_PROXY_SECRET: 'true', PROXY_SHARED_SECRET: '' }), /needs PROXY_SHARED_SECRET/);
  for (const typo of ['ture', '1', 'yes', 'on']) {
    assert.throws(() => boot({ REQUIRE_PROXY_SECRET: typo, PROXY_SHARED_SECRET: 'set' }), /must be "true" or "false"/, typo);
  }
  for (const off of ['false', ' FALSE ', '']) assert.doesNotThrow(() => boot({ REQUIRE_PROXY_SECRET: off }));
  assert.doesNotThrow(() => boot({ REQUIRE_PROXY_SECRET: ' True ', PROXY_SHARED_SECRET: 'set' }));
});

test('responses carry the security headers and a Teams-compatible framing policy', async () => {
  const res = await call('/api/health', 'GET');
  const csp = res.headers.get('content-security-policy') ?? '';
  assert.equal(csp, CONTENT_SECURITY_POLICY);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self' https:\/\/teams\.microsoft\.com https:\/\/\*\.teams\.microsoft\.com/);
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
  // X-Frame-Options cannot allow-list Teams, so it must not override the CSP.
  assert.equal(res.headers.get('x-frame-options'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('strict-transport-security') ?? '', /max-age=\d+/);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('the Cloudflare Worker serves the same policy and strips spoofed proxy headers', () => {
  for (const file of ['worker.js', 'client/public/_worker.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
    assert.ok(source.includes(`"${CONTENT_SECURITY_POLICY}"`), `${file} policy matches the server`);
    assert.match(source, /headers\.delete\('x-mg-proxy-secret'\)/);
    assert.match(source, /headers\.delete\('x-mg-client-ip'\)/);
  }
});

// AUD-002 routes, mounted for real behind the same checks: the Admin
// Microsoft-identity write and the Microsoft sign-in start and callback.
test('the Microsoft-identity write and SSO routes are covered without blocking the callback', async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  applySecurity(app, LIMITS);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  const base = await new Promise<string>(resolve => {
    const server = app.listen(0, () => resolve(`http://127.0.0.1:${(server.address() as any).port}`));
    servers.push(server);
  });

  // Any database access means the request got past the security checks.
  let dbHits = 0;
  const lookup = prisma.user.findUnique;
  prisma.user.findUnique = (async () => {
    dbHits++;
    return { id: 'sales-1', name: 'Sales', email: 'sales@example.com', role: 'SALES_COORDINATOR', isActive: true, permissions: [], driverProfile: null };
  }) as any;

  try {
    const { cookie, token } = session('sales-1');
    const link = (headers: Record<string, string>) => fetch(`${base}/api/users/target-1/microsoft-identity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
      body: JSON.stringify({ microsoft_oid: 'ce7af71e-cdd0-4be6-93a9-ec280e1c10df' }),
    });

    const forged = await link({ Origin: FORGED, 'Sec-Fetch-Site': 'cross-site', [CSRF_HEADER]: token });
    assert.equal(forged.status, 403);
    assert.equal(forged.headers.get('x-csrf-error'), 'origin');
    const tokenless = await link({ Origin: TRUSTED, 'Sec-Fetch-Site': 'same-origin' });
    assert.equal(tokenless.status, 403);
    assert.equal(tokenless.headers.get('x-csrf-error'), 'token');
    assert.equal(dbHits, 0, 'refused before the session or user is looked up');

    // A genuine request reaches the route's own role check (Admin only).
    const genuine = await link({ Origin: TRUSTED, 'Sec-Fetch-Site': 'same-origin', [CSRF_HEADER]: token });
    assert.equal(genuine.status, 403);
    assert.equal(genuine.headers.get('x-csrf-error'), null);
    assert.equal(dbHits, 1);

    // Starting a Microsoft sign-in from another site is login CSRF.
    const start = await fetch(`${base}/api/auth/microsoft`, { method: 'POST', headers: { Origin: FORGED, 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(start.status, 403);
    assert.equal(start.headers.get('x-csrf-error'), 'origin');

    // Microsoft returns the browser with a cross-site top-level GET; it must
    // reach the route, which then applies its own state validation.
    const callback = await fetch(`${base}/api/auth/microsoft/callback?code=code`, { redirect: 'manual', headers: { 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('x-csrf-error'), null);
  } finally {
    prisma.user.findUnique = lookup;
  }
});
