import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DriverDashboard from '../src/features/dashboard/DriverDashboard';
import { installLegacySession } from './helpers/permissionSession';
import { manilaToday } from '../src/utils/recordLifecycle';
import type { DeliveryRecord } from '../src/types';

test('Driver accomplished list includes finalized logistics RMAs with completed Deliveries', async () => {
  installLegacySession('DRIVER', 'driver_dashboard');
  const today = manilaToday();
  const completedAt = new Date(`${today}T12:00:00+08:00`).toISOString();
  const common = {
    company_id: 'company-1', priority: '2 - Moderate', remarks: '', vehicle: '(None)', area: 'Makati',
    driver: 'John Doe', driver_id: 'driver-1', driver_assistants: [], time_in: null, time_out: null,
    received_by: null, account_manager: 'AM', delivery_date: today, item_type: 'Unit', is_draft: 'No',
    item_description: 'Returned unit', attachments: [], email_notification_sent: false, output_actions_log: [],
    created_by: 'Logistics', modified_by: 'TASS', created_at: '', modified_at: completedAt,
  };
  const delivery = { ...common, id: 'delivery-1', category: 'Deliveries', status: 'Delivered', reference: 'DEL-1',
    company_name: 'Delivery customer', time_out: completedAt } as DeliveryRecord;
  const rma = { ...common, id: 'rma-1', category: 'RMA', status: 'Delivered', reference: '',
    company_name: 'Octagon Computer Superstore', rma_reference: 'REC-14836', rma_movement: 'LOGISTICS_TRANSPORT',
    rma_transport_status: 'COMPLETED', rma_transport_completed_at: completedAt, rma_received_at: completedAt,
    rma_recipient: 'Warehouse', rma_completed_at: completedAt } as DeliveryRecord;
  const queryClient = new QueryClient();
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true });
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(DriverDashboard, {
        records: [delivery, rma], currentUserName: 'John Doe', currentUserEmail: 'driver@example.test',
        canManageAdmin: false, onNavigate() {}, onUpdateRecord: async () => {}, onLogout() {}, dataLoading: false,
        dashboardCounts: { today: 1, remaining: 0, completed: 2, rma_active: 0, rma_completed: 0 },
      }))));
    const html = dom.window.document.body.innerHTML;
    assert.match(html, /Accomplished \(2\)/);
    assert.match(html, /REC-14836/);
    assert.match(html, /Octagon Computer Superstore/);
    assert.match(html, /Transport complete:/);
    assert.match(html, /RMA complete/);
    assert.doesNotMatch(html, /RMA transport records/);
  } finally {
    await act(async () => root.unmount()); queryClient.clear(); dom.window.close();
    for (const name of Object.keys(globals)) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name); }
  }
});
