import { beforeEach } from 'node:test';
import { installLegacySession } from './helpers/permissionSession';
beforeEach(() => { installLegacySession('ADMIN', 'inventory'); });
import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, type ApiSku } from '../src/api';
import InventoryView from '../src/features/inventory/InventoryView';
import SkuWorkspace from '../src/features/inventory/SkuWorkspace';
import CreateSkuForm from '../src/features/inventory/CreateSkuForm';
import StatisticalReportView from '../src/features/admin/StatisticalReportView';
import { createSkuMutationOptions, SKUS_QUERY_KEY } from '../src/api/queries/useSkusQuery';

afterEach(() => mock.restoreAll());

test('only Admin sees SKU creation', async () => {
  await withDom(async (dom, root) => {
    for (const [currentUserRole, apiRole] of [['Admin', 'ADMIN'], ['Logistics', 'LOGISTICS'], ['Sales Coordinator', 'SALES_COORDINATOR'], ['Driver', 'DRIVER'], ['TASS', 'TASS']] as const) {
      await act(async () => {
        installLegacySession(apiRole, 'inventory');
        root.render(React.createElement(InventoryView, {
          skus: [], currentUserRole, currentUserName: 'Test', onRefresh: () => {}, clearSelectedProductId: () => {},
        }));
      });
      assert.equal(dom.window.document.body.textContent!.includes('Create SKU'), currentUserRole === 'Admin', currentUserRole);
    }
  });
});

test('successful SKU creation updates catalog cache and refreshes', async () => {
  const client = new QueryClient();
  const saved = { id: 'new', sku_code: 'NEW', name: 'New SKU' } as ApiSku;
  mock.method(api, 'createSku', async () => saved);
  const invalidate = mock.method(client, 'invalidateQueries', async () => {});
  const options = createSkuMutationOptions(client);
  const result = await options.mutationFn({ sku_code: 'NEW', name: 'New SKU', category: 'A', unit_cost: 0, unit_price: 1, reorder_point: 0, description: '' });
  options.onSuccess(result);
  assert.deepEqual(client.getQueryData(SKUS_QUERY_KEY), [saved]);
  assert.equal(invalidate.mock.callCount(), 1);
  client.clear();
});

async function withDom(run: (dom: JSDOM, root: import('react-dom/client').Root) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try { await run(dom, root); } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('SKU form preserves fields on conflict and can retry successfully', async () => {
  await withDom(async (dom, root) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    let created: ApiSku | undefined;
    let calls = 0;
    const save = mock.method(api, 'createSku', async data => {
      if (++calls === 1) throw new Error('A SKU with this code already exists.');
      return { ...data, id: 'new' } as ApiSku;
    });
    try {
      await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(CreateSkuForm, { onCreated: sku => { created = sku; }, onCancel: () => {} }))));
      const inputs = [...dom.window.document.querySelectorAll('input')];
      const values = ['QA-1', 'Test SKU', '2.5', '5', '0', 'A-01'];
      for (let index = 0; index < inputs.length; index++) {
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
        await act(async () => { setter.call(inputs[index], values[index]); inputs[index].dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
      }
      async function submit() {
        await act(async () => {
          dom.window.document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
          await new Promise(resolve => setTimeout(resolve, 10));
        });
      }
      await submit();
      assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /already exists/);
      assert.equal(inputs[0].value, 'QA-1');
      assert.equal(created, undefined);
      assert.equal(dom.window.document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled, false);
      await submit();
      assert.equal(created?.id, 'new');
      assert.equal(save.mock.calls[1].arguments[0].warehouse_location, 'A-01');
      assert.equal(save.mock.calls[1].arguments[0].unit_cost, 2.5);
      assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
    } finally { client.clear(); }
  });
});

test('report failure ends loading and displays error with retry available', async () => {
  await withDom(async (dom, root) => {
    mock.method(api, 'getReportSummary', async () => { throw new Error('Report unavailable'); });
    const reportClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock.method(api, 'getRecordFilterOptions', async () => ({ drivers: [], areas: [], accountManagers: [] }));
    await act(async () => root.render(React.createElement(QueryClientProvider, { client: reportClient }, React.createElement(StatisticalReportView))));
    const button = [...dom.window.document.querySelectorAll('button')].find(item => item.textContent?.includes('Generate Report'))!;
    await act(async () => button.click());
    assert.match(dom.window.document.body.textContent!, /Report unavailable/);
    assert.equal(button.disabled, false);
    assert.match(button.textContent!, /Generate Report/);
    reportClient.clear();
  });
});

test('stock adjustment refuses fractional quantities without silently truncating or posting', async () => {
  await withDom(async (dom, root) => {
    const sku = { id: 'sku', sku_code: 'QA', name: 'QA SKU', category: 'A', unit_cost: 1, unit_price: 2, reorder_point: 0,
      description: '', created_by: 'Admin', modified_by: 'Admin', created_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-16T00:00:00Z',
      inventory: { on_hand_qty: 10, allocated_qty: 0, atp: 10, warehouse_location: 'TBD' }, recent_transactions: [],
    } as ApiSku;
    mock.method(api, 'getSku', async () => sku);
    const adjust = mock.method(api, 'adjustStock', async () => sku);
    await act(async () => root.render(React.createElement(SkuWorkspace, {
      skuId: 'sku', allSkuIds: ['sku'], currentUserRole: 'Logistics', currentUserName: 'Logistics', onBack: () => {}, onRefresh: () => {}, onNavigateToSku: () => {},
    })));
    const inventory = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Inventory')!;
    await act(async () => inventory.click());
    const input = dom.window.document.querySelector('input[type="number"]')!;
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(input, '1.5'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    const post = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.includes('Post Adjustment'))!;
    await act(async () => post.click());
    assert.equal(adjust.mock.callCount(), 0);
    assert.match(dom.window.document.body.textContent!, /non-zero whole number/);
  });
});
