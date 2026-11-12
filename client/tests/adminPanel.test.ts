import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import AdminPanel from '../src/features/admin/AdminPanel';
import { api, ApiError, type ApiDriver, type ApiIntegrationStatus, type ApiUserAdmin } from '../src/api';
import { useAuthStore } from '../src/store/authStore';
import { useUIStore } from '../src/store/uiStore';
import { installLegacySession } from './helpers/permissionSession';
import { defaultRolePermissions } from '../../server/src/services/permissionCatalog';
import { evaluatePermissions } from '../../server/src/services/permissionEvaluator';
import type { UserPermissionEditor } from '../src/types/permissionEditor';

const metadataVersion = 'meta:reviewed-account';
const target: ApiUserAdmin = { id: 'target', name: 'Target User', email: 'target@example.test', role: 'SALES_COORDINATOR', is_active: true, microsoft_linked: false, created_at: '', metadata_version: metadataVersion };
const integration: ApiIntegrationStatus = {
  azure_sso: { configured: false, tenant: null, redirect_uri: null },
  email: { method: 'mock', smtp_host: null, from: null },
  users: { total: 1, active: 1, microsoft_linked: 0 }, app_url: 'http://localhost', node_env: 'test',
};
const version = `v1:${'a'.repeat(64)}`;
const reviewedEditor = (expectedVersion = version) => ({ activeMode: 'V1', expectedVersion } as UserPermissionEditor);

function installV1Session(denyDriverRead = false) {
  const permissions = [...defaultRolePermissions('ADMIN')].map(([permissionKey, effect]) => ({ permissionKey,
    effect: denyDriverRead && permissionKey.startsWith('RESOURCE:drivers:') ? 'DENY' as const : effect }));
  const snapshot = evaluatePermissions({ userId: 'admin', role: 'ADMIN', isActive: true, authorizationRevision: '1', overrides: [],
    rolePolicy: { role: 'ADMIN', revision: '1', catalogVersion: 1, permissions } });
  assert.equal(snapshot.valid, true);
  useAuthStore.getState().setAuthUser({ id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'ADMIN', permissions: [],
    effectiveScreens: snapshot.effectiveScreens, resources: snapshot.resources, permissionVersion: 'v1-test', activeMode: 'V1', contractVersion: 1, snapshot });
  useUIStore.setState({ currentScreen: 'admin' });
}

function setup(users: ApiUserAdmin[] = [target]) {
  installLegacySession('ADMIN', 'admin');
  mock.method(api, 'getUsers', async () => users);
  mock.method(api, 'getDrivers', async () => []);
}

afterEach(() => { mock.restoreAll(); useAuthStore.getState().setAuthUser(null); });

