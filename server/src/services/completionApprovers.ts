import type { Prisma } from '@prisma/client';
import { effectiveScreens } from './permissions';
import { evaluatePermissions, hasActionPermission } from './permissionEvaluator';
import { writePathForCategory } from './recordAccess';
import type { Screen } from './permissions';

const categoryScreen: Record<string, Screen> = {
  DELIVERY: 'deliveries',
  ACCOUNTING_COLLECTION: 'accounting_collection',
  PROCUREMENT_PICKUP: 'procurement_pickup',
  SALES_ORDERS: 'sales_orders',
};

/** Current active Sales Coordinators able to read and receive this category. */
export async function salesCompletionApproverIds(
  tx: Prisma.TransactionClient,
  category: string,
  mode: 'LEGACY' | 'V1',
): Promise<string[]> {
  const screen = categoryScreen[category];
  if (!screen) return [];
  const users = await tx.user.findMany({
    where: { role: 'SALES_COORDINATOR', isActive: true },
    select: {
      id: true, role: true, isActive: true, authorizationRevision: true,
      permissions: { select: { screen: true, granted: true } },
      permissionOverrides: { select: { userId: true, permissionKey: true, effect: true } },
      permissionConversion: { select: { catalogVersion: true } },
      driverProfile: { select: { id: true, type: true, isActive: true } },
    },
  });

  if (mode === 'LEGACY') {
    return users.filter(user => effectiveScreens(user.role, user.permissions).includes(screen)).map(user => user.id);
  }

  const rolePolicy = await tx.rolePolicy.findUnique({ where: { role: 'SALES_COORDINATOR' }, include: { permissions: true } });
  return users.filter(user => {
    const policy = user.permissionConversion?.catalogVersion === 1 ? rolePolicy : null;
    const snapshot = evaluatePermissions({
      userId: user.id, role: user.role, isActive: user.isActive,
      authorizationRevision: user.authorizationRevision, driverProfile: user.driverProfile,
      rolePolicy: policy, overrides: user.permissionOverrides,
    });
    const path = writePathForCategory(snapshot, category);
    return !!path
      && hasActionPermission(snapshot, 'RESOURCE', 'records', 'READ')
      && hasActionPermission(snapshot, 'CATEGORY', category, 'READ')
      && hasActionPermission(snapshot, 'CATEGORY', category, 'WRITE')
      && hasActionPermission(snapshot, 'CATEGORY', category, 'RECEIVE');
  }).map(user => user.id);
}
