import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manilaDateRange, manilaStartOfDay, manilaTodayRange, manilaWeekStart } from '../src/services/dateSemantics';

test('Manila date filters include the full final calendar day with a half-open UTC range', () => {
  const range = manilaDateRange('2026-10-06', '2026-10-06');
  assert.equal(range.gte?.toISOString(), '2026-10-05T16:00:00.000Z');
  assert.equal(range.lt?.toISOString(), '2026-10-06T16:00:00.000Z');
});

test('Manila boundaries work for one-sided ranges and Sunday week starts', () => {
  assert.equal(manilaDateRange('2026-01-01').gte?.toISOString(), '2025-12-31T16:00:00.000Z');
  assert.equal(manilaDateRange(undefined, '2026-01-01').lt?.toISOString(), '2026-01-01T16:00:00.000Z');
  assert.equal(manilaWeekStart('2026-10-06').toISOString(), '2026-10-03T16:00:00.000Z');
  assert.equal(manilaStartOfDay('2026-10-06').toISOString(), '2026-10-05T16:00:00.000Z');
});

test('today range follows the Manila calendar around UTC midnight', () => {
  const range = manilaTodayRange(new Date('2026-10-05T16:01:00.000Z'));
  assert.equal(range.dateStr, '2026-10-06');
  assert.equal(range.start.toISOString(), '2026-10-05T16:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-10-06T16:00:00.000Z');
});

test('Manila date ranges reject impossible dates and reversed bounds', () => {
  assert.throws(() => manilaDateRange('2026-02-30'), /valid YYYY-MM-DD/);
  assert.throws(() => manilaDateRange('2026-10-07', '2026-10-06'), /on or before/);
});
