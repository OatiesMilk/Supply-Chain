import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import type { Supplier, SupplierCategory, CreateSupplierInput } from '../src/types/supplier';
import CreateSupplierForm from '../src/features/suppliers/CreateSupplierForm';
import SuppliersView, { filterSuppliers, supplierExportRows } from '../src/features/suppliers/SuppliersView';
import SupplierWorkspace from '../src/features/suppliers/SupplierWorkspace';
import { SupplierCategoryManager, SupplierCategoryEditor } from '../src/features/suppliers/SupplierCategories';
import { businessAuditChanges } from '../src/features/admin/BusinessAuditDiff';
import { installLegacySession } from './helpers/permissionSession';

const categories: SupplierCategory[] = [{ id: 'a', name: 'Hardware', is_active: true, version: 1 },
  { id: 'b', name: 'Custom', is_active: true, version: 1 }, { id: 'c', name: 'Retired', is_active: false, version: 1 }];
const supplier = { id: 's', name: 'Supplier', category: 'Hardware', categories: [categories[0]], version: 1,
  contact_person: '', email: '', phone: '', city: '', address: '', created_by: '', modified_by: '',
  created_at: '2026-11-05T00:00:00Z', modified_at: '2026-11-05T00:00:00Z' } as Supplier;
beforeEach(() => { installLegacySession('ADMIN', 'suppliers'); mock.method(api, 'getSupplierCategories', async () => categories); });
afterEach(() => mock.restoreAll());

