import test from 'node:test';
import assert from 'node:assert/strict';
import { rmaLogisticsTransportNotice, rmaReceivedByError } from '../rmaTransport';

test('Received by is required and limited to 120 characters', () => {
  assert.match(rmaReceivedByError('')!, /required/);
  assert.match(rmaReceivedByError('   ')!, /required/);
  assert.match(rmaReceivedByError('x'.repeat(121))!, /120/);
  assert.equal(rmaReceivedByError('x'.repeat(120)), null);
  assert.equal(rmaReceivedByError('  Warehouse guard '), null);
});

test('Logistics sees who it is recording for, or when transport can start', () => {
  const record = { driver: 'Juan Driver', driver_id: 'd1', delivery_date: '2026-11-20', rma_transport_status: 'PENDING' as const };
  assert.deepEqual(rmaLogisticsTransportNotice(record, true, '2026-11-13'), { kind: 'acting', text: 'Recording for Juan Driver. This is saved under your name.' });
  assert.deepEqual(rmaLogisticsTransportNotice(record, false, '2026-11-13'), { kind: 'future', text: 'Transport can start on 2026-11-20.' });
  assert.equal(rmaLogisticsTransportNotice(record, false, '2026-11-20'), null, 'planned date reached but no permission: no notice');
  assert.equal(rmaLogisticsTransportNotice({ ...record, driver_id: null }, false, '2026-11-13'), null);
  assert.equal(rmaLogisticsTransportNotice({ ...record, rma_transport_status: 'IN_TRANSIT' }, false, '2026-11-13'), null);
});
