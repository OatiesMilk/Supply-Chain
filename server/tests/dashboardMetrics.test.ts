import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageBucket, metricMatches, mondayRange, OPEN_STATUSES, overdue, ROLE_CARDS, selectionMatches, validateSelection, type MetricRecord } from '../src/services/dashboardMetrics';
import { runState } from '../src/services/deliveryLifecycle';
import { recordScope } from '../src/services/recordAccess';
import { permissionSnapshot } from '../src/services/permissions';

const today = '2026-10-21';
const row = (overrides: Partial<MetricRecord> = {}): MetricRecord => ({
  id: 'REC-1', category: 'DELIVERY', status: 'SCHEDULED', draft: false,
  deliveryDate: today, driverId: null, driver: '', timeIn: null, timeOut: null,
  collectionVerified: false, collectionVerifiedAt: null, createdAt: new Date('2026-10-20T01:00:00Z'), ...overrides,
});

test('due today includes completed-late deliveries; completed uses the actual Manila completion date', () => {
  assert.equal(metricMatches(row({ status: 'ACCOMPLISHED' }), 'due', today), true);
  const late = row({ deliveryDate: '2026-10-19', status: 'ACCOMPLISHED', timeOut: '2026-10-20T16:00:00Z' });
  assert.equal(metricMatches(late, 'completed', today), true);
  assert.equal(metricMatches(late, 'due', today), false);
  assert.equal(metricMatches(late, 'overdue', today), false);
  for (const timeOut of [null, '', 'invalid', '2026-10-20T15:59:59Z', '2026-10-21T16:00:00Z']) assert.equal(metricMatches(row({ status: 'ACCOMPLISHED', timeOut }), 'completed', today), false);
});
test('unassigned uses profile ID, including unresolved names, and distinguishes all dates from today', () => {
  assert.equal(metricMatches(row({ driver: 'Legacy Name' }), 'unassigned-today', today), true);
  assert.equal(metricMatches(row({ driverId: 'profile', driver: '' }), 'unassigned', today), false);
  assert.equal(metricMatches(row({ deliveryDate: '2026-10-22' }), 'unassigned', today), true);
  assert.equal(metricMatches(row({ deliveryDate: '2026-10-22' }), 'unassigned-today', today), false);
});
test('draft and deleted records never contribute to any metric or drill-down', () => {
  for (const cards of Object.values(ROLE_CARDS)) for (const c of cards) for (const invalid of [row({ draft: true }), row({ deletedAt: new Date() })]) {
    assert.equal(metricMatches(invalid, c.metric, today), false);
    assert.equal(selectionMatches(invalid, { metric: c.metric }, today), false);
  }
});
test('overdue validates dates and applies to open deliveries only', () => {
  for (const deliveryDate of ['', '2026-02-30', 'oops', '2026-10-22', today]) assert.equal(overdue(row({ deliveryDate }), today), false);
  assert.equal(overdue(row({ deliveryDate: '2026-10-20' }), today), true);
  assert.equal(overdue(row({ deliveryDate: '2026-10-20', category: 'RMA' }), today), false);
});
test('Monday–Sunday includes Sunday; invalid dates excluded only from range selections', () => {
  assert.deepEqual(mondayRange('2026-10-25'), { from: '2026-10-19', to: '2026-10-25' });
  assert.equal(selectionMatches(row({ deliveryDate: '2026-10-25' }), { period: 'week' }, today), true);
  assert.equal(selectionMatches(row({ deliveryDate: '2026-10-26' }), { period: 'week' }, today), false);
  assert.equal(selectionMatches(row({ deliveryDate: '2026-02-30' }), { period: 'all' }, today), true);
  for (const period of ['today', 'week', 'custom']) assert.equal(selectionMatches(row({ deliveryDate: '2026-02-30' }), { period, from: '2026-01-01', to: '2026-12-31' }, today), false);
});
test('RMA On Hold is a subset of all open RMA; collections require completion before verification queue', () => {
  for (const status of ['SCHEDULED', 'IN_TRANSIT', 'PENDING', 'ON_HOLD', 'RESCHEDULED']) assert.equal(metricMatches(row({ category: 'RMA', status }), 'rma-open', today), true);
  assert.equal(metricMatches(row({ category: 'RMA', status: 'ACCOMPLISHED' }), 'rma-open', today), false);
  assert.equal(metricMatches(row({ category: 'ACCOUNTING_COLLECTION' }), 'verification', today), false);
  assert.equal(metricMatches(row({ category: 'ACCOUNTING_COLLECTION', status: 'ACCOMPLISHED' }), 'verification', today), true);
  assert.equal(metricMatches(row({ category: 'ACCOUNTING_COLLECTION', collectionVerified: true, collectionVerifiedAt: new Date('2026-10-20T16:00:00Z') }), 'verified', today), true);
});
test('verification age uses calendar days including every boundary and Unknown timestamps', () => {
  const cases: [string | null, string][] = [['2026-10-20T16:00:00Z', '0–1'], ['2026-10-19T16:00:00Z', '0–1'], ['2026-10-18T16:00:00Z', '2–3'], ['2026-10-17T16:00:00Z', '2–3'], ['2026-10-16T16:00:00Z', '4–7'], ['2026-10-13T16:00:00Z', '4–7'], ['2026-10-12T16:00:00Z', '8+'], [null, 'Unknown'], ['bad', 'Unknown'], ['2026-10-22T16:00:00Z', 'Unknown']];
  for (const [timeOut, expected] of cases) assert.equal(ageBucket(row({ timeOut }), today), expected);
});
test('driver remaining preserves started-future and other module actionability', () => {
  assert.equal(metricMatches(row({ deliveryDate: '2026-10-22' }), 'my-remaining', today), false);
  assert.equal(metricMatches(row({ deliveryDate: '2026-10-22', timeIn: '2026-10-21T01:00:00Z' }), 'my-remaining', today), true);
  assert.equal(metricMatches(row({ category: 'RMA', deliveryDate: '2026-10-20' }), 'my-remaining', today), false);
  assert.equal(metricMatches(row({ category: 'RMA' }), 'my-remaining', today), true);
});
test('every card and status/overdue drill-down uses identical predicates beyond a page', () => {
  const rows = Array.from({ length: 111 }, (_, i) => row({ id: String(i), status: ['SCHEDULED', 'IN_TRANSIT', 'PENDING', 'ON_HOLD', 'RESCHEDULED', 'ACCOMPLISHED'][i % 6], deliveryDate: i % 2 ? '2026-10-20' : today, timeIn: i % 7 ? null : '2026-10-21T01:00:00Z' }));
  for (const cards of Object.values(ROLE_CARDS)) for (const card of cards) assert.deepEqual(rows.filter(r => metricMatches(r, card.metric, today)), rows.filter(r => selectionMatches(r, { metric: card.metric }, today)));
  for (const status of OPEN_STATUSES) {
    const matches = rows.filter(r => selectionMatches(r, { metric: 'open', status }, today));
    assert.ok(matches.every(r => runState(r) === status));
    const late = rows.filter(r => selectionMatches(r, { metric: 'open', status, overdue: true }, today));
    assert.equal(late.length, matches.filter(r => overdue(r, today)).length);
  }
});
test('tampered filters and invalid custom dates fail closed', () => {
  for (const input of [{ driverId: 'someone-else' }, { module: 'SECRET' }, { period: 'custom' }, { period: 'custom', from: '2026-10-22', to: today }, { from: '2026-02-30' }, { metric: 'all-users' }, { status: 'ACCOMPLISHED' }, { overdue: ['true'] }]) assert.throws(() => validateSelection(input));
});
test('explicit category denial survives aggregate scope; driver identity is profile ID, never name', () => {
  const user = (role: any, permissions: any[] = [], driverProfileId: string | null = null) => ({ id: 'user', name: 'Same Name', email: 'test@example.test', role, driverProfileId, ...permissionSnapshot(role, permissions) });
  const denied = recordScope(user('ADMIN', [{ screen: 'deliveries', granted: false }]));
  assert.ok(!(denied.category as any).in.includes('DELIVERY'));
  assert.equal(recordScope(user('DRIVER', [], 'profile-one')).driverId, 'profile-one');
  assert.deepEqual(recordScope(user('DRIVER')).id, { in: [] });
});
