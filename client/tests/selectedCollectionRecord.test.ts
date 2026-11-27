import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import { recordDetailKey } from '../src/api/queries/operationalSync';
import { installLegacySession } from './helpers/permissionSession';
import { recordMutationInputError } from '../../server/src/services/recordOperations';
import { diffAuditEntry, formatAuditValue } from '../src/features/deliveries/DeliveryRecordWorkspace';
import type { DeliveryRecord, UserRole } from '../src/types';
import type { DashboardFilterId } from '../src/utils/dashboardFilters';
import { calendarPresets } from '../src/utils/dateRangePicker';
import { manilaToday } from '../src/utils/recordLifecycle';

const collection = (id: string, overrides: Partial<DeliveryRecord> = {}) => ({
  id, category: 'Accounting Collection', status: 'Scheduled', is_draft: 'No', priority: '2 - Moderate',
  company_id: 'company', company_name: `Customer ${id}`, reference: `REF-${id}`, remarks: '', area: 'Makati',
  account_manager: 'AM', delivery_date: '2026-10-31', item_type: 'Small Item', item_description: '',
  driver: '', driver_assistants: [], vehicle: '', amount: 100, attachments: [], output_actions_log: [],
  email_notification_sent: false, created_by: 'Sales', modified_by: 'Sales',
  created_at: '2026-10-31T01:00:00Z', modified_at: '2026-10-31T01:00:00Z', ...overrides,
} as DeliveryRecord);

interface FixtureOptions {
  currentUserRole?: UserRole;
  dashboardFilterId?: DashboardFilterId | null;
  selectedRecordIdFromDashboard?: string | null;
  row?: DeliveryRecord;
  records?: DeliveryRecord[];
  failPaged?: boolean;
  onClearDashboardFilter?: () => void;
}

