import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import { recordDetailKey } from '../src/api/queries/operationalSync';
import { installLegacySession } from './helpers/permissionSession';
import type { DeliveryRecord } from '../src/types';

const collection = (id: string, overrides: Partial<DeliveryRecord> = {}) => ({
  id, edit_version: `record:${id}`, category: 'Deliveries', status: 'Scheduled', is_draft: 'No', priority: '2 - Moderate',
  company_id: 'company', company_name: `Customer ${id}`, reference: `REF-${id}`, remarks: '', area: 'Makati CBD',
  account_manager: 'AM', delivery_date: '2026-10-31', item_type: 'Small Item', item_description: '',
  driver: '', driver_assistants: [], vehicle: '', amount: 100, attachments: [], output_actions_log: [],
  email_notification_sent: false, created_by: 'Sales', modified_by: 'Sales',
  created_at: '2026-10-31T01:00:00Z', modified_at: '2026-10-31T01:00:00Z', ...overrides,
} as DeliveryRecord);

async function fixture(selectedId?: string) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (fn: FrameRequestCallback) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  installLegacySession('SALES_COORDINATOR', 'deliveries');
  mock.method(api, 'getStatusHistoryCounts', async () => ({} as any));
  mock.method(api, 'getRecordFilterOptions', async () => ({ accountManagers: ['Off-page account manager'], drivers: ['Off-page driver'], areas: ['Makati CBD'] }));
  const pages = mock.method(api, 'getPagedRecords', async (filters) => ({ rows: [collection(`page-${filters.page}`)], total: 6001, page: filters.page ?? 1, limit: 25, nextCursor: null, hasMore: true }));
  const all = mock.method(api, 'getRecords', async () => { throw new Error('Full history must not be fetched'); });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const updates: any[] = [];
  const { createRoot } = await import('react-dom/client');
  const { default: DeliveryRecordsView } = await import('../src/features/deliveries/DeliveryRecordsView');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(DeliveryRecordsView, {
    records: [], category: 'Deliveries', companies: [], currentUserRole: 'Sales Coordinator', currentUserName: 'Sales',
    selectedRecordIdFromDashboard: selectedId, dashboardFilterId: null, clearDashboardFilter() {},
    onCreateRecord: async () => { throw new Error('Unexpected create'); }, onUpdateRecord: async (id, data) => { updates.push({ id, ...data }); },
    outputActionConfigs: {} as any, onUpdateOutputActionConfig() {}, onVerifyCollection: async () => {},
  }))));
  return { dom, client, pages, all, updates, flush,
    button: (name: string) => [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === name),
    close: async () => {
      await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
      for (const key of Object.keys(values)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
    },
  };
}

test('bulk selection uses the current server page, keeps its original edit token, and resets on page change', async () => {
  const ui = await fixture();
  try {
    await ui.flush();
    const selectAll = () => ui.dom.window.document.querySelector<HTMLInputElement>('[aria-label="Select all records on this page"]')!;
    await act(async () => selectAll().click());
    assert.match(ui.dom.window.document.querySelector('#bulk-action-bar')!.textContent!, /1 selected/);
    ui.pages.mock.mockImplementation(async filters => ({ rows: [collection(`page-${filters.page}`, { edit_version: 'record:new' })], total: 6001,
      page: filters.page ?? 1, limit: 25, nextCursor: null, hasMore: true }));
    await act(async () => { await ui.client.invalidateQueries({ queryKey: ['records', 'paged'] }); }); await ui.flush();
    const priority = ui.dom.window.document.querySelector<HTMLSelectElement>('#bulk-priority-select')!;
    await act(async () => { priority.value = '3 - High'; priority.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true })); });
    await act(async () => ui.button('Apply')!.click()); await ui.flush();
    assert.equal(ui.updates.length, 1); assert.equal(ui.updates[0].id, 'page-1');
    assert.equal(ui.updates[0].expected_edit_version, 'record:page-1'); assert.equal(ui.updates[0].priority, '3 - High');
    await act(async () => selectAll().click());
    await act(async () => ui.dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Page 2"]')!.click()); await ui.flush();
    assert.equal(ui.dom.window.document.querySelector('#bulk-action-bar'), null);
    assert.match(ui.dom.window.document.body.textContent!, /Customer page-2/);
  } finally { await ui.close(); }
});

test('delivery filter options include values outside the current page with no global record cache', async () => {
  const ui = await fixture();
  try {
    await ui.flush();
    await act(async () => ui.dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Advanced filters"]')!.click()); await ui.flush();
    const manager = [...ui.dom.window.document.querySelectorAll<HTMLInputElement>('[role="combobox"]')].find(input => ui.dom.window.document.querySelector(`label[for="${input.id}"]`)?.textContent === 'Account Manager')!;
    assert.ok(manager); await act(async () => manager.focus()); await ui.flush();
    assert.match(ui.dom.window.document.querySelector('[role="listbox"]')!.textContent!, /Off-page account manager/);
    const area = [...ui.dom.window.document.querySelectorAll('select')].find(el => el.parentElement?.textContent?.startsWith('Area'))!;
    assert.ok([...area.options].some(option => option.value === 'Makati CBD'));
  } finally { await ui.close(); }
});

test('off-page delivery links load independently and provide error, retry and back states', async () => {
  let resolve!: (record: DeliveryRecord) => void;
  const get = mock.method(api, 'getRecord', () => new Promise<DeliveryRecord>(done => { resolve = done; }));
  const ui = await fixture('off-page');
  try {
    await ui.flush(); assert.match(ui.dom.window.document.body.textContent!, /Loading record/);
    await act(async () => resolve(collection('off-page', { category: 'RMA' }))); await ui.flush();
    assert.match(ui.dom.window.document.body.textContent!, /belongs to another category/);
    get.mock.mockImplementation(async () => { throw new Error('Forbidden'); });
    await act(async () => { await ui.client.invalidateQueries({ queryKey: recordDetailKey('off-page') }); }); await ui.flush();
    assert.match(ui.dom.window.document.body.textContent!, /Could not load this record/);
    await act(async () => ui.button('Retry loading record')!.click()); await ui.flush(); assert.ok(get.mock.callCount() >= 3);
    await act(async () => ui.button('Back to records')!.click()); await ui.flush();
    assert.match(ui.dom.window.document.body.textContent!, /Customer page-1/);
  } finally { await ui.close(); }
});

test('delivery deep links open the actual off-page workspace and include its navigation position', async () => {
  const get = mock.method(api, 'getRecord', async () => collection('off-page'));
  mock.method(api, 'getRecordAttachments', async () => []);
  const ui = await fixture('off-page');
  try {
    await ui.flush();
    assert.match(ui.dom.window.document.body.textContent!, /Customer off-page/);
    assert.match(ui.dom.window.document.body.textContent!, /2\s*\/\s*2/);
    assert.equal(get.mock.calls[0].arguments[0], 'off-page');
    assert.equal(ui.all.mock.callCount(), 0);
  } finally { await ui.close(); }
});
