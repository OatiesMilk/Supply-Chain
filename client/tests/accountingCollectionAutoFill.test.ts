import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import { installLegacySession } from './helpers/permissionSession';
import { DATA_SAMPLER_ENABLED } from '../src/utils/developmentTools';

/** Renders the Accounting Collection create form with an optional Auto Fill override. */
async function renderCreateForm(showAutoFill?: boolean) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  installLegacySession('SALES_COORDINATOR', 'accounting_collection');
  mock.method(api, 'getStatusHistoryCounts', async () => ({} as any));
  mock.method(api, 'getRecordFilterOptions', async () => ({ accountManagers: ['M. Reyes'], drivers: [], areas: ['Makati CBD'] }));
  mock.method(api, 'getAccountManagers', async () => [{ id: 'am-1', name: 'M. Reyes', is_active: true }]);
  mock.method(api, 'getPagedRecords', async () => ({ rows: [], total: 0, page: 1, limit: 25, nextCursor: null, hasMore: false }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { default: AccountingCollectionView } = await import('../src/features/accounting/AccountingCollectionView');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(AccountingCollectionView, {
    records: [], companies: [{ id: 'co-1', name: 'Army Navy Burger Burrito PH' } as any],
    currentUserRole: 'Sales Coordinator', currentUserName: 'Sales Coordinator',
    dashboardFilterId: null, clearDashboardFilter() {},
    onCreateRecord: async () => { throw new Error('not submitted'); },
    onUpdateRecord: async () => {}, onVerifyCollection: async () => {},
    ...(showAutoFill === undefined ? {} : { showAutoFill }),
  }))));
  await flush();
  const button = (text: string) => [...dom.window.document.querySelectorAll('button')].find(b => b.textContent?.includes(text));
  await act(async () => button('New Record')!.click());
  await flush();
  return {
    dom, button, flush,
    close: async () => {
      await act(async () => root.unmount()); await client.cancelQueries(); client.clear();
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
      mock.restoreAll(); dom.window.close();
      for (const key of Object.keys(values)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
    },
  };
}

test('Accounting Collection Auto Fill is hidden by default outside Vite development', async () => {
  assert.equal(DATA_SAMPLER_ENABLED, false);
  const ui = await renderCreateForm();
  try {
    assert.ok(ui.dom.window.document.querySelector('form'), 'the create form is open');
    assert.equal(ui.button('Auto Fill'), undefined, 'Auto Fill is not rendered on staging/production builds');
  } finally {
    await ui.close();
  }
});

test('Accounting Collection Auto Fill renders and fills the form only when the caller opts in', async () => {
  const ui = await renderCreateForm(true);
  try {
    const autoFill = ui.button('Auto Fill');
    assert.ok(autoFill, 'Auto Fill is rendered when showAutoFill is true');
    assert.equal(autoFill.querySelector('svg')?.getAttribute('aria-hidden'), 'true', 'the wand icon is decorative');
    await act(async () => autoFill.click());
    await ui.flush();
    const companySelect = [...ui.dom.window.document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'co-1' || o.textContent === 'Army Navy Burger Burrito PH'))!;
    assert.ok(companySelect, 'company select is rendered');
    assert.notEqual(companySelect.value, '', 'Auto Fill selects a company');
  } finally {
    await ui.close();
  }
});