async function fixture(cached?: DeliveryRecord, options: FixtureOptions = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    Document: dom.window.Document, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  const { default: AccountingCollectionView } = await import('../src/features/accounting/AccountingCollectionView');
  const currentUserRole = options.currentUserRole ?? 'TASS';
  installLegacySession(currentUserRole === 'Sales Coordinator' ? 'SALES_COORDINATOR' : 'TASS', 'accounting_collection');
  mock.method(api, 'getStatusHistoryCounts', async () => ({} as any));
  mock.method(api, 'getRecordFilterOptions', async () => ({ accountManagers: ['Off-page account manager'], drivers: [], areas: [] }));
  const pagedCalls: Array<Record<string, unknown>> = [];
  const pages = mock.method(api, 'getPagedRecords', async (filters: Record<string, unknown> = {}) => {
    pagedCalls.push({ ...filters });
    if (options.failPaged) throw new Error('Paged request unavailable');
    return { rows: [options.row ?? collection('current-page')], total: 6001, page: Number(filters.page ?? 1), limit: 10, nextCursor: null, hasMore: true };
  });
  const all = mock.method(api, 'getRecords', async () => { throw new Error('Full history must not be fetched'); });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  if (cached) client.setQueryData(recordDetailKey(cached.id), cached);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const ViewHarness = () => {
    const [dashboardFilterId, setDashboardFilterId] = React.useState<DashboardFilterId | null>(options.dashboardFilterId ?? null);
    return React.createElement(AccountingCollectionView, {
      records: options.records ?? [], companies: [], currentUserRole, currentUserName: currentUserRole,
      selectedRecordIdFromDashboard: options.selectedRecordIdFromDashboard === undefined ? 'off-page' : options.selectedRecordIdFromDashboard,
      dashboardFilterId,
      clearDashboardFilter: () => { options.onClearDashboardFilter?.(); setDashboardFilterId(null); },
      onCreateRecord: async () => { throw new Error('Unexpected create'); }, onUpdateRecord: async () => {}, onVerifyCollection: async () => {},
    });
  };
  await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(ViewHarness))));
  return { dom, client, pages, all, pagedCalls, flush,
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

test('Sales Coordinator Accounting Collection filters combine in paged requests, reset paging, clear the dashboard preset, and survive detail return', async () => {
  let clearDashboardFilterCalls = 0;
  const row = collection('current-page', { status: 'Transport Complete', delivery_date: '2026-11-12' });
  const ui = await fixture(undefined, {
    currentUserRole: 'Sales Coordinator',
    dashboardFilterId: 'sc-awaiting-verification-collection',
    selectedRecordIdFromDashboard: null,
    row,
    onClearDashboardFilter: () => { clearDashboardFilterCalls += 1; },
  });
  mock.method(api, 'getRecord', async () => row);
  const setValue = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
    const prototype = element.tagName === 'SELECT' ? ui.dom.window.HTMLSelectElement.prototype : ui.dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new ui.dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  };
  const latestRequest = () => ui.pagedCalls[ui.pagedCalls.length - 1];
  try {
    await ui.flush();
    const filterGrid = ui.dom.window.document.querySelector<HTMLElement>('#accounting-collection-filters')!;
    assert.ok(filterGrid);
    assert.match(filterGrid.className, /grid-cols-1/);
    assert.match(filterGrid.className, /min-\[400px\]:grid-cols-2/);
    assert.match(filterGrid.className, /lg:grid-cols-12/);
    const searchCell = filterGrid.children[0] as HTMLElement;
    const dateCell = filterGrid.children[1] as HTMLElement;
    assert.ok(searchCell.querySelector('input[aria-label="Search accounting collection records"]'), 'search input sits in Row 1 alongside delivery dates and sort');
    assert.ok(dateCell.classList.contains('min-[400px]:col-span-2'), 'date range spans two columns on narrow tablet widths');
    assert.ok(dateCell.classList.contains('lg:col-span-5'), 'date range spans five of twelve columns on desktop');
    const awaitingSalesChip = ui.button('Transport Complete · Awaiting Sales')!;
    assert.ok(awaitingSalesChip, 'status chip uses Accounting Collection label for Transport Complete');
    assert.ok(ui.button('Complete'), 'status chip uses Accounting Collection label for Delivered');
    assert.equal(latestRequest()?.dashboard_filter, 'sc-awaiting-verification-collection');

    await act(async () => ui.dom.window.document.querySelector<HTMLButtonElement>('button[aria-label="Page 2"]')!.click());
    await ui.flush();
    assert.equal(latestRequest()?.page, 2);

    const datePickerToggle = [...ui.dom.window.document.querySelectorAll<HTMLButtonElement>('#accounting-collection-filters button[aria-haspopup="dialog"]')]
      .find(button => button.textContent?.includes('All delivery dates'))!;
    await act(async () => datePickerToggle.click());
    await ui.flush();
    assert.equal(datePickerToggle.getAttribute('aria-expanded'), 'true');
    const lastSevenDays = calendarPresets(manilaToday()).find(preset => preset.label === 'Last 7 days')!;
    const presetButton = [...ui.dom.window.document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === lastSevenDays.label);
    assert.ok(presetButton, `date preset should be visible; toggle expanded: ${datePickerToggle.getAttribute('aria-expanded')}; controls: ${datePickerToggle.getAttribute('aria-controls')}; body: ${ui.dom.window.document.body.innerHTML}`);
    await act(async () => presetButton.click());
    await act(async () => ui.button('Apply dates')!.click());
    await act(async () => awaitingSalesChip.click());
    await setValue(ui.dom.window.document.querySelector<HTMLSelectElement>('#accountingCollectionSort')!, 'oldest');
    await setValue(ui.dom.window.document.querySelector<HTMLInputElement>('input[aria-label="Search accounting collection records"]')!, 'Customer');

    await act(async () => ui.dom.window.document.querySelector<HTMLButtonElement>('button[aria-label^="Advanced filters"]')!.click());
    await ui.flush();
    const accountManager = ui.dom.window.document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await setValue(accountManager, 'Off-page account manager');
    await act(async () => ui.button('Done')!.click());
    await ui.flush();

    assert.equal(latestRequest()?.page, 1, 'changing filters returns the paged query to page one');
    assert.equal(latestRequest()?.dateFrom, lastSevenDays.from);
    assert.equal(latestRequest()?.dateTo, lastSevenDays.to);
    assert.equal(latestRequest()?.status, 'Transport Complete');
    assert.equal(latestRequest()?.dateSort, 'oldest');
    assert.equal(latestRequest()?.search, 'Customer');
    assert.equal(latestRequest()?.account_manager, 'Off-page account manager');
    assert.equal(latestRequest()?.dashboard_filter, 'sc-awaiting-verification-collection');

    await act(async () => ui.dom.window.document.querySelector<HTMLTableRowElement>('tbody tr')!.click());
    await ui.flush();
    assert.ok(ui.dom.window.document.querySelector('#accounting-collection-workspace'));
    await act(async () => ui.button('Accounting Collection')!.click());
    await ui.flush();
    assert.equal(ui.dom.window.document.querySelector<HTMLInputElement>('input[aria-label="Search accounting collection records"]')!.value, 'Customer');
    assert.equal(ui.button('Transport Complete · Awaiting Sales')!.getAttribute('aria-pressed'), 'true');
    assert.equal(ui.dom.window.document.querySelector<HTMLSelectElement>('#accountingCollectionSort')!.value, 'oldest');

    await act(async () => ui.button('Clear All Filters')!.click());
    await ui.flush();
    assert.equal(clearDashboardFilterCalls, 1);
    assert.equal(ui.dom.window.document.querySelector<HTMLInputElement>('input[aria-label="Search accounting collection records"]')!.value, '');
    assert.equal(ui.button('All')!.getAttribute('aria-pressed'), 'true');
    assert.equal(ui.dom.window.document.querySelector<HTMLSelectElement>('#accountingCollectionSort')!.value, 'default');
    assert.match(ui.dom.window.document.querySelector('#accounting-collection-filters button[aria-haspopup="dialog"]')!.textContent!, /All delivery dates/);
    assert.equal(latestRequest()?.page, 1);
    assert.equal(latestRequest()?.dateFrom, undefined);
    assert.equal(latestRequest()?.dateTo, undefined);
    assert.equal(latestRequest()?.status, undefined);
    assert.equal(latestRequest()?.dashboard_filter, undefined);
  } finally { await ui.close(); }
});

