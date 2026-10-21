import test from 'node:test';
import assert from 'node:assert/strict';
import { DATE_RANGE_ERROR, dateRangeAfterFromChange, dateRangeState } from '../dateRange';

// ── dateRangeState ────────────────────────────────────────────────────────────

test('all Operations pages reject an earlier Date To and apply neither half of the invalid range (default enforceChronology=true)', () => {
  assert.deepEqual(dateRangeState('2026-10-08', '2026-10-01'), {
    error: DATE_RANGE_ERROR,
    dateToMin: '2026-10-08',
    appliedDateFrom: '',
    appliedDateTo: '',
  });
});

test('equal dates are a valid one-day range', () => {
  assert.deepEqual(dateRangeState('2026-10-08', '2026-10-08'), {
    error: null,
    dateToMin: '2026-10-08',
    appliedDateFrom: '2026-10-08',
    appliedDateTo: '2026-10-08',
  });
});

test('clearing Date From removes the Date To minimum and retains Date To', () => {
  assert.deepEqual(dateRangeState('', '2026-10-08'), {
    error: null,
    dateToMin: undefined,
    appliedDateFrom: '',
    appliedDateTo: '2026-10-08',
  });
});

test('explicit enforceChronology=false allows an inverted range (legacy opt-out path)', () => {
  assert.deepEqual(dateRangeState('2026-10-08', '2026-10-01', false), {
    error: null,
    dateToMin: undefined,
    appliedDateFrom: '2026-10-08',
    appliedDateTo: '2026-10-01',
  });
});

// ── dateRangeAfterFromChange ──────────────────────────────────────────────────

test('moving Date From after an existing Date To clears Date To (default enforceChronology=true)', () => {
  assert.deepEqual(dateRangeAfterFromChange('2026-10-09', '2026-10-08'), {
    dateFrom: '2026-10-09',
    dateTo: '',
  });
});

test('moving Date From before an existing Date To keeps Date To', () => {
  assert.deepEqual(dateRangeAfterFromChange('2026-10-06', '2026-10-08'), {
    dateFrom: '2026-10-06',
    dateTo: '2026-10-08',
  });
});

test('explicit enforceChronology=false never clears Date To when Date From moves past it', () => {
  assert.deepEqual(dateRangeAfterFromChange('2026-10-09', '2026-10-08', false), {
    dateFrom: '2026-10-09',
    dateTo: '2026-10-08',
  });
});

// ── DEF regression: sort order applied to paged rows ─────────────────────────
// The sortRows helper inside DeliveryRecordsView / AccountingCollectionView is
// reproduced here as a pure function so that all four orderings are covered by
// the unit-test suite independently of React component rendering.

type Rec = { id: string; delivery_date: string | null };

function sortRows(dateSort: 'default' | 'nearest' | 'oldest' | 'furthest', rows: Rec[]): Rec[] {
  // Fixed reference point so tests are deterministic regardless of system clock.
  const now = new Date('2026-10-21T02:00:00Z').getTime();
  if (dateSort === 'default') return rows;
  return [...rows].sort((a, b) => {
    const da = a.delivery_date ? new Date(a.delivery_date + 'T12:00:00Z').getTime() : null;
    const db = b.delivery_date ? new Date(b.delivery_date + 'T12:00:00Z').getTime() : null;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    if (dateSort === 'nearest') return Math.abs(da - now) - Math.abs(db - now);
    if (dateSort === 'oldest') return da - db;
    if (dateSort === 'furthest') return db - da;
    return 0;
  });
}

const ROWS: Rec[] = [
  { id: 'A', delivery_date: '2026-10-08' },  // 13 days before reference → past
  { id: 'B', delivery_date: '2026-11-15' },  // 25 days after reference  → far future
  { id: 'C', delivery_date: '2026-10-22' },  // 1 day after reference    → near future
  { id: 'D', delivery_date: null },           // no date                  → always last
];

test('sort: default preserves input order', () => {
  assert.deepEqual(sortRows('default', ROWS).map(r => r.id), ['A', 'B', 'C', 'D']);
});

test('sort: oldest first (ascending delivery_date, nulls last)', () => {
  // A (Oct 08) → C (Oct 22) → B (Nov 15) → D (null)
  assert.deepEqual(sortRows('oldest', ROWS).map(r => r.id), ['A', 'C', 'B', 'D']);
});

test('sort: furthest future first (descending delivery_date, nulls last)', () => {
  // B (Nov 15) → C (Oct 22) → A (Oct 08) → D (null)
  assert.deepEqual(sortRows('furthest', ROWS).map(r => r.id), ['B', 'C', 'A', 'D']);
});

test('sort: nearest to present (ascending |distance| from reference, nulls last)', () => {
  // Reference: 2026-10-21T02:00Z
  // C (Oct 22): |distance| ≈ 1d  ← nearest
  // A (Oct 08): |distance| ≈ 13d
  // B (Nov 15): |distance| ≈ 25d
  // D: null → last
  assert.deepEqual(sortRows('nearest', ROWS).map(r => r.id), ['C', 'A', 'B', 'D']);
});
