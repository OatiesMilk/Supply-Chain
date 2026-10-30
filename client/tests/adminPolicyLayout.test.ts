import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { api, ApiError, type ApiUserAdmin } from '../src/api';
import RolesPermissions, { BUILTIN_ROLES, PolicyEditor } from '../src/features/admin/PolicyEditor';
import { assignedAccountCount, filterRoles, groupPolicyCatalog, selectedPermissionCount } from '../src/features/admin/policyPresentation';
import { PERMISSION_CATALOG, defaultRolePermissions, roleActionCeiling } from '../../server/src/services/permissionCatalog';
import type { RolePermissionEditor } from '../src/types/permissionEditor';
import { useAuthStore } from '../src/store/authStore';

const users: ApiUserAdmin[] = [
  { id: 'log-1', name: 'Logistics One', email: 'log1@example.test', role: 'LOGISTICS', is_active: true, microsoft_linked: false, created_at: '' },
  { id: 'log-2', name: 'Logistics Two', email: 'log2@example.test', role: 'LOGISTICS', is_active: false, microsoft_linked: false, created_at: '' },
];
function policy(role: typeof BUILTIN_ROLES[number]): RolePermissionEditor {
  return { contractVersion: 1, catalogVersion: 1, activeMode: 'V1', role, revision: '1', expectedVersion: 'server-version',
    permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect })),
    catalog: PERMISSION_CATALOG.map(entry => ({ ...entry, canAllow: roleActionCeiling(role, entry) })) };
}
afterEach(() => mock.restoreAll());
async function mount(element: React.ReactElement, run: (doc: Document, click: (name: string) => Promise<void>, text: (selector: string, value: string) => Promise<void>, select: (selector: string, value: string) => Promise<void>) => Promise<void>) {
  const descriptors = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.confirm = () => true;
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const doc = dom.window.document;
  const click = async (name: string) => {
    const target = [...doc.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === name || button.textContent === name);
    assert.ok(target, `Button ${name} should exist`); await act(async () => target.click());
  };
  const text = async (selector: string, value: string) => {
    const input = doc.querySelector<HTMLInputElement>(selector)!; assert.ok(input, selector);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };
  const select = async (selector: string, value: string) => {
    const input = doc.querySelector<HTMLSelectElement>(selector)!; assert.ok(input, selector);
    await act(async () => { input.value = value; input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  };
  try { await act(async () => root.render(element)); await run(doc, click, text, select); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'Element', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (descriptors[key]) Object.defineProperty(globalThis, key, descriptors[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('role counts and grouping derive only from supplied accounts and catalog entries', () => {
  assert.equal(assignedAccountCount(users, 'LOGISTICS'), 2, 'inactive accounts still have an assigned role');
  assert.equal(assignedAccountCount(users, 'TASS'), 0);
  assert.equal(assignedAccountCount(users, 'TASS', false), null, 'unavailable counts are not fabricated zeroes');
  assert.deepEqual(filterRoles(BUILTIN_ROLES, '  logistics  ', 'ASSIGNED', role => assignedAccountCount(users, role)), ['LOGISTICS']);
  assert.deepEqual(filterRoles(BUILTIN_ROLES, '', 'UNASSIGNED', () => null), []);
  const catalog = policy('LOGISTICS').catalog;
  const groups = groupPolicyCatalog(catalog, 'driver', 'SCREEN');
  assert.deepEqual(groups.map(group => group.module), ['driver', 'driver_manager', 'driver_board', 'driver_dashboard']);
  assert.ok(groups.every(group => group.entries.every(entry => entry.scope === 'SCREEN')));
  const noInvented = [{ permissionKey: 'UNKNOWN:invented:ALLOW', effect: 'ALLOW' as const }];
  assert.equal(selectedPermissionCount(noInvented, catalog), 0);
});

test('overview role cards search, assignment filters and clear use real counts', async () => {
  mock.method(api, 'getRolePermissionEditor', async role => policy(role as typeof BUILTIN_ROLES[number]));
  await mount(React.createElement(RolesPermissions, { users }), async (doc, click, text, select) => {
    assert.equal(doc.querySelectorAll('article[aria-labelledby^="role-"]').length, 5);
    const logistics = doc.querySelector('article[aria-labelledby="role-LOGISTICS"]')!;
    assert.match(logistics.textContent!, /2 assigned accounts/);
    assert.match(logistics.textContent!, new RegExp(`${selectedPermissionCount(policy('LOGISTICS').permissions, policy('LOGISTICS').catalog)} permissions selected`));
    await text('#role-search', 'logistics');
    assert.equal(doc.querySelectorAll('article').length, 1);
    assert.match(doc.body.textContent!, /1 of 5 roles shown/);
    await click('Clear filters');
    await select('#role-assignment-filter', 'UNASSIGNED');
    assert.equal(doc.querySelectorAll('article').length, 4);
    await click('Clear filters');
    assert.equal(doc.querySelectorAll('article').length, 5);
    assert.equal(doc.querySelector<HTMLInputElement>('#role-search')!.value, '');
  });
});

test('view entry is read-only until explicit edit and never saves on entry', async () => {
  mock.method(api, 'getRolePermissionEditor', async role => policy(role as typeof BUILTIN_ROLES[number]));
  const save = mock.method(api, 'saveRolePermissionEditor', async () => policy('LOGISTICS'));
  await mount(React.createElement(RolesPermissions, { users }), async (doc, click) => {
    await click('View Logistics permissions');
    assert.equal(doc.querySelector<HTMLSelectElement>('select[aria-label="SCREEN:deliveries:READ"]')!.disabled, true);
    assert.ok(![...doc.querySelectorAll('button')].some(button => button.textContent === 'Save permissions'));
    assert.equal(doc.querySelector('[aria-label="Permission matrix"]')?.getAttribute('tabindex'), '0');
    assert.ok(doc.querySelector('th[scope="row"]'));
    assert.match(doc.body.textContent!, /Driver screensView, manager, board and dashboard remain separate policies/);
    const modules = [...doc.querySelectorAll('th[scope="row"]')].map(cell => cell.querySelector('span')?.textContent);
    const driverIndex = modules.indexOf('Driver View');
    assert.deepEqual(modules.slice(driverIndex, driverIndex + 4), ['Driver View', 'Driver Manager', 'Driver Board', 'Driver Dashboard']);
    await click('Edit permissions');
    assert.equal(doc.querySelector<HTMLSelectElement>('select[aria-label="SCREEN:deliveries:READ"]')!.disabled, false);
    assert.equal(save.mock.callCount(), 0);
  });
});

test('matrix module and scope filters preserve hidden draft changes and the full role save payload', async () => {
  mock.method(api, 'getRolePermissionEditor', async () => policy('LOGISTICS'));
  mock.method(useAuthStore.getState(), 'refreshPermissions', async () => {});
  const save = mock.method(api, 'saveRolePermissionEditor', async (_role, body) => ({ ...policy('LOGISTICS'), permissions: body.permissions }));
  await mount(React.createElement(PolicyEditor, { role: 'LOGISTICS', users, onClose() {} }), async (doc, click, text, select) => {
    await select('select[aria-label="SCREEN:main:READ"]', 'DENY');
    await text('#policy-module-search', 'SKU');
    assert.equal(doc.querySelector('select[aria-label="SCREEN:main:READ"]'), null);
    assert.ok(doc.querySelector('select[aria-label="SCREEN:inventory:READ"]'));
    await select('#policy-scope-filter', 'RESOURCE');
    assert.equal(doc.querySelector('select[aria-label="SCREEN:inventory:READ"]'), null);
    assert.ok(doc.querySelector('select[aria-label="RESOURCE:skus:READ"]'));
    await click('Clear module filters');
    assert.equal(doc.querySelector<HTMLSelectElement>('select[aria-label="SCREEN:main:READ"]')!.value, 'DENY');
    await click('Save permissions');
    const sent = save.mock.calls[0].arguments[1];
    assert.equal(sent.permissions.length, PERMISSION_CATALOG.length);
    assert.ok(sent.permissions.some(row => row.permissionKey === 'SCREEN:main:READ' && row.effect === 'DENY'));
    assert.equal(sent.expectedVersion, 'server-version');
  });
});

test('missing foundation has a distinct retryable read-only presentation and recovers without writes', async () => {
  let unavailable = true;
  const reads = mock.method(api, 'getRolePermissionEditor', async role => {
    if (unavailable) throw new ApiError('Permission foundation has not been initialized', 503);
    return policy(role as typeof BUILTIN_ROLES[number]);
  });
  const save = mock.method(api, 'saveRolePermissionEditor', async () => policy('ADMIN'));
  await mount(React.createElement(RolesPermissions, { users }), async (doc, click) => {
    assert.match(doc.querySelector('[role="alert"]')!.textContent!, /Permission setup is incomplete/);
    assert.match(doc.body.textContent!, /does not initialize policies or change access/);
    assert.match(doc.body.textContent!, /Permission count unavailable/);
    assert.equal(doc.querySelector<HTMLButtonElement>('button[aria-label="Edit Admin permissions"]')!.disabled, true);
    unavailable = false; await click('Retry loading policies');
    assert.equal(doc.querySelector('[role="alert"]'), null);
    assert.equal(reads.mock.callCount(), 10);
    assert.equal(doc.querySelector<HTMLButtonElement>('button[aria-label="Edit Admin permissions"]')!.disabled, false);
    assert.equal(save.mock.callCount(), 0);
  });
});

test('unavailable assignment counts and LEGACY mode never masquerade as zero users or editable policies', async () => {
  mock.method(api, 'getRolePermissionEditor', async role => ({ ...policy(role as typeof BUILTIN_ROLES[number]), activeMode: 'LEGACY' as const }));
  await mount(React.createElement(RolesPermissions, { users: [], usersError: 'Accounts unavailable' }), async (doc, click) => {
    assert.match(doc.body.textContent!, /Account count unavailable/);
    assert.doesNotMatch(doc.querySelector('article')!.textContent!, /0 assigned accounts/);
    assert.ok([...doc.querySelectorAll<HTMLButtonElement>('button[aria-label^="Edit "]')].every(button => button.disabled));
    await click('View Admin permissions');
    assert.match(doc.body.textContent!, /Candidate V1 policy only/);
    assert.ok(![...doc.querySelectorAll('button')].some(button => button.textContent === 'Edit permissions'));
  });
});
