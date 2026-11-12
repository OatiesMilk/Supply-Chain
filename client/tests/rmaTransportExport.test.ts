import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmaWorkflowExportFields } from '../src/utils/rmaTransport';
import type { DeliveryRecord } from '../src/types';
import { RMA_EXTRA_COLUMNS } from '../src/utils/export';

test('RMA exports keep transport, physical receipt and final completion separate using Manila time', () => {
  const record = { rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'COMPLETED', rma_transport_started_at: '2026-10-28T01:00:00Z', rma_transport_completed_at: '2026-10-28T02:00:00Z', rma_received_at: '2026-10-28T03:00:00Z', rma_recipient: 'Collector', rma_completed_at: null } as DeliveryRecord;
  const fields = rmaWorkflowExportFields(record);
  assert.equal(fields.rma_movement_fmt, 'Logistics transport'); assert.equal(fields.rma_transport_status_fmt, 'Complete');
  assert.match(fields.rma_transport_started_at_fmt, /09:00 AM/); assert.match(fields.rma_transport_completed_at_fmt, /10:00 AM/);
  assert.match(fields.rma_received_at_fmt, /11:00 AM/); assert.equal(fields.rma_recipient, 'Collector');
  assert.equal(fields.rma_completed_at_fmt, '', 'transport completion and receipt cannot invent final RMA completion');
  for (const key of Object.keys(fields)) assert.ok(RMA_EXTRA_COLUMNS.some(column => column.key === key), key);
});

test('supplier/no-driver exports do not fabricate driver transport clocks', () => {
  const fields = rmaWorkflowExportFields({ rma_movement: 'INTERNAL_NO_DRIVER' } as DeliveryRecord);
  assert.equal(fields.rma_movement_fmt, 'Internal / no driver');
  assert.equal(fields.rma_transport_status_fmt, ''); assert.equal(fields.rma_transport_started_at_fmt, '');
  assert.equal(fields.rma_transport_completed_at_fmt, ''); assert.equal(fields.rma_received_at_fmt, '');
});
