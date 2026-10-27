import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExcelJS from 'exceljs';
import { api, type RecordListFilters } from '../src/api';
import { routeSlipPeriod, type RouteSlipPeriodSelection } from '../src/utils/routeSlipPeriod';
import type { DeliveryRecord } from '../src/types';

const filters: RecordListFilters = {
  category: 'Deliveries', status: 'Scheduled', search: 'matching', driver: 'Alex', area: 'Makati',
  region: 'Luzon', subregion: 'NCR', account_manager: 'Casey', dashboard_filter: 'log-assigned-today',
};
const row = (id: string, day: string): DeliveryRecord => ({
  id, company_name: id, company_id: 'c1', reference: id, delivery_date: day, driver: 'Alex One',
  driver_assistants: [], status: 'Scheduled', priority: '2 - Moderate', area: 'Makati', category: 'Deliveries',
  account_manager: 'Casey', vehicle: 'Van', item_type: 'Unit', remarks: '',
} as DeliveryRecord);

async function withMenus(run: (dom: JSDOM, state: { current: RouteSlipPeriodSelection; blob?: Blob; calls: RecordListFilters[] }) => Promise<void>, actualView = false) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Document: dom.window.Document, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL, oldFetch = globalThis.fetch;
  const state: { current: RouteSlipPeriodSelection; blob?: Blob; calls: RecordListFilters[] } = { current: { mode: 'range', dateFrom: '2026-10-27', dateTo: '2026-10-29' }, calls: [] };
  URL.createObjectURL = blob => { state.blob = blob as Blob; return 'blob:route-slip'; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function() {};
  globalThis.fetch = async () => new Response('', { status: 404 });
  const pages = mock.method(api, 'getPagedRecords', async (query: RecordListFilters) => {
    state.calls.push({ ...query });
    if (actualView && query.limit !== 100) return { rows: [row('CACHEDONLY', '2026-10-27')], hasMore: false, nextCursor: null, total: 101, page: 1, limit: 25 };
    return query.cursor ? { rows: [row('LATEPAGE', '2026-10-29')], hasMore: false, nextCursor: null, total: 101, page: 2, limit: 100 }
      : { rows: Array.from({ length: 100 }, (_, index) => row(`MATCH${index}`, '2026-10-27')), hasMore: true, nextCursor: 'next-page', total: 101, page: 1, limit: 100 };
  });
  const { default: RouteSlipMenu } = await import('../src/components/RouteSlipMenu');
  const { default: ExportMenu } = await import('../src/components/ExportMenu');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [selection, setSelection] = useState(state.current);
    state.current = selection;
    const fields = { selection, onChange: setSelection };
    const fetchRecords = () => api.getAllRecordsForExport({ ...filters, ...routeSlipPeriod(selection) });
    return React.createElement(React.Fragment, null,
      React.createElement(RouteSlipMenu, { ...fields, driverFilter: 'Alex', filename: 'menu', preparedBy: 'Marc', fetchRecords }),
      React.createElement(ExportMenu, { rows: [], columns: [], sheetName: 'Delivery', filename: 'menu', pdfTitle: 'Deliveries',
        meta: { reportName: 'Deliveries', generatedByName: 'Marc', generatedByRole: 'Logistics' },
        routeSlipPeriodFields: fields, routeSlipProps: { records: [], ...routeSlipPeriod(selection), preparedBy: 'Marc' },
        fetchExportData: async () => ({ rows: [], routeSlipProps: { records: await fetchRecords(), ...routeSlipPeriod(selection), preparedBy: 'Marc' } }),
      }),
    );
  }
  try {
    if (actualView) {
      const { default: DeliveryRecordsView } = await import('../src/features/deliveries/DeliveryRecordsView');
      const cached = { ...row('CACHEDONLY', '2026-10-27'), area: 'Makati CBD' };
      await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(DeliveryRecordsView, {
        category: 'Deliveries', records: [cached], companies: [], currentUserRole: 'Logistics', currentUserName: 'Marc',
        onCreateRecord: async () => cached, onUpdateRecord: async () => {}, onVerifyCollection: async () => {},
        outputActionConfigs: {} as any, onUpdateOutputActionConfig: () => {}, dashboardFilterId: 'log-assigned-today', clearDashboardFilter: () => {},
      }))));
    } else await act(async () => root.render(React.createElement(Harness)));
    await run(dom, state);
  } finally {
    await act(async () => root.unmount());
    client.clear(); pages.mock.restore(); globalThis.fetch = oldFetch;
    URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

const button = (dom: JSDOM, text: string) => [...dom.window.document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === text)!;
const click = async (node: HTMLButtonElement) => { assert.ok(node); await act(async () => node.click()); };
async function choose(dom: JSDOM, value: string) {
  const node = dom.window.document.querySelector<HTMLSelectElement>('fieldset select')!;
  await act(async () => { node.value = value; node.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
}
async function inputDate(dom: JSDOM, index: number, value: string) {
  const node = dom.window.document.querySelectorAll<HTMLInputElement>('fieldset input')[index];
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(node, value); node.dispatchEvent(new dom.window.Event('input', { bubbles: true })); node.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
}
async function waitDownload(state: { blob?: Blob }) {
  await act(async () => {
    for (let tries = 0; !state.blob && tries < 100; tries++) await new Promise(resolve => setTimeout(resolve, 20));
  });
  assert.ok(state.blob, 'generated an actual download');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await state.blob!.arrayBuffer()) as any);
  const values: string[] = [];
  workbook.eachSheet(sheet => sheet.eachRow(record => record.eachCell(cell => values.push(String(cell.value)))));
  return values.join('\n');
}

test('both menus share day/from/range values, reject invalid ranges and restore keyboard focus on Escape', async () => {
  await withMenus(async (dom, state) => {
    const trigger = button(dom, 'Route Slip');
    await click(trigger);
    assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('fieldset select'));
    await inputDate(dom, 1, '2026-10-26');
    assert.equal(button(dom, 'Excel (Current)').disabled, true);
    assert.match(dom.window.document.querySelector('fieldset [role="status"]')!.textContent!, /earlier/);
    assert.equal(state.calls.length, 0);
    await choose(dom, 'from');
    assert.equal(state.current.dateTo, '');
    assert.equal(button(dom, 'Excel (Current)').disabled, false);
    await act(async () => dom.window.document.querySelector('fieldset select')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
    assert.equal(dom.window.document.activeElement, trigger);
    await click(button(dom, 'Export'));
    assert.equal(dom.window.document.querySelector<HTMLSelectElement>('fieldset select')!.value, 'from');
    assert.match(dom.window.document.querySelector('fieldset')!.textContent!, /From 27 Oct 2026 onward/);
    await choose(dom, 'day');
    await inputDate(dom, 0, '');
    assert.equal(button(dom, 'Route Slip — Excel').disabled, true);
    assert.equal(button(dom, 'Export CSV').disabled, false);
    await inputDate(dom, 0, '2026-10-28');
    assert.equal(button(dom, 'Route Slip — Excel').disabled, false);
    assert.equal(state.current.dateFrom, '2026-10-28');
    assert.equal(state.current.dateTo, '2026-10-28');
  });
});

test('dedicated and general export paths include later pages and retain every active filter', async () => {
  await withMenus(async (dom, state) => {
    for (const entry of ['dedicated', 'general'] as const) {
      state.blob = undefined; state.calls = [];
      await click(button(dom, entry === 'dedicated' ? 'Route Slip' : 'Export'));
      await click(button(dom, entry === 'dedicated' ? 'Excel (Current)' : 'Route Slip — Excel'));
      const text = await waitDownload(state);
      assert.match(text, /MATCH0/);
      assert.match(text, /LATEPAGE/);
      assert.match(text, /Period: 27 Oct 2026 – 29 Oct 2026/);
      assert.equal(state.calls.length, 2);
      for (const query of state.calls) {
        for (const [key, value] of Object.entries(filters)) assert.equal(query[key as keyof RecordListFilters], value, key);
        assert.equal(query.dateFrom, '2026-10-27'); assert.equal(query.dateTo, '2026-10-29');
        assert.equal(query.limit, 100);
      }
      assert.equal(state.calls[0].cursor, undefined);
      assert.equal(state.calls[1].cursor, 'next-page');
    }
  });
});


test('the actual DeliveryRecordsView fetches every page with its selected filters instead of exporting cached rows', async () => {
  await withMenus(async (dom, state) => {
    const setInput = async (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    };
    const setSelect = async (select: HTMLSelectElement, value: string) => {
      await act(async () => { select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    };
    await setSelect(dom.window.document.getElementById('recordStatusFilter') as HTMLSelectElement, 'Scheduled');
    await setInput(dom.window.document.querySelector<HTMLInputElement>('[aria-label="Search delivery records"]')!, 'matching');
    await click(dom.window.document.querySelector<HTMLButtonElement>('[aria-label^="Advanced filters"]')!);
    const locationSelect = (label: string) => [...dom.window.document.querySelectorAll('label')].find(node => node.textContent?.trim().startsWith(label))!.querySelector('select')!;
    await setSelect(locationSelect('Region'), 'Metro Manila (NCR)');
    await setSelect(locationSelect('Subregion'), 'South Manila Belt');
    await setSelect(locationSelect('Area'), 'Makati CBD');
    const personnelInput = (label: string) => {
      const element = [...dom.window.document.querySelectorAll('label')].find(node => node.textContent?.trim() === label)!;
      return dom.window.document.getElementById(element.htmlFor) as HTMLInputElement;
    };
    await setInput(personnelInput('Driver'), 'Alex');
    await setInput(personnelInput('Account Manager'), 'Casey');
    await click(button(dom, 'Done'));
    await click(button(dom, 'Route Slip'));
    await choose(dom, 'range');
    await inputDate(dom, 0, '2026-10-27');
    await inputDate(dom, 1, '2026-10-29');
    state.calls = [];
    await click(button(dom, 'Excel (Current)'));
    const text = await waitDownload(state);
    assert.match(text, /LATEPAGE/);
    assert.match(text, /MATCH0/);
    assert.equal(text.includes('CACHEDONLY'), false);
    const exportCalls = state.calls.filter(query => query.limit === 100);
    assert.equal(exportCalls.length, 2);
    const expected = { ...filters, region: 'Metro Manila (NCR)', subregion: 'South Manila Belt', area: 'Makati CBD', dateFrom: '2026-10-27', dateTo: '2026-10-29' };
    for (const query of exportCalls) for (const [key, value] of Object.entries(expected)) assert.equal(query[key as keyof RecordListFilters], value, key);
    assert.equal(exportCalls[1].cursor, 'next-page');
  }, true);
});
