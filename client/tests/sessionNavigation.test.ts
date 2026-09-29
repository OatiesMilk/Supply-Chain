import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { api, type ApiUser } from '../src/api';
import { useAuthStore } from '../src/store/authStore';
import { useUIStore } from '../src/store/uiStore';
import { usePermissions } from '../src/hooks/usePermissions';
import { AppRouter, type AppRouterProps } from '../src/routes/AppRouter';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  mock.restoreAll();
  useAuthStore.setState({ authUser: null, authChecked: false });
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
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
  assert.deepEqual(replacements, ['/dashboard']);
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
