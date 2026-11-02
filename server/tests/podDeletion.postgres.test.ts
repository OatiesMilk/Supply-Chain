import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prisma } from '../src/db';
import auth from '../src/routes/auth';
import records from '../src/routes/records';
import { applySecurity } from '../src/middleware/security';
import { assertPermissionBackfillTarget } from '../src/services/permissionBackfill';
import { podStorage, podStorageNamespace } from '../src/services/podStorage';
import { cleanPodStorageDeletions } from '../src/services/podDeletionCleanup';

const target = process.env.SEED_TEST_DATABASE_URL;
test('PostgreSQL attachment deletion preserves files on rollback and recovers committed cleanup', { skip: !target, timeout: 60_000 }, async t => {
  assert.equal(process.env.DATABASE_URL, target);
  assertPermissionBackfillTarget({ DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: new URL(target!).pathname.slice(1) });
  assert.equal(process.env.POD_STORAGE_PROVIDER, 'local');
  process.env.PERMISSION_MODE = 'LEGACY';
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@microgenesis.com' } });
  const company = await prisma.company.findFirstOrThrow();
  const recordId = 'pod-deletion-regression';
  await prisma.deliveryRecord.create({ data: {
    id: recordId, companyId: company.id, category: 'DELIVERY', status: 'SCHEDULED',
    priority: '2 - Moderate', reference: 'POD-DELETE', area: 'Test', accountManager: 'Test',
    deliveryDate: '2026-11-03', itemType: 'Small Item', createdById: actor.id, modifiedById: actor.id,
  } });
  const bytes = Buffer.from('Private disposable attachment content');
  const key = await podStorage.save({ originalName: 'deletion-regression.txt', mimeType: 'text/plain', size: bytes.length, buffer: bytes });
  const file = await prisma.podAttachment.create({ data: {
    recordId, originalName: 'deletion-regression.txt', storageKey: key, mimeType: 'text/plain', size: bytes.length, uploadedById: actor.id,
  } });
  const app = express();
  app.use(express.json(), cookieParser());
  applySecurity(app);
  app.use('/api/auth', auth);
  app.use('/api/records', records);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: 'Injected database failure' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  try {
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: actor.email, password: 'admin123' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const csrf = login.headers.get('x-csrf-token')!;
    const remove = () => fetch(`${base}/records/${recordId}/attachments/${file.id}`, {
      method: 'DELETE', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: '{}',
    });
    const assertPreserved = async () => {
      assert.equal(await prisma.podAttachment.count({ where: { id: file.id } }), 1);
      assert.equal(await prisma.podStorageDeletion.count({ where: { storageKey: key } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { recordId } }), 0);
      assert.deepEqual(await podStorage.read(key), bytes);
    };
    await t.test('audit write failure rolls back metadata and queue without deleting bytes', async () => {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_pod_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."recordId" = 'pod-deletion-regression' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_pod_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION test_reject_pod_audit()`);
      try { assert.equal((await remove()).status, 500); await assertPreserved(); }
      finally { await prisma.$executeRawUnsafe('DROP TRIGGER test_reject_pod_audit ON "AuditLog"'); await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_pod_audit()'); }
    });
    await t.test('deferred commit failure leaves the stored file and metadata intact', async () => {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_pod_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."recordId" = 'pod-deletion-regression' THEN RAISE EXCEPTION 'Injected commit failure'; END IF; RETURN OLD; END $$`);
      await prisma.$executeRawUnsafe(`CREATE CONSTRAINT TRIGGER test_reject_pod_commit AFTER DELETE ON "PodAttachment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_reject_pod_commit()`);
      try { assert.equal((await remove()).status, 500); await assertPreserved(); }
      finally { await prisma.$executeRawUnsafe('DROP TRIGGER test_reject_pod_commit ON "PodAttachment"'); await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_pod_commit()'); }
    });
    await t.test('storage outage leaves a committed durable retry; recovery removes only the deleted attachment', async () => {
      const outage = mock.method(podStorage, 'remove', async () => { throw new Error('Storage unavailable'); });
      try { assert.equal((await remove()).status, 204); } finally { outage.mock.restore(); }
      assert.equal(await prisma.podAttachment.count({ where: { id: file.id } }), 0);
      assert.deepEqual(await podStorage.read(key), bytes);
      const job = await prisma.podStorageDeletion.findUniqueOrThrow({ where: { storageNamespace_storageKey: { storageNamespace: podStorageNamespace, storageKey: key } } });
      assert.equal(job.attempts, 1);
      assert.ok(job.lastError);
      assert.equal(await prisma.auditLog.count({ where: { recordId } }), 1);
      // A fresh process has no request-local state and must recover from the DB.
      await prisma.podStorageDeletion.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
      await promisify(execFile)(process.execPath, ['--import', 'tsx', '-e',
        "const {prisma}=require('./src/db'); require('./src/services/podDeletionCleanup').cleanPodStorageDeletions().catch(()=>{process.exitCode=1}).finally(()=>prisma.$disconnect())"],
      { env: process.env, timeout: 20_000 });
      assert.equal(await prisma.podStorageDeletion.count({ where: { id: job.id } }), 0);
      await assert.rejects(podStorage.read(key));
      assert.equal((await remove()).status, 404);
      assert.equal(await prisma.auditLog.count({ where: { recordId } }), 1, 'duplicate DELETE creates no second audit');
    });
    await t.test('cleanup is repeatable and ignores jobs belonging to another storage target', async () => {
      const foreign = await prisma.podStorageDeletion.create({ data: { storageKey: 'foreign-key', storageNamespace: 'another-storage-target' } });
      const missing = await prisma.podStorageDeletion.create({ data: { storageKey: 'already-removed-file', storageNamespace: podStorageNamespace } });
      await cleanPodStorageDeletions();
      await cleanPodStorageDeletions();
      assert.equal(await prisma.podStorageDeletion.count({ where: { id: missing.id } }), 0);
      assert.equal(await prisma.podStorageDeletion.count({ where: { id: foreign.id } }), 1);
      await prisma.podStorageDeletion.delete({ where: { id: foreign.id } });
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await podStorage.remove(key);
    await prisma.$disconnect();
  }
});
