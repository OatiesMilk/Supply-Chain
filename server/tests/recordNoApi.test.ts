import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeRecord } from '../src/mappings';
import { recordMutationInputError } from '../src/services/recordOperations';
import { recordNumbersForAudit } from '../src/services/recordIds';
import { prisma } from '../src/db';
import recordsRoutes from '../src/routes/records';
import type { AuthUser } from '../src/middleware/auth';

const base: any = { id: 'REC-0b7c1f8e-2f1d-4e4a-9a51-3f6f2c7d9e10', recordNo: 'DEL-26-00042', category: 'DELIVERY', status: 'SCHEDULED',
  draft: false, company: { name: 'Acme' }, lineItems: [], createdAt: new Date('2026-11-12T00:00:00Z') };

test('serializeRecord exposes the record number next to the internal id', () => {
  const payload = serializeRecord(base);
  assert.equal(payload.record_no, 'DEL-26-00042');
  assert.equal(payload.id, base.id);
  assert.equal(serializeRecord({ ...base, recordNo: undefined }).record_no, null);
});

test('clients cannot send a record number on create or edit', () => {
  assert.ok(recordMutationInputError({ category: 'Deliveries', record_no: 'DEL-26-00001' }, '/', 'POST'));
  assert.ok(recordMutationInputError({ reference: 'SAP-1', record_no: 'DEL-26-00001' }, '/:id', 'PUT'));
  assert.ok(recordMutationInputError({ status: 'Scheduled', record_no: 'DEL-26-00001' }, '/:id/status', 'PATCH'));
});

test('a linked collection carries its record number', () => {
  const payload = serializeRecord({ ...base, linkedCollectionId: 'col-1',
    linkedCollection: { id: 'col-1', recordNo: 'COL-26-00019', category: 'ACCOUNTING_COLLECTION', draft: false, reference: 'OR-1', status: 'SCHEDULED', company: { name: 'Acme' } } });
  assert.equal(payload.linked_collection?.record_no, 'COL-26-00019');
});

test('audit pages look up record numbers only for record entries', async () => {
  const calls: string[][] = [];
  const db = { deliveryRecord: { findMany: async ({ where }: any) => { calls.push(where.id.in); return [{ id: 'r1', recordNo: 'RMA-26-00007' }]; } } };
  const numbers = await recordNumbersForAudit(db, [
    { recordId: 'r1', recordType: 'DeliveryRecord' }, { recordId: 'r1', recordType: 'DeliveryRecord' }, { recordId: 'u1', recordType: 'User' },
  ]);
  assert.deepEqual(calls, [['r1']]);
  assert.equal(numbers.get('r1'), 'RMA-26-00007');
  assert.equal((await recordNumbersForAudit(db, [{ recordId: 'u1', recordType: 'User' }])).size, 0);
  assert.equal(calls.length, 1);
});

async function invoke(router: any, method: string, path: string, body: any, user: AuthUser, params: Record<string, string>, query: Record<string, string> = {}) {
  const route = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]).route;
  let status = 200;
  let response: any;
  const req: any = { params, body, user, query, path: path.replace(':id', params.id) };
  const res: any = { status(n: number) { status = n; return this; }, json(x: any) { response = x; return this; } };
  await route.stack.at(-2).handle(req, res, () => {});
  if (response === undefined) await route.stack.at(-1).handle(req, res, (error: unknown) => { if (error) throw error; });
  return { status, body: response };
}

test('linking a collection accepts a typed record number or a legacy internal id', async t => {
  const logistics: AuthUser = { id: 'user-logistics', name: 'Logistics User', role: 'LOGISTICS', permissions: [],
    effectiveScreens: ['deliveries'], resources: ['records'], permissionVersion: 'v1' };
  const lookups: any[] = [];
  const original = prisma.deliveryRecord.findFirst;
  (prisma.deliveryRecord as any).findFirst = async ({ where }: any) => {
    if (where.id === 'del-1') return { id: 'del-1', category: 'DELIVERY', status: 'SCHEDULED', draft: false, companyId: 'comp-1' };
    lookups.push(where);
    return null; // stop after the lookup; the existing scope rules decide access
  };
  t.after(() => { (prisma.deliveryRecord as any).findFirst = original; });

  for (const linked of [' col-26-00019 ', 'REC-0b7c1f8e-2f1d-4e4a-9a51-3f6f2c7d9e10']) {
    const res = await invoke(recordsRoutes, 'put', '/:id', { remarks: 'Link collection', linked_collection_id: linked }, logistics, { id: 'del-1' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Linked record must be an existing Accounting Collection record/);
  }
  assert.equal(lookups[0].recordNo, 'COL-26-00019');
  assert.equal(lookups[0].id, undefined);
  assert.equal(lookups[1].id, 'REC-0b7c1f8e-2f1d-4e4a-9a51-3f6f2c7d9e10');
  for (const where of lookups) {
    assert.equal(where.category, 'ACCOUNTING_COLLECTION');
    assert.equal(where.deletedAt, null);
    assert.ok(where.AND?.length, 'record scope still applies');
  }
});

test('record search matches record numbers and still matches legacy internal ids', async t => {
  const admin: AuthUser = { id: 'admin-1', name: 'Admin', role: 'ADMIN', permissions: [],
    effectiveScreens: ['deliveries'], resources: ['records'], permissionVersion: 'v1' };
  let captured: any;
  const originals = { findMany: prisma.deliveryRecord.findMany, count: prisma.deliveryRecord.count };
  (prisma.deliveryRecord as any).findMany = async (args: any) => { captured = args.where; return []; };
  (prisma.deliveryRecord as any).count = async () => 0;
  t.after(() => Object.assign(prisma.deliveryRecord, originals));

  const res = await invoke(recordsRoutes, 'get', '/', null, admin, {}, { search: 'del-26-000' });
  assert.equal(res.status, 200);
  const text = JSON.stringify(captured);
  assert.match(text, /"recordNo":\{"contains":"del-26-000","mode":"insensitive"\}/);
  assert.match(text, /"id":\{"contains":"del-26-000","mode":"insensitive"\}/);
});
