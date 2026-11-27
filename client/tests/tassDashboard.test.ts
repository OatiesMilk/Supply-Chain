import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import TassDashboard from '../src/features/dashboard/TassDashboard';
import { matchesDashboardFilter } from '../src/utils/dashboardFilters';
import type { ApiDashboardOverview, ApiDashboardStats } from '../src/api';
import type { DeliveryRecord } from '../src/types';

const h = React.createElement;
const stats = { role: 'TASS', open_rma: 14, rma_on_hold: 2, rma_in_transit: 5, rma_aging: 3, rma_awaiting_receipt: 4, rma_awaiting_completion: 1 } as Extract<ApiDashboardStats, { role: 'TASS' }>;
const rma = (id: string, extra: Partial<DeliveryRecord> = {}) => ({ id, category: 'RMA', status: 'Scheduled', is_draft: 'No', company_name: 'Acme Trading Corporation of the Philippines',
  area: 'Makati', delivery_date: '2026-07-12', created_at: '2026-01-01T00:00:00Z', submitted_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
  rma_reference: null, driver: '', ...extra }) as DeliveryRecord;
const previews = [rma('REC-1', { status: 'On-Hold', rma_reference: 'RMA-2026-001' }), rma('REC-2')];
const overview: ApiDashboardOverview = { role: 'TASS', generated_at: '2026-11-10T00:27:00Z', record_total: 40, status_totals: {},
  counts: { 'tass-open-rma': 14, rma_attention: 14, 'tass-rma-on-hold': 2, 'tass-rma-aging': 3 },
  record_previews: { rma_requests: [], rma_attention: previews }, drivers_out: [], drivers_out_total: 0, unverified_collections_amount: 0 };
const html = (props: Record<string, unknown> = {}) => renderToStaticMarkup(h(TassDashboard, { stats, overview, onNavigate() {}, ...props } as any));
const text = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test('Open RMA tile, panel badge and footer all show the same number', () => {
  const markup = html();
  assert.match(markup, /aria-label="Open RMA, 14 records\. View list"/);
  assert.match(text(markup), /14 open/);
  assert.match(text(markup), /Showing 2 of 14/);
  assert.match(text(markup), /View all 14 open RMA records/);
});

test('Open RMA tile explains the number with on hold and over 7 days counts', () => {
  assert.match(text(html()), /2 on hold, 3 over 7 days/);
});

test('every tile has one action, a context line and calm zero states', () => {
  const markup = html();
  assert.match(text(markup), /Blocked, needs action/);
  assert.match(text(markup), /With Logistics driver/);
  assert.match(text(markup), /Needs follow-up/);
  const tiles = markup.split('data-kpi-tile').length - 1;
  assert.equal(tiles, 6);
  assert.match(text(markup), /Confirm receipt/); assert.match(text(markup), /Received, ready to complete/);
  const calm = text(html({ stats: { ...stats, rma_on_hold: 0, rma_in_transit: 0, rma_aging: 0, rma_awaiting_receipt: 0, rma_awaiting_completion: 0 } }));
  assert.match(calm, /No blocked RMA/); assert.match(calm, /None in transit/); assert.match(calm, /All within 7 days/);
  assert.match(calm, /Nothing to receive/); assert.match(calm, /Nothing to complete/);
});

test('TASS tiles are RMA-only: no collection verification or procurement pick-up tiles', () => {
  const markup = html();
  assert.match(markup, /aria-label="In transit, 5 RMA records\. View list"/);
  assert.match(markup, /aria-label="Aging over 7 days, 3 RMA records\. View list"/);
  assert.doesNotMatch(text(markup), /Collections to verify|Pick-ups pending|verified today|Awaiting your sign-off/);
  assert.doesNotMatch(markup, /accounting_collection|procurement_pickup/);
});

