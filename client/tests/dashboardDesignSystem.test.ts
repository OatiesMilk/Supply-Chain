import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { AGE_CRITICAL_DAYS, ageTone, manilaDaysSince } from '../src/utils/manilaDays';
import { AgeIndicator, DashboardPage, DashboardPanel, EmptyState, KpiRow, KpiTile, PanelError, RecordTable, StatusPill, TileSkeleton, formatCompact } from '../src/features/dashboard/ui';
import type { RecordColumn } from '../src/features/dashboard/ui';

const h = React.createElement;
const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const plain = (node: React.ReactElement) => html(node).replace(/<[^>]*>/g, '');

// 2026-11-10 10:00 in Manila
const NOW = new Date('2026-11-10T02:00:00Z');

test('manilaDaysSince counts Manila calendar days, not 24 hour blocks', () => {
  assert.equal(manilaDaysSince('2026-11-10T00:05:00+08:00', NOW), 0);
  assert.equal(manilaDaysSince('2026-11-09T23:59:00+08:00', NOW), 1);
  // 16:00Z is already the next Manila day
  assert.equal(manilaDaysSince('2026-11-09T16:00:00Z', NOW), 0);
  assert.equal(manilaDaysSince('2026-11-09T15:59:00Z', NOW), 1);
  assert.equal(manilaDaysSince('2026-11-02T08:00:00Z', NOW), 8);
});

test('manilaDaysSince never goes negative and rejects missing or invalid timestamps', () => {
  assert.equal(manilaDaysSince('2026-12-01T00:00:00Z', NOW), 0);
  assert.equal(manilaDaysSince(null, NOW), null);
  assert.equal(manilaDaysSince(undefined, NOW), null);
  assert.equal(manilaDaysSince('not a date', NOW), null);
});

test('age is amber from 4 to 7 days and red above 7', () => {
  assert.equal(AGE_CRITICAL_DAYS, 7);
  assert.deepEqual([0, 3, 4, 7, 8, 30].map(ageTone), ['normal', 'normal', 'warning', 'warning', 'critical', 'critical']);
});

test('AgeIndicator pairs every amber or red age with an icon and words', () => {
  const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
  assert.doesNotMatch(html(h(AgeIndicator, { since: at(2), now: NOW })), /<svg/);
  const amber = html(h(AgeIndicator, { since: at(5), now: NOW }));
  assert.match(amber, /<svg/); assert.match(amber, /5d/); assert.match(amber, /Getting old/); assert.match(amber, /text-amber-800/);
  const red = html(h(AgeIndicator, { since: at(9), now: NOW }));
  assert.match(red, /<svg/); assert.match(red, /9d/); assert.match(red, /Over 7 days/); assert.match(red, /text-red-700/);
  assert.match(plain(h(AgeIndicator, { since: at(0), now: NOW })), /^Today$/);
  assert.match(plain(h(AgeIndicator, { since: null, now: NOW })), /Not available/);
});

test('KpiTile is one button with a full accessible name', () => {
  const markup = html(h(KpiTile, { label: 'Open RMA', value: 14, unit: 'records', context: '2 on hold', onOpen() {} }));
  assert.equal((markup.match(/<button/g) ?? []).length, 1);
  assert.match(markup, /aria-label="Open RMA, 14 records\. View list"/);
  assert.match(markup, /focus-visible:outline-2/);
  assert.doesNotMatch(markup, /animate-pulse|animate-bounce/);
});

test('KpiTile without access renders no button and no arrow', () => {
  const markup = html(h(KpiTile, { label: 'On hold', value: 2, context: 'No blocked RMA' }));
  assert.doesNotMatch(markup, /<button/); assert.doesNotMatch(markup, /lucide-arrow-right/);
});

test('KpiTile shows a skeleton while loading and never a number', () => {
  const markup = html(h(KpiTile, { label: 'Open RMA', value: null, onOpen() {} }));
  assert.match(markup, /aria-busy="true"/); assert.match(markup, /Loading/); assert.doesNotMatch(markup, /<button/);
  assert.doesNotMatch(plain(h(KpiTile, { label: 'Open RMA', value: undefined })), /\d/);
});

test('KpiTile only uses warning and critical tones when the value is above zero', () => {
  const tone = (value: number, t: 'warning' | 'critical') => html(h(KpiTile, { label: 'X', value, tone: t, context: 'Context' }));
  assert.match(tone(3, 'critical'), /border-l-red-600/); assert.match(tone(3, 'warning'), /border-l-amber-500/);
  assert.match(tone(0, 'critical'), /border-l-slate-300/); assert.doesNotMatch(tone(0, 'warning'), /border-l-amber-500/);
  assert.match(tone(3, 'critical'), /<svg/); // status carried by an icon as well as colour
});

test('KpiTile compacts large values and keeps the full number available', () => {
  assert.equal(formatCompact(999), '999'); assert.equal(formatCompact(1234), '1.2K');
  const markup = html(h(KpiTile, { label: 'X', value: 12345 }));
  assert.match(markup, /12\.3K/); assert.match(markup, /title="12,345"/);
});

test('KpiTile is a native button, so Enter and Space activate it, and click runs the action', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const dom = new JSDOM('<div id="root"></div>'); let opened = 0;
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => { root.render(h(KpiTile, { label: 'Open RMA', value: 1, onOpen: () => { opened += 1; } })); });
  const button = dom.window.document.querySelector('button')!;
  assert.equal(button.tagName, 'BUTTON'); assert.equal(button.getAttribute('type'), 'button');
  await act(async () => { button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  assert.equal(opened, 1);
  await act(async () => { root.unmount(); });
});

