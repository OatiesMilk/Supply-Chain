import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
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
  const dispatch = mock.method(api, 'sendNotificationEmail', async () => new Promise<{ ok: boolean; sent: number; failed: number; mocked: number; skipped: number }>(resolve => { resolveDispatch = resolve; }));
  try {
    await act(async () => root.render(React.createElement(RecordCreateForm, {
      category: 'Deliveries', categoryLocked: true,
      companies: [{ id: 'company', name: 'Company', sap_number: 'SAP-1', address: 'Address', contact_person: 'Contact', created_at: '' }],
      onSubmit: data => { submitted = data; calls++; return new Promise(resolve => { resolveCreate = resolve; }); },
      onCancel: () => {}, outputActionConfigs: DEFAULT_OUTPUT_ACTIONS, onAfterSubmit: value => { banner = value; },
    })));
    const autoFill = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.includes('Auto Fill'))!;
    await act(async () => autoFill.click());
    const form = dom.window.document.querySelector('form')!;
    const submitter = dom.window.document.querySelector<HTMLButtonElement>('button[value="submit"]')!;
    await act(async () => { form.dispatchEvent(new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter })); });
    assert.equal(calls, 1); assert.equal(dispatch.mock.callCount(), 0, 'email cannot be requested before a record exists');
    await act(async () => resolveCreate({ ...submitted, id: 'persisted-record', created_by: 'Sales', modified_by: 'Sales' }));
    assert.equal(dispatch.mock.callCount(), 1);
    assert.match(dom.window.document.body.textContent!, /Record ID: persisted-record/, 'saved identity remains visible while outputs are pending');
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
