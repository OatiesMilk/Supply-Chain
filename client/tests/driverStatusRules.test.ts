import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDriverStatusUpdates, driverStatusDateError } from '../src/features/drivers/driverStatusRules';
import type { DeliveryCategory } from '../src/types';

test('Drivers View rescheduling requires and sends delivery_date only for Deliveries managed by Logistics or Admin', () => {
  const today = '2026-11-13';
  const current = '2026-11-13';
  const next = '2026-11-15';

  for (const role of ['LOGISTICS', 'ADMIN'] as const) {
    assert.match(driverStatusDateError('Deliveries', 'Rescheduled', '', current, role, today) ?? '', /Enter the new/);
    assert.match(driverStatusDateError('Deliveries', 'Rescheduled', '2026-11-12', current, role, today) ?? '', /past/);
    assert.match(driverStatusDateError('Deliveries', 'Rescheduled', current, current, role, today) ?? '', /different/);
    assert.equal(driverStatusDateError('Deliveries', 'Rescheduled', next, current, role, today), null);

    const payload = buildDriverStatusUpdates({
      category: 'Deliveries',
      status: 'Rescheduled',
      remarks: 'Client requested next week',
      receivedBy: '',
      rescheduleDate: next,
      role,
    });
    assert.deepEqual(payload, {
      status: 'Rescheduled',
      status_remarks: 'Client requested next week',
      delivery_date: next,
    });
  }
});

test('Drivers View rescheduling omits delivery_date for non-Delivery categories and non-Logistics/Admin roles', () => {
  const nonDeliveryCategories: DeliveryCategory[] = ['Procurement Pick-up', 'Sales Orders', 'Accounting Collection'];

  for (const category of nonDeliveryCategories) {
    for (const role of ['LOGISTICS', 'ADMIN', 'SALES_COORDINATOR'] as const) {
      assert.equal(driverStatusDateError(category, 'Rescheduled', '', '2026-11-13', role, '2026-11-13'), null);
      const payload = buildDriverStatusUpdates({
        category,
        status: 'Rescheduled',
        remarks: 'Site closed',
        receivedBy: '',
        rescheduleDate: '2026-11-15',
        role,
      });
      assert.deepEqual(payload, {
        status: 'Rescheduled',
        status_remarks: 'Site closed',
      });
      assert.equal('delivery_date' in payload, false);
    }
  }

  assert.equal(driverStatusDateError('Deliveries', 'Rescheduled', '', '2026-11-13', 'SALES_COORDINATOR', '2026-11-13'), null);
  const scPayload = buildDriverStatusUpdates({
    category: 'Deliveries',
    status: 'Rescheduled',
    remarks: 'SC reschedule',
    receivedBy: '',
    rescheduleDate: '2026-11-15',
    role: 'SALES_COORDINATOR',
  });
  assert.equal('delivery_date' in scPayload, false);
});
