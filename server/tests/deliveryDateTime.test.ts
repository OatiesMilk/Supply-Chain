import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDateTimeLocal } from '../src/services/deliveryLifecycle';

test('accepts a valid local date-time in the HTML datetime-local format', () => {
  assert.equal(isValidDateTimeLocal('2026-10-08T07:05'), true);
  assert.equal(isValidDateTimeLocal('2026-10-08T07:05:30'), true);
});

test('rejects invalid dates, times, and timezone-bearing values', () => {
  assert.equal(isValidDateTimeLocal('2026-02-30T07:05'), false);
  assert.equal(isValidDateTimeLocal('2026-10-08T24:05'), false);
  assert.equal(isValidDateTimeLocal('2026-10-08T07:60'), false);
  assert.equal(isValidDateTimeLocal('2026-10-08T07:05:00Z'), false);
});
