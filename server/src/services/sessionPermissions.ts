import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { sessionUser } from './permissions';
import { evaluatePermissions, type EffectivePermissionSnapshot } from './permissionEvaluator';

/** One committed MVCC view for account identity, policy, overrides and revisions.
 * Never cache this load across requests or store its authority in the JWT. */
export async function loadPermissionSession(db: PrismaClient, id: string) {
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id }, select: {
      id: true, name: true, email: true, role: true, isActive: true, authorizationRevision: true,
      permissions: { select: { screen: true, granted: true } },
      permissionOverrides: { select: { userId: true, permissionKey: true, effect: true } },
      permissionConversion: { select: { catalogVersion: true } },
      driverProfile: { select: { id: true, type: true, isActive: true } },
    } });
    if (!user) return null;
    const rolePolicy = await tx.rolePolicy.findUnique({ where: { role: user.role }, include: { permissions: true } });
    const snapshot = evaluatePermissions({ userId: user.id, role: user.role, isActive: user.isActive,
      authorizationRevision: user.authorizationRevision, driverProfile: user.driverProfile,
      rolePolicy: user.permissionConversion?.catalogVersion === 1 ? rolePolicy : null, overrides: user.permissionOverrides });
    return { isActive: user.isActive, session: permissionSession(user, snapshot) };
  }, { isolationLevel: 'RepeatableRead' });
}

export function permissionSession(user: Parameters<typeof sessionUser>[0], snapshot: EffectivePermissionSnapshot) {
  const permissionVersion = createHash('sha256').update(JSON.stringify({ role: user.role,
    rolePolicyRevision: snapshot.rolePolicyRevision, authorizationRevision: snapshot.authorizationRevision,
    snapshot })).digest('hex');
  return { ...sessionUser(user), contractVersion: 1 as const, activeMode: 'V1' as const, snapshot,
    effectiveScreens: snapshot.effectiveScreens, resources: snapshot.resources, permissionVersion,
    driverProfileId: snapshot.driverProfileId };
}
