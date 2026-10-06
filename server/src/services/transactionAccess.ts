import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { CATEGORY_SCREEN, recordScope } from './recordAccess';

// Unknown roles have no transaction access. These limits are intersected with
// module permissions and record ownership, never replaced by request filters.
export function transactionCategories(role: string): string[] {
  switch (role) {
    case 'ADMIN':
    case 'DRIVER': return Object.keys(CATEGORY_SCREEN);
    case 'SALES_COORDINATOR': return ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'];
    case 'LOGISTICS': return ['DELIVERY', 'RMA', 'PROCUREMENT_PICKUP'];
    case 'TASS': return ['ACCOUNTING_COLLECTION'];
    default: return [];
  }
}

export function canAccessTransactions(user: AuthUser): boolean {
  if (!transactionCategories(user.role).length) return false;
  // Driver access is scoped API access for the standalone driver application;
  // it does not grant the Transaction Center screen or any inventory resource.
  if (user.role === 'DRIVER') return Boolean(user.name.trim()) && user.effectiveScreens.includes('driver_dashboard');
  return user.resources.includes('transactions');
}

export function canAccessInventoryTransactions(user: AuthUser): boolean {
  return ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS'].includes(user.role)
    && user.resources.includes('skus');
}

export function transactionRecordScope(user: AuthUser): Prisma.DeliveryRecordWhereInput {
  return {
    deletedAt: null,
    AND: [recordScope(user), { category: { in: transactionCategories(user.role) } }],
  };
}
