import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { cleanPodStorageDeletions } from '../src/services/podDeletionCleanup';
import { podStorage, podStorageNamespace, storageNamespace } from '../src/services/podStorage';

const restore: Array<() => void> = [];
function stub(target: any, method: string, work: (...args: any[]) => any) {
  const original = target[method];
  const replacement = mock.fn(work);
  target[method] = replacement;
  restore.push(() => { target[method] = original; });
  return replacement;
}
afterEach(() => { while (restore.length) restore.pop()!(); mock.restoreAll(); });

test('cleanup leaves failed jobs pending with a future retry and continues other jobs', async () => {
  const rows = [{ id: 'bad', storageKey: 'bad' }, { id: 'good', storageKey: 'good' }] as any;
  const find = stub(prisma.podStorageDeletion, 'findMany', async () => rows);
  const ack = stub(prisma.podStorageDeletion, 'deleteMany', async () => ({ count: 1 }));
  const failed = stub(prisma.podStorageDeletion, 'updateMany', async () => ({ count: 1 }));
  mock.method(podStorage, 'remove', async (key: string) => { if (key === 'bad') throw new Error('private provider detail'); });
  const before = Date.now();
  await cleanPodStorageDeletions();
  assert.equal(find.mock.calls[0].arguments[0]!.where!.storageNamespace, podStorageNamespace);
  assert.equal(find.mock.calls[0].arguments[0]!.take, 25);
  assert.equal(ack.mock.callCount(), 1);
  assert.deepEqual(ack.mock.calls[0].arguments[0], { where: { id: 'good' } });
  const update = failed.mock.calls[0].arguments[0] as any;
  assert.deepEqual(update.where, { id: 'bad' });
  assert.ok(update.data.nextAttemptAt.getTime() >= before + 60_000);
  assert.equal(update.data.attempts.increment, 1);
  assert.doesNotMatch(update.data.lastError, /private provider detail/);
});

test('acknowledgement failure leaves cleanup retryable even when the file is already gone', async () => {
  let pending = true;
  let first = true;
  stub(prisma.podStorageDeletion, 'findMany', async () => pending ? [{ id: 'job', storageKey: 'file' }] as any : []);
  stub(prisma.podStorageDeletion, 'deleteMany', async () => {
    if (first) { first = false; throw new Error('Database unavailable after storage deletion'); }
    pending = false; return { count: 1 };
  });
  stub(prisma.podStorageDeletion, 'updateMany', async () => ({ count: 1 }));
  const remove = mock.method(podStorage, 'remove', async () => {});
  await cleanPodStorageDeletions();
  assert.equal(pending, true);
  await cleanPodStorageDeletions();
  assert.equal(pending, false);
  assert.equal(remove.mock.callCount(), 2);
});

test('a failed queue read releases the worker for a later recovery attempt', async () => {
  let first = true;
  stub(prisma.podStorageDeletion, 'findMany', async () => { if (first) { first = false; throw new Error('Database unavailable'); } return []; });
  await assert.rejects(cleanPodStorageDeletions(), /Database unavailable/);
  await cleanPodStorageDeletions();
});

test('cleanup namespace follows storage target rather than rotating credentials', () => {
  assert.notEqual(storageNamespace({ POD_STORAGE_PROVIDER: 'local', POD_UPLOAD_DIR: '/tmp/storage-a' }), storageNamespace({ POD_STORAGE_PROVIDER: 'local', POD_UPLOAD_DIR: '/tmp/storage-b' }));
  const env = { POD_STORAGE_PROVIDER: 'supabase', SUPABASE_URL: 'https://storage.example.test', SUPABASE_STORAGE_BUCKET: 'pod', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-key' };
  assert.equal(storageNamespace(env), storageNamespace({ ...env, SUPABASE_SERVICE_ROLE_KEY: 'rotated-synthetic-test-key' }));
  assert.notEqual(storageNamespace(env), storageNamespace({ ...env, SUPABASE_STORAGE_BUCKET: 'other' }));
});
