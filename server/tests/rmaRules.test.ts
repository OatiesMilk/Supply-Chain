import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RMA_CATEGORIES, RMA_CATEGORY_META, canonicalRmaCategory, normalizeRmaCategory, parseRmaEventDate, rmaCategoryDbValues, rmaInputError, rmaInternalTransferError } from '../src/services/rmaRules';
import { RMA_AUTO_REFERENCE_PATTERN, formatRmaReference, manilaDateToMmddyy, previewRmaReferenceFormat, rmaPrefixForCategory } from '../src/services/rmaReference';
import { RMA_CATEGORIES as CLIENT_CATEGORIES } from '../../client/src/utils/rma';

test('client and server expose the same six TASS slip categories', () => {
  assert.deepEqual([...RMA_CATEGORIES], ['Pull Out Slip', 'Return to Customer Slip', 'Return to Supplier Slip', 'Advance Replacement Slip', 'Receiving Slip', 'Transfer Out Slip']);
  assert.deepEqual([...RMA_CATEGORIES], [...CLIENT_CATEGORIES]);
  assert.deepEqual(RMA_CATEGORIES.map(category => RMA_CATEGORY_META[category].prefix), ['POS', 'RTC', 'RTS', 'ARD', 'RR', 'TXO']);
  for (const retired of ['RESCH', 'Rescheduled', 'Sales Orders', 'Pick-Up', 'Others']) assert.equal((RMA_CATEGORIES as readonly string[]).includes(retired), false, retired);
  for (const category of RMA_CATEGORIES) assert.equal(rmaInputError({ rma_type: category }), null);
  assert.match(rmaInputError({ rma_type: 'Unsupported' })!, /Category must be/);
  assert.match(rmaInputError({ rma_type: 42 })!, /Category must be/);
});

test('legacy category labels normalize to the canonical slip while retired labels stay readable', () => {
  for (const [legacy, canonical] of [
    ['Pull-Out Slip', 'Pull Out Slip'], ['Pull out', 'Pull Out Slip'], ['POS', 'Pull Out Slip'],
    ['Return to Customer', 'Return to Customer Slip'], ['Return to Supplier', 'Return to Supplier Slip'], ['Return to suppliers', 'Return to Supplier Slip'],
    ['Advance Replacement Demo', 'Advance Replacement Slip'], ['Advance Replacement', 'Advance Replacement Slip'],
    ['Receiving Report', 'Receiving Slip'], ['RR', 'Receiving Slip'], ['TXO', 'Transfer Out Slip'],
  ]) {
    assert.equal(normalizeRmaCategory(legacy), canonical, legacy);
    assert.equal(rmaInputError({ rma_type: legacy }, false, { requireCategory: true }), null, legacy);
  }
  for (const retired of ['Sales Orders', 'Pick-Up', 'Others']) {
    assert.equal(normalizeRmaCategory(retired), retired, 'retired labels pass through on read');
    assert.equal(canonicalRmaCategory(retired), null);
    assert.match(rmaInputError({ rma_type: retired })!, /Category must be/, 'retired labels cannot be chosen');
    assert.equal(rmaInputError({ rma_type: retired }, false, { allowRetiredCategory: true }), null, 'an unchanged legacy label is accepted');
  }
  assert.equal(normalizeRmaCategory(null), null);
  assert.deepEqual(rmaCategoryDbValues('Pull Out Slip').sort(), ['POS', 'Pull Out Slip', 'Pull out', 'Pull-Out Slip'].sort());
  assert.deepEqual(rmaCategoryDbValues('Transfer Out Slip').sort(), ['TXO', 'Transfer Out Slip']);
});

