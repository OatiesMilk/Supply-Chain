import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import BusinessAuditDiff, { businessAuditChanges } from '../src/features/admin/BusinessAuditDiff';
import PolicyAuditDiff from '../src/features/admin/PolicyAuditDiff';
import { api, ApiError } from '../src/api';
import { installLegacySession } from './helpers/permissionSession';

test('central audit renders useful business and account changes, without unknown JSON or HTML execution', () => {
  const previous = { reference: 'Before', linked_collection: { reference: 'secret' }, password: 'secret' };
  const next = { reference: '<script>After</script>', linked_collection: { reference: 'other secret' }, password: 'secret2' };
  assert.deepEqual(businessAuditChanges('DeliveryRecord', previous, next), [{ field: 'reference', before: 'Before', after: '<script>After</script>' }]);
  const html = renderToStaticMarkup(React.createElement(BusinessAuditDiff, { recordType: 'DeliveryRecord', previous, next }));
  assert.match(html, /Record changes \(1\)/); assert.match(html, /Before/); assert.match(html, /&lt;script&gt;After/); assert.doesNotMatch(html, /secret|<script>/);
  const account = renderToStaticMarkup(React.createElement(PolicyAuditDiff, { recordType: 'UserAuthorization', previous: { name: 'Before', email: 'before@example.test' }, next: { name: 'After', email: 'after@example.test' } }));
  assert.match(account, /name: Before/); assert.match(account, /email: before@example.test/);
  assert.equal(renderToStaticMarkup(React.createElement(BusinessAuditDiff, { recordType: 'Unknown', previous, next })), '');
});

test('account editor keeps its original baseline and draft across conflict and explicit load-latest', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const { default: AdminPanel } = await import('../src/features/admin/AdminPanel');
  installLegacySession('ADMIN', 'admin');
  const account = { id: 'target', name: 'Before', email: 'before@example.test', role: 'SALES_COORDINATOR' as const,
    is_active: true, microsoft_linked: false, created_at: '', metadata_version: 'meta:original' };
  let latest = account;
  let failReload = false;
  mock.method(api, 'getUsers', async () => { if (failReload) throw new Error('Reload unavailable'); return [latest]; }); mock.method(api, 'getDrivers', async () => []);
  mock.method(api, 'getUserPermissionEditor', async () => ({ activeMode: 'LEGACY', expectedVersion: 'fresh-policy-token' } as any));
  const update = mock.method(api, 'updateUser', async (_id, input) => {
    if (input.expectedMetadataVersion !== latest.metadata_version) throw new ApiError('This account changed.', 409);
    return { ...latest, ...input } as any;
  });
  const root = createRoot(dom.window.document.getElementById('root')!);
  const click = async (name: string) => {
    const button = [...dom.window.document.querySelectorAll('button')].find(element => element.textContent?.trim() === name);
    assert.ok(button, `Button ${name}`); await act(async () => button.click());
  };
  try {
    await act(async () => root.render(React.createElement(AdminPanel, { dashboardFilterId: null, clearDashboardFilter() {} })));
    await act(async () => dom.window.document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click());
    await click('Edit');
    const email = dom.window.document.querySelectorAll<HTMLInputElement>('tbody input')[1];
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(email, 'draft@example.test');
      email.dispatchEvent(new dom.window.Event('input', { bubbles: true })); email.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    latest = { ...account, name: 'Other admin', email: 'new@example.test', metadata_version: 'meta:new' };
    await click('Save');
    assert.equal(update.mock.calls[0].arguments[1].expectedMetadataVersion, 'meta:original');
    assert.equal(email.value, 'draft@example.test');
    await click('Close'); failReload = true; await click('Load latest account');
    assert.equal(email.value, 'draft@example.test');
    assert.ok([...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Save')?.disabled, 'failed reload keeps stale saving blocked');
    await click('Close'); failReload = false; await click('Load latest account');
    assert.equal(email.value, 'draft@example.test');
    assert.match(dom.window.document.body.textContent ?? '', /Latest saved account: Other admin/);
    await click('Close'); await click('Save');
    assert.equal(update.mock.calls[1].arguments[1].expectedMetadataVersion, 'meta:new');
    assert.equal(update.mock.calls[1].arguments[1].email, 'draft@example.test');
  } finally {
    await act(async () => root.unmount()); mock.restoreAll(); dom.window.close();
    for (const key of Object.keys(globals)) { if (original[key]) Object.defineProperty(globalThis, key, original[key]); else Reflect.deleteProperty(globalThis, key); }
  }
});
