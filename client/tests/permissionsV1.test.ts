import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { evaluatePermissions } from '../../server/src/services/permissionEvaluator';
import { defaultRolePermissions, POLICY_ROLES, type PolicyRole } from '../../server/src/services/permissionCatalog';
import { api, type ApiUser } from '../src/api';
import { completePermissionSession, permissionsFor, permissionSessionKey } from '../src/utils/permissions';
import { rememberPermissionRecord, permissionStagingKey, ClientPermissionError } from '../src/api/permissionRuntime';
import { useAuthStore } from '../src/store/authStore';
import { useUIStore } from '../src/store/uiStore';
import { isResourceQueryEnabled } from '../src/hooks/useAppData';
import { createQueryClient } from '../src/api/queryClient';
import { usePermissions } from '../src/hooks/usePermissions';
import { AppRouter, type AppRouterProps } from '../src/routes/AppRouter';
import DeliveryRecordWorkspace from '../src/features/deliveries/DeliveryRecordWorkspace';
import { installLegacySession } from './helpers/permissionSession';

function account(role: PolicyRole = 'SALES_COORDINATOR', deny: string[] = [], allow: string[] = []): ApiUser {
  // Use the actual server evaluator, not a client copy of role policy rules.
  const snapshot = evaluatePermissions({
    userId: 'v1-account', role, isActive: true, authorizationRevision: '3',
    driverProfile: role === 'DRIVER' ? { id: 'driver-1', type: 'DRIVER', isActive: true } : null,
    rolePolicy: { role, revision: '9', catalogVersion: 1,
      permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect: allow.includes(permissionKey) ? 'ALLOW' : effect })) },
    overrides: deny.map(permissionKey => ({ permissionKey, effect: 'DENY' })),
  });
  return { id: snapshot.userId, name: 'Permission Test', email: 'permission@example.test', role,
    permissions: [], effectiveScreens: snapshot.effectiveScreens, resources: snapshot.resources,
    permissionVersion: 'server-version', contractVersion: 1, activeMode: 'V1', snapshot };
}
function install(user: ApiUser, screen = 'deliveries') {
  useAuthStore.getState().setAuthUser(user);
  useUIStore.setState({ currentScreen: screen });
  rememberPermissionRecord({ id: 'record-1', category: screen === 'rma' ? 'RMA' : 'Deliveries', is_draft: 'No' });
}
afterEach(() => { mock.restoreAll(); useAuthStore.getState().setAuthUser(null); });

test('the client accepts the complete real evaluator catalog for all five roles', () => {
  for (const role of POLICY_ROLES) assert.equal(completePermissionSession(account(role)), true, role);
});

test('missing, inconsistent, unknown and unsupported active contracts fail closed', () => {
  const good = account();
  for (const change of [
    (u: any) => { delete u.snapshot; },
    (u: any) => { delete u.snapshot.capabilities.categories.DELIVERY.actions.POD; },
    (u: any) => { u.snapshot.capabilities.screens.unknown = u.snapshot.capabilities.screens.deliveries; },
    (u: any) => { u.snapshot.capabilities.categories.DELIVERY.read = false; },
    (u: any) => { u.snapshot.authorizationRevision = 3; },
    (u: any) => { u.snapshot.userId = 'another-account'; },
    (u: any) => { u.activeMode = 'FUTURE'; },
    (u: any) => { u.contractVersion = 2; },
    (u: any) => { u.activeMode = 'LEGACY'; },
  ]) {
    const changed = structuredClone(good); change(changed);
    assert.equal(completePermissionSession(changed), false);
    assert.equal(permissionsFor(changed).canAccess('deliveries'), false);
    assert.equal(permissionsFor(changed).canRecord('Deliveries', 'CREATE'), false);
  }
  assert.equal(permissionsFor({ role: 'ADMIN' } as any).effectiveScreens.size, 0);
  assert.equal(permissionsFor(good).can('SCREEN', 'unknown'), false);
});

