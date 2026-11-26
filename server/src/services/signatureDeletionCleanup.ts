import { prisma } from '../db';
import { signatureStorage, signatureStorageNamespace } from './signatureStorage';

const RETRY_MS = 60_000;
let draining = false;

/**
 * Drains committed signature deletion jobs. Shares the PodStorageDeletion
 * outbox table but only ever reads rows in the signature namespace, so it can
 * never remove a POD attachment (and the POD worker never sees these rows).
 */
export async function cleanSignatureStorageDeletions(id?: string) {
  if (draining) return;
  draining = true;
  try {
    const jobs = await prisma.podStorageDeletion.findMany({
      where: { storageNamespace: signatureStorageNamespace, nextAttemptAt: { lte: new Date() }, ...(id ? { id } : {}) },
      orderBy: { createdAt: 'asc' }, take: 25,
    });
    for (const job of jobs) {
      try {
        await signatureStorage.remove(job.storageKey);
        await prisma.podStorageDeletion.deleteMany({ where: { id: job.id } });
      } catch {
        await prisma.podStorageDeletion.updateMany({ where: { id: job.id }, data: {
          attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + RETRY_MS),
          lastError: 'Signature storage cleanup failed; retry scheduled.',
        } });
        console.warn('[Signature cleanup] Signature cleanup retained for retry', job.id);
      }
    }
  } finally { draining = false; }
}

export function startSignatureDeletionCleanup() {
  const run = () => void cleanSignatureStorageDeletions().catch(() => {
    console.error('[Signature cleanup] Could not drain committed signature cleanup jobs');
  });
  run();
  const timer = setInterval(run, RETRY_MS);
  timer.unref();
  return timer;
}
