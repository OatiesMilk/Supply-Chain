import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OperationalDashboard from '../src/features/dashboard/OperationalDashboard';
import { DASHBOARD_QUERY_KEY } from '../src/api/queries/useDashboardQuery';
import type { DashboardOverview } from '../src/api/dashboardOverview';

const overview: DashboardOverview = {
  role: 'ADMIN', today: '2026-10-22', updatedAt: '2026-10-22T02:00:00Z', modules: ['DELIVERY', 'RMA'],
  cards: [{ metric: 'overdue', label: 'Overdue Deliveries', count: 30, scope: 'Fixed metric scope' }],
  status: [{ status: 'Scheduled', total: 30, overdue: 3 }], missingDates: 2,
  daily: [], ages: [], attention: [], administration: null,
};

test('shared dashboard controls preserve custom-date submission, metric drill-down and proportional bars', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const requests: URL[] = [];
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (input: string | URL | Request) => {
      const url = new URL(String(input), 'http://localhost');
      requests.push(url);
      const body = url.pathname.endsWith('/overview') ? overview : {
        total: 1, pageSize: 25,
        records: [{ id: 'REC-10001', reference: 'SAP-10001', company: 'Example Company', driver: 'Unassigned', assignment: 'unresolved', category: 'DELIVERY', status: 'Scheduled', scheduledDate: '2026-10-22', screen: 'deliveries' }],
      };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData([...DASHBOARD_QUERY_KEY, 'overview', { period: 'all' }], overview);
  const navigated: string[][] = [];
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(OperationalDashboard, { onNavigate: (screen, id) => navigated.push([screen, id!]) }))));
    const document = dom.window.document;
    const bar = document.querySelector<HTMLButtonElement>('button[aria-label="Scheduled: overdue segment 3"]')!;
    assert.equal(bar.style.width, '10%');
    assert.equal(bar.classList.contains('mg-button'), false, 'Value bars must not inherit button padding or minimum width');
    assert.equal(bar.parentElement!.style.width, '75%');
    const card = document.querySelector<HTMLButtonElement>('#dashboard-kpis button')!;
    assert.match(card.textContent!, /Overdue Deliveries30Fixed metric scope/);
    await act(async () => card.click()); await settle();
    const metricRequest = requests.find(url => url.pathname.endsWith('/records'))!;
    assert.equal(metricRequest.searchParams.get('metric'), 'overdue');
    assert.equal(metricRequest.searchParams.has('period'), false, 'KPI scope stays independent of chart filters');
    assert.equal(metricRequest.searchParams.get('page'), '1');
    assert.equal(document.querySelector('dialog')!.open, true);
    const badge = document.querySelector('dialog .mg-badge')!;
    assert.equal(badge.textContent, 'Scheduled', 'Status remains readable beyond color');
    const recordLink = [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'SAP-10001')!;
    await act(async () => recordLink.click());
    assert.deepEqual(navigated, [['deliveries', 'REC-10001']]);
    assert.equal(document.querySelector('dialog')!.open, false);

    const period = document.querySelector<HTMLSelectElement>('select[aria-label="Chart scheduled dates"]')!;
    await act(async () => { period.value = 'custom'; period.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await settle();
    const from = document.querySelector<HTMLInputElement>('input[aria-label="Chart from date"]')!;
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setValue.call(from, '2026-10-19'); from.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    const apply = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Apply dates')!;
    assert.equal(apply.type, 'submit', 'Shared Button defaults must not disable form submission');
    const form = apply.form!;
    let submitted = false;
    form.addEventListener('submit', () => { submitted = true; });
    await act(async () => apply.click());
    assert.equal(submitted, true);
    await settle();
    assert.ok(requests.some(url => url.pathname.endsWith('/overview') && url.searchParams.get('period') === 'custom' && url.searchParams.get('from') === '2026-10-19' && url.searchParams.get('to') === overview.today));
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