test('supplier catalog and assignment requests use Admin supplier Write and reject explicit denials before fetch', async () => {
  const network = mock.method(globalThis, 'fetch', async () => Response.json({}));
  const actions = [() => api.createSupplierCategory('Category'),
    () => api.updateSupplierCategory('category', { name: 'Rename', expected_version: 1 }),
    () => api.updateSupplierCategories('supplier', { category_ids: ['category'], expected_version: 1 })];
  install(account('ADMIN'), 'suppliers');
  for (const action of actions) await action();
  assert.equal(network.mock.callCount(), 3, 'supplier UPDATE is not required because catalog uses the existing WRITE action');
  for (const denied of ['SCREEN:suppliers:WRITE', 'RESOURCE:suppliers:WRITE', 'RESOURCE:suppliers:READ']) {
    install(account('ADMIN', [denied]), 'suppliers');
    for (const action of actions) await assert.rejects(action(), ClientPermissionError);
  }
  install(account('LOGISTICS'), 'suppliers');
  for (const action of actions) await assert.rejects(action(), ClientPermissionError);
  assert.equal(network.mock.callCount(), 3);
});

test('read-only categories retain reads while every record mutation rejects before fetch', async () => {
  install(account('TASS', ['CATEGORY:RMA:WRITE']), 'rma');
  const network = mock.method(globalThis, 'fetch', async () => Response.json([]));
  await api.getRecords({ category: 'RMA' });
  assert.equal(network.mock.callCount(), 1);
  const calls = [
    () => api.createRecord({ category: 'RMA', is_draft: 'Yes' }),
    () => api.updateRecord('record-1', { remarks: 'blocked' }),
    () => api.patchStatus('record-1', 'Scheduled', 'blocked'),
    () => api.assignRma('record-1', { driver_id: 'driver-1', expected_version: 1, remarks: 'blocked' }),
    () => api.receiveRma('record-1', { recipient: 'Receiver', expected_version: 1, remarks: 'blocked' }),
    () => api.createRecordComment('record-1', 'blocked'),
    () => api.uploadRecordAttachment('record-1', new File(['x'], 'photo.png', { type: 'image/png' })),
    () => api.deleteRecordAttachment('record-1', 'file-1', 'blocked'),
    () => api.sendNotificationEmail({ recordId: 'record-1', trigger: 'Record Created', recipients: ['test@example.test'] }),
  ];
  for (const call of calls) await assert.rejects(call(), ClientPermissionError);
  assert.equal(network.mock.callCount(), 1, 'forbidden actions never reach the network');
  await api.markAllNotificationsRead();
  assert.equal(network.mock.callCount(), 2, 'personal notification read state stays usable');
});

test('operation denials cannot be bypassed by mixed metadata, status or category-move payloads', async () => {
  install(account('LOGISTICS', ['CATEGORY:DELIVERY:ASSIGN', 'CATEGORY:DELIVERY:COMPLETE']));
  const network = mock.method(globalThis, 'fetch', async () => Response.json({ id: 'record-1', category: 'Deliveries' }));
  await assert.rejects(api.updateRecord('record-1', { priority: '3 - High', driver_id: 'driver-1' }), ClientPermissionError);
  await assert.rejects(api.patchStatus('record-1', 'Delivered', 'done'), ClientPermissionError);
  assert.equal(network.mock.callCount(), 0);
  await api.updateRecord('record-1', { priority: '3 - High', remarks: 'Allowed metadata' });
  assert.equal(network.mock.callCount(), 1);
  install(account('SALES_COORDINATOR', ['CATEGORY:DELIVERY:UPDATE']));
  await assert.rejects(api.updateRecord('record-1', { category: 'SALES_ORDERS' }), ClientPermissionError);
  install(account('SALES_COORDINATOR', ['CATEGORY:DELIVERY:SUBMIT']));
  rememberPermissionRecord({ id: 'record-1', category: 'Deliveries', is_draft: 'Yes' });
  await assert.rejects(api.patchStatus('record-1', 'Scheduled', 'submit'), ClientPermissionError);
});

