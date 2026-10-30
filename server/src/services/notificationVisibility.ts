import { Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { readableCategories } from './recordAccess';
import { hasActionPermission } from './permissionEvaluator';

/** Current authorization, rather than the historical recipient list, controls
 * visibility after a category denial or Driver reassignment. */
export function notificationVisibility(user: AuthUser) {
  if (user.activeMode === 'V1') {
    const categories = readableCategories(user);
    const category = categories.length ? Prisma.sql`r."category" IN (${Prisma.join(categories)})` : Prisma.sql`FALSE`;
    const ownership = user.role === 'DRIVER' ? Prisma.sql`r."driverId" = ${user.driverProfileId ?? ''} AND r."draft" = false AND (r."category" <> 'RMA' OR r."rmaMovement" = 'LOGISTICS_TRANSPORT')` : Prisma.sql`TRUE`;
    const resource = (name: string) => !!user.snapshot && hasActionPermission(user.snapshot, 'RESOURCE', name, 'READ');
    return Prisma.sql`(
      (n."recordType" = 'ScopedSummary' AND n."recordId" = ${user.permissionVersion}) OR
      (n."recordType" = 'DeliveryRecord' AND r."id" IS NOT NULL AND r."deletedAt" IS NULL AND ${category} AND ${ownership}) OR
      (n."recordType" IN ('SKU', 'Product', 'InventoryTransaction') AND ${resource('skus')}) OR
      (n."recordType" = 'Customer' AND ${resource('customers')}) OR
      (n."recordType" = 'Supplier' AND ${resource('suppliers')}) OR
      (n."recordType" = 'Driver' AND ${resource('drivers')}) OR
      (n."recordType" IN ('User', 'RolePolicy', 'UserPermission', 'UserPermissionOverride', 'UserAuthorization') AND ${resource('admin')})
    )`;
  }
  const rmaRead = readableCategories(user).includes('RMA');
  const ownership = user.role === 'DRIVER'
    ? Prisma.sql`r."driverId" = ${user.driverProfileId ?? ''} AND r."draft" = false AND r."rmaMovement" = 'LOGISTICS_TRANSPORT'`
    : Prisma.sql`TRUE`;
  return Prisma.sql`(n."recordType" IS DISTINCT FROM 'DeliveryRecord' OR (
    r."id" IS NOT NULL AND (r."category" <> 'RMA' OR (${rmaRead} AND r."deletedAt" IS NULL AND ${ownership}))
  ))`;
}
