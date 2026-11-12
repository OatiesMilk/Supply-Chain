import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import authRoutes from '../src/routes/auth';
import { prisma } from '../src/db';
import { stateDigest } from '../src/services/ssoState';

const TENANT = '7411f7e0-fb01-415c-8136-f9c30b06393f';
const ORIGIN = 'https://staging.example.com';

// Exercise the route handlers without starting another application server.
async function post(path: string) {
  const handler = (authRoutes as any).stack.find((layer: any) => layer.route?.path === path && layer.route.methods.post).route.stack.at(-1).handle;
  const cookies: any[] = [];
  const cleared: any[] = [];
  let body: any;
  let status = 200;
  const headers = new Map<string, string>();
  const res: any = {
    status(value: number) { status = value; return this; },
    json(value: any) { body = value; return this; },
    cookie(name: string, value: string, options: any) { cookies.push({ name, value, options }); },
    clearCookie(name: string, options: any) { cleared.push({ name, options }); },
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); },
    redirect() { assert.fail('Portal logout/initiation must not redirect to Microsoft sign-out'); },
  };
  await handler({ cookies: { mg_session: 'prior-portal-session' } }, res, (error?: Error) => { if (error) throw error; });
  return { body, status, cookies, cleared, headers };
}

test('Microsoft login offers account selection before and after portal-only logout while preserving tenant, scopes and fresh state', async () => {
  const keys = ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'APP_URL', 'NODE_ENV'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { AZURE_CLIENT_ID: 'client-id', AZURE_CLIENT_SECRET: 'test-only-secret', AZURE_TENANT_ID: TENANT, APP_URL: ORIGIN, NODE_ENV: 'production' });
  const originalDelete = prisma.oAuthLoginState.deleteMany;
  const originalCreate = prisma.oAuthLoginState.create;
  const registered: any[] = [];
  prisma.oAuthLoginState.deleteMany = mock.fn(async () => ({ count: 0 })) as any;
  prisma.oAuthLoginState.create = mock.fn(async ({ data }: any) => { registered.push(data); return data; }) as any;
  // Match the route's ESM import so the spy observes the same MSAL class.
  const { ConfidentialClientApplication } = await import('@azure/msal-node');
  const originalGetUrl = ConfidentialClientApplication.prototype.getAuthCodeUrl;
  const requests: any[] = [];
  const metadataReads: string[] = [];
  // Keep MSAL's real URL generation. Only replace its discovery transport so
  // no test request contacts Microsoft or exchanges credentials/tokens.
  const msalSpy = mock.method(ConfidentialClientApplication.prototype, 'getAuthCodeUrl', async function(this: any, request: any) {
    requests.push({ request, authority: this.config.auth.authority });
    this.config.system.networkClient = {
      sendGetRequestAsync: async (url: string) => {
        metadataReads.push(url);
        const base = `https://login.microsoftonline.com/${TENANT}`;
        const body = url.includes('/discovery/instance') ? {
          tenant_discovery_endpoint: `${base}/v2.0/.well-known/openid-configuration`,
          metadata: [{ preferred_network: 'login.microsoftonline.com', preferred_cache: 'login.microsoftonline.com', aliases: ['login.microsoftonline.com'] }],
        } : {
          authorization_endpoint: `${base}/oauth2/v2.0/authorize`, token_endpoint: `${base}/oauth2/v2.0/token`,
          end_session_endpoint: `${base}/oauth2/v2.0/logout`, issuer: `${base}/v2.0`, jwks_uri: `${base}/discovery/v2.0/keys`,
        };
        return { status: 200, headers: {}, body };
      },
      sendPostRequestAsync: async () => { assert.fail('URL initiation must not exchange tokens'); },
    };
    return originalGetUrl.call(this, request);
  });
  try {
    const before = await post('/microsoft');
    assert.equal(before.status, 200);
    const logout = await post('/logout');
    assert.equal(logout.status, 200);
    assert.deepEqual(logout.body, { ok: true });
    assert.deepEqual(logout.cleared, [{ name: 'mg_session', options: { httpOnly: true, sameSite: 'none', secure: true } }]);
    assert.equal(logout.headers.has('location'), false);
    assert.equal(logout.cookies.length, 0);
    assert.equal(requests.length, 1, 'Logout does not call Microsoft');
    const after = await post('/microsoft');
    assert.equal(after.status, 200);
    for (const [index, result] of [before, after].entries()) {
      const url = new URL(result.body.url);
      assert.equal(url.origin, 'https://login.microsoftonline.com');
      assert.equal(url.pathname, `/${TENANT}/oauth2/v2.0/authorize`);
      assert.equal(url.searchParams.get('prompt'), 'select_account');
      assert.equal(url.searchParams.get('redirect_uri'), `${ORIGIN}/api/v1/auth/microsoft/callback`);
      assert.equal(url.searchParams.get('response_type'), 'code');
      assert.equal(url.searchParams.get('response_mode'), 'query');
      assert.equal(url.searchParams.has('login_hint'), false, 'No previous identity is pinned');
      const scopes = url.searchParams.get('scope')!.split(' ');
      for (const scope of ['openid', 'profile', 'email', 'User.Read']) assert.ok(scopes.includes(scope));
      assert.equal(requests[index].authority, `https://login.microsoftonline.com/${TENANT}`);
      assert.deepEqual(requests[index].request.scopes, ['openid', 'profile', 'email', 'User.Read']);
      const state = url.searchParams.get('state')!;
      assert.match(state, /^[a-f0-9]{64}$/);
      assert.equal(registered[index].id, stateDigest(state));
      assert.deepEqual(result.cookies, [{ name: 'mg_sso_state', value: state, options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/auth/microsoft/callback', maxAge: 300000 } }]);
    }
    assert.notEqual(new URL(before.body.url).searchParams.get('state'), new URL(after.body.url).searchParams.get('state'));
    assert.equal(registered.length, 2);
    // Newer MSAL versions can use bundled authority metadata with no discovery.
    for (const url of metadataReads) assert.equal(new URL(url).hostname, 'login.microsoftonline.com');
  } finally {
    msalSpy.mock.restore();
    prisma.oAuthLoginState.deleteMany = originalDelete;
    prisma.oAuthLoginState.create = originalCreate;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
