import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { api, type ApiUser } from '../src/api';
import { useAuthStore } from '../src/store/authStore';
import { useUIStore } from '../src/store/uiStore';
import { usePermissions } from '../src/hooks/usePermissions';
import { AppRouter, type AppRouterProps } from '../src/routes/AppRouter';
import { keepLoginRoute, syncAuthenticatedRoute } from '../src/routes/screenRouting';
import { createQueryClient } from '../src/api/queryClient';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  mock.restoreAll();
  useAuthStore.setState({ authUser: null, authChecked: false, logoutPending: false });
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

function browserAt(path: string) {
  const events = new EventTarget();
  const browser = Object.assign(events, {
    location: new URL(path, 'http://localhost'),
    history: {
      replaceState: (_state: unknown, _title: string, url: string) => {
        browser.location = new URL(url, 'http://localhost');
      },
      pushState: (_state: unknown, _title: string, url: string) => {
        browser.location = new URL(url, 'http://localhost');
      },
    },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  return browser;
}

test('logged-out Back navigation keeps the login URL and stops listening after login', () => {
  const browser = browserAt('/admin?item=old');
  const cleanup = keepLoginRoute();
  assert.equal(browser.location.pathname, '/login');
  browser.location = new URL('http://localhost/deliveries');
  browser.dispatchEvent(new Event('popstate'));
  assert.equal(browser.location.pathname, '/login');
  cleanup();
  browser.location = new URL('http://localhost/dashboard');
  browser.dispatchEvent(new Event('popstate'));
  assert.equal(browser.location.pathname, '/dashboard');
});

test('login and history routes honor role defaults, grants, revocations, and valid detail links', () => {
  for (const role of ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER'] as const) {
    let screens = new Set<string>();
    function Probe() { screens = usePermissions(user(role)).effectiveScreens; return null; }
    renderToString(React.createElement(Probe));
    const browser = browserAt('/login');
    syncAuthenticatedRoute(screens, useUIStore.getState().handleNavigate);
    assert.equal(browser.location.pathname, role === 'DRIVER' ? '/driver_dashboard' : '/dashboard');
    browser.location = new URL('http://localhost/admin');
    syncAuthenticatedRoute(screens, useUIStore.getState().handleNavigate);
    assert.equal(browser.location.pathname, role === 'ADMIN' ? '/admin' : role === 'DRIVER' ? '/driver_dashboard' : '/dashboard');
  }
  const browser = browserAt('/inventory?item=sku-123');
  syncAuthenticatedRoute(new Set(['dashboard', 'inventory']), useUIStore.getState().handleNavigate);
  assert.equal(browser.location.search, '?item=sku-123');
  assert.equal(useUIStore.getState().selectedProductId, 'sku-123');
  syncAuthenticatedRoute(new Set(['main']), useUIStore.getState().handleNavigate);
  assert.equal(browser.location.pathname, '/main');
  assert.equal(useUIStore.getState().selectedProductId, null);
  browser.location = new URL('http://localhost/admin');
  syncAuthenticatedRoute(new Set(['admin']), useUIStore.getState().handleNavigate);
  assert.equal(useUIStore.getState().currentScreen, 'admin');
  syncAuthenticatedRoute(new Set(), () => assert.fail('No screen may be mounted without permission'));
});

test('logout stays pending until its response finishes; session checks cannot restore the old account meanwhile', async () => {
  browserAt('/admin');
  let finishLogout!: () => void;
  mock.method(api, 'logout', () => new Promise<{ ok: boolean }>(resolve => { finishLogout = () => resolve({ ok: true }); }));
  const me = mock.method(api, 'me', async () => user('SALES_COORDINATOR'));
  useAuthStore.getState().login(user('ADMIN'));
  const logout = useAuthStore.getState().logout();
  assert.equal(useAuthStore.getState().logoutPending, true);
  assert.equal(useAuthStore.getState().authUser, null);
  const check = useAuthStore.getState().checkAuth();
  assert.equal(me.mock.callCount(), 0);
  finishLogout();
  await Promise.all([logout, check]);
  assert.equal(useAuthStore.getState().logoutPending, false);
  assert.equal(me.mock.callCount(), 1);
  assert.equal(useAuthStore.getState().authUser?.role, 'SALES_COORDINATOR');
});

test('new sessions cannot reuse previous query data or late results', async () => {
  const oldCache = createQueryClient();
  const newCache = createQueryClient();
  let finish!: (value: string[]) => void;
  const oldRequest = oldCache.fetchQuery({ queryKey: ['records'], queryFn: () => new Promise<string[]>(resolve => { finish = resolve; }) });
  newCache.setQueryData(['records'], ['current-account-record']);
  finish(['previous-account-record']);
  await oldRequest;
  assert.deepEqual(newCache.getQueryData(['records']), ['current-account-record']);
  assert.equal(newCache.getQueryData(['admin-users']), undefined);
  oldCache.clear();
  newCache.clear();
});

test('a failed logout is retried on reconnect before the old cookie can restore an account', async () => {
  browserAt('/admin');
  useAuthStore.getState().login(user('ADMIN'));
  const logout = mock.method(api, 'logout', async () => { throw new Error('Offline'); });
  const me = mock.method(api, 'me', async () => user('ADMIN'));
  await useAuthStore.getState().logout();
  await useAuthStore.getState().checkAuth();
  assert.equal(useAuthStore.getState().authUser, null);
  assert.equal(me.mock.callCount(), 0);
  logout.mock.mockImplementation(async () => ({ ok: true }));
  await useAuthStore.getState().checkAuth();
  assert.equal(useAuthStore.getState().authUser, null);
  assert.equal(useAuthStore.getState().authChecked, true);
  assert.equal(me.mock.callCount(), 0);
});

const user = (role: ApiUser['role']): ApiUser => ({
  id: role, name: role, email: `${role}@example.com`, role, permissions: [],
});

test('logout from Admin clears the route and open details before another role logs in, even offline', async () => {
  const replacements: string[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { history: { replaceState: (_state: unknown, _title: string, url: string) => replacements.push(url) } },
  });
  mock.method(api, 'logout', async () => { throw new Error('Offline'); });
  useAuthStore.getState().login(user('ADMIN'));
  useUIStore.setState({ currentScreen: 'admin', searchOpen: true, accessRequestOpen: true, selectedRecordId: 'old-record', selectedProductId: 'old-product' });
  await useAuthStore.getState().logout();
  assert.equal(useAuthStore.getState().authUser, null);
  assert.deepEqual(replacements, ['/login']);
  for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER'] as const) {
    useAuthStore.getState().login(user(role));
    const state = useUIStore.getState();
    assert.equal(state.currentScreen, 'dashboard');
    assert.equal(state.searchOpen, false);
    assert.equal(state.accessRequestOpen, false);
    assert.equal(state.selectedRecordId, null);
    assert.equal(state.selectedProductId, null);
  }
});

test('permissions are available on first render and respect grants and revocations', () => {
  function Probe({ account }: { account: ApiUser }) {
    const { canAccess } = usePermissions(account);
    return React.createElement('span', null, String(canAccess('admin')) + ':' + String(canAccess('dashboard')));
  }
  assert.match(renderToString(React.createElement(Probe, { account: user('ADMIN') })), /true:true/);
  assert.match(renderToString(React.createElement(Probe, { account: user('SALES_COORDINATOR') })), /false:true/);
  const account = { ...user('LOGISTICS'), permissions: [{ screen: 'admin', granted: true }, { screen: 'dashboard', granted: false }] };
  assert.match(renderToString(React.createElement(Probe, { account })), /true:false/);
});

test('inaccessible routes never mount protected pages', () => {
  for (const currentScreen of ['admin', 'deliveries', 'accounting_collection']) {
    // Only the guard props are supplied: mounting any protected page would fail.
    const props = { currentScreen, canAccess: () => false } as unknown as AppRouterProps;
    const html = renderToString(React.createElement(AppRouter, props));
    assert.match(html, /This page is not available for your account/);
    assert.doesNotMatch(html, /User Management|Create User/);
  }
});
