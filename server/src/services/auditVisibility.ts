import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { readableCategories } from './recordAccess';
import { hasActionPermission } from './permissionEvaluator';

/** Business audit metadata must not restore access to denied business records.
 * Administrative policy history remains protected ADMIN management data. */
export function auditVisibilitySql(user: AuthUser): Prisma.Sql {
  if (user.activeMode !== 'V1') return Prisma.sql`TRUE`;
  const categories = readableCategories(user);
  const category = categories.length ? Prisma.sql`r."category" IN (${Prisma.join(categories)})` : Prisma.sql`FALSE`;
  const ownership = user.role === 'DRIVER' ? Prisma.sql`r."driverId" = ${user.driverProfileId ?? ''} AND r."draft" = false AND (r."category" <> 'RMA' OR r."rmaMovement" = 'LOGISTICS_TRANSPORT')` : Prisma.sql`TRUE`;
  const clauses: Prisma.Sql[] = [Prisma.sql`(a."recordType" = 'DeliveryRecord' AND EXISTS (SELECT 1 FROM "DeliveryRecord" r WHERE r.id = a."recordId" AND r."deletedAt" IS NULL AND ${category} AND ${ownership}))`];
  const types: Record<string, string[]> = {
    skus: ['SKU', 'Product', 'InventoryTransaction'], customers: ['Customer'], suppliers: ['Supplier'], drivers: ['Driver'],
    admin: ['User', 'RolePolicy', 'UserPermission', 'UserPermissionOverride', 'UserAuthorization', 'PermissionConversion'],
  };
  for (const [resource, recordTypes] of Object.entries(types)) if (user.snapshot && hasActionPermission(user.snapshot, 'RESOURCE', resource, 'READ')) clauses.push(Prisma.sql`a."recordType" IN (${Prisma.join(recordTypes)})`);
  return Prisma.sql`(${Prisma.join(clauses, ' OR ')})`;
}

type AuditFilters = { changedById?: string; action?: string; timestamp?: { gte?: Date; lt?: Date; lte?: Date } };
function filtersSql(user: AuthUser, filters: AuditFilters) {
  const conditions = [auditVisibilitySql(user)];
  if (filters.changedById) conditions.push(Prisma.sql`a."changedById" = ${filters.changedById}`);
  if (filters.action) conditions.push(Prisma.sql`a.action = ${filters.action}`);
  if (filters.timestamp?.gte) conditions.push(Prisma.sql`a.timestamp >= ${filters.timestamp.gte}`);
  if (filters.timestamp?.lt) conditions.push(Prisma.sql`a.timestamp < ${filters.timestamp.lt}`);
  if (filters.timestamp?.lte) conditions.push(Prisma.sql`a.timestamp <= ${filters.timestamp.lte}`);
  return Prisma.sql`${Prisma.join(conditions, ' AND ')}`;
}
export async function visibleAuditCount(db: PrismaClient, user: AuthUser, filters: AuditFilters = {}) {
  const [row] = await db.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::integer AS count FROM "AuditLog" a WHERE ${filtersSql(user, filters)}`;
  return row?.count ?? 0;
}
type AuditRow = { id: string; recordId: string; recordType: string; action: string; changedById: string; previousValue: string | null; newValue: string | null; timestamp: Date; changedBy: { name: string } };
export async function visibleAuditEntries(db: PrismaClient, user: AuthUser, limit: number, offset = 0, filters: AuditFilters = {}) {
  return db.$queryRaw<AuditRow[]>`SELECT a.*, json_build_object('name', u.name) AS "changedBy" FROM "AuditLog" a JOIN "User" u ON u.id = a."changedById"
    WHERE ${filtersSql(user, filters)} ORDER BY a.timestamp DESC, a.id DESC LIMIT ${limit} OFFSET ${offset}`;
}
