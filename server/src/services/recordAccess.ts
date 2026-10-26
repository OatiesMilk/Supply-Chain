import type { AuthUser } from '../middleware/auth';
import type { Prisma } from '@prisma/client';
import type { Screen } from './permissions';

export const CATEGORY_SCREEN: Record<string, Screen> = {
  DELIVERY: 'deliveries', RMA: 'rma', ACCOUNTING_COLLECTION: 'accounting_collection',
  PROCUREMENT_PICKUP: 'procurement_pickup', SALES_ORDERS: 'sales_orders',
};

// Aggregate views need shared records, but an explicit category denial also
// removes those records from shared lists and direct detail/audit endpoints.
export function readableCategories(user: AuthUser): string[] {
  const aggregate: Screen[] = ['main', 'dashboard', 'calendar', 'driver', 'driver_board', 'driver_dashboard', 'statistical_reports'];
  const shared = aggregate.some(s => user.effectiveScreens.includes(s));
  return Object.keys(CATEGORY_SCREEN).filter(category => {
    const screen = CATEGORY_SCREEN[category];
    // Sales Coordinator must not discover RMA records through aggregate views.
    if (category === 'RMA' && !['TASS', 'LOGISTICS', 'ADMIN'].includes(user.role)) return false;
    if (user.role === 'TASS' && !['ACCOUNTING_COLLECTION', 'RMA'].includes(category)) return false;
    if (user.permissions.some(p => p.screen === screen && p.granted === false)) return false;
    return shared || user.effectiveScreens.includes(screen);
  });
}

// Drivers own runs through the Admin-linked Driver profile id. A Driver without
// a linked profile owns nothing (never `driverId: null`, which would match
// every unassigned record).
export function recordScope(user: AuthUser): Prisma.DeliveryRecordWhereInput {
  return {
    category: { in: readableCategories(user) },
    ...(user.role === 'DRIVER'
      ? (user.driverProfileId ? { driverId: user.driverProfileId, draft: false } : { id: { in: [] } })
      : {}),
  };
}

export function isAssignedDriver(user: AuthUser, record: { driverId?: string | null; draft: boolean }): boolean {
  return user.role === 'DRIVER' && !!user.driverProfileId && record.driverId === user.driverProfileId && !record.draft;
}

export function canReadRecord(
  user: AuthUser,
  record: { category?: string | null; driverId?: string | null; draft?: boolean }
): boolean {
  const category = record.category ?? 'ACCOUNTING_COLLECTION';
  if (!readableCategories(user).includes(category)) return false;
  if (user.role === 'DRIVER') {
    if (!user.driverProfileId) return false;
    if (record.driverId !== user.driverProfileId) return false;
    if (record.draft) return false;
  }
  return true;
}

export function canWriteCategory(user: AuthUser, category: string): boolean {
  const screen = CATEGORY_SCREEN[category];
  if (!screen || !readableCategories(user).includes(category)) return false;
  if (user.role === 'LOGISTICS' && category === 'RMA') return false;
  if (category === 'RMA' && !['TASS', 'ADMIN'].includes(user.role)) return false;
  // Scheduling views can edit their records, subject to the existing action
  // and field-level role restrictions in records.ts.
  const editors: Screen[] = [screen, 'driver_dashboard', 'driver', 'calendar', 'driver_board'];
  return editors.some(s => user.effectiveScreens.includes(s));
}

/** Creating a record can be narrower than managing an existing operational record. */
export function canCreateCategory(user: AuthUser, category: string): boolean {
  if (!canWriteCategory(user, category)) return false;
  // Logistics retains assignment and run management for saved Deliveries but
  // Sales Coordinator owns creation of new Delivery records.
  if (user.role === 'LOGISTICS' && category === 'DELIVERY') return false;
  return true;
}
