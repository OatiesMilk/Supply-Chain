import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LogisticsDashboard from '../src/features/dashboard/LogisticsDashboard';
import TassDashboard from '../src/features/dashboard/TassDashboard';
import AdminDashboard from '../src/features/dashboard/AdminDashboard';
import type { ApiDashboardOverview } from '../src/api';
import type { DeliveryRecord } from '../src/types';

const record = { id: 'one-preview', category: 'RMA', rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'PENDING',
  status: 'Scheduled', is_draft: 'No', company_name: 'Client', driver: '', area: 'Makati', delivery_date: '2026-10-30',
  created_at: '2026-10-29T01:00:00Z', reference: 'RMA-1' } as DeliveryRecord;
const overview: ApiDashboardOverview = {
  role: 'LOGISTICS', record_total: 6001, status_totals: {}, counts: { rma_requests: 6001, rma_attention: 6001, 'log-flags': 6001 },
  record_previews: { rma_requests: [record], rma_attention: [record] },
  drivers_out: [{ driver: 'Assigned Driver', total: 7001, records: [] }], drivers_out_total: 6001, unverified_collections_amount: 12345,
};
const text = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/<[^>]*>/g, '');

test('Logistics shows complete totals and view-all paths alongside bounded previews', () => {
  const html = text(React.createElement(LogisticsDashboard, { stats: null, overview, deliveryRecords: [], onNavigate() {} }));
  assert.match(html, /RMA transport requests.*6001 requests/);
  assert.match(html, /Showing 1 of 6001 requests/);
  assert.match(html, /6001 drivers/); assert.match(html, /7001 active deliveries/);
  assert.match(html, /View all 6001 assigned Drivers/);
  assert.doesNotMatch(html, /No RMA transport requests|No drivers currently assigned/);
});

test('TASS and Admin do not mistake preview length for full counts or amounts', () => {
  const tass = text(React.createElement(TassDashboard, { stats: null, overview, onNavigate() {} }));
  assert.match(tass, /6001 open/); assert.match(tass, /Showing 1 of 6001/);
  assert.doesNotMatch(tass, /No open RMA records/);
  const admin = text(React.createElement(AdminDashboard, { stats: { role: 'ADMIN', total_active_users: 1, user_breakdown: {},
    records_this_week: 0, unverified_collections: 6001, audit_events_today: 0, records_by_status: [], recent_audit: [] },
    overview, deliveryRecords: [], onNavigate() {} }));
  assert.match(admin, /12,345\.00/); assert.match(admin, /across 6001 records/);
});
