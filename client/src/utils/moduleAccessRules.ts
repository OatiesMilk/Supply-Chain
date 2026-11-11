import type { PermissionAction, PermissionCategory } from '../types/permissions';

/**
 * Mirrors server/src/services/moduleAccessRules.ts so the UI hides what the
 * server rejects. The server still decides.
 * - Admin: view-only on Deliveries, RMA, Procurement Pick-up and Sales Orders.
 * - Only Sales Coordinator creates Deliveries, Procurement Pick-up and Sales Orders.
 */
const ADMIN_READ_ONLY: readonly PermissionCategory[] = ['DELIVERY', 'RMA', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'];
const SALES_COORDINATOR_CREATE: readonly PermissionCategory[] = ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'];

export function categoryActionRestricted(role: string, category: PermissionCategory, action: PermissionAction): boolean {
  if (action === 'READ') return false;
  if (role === 'ADMIN' && ADMIN_READ_ONLY.includes(category)) return true;
  return action === 'CREATE' && SALES_COORDINATOR_CREATE.includes(category) && role !== 'SALES_COORDINATOR';
}

/** True when the account can open the module but not change its records. */
export function isViewOnlyCategory(role: string, category: PermissionCategory): boolean {
  return role === 'ADMIN' && ADMIN_READ_ONLY.includes(category);
}
