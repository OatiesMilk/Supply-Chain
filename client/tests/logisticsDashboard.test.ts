import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import LogisticsDashboard from '../src/features/dashboard/LogisticsDashboard';
import { matchesDashboardFilter } from '../src/utils/dashboardFilters';
import type { ApiDashboardOverview, ApiDashboardStats } from '../src/api';
import type { DeliveryRecord } from '../src/types';

const h = React.createElement;
const stats = { role: 'LOGISTICS', assigned_today: 5, unassigned_count: 2, completed_today: 0, on_hold_rescheduled: 3 } as Extract<ApiDashboardStats, { role: 'LOGISTICS' }>;
const request = (id: string, extra: Partial<DeliveryRecord> = {}) => ({ id, category: 'RMA', status: 'Scheduled', is_draft: 'No', company_name: 'Client Co', area: 'Makati',
  delivery_date: '2026-10-30', rma_reference: `RMA-${id}`, driver: '', rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'PENDING', ...extra }) as DeliveryRecord;
const overview: ApiDashboardOverview = { role: 'LOGISTICS', generated_at: '2026-11-10T00:27:00Z', record_total: 50, status_totals: {},
  counts: { rma_requests: 6001, 'log-transport-requests': 6001, 'log-flags': 5, 'log-unassigned': 2, 'log-on-hold': 1, 'log-rescheduled': 2 },
  transport_requests_by_type: { DELIVERY: 4000, RMA: 2000, SALES_ORDERS: 1 },
  record_previews: { rma_requests: [request('r1'), request('r2', { driver: 'Ana Cruz' })], rma_attention: [], transport_requests: [
    request('r1'), { id: 'D-9', category: 'Deliveries', status: 'On-Hold', company_name: 'Acme', area: 'Pasig', delivery_date: '2026-10-29', driver: 'Old Name', driver_id: null } as DeliveryRecord,
    { id: 'S-9', category: 'Sales Orders', status: 'Scheduled', company_name: 'Gamma', area: '', delivery_date: '2026-10-31', driver: '' } as DeliveryRecord,
  ] },
  drivers_out: [{ driver_id: 'drv-ana', driver: 'Ana Cruz', total: 7001, in_transit: 2, records: [
    { id: 'D-1', category: 'Deliveries', status: 'In Transit', time_in: '2026-11-12T01:00:00.000Z', company_name: 'Acme' } as DeliveryRecord,
    { id: 'R-1', category: 'RMA', status: 'Scheduled', rma_transport_status: 'IN_TRANSIT', company_name: 'Beta' } as DeliveryRecord,
    { id: 'P-1', category: 'Procurement Pick-up', status: 'Scheduled', company_name: 'Supplier Co' } as DeliveryRecord,
  ] }], drivers_out_total: 6001, drivers_out_jobs_total: 9000, unverified_collections_amount: 0 };
const html = (props: Record<string, unknown> = {}) => renderToStaticMarkup(h(LogisticsDashboard, { stats, overview, onNavigate() {}, ...props } as any));
const text = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test('tiles use the shared contract with calm zero states', () => {
  const markup = html();
  assert.equal(markup.split('data-kpi-tile').length - 1, 4 + 3);
  assert.match(markup, /aria-label="No driver assigned, 2 jobs\. Show transport requests"/);
  assert.match(markup, /aria-label="Unassigned records, 6,001 jobs\. Show transport requests"/, 'the Needs attention tile equals the Transport requests count');
  assert.match(text(markup), /Jobs of every type with no driver yet/);
  assert.match(text(markup), /Needs a driver/); assert.match(text(markup), /None yet today/);
  assert.match(html({ stats: { ...stats, unassigned_count: 0 } }), /All assigned/);
});

