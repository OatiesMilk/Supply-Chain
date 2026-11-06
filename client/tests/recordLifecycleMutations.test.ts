import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { api } from '../src/api';
import { createQueryClient } from '../src/api/queryClient';
import { createUpdateRecordMutationOptions } from '../src/api/queries/useRecordsQuery';
import DriverBoard from '../src/features/drivers/DriverBoard';
import type { DeliveryRecord } from '../src/types';

afterEach(() => mock.restoreAll());

test('RMA completion patches the confirmed receipt recipient and version without loading optional proof', async () => {
  const client = createQueryClient();
  mock.method(api, 'getRecord', async () => ({ id: 'rma', status: 'Scheduled', category: 'RMA', time_in: null, received_by: null, rma_received_at: '2026-10-28T01:00:00Z', rma_recipient: 'Collector', rma_version: 3 }));
  const files = mock.method(api, 'getRecordAttachments', async () => { throw new Error('Optional attachment service is unavailable'); });
  const put = mock.method(api, 'updateRecord', async () => { throw new Error('RMA completion must use one status update'); });
  const patch = mock.method(api, 'patchStatus', async () => ({ id: 'rma', status: 'Delivered', received_by: 'Collector' }));
  const options = createUpdateRecordMutationOptions(client);
  await assert.rejects(options.mutationFn({ id: 'rma', updates: { status: 'Delivered', received_by: ' ', remarks: 'Collected' } }), /Recipient \/ Collector/);
  await assert.rejects(options.mutationFn({ id: 'rma', updates: { status: 'Delivered', received_by: 'Collector', remarks: ' ' } }), /Remarks/);
  const saved = await options.mutationFn({ id: 'rma', updates: { status: 'Delivered', received_by: ' Collector ', remarks: 'Collected' } });
  assert.equal(saved.status, 'Delivered');
  assert.deepEqual(patch.mock.calls[0].arguments, ['rma', 'Delivered', 'Collected', { received_by: 'Collector', expected_version: 3 }]);
  assert.equal(files.mock.callCount(), 0);
  assert.equal(put.mock.callCount(), 0);
  client.clear();
});

test('RMA completion requires saved physical receipt and preserves an explicit stale version for server conflict detection', async () => {
  const client = createQueryClient();
  const read = mock.method(api, 'getRecord', async () => ({ id: 'rma', category: 'RMA', status: 'Scheduled', rma_version: 8, rma_recipient: 'Collector', rma_received_at: null }));
  const patch = mock.method(api, 'patchStatus', async () => { throw new Error('The record changed. Reload before saving.'); });
  const options = createUpdateRecordMutationOptions(client);
  await assert.rejects(options.mutationFn({ id: 'rma', updates: { status: 'Delivered', remarks: 'Complete' } }), /Confirm physical receipt/);
  assert.equal(patch.mock.callCount(), 0);
  read.mock.mockImplementation(async () => ({ id: 'rma', category: 'RMA', status: 'Scheduled', rma_version: 8, rma_recipient: 'Collector', rma_received_at: '2026-10-28T01:00:00Z' }));
  const cached = { id: 'rma', category: 'RMA', rma_version: 8 } as DeliveryRecord;
  client.setQueryData(['records', 'detail', 'rma'], cached);
  await assert.rejects(options.mutationFn({ id: 'rma', updates: { status: 'Delivered', remarks: 'Complete', expected_version: 5 } }), /record changed/);
  assert.deepEqual(patch.mock.calls[0].arguments, ['rma', 'Delivered', 'Complete', { received_by: 'Collector', expected_version: 5 }]);
  assert.equal(client.getQueryData(['records', 'detail', 'rma']), cached, 'failed save leaves the committed cache intact');
  client.clear();
});

test('priority edits on an already completed legacy record do not trigger a new completion or require attachments', async () => {
  const client = createQueryClient();
  mock.method(api, 'getRecord', async () => ({ id: 'legacy', status: 'Delivered', time_in: null, received_by: null }));
  const files = mock.method(api, 'getRecordAttachments', async () => { throw new Error('Completion photos must not be fetched for a priority edit'); });
  const patch = mock.method(api, 'patchStatus', async () => ({ id: 'legacy', status: 'Delivered', priority: '3 - High' }));
  const saved = await createUpdateRecordMutationOptions(client).mutationFn({ id: 'legacy', updates: { status: 'Delivered', priority: '3 - High', remarks: 'Priority corrected' } });
  assert.equal(saved.priority, '3 - High');
  assert.equal(files.mock.callCount(), 0);
  assert.deepEqual(patch.mock.calls[0].arguments, ['legacy', 'Delivered', 'Priority corrected', { priority: '3 - High' }]);
  client.clear();
});