test('activated Logistics RMA assignment stays separate from general edits and TASS completion', async () => {
  const user = account('LOGISTICS', [], ['SCREEN:rma:WRITE', 'CATEGORY:RMA:WRITE', 'CATEGORY:RMA:ASSIGN']);
  install(user, 'rma');
  const p = permissionsFor(user);
  assert.equal(p.canRecord('RMA', 'ASSIGN', 'rma'), true);
  assert.equal(p.canRecord('RMA', 'UPDATE', 'rma'), false);
  assert.equal(p.canRecord('RMA', 'RECEIVE', 'rma'), false);
  assert.equal(p.canRecord('RMA', 'COMPLETE', 'rma'), false);
  const network = mock.method(globalThis, 'fetch', async () => Response.json({ id: 'record-1', category: 'RMA' }));
  await api.assignRma('record-1', { driver_id: 'driver-1', expected_version: 1, remarks: 'Assign transport' });
  await assert.rejects(api.updateRecord('record-1', { reference: 'changed' }), ClientPermissionError);
  await assert.rejects(api.receiveRma('record-1', { recipient: 'Receiver', expected_version: 1, remarks: 'Denied' }), ClientPermissionError);
  await assert.rejects(api.patchStatus('record-1', 'Delivered', 'Denied'), ClientPermissionError);
  assert.equal(network.mock.callCount(), 1);
});

test('shared SKU lookup does not grant inventory writes, and denied routes/categories do not load', async () => {
  const user = account('SALES_COORDINATOR'); install(user, 'transactions');
  const network = mock.method(globalThis, 'fetch', async () => Response.json([]));
  await api.getSkus();
  await assert.rejects(api.adjustStock('sku-1', { type: 'Adjustment', qty_change: 1, reference: 'x' }), ClientPermissionError);
  assert.equal(network.mock.callCount(), 1);
  const denied = account('SALES_COORDINATOR', ['CATEGORY:DELIVERY:READ']);
  assert.equal(isResourceQueryEnabled('records', denied, 'deliveries'), false);
  assert.equal(isResourceQueryEnabled('records', user, 'admin'), false);
  const html = renderToString(React.createElement(AppRouter, { currentScreen: 'admin', canAccess: permissionsFor(user).canAccess } as AppRouterProps));
  assert.match(html, /not available/);
});

test('screen Write denial hides editing even when category Update remains allowed', async () => {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true }, IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
  });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const user = account('SALES_COORDINATOR'); install(user);
  const client = createQueryClient();
  mock.method(api, 'getRecordAudit', async () => []);
  const record = { id: 'record-1', category: 'Deliveries', status: 'Scheduled', is_draft: 'No',
    driver_assistants: [], reference: 'DOC-1', company_name: 'Company', line_items: [], attachments: [], output_actions_log: [] } as any;
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(DeliveryRecordWorkspace, {
      record, allRecords: [record], allRecordIds: ['record-1'], companies: [], currentUserRole: 'Sales Coordinator', currentUserName: user.name,
      onBack() {}, onNavigateToRecord() {}, onUpdateRecord: async () => {}, outputActionConfigs: {} as any,
    }))));
    const editButtons = () => [...dom.window.document.querySelectorAll('button')].filter(button => button.textContent?.trim() === 'Edit');
    assert.ok(editButtons().length > 0, 'the allowed control is present before revocation');
    await act(async () => install(account('SALES_COORDINATOR', ['SCREEN:deliveries:WRITE'])));
    assert.equal(editButtons().length, 0);
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('permission revocation discards a late response and scopes staged files to the new revision', async () => {
  const initial = account(); install(initial);
  const stagedBefore = permissionStagingKey('record-1');
  let finish!: (response: Response) => void;
  mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { finish = resolve; }));
  const pending = api.getRecords();
  const changed = structuredClone(initial); changed.snapshot!.authorizationRevision = '4';
  useAuthStore.getState().setAuthUser(changed);
  finish(Response.json([{ id: 'late-record', category: 'Deliveries' }]));
  await assert.rejects(pending, ClientPermissionError);
  assert.notEqual(permissionStagingKey('record-1'), stagedBefore);
  assert.notEqual(permissionSessionKey(initial), permissionSessionKey(changed));
});