test('tiles show skeletons while stats load and never fall back to guessed counts', () => {
  const markup = html({ stats: null });
  assert.doesNotMatch(markup, /aria-label="Assigned to drivers today,/);
  assert.ok((markup.match(/aria-busy="true"/g) ?? []).length >= 4);
});

test('transport requests panel lists every job type with full totals and per-type links (AC6)', () => {
  const markup = html(); const t = text(markup);
  assert.match(t, /Transport requests 6001 requests/); assert.match(t, /Showing 3 of 6001 requests/);
  assert.match(t, /View 4000 Deliveries/); assert.match(t, /View 2000 RMA/); assert.match(t, /View 1 Sales Order/);
  assert.doesNotMatch(t, /View \d+ Procurement Pickups?/, 'types with no requests get no link');
  assert.match(t, /RMA-r1 RMA Client Co/); assert.match(t, /D-9 Delivery Acme/); assert.match(t, /S-9 Sales Order Gamma/);
  assert.doesNotMatch(markup, /<th[^>]*>Driver<\/th>/, 'every row has no driver, so there is no Driver column');
  assert.doesNotMatch(t, /Needs driver|Old Name/);
  assert.match(markup, /aria-label="Open RMA RMA-r1 for Client Co"/); assert.match(markup, /aria-label="Open Delivery D-9 for Acme"/);
  assert.doesNotMatch(t, /RMA transport requests/);
});

test('drivers panel keeps complete totals and a view-all link', () => {
  const t = text(html());
  assert.match(t, /6001 drivers/); assert.match(t, /7001 active jobs · 2 in transit/); assert.match(t, /\+6998 more jobs/); assert.match(t, /View all 6001 assigned Drivers/);
});

test('driver cards label every job type, mark jobs in transit and key by driver id', () => {
  const markup = html();
  const t = text(markup);
  assert.match(t, /Delivery D-1 · Acme In transit/); assert.match(t, /RMA R-1 · Beta In transit/); assert.match(t, /Procurement Pickup P-1 · Supplier Co/);
  assert.doesNotMatch(t, /Supplier Co In transit/);
  assert.match(markup, /aria-label="Open Delivery D-1 for Acme, in transit"/);
  assert.match(markup, /aria-label="Open Procurement Pickup P-1 for Supplier Co"/);
  const one = { ...overview, drivers_out: [{ ...overview.drivers_out[0], total: 1, in_transit: 0, records: [overview.drivers_out[0].records[2]] }], drivers_out_total: 1 };
  const single = text(html({ overview: one }));
  assert.match(single, /1 driver /); assert.match(single, /1 active job/); assert.doesNotMatch(single, /in transit|more job/);
});

test('two drivers with the same name stay two cards', () => {
  const twin = { ...overview.drivers_out[0], driver_id: 'drv-ana-2' };
  const markup = html({ overview: { ...overview, drivers_out: [overview.drivers_out[0], twin], drivers_out_total: 2 } });
  assert.equal((markup.match(/title="Ana Cruz"/g) ?? []).length, 2);
});

test('record links without screen access render as text', () => {
  const markup = html({ canAccess: (screen: string) => screen !== 'procurement_pickup' });
  assert.doesNotMatch(markup, /aria-label="Open Procurement Pickup P-1/); assert.match(text(markup), /P-1 · Supplier Co/);
  assert.match(markup, /aria-label="Open Delivery D-1 for Acme, in transit"/);
  const noSales = html({ canAccess: (screen: string) => screen !== 'sales_orders' });
  assert.doesNotMatch(noSales, /aria-label="Open Sales Order S-9/); assert.match(text(noSales), /S-9 Sales Order Gamma/);
  assert.doesNotMatch(text(noSales), /View 1 Sales Order/); assert.match(text(noSales), /1 Sales Order/);
  assert.match(noSales, /aria-label="Open Delivery D-9 for Acme"/);
});

test('empty states are calm', () => {
  const empty = html({ overview: { ...overview, counts: { ...overview.counts, rma_requests: 0, 'log-transport-requests': 0 }, transport_requests_by_type: {}, record_previews: { rma_requests: [], rma_attention: [], transport_requests: [] }, drivers_out: [], drivers_out_total: 0 } });
  assert.match(text(empty), /No transport requests need dispatch/); assert.match(text(empty), /No drivers are out for delivery today/);
  assert.doesNotMatch(empty, /<table/);
});

test('overview failure keeps tiles and shows retry in each panel', () => {
  const markup = html({ overview: undefined, overviewStatus: 'error', onRetryOverview() {} });
  assert.match(markup, /aria-label="Assigned to drivers today, 5 deliveries/);
  assert.equal((markup.match(/role="alert"/g) ?? []).length, 3);
});

test('without access to a screen its tiles and links have no button', () => {
  const markup = html({ canAccess: (screen: string) => screen === 'deliveries' });
  assert.match(markup, /aria-label="No driver assigned, 2/);
  assert.doesNotMatch(markup, /View 2000 RMA/); assert.match(markup, /View 4000 Deliveries/); assert.doesNotMatch(markup, /View all 6001 assigned Drivers/);
  assert.doesNotMatch(markup, /aria-label="Open RMA RMA-r1/); assert.match(markup, /aria-label="Open Delivery D-9 for Acme"/);
  const none = html({ canAccess: () => false });
  assert.doesNotMatch(none, /<button[^>]*aria-label="[^"]*View list/);
  assert.match(none, /<button[^>]*aria-label="No driver assigned, 2 jobs\. Show transport requests"/, 'scrolling to the panel needs no screen access');
});

test('copy has no em dash, uppercase labels or pulse', () => {
  const markup = html();
  assert.equal(markup.includes('—'), false);
  assert.doesNotMatch(markup, /animate-pulse|font-black|tracking-wider|tracking-\[/);
  assert.match(markup, /<h1[^>]*>Logistics dashboard/);
});

test('view-all and row actions pass the right filters', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const dom = new JSDOM('<div id="root"></div>');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  const calls: unknown[][] = [];
  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => { root.render(h(LogisticsDashboard, { stats, overview, onNavigate: (...args: unknown[]) => { calls.push(args); } })); });
  const click = (el: Element) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  const buttons = [...dom.window.document.querySelectorAll('button')];
  await click(buttons.find(b => b.textContent?.includes('View 2000 RMA'))!);
  await click(buttons.find(b => b.textContent?.includes('View 1 Sales Order'))!);
  await click(buttons.find(b => b.getAttribute('aria-label')?.startsWith('Completed today'))!);
  await click(buttons.find(b => b.textContent?.includes('View all 5 flags'))!);
  await click(buttons.find(b => b.getAttribute('aria-label') === 'Open RMA RMA-r1 for Client Co')!);
  await click(buttons.find(b => b.getAttribute('aria-label') === 'Open Delivery D-9 for Acme')!);
  assert.deepEqual(calls, [['rma', undefined, 'log-transport-requests'], ['sales_orders', undefined, 'log-transport-requests'], ['deliveries', undefined, 'log-completed-today'], ['deliveries', undefined, 'log-flags'], ['rma', 'r1'], ['deliveries', 'D-9']]);
  await act(async () => { root.unmount(); });
});

test('RMA transport request matcher mirrors the server filter', () => {
  assert.equal(matchesDashboardFilter(request('a'), 'log-rma-requests'), true);
  assert.equal(matchesDashboardFilter(request('b', { rma_transport_status: 'COMPLETED' }), 'log-rma-requests'), false);
  assert.equal(matchesDashboardFilter(request('c', { status: 'Delivered' }), 'log-rma-requests'), false);
  assert.equal(matchesDashboardFilter(request('d', { rma_movement: 'DIRECT' as any }), 'log-rma-requests'), false);
  assert.equal(matchesDashboardFilter(request('e', { is_draft: 'Yes' }), 'log-rma-requests'), false);
});

test('no-driver tiles bring the Transport requests panel into view instead of opening one list', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const dom = new JSDOM('<div id="root"></div>');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  const scrolled: unknown[] = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, options?: unknown) { scrolled.push([this.id, options]); };
  const calls: unknown[][] = [];
  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => { root.render(h(LogisticsDashboard, { stats, overview, onNavigate: (...args: unknown[]) => { calls.push(args); } })); });
  const click = (el: Element) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  const panel = dom.window.document.getElementById('transport-requests-panel')!;
  assert.equal(panel.getAttribute('tabindex'), '-1');
  for (const name of ['No driver assigned, 2 jobs. Show transport requests', 'Unassigned records, 6,001 jobs. Show transport requests']) {
    await click([...dom.window.document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name)!);
    assert.equal(dom.window.document.activeElement, panel, name);
  }
  assert.deepEqual(scrolled.map(([id]) => id), ['transport-requests-panel', 'transport-requests-panel']);
  assert.deepEqual(calls, [], 'no list screen is opened');
  await act(async () => { root.unmount(); });
});
