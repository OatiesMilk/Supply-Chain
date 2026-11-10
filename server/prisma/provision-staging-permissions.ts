import type { PrismaClient } from '@prisma/client';
import { assertStagingSeedTarget, StagingSeedError } from './staging-seed-safety';
import { convertPermissionAccount, initializePermissionFoundation, PERMISSION_CATALOG_VERSION, planPermissionConversion } from '../src/services/permissionBackfill';
import { PERMISSION_CATALOG, POLICY_ROLES } from '../src/services/permissionCatalog';

/**
 * Prepares the baseline role policies on the confirmed staging database and
 * converts existing accounts, using the same audited code as local provisioning.
 * It only adds missing baseline rows: existing policies, overrides and
 * conversion checkpoints are never changed (the shared helpers stop instead).
 * Default is a read-only preview; --apply also needs STAGING_PERMISSIONS_APPROVED=true.
 */
export function assertStagingPermissionTarget(env: NodeJS.ProcessEnv = process.env, options: { apply?: boolean } = {}) {
  // Reuses the staging seed's target confirmation (APP_ENV, exact host, database,
  // Supabase project ref and existing active Admin) without its data approval flag.
  const target = assertStagingSeedTarget(env);
  if (options.apply === true && env.STAGING_PERMISSIONS_APPROVED !== 'true') {
    throw new StagingSeedError('Staging permission setup refused: --apply requires STAGING_PERMISSIONS_APPROVED=true after review of the preview.');
  }
  return target;
}

export async function runStagingPermissionSetup(db: PrismaClient, options: { apply?: boolean } = {}, env: NodeJS.ProcessEnv = process.env) {
  const apply = options.apply === true;
  const target = assertStagingPermissionTarget(env, options); // Before any read.
  const identity = await db.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (identity[0]?.database !== target.database) throw new StagingSeedError('Staging permission setup refused: connected database does not match confirmation.');
  const admin = await db.user.findUnique({ where: { email: target.adminEmail } });
  if (!admin || admin.role !== 'ADMIN' || !admin.isActive) throw new StagingSeedError('Staging permission setup requires an existing active Admin.');

  const existingKeys = new Set((await db.permissionDefinition.findMany({ select: { key: true } })).map(row => row.key));
  const existingRoles = new Set((await db.rolePolicy.findMany({ select: { role: true } })).map(row => row.role));
  const users = await db.user.findMany({ orderBy: { id: 'asc' }, include: { permissions: true, driverProfile: { select: { id: true, type: true, isActive: true } }, permissionConversion: true } });
  const pending = users.filter(user => !user.permissionConversion);
  const plans = pending.map(user => ({ role: user.role, plan: planPermissionConversion(user) }));
  const preview = {
    catalogVersion: PERMISSION_CATALOG_VERSION,
    permissionDefinitionsToAdd: PERMISSION_CATALOG.filter(entry => !existingKeys.has(entry.key)).length,
    rolePoliciesToAdd: POLICY_ROLES.filter(role => !existingRoles.has(role)),
    accountsToConvert: plans.map(({ role, plan }) => ({ role, overrides: plan.overrides.length, quarantined: plan.quarantine.length })),
    accountsAlreadyConverted: users.length - pending.length,
  };
  if (!apply) return { mode: 'dry-run', ...preview };

  await initializePermissionFoundation(db, admin.id);
  let converted = 0;
  let unchanged = 0;
  for (const user of users) {
    if (await convertPermissionAccount(db, user.id, admin.id) === 'converted') converted++; else unchanged++;
  }
  return {
    mode: 'applied', ...preview, converted, unchanged,
    rolePolicies: await db.rolePolicy.count(), rolePermissions: await db.rolePermission.count(),
    quarantined: await db.permissionQuarantine.count(),
  };
}

if (require.main === module) {
  // The DB singleton is imported only after the target guard succeeds.
  void (async () => {
    const dotenv = await import('dotenv'); dotenv.config();
    if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new StagingSeedError('Usage: permissions:provision-staging [--apply]; default is read-only preview.');
    const apply = process.argv.includes('--apply');
    assertStagingPermissionTarget(process.env, { apply });
    const { prisma } = await import('../src/db.js');
    try {
      console.log(JSON.stringify(await runStagingPermissionSetup(prisma, { apply }), null, 2));
    } finally { await prisma.$disconnect(); }
  })().catch((error: unknown) => {
    // Never print raw DB errors or connection strings.
    const code = typeof error === 'object' && error !== null && 'code' in error &&
      typeof error.code === 'string' && /^P[0-9]{4}$/.test(error.code) ? ` (${error.code})` : '';
    console.error(error instanceof StagingSeedError ? error.message
      : `Staging permission setup stopped${code}. Review role policies, conversion checkpoints and quarantine before retrying; no credentials are logged.`);
    process.exitCode = 1;
  });
}
