import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardOverview } from '../src/services/dashboardOverview';
import { sessionUser } from '../src/services/permissions';
import { recordScope } from '../src/services/recordAccess';
import type { AuthUser } from '../src/middleware/auth';
import { dashboardRecordFilter } from '../src/services/dashboardFilters';

const actor = (role: string, permissions: any[] = []) => sessionUser({ id: 'overview-user', name: 'User', email: 'user@example.test', role, permissions }) as AuthUser;
function fixture() {
  const reads: any[] = [];
  const row = (id: number) => ({ id: `preview-${id}`, category: 'RMA', status: 'SCHEDULED', draft: false,
    company: { name: 'Client' }, driverAssistants: '[]', lineItems: [], rmaMovement: 'LOGISTICS_TRANSPORT',
    reference: 'REF', deliveryDate: '2026-10-30', createdAt: new Date(), updatedAt: new Date() });
  const db: any = { deliveryRecord: {
    count: async (query: any) => { reads.push({ operation: 'count', ...query }); return 6001; },
    aggregate: async (query: any) => { reads.push({ operation: 'aggregate', ...query }); return { _sum: { amount: 12345 } }; },
    groupBy: async (query: any) => { reads.push({ operation: 'group', ...query }); return [{ driverId: 'driver-id', driver: 'Driver', _count: { _all: 6001 } }]; },
    findMany: async (query: any) => { reads.push({ operation: 'records', ...query }); return Array.from({ length: query.take }, (_, i) => row(i)); },
  }, driver: { findMany: async (query: any) => { reads.push({ operation: 'drivers', ...query }); return [{ id: 'driver-id', name: 'Driver' }]; } } };
  return { db, reads };
}

test('Sales dashboard counts the complete scoped data set without fetching record history', async () => {
  const { db, reads } = fixture(); const user = actor('SALES_COORDINATOR');
  const result = await dashboardOverview(db, user);
  assert.equal(result.record_total, 6001); assert.equal(result.status_totals.Delivered, 6001);
  assert.equal(result.counts['sc-attention-all'], 6001);
  assert.equal(reads.some(read => read.operation === 'records'), false);
  for (const read of reads) assert.deepEqual(read.where.AND[0], recordScope(user));
  assert.deepEqual(dashboardRecordFilter('sc-scheduled-today', '2026-10-30'), { category: 'DELIVERY', draft: false, status: 'SCHEDULED', timeIn: null, deliveryDate: '2026-10-30' });
});

test('Logistics previews are bounded while assignment totals remain complete', async () => {
  const { db, reads } = fixture(); const result = await dashboardOverview(db, actor('LOGISTICS'));
  assert.equal(result.counts.rma_requests, 6001); assert.equal(result.record_previews.rma_requests.length, 10);
  assert.equal(result.drivers_out_total, 1); assert.equal(result.drivers_out[0].total, 6001);
  assert.equal(result.drivers_out_jobs_total, 6001);
  assert.equal(result.drivers_out[0].records.length, 3);
  for (const read of reads.filter(read => read.operation === 'group')) assert.deepEqual(read.by, ['driverId']);
  for (const read of reads.filter(read => read.operation === 'records')) {
    assert.ok(read.take <= 10); assert.ok(JSON.stringify(read.where).includes('deletedAt'));
  }
});

test('TASS and Admin totals do not depend on preview rows and retain current category scope', async () => {
  const tass = fixture(); const result = await dashboardOverview(tass.db, actor('TASS'));
  assert.equal(result.counts.rma_attention, 6001); assert.equal(result.record_previews.rma_attention.length, 10);
  const admin = fixture(); const denied = actor('ADMIN', [{ screen: 'accounting_collection', granted: false }]);
  const totals = await dashboardOverview(admin.db, denied);
  assert.equal(totals.unverified_collections_amount, 12345);
  const sum = admin.reads.find(read => read.operation === 'aggregate');
  assert.deepEqual(sum.where.AND[0], recordScope(denied));
  assert.equal(JSON.stringify(recordScope(denied)).includes('ACCOUNTING_COLLECTION'), false);
  assert.equal(admin.reads.some(read => read.operation === 'records'), false);
});

