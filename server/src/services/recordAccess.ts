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
    if (user.role === 'TASS' && !['ACCOUNTING_COLLECTION', 'RMA'].includes(category)) return false;
    if (user.permissions.some(p => p.screen === screen && p.granted === false)) return false;
    return shared || user.effectiveScreens.includes(screen);
  });
}

export function recordScope(user: AuthUser): Prisma.DeliveryRecordWhereInput {
  return {
    category: { in: readableCategories(user) },
    ...(user.role === 'DRIVER' ? { driver: user.name, draft: false } : {}),
  };
}

export function canWriteCategory(user: AuthUser, category: string): boolean {
  const screen = CATEGORY_SCREEN[category];
  if (!screen || !readableCategories(user).includes(category)) return false;
  if (user.role === 'LOGISTICS' && category === 'RMA') return false;
  // Scheduling views can edit their records, subject to the existing action
  // and field-level role restrictions in records.ts.
  const editors: Screen[] = [screen, 'driver_dashboard', 'driver', 'calendar', 'driver_board'];
  return editors.some(s => user.effectiveScreens.includes(s));
}
