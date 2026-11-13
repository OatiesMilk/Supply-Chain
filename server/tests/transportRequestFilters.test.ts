import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardRecordFilter, driversInTransitFilter, transportRequestFilter } from '../src/services/dashboardFilters';

const TODAY = '2026-11-12';
const YESTERDAY = '2026-11-11';
const STARTED = '2026-11-12T01:00:00.000Z';

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
    if ('not' in condition) return value !== null && value !== condition.not;
    throw new Error(`Unsupported condition on ${key}`);
  });
}

const job = (extra: Record<string, unknown> = {}) => ({ category: 'DELIVERY', status: 'SCHEDULED', draft: false, driverId: null, driver: '',
  deliveryDate: TODAY, timeIn: null, rmaMovement: null, rmaTransportStatus: null, ...extra });
const rma = (extra: Record<string, unknown> = {}) => job({ category: 'RMA', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'PENDING', ...extra });
const filter = (id: string) => dashboardRecordFilter(id, TODAY)!;
const is = (id: string, row: Record<string, unknown>) => matches(row, filter(id));

test('transport requests cover every open driver job type that has no Driver profile (AC1)', () => {
  const rows = [job(), job({ category: 'PROCUREMENT_PICKUP' }), job({ category: 'SALES_ORDERS', status: 'PENDING' }), rma()];
  for (const row of rows) assert.equal(is('log-transport-requests', row), true, String(row.category));
  assert.equal(is('log-transport-requests', job({ driver: 'Legacy Name' })), true, 'a name without a Driver profile still needs a driver');
  assert.deepEqual(filter('log-transport-requests'), transportRequestFilter());
});

test('transport requests leave out assigned, finished, draft and non-driver records (AC2)', () => {
  const excluded: Array<[string, Record<string, unknown>]> = [
    ['assigned delivery', job({ driverId: 'drv-a', driver: 'Ana' })],
    ['assigned RMA', rma({ driverId: 'drv-a' })],
    ['draft', job({ draft: true })],
    ['accomplished', job({ status: 'ACCOMPLISHED' })],
    ['accomplished RMA', rma({ status: 'ACCOMPLISHED' })],
    ['RMA transport completed', rma({ rmaTransportStatus: 'COMPLETED' })],
    ['RMA other movement', rma({ rmaMovement: 'CUSTOMER_DROP_OFF' })],
    ['RMA no movement', rma({ rmaMovement: null, rmaTransportStatus: null })],
    ['accounting collection', job({ category: 'ACCOUNTING_COLLECTION' })],
  ];
  for (const [label, row] of excluded) assert.equal(is('log-transport-requests', row), false, label);
});

