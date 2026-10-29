import { assertPermissionBackfillTarget, convertPermissionAccount, initializePermissionFoundation } from '../src/services/permissionBackfill';

async function main() {
  // Validate before importing db.ts: no connection to a fallback/.env target.
  assertPermissionBackfillTarget();
  const actorId = process.env.PERMISSION_BACKFILL_ACTOR_ID;
  if (!actorId) throw new Error('PERMISSION_BACKFILL_ACTOR_ID must identify the active Admin operator');
  const { prisma } = await import('../src/db.js');
  try {
    await initializePermissionFoundation(prisma, actorId);
    let cursor: string | undefined;
    let converted = 0;
    let unchanged = 0;
    for (;;) {
      const accounts = await prisma.user.findMany({ take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: { id: 'asc' }, select: { id: true } });
      if (!accounts.length) break;
      for (const account of accounts) {
        if (await convertPermissionAccount(prisma, account.id, actorId) === 'converted') converted++; else unchanged++;
        cursor = account.id;
      }
    }
    console.log(JSON.stringify({ catalogVersion: 1, converted, unchanged, quarantined: await prisma.permissionQuarantine.count() }));
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch(() => { console.error('Permission backfill stopped. Review source changes, baseline policies and the designated database; no credentials are logged.'); process.exitCode = 1; });
