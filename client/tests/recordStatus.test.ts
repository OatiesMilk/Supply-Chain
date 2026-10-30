import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RecordStatus, { RecordStatusProgress } from '../src/components/RecordStatus';
import type { DeliveryRecord } from '../src/types';

const rma = (fields: Partial<DeliveryRecord> = {}) => ({ category: 'RMA', status: 'Scheduled', is_draft: 'No',
  rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'PENDING', ...fields } as DeliveryRecord);
const text = (record: DeliveryRecord, progress = false) => renderToStaticMarkup(React.createElement(progress ? RecordStatusProgress : RecordStatus, { record })).replace(/<[^>]*>/g, '');

test('RMA labels track transport, receipt and final completion separately', () => {
  assert.equal(text(rma()), 'Transport: PendingRMA: Scheduled');
  assert.equal(text(rma({ rma_transport_status: 'IN_TRANSIT' })), 'Transport: In TransitRMA: Scheduled');
  const deliveredTransport = rma({ rma_transport_status: 'COMPLETED' });
  assert.equal(text(deliveredTransport), 'Transport: CompleteRMA: Scheduled');
  assert.match(text(deliveredTransport, true), /Awaiting physical receipt confirmation/);
  const received = { ...deliveredTransport, rma_received_at: '2026-10-30T01:00:00Z' };
  assert.equal(text(received), 'Transport: CompleteReceipt: ConfirmedRMA: Scheduled');
  assert.match(text(received, true), /Awaiting final RMA completion/);
  assert.equal(text({ ...received, status: 'Delivered' }), 'Transport: CompleteReceipt: ConfirmedRMA: Complete');
  assert.doesNotMatch(text({ ...received, status: 'Delivered' }, true), /Awaiting/);
});

test('draft, supplier and internal RMAs do not imply an active Driver transport', () => {
  assert.equal(text(rma({ is_draft: 'Yes' })), 'RMA: Draft');
  for (const rma_movement of ['SUPPLIER_COLLECTION', 'INTERNAL_NO_DRIVER', null] as const) {
    assert.equal(text(rma({ rma_movement })), 'RMA: Scheduled');
  }
});

test('Sales, Logistics and Driver ordinary record labels keep the saved lifecycle status', () => {
  for (const category of ['Sales Orders', 'Deliveries', 'Procurement Pick-up', 'Accounting Collection'] as const) {
    for (const status of ['Draft', 'Scheduled', 'In Transit', 'Delivered', 'Pending', 'On-Hold', 'Rescheduled'] as const) {
      assert.equal(text(rma({ category, status })), status, `${category}: ${status}`);
      assert.doesNotMatch(text(rma({ category, status }), true), /Transport:|RMA:|Awaiting physical/);
    }
  }
});
