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
  } };
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
  assert.equal(result.drivers_out[0].records.length, 3);
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
