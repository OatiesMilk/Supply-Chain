import { Prisma, type SupplierCategory } from '@prisma/client';
import { prisma } from '../db';

export class SupplierInputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

// This low-volume directory shares a transaction-scoped lock for catalog and
// assignment mutations. Recheck versions/active choices AFTER acquiring it.
export async function lockSupplierCatalog(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(731105, 1)`;
}
export async function supplierWrite<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => { await lockSupplierCatalog(tx); return work(tx); });
}
// Use the same PostgreSQL case conversion as the migration, including Unicode.
export async function normalizedCategoryName(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, name: string) {
  const [row] = await tx.$queryRaw<Array<{ key: string }>>`SELECT lower(${name}::text) AS key`;
  return row.key;
}
export function textField(value: unknown, label: string, required = false, max = 250): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || required && !value.trim()) {
    throw new SupplierInputError(`${label} must be ${required ? 'a nonblank' : 'a'} string of at most ${max} characters`);
  }
  return value.trim();
}
export function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new SupplierInputError('expected_version is required');
  return value as number;
}
export function categoryIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100 || value.some(id => typeof id !== 'string' || !id || id.length > 200)) {
    throw new SupplierInputError('Select between 1 and 100 categories');
  }
  if (new Set(value).size !== value.length) throw new SupplierInputError('Category selections must be unique');
  return value;
}
export const categoryDto = (category: SupplierCategory) => ({
  id: category.id, name: category.name, is_active: category.isActive, version: category.version,
});
export const supplierInclude = {
  createdBy: { select: { name: true } }, modifiedBy: { select: { name: true } },
  categories: { include: { category: true } },
} satisfies Prisma.SupplierInclude;
type SupplierRow = Prisma.SupplierGetPayload<{ include: typeof supplierInclude }>;
export function supplierDto(row: SupplierRow) {
  const categories = row.categories.map(link => categoryDto(link.category)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    id: row.id, name: row.name, contact_person: row.contactPerson, email: row.email, phone: row.phone,
    address: row.address, city: row.city, version: row.version, categories,
    category: categories.map(category => category.name).join('; ') || row.category,
    created_by: row.createdBy.name, created_at: row.createdAt, modified_by: row.modifiedBy.name, modified_at: row.modifiedAt,
  };
}
export const categorySnapshot = (categories: SupplierCategory[]) => categories
  .map(({ id, name }) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id));
export async function selectedCategories(tx: Prisma.TransactionClient, ids: string[], retained: string[] = []) {
  const rows = await tx.supplierCategory.findMany({ where: { id: { in: ids } }, orderBy: { name: 'asc' } });
  if (rows.length !== ids.length) throw new SupplierInputError('One or more categories no longer exist. Refresh the catalog.');
  if (rows.some(row => !row.isActive && !retained.includes(row.id))) {
    throw new SupplierInputError('Inactive categories cannot be newly assigned. Refresh the catalog.', 409);
  }
  return rows;
}
