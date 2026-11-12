import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { CATALOG_KEYS, PERMISSION_CATALOG, POLICY_CATEGORIES, POLICY_ROLES, defaultRolePermissions, isPolicyRole, legacyCapabilities, legacyEditableScreen, legacyPolicyScreens, policyKey, roleActionCeiling, type LegacyGrant, type PolicyEffect } from './permissionCatalog';

export const PERMISSION_CATALOG_VERSION = 1;
const CATEGORY_BY_SCREEN: Record<string, string> = { deliveries: 'DELIVERY', rma: 'RMA', accounting_collection: 'ACCOUNTING_COLLECTION', procurement_pickup: 'PROCUREMENT_PICKUP', sales_orders: 'SALES_ORDERS' };
export type ConversionAccount = { id: string; role: string; permissions: LegacyGrant[]; driverProfile?: { id: string; type: string; isActive: boolean } | null };
export type PlannedOverride = { permissionKey: string; effect: PolicyEffect; sourceLegacyIds: string[] };
export function planPermissionConversion(account: ConversionAccount) {
  if (!isPolicyRole(account.role)) throw new Error('Permission conversion stopped: unknown account role');
  const role = account.role;
  const source = {
    catalogVersion: PERMISSION_CATALOG_VERSION, role,
    permissions: account.permissions.map(({ id, screen, granted }) => ({ id, screen, granted })).sort((a, b) => a.id.localeCompare(b.id)),
    driverProfile: account.driverProfile ? { id: account.driverProfile.id, type: account.driverProfile.type, isActive: account.driverProfile.isActive } : null,
  };
  const sourceHash = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const baseline = defaultRolePermissions(role);
  const effective = legacyCapabilities(role, legacyPolicyScreens(role, account.permissions), account.permissions);
  const allSourceIds = source.permissions.map(p => p.id);
  const overrides = new Map<string, PlannedOverride>();
  const put = (permissionKey: string, sourceIds: string[]) => {
    if (!CATALOG_KEYS.has(permissionKey)) throw new Error('Unknown conversion catalog key');
    const p = PERMISSION_CATALOG.find(p => p.key === permissionKey)!;
    const effect = effective.get(permissionKey)!;
    if (effect === 'ALLOW' && !roleActionCeiling(role, p)) throw new Error(`Permission conversion stopped: action exceeds role ceiling (${permissionKey})`);
    const previous = overrides.get(permissionKey);
    overrides.set(permissionKey, { permissionKey, effect, sourceLegacyIds: [...new Set([...(previous?.sourceLegacyIds ?? []), ...sourceIds])].sort() });
  };
  // Only changes produced by legacy exceptions become derived overrides.
  // With no legacy rows, every capability inherits the current role policy.
  for (const p of PERMISSION_CATALOG) if (baseline.get(p.key) !== effective.get(p.key)) put(p.key, allSourceIds);
  const quarantine = [] as Array<{ legacyId: string; userId: string; screen: string; granted: boolean; reason: string; sourceHash: string }>;
  for (const legacy of source.permissions) {
    const editable = legacyEditableScreen(role, legacy.screen);
    if (!editable) quarantine.push({
      legacyId: legacy.id, userId: account.id, screen: legacy.screen, granted: legacy.granted, sourceHash,
      reason: !CATALOG_KEYS.has(policyKey('SCREEN', legacy.screen, 'READ')) ? 'UNKNOWN_SCREEN' : !legacy.granted && CATEGORY_BY_SCREEN[legacy.screen] ? 'PROTECTED_SCREEN_CATEGORY_DENIAL_PRESERVED' : 'PROTECTED_SCREEN_IGNORED',
    });
    if (editable) {
      put(policyKey('SCREEN', legacy.screen, 'READ'), [legacy.id]);
      put(policyKey('SCREEN', legacy.screen, 'WRITE'), [legacy.id]);
    }
    // Navigation ignores protected rows, but legacy recordAccess still honors
    // every known category false. Preserve that denial even for Driver users.
    const category = CATEGORY_BY_SCREEN[legacy.screen];
    if (category && (editable || !legacy.granted)) for (const p of PERMISSION_CATALOG) if (p.scope === 'CATEGORY' && p.module === category) put(p.key, [legacy.id]);
  }
  return {
    sourceHash,
    overrides: [...overrides.values()].sort((a, b) => a.permissionKey.localeCompare(b.permissionKey)),
    quarantine,
    report: {
      catalogVersion: PERMISSION_CATALOG_VERSION, role, sourceRows: source.permissions.length,
      overrideRows: overrides.size, quarantinedRows: quarantine.length,
      // This is an ownership requirement, never an account-wide grant.
      recordOwnership: role === 'DRIVER' ? 'LINKED_ASSIGNED_NON_DRAFT_ONLY' : 'ROLE_CATEGORY_SCOPE',
      driverLinked: role === 'DRIVER' ? account.driverProfile?.type === 'DRIVER' : null,
      readCategories: POLICY_CATEGORIES.filter(c => effective.get(policyKey('CATEGORY', c, 'READ')) === 'ALLOW'),
    },
  };
}

