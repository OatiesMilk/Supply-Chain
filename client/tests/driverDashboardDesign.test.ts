import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DriverDashboard from '../src/features/dashboard/DriverDashboard';
import { installLegacySession } from './helpers/permissionSession';
import { manilaToday } from '../src/utils/recordLifecycle';
import type { DeliveryRecord } from '../src/types';

async function mount(props: Record<string, unknown>, run: (doc: Document) => void) {
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
      React.createElement(DriverDashboard, { records: [], currentUserName: 'John Doe', currentUserEmail: 'driver@example.test',
        canManageAdmin: false, onNavigate() {}, onUpdateRecord: async () => {}, onLogout() {}, dataLoading: false, ...props } as any))));
    run(dom.window.document);
  } finally {
    await act(async () => root.unmount()); queryClient.clear(); dom.window.close();
    for (const name of Object.keys(globals)) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name); }
  }
}

const today = manilaToday();
const run = { id: 'run-1', company_id: 'c1', priority: '2 - Moderate', remarks: '', vehicle: '(None)', area: 'Makati', driver: 'John Doe', driver_id: 'd1',
  driver_assistants: [], time_in: null, time_out: null, received_by: null, account_manager: 'AM', delivery_date: today, item_type: 'Unit', is_draft: 'No',
  item_description: 'Server', attachments: [], email_notification_sent: false, output_actions_log: [], created_by: 'x', modified_by: 'x', created_at: '', modified_at: '',
  category: 'Deliveries', status: 'Scheduled', reference: 'DEL-1', company_name: 'Acme', allowed_statuses: ['Pending', 'Rescheduled'] } as unknown as DeliveryRecord;

test('summary counters use the shared tile and the page the shared heading', async () => {
  await mount({ records: [run], dashboardCounts: { today: 1, remaining: 1, completed: 0, rma_active: 0, rma_completed: 0 } }, doc => {
    assert.equal(doc.querySelectorAll('[data-kpi-tile]').length, 3);
    const text = doc.body.textContent ?? '';
    assert.match(text, /Today's runs/); assert.match(text, /Accomplished/); assert.match(text, /Remaining/);
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(doc.querySelector('h1')?.textContent, 'Driver dashboard');
  });
});

test('run sections are shared panels and the workflow controls are unchanged', async () => {
  await mount({ records: [run], dashboardCounts: { today: 1, remaining: 1, completed: 0, rma_active: 0, rma_completed: 0 } }, doc => {
    const headings = [...doc.querySelectorAll('h2')].map(node => node.textContent);
    assert.ok(headings.includes('Active work (1)'));
    const buttons = [...doc.querySelectorAll('button')].map(node => node.getAttribute('aria-label') || node.textContent?.trim());
    assert.ok(buttons.includes('Record Time In: start transport'));
    for (const name of ['Accomplish', 'Pending', 'Reschedule']) assert.ok(buttons.includes(name), name);
  });
});

test('no em dash, no uppercase styling and no pulse remain on the driver screen', async () => {
  await mount({ records: [run], dashboardCounts: { today: 1, remaining: 1, completed: 0, rma_active: 0, rma_completed: 0 } }, doc => {
    const html = doc.body.innerHTML;
    assert.equal(html.includes('—'), false);
    assert.doesNotMatch(html, /animate-pulse|font-black|tracking-wider|class="[^"]*\buppercase\b/);
  });
});

test('first load shows skeleton tiles, never a number that later changes', async () => {
  await mount({ records: [], dataLoading: true }, doc => {
    assert.equal(doc.querySelectorAll('[data-kpi-tile][aria-busy="true"]').length, 3);
    assert.ok(doc.querySelector('[role="status"]'));
    assert.doesNotMatch(doc.querySelector('section[aria-label="Driver summary"]')?.textContent ?? '', /\d/);
  });
});

test('empty queue shows the shared calm empty state', async () => {
  await mount({ records: [], dashboardCounts: { today: 0, remaining: 0, completed: 0, rma_active: 0, rma_completed: 0 } }, doc => {
    assert.match(doc.body.textContent ?? '', /No records in this queue\./); assert.match(doc.body.textContent ?? '', /Contact Logistics|contact Logistics/);
  });
});