test('on-hold and rescheduled jobs of every type stay transport requests (AC3)', () => {
  for (const status of ['ON_HOLD', 'RESCHEDULED']) {
    for (const category of ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS']) assert.equal(is('log-transport-requests', job({ category, status })), true, `${category} ${status}`);
    assert.equal(is('log-transport-requests', rma({ status })), true, `RMA ${status}`);
  }
});

test('log-rma-requests is unchanged and holds every RMA transport request', () => {
  assert.deepEqual(filter('log-rma-requests'), { category: 'RMA', draft: false, rmaMovement: 'LOGISTICS_TRANSPORT', status: { not: 'ACCOMPLISHED' }, rmaTransportStatus: { not: 'COMPLETED' } });
  const rows = [rma(), rma({ status: 'ON_HOLD' }), rma({ rmaTransportStatus: 'IN_TRANSIT' }), rma({ driverId: 'drv-a' }), rma({ rmaTransportStatus: 'COMPLETED' }), rma({ draft: true })];
  for (const row of rows) {
    if (is('log-transport-requests', row)) assert.equal(is('log-rma-requests', row), true, JSON.stringify(row));
  }
  assert.equal(is('log-rma-requests', rma({ driverId: 'drv-a' })), true, 'assigned RMA transport stays in the old list');
});

test('SC in transit: started Delivery, Pick-up and Sales Order runs on any date (AC7)', () => {
  const assigned = { driverId: 'drv-a', driver: 'Ana' };
  const rows = [
    job({ ...assigned, status: 'IN_TRANSIT', timeIn: STARTED, deliveryDate: YESTERDAY }),
    job({ ...assigned, status: 'SCHEDULED', timeIn: STARTED }),
    job({ ...assigned, category: 'PROCUREMENT_PICKUP', status: 'IN_TRANSIT', timeIn: STARTED }),
    job({ ...assigned, category: 'SALES_ORDERS', status: 'PENDING', timeIn: STARTED }),
  ];
  for (const row of rows) assert.equal(is('sc-in-transit', row), true, JSON.stringify(row));
});

test('SC in transit leaves out unstarted, held, finished, draft, unassigned and RMA jobs (AC8)', () => {
  const assigned = { driverId: 'drv-a', driver: 'Ana' };
  const excluded: Array<[string, Record<string, unknown>]> = [
    ['scheduled without Time In', job(assigned)],
    ['pending without Time In', job({ ...assigned, status: 'PENDING' })],
    ['on hold after start', job({ ...assigned, status: 'ON_HOLD', timeIn: STARTED })],
    ['rescheduled after start', job({ ...assigned, status: 'RESCHEDULED', timeIn: STARTED })],
    ['accomplished', job({ ...assigned, status: 'ACCOMPLISHED', timeIn: STARTED })],
    ['draft', job({ ...assigned, draft: true, status: 'IN_TRANSIT', timeIn: STARTED })],
    ['no Driver profile', job({ driver: 'Legacy Name', status: 'IN_TRANSIT', timeIn: STARTED })],
    ['RMA in transit', rma({ ...assigned, rmaTransportStatus: 'IN_TRANSIT' })],
    ['accounting collection', job({ ...assigned, category: 'ACCOUNTING_COLLECTION', status: 'IN_TRANSIT', timeIn: STARTED })],
  ];
  for (const [label, row] of excluded) assert.equal(is('sc-in-transit', row), false, label);
});

test('TASS RMA in transit: Logistics transport started and not finished (AC11, AC12)', () => {
  const assigned = { driverId: 'drv-a', driver: 'Ana' };
  assert.equal(is('tass-rma-in-transit', rma({ ...assigned, rmaTransportStatus: 'IN_TRANSIT', deliveryDate: YESTERDAY })), true);
  const excluded: Array<[string, Record<string, unknown>]> = [
    ['transport pending', rma(assigned)],
    ['transport completed', rma({ ...assigned, rmaTransportStatus: 'COMPLETED' })],
    ['on hold', rma({ ...assigned, rmaTransportStatus: 'IN_TRANSIT', status: 'ON_HOLD' })],
    ['rescheduled', rma({ ...assigned, rmaTransportStatus: 'IN_TRANSIT', status: 'RESCHEDULED' })],
    ['accomplished', rma({ ...assigned, rmaTransportStatus: 'IN_TRANSIT', status: 'ACCOMPLISHED' })],
    ['other movement', rma({ ...assigned, rmaTransportStatus: 'IN_TRANSIT', rmaMovement: 'CUSTOMER_DROP_OFF' })],
    ['no Driver profile', rma({ rmaTransportStatus: 'IN_TRANSIT' })],
    ['delivery in transit', job({ ...assigned, status: 'IN_TRANSIT', timeIn: STARTED })],
  ];
  for (const [label, row] of excluded) assert.equal(is('tass-rma-in-transit', row), false, label);
});

test('SC and TASS in-transit sets split the drivers-out in-transit set by type (AC14)', () => {
  const assigned = { driverId: 'drv-a', driver: 'Ana' };
  const rows = [
    job({ ...assigned, status: 'IN_TRANSIT', timeIn: STARTED }), job({ ...assigned, category: 'SALES_ORDERS', timeIn: STARTED }),
    job(assigned), job({ ...assigned, status: 'ON_HOLD', timeIn: STARTED }),
    rma({ ...assigned, rmaTransportStatus: 'IN_TRANSIT' }), rma(assigned),
  ];
  for (const row of rows) {
    const shared = matches(row, driversInTransitFilter(TODAY));
    assert.equal(Number(is('sc-in-transit', row)) + Number(is('tass-rma-in-transit', row)), Number(shared), JSON.stringify(row));
  }
});