/** Create complete baseline policies once; never overwrite a customized policy. */
export async function initializePermissionFoundation(db: PrismaClient, actorId: string): Promise<void> {
  await db.$transaction(async tx => {
    // Same global ordering for initialization and conversion processes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(243, 1)`;
    await assertBackfillActor(tx, actorId);
    await tx.permissionDefinition.createMany({ data: PERMISSION_CATALOG.map(p => ({ ...p })), skipDuplicates: true });
    const catalog = await tx.permissionDefinition.findMany({ orderBy: { key: 'asc' } });
    const expected = [...PERMISSION_CATALOG].sort((a, b) => a.key.localeCompare(b.key));
    if (catalog.length !== expected.length || expected.some(p => !catalog.some(c => c.key === p.key && c.scope === p.scope && c.module === p.module && c.action === p.action))) throw new Error('Permission catalog mismatch; conversion stopped');
    for (const role of POLICY_ROLES) {
      const existing = await tx.rolePolicy.findUnique({ where: { role }, include: { permissions: true } });
      if (existing) {
        if (existing.catalogVersion !== PERMISSION_CATALOG_VERSION || existing.permissions.length !== PERMISSION_CATALOG.length) throw new Error('Incomplete or unsupported role policy; conversion stopped');
        continue;
      }
      await tx.rolePolicy.create({ data: {
        role, catalogVersion: PERMISSION_CATALOG_VERSION,
        permissions: { create: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) },
      } });
      await tx.auditLog.create({ data: { recordId: role, recordType: 'RolePolicy', action: 'CREATE', changedById: actorId, previousValue: null, newValue: JSON.stringify({ source: 'LEGACY_V1_BASELINE', catalogVersion: PERMISSION_CATALOG_VERSION, permissions: [...defaultRolePermissions(role)] }) } });
    }
  }, { timeout: 30000 });
}

/**
 * Transaction boundaries are per account, with an atomic checkpoint and safe
 * before/after audit. Crash/retry either commits everything or nothing.
 * Run only while legacy permission/role writes are quiesced (see runbook).
 */
export async function convertPermissionAccount(db: PrismaClient, userId: string, actorId: string): Promise<'converted' | 'unchanged'> {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(243, 1)`;
    await assertBackfillActor(tx, actorId);
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, include: { permissions: true, driverProfile: { select: { id: true, type: true, isActive: true } }, permissionConversion: true } });
    if (!user) throw new Error('Conversion account no longer exists');
    const plan = planPermissionConversion(user);
    if (user.permissionConversion) {
      if (user.permissionConversion.catalogVersion !== PERMISSION_CATALOG_VERSION || user.permissionConversion.sourceHash !== plan.sourceHash) throw new Error('Legacy source changed after conversion; review before resuming');
      return 'unchanged';
    }
    const policies = await tx.rolePolicy.findMany({ include: { permissions: true } });
    // A baseline-only backfill must never run on edited/activated role policies.
    if (policies.length !== POLICY_ROLES.length || policies.some(p => !isPolicyRole(p.role) || p.catalogVersion !== PERMISSION_CATALOG_VERSION || p.permissions.length !== PERMISSION_CATALOG.length || p.permissions.some(row => row.effect !== defaultRolePermissions(p.role as typeof POLICY_ROLES[number]).get(row.permissionKey)))) throw new Error('Role policy is not the migration baseline; conversion stopped');
    if (await tx.userPermissionOverride.count({ where: { userId } })) throw new Error('Account already has new-policy overrides without a checkpoint; conversion stopped');
    if (plan.overrides.length) await tx.userPermissionOverride.createMany({ data: plan.overrides.map(p => ({ ...p, userId, source: 'LEGACY_V1' })) });
    if (plan.quarantine.length) await tx.permissionQuarantine.createMany({ data: plan.quarantine });
    await tx.permissionConversion.create({ data: { userId, sourceHash: plan.sourceHash, catalogVersion: PERMISSION_CATALOG_VERSION, report: plan.report as Prisma.InputJsonValue } });
    await tx.auditLog.create({ data: {
      recordId: userId, recordType: 'PermissionConversion', action: 'CREATE', changedById: actorId,
      previousValue: JSON.stringify({ legacyRows: user.permissions.map(p => ({ id: p.id, screen: p.screen, granted: p.granted })) }),
      newValue: JSON.stringify({ sourceHash: plan.sourceHash, overrides: plan.overrides, quarantine: plan.quarantine.map(p => ({ legacyId: p.legacyId, reason: p.reason })), report: plan.report }),
    } });
    return 'converted';
  }, { timeout: 30000 });
}

async function assertBackfillActor(tx: Prisma.TransactionClient, actorId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR UPDATE`;
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, isActive: true } });
  if (!actor || actor.role !== 'ADMIN' || !actor.isActive) throw new Error('Permission conversion requires an identified active Admin operator');
}

export function assertPermissionBackfillTarget(env: NodeJS.ProcessEnv = process.env): void {
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ''); } catch { throw new Error('Permission backfill requires an explicit identified DATABASE_URL'); }
  let database: string;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { throw new Error('Invalid permission backfill database'); }
  const deployed = ['CI', 'RENDER', 'RENDER_SERVICE_ID', 'RAILWAY_ENVIRONMENT', 'VERCEL', 'FLY_APP_NAME', 'K_SERVICE', 'HEROKU_APP_NAME'].some(key => Boolean(env[key]));
  const safeQuery = [...url.searchParams].every(([key, value]) => key === 'schema' && value === 'public');
  if (deployed || env.APP_ENV && !['development', 'test'].includes(env.APP_ENV) || !['development', 'test'].includes(env.NODE_ENV ?? '') || env.PERMISSION_BACKFILL_DATABASE !== database || !safeQuery || url.hash || !['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/^[a-zA-Z0-9_]+_(test|sandbox)$/.test(database)) throw new Error('Permission backfill is restricted to explicitly designated local development/test databases');
}
