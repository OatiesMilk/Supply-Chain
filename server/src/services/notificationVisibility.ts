import { Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { readableCategories } from './recordAccess';
import { hasActionPermission } from './permissionEvaluator';

/** Use current record access when showing notifications to past recipients. */
export function notificationVisibility(user: AuthUser) {
  const categories = readableCategories(user);
  const category = categories.length
    ? Prisma.sql`r."category" IN (${Prisma.join(categories)})`
    : Prisma.sql`FALSE`;
  let ownership = Prisma.sql`TRUE`;
  if (user.role === 'DRIVER') {
    ownership = user.driverProfileId
      ? Prisma.sql`r."driverId" = ${user.driverProfileId} AND r."draft" = false
          AND (r."category" <> 'RMA' OR r."rmaMovement" = 'LOGISTICS_TRANSPORT')`
      : Prisma.sql`FALSE`;
  }
  const recordVisible = Prisma.sql`r."id" IS NOT NULL AND r."deletedAt" IS NULL AND ${category} AND ${ownership}`;

  const summaryVisible = Prisma.sql`(n."recordType" = 'ScopedSummary' AND n."recordId" = ${user.permissionVersion})`;

  if (user.activeMode === 'V1') {
    const resource = (name: string) => !!user.snapshot && hasActionPermission(user.snapshot, 'RESOURCE', name, 'READ');
    return Prisma.sql`(
      ${summaryVisible} OR
      (n."recordType" = 'DeliveryRecord' AND ${recordVisible}) OR
      (n."recordType" IN ('SKU', 'Product', 'InventoryTransaction') AND ${resource('skus')}) OR
      (n."recordType" = 'Customer' AND ${resource('customers')}) OR
      (n."recordType" = 'Supplier' AND ${resource('suppliers')}) OR
      (n."recordType" = 'Driver' AND ${resource('drivers')}) OR
      (n."recordType" IN ('User', 'RolePolicy', 'UserPermission', 'UserPermissionOverride', 'UserAuthorization') AND ${resource('admin')})
    )`;
  }
  return Prisma.sql`(
    ${summaryVisible} OR
    (n."recordType" = 'DeliveryRecord' AND (${recordVisible})) OR
    (n."recordType" IS DISTINCT FROM 'DeliveryRecord' AND n."recordType" IS DISTINCT FROM 'ScopedSummary')
  )`;
}
