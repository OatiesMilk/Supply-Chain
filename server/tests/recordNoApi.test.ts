import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeRecord } from '../src/mappings';
import { recordMutationInputError } from '../src/services/recordOperations';

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
