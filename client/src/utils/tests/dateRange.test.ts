import test from 'node:test';
import assert from 'node:assert/strict';
import { DATE_RANGE_ERROR, dateRangeAfterFromChange, dateRangeState } from '../dateRange';

test('Logistics Deliveries rejects an earlier Date To and applies neither half of the invalid range', () => {
  assert.deepEqual(dateRangeState('2026-10-08', '2026-10-01', true), {
    error: DATE_RANGE_ERROR,
    dateToMin: '2026-10-08',
    appliedDateFrom: '',
    appliedDateTo: '',
  });
});

test('equal dates are a valid one-day range', () => {
  assert.deepEqual(dateRangeState('2026-10-08', '2026-10-08', true), {
    error: null,
    dateToMin: '2026-10-08',
    appliedDateFrom: '2026-10-08',
    appliedDateTo: '2026-10-08',
  });
});

test('clearing Date From removes the Date To minimum and retains Date To', () => {
  assert.deepEqual(dateRangeState('', '2026-10-08', true), {
    error: null,
    dateToMin: undefined,
    appliedDateFrom: '',
    appliedDateTo: '2026-10-08',
  });
});

test('moving Date From after an existing Date To clears Date To', () => {
  assert.deepEqual(dateRangeAfterFromChange('2026-10-09', '2026-10-08', true), {
    dateFrom: '2026-10-09',
    dateTo: '',
  });
});

test('shared views outside Logistics Deliveries retain their existing unvalidated range behavior', () => {
  assert.deepEqual(dateRangeState('2026-10-08', '2026-10-01', false), {
    error: null,
    dateToMin: undefined,
    appliedDateFrom: '2026-10-08',
    appliedDateTo: '2026-10-01',
  });
  assert.deepEqual(dateRangeAfterFromChange('2026-10-09', '2026-10-08', false), {
    dateFrom: '2026-10-09',
    dateTo: '2026-10-08',
  });
});
