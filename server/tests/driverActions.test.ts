import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driverActions, receivedByError, RECEIVED_BY_REQUIRED } from '../src/services/driverActions';

const now = new Date('2026-11-11T02:00:00Z'); // 2026-11-11 10:00 Manila
const run = (changes: Record<string, unknown> = {}) => ({
  category: 'DELIVERY', draft: false, status: 'SCHEDULED', driver: 'Driver One', driverId: 'profile-one',
  deliveryDate: '2026-11-11', timeIn: null, ...changes,
}) as any;
const rma = (changes: Record<string, unknown> = {}) => run({ category: 'RMA', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'PENDING', rmaReceivedAt: null, ...changes });

test('non-RMA runs offer Start before Time In and Complete after it, for every category', () => {
  for (const category of ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS', 'ACCOUNTING_COLLECTION']) {
    assert.deepEqual(driverActions(run({ category }), now), { start: true, complete: false, start_blocked_reason: null }, category);
    assert.deepEqual(driverActions(run({ category, status: 'IN_TRANSIT', timeIn: '2026-11-11T01:00:00.000Z' }), now), { start: false, complete: true, start_blocked_reason: null }, category);
    assert.deepEqual(driverActions(run({ category, status: 'PENDING', timeIn: '2026-11-11T01:00:00.000Z' }), now), { start: false, complete: true, start_blocked_reason: null }, `${category} Pending stays completable`);
    assert.deepEqual(driverActions(run({ category, status: 'RESCHEDULED' }), now), { start: true, complete: false, start_blocked_reason: null }, `${category} Rescheduled can start again`);
    assert.deepEqual(driverActions(run({ category, status: 'ACCOMPLISHED', timeIn: '2026-11-11T01:00:00.000Z' }), now), { start: false, complete: false, start_blocked_reason: null });
  }
});

test('blocked runs explain why Start is not available', () => {
  assert.deepEqual(driverActions(run({ status: 'ON_HOLD' }), now), { start: false, complete: false, start_blocked_reason: 'On hold. Contact Logistics.' });
  assert.match(driverActions(run({ deliveryDate: '2026-11-12' }), now).start_blocked_reason ?? '', /future date/);
  assert.match(driverActions(run({ driver: '' }), now).start_blocked_reason ?? '', /Assign a driver/);
  assert.deepEqual(driverActions(run({ draft: true }), now), { start: false, complete: false, start_blocked_reason: null });
});

test('RMA transport offers Start while pending and Complete while in transit, only for Logistics transport', () => {
  assert.deepEqual(driverActions(rma(), now), { start: true, complete: false, start_blocked_reason: null });
  assert.deepEqual(driverActions(rma({ rmaTransportStatus: 'IN_TRANSIT' }), now), { start: false, complete: true, start_blocked_reason: null });
  assert.deepEqual(driverActions(rma({ rmaTransportStatus: 'COMPLETED' }), now), { start: false, complete: false, start_blocked_reason: null });
  assert.match(driverActions(rma({ deliveryDate: '2026-11-12' }), now).start_blocked_reason ?? '', /future date/);
  for (const rmaMovement of ['INTERNAL_NO_DRIVER', 'SUPPLIER_COLLECTION']) {
    assert.deepEqual(driverActions(rma({ rmaMovement }), now), { start: false, complete: false, start_blocked_reason: null }, rmaMovement);
  }
  assert.deepEqual(driverActions(rma({ rmaReceivedAt: new Date() }), now), { start: false, complete: false, start_blocked_reason: null });
});

test('Received By must be a non-empty name of at most 120 characters', () => {
  for (const value of [undefined, null, '', '   ', 42]) assert.equal(receivedByError(value), RECEIVED_BY_REQUIRED);
  assert.match(receivedByError('x'.repeat(121)) ?? '', /120 characters/);
  assert.equal(receivedByError(' Guard '), null);
});
