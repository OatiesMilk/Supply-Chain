import { prisma } from '../src/db';
import { podStorage, podStorageKeys, podStorageProvider } from '../src/services/podStorage';

async function main() {
  // The file listing below reads the local upload folder only. Against Supabase
  // it would report every attachment as missing, so refuse instead of misleading.
  if (podStorageProvider() !== 'local') {
    throw new Error('pod:reconcile supports POD_STORAGE_PROVIDER="local" only; it cannot list a Supabase bucket.');
  }
  const [files, attachments] = await Promise.all([
    podStorageKeys(),
    prisma.podAttachment.findMany({ select: { storageKey: true } })
  ]);
  const tracked = new Set(attachments.map(attachment => attachment.storageKey));
  const orphaned = files.filter(file => !tracked.has(file));

  for (const storageKey of orphaned) await podStorage.remove(storageKey);
  const missing = attachments.filter(attachment => !files.includes(attachment.storageKey));
  console.log(`POD reconciliation complete: removed ${orphaned.length} orphaned file(s), found ${missing.length} missing file(s).`);
  if (missing.length > 0) {
    console.warn(`Missing storage keys: ${missing.map(attachment => attachment.storageKey).join(', ')}`);
  }
}

main()
  .catch(error => {
    console.error('POD reconciliation failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
