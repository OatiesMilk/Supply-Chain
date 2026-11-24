import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RMA_CATEGORIES, normalizeRmaCategory, parseRmaEventDate, rmaInputError } from '../src/services/rmaRules';
import { RMA_CATEGORIES as CLIENT_CATEGORIES } from '../../client/src/utils/rma';

test('client and server expose the same seven legacy RMA categories', () => {
  assert.deepEqual([...RMA_CATEGORIES], [...CLIENT_CATEGORIES]);
  for (const category of RMA_CATEGORIES) assert.equal(rmaInputError({ rma_type: category }), null);
  assert.match(rmaInputError({ rma_type: 'Unsupported' })!, /Category must be/);
  assert.match(rmaInputError({ rma_type: 42 })!, /Category must be/);
});

test('Reference and Category stay optional, while supplied values are validated', () => {
  const required = { priority: '2 - Moderate', area: 'Carmona', account_manager: 'Alex AM' };
  for (const rma_reference of [undefined, '', null, '00042 / manual-Ref']) {
    assert.equal(rmaInputError({ ...required, rma_reference }, true), null);
  }
  assert.match(rmaInputError({ rma_reference: 42 })!, /Reference must be text/);
  assert.equal(normalizeRmaCategory('Pull out'), 'Pull-Out Slip');
  assert.equal(normalizeRmaCategory('Return to suppliers'), 'Return to Supplier');
  assert.equal(normalizeRmaCategory('Return to Customer'), 'Return to Customer');
  assert.equal(normalizeRmaCategory(null), null);
});

test('parseRmaEventDate defaults blanks to now and bounds Manila dates and ISO timestamps', () => {
  // 2026-11-24 10:00 Manila.
  const now = new Date('2026-11-24T02:00:00.000Z');
  const parse = (value: unknown, minDate?: string) => parseRmaEventDate(value, { label: 'Receipt date', minDate, now,
    minDateError: minDate ? 'Receipt date cannot be earlier than the transport completion date.' : undefined });
  for (const blank of [undefined, null, '', '   ']) assert.deepEqual(parse(blank), { ok: true, date: now });
  assert.deepEqual(parse('2026-11-24'), { ok: true, date: now }, "today keeps the exact server time");
  assert.deepEqual(parse(' 2026-11-20 '), { ok: true, date: new Date('2026-11-20T04:00:00.000Z') }, 'past day is stored at Manila noon');
  assert.deepEqual(parse('2026-11-20T15:00:00+08:00'), { ok: true, date: new Date('2026-11-20T07:00:00.000Z') });
  // Chronology compares Manila calendar days: same day as the lower bound is accepted.
  assert.equal(parse('2026-11-20', '2026-11-20').ok, true);
  assert.equal(parse('2026-11-20T00:30:00+08:00', '2026-11-20').ok, true);
  const early = parse('2026-11-19', '2026-11-20');
  assert.deepEqual(early, { ok: false, error: 'Receipt date cannot be earlier than the transport completion date.' });
  // 2026-11-19T16:30Z is already 2026-11-20 in Manila.
  assert.equal(parse('2026-11-19T16:30:00Z', '2026-11-20').ok, true);
  assert.deepEqual(parseRmaEventDate('2026-11-19', { label: 'Completion date', minDate: '2026-11-20', now }),
    { ok: false, error: 'Completion date cannot be earlier than 2026-11-20.' });
  for (const [value, message] of [
    ['2026-11-25', 'Receipt date cannot be in the future.'],
    ['2026-11-24T16:30:00Z', 'Receipt date cannot be in the future.'],
    ['1999-12-31', 'Receipt date must be on or after 2000-01-01.'],
    ['1999-12-31T12:00:00+08:00', 'Receipt date must be on or after 2000-01-01.'],
    ['2026-02-30', 'Receipt date must be a valid YYYY-MM-DD date or ISO timestamp with timezone.'],
    ['2026-11-20T12:00', 'Receipt date must be a valid YYYY-MM-DD date or ISO timestamp with timezone.'],
    ['not-a-date', 'Receipt date must be a valid YYYY-MM-DD date or ISO timestamp with timezone.'],
    [20261120, 'Receipt date must be a valid YYYY-MM-DD date or ISO timestamp with timezone.'],
    [new Date(), 'Receipt date must be a valid YYYY-MM-DD date or ISO timestamp with timezone.'],
  ] as const) assert.deepEqual(parse(value), { ok: false, error: message }, String(value));
});

test('parseRmaEventDate rejects impossible ISO timestamps and accepts real leap days', () => {
  const now = new Date('2026-11-24T02:00:00.000Z');
  const error = 'Receipt date must be a valid YYYY-MM-DD date or ISO timestamp with timezone.';
  for (const value of [
    '2026-02-30T12:00:00Z', '2026-02-29T12:00:00Z', '2026-04-31T00:00:00+08:00',
    '2026-11-20T24:00:00Z', '2026-11-20T12:60:00Z', '2026-11-20T12:00:60Z',
    '2026-11-20T12:00:00+25:00', '2026-11-20T12:00:00+08:60',
  ]) assert.deepEqual(parseRmaEventDate(value, { label: 'Receipt date', now }), { ok: false, error }, value);
  assert.deepEqual(parseRmaEventDate('2024-02-29', { label: 'Receipt date', now }), { ok: true, date: new Date('2024-02-29T04:00:00.000Z') });
  assert.deepEqual(parseRmaEventDate('2024-02-29T12:00:00Z', { label: 'Receipt date', now }), { ok: true, date: new Date('2024-02-29T12:00:00.000Z') });
  assert.deepEqual(parseRmaEventDate('2000-02-29T00:00:00+08:00', { label: 'Receipt date', now }), { ok: true, date: new Date('2000-02-28T16:00:00.000Z') });
});