test('while stats load the tiles show skeletons and no numbers, never a guessed count', () => {
  const markup = html({ stats: null });
  assert.equal((markup.match(/aria-busy="true"/g) ?? []).length >= 4, true);
  assert.doesNotMatch(markup, /<button[^>]*aria-label="(Open RMA|On hold|In transit|Aging over 7 days),/);
  const tilesOnly = markup.slice(markup.indexOf('<div class="grid'), markup.indexOf('Ready for receipt'));
  // "Aging over 7 days" is a label, not a count.
  assert.doesNotMatch(text(tilesOnly.replace(/class="[^"]*"/g, '')).replace(/Aging over 7 days/g, ''), /\b\d+\b/);
});

test('table lists On-Hold first, leads with the RMA reference and shows a Status without the RMA prefix', () => {
  const table = html();
  const body = table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));
  assert.ok(body.indexOf('REC-1') < body.indexOf('REC-2'));
  assert.ok(body.indexOf('RMA-2026-001') < body.indexOf('REC-1'), 'RMA reference is the primary identifier, record number underneath');
  assert.doesNotMatch(text(body), /RMA:/);
  assert.match(body, /Jul 12, 2026/);
});

test('both TASS tables lead with the same RMA column, falling back to the record number', () => {
  const markup = html({ overview: withTransit });
  const tables = markup.split('<table').slice(1);
  assert.equal(tables.length, 2);
  for (const table of tables) assert.match(table, /<th[^>]*>RMA<\/th>/);
  assert.doesNotMatch(markup, /<th[^>]*>Record<\/th>/);
  const [attention, inTransit] = tables.map(table => text(table.slice(table.indexOf('<tbody'))));
  assert.match(attention, /RMA-2026-001 REC-1 /);
  assert.match(inTransit, /RMA-2026-007 REC-7 /);
  assert.match(attention, /REC-2 Acme/, 'a record without an RMA reference shows its record number once');
});

test('Open RMA tile is neutral when nothing is open, warning when open, critical when aging', () => {
  const openRmaTone = (props: Record<string, unknown>) => html(props).match(/aria-label="Open RMA, [^"]*"[^>]*data-tone="(\w+)"/)?.[1];
  const quiet = { ...overview.counts, 'tass-open-rma': 0, 'tass-rma-aging': 0, 'tass-rma-on-hold': 0 };
  assert.equal(openRmaTone({ stats: { ...stats, open_rma: 0, rma_on_hold: 0, rma_aging: 0 }, overview: { ...overview, counts: quiet } }), 'neutral');
  // Stats and overview can briefly disagree; a zero Open RMA count stays neutral even if a stale aging count is non-zero.
  assert.equal(openRmaTone({ stats: { ...stats, open_rma: 0 } }), 'neutral');
  assert.equal(openRmaTone({ overview: { ...overview, counts: { ...overview.counts, 'tass-rma-aging': 0 } } }), 'warning');
  assert.equal(openRmaTone({}), 'critical');
});

test('age counts from submission, so a record created long ago but submitted today reads Today', () => {
  const fresh = rma('REC-9', { created_at: '2025-01-01T00:00:00Z', submitted_at: new Date().toISOString() });
  const markup = html({ overview: { ...overview, record_previews: { rma_requests: [], rma_attention: [fresh] } } });
  const body = markup.slice(markup.indexOf('<tbody'), markup.indexOf('</tbody>'));
  assert.match(text(body), /Today/); assert.doesNotMatch(body, /Over 7 days/);
});

test('aged records show the red indicator with an icon and words', () => {
  const body = html().slice(html().indexOf('<tbody'));
  assert.match(body, /9d/); assert.match(body, /Over 7 days/); assert.match(body, /<svg/);
});

test('the long company name is truncated visually but keeps its full name as a tooltip', () => {
  assert.match(html(), /title="Acme Trading Corporation of the Philippines"/);
});

test('first cell and footer link are real buttons; every row is also keyboard reachable on phones', () => {
  const markup = html();
  const table = markup.slice(markup.indexOf('<table'), markup.indexOf('</table>'));
  assert.equal((table.match(/<button/g) ?? []).length, 2);
  assert.match(markup, /aria-label="Open RMA record RMA-2026-001"/);
  assert.match(markup, /<ul class="divide-y divide-slate-100 md:hidden"/);
});

test('copy has no em dash, no uppercase headings and nothing pulses', () => {
  const markup = html();
  assert.equal(markup.includes('—'), false);
  assert.doesNotMatch(markup, /animate-pulse/);
  assert.doesNotMatch(markup, /font-black|tracking-wider/);
  assert.equal(text(markup).includes('Needs Attention'), false);
});

test('TASS dashboard heading, Manila update stamp and refresh', () => {
  const markup = html({ onRefresh() {} });
  assert.match(markup, /<h1[^>]*>TASS dashboard/); assert.match(text(markup), /Updated 08:27 AM/i); assert.match(markup, /aria-label="Refresh dashboard"/);
});

test('tiles and links for screens the viewer cannot open have no button', () => {
  const markup = html({ canAccess: (screen: string) => screen !== 'rma' });
  assert.doesNotMatch(markup, /aria-label="Open RMA, /); assert.doesNotMatch(markup, /aria-label="On hold, /);
  assert.doesNotMatch(markup, /aria-label="In transit, /); assert.doesNotMatch(markup, /aria-label="Aging over 7 days, /);
  assert.match(text(markup), /In transit/);
  assert.doesNotMatch(markup, /View all 14 open RMA records/);
  assert.doesNotMatch(markup, /aria-label="Open RMA record (RMA|REC)/);
});

test('no open RMA shows a calm empty state', () => {
  const empty = html({ overview: { ...overview, counts: { ...overview.counts, 'tass-open-rma': 0, rma_attention: 0 }, record_previews: { rma_requests: [], rma_attention: [] } } });
  assert.match(text(empty), /No open RMA records/); assert.doesNotMatch(empty, /<table/);
});

test('if the overview fails the tiles still render and the panel offers a working retry', () => {
  const markup = html({ overview: undefined, overviewStatus: 'error', onRetryOverview() {} });
  assert.match(markup, /aria-label="Open RMA, 14 records/);
  assert.match(markup, /role="alert"/); assert.match(text(markup), /Try again/);
  assert.doesNotMatch(markup, /<table/);
});

test('while the overview loads the panel shows a skeleton and the tiles keep their numbers', () => {
  const markup = html({ overview: undefined, overviewStatus: 'pending' });
  assert.match(markup, /aria-label="Open RMA, 14 records/);
  assert.match(markup, /role="status"/);
});

test('footer link, tiles and rows navigate with the dashboard filter', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const dom = new JSDOM('<div id="root"></div>');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  const calls: unknown[][] = [];
  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => { root.render(h(TassDashboard, { stats, overview, onNavigate: (...args: unknown[]) => { calls.push(args); } })); });
  const click = async (element: Element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  const buttons = [...dom.window.document.querySelectorAll('button')];
  await click(buttons.find(b => b.textContent?.includes('View all 14 open RMA records'))!);
  await click(buttons.find(b => b.getAttribute('aria-label')?.startsWith('Open RMA, 14'))!);
  await click(buttons.find(b => b.getAttribute('aria-label')?.startsWith('On hold'))!);
  await click(buttons.find(b => b.getAttribute('aria-label')?.startsWith('In transit'))!);
  await click(buttons.find(b => b.getAttribute('aria-label')?.startsWith('Aging over 7 days'))!);
  await click(buttons.find(b => b.getAttribute('aria-label') === 'Open RMA record RMA-2026-001')!);
  assert.deepEqual(calls, [
    ['rma', undefined, 'tass-open-rma'],
    ['rma', undefined, 'tass-open-rma'],
    ['rma', undefined, 'tass-rma-on-hold'],
    ['rma', undefined, 'tass-rma-in-transit'],
    ['rma', undefined, 'tass-rma-aging'],
    ['rma', 'REC-1'],
  ]);
  await act(async () => { root.unmount(); });
});

test('client Open RMA matcher agrees with the server definition', () => {
  const statuses = ['Scheduled', 'Pending', 'In Transit', 'On-Hold', 'Rescheduled', 'Delivered'] as const;
  const open = statuses.filter(status => matchesDashboardFilter(rma('x', { status }), 'tass-open-rma'));
  assert.deepEqual(open, ['Scheduled', 'Pending', 'In Transit', 'On-Hold', 'Rescheduled']);
  assert.equal(matchesDashboardFilter(rma('d', { status: 'Draft' as any, is_draft: 'Yes' }), 'tass-open-rma'), false);
  assert.equal(matchesDashboardFilter(rma('o', { category: 'Deliveries' }), 'tass-open-rma'), false);
});

test('aging matcher uses Manila days since submission and falls back to creation', () => {
  const day = 86_400_000;
  const at = (days: number) => new Date(Date.now() - days * day).toISOString();
  assert.equal(matchesDashboardFilter(rma('a', { submitted_at: at(9) }), 'tass-rma-aging'), true);
  assert.equal(matchesDashboardFilter(rma('b', { submitted_at: at(7) }), 'tass-rma-aging'), false);
  assert.equal(matchesDashboardFilter(rma('c', { submitted_at: null, created_at: at(12) }), 'tass-rma-aging'), true);
  assert.equal(matchesDashboardFilter(rma('d', { submitted_at: at(30), status: 'Delivered' }), 'tass-rma-aging'), false);
});

const transit = (id: string, extra: Partial<DeliveryRecord> = {}) => rma(id, { rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'IN_TRANSIT', driver: 'Ben Reyes', driver_id: 'drv-ben',
  rma_transport_started_at: '2026-11-11T23:30:00.000Z', ...extra });
const withTransit = { ...overview, counts: { ...overview.counts, 'tass-rma-in-transit': 6001 },
  record_previews: { ...overview.record_previews, rma_in_transit: [transit('REC-7', { rma_reference: 'RMA-2026-007' }), transit('REC-8', { rma_transport_started_at: null })] } } as ApiDashboardOverview;

test('RMA in transit panel shows reference, driver, transport start and RMA status (AC13)', () => {
  const markup = html({ overview: withTransit }); const t = text(markup);
  assert.match(t, /RMA in transit 6001 in transit/); assert.match(t, /Showing 2 of 6001/); assert.match(t, /View all 6001 in transit/);
  for (const header of ['RMA', 'Company', 'Area', 'Driver', 'Transport started', 'RMA status']) assert.match(markup, new RegExp(`<th[^>]*>${header}</th>`));
  assert.match(t, /RMA-2026-007 REC-7 Acme Trading Corporation of the Philippines Makati Ben Reyes Nov 12, 7:30 AM/);
  assert.match(t, /REC-8 .*Not recorded/);
  assert.match(markup, /aria-label="Open RMA in transit RMA-2026-007"/);
  assert.match(markup, /caption[^>]*>RMA in transit, oldest transport start first/);
});

test('RMA in transit panel is calm when empty and plain text without RMA access', () => {
  assert.match(text(html()), /No RMA are in transit/);
  const denied = html({ overview: withTransit, canAccess: (screen: string) => screen !== 'rma' });
  assert.doesNotMatch(denied, /View all 6001 in transit/); assert.doesNotMatch(denied, /aria-label="Open RMA in transit/);
  assert.match(text(denied), /RMA-2026-007/);
});

test('RMA in transit footer and rows navigate with tass-rma-in-transit', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const dom = new JSDOM('<div id="root"></div>');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  const calls: unknown[][] = [];
  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => { root.render(h(TassDashboard, { stats, overview: withTransit, onNavigate: (...args: unknown[]) => { calls.push(args); } })); });
  const buttons = [...dom.window.document.querySelectorAll('button')];
  const click = (el: Element) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await click(buttons.find(b => b.textContent?.includes('View all 6001 in transit'))!);
  await click(buttons.find(b => b.getAttribute('aria-label') === 'Open RMA in transit RMA-2026-007')!);
  assert.deepEqual(calls, [['rma', undefined, 'tass-rma-in-transit'], ['rma', 'REC-7']]);
  await act(async () => { root.unmount(); });
});

test('non-RMA internal transfers never count toward TASS RMA tiles or drill-downs', () => {
  const transfer = rma('TXO-1', { rma_type: 'Transfer Out Slip', is_internal_transfer: true, rma_movement: 'LOGISTICS_TRANSPORT',
    rma_transport_status: 'IN_TRANSIT', driver_id: 'drv-a', driver: 'Ana' });
  const regular = { ...transfer, id: 'RMA-1', is_internal_transfer: false };
  for (const id of ['tass-open-rma', 'tass-rma-aging', 'tass-rma-in-transit'] as const) {
    assert.equal(matchesDashboardFilter(transfer, id), false, id);
    assert.equal(matchesDashboardFilter(regular, id), true, id);
  }
  assert.equal(matchesDashboardFilter({ ...transfer, status: 'On-Hold' }, 'tass-rma-on-hold'), false);
  assert.equal(matchesDashboardFilter({ ...regular, status: 'On-Hold' }, 'tass-rma-on-hold'), true);
  assert.equal(matchesDashboardFilter({ ...regular, status: 'On-Hold', is_draft: 'Yes' }, 'tass-rma-on-hold'), false, 'drafts are not on hold');
  assert.equal(matchesDashboardFilter({ ...transfer, driver_id: null, rma_transport_status: 'PENDING' }, 'log-transport-requests'), true, 'Logistics still routes them');
});

// ── #350: TASS work queues (awaiting receipt / awaiting completion) ──
const ready = (id: string, extra: Partial<DeliveryRecord> = {}) => rma(id, { rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'COMPLETED',
  rma_transport_completed_at: '2026-11-12T03:15:00.000Z', rma_received_at: null, ...extra });
const withReceipts = { ...overview, counts: { ...overview.counts, 'tass-rma-awaiting-receipt': 12, 'tass-rma-awaiting-completion': 1 },
  record_previews: { ...overview.record_previews, rma_awaiting_receipt: [ready('REC-21', { rma_reference: 'RMA-2026-021' }), ready('REC-22', { rma_movement: 'SUPPLIER_COLLECTION', rma_transport_status: null, rma_transport_completed_at: null })] } } as ApiDashboardOverview;

test('work-queue tiles are neutral when their queue is empty and warning when work is waiting', () => {
  const toneOf = (label: string, props: Record<string, unknown>) => html(props).match(new RegExp(`aria-label="${label}, [^"]*"[^>]*data-tone="([a-z]+)"`))?.[1];
  assert.equal(toneOf('Awaiting TASS receipt', {}), 'warning');
  assert.equal(toneOf('Awaiting completion', {}), 'warning');
  const empty = { stats: { ...stats, rma_awaiting_receipt: 0, rma_awaiting_completion: 0 } };
  assert.equal(toneOf('Awaiting TASS receipt', empty), 'neutral');
  assert.equal(toneOf('Awaiting completion', empty), 'neutral');
});

test('work-queue tiles show the server counts and drill into their filtered RMA lists', async () => {
  const markup = html();
  assert.match(markup, /aria-label="Awaiting TASS receipt, 4 RMA records\. View list"/);
  assert.match(markup, /aria-label="Awaiting completion, 1 RMA records\. View list"/);
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const dom = new JSDOM('<div id="root"></div>');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  const calls: unknown[][] = [];
  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => { root.render(h(TassDashboard, { stats, overview: withReceipts, onNavigate: (...args: unknown[]) => { calls.push(args); } })); });
  const buttons = [...dom.window.document.querySelectorAll('button')];
  const click = (el: Element) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await click(buttons.find(b => b.getAttribute('aria-label')?.startsWith('Awaiting TASS receipt'))!);
  await click(buttons.find(b => b.getAttribute('aria-label')?.startsWith('Awaiting completion'))!);
  await click(buttons.find(b => b.textContent?.includes('View all 12 awaiting receipt'))!);
  await click(buttons.find(b => b.getAttribute('aria-label') === 'Open RMA ready for receipt RMA-2026-021')!);
  assert.deepEqual(calls, [
    ['rma', undefined, 'tass-rma-awaiting-receipt'],
    ['rma', undefined, 'tass-rma-awaiting-completion'],
    ['rma', undefined, 'tass-rma-awaiting-receipt'],
    ['rma', 'REC-21'],
  ]);
  await act(async () => { root.unmount(); });
});

test('Ready for receipt panel lists RMA reference, movement, transport completion and age', () => {
  const markup = html({ overview: withReceipts }); const t = text(markup);
  assert.match(t, /Ready for receipt 12 waiting/); assert.match(t, /Showing 2 of 12/);
  for (const header of ['RMA', 'Company', 'Movement', 'Transport completed', 'Age']) assert.match(markup, new RegExp(`<th[^>]*>${header}</th>`));
  assert.match(t, /RMA-2026-021 REC-21 Acme Trading Corporation of the Philippines Logistics Route Nov 12, 11:15 AM/);
  assert.match(t, /REC-22 .*Supplier Collection No driver leg/);
  assert.match(markup, /caption[^>]*>RMA ready for TASS receipt, longest waiting first/);
  assert.ok(markup.indexOf('Ready for receipt') < markup.indexOf('Open RMA needing attention'), 'TASS work queue comes first');
});

test('Ready for receipt is calm when empty and plain text without RMA access', () => {
  const empty = text(html());
  assert.match(empty, /Ready for receipt 0 waiting/); assert.match(empty, /Nothing waiting for receipt/);
  const denied = html({ overview: withReceipts, canAccess: (screen: string) => screen !== 'rma' });
  assert.doesNotMatch(denied, /View all 12 awaiting receipt/); assert.doesNotMatch(denied, /aria-label="Open RMA ready for receipt/);
  assert.doesNotMatch(denied, /aria-label="Awaiting (TASS receipt|completion), /);
  assert.match(text(denied), /RMA-2026-021/);
});

test('awaiting receipt matcher: transport completed or no driver leg, receipt not yet confirmed', () => {
  assert.equal(matchesDashboardFilter(ready('a'), 'tass-rma-awaiting-receipt'), true);
  assert.equal(matchesDashboardFilter(ready('b', { rma_transport_status: 'IN_TRANSIT' }), 'tass-rma-awaiting-receipt'), false, 'driver still on the road');
  assert.equal(matchesDashboardFilter(ready('c', { rma_movement: 'INTERNAL_NO_DRIVER', rma_transport_status: null }), 'tass-rma-awaiting-receipt'), true);
  assert.equal(matchesDashboardFilter(ready('d', { rma_movement: null, rma_transport_status: null }), 'tass-rma-awaiting-receipt'), false, 'legacy rows without a movement cannot be received');
  assert.equal(matchesDashboardFilter(ready('e', { rma_received_at: '2026-11-12T04:00:00.000Z' }), 'tass-rma-awaiting-receipt'), false);
  assert.equal(matchesDashboardFilter(ready('f', { status: 'Delivered' }), 'tass-rma-awaiting-receipt'), false);
  assert.equal(matchesDashboardFilter(ready('g', { is_draft: 'Yes', status: 'Draft' as DeliveryRecord['status'] }), 'tass-rma-awaiting-receipt'), false);
  assert.equal(matchesDashboardFilter(ready('h', { is_internal_transfer: true }), 'tass-rma-awaiting-receipt'), false);
});

test('awaiting completion matcher: receipt confirmed, not Delivered, never an internal transfer', () => {
  const received = { rma_received_at: '2026-11-12T04:00:00.000Z' };
  assert.equal(matchesDashboardFilter(ready('a', received), 'tass-rma-awaiting-completion'), true);
  assert.equal(matchesDashboardFilter(ready('b', { ...received, rma_movement: 'SUPPLIER_COLLECTION', rma_transport_status: null }), 'tass-rma-awaiting-completion'), true);
  assert.equal(matchesDashboardFilter(ready('c'), 'tass-rma-awaiting-completion'), false, 'not received yet');
  assert.equal(matchesDashboardFilter(ready('d', { ...received, status: 'Delivered' }), 'tass-rma-awaiting-completion'), false);
  assert.equal(matchesDashboardFilter(ready('e', { ...received, is_internal_transfer: true }), 'tass-rma-awaiting-completion'), false);
});
