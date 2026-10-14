import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { formatManilaTime, formatManilaTimestamp } from '../src/utils/manilaTimestamp';
import DeliveryRecordWorkspace from '../src/features/deliveries/DeliveryRecordWorkspace';
import type { DeliveryRecord } from '../src/types';

const TIME_IN = '2026-10-14T01:48:00.000Z';
const TIME_OUT = '2026-10-14T18:30:00.000Z';

test('UTC timestamps render as explicit 12-hour Manila time independent of host timezone', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = timezone;
      assert.equal(formatManilaTime(TIME_IN), '09:48 AM');
      assert.equal(formatManilaTime(TIME_OUT), '02:30 AM');
      assert.equal(formatManilaTimestamp(TIME_IN), 'Oct 14, 2026, 09:48 AM');
      assert.equal(formatManilaTimestamp(TIME_OUT), 'Oct 15, 2026, 02:30 AM');
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('missing and invalid timestamps display an em dash', () => {
  for (const value of [null, undefined, '', '   ', 'not-a-timestamp', '2026-99-99T25:99:00Z']) {
    assert.equal(formatManilaTime(value), '—');
    assert.equal(formatManilaTimestamp(value), '—');
  }
});

const record: DeliveryRecord = {
  id: 'timestamp-fixture', company_id: 'company-fixture', company_name: 'Timestamp fixture',
  priority: '2 - Moderate', reference: 'TIMESTAMP-TEST', remarks: '', status: 'Delivered',
  vehicle: '', area: 'Makati', driver: 'Assigned driver', driver_assistants: [],
  time_in: TIME_IN, time_out: TIME_OUT, account_manager: '', delivery_date: '2026-10-14',
  category: 'Deliveries', item_type: 'Small Item', is_draft: 'No', item_description: '',
  attachments: [], email_notification_sent: false, output_actions_log: [],
  created_by: 'Test creator', modified_by: 'Test editor', created_at: TIME_IN, modified_at: TIME_OUT,
};

function workspace(client: QueryClient, value = record) {
  return React.createElement(QueryClientProvider, { client }, React.createElement(DeliveryRecordWorkspace, {
    record: value, allRecordIds: [value.id], currentUserRole: 'Logistics', currentUserName: 'Test user',
    companies: [], onBack: () => {}, onNavigateToRecord: () => {}, onUpdateRecord: async () => {},
    outputActionConfigs: {} as React.ComponentProps<typeof DeliveryRecordWorkspace>['outputActionConfigs'],
  }));
}

test('workspace header, Overview and its editing state show Manila timestamps with safe empty values', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async () => { root.render(workspace(client)); });
    const html = dom.window.document.body.innerHTML;
    assert.match(html, />Time in:<\/dt><dd[^>]*>09:48 AM<\/dd>/);
    assert.match(html, />Time out:<\/dt><dd[^>]*>02:30 AM<\/dd>/);
    assert.match(html, /Oct 14, 2026, 09:48 AM/);
    assert.match(html, /Oct 15, 2026, 02:30 AM/);
    assert.doesNotMatch(html, /2026-10-14T01:48|2026-10-14T18:30/);
    const edit = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Edit');
    assert.ok(edit, 'Logistics Overview edit button is available');
    await act(async () => { edit.click(); });
    const text = dom.window.document.body.textContent!;
    assert.match(text, /Time In\s*\(Logistics only\)Oct 14, 2026, 09:48 AM/);
    assert.match(text, /Time Out\s*\(Logistics only\)Oct 15, 2026, 02:30 AM/);
    assert.doesNotMatch(text, /2026-10-14T01:48|2026-10-14T18:30/);
    await act(async () => { root.render(workspace(client, { ...record, id: 'empty-timestamps', time_in: null, time_out: 'invalid' })); });
    const empty = dom.window.document.body.innerHTML;
    assert.match(empty, />Time in:<\/dt><dd[^>]*>—<\/dd>/);
    assert.match(empty, />Time out:<\/dt><dd[^>]*>—<\/dd>/);
    assert.doesNotMatch(empty, /Invalid Date/);
  } finally {
    await act(async () => { root.unmount(); });
    client.clear(); dom.window.close();
    for (const key of ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
