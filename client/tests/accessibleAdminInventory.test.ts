import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { api, type ApiSku } from '../src/api';
import AdminPanel from '../src/features/admin/AdminPanel';
import InventoryView from '../src/features/inventory/InventoryView';

afterEach(() => mock.restoreAll());

test('inventory filters have associated labels and each SKU has a keyboard action', () => {
  const sku = { id: 'sku-1', sku_code: 'SKU-1', name: 'Keyboard', description: '', category: 'A', unit_cost: 10, reorder_point: 0 } as ApiSku;
  const dom = new JSDOM(renderToString(React.createElement(InventoryView, {
    skus: [sku], currentUserRole: 'Admin', currentUserName: 'Admin', onRefresh() {}, clearSelectedProductId() {},
  })));
  for (const id of ['inventory-search', 'inventory-category', 'inventory-warehouse', 'inventory-status']) {
    assert.ok(dom.window.document.querySelector(`label[for="${id}"]`)?.textContent);
    assert.ok(dom.window.document.getElementById(id));
  }
  assert.ok(dom.window.document.querySelector('button[aria-label="Open SKU SKU-1: Keyboard"]'));
  dom.window.close();
});

test('admin create fields are labelled and failed submission focuses an announced summary', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  mock.method(api, 'getUsers', async () => []);
  mock.method(api, 'getDrivers', async () => []);
  try {
    await act(async () => root.render(React.createElement(AdminPanel, { dashboardFilterId: null, clearDashboardFilter() {} })));
    const create = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.includes('Create User'))!;
    await act(async () => create.click());
    for (const input of dom.window.document.querySelectorAll('form input, form select')) {
      assert.ok(input.id);
      assert.ok(dom.window.document.querySelector(`label[for="${input.id}"]`));
    }
    await act(async () => dom.window.document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    const error = dom.window.document.getElementById('admin-create-error')!;
    assert.equal(error.getAttribute('role'), 'alert');
    assert.equal(error.getAttribute('aria-live'), 'polite');
    assert.equal(dom.window.document.activeElement, error);
    assert.equal(dom.window.document.getElementById('admin-create-email')!.getAttribute('aria-invalid'), 'true');
    assert.equal(dom.window.document.getElementById('admin-create-email')!.getAttribute('aria-describedby'), error.id);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
