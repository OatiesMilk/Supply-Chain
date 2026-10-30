import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import DriverBoard from '../src/features/drivers/DriverBoard';
import { installLegacySession } from './helpers/permissionSession';
import type { DeliveryRecord } from '../src/types';

const record = (id: string) => ({ id, category: 'Deliveries', status: 'Scheduled', is_draft: 'No', priority: '2 - Moderate',
  reference: id, company_name: id, delivery_date: '2026-10-01', driver: 'Driver One', driver_assistants: [], area: 'Makati',
  account_manager: 'AM', created_at: '2026-10-01T01:00:00Z', modified_at: '2026-10-01T01:00:00Z' } as DeliveryRecord);

test('live dispatch paging reaches records beyond 5000 without a second all-records request', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  installLegacySession('LOGISTICS', 'driver_board');
  const all = mock.method(api, 'getRecords', async () => { throw new Error('All-history reads are forbidden'); });
  const pages = mock.method(api, 'getPagedRecords', async filters => ({ rows: [record(filters.page === 241 ? 'TAIL-AFTER-5000' : 'FIRST')], total: 6001, page: filters.page ?? 1, limit: 25, nextCursor: null, hasMore: filters.page !== 241 }));
  mock.method(api, 'getDriverOverview', async () => ({ drivers: [{ name: 'Driver One', active: 6001, completed: 0 }], areas: ['Makati'], unassigned: 0,
    dashboard: { today: 0, remaining: 6001, completed: 0, rma_active: 0, rma_completed: 0 } }));
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(DriverBoard, {
      serverPaging: true, records: [], onNavigate() {}, onUpdateRecord: async () => {}, currentUserName: 'Logistics',
    })))); await flush();
    assert.match(dom.window.document.body.textContent!, /6001/);
    assert.match(dom.window.document.body.textContent!, /FIRST/);
    const last = dom.window.document.querySelector<HTMLButtonElement>('button[aria-label="Page 241"]'); assert.ok(last);
    await act(async () => last.click()); await flush();
    assert.match(dom.window.document.body.textContent!, /TAIL-AFTER-5000/);
    assert.equal(pages.mock.calls.at(-1)?.arguments[0].page, 241);
    assert.equal(pages.mock.calls.at(-1)?.arguments[0].view, 'dispatch');
    assert.equal(all.mock.callCount(), 0);
  } finally {
    await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
    for (const key of Object.keys(values)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
  }
});
