import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import { DEFAULT_OUTPUT_ACTIONS } from '../src/outputActions';
import { installLegacySession } from './helpers/permissionSession';
import type { DeliveryRecord } from '../src/types';

test('creation outputs wait for persistence and report failure without creating another record', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const originals = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => { callback(); return 0; }, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const { default: RecordCreateForm } = await import('../src/features/deliveries/RecordCreateForm');
  const root = createRoot(dom.window.document.getElementById('root')!);
  installLegacySession('SALES_COORDINATOR', 'deliveries');
  let resolveCreate!: (value: DeliveryRecord) => void;
  let submitted: any; let calls = 0; let banner: any;
  let resolveDispatch!: (value: { ok: boolean; sent: number; failed: number; mocked: number; skipped: number }) => void;
  mock.method(api, 'getAccountManagers', async () => [{ id: 'am-1', name: 'P. Soriano', is_active: true }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const dispatch = mock.method(api, 'sendNotificationEmail', async () => new Promise<{ ok: boolean; sent: number; failed: number; mocked: number; skipped: number }>(resolve => { resolveDispatch = resolve; }));
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(RecordCreateForm, {
      category: 'Deliveries', categoryLocked: true, showAutoFill: true,
      companies: [{ id: 'company', name: 'Company', sap_number: 'SAP-1', sap_numbers: ['SAP-1'], address: 'Address', contact_person: 'Contact', is_active: true, version: 1, default_account_manager: null, account_managers: [], created_at: '', updated_at: '' }],
      onSubmit: data => { submitted = data; calls++; return new Promise(resolve => { resolveCreate = resolve; }); },
      onCancel: () => {}, outputActionConfigs: DEFAULT_OUTPUT_ACTIONS, onAfterSubmit: value => { banner = value; },
    }))));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const autoFill = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.includes('Auto Fill'))!;
    await act(async () => autoFill.click());
    const form = dom.window.document.querySelector('form')!;
    const submitter = dom.window.document.querySelector<HTMLButtonElement>('button[value="submit"]')!;
    await act(async () => { form.dispatchEvent(new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter })); });
    assert.equal(calls, 1); assert.equal(dispatch.mock.callCount(), 0, 'email cannot be requested before a record exists');
    await act(async () => resolveCreate({ ...submitted, id: 'persisted-record', record_no: 'DEL-26-00042', created_by: 'Sales', modified_by: 'Sales' }));
    assert.equal(dispatch.mock.callCount(), 1);
    assert.match(dom.window.document.body.textContent!, /Record No\.: DEL-26-00042/, 'saved record number remains visible while outputs are pending');
    assert.equal(dom.window.document.querySelector('button[value="submit"]'), null);
    await act(async () => resolveDispatch({ ok: false, sent: 0, failed: 1, mocked: 0, skipped: 0 }));
    assert.deepEqual(dispatch.mock.calls[0].arguments[0], { recordId: 'persisted-record', trigger: 'Record Created', recipients: ['AM', 'LOGISTICS', 'TASS'] });
    assert.equal(calls, 1, 'output failure must not resubmit the saved record');
    assert.equal(banner.recordId, 'persisted-record');
    assert.match(banner.lines.join(' '), /Email: 1 failed/);
    assert.doesNotMatch(banner.lines.join(' '), /Email sent|notified/);
  } finally {
    await act(async () => root.unmount()); mock.restoreAll(); dom.window.close();
    for (const name of Object.keys(globals)) { if (originals[name]) Object.defineProperty(globalThis, name, originals[name]); else Reflect.deleteProperty(globalThis, name); }
  }
});

test('record form offers company SAP numbers as quick picks and lists assigned Account Managers first', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const originals = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => { callback(); return 0; }, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const { default: RecordCreateForm } = await import('../src/features/deliveries/RecordCreateForm');
  const root = createRoot(dom.window.document.getElementById('root')!);
  installLegacySession('SALES_COORDINATOR', 'deliveries');
  const ams = [{ id: 'am-1', name: 'P. Soriano', is_active: true }, { id: 'am-3', name: 'B. Reyes', is_active: true }, { id: 'am-4', name: 'Z. Cruz', is_active: true }];
  mock.method(api, 'getAccountManagers', async () => ams);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const doc = dom.window.document;
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(RecordCreateForm, {
      category: 'Deliveries', categoryLocked: true, showAutoFill: true,
      companies: [{ id: 'bdo', name: 'BDO Unibank', sap_number: 'SAP-BDO-1', sap_numbers: ['SAP-BDO-1', 'SAP-BDO-2'], address: '', contact_person: '',
        is_active: true, version: 1, default_account_manager: ams[1], account_managers: [ams[1], ams[0]], created_at: '', updated_at: '' }],
      onSubmit: async data => ({ ...data, id: 'r' } as any), onCancel: () => {}, outputActionConfigs: DEFAULT_OUTPUT_ACTIONS,
    }))));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(doc.querySelector('[aria-label="Company SAP numbers"]'), null, 'no quick picks before a company is chosen');
    const autoFill = [...doc.querySelectorAll('button')].find(button => button.textContent?.includes('Auto Fill'))!;
    await act(async () => autoFill.click());
    const picks = doc.querySelector('[aria-label="Company SAP numbers"]')!;
    assert.deepEqual([...picks.querySelectorAll('button')].map(button => button.textContent), ['SAP-BDO-1', 'SAP-BDO-2']);
    const reference = doc.querySelector<HTMLInputElement>('input[placeholder="e.g., SAP-88231"]')!;
    await act(async () => [...picks.querySelectorAll('button')][1].click());
    assert.equal(reference.value, 'SAP-BDO-2', 'a click fills the free-text reference');
    assert.match(doc.body.textContent!, /Assigned Account Managers for BDO Unibank: B\. Reyes, P\. Soriano — choose one or override/);
    const amInput = [...doc.querySelectorAll<HTMLInputElement>('input')].find(input => input.value === 'B. Reyes')!;
    assert.ok(amInput, 'Auto Fill prefers an assigned Account Manager');
    await act(async () => amInput.click());
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(amInput, '');
    await act(async () => { amInput.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    const listbox = [...doc.querySelectorAll('[role="listbox"]')].at(-1)!;
    assert.match(listbox.textContent!, /Assigned to BDO Unibank/);
    assert.match(listbox.textContent!, /Other Account Managers/);
    assert.ok(listbox.textContent!.indexOf('B. Reyes') < listbox.textContent!.indexOf('Z. Cruz'), 'assigned AMs come first; others stay selectable');
  } finally {
    await act(async () => root.unmount()); mock.restoreAll(); dom.window.close();
    for (const name of Object.keys(globals)) { if (originals[name]) Object.defineProperty(globalThis, name, originals[name]); else Reflect.deleteProperty(globalThis, name); }
  }
});
