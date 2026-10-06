import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { checkServerHealth, SERVER_CHECK_EVENT } from '../src/api/availability';
import { api, ApiError } from '../src/api/index';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  mock.restoreAll();
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

test('health requires an explicit healthy response, bypasses cache, and supports cancellation', async () => {
  const signal = new AbortController().signal;
  const fetchMock = mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    assert.equal(_url, '/api/health');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal, signal);
    return Response.json({ ok: true });
  });
  assert.equal(await checkServerHealth(signal), true);
  fetchMock.mock.mockImplementation(async () => Response.json({ ok: false }, { status: 503 }));
  assert.equal(await checkServerHealth(signal), false);
  fetchMock.mock.mockImplementation(async () => new Response('<html>proxy error</html>', { status: 500 }));
  assert.equal(await checkServerHealth(signal), false);
  fetchMock.mock.mockImplementation(async () => Response.json({ unrelated: true }));
  assert.equal(await checkServerHealth(signal), false);
});

test('disconnection and malformed health responses reject so the monitor can show the outage page', async () => {
  const signal = new AbortController().signal;
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(checkServerHealth(signal), TypeError);
  fetchMock.mock.mockImplementation(async () => new Response('<html>not the API</html>'));
  await assert.rejects(checkServerHealth(signal), SyntaxError);
});

test('API connectivity failures request a probe without retrying writes; auth errors do not', async () => {
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { value: events, configurable: true });
  let probes = 0;
  events.addEventListener(SERVER_CHECK_EVENT, () => { probes++; });
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api.createRecord({}), TypeError);
  assert.equal(probes, 1);
  assert.equal(fetchMock.mock.callCount(), 1);
  fetchMock.mock.mockImplementation(async () => Response.json({ error: 'Not authenticated' }, { status: 401 }));
  await assert.rejects(api.me(), (error: ApiError) => error.status === 401);
  assert.equal(probes, 1);
  fetchMock.mock.mockImplementation(async () => new Response('Bad gateway', { status: 502 }));
  await assert.rejects(api.me(), (error: ApiError) => error.status === 502);
  assert.equal(probes, 2);
});
