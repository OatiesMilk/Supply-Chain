import { Prisma } from '@prisma/client';
import { prisma } from '../db';

/** Shared rules for the Admin-managed Account Manager and Company directory. */
export class DirectoryInputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

// Low-volume directory: one transaction-scoped lock serializes writes so the
// SAP-number and linked-user checks below cannot race. Recheck after locking.
export async function directoryWrite<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(731110, 1)`;
    return work(tx);
  });
}

/** Same key as migration 20261110030000: PostgreSQL lower() on trimmed, single-spaced text. */
export async function normalizedDirectoryName(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, name: string) {
  const [row] = await tx.$queryRaw<Array<{ key: string }>>`SELECT lower(${name}::text) AS key`;
  return row.key;
}
/** Seeds and fixtures without a database round trip; names there are ASCII. */
export const localDirectoryKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

const OWN = Object.prototype.hasOwnProperty;
export function body(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DirectoryInputError('Request body must be an object');
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) throw new DirectoryInputError(`Unknown field: ${unknown[0]}`);
  return value as Record<string, unknown>;
}
export const has = (input: Record<string, unknown>, key: string) => OWN.call(input, key) && input[key] !== undefined;

export function displayName(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new DirectoryInputError(`${label} is required`);
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > max) throw new DirectoryInputError(`${label} must be 2 to ${max} characters`);
  return name;
}
export function optionalText(value: unknown, label: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > max) throw new DirectoryInputError(`${label} must be text of at most ${max} characters`);
  return value.trim();
}
export function requiredText(value: unknown, label: string, max: number): string {
  const text = optionalText(value, label, max);
  if (!text) throw new DirectoryInputError(`${label} is required`);
  return text;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function optionalEmail(value: unknown): string | null {
  const email = optionalText(value, 'Email', 254).toLowerCase();
  if (email && !EMAIL.test(email)) throw new DirectoryInputError('Enter a valid email address');
  return email || null;
}
export function optionalId(value: unknown, label: string): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 200) throw new DirectoryInputError(`${label} is invalid`);
  return value;
}
export function flag(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new DirectoryInputError(`${label} must be true or false`);
  return value;
}
export function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new DirectoryInputError('expected_version is required');
  return value as number;
}

// ── Account Managers ────────────────────────────────────────────────────────
export const accountManagerInclude = {
  user: { select: { id: true, name: true, email: true, isActive: true } },
} satisfies Prisma.AccountManagerInclude;
type AccountManagerRow = Prisma.AccountManagerGetPayload<{ include: typeof accountManagerInclude }>;

/** Admin view, including contact details and the linked portal login. */
export function accountManagerDto(row: AccountManagerRow) {
  return {
    id: row.id, name: row.name, email: row.email ?? '', is_active: row.isActive, version: row.version,
    linked_user: row.user ? { id: row.user.id, name: row.user.name, email: row.user.email, is_active: row.user.isActive } : null,
    created_at: row.createdAt, updated_at: row.updatedAt,
  };
}
/** Picker view for every record screen: no contact or account details. */
export const accountManagerOption = (row: { id: string; name: string; isActive: boolean }) =>
  ({ id: row.id, name: row.name, is_active: row.isActive });
export const accountManagerAudit = (row: AccountManagerRow) => ({
  name: row.name, email: row.email ?? '', linked_user: row.user?.name ?? '', is_active: row.isActive, version: row.version,
});

/** A login can belong to one Account Manager; Driver and inactive logins never qualify. */
export async function linkableUser(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true } });
  if (!user) throw new DirectoryInputError('The selected portal user no longer exists. Refresh and try again.');
  if (!user.isActive || user.role === 'DRIVER') throw new DirectoryInputError('Link an active portal user who is not a Driver');
  return user.id;
}

// ── Companies ───────────────────────────────────────────────────────────────
export const companyInclude = {
  defaultAccountManager: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.CompanyInclude;
type CompanyRow = Prisma.CompanyGetPayload<{ include: typeof companyInclude }>;

export function companyDto(row: CompanyRow) {
  return {
    id: row.id, name: row.name, sap_number: row.sapNumber, address: row.address, contact_person: row.contactPerson,
    is_active: row.isActive, version: row.version,
    default_account_manager: row.defaultAccountManager
      ? { id: row.defaultAccountManager.id, name: row.defaultAccountManager.name, is_active: row.defaultAccountManager.isActive } : null,
    created_at: row.createdAt, updated_at: row.updatedAt,
  };
}
export const companyAudit = (row: CompanyRow) => ({
  name: row.name, sap_number: row.sapNumber, address: row.address, contact_person: row.contactPerson,
  default_account_manager: row.defaultAccountManager?.name ?? '', is_active: row.isActive, version: row.version,
});

export async function assertSapAvailable(tx: Prisma.TransactionClient, sapNumber: string, exceptId?: string) {
  const clash = await tx.company.findFirst({ where: { sapNumber: { equals: sapNumber, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw new DirectoryInputError('Another company already uses this SAP number', 409);
}
/** New default assignments must be active; an existing one may be kept as is. */
export async function assignableAccountManager(tx: Prisma.TransactionClient, id: string, current?: string | null) {
  const row = await tx.accountManager.findUnique({ where: { id }, select: { id: true, isActive: true } });
  if (!row) throw new DirectoryInputError('The selected Account Manager no longer exists. Refresh and try again.');
  if (!row.isActive && row.id !== current) throw new DirectoryInputError('Choose an active Account Manager', 409);
  return row.id;
}

// ── Records ─────────────────────────────────────────────────────────────────
/** A record's Account Manager is blank, unchanged, or an active directory entry.
 * The directory spelling is stored so filters, the AM Directory and mail match exactly. */
export async function recordAccountManager(db: Pick<Prisma.TransactionClient, 'accountManager'>, value: unknown, current?: string | null):
  Promise<{ name: string } | { error: string }> {
  if (typeof value !== 'string' || value.length > 200) return { error: 'Account Manager must be text.' };
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || (current != null && name === current.trim())) return { name: current != null && name ? current : name };
  const rows = await db.accountManager.findMany({ where: { normalizedName: name.toLowerCase(), isActive: true }, select: { name: true }, take: 1 });
  return rows[0] ? { name: rows[0].name } : { error: 'Choose an active Account Manager from the list.' };
}

// ── Mail ────────────────────────────────────────────────────────────────────
type MailUser = { id: string; name: string; email: string };
/** Portal account(s) that receive "AM" mail for a record's Account Manager name.
 * Linked login first; a deactivated Account Manager receives nothing; names
 * not linked to a login keep the old rule (exactly one active account with that name). */
export async function accountManagerMailUsers(recordAccountManager: string | null | undefined): Promise<MailUser[]> {
  const name = (recordAccountManager ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return [];
  const directory = await prisma.accountManager.findUnique({ where: { normalizedName: name.toLowerCase() },
    select: { isActive: true, user: { select: { id: true, name: true, email: true, isActive: true } } } });
  if (directory && !directory.isActive) return [];
  if (directory?.user) return directory.user.isActive ? [{ id: directory.user.id, name: directory.user.name, email: directory.user.email }] : [];
  const users = await prisma.user.findMany({ where: { name: { equals: name, mode: 'insensitive' }, isActive: true },
    select: { id: true, name: true, email: true } });
  return users.length === 1 ? users : [];
}

/** For the 4 PM summary: the Account Manager name each portal account answers for.
 * Same precedence as accountManagerMailUsers, so summaries and record mail agree. */
export async function summaryAccountManagerNames(users: ReadonlyArray<{ id: string; name: string }>): Promise<Map<string, string>> {
  const directory = await prisma.accountManager.findMany({ select: { name: true, normalizedName: true, isActive: true, userId: true } });
  const result = new Map<string, string>();
  const reserved = new Set<string>();
  for (const row of directory) {
    if (row.userId || !row.isActive) reserved.add(row.normalizedName);
    if (row.userId && row.isActive) result.set(row.userId, row.name);
  }
  const key = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const counts = new Map<string, number>();
  for (const user of users) counts.set(key(user.name), (counts.get(key(user.name)) ?? 0) + 1);
  for (const user of users) {
    if (result.has(user.id) || counts.get(key(user.name)) !== 1 || reserved.has(key(user.name))) continue;
    result.set(user.id, user.name.trim());
  }
  return result;
}

/** Prisma unique violations become specific 409s instead of 500s. */
export function uniqueViolationMessage(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
  const target = JSON.stringify(error.meta ?? {});
  if (target.includes('userId')) return 'That portal user is already linked to another Account Manager';
  return 'A record with this name already exists, including inactive ones';
}
