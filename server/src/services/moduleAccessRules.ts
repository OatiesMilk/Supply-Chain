/**
 * Business rules for who may change records in each operational module.
 * They narrow, never widen, whatever the permission mode (LEGACY or V1) and
 * stored role policies allow, so a stored Allow cannot bypass them.
 *
 * - Admin: view-only on Deliveries, RMA, Procurement Pick-up and Sales Orders.
 * - Sales Coordinator alone creates Deliveries, Procurement Pick-up and Sales Orders.
 * - TASS has neither the Procurement Pick-up nor the Accounting Collection module
 *   (collection verification belongs to Logistics).
 */
import type { CatalogEntry, PolicyAction } from './permissionCatalog';

export const ADMIN_READ_ONLY_CATEGORIES = ['DELIVERY', 'RMA', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'] as const;
export const SALES_COORDINATOR_CREATE_CATEGORIES = ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  DELIVERY: 'Deliveries', RMA: 'RMA', PROCUREMENT_PICKUP: 'Procurement Pick-up', SALES_ORDERS: 'Sales Orders', ACCOUNTING_COLLECTION: 'Accounting Collection',
};
const RESTRICTED_SCREENS: Record<string, readonly string[]> = { TASS: ['procurement_pickup', 'accounting_collection'] };
const RESTRICTED_CATEGORIES: Record<string, readonly string[]> = { TASS: ['PROCUREMENT_PICKUP', 'ACCOUNTING_COLLECTION'] };
const SCREEN_CATEGORY: Record<string, string> = {
  deliveries: 'DELIVERY', rma: 'RMA', procurement_pickup: 'PROCUREMENT_PICKUP', sales_orders: 'SALES_ORDERS', accounting_collection: 'ACCOUNTING_COLLECTION',
};

const includes = (list: readonly string[], value: string) => list.includes(value);

/** Why `role` may not perform `action` on `category` records, or null when the rules allow it. */
export function categoryActionRestriction(role: string, category: string, action: PolicyAction): string | null {
  if (action === 'READ') return null;
  const label = CATEGORY_LABELS[category] ?? category;
  if (role === 'ADMIN' && includes(ADMIN_READ_ONLY_CATEGORIES, category)) return `Admin has view-only access to ${label} records.`;
  if (action === 'CREATE' && includes(SALES_COORDINATOR_CREATE_CATEGORIES, category) && role !== 'SALES_COORDINATOR') {
    return `Only Sales Coordinator can create ${label} records.`;
  }
  return null;
}

export function screenRestricted(role: string, screen: string): boolean {
  return includes(RESTRICTED_SCREENS[role] ?? [], screen);
}

/** True when `role` has no access at all (including READ) to `category` records. */
export function categoryRestricted(role: string, category: string): boolean {
  return includes(RESTRICTED_CATEGORIES[role] ?? [], category);
}

/** Applied by the V1 evaluator after stored policy decisions. */
export function policyEntryRestricted(role: string, entry: Pick<CatalogEntry, 'scope' | 'module' | 'action'>): boolean {
  if (entry.scope === 'SCREEN') {
    if (screenRestricted(role, entry.module)) return true;
    // A view-only module screen cannot keep Write.
    const category = SCREEN_CATEGORY[entry.module];
    return entry.action === 'WRITE' && !!category && categoryActionRestriction(role, category, 'WRITE') !== null;
  }
  if (entry.scope === 'CATEGORY') return categoryRestricted(role, entry.module) || categoryActionRestriction(role, entry.module, entry.action) !== null;
  return false;
}
