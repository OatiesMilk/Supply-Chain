import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import records from '../src/routes/records';

const restorers: (() => void)[] = [];
function stub(target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  target[key] = mock.fn(implementation);
  restorers.push(() => { target[key] = original; });
}
afterEach(() => { while (restorers.length) restorers.pop()!(); mock.restoreAll(); });

async function counts(status?: string, dateQuery: Record<string, string> = {}) {
  const candidates = [
    { id: 'draft', status: 'SCHEDULED', draft: true, timeIn: null },
    { id: 'scheduled', status: 'SCHEDULED', draft: false, timeIn: null },
    { id: 'started', status: 'IN_TRANSIT', draft: false, timeIn: '2026-10-06T01:00:00Z' },
    { id: 'legacy-started', status: 'SCHEDULED', draft: false, timeIn: '2026-10-06T01:00:00Z' },
  ];
  let recordQuery: any;
  let auditQuery: any;
  stub(prisma.deliveryRecord, 'findMany', async (query: any) => { recordQuery = query; return candidates; });
  stub(prisma.auditLog, 'findMany', async (query: any) => {
    auditQuery = query;
    return [{ recordId: 'scheduled', previousValue: JSON.stringify({ status: 'Scheduled', is_draft: 'Yes' }), newValue: JSON.stringify({ status: 'Scheduled', is_draft: 'No' }) }];
  });
  const route = (records as any).stack.find((layer: any) => layer.route?.path === '/status-history-counts').route;
  const handler = route.stack[route.stack.length - 1].handle;
  let response: any;
  let statusCode = 200;
  await handler({ query: { ...(status ? { status } : {}), ...dateQuery }, user: { role: 'ADMIN', name: 'Admin', permissions: [], effectiveScreens: ['main'] } }, {
    status(code: number) { statusCode = code; return this; },
    json(body: any) { response = body; },
  });
  return { response, recordQuery, auditQuery, statusCode };
}

test('status counts distinguish drafts and both new and legacy started runs, including audit-held Draft', async () => {
  const { response } = await counts();
  assert.equal(response.current.Draft, 1);
  assert.equal(response.current.Scheduled, 1);
  assert.equal(response.current['In Transit'], 2);
  assert.equal(response.ever_held.Draft, 2);
  assert.equal(response.ever_held['In Transit'], 2);
  assert.equal(response.total_records, 4);
});

test('Draft filter does not include Scheduled records and In Transit includes legacy Time In', async () => {
  const draft = await counts('Draft');
  assert.equal(draft.response.total_records, 1);
  assert.equal(draft.response.current.Draft, 1);
  assert.equal(draft.response.current.Scheduled, 0);
  assert.deepEqual(draft.auditQuery.where.recordId.in, ['draft']);
  const started = await counts('In Transit');
  assert.equal(started.response.total_records, 2);
  assert.equal(started.response.current['In Transit'], 2);
  assert.deepEqual(started.auditQuery.where.recordId.in, ['started', 'legacy-started']);
  assert.equal(started.recordQuery.select.timeIn, true);
});

test('operational status counts use the same Delivery Date cohort and identify lifetime history', async () => {
  const { response, recordQuery } = await counts(undefined, {
    deliveryDateFrom: '2026-10-06', deliveryDateTo: '2026-10-06', category: 'Deliveries',
  });
  assert.deepEqual(recordQuery.where.deliveryDate, { gte: '2026-10-06', lte: '2026-10-06' });
  assert.equal(recordQuery.where.createdAt, undefined);
  assert.equal(recordQuery.where.category, 'DELIVERY');
  assert.equal(response.date_basis, 'deliveryDate');
  assert.equal(response.history_basis, 'lifetime');
  assert.equal(response.time_zone, 'Asia/Manila');
});

test('creation-date cohort aliases use full Manila days and reject invalid ranges', async () => {
  const created = await counts(undefined, { createdAtFrom: '2026-10-06', createdAtTo: '2026-10-06' });
  assert.equal(created.recordQuery.where.createdAt.gte.toISOString(), '2026-10-05T16:00:00.000Z');
  assert.equal(created.recordQuery.where.createdAt.lt.toISOString(), '2026-10-06T16:00:00.000Z');
  assert.equal(created.response.date_basis, 'createdAt');

  const invalid = await counts(undefined, { createdAtFrom: '2026-02-30' });
  assert.equal(invalid.statusCode, 400);
});
