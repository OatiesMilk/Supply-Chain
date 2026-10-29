import { Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { readableCategories } from './recordAccess';

/** Current authorization, rather than the historical recipient list, controls
 * visibility after a category denial or Driver reassignment. */
export function notificationVisibility(user: AuthUser) {
  const rmaRead = readableCategories(user).includes('RMA');
  const ownership = user.role === 'DRIVER'
    ? Prisma.sql`r."driverId" = ${user.driverProfileId ?? ''} AND r."draft" = false AND r."rmaMovement" = 'LOGISTICS_TRANSPORT'`
    : Prisma.sql`TRUE`;
  return Prisma.sql`(n."recordType" IS DISTINCT FROM 'DeliveryRecord' OR (
    r."id" IS NOT NULL AND (r."category" <> 'RMA' OR (${rmaRead} AND r."deletedAt" IS NULL AND ${ownership}))
  ))`;
}