test('KpiRow lays out 4 columns, or 3 plus 2 for five tiles, with equal height', () => {
  assert.match(html(h(KpiRow, { children: null })), /lg:grid-cols-4/);
  const five = html(h(KpiRow, { count: 5, children: null }));
  assert.match(five, /lg:grid-cols-3/); assert.match(five, /sm:grid-cols-2/); assert.match(five, /grid-cols-1/); assert.match(five, /auto-rows-fr/);
});

type Row = { id: string; company: string; age: string };
const columns: RecordColumn<Row>[] = [
  { key: 'id', header: 'Record', render: row => row.id },
  { key: 'company', header: 'Company', render: row => row.company },
  { key: 'age', header: 'Age', render: row => row.age, align: 'center' },
];
const rows: Row[] = [{ id: 'RMA-1', company: 'Acme', age: '9d' }, { id: 'RMA-2', company: 'Beta', age: '2d' }];

test('RecordTable puts a real button in the first cell and keeps row click', () => {
  const markup = html(h(RecordTable<Row>, { rows, columns, rowKey: row => row.id, onOpen() {}, openLabel: row => `Open ${row.id}`, caption: 'Open RMA' }));
  const table = markup.slice(markup.indexOf('<table'), markup.indexOf('</table>'));
  assert.equal((table.match(/<button/g) ?? []).length, 2);
  assert.match(table, /aria-label="Open RMA-1"/);
  assert.match(table, /<caption class="sr-only">Open RMA<\/caption>/);
  assert.match(table, /focus-within:bg-slate-50/);
  assert.equal((table.match(/<th /g) ?? []).length, 3);
});

test('RecordTable switches to a stacked list below md', () => {
  const markup = html(h(RecordTable<Row>, { rows, columns, rowKey: row => row.id, caption: 'Open RMA' }));
  assert.match(markup, /class="hidden overflow-x-auto md:block"/);
  assert.match(markup, /<ul class="divide-y divide-slate-100 md:hidden"/);
  const list = markup.slice(markup.indexOf('<ul'));
  assert.match(list, /<dt[^>]*>Company<\/dt><dd[^>]*>Acme/);
  assert.equal((list.match(/<li /g) ?? []).length, 2);
});

test('DashboardPanel renders a labelled section with count, actions and footer', () => {
  const markup = html(h(DashboardPanel, { title: 'Open RMA needing attention', count: '14 open', footer: 'Showing 10 of 14', children: 'body' }));
  assert.match(markup, /<section aria-labelledby=/); assert.match(markup, /<h2[^>]*>Open RMA needing attention/);
  assert.match(markup, /14 open/); assert.match(markup, /<footer[^>]*>Showing 10 of 14/);
  assert.doesNotMatch(html(h(DashboardPanel, { title: 'T', children: 'b' })), /<footer/);
});

test('DashboardPage shows the Manila update time and a refresh button', () => {
  const markup = html(h(DashboardPage, { title: 'Command dashboard', updatedAt: '2026-11-10T00:27:00Z', onRefresh() {}, children: null }));
  assert.match(markup, /<h1[^>]*>Command dashboard/); assert.match(markup, /Updated 08:27 AM/i);
  assert.match(markup, /aria-label="Refresh dashboard"/); assert.match(markup, /space-y-6/);
  assert.match(html(h(DashboardPage, { title: 'T', onRefresh() {}, refreshing: true, children: null })), /disabled=""[^>]*aria-label="Refreshing dashboard"|aria-label="Refreshing dashboard"[^>]*disabled=""/);
  assert.doesNotMatch(html(h(DashboardPage, { title: 'T', children: null })), /Updated|<button/);
});

test('shared states: empty, error with retry, and a skeleton that respects reduced motion', () => {
  assert.match(plain(h(EmptyState, { title: 'No open RMA', description: 'Everything is resolved.' })), /No open RMA.*Everything is resolved\./);
  const error = html(h(PanelError, { onRetry() {} }));
  assert.match(error, /role="alert"/); assert.match(error, /Try again/);
  assert.doesNotMatch(html(h(PanelError, {})), /<button/);
  const skeleton = html(h(TileSkeleton, {}));
  assert.match(skeleton, /motion-safe:animate-pulse/); assert.doesNotMatch(skeleton.replace(/motion-safe:animate-pulse/g, ''), /animate-/);
});

test('StatusPill can hide the RMA prefix inside single-category tables', () => {
  const record: any = { category: 'RMA', status: 'On-Hold', is_draft: 'No' };
  assert.match(plain(h(StatusPill, { record })), /RMA: On-Hold/);
  const hidden = plain(h(StatusPill, { record, hideCategoryPrefix: true }));
  assert.match(hidden, /On-Hold/); assert.doesNotMatch(hidden, /RMA:/);
});

test('design system sources contain no em dash and no pulse animation', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'features', 'dashboard', 'ui');
  for (const file of readdirSync(dir)) {
    const source = readFileSync(path.join(dir, file), 'utf8');
    assert.equal(source.includes('—'), false, `${file} has an em dash`);
    assert.equal(/(?<!motion-safe:)animate-pulse/.test(source), false, `${file} pulses without motion-safe`);
  }
});
