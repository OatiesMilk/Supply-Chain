import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driversInTransitFilter, driversOutFilter } from '../src/services/dashboardFilters';

const TODAY = '2026-11-12';
const YESTERDAY = '2026-11-11';

/** Evaluates the subset of Prisma where-input these filters use, so the tests
 * check behaviour on records instead of the exact object shape. */
function matches(row: Record<string, unknown>, where: any): boolean {
  return Object.entries(where).every(([key, condition]: [string, any]) => {
    if (key === 'AND') return (condition as any[]).every(part => matches(row, part));
    if (key === 'OR') return (condition as any[]).some(part => matches(row, part));
    if (key === 'NOT') return !matches(row, condition);
    const value = row[key] ?? null;
    if (condition === null || typeof condition !== 'object') return value === condition;
    if ('in' in condition) return condition.in.includes(value);
    if ('notIn' in condition) return value !== null && !condition.notIn.includes(value);
    throw new Error(`Unsupported condition on ${key}`);
  });
}

const job = (extra: Record<string, unknown> = {}) => ({ category: 'DELIVERY', status: 'SCHEDULED', draft: false, driverId: 'drv-a', driver: 'Ana',
  deliveryDate: TODAY, timeIn: null, rmaMovement: null, rmaTransportStatus: null, ...extra });
const out = (row: Record<string, unknown>) => matches(row, driversOutFilter(TODAY));
const inTransit = (row: Record<string, unknown>) => matches(row, driversInTransitFilter(TODAY));

test('every driver job type scheduled for today counts as out', () => {
  for (const category of ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS']) assert.equal(out(job({ category })), true, category);
  assert.equal(out(job({ category: 'ACCOUNTING_COLLECTION' })), false);
});

test('only Logistics-transport RMAs that are not completed count', () => {
  const rma = (extra: Record<string, unknown> = {}) => job({ category: 'RMA', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'PENDING', ...extra });
  assert.equal(out(rma()), true);
  assert.equal(out(rma({ rmaTransportStatus: 'IN_TRANSIT', deliveryDate: YESTERDAY })), true);
  assert.equal(out(rma({ rmaTransportStatus: 'PENDING', deliveryDate: YESTERDAY })), false);
  assert.equal(out(rma({ rmaTransportStatus: 'COMPLETED' })), false);
  assert.equal(out(rma({ rmaMovement: 'CUSTOMER_DROP_OFF' })), false);
  assert.equal(out(rma({ rmaMovement: null, rmaTransportStatus: null })), false);
  assert.equal(out(rma({ status: 'ON_HOLD' })), false);
  assert.equal(out(rma({ status: 'ACCOMPLISHED' })), false);
});

test('a run started on an earlier date is still out and in transit', () => {
  const started = job({ deliveryDate: YESTERDAY, status: 'IN_TRANSIT', timeIn: '2026-11-11T01:00:00.000Z' });
  const legacy = job({ deliveryDate: YESTERDAY, status: 'SCHEDULED', timeIn: '2026-11-11T01:00:00.000Z' });
  assert.equal(out(started), true); assert.equal(inTransit(started), true);
  assert.equal(out(legacy), true); assert.equal(inTransit(legacy), true);
  assert.equal(out(job({ deliveryDate: YESTERDAY })), false, 'overdue but never started is not out');
  assert.equal(inTransit(job()), false, 'scheduled today but not started is not in transit');
});

test('on hold, rescheduled, done, draft and unassigned jobs do not count', () => {
  for (const status of ['ON_HOLD', 'RESCHEDULED', 'ACCOMPLISHED']) {
    assert.equal(out(job({ status })), false, status);
    assert.equal(out(job({ status, timeIn: '2026-11-12T01:00:00.000Z' })), false, `${status} after start`);
  }
  assert.equal(out(job({ draft: true })), false);
  assert.equal(out(job({ driverId: null, driver: 'Old Name' })), false, 'a name without a Driver profile is not counted');
});
