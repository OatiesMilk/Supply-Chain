import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveryDateFromDateTime, syncDateTimeToDeliveryDate } from '../deliveryScheduleDateTime';

test('changing Delivery Date preserves the selected time and aligns the date-time field', () => {
  assert.equal(syncDateTimeToDeliveryDate('2026-10-08T07:05', '2026-10-15'), '2026-10-15T07:05');
});

test('date-time input exposes its date for the linked Delivery Date field', () => {
  assert.equal(deliveryDateFromDateTime('2026-10-08T07:05'), '2026-10-08');
  assert.equal(deliveryDateFromDateTime(''), null);
});
