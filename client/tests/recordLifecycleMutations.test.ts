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