test('Accounting Collection local fallback applies inclusive date and status filters when the paged API is unavailable', async () => {
  const range = calendarPresets(manilaToday()).find(preset => preset.label === 'This month')!;
  const beforeRange = new Date(`${range.from}T00:00:00.000Z`);
  beforeRange.setUTCDate(beforeRange.getUTCDate() - 1);
  const beforeDate = beforeRange.toISOString().slice(0, 10);
  const ui = await fixture(undefined, {
    currentUserRole: 'Sales Coordinator',
    selectedRecordIdFromDashboard: null,
    failPaged: true,
    records: [
      collection('in-range', { status: 'Transport Complete', delivery_date: range.from }),
      collection('out-of-range', { status: 'Transport Complete', delivery_date: beforeDate }),
      collection('wrong-status', { status: 'Delivered', delivery_date: range.from }),
    ],
  });
  try {
    await ui.flush();
    const datePickerToggle = [...ui.dom.window.document.querySelectorAll<HTMLButtonElement>('#accounting-collection-filters button[aria-haspopup="dialog"]')]
      .find(button => button.textContent?.includes('All delivery dates'))!;
    await act(async () => datePickerToggle.click());
    await ui.flush();
    assert.equal(datePickerToggle.getAttribute('aria-expanded'), 'true');
    const monthPreset = [...ui.dom.window.document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'This month');
    assert.ok(monthPreset, `date preset should be visible; toggle expanded: ${datePickerToggle.getAttribute('aria-expanded')}; controls: ${datePickerToggle.getAttribute('aria-controls')}; body: ${ui.dom.window.document.body.innerHTML}`);
    await act(async () => monthPreset.click());
    await act(async () => ui.button('Apply dates')!.click());
    await act(async () => ui.button('Transport Complete · Awaiting Sales')!.click());
    await ui.flush();

    assert.match(ui.dom.window.document.body.textContent!, /Customer in-range/);
    assert.doesNotMatch(ui.dom.window.document.body.textContent!, /Customer out-of-range/);
    assert.doesNotMatch(ui.dom.window.document.body.textContent!, /Customer wrong-status/);
    assert.equal(ui.pagedCalls.at(-1)?.dateFrom, range.from);
    assert.equal(ui.pagedCalls.at(-1)?.dateTo, range.to);
    assert.equal(ui.pagedCalls.at(-1)?.status, 'Transport Complete');
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
  // Auto Fill picks the required Account Manager from the managed list.
  mock.method(api, 'getAccountManagers', async () => [{ id: 'am-1', name: 'M. Reyes', is_active: true }]);
  mock.method(api, 'getPagedRecords', async () => ({ rows: [], total: 0, page: 1, limit: 25, nextCursor: null, hasMore: false }));
  mock.method(api, 'getRecord', async (id: string) => collection(id));
  let submittedPayload: Record<string, unknown> | null = null;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { default: AccountingCollectionView } = await import('../src/features/accounting/AccountingCollectionView');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(AccountingCollectionView, {
      records: [], companies: [{ id: 'co-1', name: 'Army Navy Burger Burrito PH' } as any],
      currentUserRole: 'Sales Coordinator', currentUserName: 'Sales Coordinator',
      dashboardFilterId: null, clearDashboardFilter() {}, showAutoFill: true,
      onCreateRecord: async (data) => {
        submittedPayload = data as unknown as Record<string, unknown>;
        return collection('created-coll', data);
      },
      onUpdateRecord: async () => {}, onVerifyCollection: async () => {},
    }))));
    await flush();
    const newRecordBtn = [...dom.window.document.querySelectorAll('button')].find(b => b.textContent?.includes('New Record'))!;
    await act(async () => newRecordBtn.click()); await flush();
    const areaSelect = [...dom.window.document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'Makati CBD'))!;
    assert.equal(areaSelect.value, 'Makati CBD', 'default form area matches the first displayed AREA option instead of stale Carmona');
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

