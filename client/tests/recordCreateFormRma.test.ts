import { beforeEach } from 'node:test';
import { installLegacySession } from './helpers/permissionSession';
beforeEach(() => { installLegacySession('TASS', 'rma'); });
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import { DATA_SAMPLER_ENABLED } from '../src/utils/developmentTools';
import { DEMO_LOCATION_FIXTURES } from '../src/utils/demoLocations';

async function fixture() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const indexedDB = { open: () => {
    const request: any = { result: { transaction: () => ({ objectStore: () => ({ index: () => ({ getAll: () => {
      const read: any = { result: [] }; queueMicrotask(() => read.onsuccess?.()); return read;
    } }) }) }) } };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), indexedDB, requestAnimationFrame: (callback: () => void) => { callback(); return 0; }, IDBKeyRange: { only: (value: unknown) => value }, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, name, { value, configurable: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const { createRoot } = await import('react-dom/client');
  const { default: CreateForm } = await import('../src/features/deliveries/RecordCreateForm');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const renderElement = async (element: React.ReactNode) => { await act(async () => root.render(React.createElement(QueryClientProvider, { client }, element))); await flush(); };
  const button = (label: string) => [...dom.window.document.querySelectorAll('button')].find(el => el.textContent?.trim() === label) as HTMLButtonElement | undefined;
  return { CreateForm, dom, flush, renderElement, button, close: async () => {
    await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
    for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'getComputedStyle', 'indexedDB', 'IDBKeyRange', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name); }
  } };
}

const rmaCompany = { id: 'company', name: 'RMA Company', contact_person: 'Contact', sap_number: 'SAP-1', sap_numbers: ['SAP-1'], address: 'Address', is_active: true, version: 1, default_account_manager: null, account_managers: [], created_at: '', updated_at: '' } as any;

test('Auto Fill is hidden by default outside Vite development and shown only when enabled', async () => {
  // Node tests never run as a Vite development build, so the Data Sampler flag is off here.
  assert.equal(DATA_SAMPLER_ENABLED, false);
  const ui = await fixture();
  mock.method(api, 'getAccountManagers', async () => []);
  const props = { category: 'RMA' as const, categoryLocked: true, companies: [rmaCompany], onSubmit: async () => { throw new Error('not called'); }, onCancel: () => {} };
  try {
    await ui.renderElement(React.createElement(ui.CreateForm, props));
    assert.equal(ui.button('Auto Fill'), undefined, 'hidden by default');
    await ui.renderElement(React.createElement(ui.CreateForm, { ...props, showAutoFill: true }));
    assert.ok(ui.button('Auto Fill'), 'shown when the caller enables it');
  } finally { await ui.close(); }
});

test('Auto Fill with showAutoFill keeps Area and Address in one demo-location fixture', async () => {
  const ui = await fixture();
  mock.method(api, 'getAccountManagers', async () => []);
  try {
    await ui.renderElement(React.createElement(ui.CreateForm, { category: 'Deliveries', categoryLocked: true, companies: [rmaCompany], onSubmit: async () => { throw new Error('not called'); }, onCancel: () => {}, showAutoFill: true }));
    await act(async () => ui.button('Auto Fill')!.click()); await ui.flush();
    const address = ui.dom.window.document.querySelector<HTMLInputElement>('input[placeholder^="Street, building, floor"]')!.value;
    const location = DEMO_LOCATION_FIXTURES.find(entry => entry.address === address);
    assert.ok(location, `Auto Fill address "${address}" comes from one demo-location fixture`);
    const values = [...ui.dom.window.document.querySelectorAll<HTMLInputElement>('input')].map(input => input.value);
    assert.ok(values.includes(location.area), 'the Area input shows the same demo location');
  } finally { await ui.close(); }
});

test('RMA create form: movement required marker, linked labels, close button name, focus rings and described errors', async () => {
  const ui = await fixture(); const doc = ui.dom.window.document;
  mock.method(api, 'getAccountManagers', async () => []);
  const submit = mock.fn(async () => { throw new Error('not called'); });
  const onCancel = mock.fn(() => {});
  try {
    await ui.renderElement(React.createElement(ui.CreateForm, { category: 'RMA', categoryLocked: true, companies: [rmaCompany], onSubmit: submit, onCancel }));
    assert.match(doc.querySelector<HTMLLabelElement>('label[for="create-rma-movement"]')!.textContent ?? '', /\*/, 'Movement method shows a required marker');
    assert.equal(doc.getElementById('create-rma-movement')!.getAttribute('aria-required'), 'true');
    assert.ok(doc.querySelector('label[for="create-rma-purchase-date"]'), 'Purchase Date label is linked to its input');
    assert.equal((doc.getElementById('create-rma-purchase-date') as HTMLInputElement).type, 'date');
    const close = doc.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    assert.ok(close, 'the close X has an accessible name');
    await act(async () => close!.click());
    assert.equal(onCancel.mock.callCount(), 1, 'the named close button still cancels');
    for (const id of ['create-rma-type', 'create-rma-movement', 'create-rma-purchase-date', 'create-rma-case-number', 'create-priority']) {
      assert.match(doc.getElementById(id)!.className, /focus:ring-2/, `${id} shows the brand focus ring`);
    }
    const form = doc.querySelector('form')!;
    const submitter = doc.querySelector<HTMLButtonElement>('button[value="submit"]')!;
    await act(async () => { form.dispatchEvent(new ui.dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter })); });
    await ui.flush();
    assert.match(doc.getElementById('create-rma-movement')!.getAttribute('aria-describedby') ?? '', /create-rma-movement-error/);
    const movementError = doc.getElementById('create-rma-movement-error')!;
    assert.equal(movementError.getAttribute('role'), 'alert');
    assert.match(movementError.textContent!, /Select a movement method before submitting/);
    assert.equal(doc.getElementById('create-rma-type')!.getAttribute('aria-describedby'), 'create-rma-type-error');
    assert.equal(doc.getElementById('create-rma-type-error')!.getAttribute('role'), 'alert');
    assert.equal(submit.mock.callCount(), 0, 'an invalid form is not submitted');
  } finally { await ui.close(); }
});

test('Movement required marker and aria-required appear only when the form can submit', async () => {
  const ui = await fixture(); const doc = ui.dom.window.document;
  mock.method(api, 'getAccountManagers', async () => []);
  const props = { category: 'RMA' as const, categoryLocked: true, companies: [rmaCompany], onSubmit: async () => { throw new Error('not called'); }, onCancel: () => {} };
  const movementLabel = () => doc.querySelector('label[for="create-rma-movement"]')!.textContent ?? '';
  try {
    await ui.renderElement(React.createElement(ui.CreateForm, props));
    assert.match(movementLabel(), /\*/, 'a TASS user can submit, so the movement is required');
    assert.equal(doc.getElementById('create-rma-movement')!.getAttribute('aria-required'), 'true');
    // Admin is read-only on RMA (moduleAccessRules ADMIN_READ_ONLY): Submit and Save as Draft are both unavailable.
    installLegacySession('ADMIN', 'rma');
    await ui.renderElement(React.createElement(ui.CreateForm, props));
    assert.doesNotMatch(movementLabel(), /\*/, 'no required marker when the form cannot submit');
    assert.equal(doc.getElementById('create-rma-movement')!.getAttribute('aria-required'), null);
    assert.equal((doc.querySelector('button[value="submit"]') as HTMLButtonElement).disabled, true);
  } finally { await ui.close(); }
});
