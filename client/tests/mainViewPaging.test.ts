import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import { installLegacySession } from './helpers/permissionSession';

test('All Records retrieves server pages beyond 5000 rows, keeps filters server-side and retries errors', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  installLegacySession('SALES_COORDINATOR', 'main');
  const requests: any[] = [];
  let reject = false;
  mock.method(api, 'getRecords', async () => { throw new Error('Main must not fetch full history'); });
  mock.method(api, 'getStatusHistoryCounts', async () => ({} as any));
  mock.method(api, 'getPagedRecords', async (filters: any) => {
    requests.push(filters);
    if (reject) throw new Error('Offline');
    return { rows: [{ id: `page-${filters.page}`, reference: `PAGE-${filters.page}`, company_name: 'Client', category: 'Deliveries', status: 'Scheduled',
      delivery_date: '2026-10-30', created_at: '2026-10-30T01:00:00Z', modified_at: '2026-10-30T01:00:00Z', driver_assistants: [] }],
      page: filters.page, limit: filters.limit, total: 6001, hasMore: filters.page < 601, nextCursor: null } as any;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { createRoot } = await import('react-dom/client');
  const { default: MainView } = await import('../src/pages/MainView');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(MainView, {
      records: [], currentUserRole: 'Sales Coordinator', currentUserName: 'Sales', onNavigate() {}, companies: [],
      onCreateRecord: async () => { throw new Error('Unexpected create'); }, effectiveScreens: new Set(['main', 'deliveries']),
    }))));
    await flush();
    assert.equal(requests[0].limit, 10); assert.equal(requests[0].page, 1);
    assert.match(dom.window.document.body.textContent!, /6001/);
    const last = dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Page 601"]');
    assert.ok(last);
    await act(async () => last.click()); await flush();
    assert.equal(requests.at(-1).page, 601); assert.match(dom.window.document.body.textContent!, /PAGE-601/);
    const draft = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Delivery For Approval')!;
    await act(async () => draft.click()); await flush();
    assert.equal(requests.at(-1).status, 'Draft'); assert.equal(requests.at(-1).page, 1);
    reject = true;
    await act(async () => { void client.invalidateQueries({ queryKey: ['records', 'paged'] }); }); await flush();
    assert.match(dom.window.document.querySelector('[role="alert"]')?.textContent ?? '', /Could not load records/);
    reject = false;
    const retry = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === 'Retry loading records')!;
    await act(async () => retry.click()); await flush();
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
  } finally {
    await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
