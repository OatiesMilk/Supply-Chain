import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECORD_NO_MAX_LENGTH, RECORD_NO_PATTERN, RECORD_NO_PREFIX, formatRecordNo, generateRecordId, manilaYear, parseRecordNo } from '../src/services/recordIds';

test('formatRecordNo uses the approved prefix for every record type', () => {
  assert.deepEqual(
    Object.keys(RECORD_NO_PREFIX).map(category => formatRecordNo(category, 2026, 42)),
    ['DEL-26-00042', 'RMA-26-00042', 'PUP-26-00042', 'SO-26-00042', 'COL-26-00042'],
  );
});

test('formatRecordNo stays within the length limit and matches the pattern', () => {
  for (const category of Object.keys(RECORD_NO_PREFIX)) {
    const value = formatRecordNo(category, 2026, 99_999);
    assert.match(value, RECORD_NO_PATTERN);
    assert.ok(value.length <= 12, value);
  }
  const overflow = formatRecordNo('DELIVERY', 2026, 100_000);
  assert.equal(overflow, 'DEL-26-100000');
  assert.match(overflow, RECORD_NO_PATTERN);
  assert.ok(overflow.length <= RECORD_NO_MAX_LENGTH);
});

test('formatRecordNo pads the year and rejects bad input', () => {
  assert.equal(formatRecordNo('RMA', 2105, 1), 'RMA-05-00001');
  assert.throws(() => formatRecordNo('UNKNOWN', 2026, 1), /Unknown record category/);
  assert.throws(() => formatRecordNo('RMA', 2026, 0), /sequence/);
  assert.throws(() => formatRecordNo('RMA', 2026, 1.5), /sequence/);
  assert.throws(() => formatRecordNo('RMA', -1, 1), /year/);
});

test('manilaYear rolls over at Manila midnight, not UTC midnight', () => {
  // 31 Dec 2026 23:30 Manila is 15:30 UTC; 1 Jan 2027 00:30 Manila is 16:30 UTC on 31 Dec.
  assert.equal(manilaYear(new Date('2026-12-31T15:30:00Z')), 2026);
  assert.equal(manilaYear(new Date('2026-12-31T16:30:00Z')), 2027);
  assert.throws(() => manilaYear(new Date('nope')), /valid date/);
});

test('parseRecordNo accepts typed record numbers and rejects internal keys', () => {
  assert.equal(parseRecordNo(' del-26-00042 '), 'DEL-26-00042');
  assert.equal(parseRecordNo('SO-26-00381'), 'SO-26-00381');
  assert.equal(parseRecordNo(generateRecordId()), null);
  assert.equal(parseRecordNo('REC-4001'), null);
  assert.equal(parseRecordNo('DEL-2026-00042'), null);
  assert.equal(parseRecordNo(42), null);
});
