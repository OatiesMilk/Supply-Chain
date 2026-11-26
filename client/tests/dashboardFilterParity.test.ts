import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardRecordFilter } from '../../server/src/services/dashboardFilters';
import { matchesDashboardFilter, type DashboardFilterId } from '../src/utils/dashboardFilters';
import type { DeliveryRecord } from '../src/types';

const TODAY = '2026-11-12';
const YESTERDAY = '2026-11-11';
const STARTED = '2026-11-12T01:00:00.000Z';

/** Evaluates the subset of Prisma where-input the dashboard filters use. */
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

const CATEGORY: Record<string, string> = { DELIVERY: 'Deliveries', RMA: 'RMA', PROCUREMENT_PICKUP: 'Procurement Pick-up', SALES_ORDERS: 'Sales Orders', ACCOUNTING_COLLECTION: 'Accounting Collection' };
const STATUS: Record<string, string> = { SCHEDULED: 'Scheduled', IN_TRANSIT: 'In Transit', PENDING: 'Pending', ON_HOLD: 'On-Hold', RESCHEDULED: 'Rescheduled', ACCOMPLISHED: 'Delivered' };

type Row = Record<string, any>;
/** The same record as the API serializes it for the client. */
const toClient = (row: Row) => ({
  id: row.id, category: CATEGORY[row.category], status: row.draft ? 'Draft' : STATUS[row.status], is_draft: row.draft ? 'Yes' : 'No',
  driver_id: row.driverId, driver: row.driver, delivery_date: row.deliveryDate, time_in: row.timeIn,
  rma_movement: row.rmaMovement, rma_transport_status: row.rmaTransportStatus,
  is_internal_transfer: row.category === 'RMA' ? Boolean(row.isInternalTransfer) : false,
}) as unknown as DeliveryRecord;

const base = { status: 'SCHEDULED', draft: false, driverId: null, driver: '', deliveryDate: TODAY, timeIn: null, rmaMovement: null, rmaTransportStatus: null, isInternalTransfer: false };
const rows: Row[] = [];
let n = 0;
for (const category of ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS', 'RMA', 'ACCOUNTING_COLLECTION']) {
  for (const status of ['SCHEDULED', 'IN_TRANSIT', 'PENDING', 'ON_HOLD', 'RESCHEDULED', 'ACCOMPLISHED']) {
    for (const driverId of [null, 'drv-a']) {
      for (const draft of [false, true]) {
        const row = { ...base, id: `r-${n++}`, category, status, driverId, driver: driverId ? 'Ana' : '', draft };
        if (category === 'RMA') {
          for (const rmaMovement of ['LOGISTICS_TRANSPORT', 'CUSTOMER_DROP_OFF']) {
            for (const rmaTransportStatus of ['PENDING', 'IN_TRANSIT', 'COMPLETED']) {
              // Every RMA shape also appears as a TXO non-RMA internal transfer.
              for (const isInternalTransfer of [false, true]) rows.push({ ...row, id: `r-${n++}`, rmaMovement, rmaTransportStatus, isInternalTransfer });
            }
          }
        } else {
          rows.push(row, { ...row, id: `r-${n++}`, timeIn: STARTED, deliveryDate: YESTERDAY });
        }
      }
    }
  }
}

for (const id of [
  'log-transport-requests',
  'log-assigned-today',
  'log-on-hold',
  'log-rescheduled',
  'log-on-hold-rescheduled',
  'log-flags',
  'log-unassigned',
  'sc-in-transit',
  'tass-rma-in-transit',
  'tass-open-rma',
  'tass-rma-on-hold',
] as DashboardFilterId[]) {
  test(`client and server select the same records for ${id} (AC15)`, () => {
    const where = dashboardRecordFilter(id, TODAY)!;
    const server = rows.filter(row => matches(row, where)).map(row => row.id);
    const client = rows.filter(row => matchesDashboardFilter(toClient(row), id, TODAY)).map(row => row.id);
    assert.ok(server.length > 0, 'fixture covers at least one matching record');
    assert.deepEqual(client, server);
  });
}

test('TASS RMA KPI filters never select internal transfers, while Logistics transport filters still do', () => {
  const transfers = rows.filter(row => row.category === 'RMA' && row.isInternalTransfer);
  for (const id of ['tass-open-rma', 'tass-rma-on-hold', 'tass-rma-in-transit', 'tass-rma-aging'] as DashboardFilterId[]) {
    assert.equal(transfers.some(row => matchesDashboardFilter(toClient(row), id, TODAY)), false, `client ${id}`);
    if (id !== 'tass-rma-aging') assert.equal(transfers.some(row => matches(row, dashboardRecordFilter(id, TODAY)!)), false, `server ${id}`);
  }
  for (const id of ['log-transport-requests', 'log-assigned-today'] as DashboardFilterId[]) {
    assert.ok(transfers.some(row => matchesDashboardFilter(toClient(row), id, TODAY)), `client ${id}`);
    assert.ok(transfers.some(row => matches(row, dashboardRecordFilter(id, TODAY)!)), `server ${id}`);
  }
});
