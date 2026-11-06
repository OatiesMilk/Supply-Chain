import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DoneRecordModal from '../src/features/dashboard/DoneRecordModal';
import type { DeliveryRecord } from '../src/types';

function completedLabel(fields: Partial<DeliveryRecord>): string {
  const client = new QueryClient();
  try {
    const record = { id: 'completion-date', category: 'Deliveries', status: 'Delivered',
      company_name: 'Test client', reference: 'DATE-1', delivery_date: '2026-10-14', ...fields } as DeliveryRecord;
    return renderToStaticMarkup(React.createElement(QueryClientProvider, { client },
      React.createElement(DoneRecordModal, { record, onClose() {} })));
  } finally { client.clear(); }
}

test('Driver completion details use actual Manila completion date for early and late deliveries', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Manila']) {
      process.env.TZ = timezone;
      const late = completedLabel({ time_out: '2026-10-14T18:30:00.000Z' });
      assert.match(late, /Accomplished on Oct 15, 2026, 02:30 AM/);
      assert.doesNotMatch(late, /Accomplished on Oct 14/);
      const early = completedLabel({ time_out: '2026-10-12T18:30:00.000Z' });
      assert.match(early, /Accomplished on Oct 13, 2026, 02:30 AM/);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test('missing or invalid completion timestamps never substitute the scheduled date', () => {
  for (const time_out of [null, undefined, '', 'invalid']) {
    const html = completedLabel({ time_out });
    assert.match(html, /Completion date unavailable/);
    assert.doesNotMatch(html, /Accomplished on|Invalid Date/);
  }
});

test('completed RMA details use the final RMA timestamp and show transport receipt events', () => {
  const html = completedLabel({ category: 'RMA', rma_completed_at: '2026-10-14T18:30:00.000Z',
    rma_transport_started_at: '2026-10-14T17:30:00.000Z', rma_transport_completed_at: '2026-10-14T18:00:00.000Z',
    rma_received_at: '2026-10-14T18:15:00.000Z', rma_recipient: 'Warehouse' });
  assert.match(html, /Accomplished RMA Details/);
  assert.match(html, /RMA completed on Oct 15, 2026, 02:30 AM/);
  assert.match(html, /Transport started: 01:30 AM/);
  assert.match(html, /Transport completed: 02:00 AM/);
  assert.match(html, /Physical receipt: 02:15 AM · Warehouse/);
  assert.match(html, /Return transport proof \(POD\)/);
});
