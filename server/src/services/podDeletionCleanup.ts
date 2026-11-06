import { prisma } from '../db';
import { podStorage, podStorageNamespace } from './podStorage';

const RETRY_MS = 60_000;
let draining = false;

/** Only committed outbox rows may authorize an irreversible storage delete. */
export async function cleanPodStorageDeletions(id?: string) {
  if (draining) return;
  draining = true;
  try {
    const jobs = await prisma.podStorageDeletion.findMany({
      where: { storageNamespace: podStorageNamespace, nextAttemptAt: { lte: new Date() }, ...(id ? { id } : {}) },
      orderBy: { createdAt: 'asc' }, take: 25,
    });
    for (const job of jobs) {
      try {
        await podStorage.remove(job.storageKey);
        // Concurrent workers and retries are safe: provider removal and this
        // acknowledgement are idempotent, and storage keys are never reused.
        await prisma.podStorageDeletion.deleteMany({ where: { id: job.id } });
      } catch {
        await prisma.podStorageDeletion.updateMany({ where: { id: job.id }, data: {
          attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + RETRY_MS),
          lastError: 'Storage cleanup failed; retry scheduled.',
        } });
        console.warn('[POD cleanup] Attachment cleanup retained for retry', job.id);
      }
    }
  } finally { draining = false; }
}

/** Recovery on startup covers a crash after commit and before immediate cleanup. */
export function startPodDeletionCleanup() {
  const run = () => void cleanPodStorageDeletions().catch(() => {
    console.error('[POD cleanup] Could not drain committed attachment cleanup jobs');
  });
  run();
  const timer = setInterval(run, RETRY_MS);
  timer.unref();
  return timer;
}
