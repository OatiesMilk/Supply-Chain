import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SalesCoordinatorDashboard from '../src/features/dashboard/SalesCoordinatorDashboard';
import type { ApiDashboardOverview, ApiDashboardStats } from '../src/api';

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

test('overview failure keeps tiles and shows retries in both panels', () => {
  const markup = html({ overview: undefined, overviewStatus: 'error', onRetryOverview() {} });
  assert.match(markup, /aria-label="Scheduled today, 6 deliveries/);
  assert.equal((markup.match(/role="alert"/g) ?? []).length, 2);
  assert.equal((text(markup).match(/Try again/g) ?? []).length, 2);
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
