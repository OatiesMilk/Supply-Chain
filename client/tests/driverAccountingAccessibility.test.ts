import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { manilaToday } from '../src/utils/recordLifecycle';
import type { DeliveryRecord } from '../src/types';

async function withDom(run: (dom: JSDOM, render: (child: React.ReactNode) => Promise<void>) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  // This fixture contains no staged files; preserve the real upload-before-save path.
  const readRequest = (result: unknown) => { const request = { result, onsuccess: null as null | (() => void) }; queueMicrotask(() => request.onsuccess?.()); return request; };
  const indexedDB = { open: () => readRequest({ transaction: () => ({ objectStore: () => ({ index: () => ({ getAll: () => readRequest([]) }) }) }) }) };
  const globals = { indexedDB, IDBKeyRange: { only: (value: unknown) => value }, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), fetch: async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } }) };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  // JSDOM lacks top-layer focus/inertness; browser regressions cover those behaviors.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, gcTime: 0 } } });
  const render = async (child: React.ReactNode) => { await act(async () => root.render(React.createElement(QueryClientProvider, { client }, child))); };
  try { await run(dom, render); } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const key of Object.keys(globals)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
  }
}
function button(document: Document, name: string) {
  const found = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === name);
  assert.ok(found, `Button ${name} exists`); return found;
}
function change(dom: JSDOM, input: HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = input.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

test('accounting connects labels/errors, focuses invalid Submit and preserves company-only drafts', async () => {
  await withDom(async (dom, render) => {
    const { default: AccountingCollectionView } = await import('../src/features/accounting/AccountingCollectionView');
    const saved: Partial<DeliveryRecord>[] = [];
    await render(React.createElement(AccountingCollectionView, {
      records: [], companies: [{ id: 'example', name: 'Example Company', sap_number: 'SAP-EXAMPLE', address: 'Example Address', contact_person: 'Example Contact', created_at: '2026-10-23T00:00:00Z' }], currentUserRole: 'Sales Coordinator', currentUserName: 'Example Staff',
      onCreateRecord: async data => { saved.push(data); return { ...data, id: 'REC-DRAFT' } as DeliveryRecord; },
      onUpdateRecord: async () => {}, onVerifyCollection: async () => {}, dashboardFilterId: null, clearDashboardFilter: () => {},
    }));
    const document = dom.window.document;
    await act(async () => button(document, 'New Record').click());
    const form = document.querySelector('form')!;
    assert.equal(form.querySelectorAll('label').length, 11);
    for (const label of form.querySelectorAll('label')) { assert.ok(label.control, `${label.textContent} targets a control`); assert.equal((label.control as HTMLInputElement).required, false); }
    const picker = form.querySelector<HTMLInputElement>('input[type="file"]')!;
    assert.equal(picker.hidden || picker.classList.contains('hidden'), false);
    assert.match(document.getElementById(picker.getAttribute('aria-describedby')!)!.textContent!, /10 MB/);
    await act(async () => button(document, 'Submit').click());
    await new Promise(resolve => setTimeout(resolve, 10));
    const invalid = [...form.querySelectorAll('[aria-invalid="true"]')];
    assert.equal(invalid.length, 4); assert.equal(document.activeElement, invalid[0]);
    for (const control of invalid) { const error = document.getElementById(control.getAttribute('aria-describedby')!); assert.equal(error?.getAttribute('role'), 'alert'); assert.match(error!.textContent!, /required/i); }
    assert.equal(saved.length, 0);
    await act(async () => change(dom, form.querySelector('select')!, 'Example Company'));
    await act(async () => button(document, 'Save as Draft').click());
    assert.equal(saved.length, 1); assert.equal(saved[0].status, 'Draft'); assert.equal(saved[0].company_id, 'example'); assert.equal(saved[0].reference, ''); assert.equal(saved[0].amount, null);
  });
});

test('driver requires remarks, blocks pending dismissal and keeps failed updates available for retry', async () => {
  await withDom(async (dom, render) => {
    const { default: DriverDashboard } = await import('../src/features/dashboard/DriverDashboard');
    let release!: () => void; let fail = true;
    const updates: Partial<DeliveryRecord>[] = [];
    const record = { id: 'REC-DRIVER', reference: 'DRIVER-REF', company_name: 'Example Company', category: 'Deliveries', delivery_date: manilaToday(), status: 'Scheduled', allowed_statuses: ['Pending'], is_draft: 'No' } as DeliveryRecord;
    await render(React.createElement(DriverDashboard, {
      records: [record], currentUserName: 'Example Driver', onLogout: () => {}, dataLoading: false,
      onUpdateRecord: async (_id, update) => { updates.push(update); await new Promise<void>(resolve => { release = resolve; }); if (fail) throw new Error('Example save failed'); },
    }));
    const document = dom.window.document;
    await act(async () => button(document, 'Pending').click());
    const dialog = [...document.querySelectorAll('dialog')].find(node => node.open)!;
    assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent, 'Confirm Status');
    assert.match(document.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent!, /DRIVER-REF.*Pending/);
    assert.equal(button(document, 'Confirm').disabled, true);
    const remarks = dialog.querySelector('textarea')!;
    assert.equal(remarks.labels?.[0].htmlFor, remarks.id);
    assert.match(document.getElementById(remarks.getAttribute('aria-describedby')!)!.textContent!, /history/);
    await act(async () => change(dom, remarks, '   Vehicle needs inspection   '));
    assert.equal(button(document, 'Confirm').disabled, false, 'Remarks enable confirmation');
    await act(async () => button(document, 'Confirm').click());
    assert.equal(updates.length, 1); assert.equal((updates[0] as Partial<DeliveryRecord> & { status_remarks?: string }).status_remarks, 'Vehicle needs inspection');
    assert.equal(button(document, 'Cancel').disabled, true); assert.equal(remarks.disabled, true);
    await act(async () => dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true })));
    assert.equal(dialog.open, true);
    await act(async () => release());
    assert.equal(dialog.open, true); assert.match(dialog.querySelector('[role="alert"]')!.textContent!, /Example save failed/);
    assert.equal(remarks.value, '   Vehicle needs inspection   ');
    fail = false;
    await act(async () => button(document, 'Confirm').click());
    await act(async () => release());
    assert.equal(updates.length, 2); assert.equal(dialog.open, false);
    await act(async () => button(document, 'Pending').click());
    assert.equal(dialog.querySelector('textarea')!.value, '');
    await act(async () => dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true })));
    assert.equal(dialog.open, false);
  });
});
