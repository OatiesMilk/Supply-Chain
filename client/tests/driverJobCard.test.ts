import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DriverDashboard from '../src/features/dashboard/DriverDashboard';
import { installLegacySession } from './helpers/permissionSession';
import { manilaToday } from '../src/utils/recordLifecycle';
import { driverCompletionError, driverJobActions, jobTypeLabel } from '../src/utils/driverJobs';
import type { DeliveryRecord } from '../src/types';

async function mount(records: DeliveryRecord[], run: (doc: Document) => void | Promise<void>) {
  installLegacySession('DRIVER', 'driver_dashboard');
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
      React.createElement(DriverDashboard, { records, currentUserName: 'John Doe', currentUserEmail: 'driver@example.test', canManageAdmin: false,
        onNavigate() {}, onUpdateRecord: async () => {}, onLogout() {}, dataLoading: false,
        dashboardCounts: { today: records.length, remaining: records.length, completed: 0, rma_active: 0, rma_completed: 0 } } as any))));
    await run(dom.window.document);
  } finally {
    await act(async () => root.unmount()); queryClient.clear(); dom.window.close();
    for (const name of Object.keys(globals)) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name); }
  }
}

const today = manilaToday();
const base = { company_id: 'c1', priority: '2 - Moderate', remarks: '', vehicle: '(None)', area: 'Makati', driver: 'John Doe', driver_id: 'd1',
  driver_assistants: [], time_in: null, time_out: null, received_by: null, account_manager: 'AM', delivery_date: today, item_type: 'Unit', is_draft: 'No',
  item_description: 'Server', attachments: [], email_notification_sent: false, output_actions_log: [], created_by: 'x', modified_by: 'x', created_at: '', modified_at: '',
  status: 'Scheduled', reference: 'REF-1', company_name: 'Acme', allowed_statuses: ['On-Hold', 'Rescheduled'] };
const job = (id: string, category: string, changes: Record<string, unknown> = {}) => ({ ...base, id, category, ...changes }) as unknown as DeliveryRecord;
const rma = (id: string, changes: Record<string, unknown> = {}) => job(id, 'RMA', { rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'PENDING', rma_reference: 'RMA-1', rma_version: 0, ...changes });

/** The card with its type label removed: everything else must be identical. */
function structure(card: Element) {
  return [...card.querySelectorAll('[data-card-header] > *, [data-driver-actions] > *, button, input, label')]
    .map(node => `${node.tagName}:${node.getAttribute('aria-label') ?? ''}:${node.tagName === 'BUTTON' ? node.textContent?.trim() : ''}`)
    .filter(entry => !entry.startsWith('BUTTON:Copy reference'));
}

test('every job type uses the same card and only the type label differs (not started)', async () => {
  const records = [job('d', 'Deliveries'), rma('r'), job('p', 'Procurement Pick-up'), job('s', 'Sales Orders')];
  await mount(records, doc => {
    const cards = [...doc.querySelectorAll('[data-driver-job-card]')];
    assert.deepEqual(cards.map(card => card.querySelector('[data-job-type]')?.textContent).sort(), ['Delivery', 'Procurement Pickup', 'RMA', 'Sales Order']);
    const shapes = cards.map(structure);
    for (const shape of shapes.slice(1)) assert.deepEqual(shape, shapes[0]);
    for (const card of cards) {
      const buttons = [...card.querySelectorAll('button')].map(node => node.textContent?.trim());
      assert.ok(buttons.includes('Start transport'));
      for (const banned of ['Pending', 'Reschedule', 'Accomplish', 'Transport actions']) assert.ok(!buttons.some(name => name?.includes(banned)), banned);
      assert.equal(card.querySelector('textarea'), null, 'no inline remarks box on any card');
    }
  });
});

test('started jobs of every type show the POD uploader, Received by and Complete delivery', async () => {
  const started = '2026-11-11T01:00:00.000Z';
  const records = [
    job('d', 'Deliveries', { status: 'In Transit', time_in: started }),
    rma('r', { rma_transport_status: 'IN_TRANSIT', rma_transport_started_at: started }),
    job('p', 'Procurement Pick-up', { status: 'In Transit', time_in: started }),
    job('s', 'Sales Orders', { status: 'In Transit', time_in: started }),
  ];
  await mount(records, doc => {
    const cards = [...doc.querySelectorAll('[data-driver-job-card]')];
    assert.equal(cards.length, 4);
    const shapes = cards.map(structure);
    for (const shape of shapes.slice(1)) assert.deepEqual(shape, shapes[0]);
    for (const card of cards) {
      assert.match(card.textContent ?? '', /Transport started:/);
      assert.match(card.textContent ?? '', /Received by \*/);
      const complete = [...card.querySelectorAll('button')].find(node => node.textContent?.trim() === 'Complete delivery') as HTMLButtonElement;
      assert.ok(complete, 'Complete delivery button');
      assert.equal(complete.disabled, true, 'disabled until a photo and Received By are provided');
      assert.ok(card.querySelector('input[type="text"]'), 'Received by input on every type, RMA included');
    }
  });
});

test('job type labels, server actions and completion rules', () => {
  assert.equal(jobTypeLabel('Deliveries'), 'Delivery');
  assert.equal(jobTypeLabel('RMA'), 'RMA');
  assert.equal(jobTypeLabel('Procurement Pick-up'), 'Procurement Pickup');
  assert.equal(jobTypeLabel('Sales Orders'), 'Sales Order');
  assert.equal(jobTypeLabel('Accounting Collection'), 'Accounting Collection');
  const serverSays = { start: false, complete: false, start_blocked_reason: 'This delivery is scheduled for a future date and is read-only until that date.' };
  assert.deepEqual(driverJobActions(job('x', 'Deliveries', { driver_actions: serverSays })), serverSays, 'server answer wins');
  assert.deepEqual(driverJobActions(job('x', 'Deliveries', { status: 'Pending', time_in: '2026-11-11T01:00:00.000Z' })), { start: false, complete: true, start_blocked_reason: null });
  assert.deepEqual(driverJobActions(job('x', 'Deliveries', { status: 'On-Hold' })), { start: false, complete: false, start_blocked_reason: 'On hold. Contact Logistics.' });
  assert.deepEqual(driverJobActions(rma('x', { rma_transport_status: 'IN_TRANSIT' })), { start: false, complete: true, start_blocked_reason: null });
  const ready = { loading: false, uploading: false, hasPhoto: true, loadFailed: false, hasStagedFiles: false };
  assert.equal(driverCompletionError('Guard', ready), null);
  assert.match(driverCompletionError('  ', ready) ?? '', /Received By is required/);
  assert.match(driverCompletionError('x'.repeat(121), ready) ?? '', /120 characters/);
  assert.match(driverCompletionError('Guard', { ...ready, hasPhoto: false, hasStagedFiles: true }) ?? '', /JPG or PNG/);
  assert.match(driverCompletionError('Guard', { ...ready, uploading: true }) ?? '', /upload to finish/);
  assert.match(driverCompletionError('Guard', undefined) ?? '', /Checking/);
});