type Controls = {
  doc: Document;
  click: (text: string, within?: ParentNode) => Promise<void>;
  change: (element: HTMLInputElement | HTMLSelectElement, value: string) => Promise<void>;
};
async function mounted(run: (controls: Controls) => Promise<void>) {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin' });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  // JSDOM has no native dialog behavior or browser layout. These tests verify
  // handlers/state/contracts; they do not establish visual size or focus traps.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const doc = dom.window.document;
  const click: Controls['click'] = async (text, within = doc) => {
    let button = [...within.querySelectorAll<HTMLButtonElement>('button')].find(row => row.textContent?.trim() === text || row.getAttribute('aria-label') === text);
    if (!button && ['Edit', 'Access', 'Delete', 'Activate', 'Deactivate'].includes(text)) {
      const trigger = within.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
      assert.ok(trigger);
      await act(async () => trigger.click());
      button = [...doc.querySelectorAll<HTMLButtonElement>('button')].find(row => row.textContent?.trim() === text);
    }
    assert.ok(button, `Button ${text} exists`);
    await act(async () => button.click());
  };
  const change: Controls['change'] = async (element, value) => {
    assert.ok(element);
    const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    await act(async () => { element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  };
  try {
    await act(async () => root.render(React.createElement(AdminPanel, { dashboardFilterId: null, clearDashboardFilter() {} })));
    await run({ doc, click, change });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('LEGACY Edit/Save works when the V1 foundation is unavailable and sends the legacy account contract', async () => {
  setup();
  const editors = mock.method(api, 'getUserPermissionEditor', async () => { throw new ApiError('Permission foundation has not been initialized', 503); });
  const updates = mock.method(api, 'updateUser', async (_id, fields) => ({ ...target, ...fields } as ApiUserAdmin));
  await mounted(async ({ doc, click }) => {
    await click('Edit'); await click('Save');
    assert.equal(updates.mock.callCount(), 1);
    assert.deepEqual(updates.mock.calls[0].arguments, [target.id, { name: target.name, email: target.email, role: target.role, expectedMetadataVersion: metadataVersion }]);
    assert.equal(editors.mock.callCount(), 0);
    assert.doesNotMatch(doc.body.textContent!, /Permission foundation has not been initialized/);
  });
});

test('LEGACY Deactivate, Activate and Delete preserve confirmations without requiring V1 editor reads', async () => {
  setup();
  const editors = mock.method(api, 'getUserPermissionEditor', async () => { throw new ApiError('Uninitialized foundation', 503); });
  const deactivate = mock.method(api, 'deactivateUser', async () => ({ ...target, is_active: false }));
  const activate = mock.method(api, 'activateUser', async () => ({ ...target, is_active: true }));
  const remove = mock.method(api, 'deleteUser', async () => ({ ok: true, deleted_id: target.id }));
  await mounted(async ({ doc, click }) => {
    await click('Deactivate'); assert.equal(deactivate.mock.callCount(), 0); await click('Deactivate user');
    await click('Activate'); assert.equal(activate.mock.callCount(), 0); await click('Activate user');
    await click('Delete'); assert.equal(remove.mock.callCount(), 0); await click('Delete user');
    for (const action of [deactivate, activate, remove]) assert.deepEqual(action.mock.calls[0].arguments, [target.id, {}]);
    assert.equal(editors.mock.callCount(), 0);
    assert.doesNotMatch(doc.body.textContent!, /Target User/);
  });
});

test('LEGACY Driver linking works without a V1 policy preflight', async () => {
  setup([{ ...target, role: 'DRIVER', driver_profile: null }]);
  mock.method(api, 'getDrivers', async () => [{ id: 'profile', name: 'Roster Driver', type: 'DRIVER', is_active: true, is_linked: false }] as ApiDriver[]);
  const editors = mock.method(api, 'getUserPermissionEditor', async () => { throw new ApiError('Uninitialized foundation', 503); });
  const links = mock.method(api, 'setUserDriverProfile', async () => ({ user_id: target.id, driver_profile: { id: 'profile', name: 'Roster Driver' } }));
  await mounted(async ({ doc, change }) => {
    await change(doc.querySelector<HTMLSelectElement>('#driver-profile-target')!, 'profile');
    assert.deepEqual(links.mock.calls[0].arguments, [target.id, 'profile', {}]);
    assert.equal(editors.mock.callCount(), 0);
    assert.equal(doc.querySelector<HTMLSelectElement>('#driver-profile-target')!.value, 'profile');
  });
});

test('V1 account actions require the reviewed version and a conflict blocks resubmission until reopened', async () => {
  setup(); installV1Session();
  let reads = 0;
  const editors = mock.method(api, 'getUserPermissionEditor', async () => reviewedEditor(++reads === 1 ? version : `v1:${'b'.repeat(64)}`));
  const deactivate = mock.method(api, 'deactivateUser', async () => { throw new ApiError('Account changed', 409); });
  await mounted(async ({ doc, click }) => {
    await click('Deactivate'); await click('Deactivate user');
    assert.deepEqual(deactivate.mock.calls[0].arguments, [target.id, { contractVersion: 1, expectedVersion: version }]);
    const dialog = doc.querySelector<HTMLDialogElement>('dialog[open]')!;
    assert.match(dialog.textContent!, /Cancel and reopen/);
    assert.equal([...dialog.querySelectorAll('button')].find(row => row.textContent === 'Deactivate user')!.disabled, true);
    await click('Deactivate user'); assert.equal(deactivate.mock.callCount(), 1);
    await click('Cancel', dialog); await click('Deactivate');
    assert.equal(editors.mock.callCount(), 2);
    assert.equal([...doc.querySelector('dialog[open]')!.querySelectorAll('button')].find(row => row.textContent === 'Deactivate user')!.disabled, false);
  });
});

test('V1 failed editor reads leave account action confirmation disabled and never send mutations', async () => {
  setup(); installV1Session();
  mock.method(api, 'getUserPermissionEditor', async () => { throw new ApiError('Cannot review current account', 503); });
  const remove = mock.method(api, 'deleteUser', async () => ({ ok: true, deleted_id: target.id }));
  await mounted(async ({ doc, click }) => {
    await click('Delete'); await click('Delete user');
    assert.match(doc.querySelector('dialog[open]')!.textContent!, /Cannot review current account/);
    assert.equal(remove.mock.callCount(), 0);
  });
});

test('V1 role changes show the reviewed preview before submitting its version and removed exception keys', async () => {
  setup(); installV1Session();
  const editors = mock.method(api, 'getUserPermissionEditor', async () => ({ ...reviewedEditor(), role: 'SALES_COORDINATOR', roleChange: {
    fromRole: 'SALES_COORDINATOR', toRole: 'LOGISTICS', removedOverrides: [{ permissionKey: 'SCREEN:main:WRITE', effect: 'ALLOW' }], validationError: null,
  } } as UserPermissionEditor));
  const updates = mock.method(api, 'updateUser', async () => ({ ...target, role: 'LOGISTICS' as const }));
  await mounted(async ({ doc, click, change }) => {
    await click('Edit'); await change(doc.querySelector<HTMLSelectElement>('table tbody select')!, 'LOGISTICS'); await click('Save');
    assert.deepEqual(editors.mock.calls[0].arguments, [target.id, 'LOGISTICS']);
    assert.equal(updates.mock.callCount(), 0);
    assert.match(doc.querySelector('dialog[open]')!.textContent!, /SCREEN:main:WRITE/);
    await click('Apply reviewed role change');
    assert.deepEqual(updates.mock.calls[0].arguments, [target.id, { name: target.name, email: target.email, role: 'LOGISTICS',
      expectedMetadataVersion: metadataVersion, contractVersion: 1, expectedVersion: version, removedOverrideKeys: ['SCREEN:main:WRITE'] }]);
  });
});

test('denied Driver lookup retains the authorized User Management list', async () => {
  // Exercise the actual client permission guard for /drivers; /users is a
  // successful fetch double. No application server or database is contacted.
  installV1Session(true);
  const calls: string[] = [];
  mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    assert.equal(String(url), '/api/v1/users');
    return Response.json([target]);
  });
  await mounted(async ({ doc }) => {
    assert.match(doc.body.textContent!, /Target User/);
    assert.deepEqual(calls, ['/api/v1/users']);
    assert.doesNotMatch(doc.body.textContent!, /Failed to load users/);
  });
});

test('Integrations failures are visible and a retry loads the diagnostics', async () => {
  setup();
  let reads = 0;
  const status = mock.method(api, 'getIntegrationStatus', async () => { if (++reads === 1) throw new ApiError('Diagnostics unavailable', 503); return integration; });
  await mounted(async ({ doc, click }) => {
    await click('Integrations');
    assert.match(doc.body.textContent!, /Diagnostics unavailable/);
    const retry = [...doc.querySelectorAll('button')].find(row => /retry/i.test(row.textContent ?? ''));
    assert.ok(retry);
    await act(async () => retry.click());
    assert.equal(status.mock.callCount(), 2);
    assert.match(doc.body.textContent!, /Email Delivery/);
    assert.doesNotMatch(doc.body.textContent!, /Diagnostics unavailable/);
  });
});

test('mock test email reports simulation without claiming an email was sent', async () => {
  setup();
  mock.method(api, 'getIntegrationStatus', async () => integration);
  const send = mock.method(api, 'sendTestEmail', async () => ({ ok: true, method: 'mock' as const, error: null }));
  await mounted(async ({ doc, click, change }) => {
    await click('Integrations');
    await change(doc.querySelector<HTMLInputElement>('input[type="email"]')!, 'recipient@example.test');
    await act(async () => doc.querySelector('form')!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(send.mock.calls[0].arguments, ['recipient@example.test']);
    assert.doesNotMatch(doc.body.textContent!, /sent successfully via MOCK/);
    assert.match(doc.body.textContent!, /no email was sent|email was not sent|no email sent/i);
  });
});

test('User Management pages eleven accounts and deletion on the last page returns to populated results', async () => {
  const users = Array.from({ length: 11 }, (_, index) => ({ ...target, id: `target-${index}`, name: `Account ${index}`, email: `account-${index}@example.test` }));
  setup(users);
  const remove = mock.method(api, 'deleteUser', async id => ({ ok: true, deleted_id: id }));
  await mounted(async ({ doc, click }) => {
    assert.equal(doc.querySelectorAll('table tbody tr').length, 10);
    assert.match(doc.querySelector('table')!.textContent!, /Account 0/);
    assert.doesNotMatch(doc.querySelector('table')!.textContent!, /Account 10/);
    await click('2');
    assert.equal(doc.querySelectorAll('table tbody tr').length, 1);
    assert.match(doc.querySelector('table')!.textContent!, /Account 10/);
    await click('Delete'); await click('Delete user');
    assert.deepEqual(remove.mock.calls[0].arguments, ['target-10', {}]);
    assert.equal(doc.querySelectorAll('table tbody tr').length, 10);
    assert.match(doc.querySelector('table')!.textContent!, /Account 0/);
    assert.doesNotMatch(doc.querySelector('table')!.textContent!, /Account 10/);
    assert.equal(doc.querySelector('[aria-current="page"]')!.getAttribute('aria-label'), 'Page 1');
  });
});

test('Access opens the account in Roles & Permissions without a second editor in User Management', async () => {
  setup();
  mock.method(api, 'getRolePermissionEditor', async () => { throw new ApiError('Candidate unavailable', 503); });
  const permissions = mock.method(api, 'getUserPermissions', async userId => ({ userId, permissions: [], effectiveScreens: ['main'], resources: ['records'],
    permissionVersion: 'legacy-review', roleDefaults: ['main'], catalog: [{ screen: 'main', label: 'Main' }], editableScreens: ['main'] }));
  await mounted(async ({ doc, click }) => {
    assert.equal(doc.querySelector('[role="menu"]'), null);
    assert.equal(doc.querySelectorAll('tbody button').length, 1);
    await click('Access');
    assert.equal(permissions.mock.callCount(), 1);
    assert.match(doc.body.textContent!, /Module Access — Target User/);
    assert.equal(doc.querySelector('[aria-label="User accounts"]'), null);
    await click('Cancel');
    assert.ok(doc.querySelector('#policy-individual-account'));
    await click('User Management');
    assert.doesNotMatch(doc.body.textContent!, /Module Access/);
    assert.equal(doc.querySelectorAll('tbody button').length, 1);
  });
});

test('account menu exposes four actions, supports keyboard navigation and dismisses without writes', async () => {
  setup();
  const updates = mock.method(api, 'updateUser', async () => target);
  const deletes = mock.method(api, 'deleteUser', async () => ({ ok: true, deleted_id: target.id }));
  await mounted(async ({ doc, click }) => {
    await click('Actions for Target User');
    const menu = doc.querySelector('[role="menu"]')!;
    assert.ok(menu);
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    assert.deepEqual(items.map(item => item.textContent?.trim()), ['Edit', 'Access', 'Deactivate', 'Delete']);
    assert.equal(doc.activeElement, items[0]);
    await act(async () => items[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    assert.equal(doc.activeElement, items[1]);
    await act(async () => items[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(doc.querySelector('[role="menu"]'), null);
    assert.equal(doc.activeElement?.getAttribute('aria-label'), 'Actions for Target User');
    await click('Actions for Target User');
    await act(async () => doc.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true })));
    assert.equal(doc.querySelector('[role="menu"]'), null);
    assert.equal(updates.mock.callCount(), 0);
    assert.equal(deletes.mock.callCount(), 0);
  });
});

test('V1 Access shortcut uses the same individual editor as Roles & Permissions', async () => {
  setup(); installV1Session();
  mock.method(api, 'getRolePermissionEditor', async role => ({ activeMode: 'V1' as const, role, contractVersion: 1 as const, catalogVersion: 1 as const,
    revision: '1', expectedVersion: version, permissions: [], catalog: [] }));
  const read = mock.method(api, 'getUserPermissionEditor', async () => ({ ...reviewedEditor(), role: target.role, contractVersion: 1, catalogVersion: 1,
    permissions: [], catalog: [] } as unknown as UserPermissionEditor));
  const legacy = mock.method(api, 'getUserPermissions', async () => { throw new Error('Legacy editor must not load'); });
  await mounted(async ({ doc, click }) => {
    await click('Access');
    assert.deepEqual(read.mock.calls[0].arguments, [target.id]);
    assert.ok(doc.querySelector('[aria-label="Target User permission editor"]'));
    assert.equal(doc.querySelector('[aria-label="User accounts"]'), null);
    assert.equal(legacy.mock.callCount(), 0);
    await click('Close editor');
    assert.ok(doc.querySelector('#policy-individual-account'));
  });
});
