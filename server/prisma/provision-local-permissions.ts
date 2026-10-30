import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { localPermissionProvisioningTarget } from '../src/services/localPermissionProvisioning';
import { convertPermissionAccount, initializePermissionFoundation } from '../src/services/permissionBackfill';

async function main() {
  // Validate the explicitly supplied target before opening a connection. This
  // command intentionally does not import db.ts or load a repository .env file.
  const { connectionString, actorId } = localPermissionProvisioningTarget();
  const pool = new Pool({ connectionString });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await initializePermissionFoundation(db, actorId);
    let cursor: string | undefined;
    let converted = 0;
    let unchanged = 0;
    for (;;) {
      const accounts = await db.user.findMany({ take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: { id: 'asc' }, select: { id: true } });
      if (!accounts.length) break;
      for (const account of accounts) {
        if (await convertPermissionAccount(db, account.id, actorId) === 'converted') converted++; else unchanged++;
        cursor = account.id;
      }
    }
    console.log(JSON.stringify({ catalogVersion: 1, converted, unchanged, quarantined: await db.permissionQuarantine.count() }));
  } finally {
    await db.$disconnect();
    await pool.end();
  }
}

if (require.main === module) main().catch(() => {
  console.error('Local permission provisioning stopped. Review the confirmed development target, active Admin, baseline policies and legacy conversion checkpoints; no credentials are logged.');
  process.exitCode = 1;
});
