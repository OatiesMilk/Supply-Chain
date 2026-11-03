import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import AccountingCollectionView from '../src/features/accounting/AccountingCollectionView';
import { recordDetailKey } from '../src/api/queries/operationalSync';
import { installLegacySession } from './helpers/permissionSession';
import { recordMutationInputError } from '../../server/src/services/recordOperations';
import type { DeliveryRecord } from '../src/types';

const collection = (id: string, overrides: Partial<DeliveryRecord> = {}) => ({
  id, category: 'Accounting Collection', status: 'Scheduled', is_draft: 'No', priority: '2 - Moderate',
  company_id: 'company', company_name: `Customer ${id}`, reference: `REF-${id}`, remarks: '', area: 'Makati',
  account_manager: 'AM', delivery_date: '2026-10-31', item_type: 'Small Item', item_description: '',
  driver: '', driver_assistants: [], vehicle: '', amount: 100, attachments: [], output_actions_log: [],
  email_notification_sent: false, created_by: 'Sales', modified_by: 'Sales',
  created_at: '2026-10-31T01:00:00Z', modified_at: '2026-10-31T01:00:00Z', ...overrides,
} as DeliveryRecord);

async function fixture(cached?: DeliveryRecord) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  installLegacySession('TASS', 'accounting_collection');
  mock.method(api, 'getStatusHistoryCounts', async () => ({} as any));
  mock.method(api, 'getRecordFilterOptions', async () => ({ accountManagers: ['Off-page account manager'], drivers: [], areas: [] }));
  const pages = mock.method(api, 'getPagedRecords', async () => ({ rows: [collection('current-page')], total: 6001, page: 1, limit: 25, nextCursor: null, hasMore: true }));
  const all = mock.method(api, 'getRecords', async () => { throw new Error('Full history must not be fetched'); });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  if (cached) client.setQueryData(recordDetailKey(cached.id), cached);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(AccountingCollectionView, {
    records: [], companies: [], currentUserRole: 'TASS', currentUserName: 'TASS',
    selectedRecordIdFromDashboard: 'off-page', dashboardFilterId: null, clearDashboardFilter() {},
    onCreateRecord: async () => { throw new Error('Unexpected create'); }, onUpdateRecord: async () => {}, onVerifyCollection: async () => {},
  }))));
  return { dom, client, pages, all, flush,
    button: (name: string) => [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === name),
    close: async () => {
      await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
      for (const key of Object.keys(values)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
    },
  };
}

test('a collection deep link loads its own detail outside the server page and includes it in workspace navigation', async () => {
  let resolve!: (record: DeliveryRecord) => void;
  const get = mock.method(api, 'getRecord', () => new Promise<DeliveryRecord>(done => { resolve = done; }));
  const ui = await fixture();
  try {
    await ui.flush();
    assert.match(ui.dom.window.document.querySelector('[role=status]')?.textContent ?? '', /Loading record/);
    assert.equal(ui.dom.window.document.querySelector('#accounting-collection-workspace'), null);
    await act(async () => resolve(collection('off-page'))); await ui.flush();
    assert.ok(ui.dom.window.document.querySelector('#accounting-collection-workspace'));
    assert.match(ui.dom.window.document.body.textContent!, /Customer off-page/);
    assert.match(ui.dom.window.document.body.textContent!, /2\s*\/\s*2/);
    assert.equal(get.mock.calls[0].arguments[0], 'off-page');
    assert.equal(ui.all.mock.callCount(), 0);
    assert.ok(ui.pages.mock.callCount() > 0);
  } finally { await ui.close(); }
});

test('a denied collection detail refresh hides cached data and retry restores the workspace', async () => {
  let fail = true;
  const get = mock.method(api, 'getRecord', async () => { if (fail) throw new Error('Forbidden'); return collection('off-page', { company_name: 'Updated customer' }); });
  const ui = await fixture(collection('off-page', { company_name: 'Cached confidential customer' }));
  try {
    await ui.flush();
    assert.match(ui.dom.window.document.querySelector('[role=alert]')?.textContent ?? '', /Could not load this record/);
    assert.equal(ui.dom.window.document.querySelector('#accounting-collection-workspace'), null);
    assert.doesNotMatch(ui.dom.window.document.body.textContent!, /Cached confidential customer/);
    fail = false;
    await act(async () => ui.button('Retry loading record')!.click()); await ui.flush();
    assert.ok(ui.dom.window.document.querySelector('#accounting-collection-workspace'));
    assert.match(ui.dom.window.document.body.textContent!, /Updated customer/);
    assert.ok(get.mock.callCount() >= 2);
  } finally { await ui.close(); }
});

test('a collection deep link rejects another category and can return to the paged registry', async () => {
  mock.method(api, 'getRecord', async () => collection('off-page', { category: 'Deliveries', company_name: 'Wrong category customer' }));
  const ui = await fixture();
  try {
    await ui.flush();
    assert.match(ui.dom.window.document.querySelector('[role=alert]')?.textContent ?? '', /not an Accounting Collection/);
    assert.equal(ui.dom.window.document.querySelector('#accounting-collection-workspace'), null);
    assert.doesNotMatch(ui.dom.window.document.body.textContent!, /Wrong category customer/);
    await act(async () => ui.button('Back to collections')!.click()); await ui.flush();
    assert.match(ui.dom.window.document.body.textContent!, /Customer current-page/);
    assert.equal(ui.all.mock.callCount(), 0);
  } finally { await ui.close(); }
});

test('AccountingCollectionView submits a creation payload accepted by V1 server mutation input validation', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  installLegacySession('SALES_COORDINATOR', 'accounting_collection');
  mock.method(api, 'getStatusHistoryCounts', async () => ({} as any));
  mock.method(api, 'getRecordFilterOptions', async () => ({ accountManagers: ['M. Reyes'], drivers: [], areas: ['Makati CBD'] }));
  mock.method(api, 'getPagedRecords', async () => ({ rows: [], total: 0, page: 1, limit: 25, nextCursor: null, hasMore: false }));
  mock.method(api, 'getRecord', async (id: string) => collection(id));
  let submittedPayload: Record<string, unknown> | null = null;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(AccountingCollectionView, {
      records: [], companies: [{ id: 'co-1', name: 'Army Navy Burger Burrito PH' } as any],
      currentUserRole: 'Sales Coordinator', currentUserName: 'Sales Coordinator',
      dashboardFilterId: null, clearDashboardFilter() {},
      onCreateRecord: async (data) => {
        submittedPayload = data as unknown as Record<string, unknown>;
        return collection('created-coll', data);
      },
      onUpdateRecord: async () => {}, onVerifyCollection: async () => {},
    }))));
    await flush();
    const newRecordBtn = [...dom.window.document.querySelectorAll('button')].find(b => b.textContent?.includes('New Record'))!;
    await act(async () => newRecordBtn.click()); await flush();
    const autoFillBtn = [...dom.window.document.querySelectorAll('button')].find(b => b.textContent?.includes('Auto Fill'))!;
    await act(async () => autoFillBtn.click()); await flush();
    const form = dom.window.document.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
    assert.ok(submittedPayload, 'expected onCreateRecord to be called');
    assert.equal('collection_verified' in submittedPayload!, false);
    assert.equal('collection_verified_by' in submittedPayload!, false);
    assert.equal('collection_verified_at' in submittedPayload!, false);
    assert.equal(recordMutationInputError(submittedPayload, '/', 'POST'), null);
  } finally {
    await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
    for (const key of Object.keys(values)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
  }
});
