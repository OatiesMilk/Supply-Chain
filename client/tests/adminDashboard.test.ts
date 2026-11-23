import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminDashboard from '../src/features/dashboard/AdminDashboard';
import type { ApiDashboardOverview, ApiDashboardStats } from '../src/api';

const h = React.createElement;
const stats = { role: 'ADMIN', total_active_users: 7, user_breakdown: { ADMIN: 1, TASS: 2 }, records_this_week: 40, unverified_collections: 4, audit_events_today: 0,
  records_by_status: [{ status: 'SCHEDULED', count: 3 }],
  recent_audit: [{ id: 'a1', action: 'UPDATE', changed_by: 'Ana', record_id: 'REC-123456789012345', record_type: 'DeliveryRecord', timestamp: '2026-11-10T00:27:00Z' }] } as Extract<ApiDashboardStats, { role: 'ADMIN' }>;
const overview = { role: 'ADMIN', generated_at: '2026-11-10T00:27:00Z', unverified_collections_amount: 12345, counts: {}, status_totals: {}, record_total: 0,
  record_previews: { rma_requests: [], rma_attention: [] }, drivers_out: [], drivers_out_total: 0 } as ApiDashboardOverview;
const html = (props: Record<string, unknown> = {}) => renderToStaticMarkup(h(AdminDashboard, { stats, overview, onNavigate() {}, ...props } as any));
const text = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test('four shared tiles with accessible names and an unverified amount context', () => {
  const markup = html();
  assert.equal(markup.split('data-kpi-tile').length - 1, 4);
  assert.match(markup, /aria-label="Active users, 7 users\. View list"/);
  assert.match(text(markup), /1 Admin, 2 TASS/);
  assert.match(text(markup), /₱12,345\.00 across 4 records/);
});

test('zero audit events and no unverified collections stay calm', () => {
  const t = text(html({ stats: { ...stats, unverified_collections: 0 } }));
  assert.match(t, /Nothing to verify/); assert.match(html(), /aria-label="Audit events today, 0 events/);
});

test('tiles and panels show skeletons while stats load, never counted guesses', () => {
  const markup = html({ stats: null });
  assert.doesNotMatch(markup, /aria-label="Active users,/);
  assert.ok((markup.match(/aria-busy="true"/g) ?? []).length >= 4);
  assert.equal((markup.match(/role="status"/g) ?? []).length >= 6, true);
});

test('tiles still render when the overview fails, falling back to an awaiting message', () => {
  const markup = html({ overview: undefined });
  assert.match(markup, /aria-label="Unverified collections, 4 collections/); assert.match(text(markup), /Awaiting TASS/);
});

test('panels use the shared pattern with replaced copy and a timestamped audit list', () => {
  const t = text(html());
  assert.match(t, /Records by status/); assert.match(t, /All modules, system-wide/); assert.match(t, /Recent system activity/);
  assert.match(t, /View full log/); assert.match(t, /Updated 08:27 AM/i);
  assert.match(t, /UPDATE.*Ana.*DeliveryRecord.*REC-12345678…/);
  assert.match(html(), /<button[^>]*type="button"[^>]*>/);
});

test('empty panels are calm', () => {
  const t = text(html({ stats: { ...stats, records_by_status: [], recent_audit: [] } }));
  assert.match(t, /No records found/); assert.match(t, /No activity recorded today/);
});

test('no access removes the tile buttons and the audit row actions', () => {
  const markup = html({ canAccess: () => false });
  assert.doesNotMatch(markup, /aria-label="[^"]*View list/); assert.doesNotMatch(markup, /View full log/);
  assert.match(markup, /disabled=""/);
});

test('copy has no em dash, uppercase labels or pulse', () => {
  const markup = html();
  assert.equal(markup.includes('—'), false);
  assert.doesNotMatch(markup, /animate-pulse|font-black|tracking-wider/);
  assert.match(markup, /<h1[^>]*>Admin dashboard/);
});