test('new RMA creates require a category and never accept a manual reference', () => {
  const required = { priority: '2 - Moderate', area: 'Carmona', account_manager: 'Alex AM' };
  const create = { requireCategory: true, allowManualReference: false };
  assert.equal(rmaInputError({ ...required, rma_type: 'Pull Out Slip' }, true, create), null);
  for (const rma_type of [undefined, null, '', 'Others', 'RESCH']) assert.match(rmaInputError({ ...required, rma_type }, true, create)!, /^Category is required and must be one of/, String(rma_type));
  for (const rma_reference of [undefined, '', null, '  ']) assert.equal(rmaInputError({ ...required, rma_type: 'Pull Out Slip', rma_reference }, true, create), null);
  assert.equal(rmaInputError({ ...required, rma_type: 'Pull Out Slip', rma_reference: 'POS112026-01' }, true, create), 'RMA Document Reference is auto-generated on save and cannot be manually supplied.');
  assert.match(rmaInputError({ rma_reference: 42 })!, /Reference must be text/);
  assert.equal(rmaInputError({ is_internal_transfer: 'yes' }), 'is_internal_transfer must be true or false.');
});

test('non-RMA internal transfers are TXO only and never supplier collection', () => {
  for (const rmaMovement of ['LOGISTICS_TRANSPORT', 'INTERNAL_NO_DRIVER', null]) {
    assert.equal(rmaInternalTransferError({ rmaType: 'Transfer Out Slip', isInternalTransfer: true, rmaMovement }), null, String(rmaMovement));
  }
  assert.equal(rmaInternalTransferError({ rmaType: 'TXO', isInternalTransfer: true, rmaMovement: 'SUPPLIER_COLLECTION' }), 'Non-RMA internal transfers must use Logistics transport or Internal / no driver.');
  for (const rmaType of ['Pull Out Slip', 'Return to Customer Slip', 'Return to Supplier Slip', 'Advance Replacement Slip', 'Receiving Slip', null]) {
    assert.equal(rmaInternalTransferError({ rmaType, isInternalTransfer: true, rmaMovement: 'LOGISTICS_TRANSPORT' }), 'Non-RMA internal transfer is only supported for Transfer Out Slip (TXO) records.', String(rmaType));
    assert.equal(rmaInternalTransferError({ rmaType, isInternalTransfer: false, rmaMovement: 'SUPPLIER_COLLECTION' }), null);
  }
});

test('slip references format as <PREFIX><MMDDYY>-<NN> on the Manila calendar', () => {
  assert.equal(manilaDateToMmddyy('2026-11-20'), '112026');
  assert.equal(manilaDateToMmddyy('2030-01-05'), '010530');
  assert.throws(() => manilaDateToMmddyy('2026-02-30'));
  assert.throws(() => manilaDateToMmddyy('11/20/2026'));
  assert.equal(formatRmaReference('POS', '2026-11-20', 1), 'POS112026-01');
  assert.equal(formatRmaReference('RTC', '2026-11-20', 3), 'RTC112026-03');
  assert.equal(formatRmaReference('RR', '2026-11-20', 99), 'RR112026-99');
  assert.equal(formatRmaReference('POS', '2026-11-20', 100), 'POS112026-100', 'grows past two digits instead of failing');
  assert.throws(() => formatRmaReference('POS', '2026-11-20', 0));
  for (const reference of ['POS112026-01', 'TXO010530-100', 'RR112026-07']) assert.match(reference, RMA_AUTO_REFERENCE_PATTERN);
  for (const reference of ['POS112026-1', 'RMA112026-01', 'pos112026-01', 'SAP-RMA-3001']) assert.doesNotMatch(reference, RMA_AUTO_REFERENCE_PATTERN);
  assert.equal(rmaPrefixForCategory('Advance Replacement Demo'), 'ARD');
  assert.equal(rmaPrefixForCategory('Others'), null);
  // 2026-11-20 23:59:59 Manila vs 2026-11-21 00:00:00 Manila.
  assert.equal(previewRmaReferenceFormat('Pull Out Slip', new Date('2026-11-20T15:59:59Z')), 'POS112026-NN');
  assert.equal(previewRmaReferenceFormat('Pull Out Slip', new Date('2026-11-20T16:00:00Z')), 'POS112126-NN');
  assert.equal(previewRmaReferenceFormat(null), null);
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