test('a new completion is blocked before patching when proof or Time In is missing', async () => {
  const client = createQueryClient();
  const get = mock.method(api, 'getRecord', async () => ({ id: 'run', status: 'Pending', category: 'Deliveries', time_in: null, received_by: 'Receiver' }));
  const files = mock.method(api, 'getRecordAttachments', async () => []);
  const patch = mock.method(api, 'patchStatus', async () => ({ id: 'run', status: 'Delivered' }));
  const options = createUpdateRecordMutationOptions(client);
  const input = { id: 'run', updates: { status: 'Delivered', remarks: 'Completed' } } as const;
  await assert.rejects(options.mutationFn(input), /Time In/);
  get.mock.mockImplementation(async () => ({ id: 'run', status: 'Pending', category: 'Deliveries', time_in: '2026-10-06T01:00:00Z', received_by: 'Receiver' }));
  await assert.rejects(options.mutationFn(input), /JPG or PNG/);
  files.mock.mockImplementation(async () => [{ id: 'photo', is_photo: true }] as any);
  await assert.rejects(options.mutationFn({ id: 'run', updates: { ...input.updates, received_by: '   ' } }), /Received By/);
  assert.equal(patch.mock.callCount(), 0);
  client.clear();
});

test('the assignment board hides new and retained-assignment drafts until submission', () => {
  const record = (id: string, overrides: Partial<DeliveryRecord>): DeliveryRecord => ({
    id, reference: id, company_name: id, category: 'Deliveries', status: 'Scheduled',
    is_draft: 'No', driver: '', area: 'Carmona', delivery_date: '2026-10-06', ...overrides,
  } as DeliveryRecord);
  const html = renderToString(React.createElement(DriverBoard, {
    records: [
      record('draft-new', { status: 'Draft', is_draft: 'Yes' }),
      record('draft-retained', { status: 'Scheduled', is_draft: 'Yes', driver: 'Assigned Driver' }),
      record('scheduled-run', {}),
      record('started-run', { status: 'In Transit', driver: 'Assigned Driver' }),
    ],
    currentUserName: 'Logistics User', onNavigate: () => {}, onUpdateRecord: async () => {},
  }));
  assert.ok(!html.includes('draft-new'));
  assert.ok(!html.includes('draft-retained'));
  assert.ok(html.includes('scheduled-run'));
  assert.ok(html.includes('started-run'));
  assert.match(html.replace(/<!--.*?-->/g, ''), /1 unassigned, 2 shown/);
});

test('dispatch workload includes only submitted internal-driver RMA transport and ordinary runs', () => {
  const row = (id: string, updates: Partial<DeliveryRecord> = {}) => ({ id, reference: id, company_name: id, category: 'RMA', status: 'Scheduled', is_draft: 'No', driver: '', area: 'Carmona', delivery_date: '2026-10-28', rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'PENDING', ...updates } as DeliveryRecord);
  const html = renderToString(React.createElement(DriverBoard, {
    records: [row('eligible-rma'), row('supplier-rma', { rma_movement: 'SUPPLIER_COLLECTION' }), row('internal-rma', { rma_movement: 'INTERNAL_NO_DRIVER' }), row('legacy-rma', { rma_movement: null }), row('draft-rma', { is_draft: 'Yes' }), row('finished-transport', { rma_transport_status: 'COMPLETED' }), row('ordinary-delivery', { category: 'Deliveries' })],
    currentUserName: 'Logistics', onNavigate: () => {}, onUpdateRecord: async () => {},
  }));
  assert.ok(html.includes('eligible-rma')); assert.ok(html.includes('ordinary-delivery'));
  for (const hidden of ['supplier-rma', 'internal-rma', 'legacy-rma', 'draft-rma', 'finished-transport']) assert.equal(html.includes(hidden), false, hidden);
  assert.match(html.replace(/<!--.*?-->/g, ''), /2 unassigned, 2 shown/);
});

test('ordinary edit preconditions preserve the editor snapshot instead of refreshing it at save time', async () => {
  const client = createQueryClient();
  client.setQueryData(['records', 'detail', 'run'], { id: 'run', category: 'Deliveries', edit_version: 'record:new' });
  const read = mock.method(api, 'getRecord', async () => { throw new Error('Fetching a fresh version would hide a stale draft'); });
  const put = mock.method(api, 'updateRecord', async (_id, data) => ({ id: 'run', category: 'Deliveries', ...data }));
  const patch = mock.method(api, 'patchStatus', async () => ({ id: 'run', category: 'Deliveries', status: 'Scheduled', priority: '3 - High' }));
  const options = createUpdateRecordMutationOptions(client);
  await options.mutationFn({ id: 'run', updates: { reference: 'Draft reference', remarks: 'Change', expected_edit_version: 'record:old' } });
  assert.equal(put.mock.calls[0].arguments[1].expected_edit_version, 'record:old');
  await options.mutationFn({ id: 'run', updates: { status: 'Scheduled', priority: '3 - High', remarks: 'Priority', expected_edit_version: 'record:old' } });
  assert.equal(patch.mock.calls[0].arguments[3]?.expected_edit_version, 'record:old');
  assert.equal(read.mock.callCount(), 0);
  client.clear();
});
