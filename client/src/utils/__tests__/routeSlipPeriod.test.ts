import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterRouteSlipRecords, isRouteSlipDay, routeSlipDriverNames, routeSlipModeForDates, routeSlipPeriod, routeSlipPeriodLabel, routeSlipSelectionError } from '../routeSlipPeriod';

const rows = [
  { id: 'before', delivery_date: '2026-10-26' },
  { id: 'first', delivery_date: '2026-10-27' },
  { id: 'last', delivery_date: '2026-10-29' },
  { id: 'after', delivery_date: '2026-10-30' },
  { id: 'undated', delivery_date: '' },
  { id: 'invalid', delivery_date: '2026-02-30' },
];

test('route slips select a whole calendar day, an inclusive range, or every day from the starting date', () => {
  const selected = (period: Parameters<typeof filterRouteSlipRecords>[1]) => filterRouteSlipRecords(rows, period).map(row => row.id);
  assert.deepEqual(selected({ dateFrom: '2026-10-27', dateTo: '2026-10-27' }), ['first']);
  assert.deepEqual(selected({ dateFrom: '2026-10-27', dateTo: '2026-10-29' }), ['first', 'last']);
  assert.deepEqual(selected({ dateFrom: '2026-10-27' }), ['first', 'last', 'after']);
  assert.deepEqual(routeSlipPeriod({ mode: 'day', dateFrom: '2026-10-27', dateTo: '' }), { dateFrom: '2026-10-27', dateTo: '2026-10-27' });
  assert.deepEqual(routeSlipPeriod({ mode: 'from', dateFrom: '2026-10-27', dateTo: '2026-10-29' }), { dateFrom: '2026-10-27', dateTo: '' });
});

test('blank, partial range, inverted, impossible and timestamp inputs cannot silently generate an unbounded route slip', () => {
  for (const input of ['', '2026-02-30', '2026-13-01', '2026-1-02', '2026-10-27T00:00:00+08:00']) assert.equal(isRouteSlipDay(input), false);
  assert.equal(isRouteSlipDay('2024-02-29'), true);
  assert.equal(isRouteSlipDay('2026-02-29'), false);
  assert.match(routeSlipSelectionError({ mode: 'day', dateFrom: '', dateTo: '' })!, /Choose/);
  assert.match(routeSlipSelectionError({ mode: 'range', dateFrom: '2026-10-27', dateTo: '' })!, /both/);
  assert.match(routeSlipSelectionError({ mode: 'range', dateFrom: '2026-10-29', dateTo: '2026-10-27' })!, /earlier/);
  assert.match(routeSlipSelectionError({ mode: 'range', dateFrom: '', dateTo: '2026-10-27' })!, /From/);
  assert.throws(() => filterRouteSlipRecords(rows, { dateFrom: '' }), /Choose/);
});

test('period labels preserve calendar dates across host timezones and distinguish an open ending', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['America/Los_Angeles', 'Asia/Manila', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      assert.equal(routeSlipPeriodLabel({ dateFrom: '2026-10-27', dateTo: '2026-10-27' }), '27 Oct 2026');
      assert.equal(routeSlipPeriodLabel({ dateFrom: '2026-10-27', dateTo: '2026-10-29' }), '27 Oct 2026 – 29 Oct 2026');
      assert.equal(routeSlipPeriodLabel({ dateFrom: '2026-10-27' }), 'From 27 Oct 2026 onward');
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
  assert.equal(routeSlipModeForDates('2026-10-27', '2026-10-27'), 'day');
  assert.equal(routeSlipModeForDates('2026-10-27', ''), 'from');
  assert.equal(routeSlipModeForDates('2026-10-27', '2026-10-29'), 'range');
});

test('partial driver matching is grouped under the actual assigned driver names', () => {
  assert.deepEqual(routeSlipDriverNames([{ driver: ' Alex One ' }, { driver: 'Alex Two' }, { driver: 'Alex One' }, { driver: 'Unassigned' }, { driver: '' }]), ['Alex One', 'Alex Two']);
});
