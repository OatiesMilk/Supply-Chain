import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, type RecordListFilters } from '../src/api';
import { installLegacySession } from './helpers/permissionSession';

async function fixture() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  installLegacySession('LOGISTICS', 'deliveries');
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  let download: Blob | undefined;
  let closed = false;
  URL.createObjectURL = value => { download = value as Blob; return 'blob:monthly'; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  const { createRoot } = await import('react-dom/client');
  const { default: Modal } = await import('../src/features/drivers/DriverReportModal');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const render = async () => {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Modal, {
      records: [], serverPaging: true, onClose: () => { closed = true; }, generatedByName: 'Logistics', generatedByRole: 'Logistics',
    })))); await flush();
  };
  const button = (text: string) => [...dom.window.document.querySelectorAll('button')].find(node => node.textContent?.trim() === text)!;
  const close = async () => {
    await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
    for (const key of Object.keys(globals)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
  };
  return { dom, client, flush, render, button, close, download: () => download, closed: () => closed };
}

test('monthly report counts the server month and explicitly exports later pages with no global records', async () => {
  const ui = await fixture();
  const calls: RecordListFilters[] = [];
  mock.method(api, 'getRecords', async () => { throw new Error('Full history is forbidden'); });
  mock.method(api, 'getPagedRecords', async (filters: RecordListFilters) => {
    calls.push({ ...filters });
    const row = (id: string) => ({ id, category: 'Deliveries', delivery_date: filters.dateFrom, driver: id,
      status: 'Scheduled', area: 'Makati', vehicle: '', remarks: '', driver_assistants: [] });
    return { rows: [row(filters.cursor ? 'LAST-PAGE-DRIVER' : 'FIRST-PAGE-DRIVER')], total: 101, page: 1,
      limit: filters.limit ?? 1, hasMore: !filters.cursor, nextCursor: filters.cursor ? null : 'last-page' } as any;
  });
  try {
    await ui.render();
    assert.match(ui.dom.window.document.body.textContent!, /101 delivery records found/);
    assert.equal(calls.length, 1); assert.equal(calls[0].limit, 1); assert.equal(calls[0].category, 'Deliveries');
    const format = ui.dom.window.document.querySelectorAll('select')[1];
    await act(async () => { format.value = 'csv'; format.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true })); });
    await act(async () => ui.button('Generate Report').click()); await ui.flush();
    assert.ok(ui.download());
    const csv = await ui.download()!.text();
    assert.match(csv, /FIRST-PAGE-DRIVER/); assert.match(csv, /LAST-PAGE-DRIVER/); assert.equal(ui.closed(), true);
    const exportCalls = calls.filter(call => call.limit === 100);
    assert.equal(exportCalls.length, 2); assert.equal(exportCalls[1].cursor, 'last-page');
    for (const call of exportCalls) { assert.equal(call.category, 'Deliveries'); assert.equal(call.dateFrom, calls[0].dateFrom); assert.equal(call.dateTo, calls[0].dateTo); }
  } finally { await ui.close(); }
});

test('monthly report shows count failures and retries instead of enabling export from stale counts', async () => {
  const ui = await fixture();
  let failure = true;
  mock.method(api, 'getPagedRecords', async () => {
    if (failure) throw new Error('Offline');
    return { rows: [], total: 8, page: 1, limit: 1, hasMore: false, nextCursor: null };
  });
  try {
    await ui.render();
    assert.match(ui.dom.window.document.querySelector('[role="alert"]')?.textContent ?? '', /Could not load the report count/);
    assert.equal(ui.button('Generate Report').disabled, true);
    failure = false;
    await act(async () => ui.button('Retry loading report count').click()); await ui.flush();
    assert.match(ui.dom.window.document.body.textContent!, /8 delivery records found/);
    assert.equal(ui.button('Generate Report').disabled, false);
    failure = true;
    await act(async () => { void ui.client.invalidateQueries({ queryKey: ['records', 'paged'] }); }); await ui.flush();
    assert.equal(ui.button('Generate Report').disabled, true);
    assert.match(ui.dom.window.document.body.textContent!, /Report count unavailable/);
  } finally { await ui.close(); }
});


test('monthly status trail reports failed history reads without downloading a partial trail', async () => {
  const ui = await fixture();
  mock.method(api, 'getPagedRecords', async () => ({ rows: [], total: 1, page: 1, limit: 1, hasMore: false, nextCursor: null }));
  mock.method(api, 'getAllRecordsForExport', async filters => [{ id: 'history-record', category: 'Deliveries',
    delivery_date: filters.dateFrom, driver: 'Driver', status: 'Scheduled', area: 'Makati', vehicle: '', remarks: '' }]);
  mock.method(api, 'getRecordAudit', async () => { throw new Error('History unavailable'); });
  try {
    await ui.render();
    await act(async () => ui.button('Status Trail').click());
    await act(async () => ui.button('Generate Report').click()); await ui.flush();
    assert.match(ui.dom.window.document.body.textContent!, /History unavailable/);
    assert.equal(ui.download(), undefined); assert.equal(ui.closed(), false);
  } finally { await ui.close(); }
});
