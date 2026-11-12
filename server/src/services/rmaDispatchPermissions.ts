import type { PrismaClient, Prisma } from '@prisma/client';
import { defaultRolePermissions, type PolicyRole } from './permissionCatalog';
import { evaluatePermissions } from './permissionEvaluator';

export const RMA_DISPATCH_GRANTS: Partial<Record<PolicyRole, readonly string[]>> = {
  LOGISTICS: ['SCREEN:rma:WRITE', 'CATEGORY:RMA:WRITE', 'CATEGORY:RMA:ASSIGN'],
  DRIVER: ['CATEGORY:RMA:READ', 'CATEGORY:RMA:WRITE', 'CATEGORY:RMA:STATUS', 'CATEGORY:RMA:POD', 'CATEGORY:RMA:COMMENT'],
};
export function dispatchRolePermissions(role: PolicyRole) {
  const permissions = defaultRolePermissions(role);
  for (const key of RMA_DISPATCH_GRANTS[role] ?? []) permissions.set(key, 'ALLOW');
  return permissions;
}
/** Explicit rollout, separate from the frozen no-expansion permission backfill.
 * Custom role policies and every individual override remain untouched. */
export async function provisionRmaDispatchPermissions(db: PrismaClient, actorId?: string) {
  if (!actorId) throw new Error('An identified active Admin must activate RMA dispatch permissions.');
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(243, 1)`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, isActive: true } });
    if (!actor?.isActive || actor.role !== 'ADMIN') throw new Error('Only an active Admin can activate RMA dispatch permissions.');
    const upgraded: string[] = [], skipped: string[] = [];
    for (const role of ['LOGISTICS', 'DRIVER'] as const) {
      const policy = await tx.rolePolicy.findUnique({ where: { role }, include: { permissions: true } });
      const baseline = defaultRolePermissions(role), desired = dispatchRolePermissions(role);
      const matches = (expected: Map<string, string>) => !!policy && policy.catalogVersion === 1
        && policy.permissions.length === expected.size && policy.permissions.every(row => expected.get(row.permissionKey) === row.effect);
      if (matches(desired)) continue;
      // A revision beyond the untouched baseline may intentionally repeat DENY.
      // The foundation's row triggers increment once per inserted catalog row.
      const baselineRevision = BigInt(baseline.size + 1);
      if (!matches(baseline) || policy!.revision !== baselineRevision) { skipped.push(role); continue; }
      for (const permissionKey of RMA_DISPATCH_GRANTS[role]!) await tx.rolePermission.update({
        where: { role_permissionKey: { role, permissionKey } }, data: { effect: 'ALLOW' },
      });
      const committedPolicy = await tx.rolePolicy.findUniqueOrThrow({ where: { role }, select: { revision: true } });
      await tx.auditLog.create({ data: {
        recordId: role, recordType: 'RolePolicy', action: 'UPDATE', changedById: actorId,
        previousValue: JSON.stringify({ source: 'RMA_DISPATCH_255', revision: policy!.revision.toString(), permissions: [...baseline] }),
        newValue: JSON.stringify({ source: 'RMA_DISPATCH_255', revision: committedPolicy.revision.toString(), permissions: [...desired] }),
      } });
      upgraded.push(role);
    }
    return { upgraded, skipped };
  });
}

/** Read inside the caller's write transaction so revocations are current. */
export async function readRmaPermissions(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: {
    id: true, role: true, isActive: true, authorizationRevision: true,
    permissionOverrides: { select: { userId: true, permissionKey: true, effect: true } },
    driverProfile: { select: { id: true, type: true, isActive: true } },
  } });
  if (!user) return null;
  const rolePolicy = await tx.rolePolicy.findUnique({ where: { role: user.role }, include: { permissions: true } });
  return evaluatePermissions({ userId, role: user.role, isActive: user.isActive,
    authorizationRevision: user.authorizationRevision, overrides: user.permissionOverrides,
    driverProfile: user.driverProfile, rolePolicy });
}
