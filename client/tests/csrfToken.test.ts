import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api';
import { beforeEach } from 'node:test';
import { installLegacySession } from './helpers/permissionSession';
beforeEach(() => { installLegacySession(); });

// AUD-003: the API wrapper keeps the session's CSRF token from response
// headers and sends it back on later requests.
afterEach(() => mock.restoreAll());

type Call = { url: string; method: string; token: string | undefined; contentType: string | undefined };

function mockApi(respond: (call: Call, index: number) => Response) {
  const calls: Call[] = [];
  mock.method(globalThis, 'fetch', async (url: string, options: RequestInit = {}) => {
    const headers = (options.headers ?? {}) as Record<string, string>;
    const call = { url, method: options.method ?? 'GET', token: headers['X-CSRF-Token'], contentType: headers['Content-Type'] };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  return calls;
}

const ok = (token?: string) => Response.json({ ok: true }, { headers: token ? { 'X-CSRF-Token': token } : {} });
const refused = () => Response.json({ error: 'Security token missing or expired.' }, { status: 403, headers: { 'X-CSRF-Error': 'token' } });

test('the token from a response is sent on later requests, including file uploads', async () => {
  const calls = mockApi(call => ok(call.url === '/api/v1/auth/me' ? 'token-1' : undefined));
  await api.me();
  await api.logout();
  await api.uploadRecordAttachment('record-1', new File(['x'], 'pod.png', { type: 'image/png' }));

  assert.equal(calls[1].token, 'token-1');
  assert.equal(calls[1].contentType, 'application/json');
  assert.equal(calls[2].token, 'token-1');
  assert.equal(calls[2].contentType, undefined, 'the browser sets the multipart boundary');
});

test('a refused token is refreshed from the session and the write is retried once', async () => {
  const calls = mockApi((call, index) => {
    if (call.url === '/api/v1/auth/me') return ok('token-2');
    return index === 0 ? refused() : ok();
  });
  await api.logout();
  assert.deepEqual(calls.map(call => call.url), ['/api/v1/auth/logout', '/api/v1/auth/me', '/api/v1/auth/logout']);
  assert.equal(calls[2].token, 'token-2');
});

test('a write that is still refused after the retry fails instead of looping', async () => {
  const calls = mockApi(call => call.url === '/api/v1/auth/me' ? ok('token-3') : refused());
  await assert.rejects(api.logout(), /Security token missing or expired/);
  assert.equal(calls.length, 3);
});