test('a stale CSRF retry cannot send a write after permissions change', async () => {
  const user = account(); install(user);
  let calls = 0;
  mock.method(globalThis, 'fetch', async (url: string) => {
    calls++;
    if (url === '/api/v1/auth/me') {
      useAuthStore.getState().setAuthUser(null);
      return Response.json(user);
    }
    return Response.json({ error: 'Expired CSRF' }, { status: 403, headers: { 'X-CSRF-Error': 'token' } });
  });
  await assert.rejects(api.createRecordComment('record-1', 'comment'), ClientPermissionError);
  assert.equal(calls, 2, 'the protected write is not retried');
});

test('refreshing a V1 revision closes stale workspaces and refuses a legacy downgrade', async () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { history: { replaceState() {} } } });
  try {
    const user = account(); install(user);
    useUIStore.setState({ selectedRecordId: 'record-1', searchOpen: true, dashboardFilterId: 'pending' as any });
    const changed = structuredClone(user); changed.snapshot!.rolePolicyRevision = '10';
    mock.method(api, 'me', async () => changed);
    await useAuthStore.getState().refreshPermissions();
    assert.equal(useUIStore.getState().selectedRecordId, null);
    assert.equal(useUIStore.getState().searchOpen, false);
    assert.equal(useUIStore.getState().dashboardFilterId, null);
    const legacy = installLegacySession('SALES_COORDINATOR');
    install(changed);
    mock.method(api, 'me', async () => legacy);
    await useAuthStore.getState().refreshPermissions();
    assert.equal(useAuthStore.getState().authUser, null);
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('the navigation hook uses only server-computed screens', () => {
  const user = account('SALES_COORDINATOR', ['SCREEN:deliveries:READ']);
  function Probe() { return React.createElement('span', null, String(usePermissions(user).canAccess('deliveries'))); }
  assert.equal(renderToString(React.createElement(Probe)), '<span>false</span>');
});


test('a category screen grant cannot expose a list whose category Read is denied', () => {
  // TASS has no Procurement Pick-up screen at all, even with an explicit screen grant.
  const tass = account('TASS', [], ['SCREEN:procurement_pickup:READ']);
  assert.equal(tass.effectiveScreens.includes('procurement_pickup'), false);
  assert.equal(permissionsFor(tass).canAccess('procurement_pickup'), false);
  for (const [role, denies, allows] of [
    ['SALES_COORDINATOR', ['CATEGORY:PROCUREMENT_PICKUP:READ'], []],
  ] as Array<[PolicyRole, string[], string[]]>) {
    const user = account(role, denies, allows);
    assert.equal(user.effectiveScreens.includes('procurement_pickup'), true);
    const access = permissionsFor(user);
    assert.equal(access.canAccess('procurement_pickup'), false);
    assert.equal(access.effectiveScreens.has('procurement_pickup'), false);
    const html = renderToString(React.createElement(AppRouter, {
      currentScreen: 'procurement_pickup', canAccess: access.canAccess,
    } as AppRouterProps));
    assert.match(html, /not available/);
  }
  assert.equal(permissionsFor(account('ADMIN')).canAccess('procurement_pickup'), true);
  assert.equal(permissionsFor(account('SALES_COORDINATOR')).canAccess('procurement_pickup'), true);
});
