import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SalesCoordinatorDashboard from '../src/features/dashboard/SalesCoordinatorDashboard';
import type { ApiDashboardOverview, ApiDashboardStats } from '../src/api';
import type { DeliveryRecord } from '../src/types';

const h = React.createElement;
const stats = { role: 'SALES_COORDINATOR', deliveries_scheduled_today: 6, pending_driver_assignment: 3, on_hold: 0, rescheduled: 2, accomplished_today: 0 } as Extract<ApiDashboardStats, { role: 'SALES_COORDINATOR' }>;
const overview: ApiDashboardOverview = { role: 'SALES_COORDINATOR', generated_at: '2026-11-10T00:27:00Z', record_total: 120, status_totals: { Scheduled: 5, Delivered: 80 },
  counts: { 'sc-attention-all': 9, 'sc-attention-no-driver': 2, 'sc-attention-on-hold-rescheduled': 3, 'sc-attention-pending-confirmation': 4 },
  record_previews: { rma_requests: [], rma_attention: [] }, drivers_out: [], drivers_out_total: 0, unverified_collections_amount: 0 };
const html = (props: Record<string, unknown> = {}) => renderToStaticMarkup(h(SalesCoordinatorDashboard, { stats, overview, onNavigate() {}, ...props } as any));
const text = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test('five tiles on the shared KpiTile, laid out 3 plus 2 on large screens', () => {
  const markup = html();
  assert.equal(markup.split('data-kpi-tile').length - 1, 5 + 3);
  assert.match(markup, /lg:grid-cols-3/);
  for (const name of ['Scheduled today, 6 deliveries', 'Pending driver assignment, 3 deliveries', 'On hold, 0 deliveries', 'Rescheduled, 2 deliveries', 'Completed today, 0 deliveries']) {
    assert.match(markup, new RegExp(`aria-label="${name}\\. View list"`));
  }
});

test('zero tiles are calm and neutral', () => {
  const t = text(html());
  assert.match(t, /Nothing blocked/); assert.match(t, /None yet today/);
  assert.match(html(), /Needs a driver/);
});

test('tiles show skeletons while stats load, never a counted guess', () => {
  const markup = html({ stats: null });
  assert.doesNotMatch(markup, /aria-label="Scheduled today,/);
  assert.ok((markup.match(/aria-busy="true"/g) ?? []).length >= 5);
});

test('needs attention panel keeps its three counts and a view-all action', () => {
  const markup = html();
  assert.match(text(markup), /9 need action/);
  assert.match(text(markup), /View all 9 items needing action/);
  assert.match(markup, /aria-label="No driver, due soon, 2 deliveries\. View list"/);
  assert.match(markup, /aria-label="On hold or rescheduled, 3 deliveries\. View list"/);
  assert.match(markup, /aria-label="Pending confirmation, 4 deliveries\. View list"/);
});

test('status chart panel footer carries the record count', () => {
  assert.match(text(html({ skuCount: 7 })), /Records available to your account: 127 \(120 operational records, 7 SKUs\)/);
});

test('overview failure keeps tiles and shows retries in every panel', () => {
  const markup = html({ overview: undefined, overviewStatus: 'error', onRetryOverview() {} });
  assert.match(markup, /aria-label="Scheduled today, 6 deliveries/);
  assert.equal((markup.match(/role="alert"/g) ?? []).length, 3);
  assert.equal((text(markup).match(/Try again/g) ?? []).length, 3);
});

test('no access to deliveries removes every tile button and link', () => {
  const markup = html({ canAccess: () => false });
  assert.doesNotMatch(markup, /<button[^>]*aria-label="[^"]*View list/); assert.doesNotMatch(markup, /View all 9 items/);
});

test('copy is sentence case with no em dash, uppercase headings or pulse', () => {
  const markup = html();
  assert.equal(markup.includes('—'), false);
  assert.doesNotMatch(markup, /animate-pulse|font-black|tracking-wider|uppercase tracking/);
  assert.match(markup, /<h1[^>]*>Sales dashboard/); assert.match(text(markup), /Updated 08:27 AM/i);
});

const job = (id: string, category: string, extra: Record<string, unknown> = {}) => ({ id, category, status: 'In Transit', is_draft: 'No', company_name: `${id} Co`,
  area: 'Pasig', delivery_date: '2026-11-11', driver: 'Ana Cruz', driver_id: 'drv-ana', time_in: '2026-11-12T01:05:00.000Z', ...extra }) as unknown as DeliveryRecord;
const moving = { ...overview, counts: { ...overview.counts, 'sc-in-transit': 6001 },
  record_previews: { ...overview.record_previews, in_transit: [job('D-1', 'Deliveries'), job('P-1', 'Procurement Pick-up'), job('S-1', 'Sales Orders', { status: 'Scheduled' })] } } as ApiDashboardOverview;

test('in transit panel lists Delivery, Pick-up and Sales Order runs with driver and start time (AC10)', () => {
  const markup = html({ overview: moving }); const t = text(markup);
  assert.match(t, /In transit 6001 in transit/); assert.match(t, /Showing 3 of 6001/);
  for (const header of ['Record', 'Type', 'Company', 'Area', 'Planned date', 'Driver', 'Started', 'Status']) assert.match(markup, new RegExp(`<th[^>]*>${header}</th>`));
  assert.match(t, /D-1 Delivery D-1 Co Pasig Nov 11, 2026 Ana Cruz Nov 12, 9:05 AM/);
  assert.match(t, /P-1 Procurement Pickup/); assert.match(t, /S-1 Sales Order/);
  assert.match(t, /View Deliveries in transit/); assert.match(t, /View Procurement Pickups in transit/); assert.match(t, /View Sales Orders in transit/);
  assert.match(markup, /aria-label="Open Sales Order S-1 for S-1 Co"/);
});

test('in transit panel has a calm empty state and hides links the viewer cannot open', () => {
  const empty = text(html());
  assert.match(empty, /No jobs are in transit/); assert.match(empty, /0 in transit/);
  const limited = html({ overview: moving, canAccess: (screen: string) => screen === 'deliveries' });
  assert.match(limited, /View Deliveries in transit/); assert.doesNotMatch(limited, /View Sales Orders in transit|View Procurement Pickups in transit/);
  assert.doesNotMatch(limited, /aria-label="Open Sales Order S-1/); assert.match(text(limited), /S-1 Sales Order/);
  assert.match(limited, /aria-label="Open Delivery D-1 for D-1 Co"/);
});

test('in transit links and rows open each job type on its own screen with sc-in-transit', async () => {
  const { JSDOM } = await import('jsdom');
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const dom = new JSDOM('<div id="root"></div>');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  const calls: unknown[][] = [];
  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => { root.render(h(SalesCoordinatorDashboard, { stats, overview: moving, onNavigate: (...args: unknown[]) => { calls.push(args); } })); });
  const buttons = [...dom.window.document.querySelectorAll('button')];
  const click = (el: Element) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  for (const label of ['View Deliveries in transit', 'View Procurement Pickups in transit', 'View Sales Orders in transit']) await click(buttons.find(b => b.textContent?.includes(label))!);
  await click(buttons.find(b => b.getAttribute('aria-label') === 'Open Procurement Pickup P-1 for P-1 Co')!);
  assert.deepEqual(calls, [['deliveries', undefined, 'sc-in-transit'], ['procurement_pickup', undefined, 'sc-in-transit'], ['sales_orders', undefined, 'sc-in-transit'], ['procurement_pickup', 'P-1']]);
  await act(async () => { root.unmount(); });
});
