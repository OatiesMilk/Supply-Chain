import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDate, fmtTime } from '../export';

test('date-only exports preserve the Manila calendar date', () => {
  assert.equal(fmtDate('2026-10-06'), 'Oct 6, 2026');
});

test('timestamp exports display the Manila calendar date and clock time', () => {
  assert.equal(fmtDate('2026-10-05T16:30:00.000Z'), 'Oct 6, 2026');
  assert.equal(fmtTime('2026-10-05T16:30:00.000Z'), '12:30 AM');
});