const IN_TRANSIT_MARKER = JSON.stringify({ category: 'RMA', rmaTransportStatus: 'IN_TRANSIT' });
function driversFixture(jobs: Array<[string, number]>, transit: Array<[string, number]>, profiles: Record<string, string>) {
  const reads: any[] = [];
  const row = (id: string, driver: string) => ({ id, category: 'DELIVERY', status: 'SCHEDULED', draft: false, company: { name: 'Client' }, driverAssistants: '[]',
    lineItems: [], driver, reference: 'REF', deliveryDate: '2026-11-12', createdAt: new Date(), updatedAt: new Date() });
  const db: any = { deliveryRecord: {
    count: async () => 0,
    groupBy: async (query: any) => {
      reads.push({ operation: 'group', ...query });
      const rows = JSON.stringify(query.where).includes(IN_TRANSIT_MARKER) ? transit : jobs;
      return rows.map(([driverId, all]) => ({ driverId, _count: { _all: all } }));
    },
    findMany: async (query: any) => {
      reads.push({ operation: 'records', ...query });
      const text = JSON.stringify(query.where);
      const kind = text.includes(IN_TRANSIT_MARKER) ? 'moving' : 'waiting';
      const driverId = (text.match(/"driverId":"([^"]+)"/) ?? [])[1] ?? 'none';
      const all = (kind === 'moving' ? transit : jobs).find(([id]) => id === driverId)?.[1] ?? 0;
      const available = kind === 'moving' ? all : all - (transit.find(([id]) => id === driverId)?.[1] ?? 0);
      return Array.from({ length: Math.min(query.take, available) }, (_, i) => row(`${driverId}-${kind}-${i}`, `snapshot-${driverId}`));
    },
  }, driver: { findMany: async (query: any) => {
    reads.push({ operation: 'drivers', ...query });
    return query.where.id.in.filter((id: string) => profiles[id]).map((id: string) => ({ id, name: profiles[id] }));
  } } };
  return { db, reads };
}

test('Logistics counts distinct Driver profiles by current name, in-transit drivers first', async () => {
  const { db, reads } = driversFixture([['d-ben', 5], ['d-ana', 2], ['d-cy', 4]], [['d-ana', 1]], { 'd-ana': 'Ana Cruz', 'd-ben': 'Ben Reyes', 'd-cy': 'Cy Lim' });
  const result = await dashboardOverview(db, actor('LOGISTICS'));
  assert.equal(result.drivers_out_total, 3);
  assert.equal(result.drivers_out_jobs_total, 11);
  assert.deepEqual(result.drivers_out.map(row => [row.driver_id, row.driver, row.total, row.in_transit]),
    [['d-ana', 'Ana Cruz', 2, 1], ['d-ben', 'Ben Reyes', 5, 0], ['d-cy', 'Cy Lim', 4, 0]]);
  // The in-transit job leads Ana's links, then her waiting job; never more than three links.
  assert.deepEqual(result.drivers_out[0].records.map(record => record.id), ['d-ana-moving-0', 'd-ana-waiting-0']);
  assert.ok(result.drivers_out.every(row => row.records.length <= 3));
  const user = actor('LOGISTICS');
  for (const read of reads.filter(read => read.operation === 'group' || read.operation === 'records')) {
    assert.deepEqual(read.where.AND[0], recordScope(user)); assert.ok(read.take === undefined || read.take <= 10);
  }
  assert.equal(reads.filter(read => read.operation === 'drivers').length, 1);
});

test('Logistics previews at most ten drivers while the total stays complete', async () => {
  const jobs = Array.from({ length: 12 }, (_, i): [string, number] => [`d-${String(i).padStart(2, '0')}`, 1]);
  const { db } = driversFixture(jobs, [], {});
  const result = await dashboardOverview(db, actor('LOGISTICS'));
  assert.equal(result.drivers_out_total, 12); assert.equal(result.drivers_out.length, 10);
  assert.equal(result.drivers_out[0].driver, 'snapshot-d-00', 'falls back to the record name when the profile is missing');
});
