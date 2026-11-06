import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { recordScope, transactionCategories, policyRecordScope } from './recordAccess';
import { hasActionPermission, type EffectivePermissionSnapshot } from './permissionEvaluator';
export { transactionCategories } from './recordAccess';

export function canAccessTransactions(user: AuthUser): boolean {
  if (user.activeMode === 'V1') return !!user.snapshot && canAccessPolicyTransactions(user.snapshot);
  if (!transactionCategories(user.role).length) return false;
  // Driver access is scoped API access for the standalone driver application;
  // it does not grant the Transaction Center screen or any inventory resource.
  if (user.role === 'DRIVER') return Boolean(user.driverProfileId) && user.effectiveScreens.includes('driver_dashboard');
  return user.resources.includes('transactions');
}

export function canAccessInventoryTransactions(user: AuthUser): boolean {
  if (user.activeMode === 'V1') return !!user.snapshot && canAccessPolicyInventoryTransactions(user.snapshot);
  return ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS'].includes(user.role)
    && user.resources.includes('skus');
}

export function transactionRecordScope(user: AuthUser): Prisma.DeliveryRecordWhereInput {
  return {
    deletedAt: null,
    AND: [recordScope(user), { category: { in: transactionCategories(user.role) } }],
  };
}

export function canAccessPolicyTransactions(snapshot: EffectivePermissionSnapshot): boolean {
  if (!snapshot.role || !transactionCategories(snapshot.role).length) return false;
  return hasActionPermission(snapshot, 'RESOURCE', 'transactions', 'READ')
    && hasActionPermission(snapshot, 'RESOURCE', 'records', 'READ')
    && (snapshot.role !== 'DRIVER' || !!snapshot.driverProfileId);
}
export function canAccessPolicyInventoryTransactions(snapshot: EffectivePermissionSnapshot): boolean {
  return !!snapshot.role && ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS'].includes(snapshot.role)
    && hasActionPermission(snapshot, 'RESOURCE', 'skus', 'READ');
}
export function policyTransactionRecordScope(snapshot: EffectivePermissionSnapshot, eligibleRmaTransportIds: readonly string[] = []): Prisma.DeliveryRecordWhereInput {
  return {
    deletedAt: null,
    AND: [policyRecordScope(snapshot, 'transactions', eligibleRmaTransportIds),
      { category: { in: canAccessPolicyTransactions(snapshot) ? transactionCategories(snapshot.role!) : [] } }],
  };
}
