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
  counts: { rma_requests: 6001, 'log-flags': 5, 'log-unassigned': 2, 'log-on-hold': 1, 'log-rescheduled': 2 },
  record_previews: { rma_requests: [request('r1'), request('r2', { driver: 'Ana Cruz' })], rma_attention: [] },
  drivers_out: [{ driver: 'Ana Cruz', total: 7001, records: [{ id: 'D-1', category: 'Deliveries', company_name: 'Acme' } as DeliveryRecord] }], drivers_out_total: 6001, unverified_collections_amount: 0 };
const html = (props: Record<string, unknown> = {}) => renderToStaticMarkup(h(LogisticsDashboard, { stats, overview, onNavigate() {}, ...props } as any));
const text = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test('tiles use the shared contract with calm zero states', () => {
  const markup = html();
  assert.equal(markup.split('data-kpi-tile').length - 1, 4 + 3);
  assert.match(markup, /aria-label="No driver assigned, 2 deliveries\. View list"/);
  assert.match(text(markup), /Needs a driver/); assert.match(text(markup), /None yet today/);
  assert.match(html({ stats: { ...stats, unassigned_count: 0 } }), /All assigned/);
});

test('tiles show skeletons while stats load and never fall back to guessed counts', () => {
  const markup = html({ stats: null });
  assert.doesNotMatch(markup, /aria-label="Assigned to drivers today,/);
  assert.ok((markup.match(/aria-busy="true"/g) ?? []).length >= 4);
});

test('RMA requests panel shows full totals with a bounded preview, a footer and a filtered view-all link', () => {
  const t = text(html());
  assert.match(t, /RMA transport requests 6001 requests/); assert.match(t, /Showing 2 of 6001 requests/); assert.match(t, /View all requests/);
  assert.match(html(), /Needs driver/);
  assert.match(html(), /aria-label="Open RMA RMA-r1 for Client Co"/);
});

test('drivers panel keeps complete totals and a view-all link', () => {
  const t = text(html());
  assert.match(t, /6001 drivers/); assert.match(t, /7001 active deliveries/); assert.match(t, /\+7000 more records/); assert.match(t, /View all 6001 assigned Drivers/);
});

test('empty states are calm', () => {
  const empty = html({ overview: { ...overview, counts: { ...overview.counts, rma_requests: 0 }, record_previews: { rma_requests: [], rma_attention: [] }, drivers_out: [], drivers_out_total: 0 } });
  assert.match(text(empty), /No RMA transport requests need dispatch/); assert.match(text(empty), /No drivers currently assigned/);
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
  assert.doesNotMatch(markup, /View all requests/); assert.doesNotMatch(markup, /View all 6001 assigned Drivers/);
  assert.doesNotMatch(markup, /aria-label="Open RMA RMA-r1/);
  const none = html({ canAccess: () => false });
  assert.doesNotMatch(none, /<button[^>]*aria-label="[^"]*View list/);
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
  await click(buttons.find(b => b.textContent?.includes('View all requests'))!);
  await click(buttons.find(b => b.getAttribute('aria-label')?.startsWith('Completed today'))!);
  await click(buttons.find(b => b.textContent?.includes('View all 5 flags'))!);
  await click(buttons.find(b => b.getAttribute('aria-label') === 'Open RMA RMA-r1 for Client Co')!);
  assert.deepEqual(calls, [['rma', undefined, 'log-rma-requests'], ['deliveries', undefined, 'log-completed-today'], ['deliveries', undefined, 'log-flags'], ['rma', 'r1']]);
  await act(async () => { root.unmount(); });
});

test('RMA transport request matcher mirrors the server filter', () => {
  assert.equal(matchesDashboardFilter(request('a'), 'log-rma-requests'), true);
  assert.equal(matchesDashboardFilter(request('b', { rma_transport_status: 'COMPLETED' }), 'log-rma-requests'), false);
  assert.equal(matchesDashboardFilter(request('c', { status: 'Delivered' }), 'log-rma-requests'), false);
  assert.equal(matchesDashboardFilter(request('d', { rma_movement: 'DIRECT' as any }), 'log-rma-requests'), false);
  assert.equal(matchesDashboardFilter(request('e', { is_draft: 'Yes' }), 'log-rma-requests'), false);
});
