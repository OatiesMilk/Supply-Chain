import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planRecordAttachmentUploads,
  uploadPendingRecordAttachments,
  type AttachmentUploadStatus,
  type StagedRecordAttachment,
  type StoredRecordAttachment,
} from '../src/utils/recordAttachments';

const stagedFile = (name: string, type: string, size: number): File =>
  ({ name, type, size } as File);

test('attachment reconciliation matches duplicate metadata as a multiset', () => {
  const plan = planRecordAttachmentUploads([
    { id: 'first', name: 'proof.pdf', mimeType: 'application/pdf', size: 20, status: 'pending' },
    { id: 'second', name: 'proof.pdf', mimeType: 'application/pdf', size: 20, status: 'pending' },
    { id: 'third', name: 'other.pdf', mimeType: 'application/pdf', size: 25, status: 'pending' },
  ], [
    { name: 'proof.pdf', mime_type: 'application/pdf', size: 20 },
    { name: 'proof.pdf', mime_type: 'application/pdf', size: 20 },
  ]);

  assert.deepEqual(plan, {
    alreadyStoredIds: ['first', 'second'],
    pendingIds: ['third'],
  });
});

test('retry reconciles an upload saved by the server before a lost response', async () => {
  const staged: StagedRecordAttachment[] = [{
    id: 'file-1',
    file: stagedFile('proof.pdf', 'application/pdf', 20),
    status: 'pending',
  }];
  const stored: StoredRecordAttachment[] = [];
  const statuses = new Map<string, AttachmentUploadStatus>();
  let uploadCalls = 0;
  const fakeApi = {
    getRecordAttachments: async () => stored,
    uploadRecordAttachment: async (_recordId: string, file: File) => {
      uploadCalls += 1;
      stored.push({ name: file.name, mime_type: file.type, size: file.size });
      throw new Error('connection lost after save');
    },
  };
  const onStatus = (id: string, status: AttachmentUploadStatus, error?: string) => {
    statuses.set(id, status);
    const item = staged.find(attachment => attachment.id === id);
    if (item) {
      item.status = status;
      if (error) item.error = error;
      else delete item.error;
    }
  };

  assert.equal(await uploadPendingRecordAttachments('record-1', staged, fakeApi, onStatus), false);
  assert.equal(statuses.get('file-1'), 'failed');

  assert.equal(await uploadPendingRecordAttachments('record-1', staged, fakeApi, onStatus), true);
  assert.equal(uploadCalls, 1);
  assert.equal(statuses.get('file-1'), 'uploaded');
});