test('RMA audit diff suppresses unchanged recreated line items and formats changed line items without [object Object]', () => {
  const unchangedDiff = diffAuditEntry(
    { delivery_date: '2026-11-04', line_items: [{ id: 'old-row-id', sku: 'RMA-SKU-1', quantity: 2 }] },
    { delivery_date: '2026-11-03', line_items: [{ id: 'new-row-id', sku: 'RMA-SKU-1', quantity: 2 }] },
  );
  assert.deepEqual(unchangedDiff.map(r => r.label), ['Delivery Date']);

  const changedDiff = diffAuditEntry(
    { line_items: [{ id: 'old-row-id', sku: 'RMA-SKU-1', quantity: 2 }] },
    { line_items: [{ id: 'new-row-id', sku: 'RMA-SKU-1', quantity: 3 }, { id: 'new-row-2', sku: 'RMA-SKU-2', quantity: 1 }] },
  );
  assert.equal(changedDiff.length, 1);
  assert.equal(changedDiff[0].label, 'Line Items');
  assert.equal(formatAuditValue(changedDiff[0].oldVal), 'RMA-SKU-1 × 2');
  assert.equal(formatAuditValue(changedDiff[0].newVal), 'RMA-SKU-1 × 3, RMA-SKU-2 × 1');
  assert.doesNotMatch(formatAuditValue(changedDiff[0].oldVal), /\[object Object\]/);
  assert.doesNotMatch(formatAuditValue(changedDiff[0].newVal), /\[object Object\]/);
});
