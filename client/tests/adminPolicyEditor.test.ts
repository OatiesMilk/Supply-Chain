import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { api, ApiError, type ApiUserAdmin } from '../src/api';
import { PolicyEditor, dependencyIssues, policyChanges } from '../src/features/admin/PolicyEditor';
import { auditChanges } from '../src/features/admin/PolicyAuditDiff';
import { PERMISSION_CATALOG, defaultRolePermissions, roleActionCeiling } from '../../server/src/services/permissionCatalog';
import { evaluatePermissions } from '../../server/src/services/permissionEvaluator';
import type { RolePermissionEditor, UserPermissionEditor } from '../src/types/permissionEditor';
import { useAuthStore } from '../src/store/authStore';
import { installLegacySession } from './helpers/permissionSession';

const user: ApiUserAdmin = { id: 'target', name: 'Sales User', email: 'user@example.test', role: 'SALES_COORDINATOR', is_active: true, microsoft_linked: false, created_at: '' };
function roleEditor(role = user.role): RolePermissionEditor {
  return { contractVersion: 1, catalogVersion: 1, activeMode: 'V1', role, revision: '1', expectedVersion: `v1:${'a'.repeat(64)}`,
    permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect })),
    catalog: PERMISSION_CATALOG.map(p => ({ ...p, canAllow: roleActionCeiling(role, p) })) };
}
function userEditor(): UserPermissionEditor {
  const policy = roleEditor();
  const overrides = [{ permissionKey: 'SCREEN:dashboard:READ', effect: 'ALLOW' as const }, { permissionKey: 'SCREEN:admin:READ', effect: 'DENY' as const }];
  return { ...policy, userId: user.id, rolePolicyRevision: '1', authorizationRevision: '1', conversionStatus: 'CONVERTED', permissions: overrides, roleDefaults: policy.permissions,
    snapshot: evaluatePermissions({ userId: user.id, role: user.role, isActive: true, authorizationRevision: '1', rolePolicy: { role: user.role, revision: '1', catalogVersion: 1, permissions: policy.permissions }, overrides }) };
}
afterEach(() => { mock.restoreAll(); useAuthStore.getState().setAuthUser(null); });
async function mounted(run: (doc: Document, select: (key: string, value: string) => Promise<void>, click: (text: string) => Promise<void>) => Promise<void>, role = user.role, individual = true, onClose = () => {}) {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div><button id="leave">Other tab</button>', { url: 'http://localhost' });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.confirm = () => true;
  // JSDOM checks state and callbacks; browser tests cover native modal behavior.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const doc = dom.window.document;
  const click = async (text: string) => {
    const button = [...doc.querySelectorAll('button')].find(b => b.textContent === text);
    assert.ok(button, text); await act(async () => button.click());
  };
  const select = async (key: string, value: string) => {
    const input = doc.querySelector<HTMLSelectElement>(`select[aria-label="${key}"]`)!;
    assert.ok(input); await act(async () => { input.value = value; input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  };
  try {
    await act(async () => root.render(React.createElement(PolicyEditor, { role, user: individual ? user : undefined, onClose })));
    await run(doc, select, click);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'Element', 'IS_REACT_ACT_ENVIRONMENT']) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
  }
}
function setup() {
  mock.method(api, 'getRolePermissionEditor', async () => roleEditor());
  mock.method(api, 'getUserPermissionEditor', async () => userEditor());
}
test('individual saves retain explicit equal Allow/Deny and Inherit removes only the selected exception', async () => {
  setup(); const saves = mock.method(api, 'saveUserPermissionEditor', async (_id, body) => ({ ...userEditor(), permissions: body.permissions }));
  await mounted(async (_doc, select, click) => {
    await select('SCREEN:main:READ', 'DENY');
    await click('Save permissions');
    const rows = saves.mock.calls[0].arguments[1].permissions;
    assert.ok(rows.some(p => p.permissionKey === 'SCREEN:dashboard:READ' && p.effect === 'ALLOW'));
    assert.ok(rows.some(p => p.permissionKey === 'SCREEN:admin:READ' && p.effect === 'DENY'));
    await select('SCREEN:dashboard:READ', 'INHERIT'); await click('Save permissions');
    assert.ok(!saves.mock.calls[1].arguments[1].permissions.some(p => p.permissionKey === 'SCREEN:dashboard:READ'));
  });
});
test('409 retains draft and blocks resubmission until refreshed policy is explicitly reviewed', async () => {
  setup(); let reads = 0;
  mock.method(api, 'getUserPermissionEditor', async () => {
    const first = ++reads === 1;
    return { ...userEditor(), expectedVersion: first ? 'old-version' : 'new-version', rolePolicyRevision: first ? '1' : '9',
      roleDefaults: userEditor().roleDefaults.map(row => !first && row.permissionKey === 'SCREEN:main:READ' ? { ...row, effect: 'DENY' as const } : row) };
  });
  const saves = mock.method(api, 'saveUserPermissionEditor', async (_id, body) => { if (body.expectedVersion === 'old-version') throw new ApiError('Changed', 409); return { ...userEditor(), permissions: body.permissions }; });
  await mounted(async (doc, select, click) => {
    await select('SCREEN:main:READ', 'DENY'); await click('Save permissions');
    assert.equal(doc.querySelector<HTMLSelectElement>('select[aria-label="SCREEN:main:READ"]')!.value, 'DENY');
    const saveButton = () => [...doc.querySelectorAll('button')].find(b => b.textContent === 'Save permissions')!;
    assert.equal(saveButton().disabled, true);
    await click('Refresh for conflict review'); assert.equal(saveButton().disabled, true);
    assert.match(doc.body.textContent!, /latest role policy revision: 9/);
    assert.match(doc.body.textContent!, /SCREEN:main:READ: ALLOW → DENY/);
    assert.match(doc.body.textContent!, /Review latest server effective decisions/);
    await act(async () => doc.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    assert.equal(saveButton().disabled, false); await click('Save permissions');
    assert.equal(saves.mock.calls[1].arguments[1].expectedVersion, 'new-version');
    assert.ok(saves.mock.calls[1].arguments[1].permissions.some(p => p.permissionKey === 'SCREEN:main:READ' && p.effect === 'DENY'));
  });
});
test('reset requires confirmation then a versioned save; cancel never writes', async () => {
  setup(); const resets = mock.method(api, 'resetUserPermissionEditor', async () => ({ ...userEditor(), permissions: [] }));
  await mounted(async (_doc, select, click) => {
    await select('SCREEN:main:READ', 'DENY'); await click('Cancel changes'); assert.equal(resets.mock.callCount(), 0);
    await click('Reset exceptions'); assert.equal(resets.mock.callCount(), 0); await click('Save permissions');
    assert.deepEqual(resets.mock.calls[0].arguments, [user.id, userEditor().expectedVersion]);
  });
});
test('server ceilings forbid Allow but permit harmless Deny, protected Admin controls are locked, LEGACY is read-only', async () => {
  setup();
  await mounted(async doc => {
    const restricted = doc.querySelector<HTMLSelectElement>('select[aria-label="SCREEN:admin:READ"]')!;
    assert.equal(restricted.disabled, false); assert.equal(restricted.querySelector<HTMLOptionElement>('option[value="ALLOW"]')!.disabled, true);
    assert.equal(restricted.querySelector<HTMLOptionElement>('option[value="DENY"]')!.disabled, false);
  });
  mock.method(api, 'getRolePermissionEditor', async () => roleEditor('ADMIN'));
  await mounted(async doc => assert.equal(doc.querySelector<HTMLSelectElement>('select[aria-label="RESOURCE:users:WRITE"]')!.disabled, true), 'ADMIN', false);
  mock.method(api, 'getRolePermissionEditor', async () => ({ ...roleEditor(), activeMode: 'LEGACY' }));
  mock.method(api, 'getUserPermissionEditor', async () => ({ ...userEditor(), activeMode: 'LEGACY' }));
  await mounted(async doc => { assert.match(doc.body.textContent!, /Candidate V1 policy only/); assert.equal(doc.querySelector<HTMLSelectElement>('select[aria-label="SCREEN:main:READ"]')!.disabled, true); });
});
test('unsaved navigation offers Stay and Discard and replays only the confirmed action', async () => {
  setup();
  const saves = mock.method(api, 'saveUserPermissionEditor', async () => userEditor());
  const resets = mock.method(api, 'resetUserPermissionEditor', async () => userEditor());
  await mounted(async (doc, select, click) => {
    window.confirm = () => assert.fail('Leaving must not use a blocking browser confirmation');
    await select('SCREEN:main:READ', 'DENY');
    let navigations = 0; doc.getElementById('leave')!.addEventListener('click', () => { navigations++; });
    await act(async () => doc.getElementById('leave')!.click());
    assert.equal(navigations, 0);
    assert.match(doc.querySelector('dialog[open]')!.textContent!, /Discard unsaved permission changes/);
    await click('Stay');
    assert.equal(doc.querySelector('dialog[open]'), null);
    assert.equal(doc.querySelector<HTMLSelectElement>('select[aria-label="SCREEN:main:READ"]')!.value, 'DENY');
    const event = new window.Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
    await act(async () => doc.getElementById('leave')!.click());
    await act(async () => doc.querySelector('dialog[open]')!.dispatchEvent(new window.Event('cancel', { cancelable: true })));
    assert.equal(doc.querySelector('dialog[open]'), null);
    assert.equal(navigations, 0);
    await act(async () => doc.getElementById('leave')!.click());
    await click('Discard changes');
    assert.equal(navigations, 1);
    assert.equal(doc.querySelector('dialog[open]'), null);
    const afterDiscard = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterDiscard); assert.equal(afterDiscard.defaultPrevented, false);
    assert.equal(saves.mock.callCount(), 0);
    assert.equal(resets.mock.callCount(), 0);
  });
  const rows = [{ permissionKey: 'SCREEN:customers:WRITE', effect: 'ALLOW' as const }];
  assert.equal(dependencyIssues(roleEditor().catalog, rows).length, 1); assert.equal(rows.length, 1);
});
test('dirty account Close keeps the draft on Stay and discards without saving; reopening uses saved exceptions', async () => {
  setup();
  mock.method(api, 'getUserPermissionEditor', async () => ({ ...userEditor(), permissions: [] }));
  const saves = mock.method(api, 'saveUserPermissionEditor', async () => userEditor());
  const resets = mock.method(api, 'resetUserPermissionEditor', async () => userEditor());
  let closes = 0;
  await mounted(async (doc, select, click) => {
    window.confirm = () => assert.fail('Close must not use a blocking browser confirmation');
    await select('SCREEN:main:READ', 'DENY');
    await click('Close editor'); assert.equal(closes, 0);
    await click('Stay'); assert.equal(closes, 0);
    assert.equal(doc.activeElement?.textContent, 'Close editor');
    assert.equal(doc.querySelector<HTMLSelectElement>('select[aria-label="SCREEN:main:READ"]')!.value, 'DENY');
    await click('Close editor'); await click('Discard changes'); assert.equal(closes, 1);
  }, user.role, true, () => { closes++; });
  await mounted(async (doc, _select, click) => {
    assert.equal(doc.querySelector<HTMLSelectElement>('select[aria-label="SCREEN:main:READ"]')!.value, 'INHERIT');
    assert.match(doc.body.textContent!, /0 individual exceptions/);
    await click('Close editor'); assert.equal(closes, 2);
    assert.equal(doc.querySelector('dialog[open]'), null);
  }, user.role, true, () => { closes++; });
  assert.equal(saves.mock.callCount(), 0);
  assert.equal(resets.mock.callCount(), 0);
});
test('role policy Close uses the same Stay/Discard guard without saving', async () => {
  setup();
  const saves = mock.method(api, 'saveRolePermissionEditor', async () => roleEditor());
  let closes = 0;
  await mounted(async (_doc, select, click) => {
    await select('SCREEN:main:READ', 'DENY');
    await click('Close editor'); await click('Stay'); assert.equal(closes, 0);
    await click('Close editor'); await click('Discard changes'); assert.equal(closes, 1);
    assert.equal(saves.mock.callCount(), 0);
  }, user.role, false, () => { closes++; });
});
test('safe audit diff ignores arbitrary and unknown stored fields while showing intent changes', () => {
  const before = { permissions: [{ permissionKey: 'SCREEN:main:READ', effect: 'ALLOW' as const }], role: 'TASS' };
  const after = { permissions: [{ permissionKey: 'SCREEN:main:READ', effect: 'DENY' as const }, { permissionKey: 'secret', effect: 'ALLOW' as const }], role: 'LOGISTICS', password: 'never render' };
  assert.deepEqual(auditChanges(before, after), ['SCREEN:main:READ: ALLOW → DENY', 'role: TASS → LOGISTICS']);
  assert.deepEqual(policyChanges([], [{ permissionKey: 'SCREEN:main:READ', effect: 'DENY' }]), [{ key: 'SCREEN:main:READ', before: 'INHERIT', after: 'DENY' }]);
});
test('dedicated reset endpoint sends only version contract fields and no permissions array', async () => {
  installLegacySession();
  const requests = mock.method(globalThis, 'fetch', async () => Response.json(userEditor()));
  await api.resetUserPermissionEditor('target/slash', 'version-token');
  assert.equal(requests.mock.calls[0].arguments[0], '/api/users/target%2Fslash/permissions/reset');
  const options = requests.mock.calls[0].arguments[1]!;
  assert.equal(options.method, 'POST');
  assert.deepEqual(JSON.parse(String(options.body)), { contractVersion: 1, catalogVersion: 1, expectedVersion: 'version-token' });
});