async function withDom(run: (dom: JSDOM, render: (node: React.ReactNode) => Promise<void>, client: QueryClient) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(['suppliers', 'categories'], categories);
  const render = async (node: React.ReactNode) => { await act(async () => { root.render(React.createElement(QueryClientProvider, { client }, node)); }); };
  try { await run(dom, render, client); } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
}
const click = async (element: HTMLElement) => { await act(async () => { element.click(); }); };
async function input(dom: JSDOM, element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function submit(dom: JSDOM) {
  await act(async () => { dom.window.document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
}

test('supplier creation preserves input and multiple selections on failure, then closes only after successful retry', async () => {
  await withDom(async (dom, render) => {
    let attempts = 0, closed = 0;
    const save = mock.fn(async (_data: CreateSupplierInput) => { if (++attempts === 1) throw new Error('Please retry'); });
    await render(React.createElement(CreateSupplierForm, { onSave: save, onClose: () => { closed++; } }));
    const name = dom.window.document.querySelector<HTMLInputElement>('input[type="text"]')!;
    await input(dom, name, 'New supplier');
    const choices = [...dom.window.document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    assert.equal(choices.length, 2, 'inactive categories cannot be newly selected');
    await click(choices[0]); await click(choices[1]); await submit(dom);
    assert.equal(closed, 0); assert.equal(name.value, 'New supplier');
    assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /Please retry/);
    assert.ok(choices.every(choice => choice.checked));
    await submit(dom); assert.equal(closed, 1);
    assert.deepEqual(save.mock.calls[1].arguments[0].category_ids, ['a', 'b']);
  });
});

test('a category deactivated while a create draft is open stays visible for removal and retry', async () => {
  await withDom(async (dom, render, client) => {
    const save = mock.fn(async (_data: CreateSupplierInput) => {});
    await render(React.createElement(CreateSupplierForm, { onSave: save, onClose: () => {} }));
    await input(dom, dom.window.document.querySelector('input')!, 'Draft');
    const checkboxes = [...dom.window.document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await click(checkboxes[0]); await click(checkboxes[1]);
    await act(async () => {
      client.setQueryData(['suppliers', 'categories'], categories.map(category => category.id === 'a' ? { ...category, is_active: false } : category));
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.match(dom.window.document.body.textContent!, /Hardware.*inactive — remove before saving/);
    await submit(dom); assert.equal(save.mock.callCount(), 0);
    assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /Remove inactive/);
    await click(dom.window.document.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    await submit(dom);
    assert.deepEqual(save.mock.calls[0].arguments[0].category_ids, ['b']);
    assert.equal(dom.window.document.querySelector<HTMLInputElement>('input[type="text"]')!.value, 'Draft');
  });
});

test('a pending supplier save cannot be double submitted or dismissed', async () => {
  await withDom(async (dom, render) => {
    let finish!: () => void;
    const save = mock.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    let closed = 0;
    await render(React.createElement(CreateSupplierForm, { onSave: save, onClose: () => { closed++; } }));
    await input(dom, dom.window.document.querySelector('input')!, 'Supplier');
    await click(dom.window.document.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    await submit(dom); await submit(dom);
    assert.equal(save.mock.callCount(), 1);
    assert.ok([...dom.window.document.querySelectorAll('button')].every(button => button.disabled));
    assert.equal(closed, 0);
    await act(async () => finish()); assert.equal(closed, 1);
  });
});

test('catalog and existing-assignment controls are visible only to Admin', async () => {
  await withDom(async (dom, render) => {
    mock.method(api, 'getSupplierPickupCounts', async () => []);
    for (const role of ['ADMIN', 'LOGISTICS', 'SALES_COORDINATOR', 'DRIVER', 'TASS'] as const) {
      await act(async () => { installLegacySession(role, 'suppliers'); });
      await render(React.createElement(SuppliersView, { suppliers: [], deliveryRecords: [], currentUserRole: role, onCreateSupplier: async () => {} }));
      assert.equal(dom.window.document.body.textContent!.includes('Manage Categories'), role === 'ADMIN');
      await render(React.createElement(SupplierWorkspace, { supplier, allSupplierIds: ['s'], deliveryRecords: [], onBack: () => {}, onNavigateToSupplier: () => {} }));
      assert.equal(dom.window.document.body.textContent!.includes('Edit Categories'), role === 'ADMIN');
    }
  });
});

test('category filter matches stable IDs and export contains every label including inactive assignments', () => {
  const multi = { ...supplier, categories: [categories[0], categories[2]] };
  assert.deepEqual(filterSuppliers([multi], 'c'), [multi]);
  assert.deepEqual(filterSuppliers([multi], 'b'), []);
  assert.deepEqual(filterSuppliers([{ ...supplier, categories: [] }], '__uncategorized').length, 1);
  assert.equal(supplierExportRows([multi], new Map([['s', 2]]))[0].categories, 'Hardware; Retired');
});

test('category manager preserves duplicate-name draft and invalidates supplier/category cache after save', async () => {
  await withDom(async (dom, render, client) => {
    let attempts = 0;
    mock.method(api, 'createSupplierCategory', async () => { if (++attempts === 1) throw new Error('Category already exists'); return categories[1]; });
    const invalidation = mock.method(client, 'invalidateQueries', async () => {});
    await render(React.createElement(SupplierCategoryManager, { onClose: () => {} }));
    const name = dom.window.document.querySelector('input')!;
    await input(dom, name, 'Custom'); await submit(dom);
    assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /already exists/);
    assert.equal(name.value, 'Custom'); await submit(dom);
    assert.equal(name.value, '');
    assert.deepEqual(invalidation.mock.calls[0].arguments[0], { queryKey: ['suppliers'] });
  });
});

test('assignment editor retains inactive choices and original version across background refetches', async () => {
  await withDom(async (dom, render) => {
    const save = mock.method(api, 'updateSupplierCategories', async () => { throw new Error('Supplier changed'); });
    let closed = false;
    const initial = { ...supplier, categories: [categories[0], categories[2]] };
    const props = { supplier: initial, onClose: () => { closed = true; } };
    await render(React.createElement(SupplierCategoryEditor, props));
    await render(React.createElement(SupplierCategoryEditor, { ...props, supplier: { ...initial, version: 2 } }));
    await click([...dom.window.document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')][1]);
    await submit(dom);
    assert.equal(save.mock.calls[0].arguments[1].expected_version, 1);
    assert.deepEqual(save.mock.calls[0].arguments[1].category_ids, ['a', 'c', 'b']);
    assert.equal(closed, false);
    assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /Supplier changed/);
  });
});

test('supplier audit diff shows category IDs and label snapshots, and catalog active changes', () => {
  const changes = businessAuditChanges('Supplier', { categories: [{ id: 'a', name: 'Before' }] }, { categories: [{ id: 'b', name: 'After', secret: 'ignored' }] });
  assert.equal(changes[0].before, 'Before (a)'); assert.equal(changes[0].after, 'After (b)');
  assert.equal(businessAuditChanges('SupplierCategory', { is_active: true }, { is_active: false })[0].after, 'false');
});
