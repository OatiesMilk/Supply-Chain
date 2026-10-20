import type { PrismaClient, Prisma } from '@prisma/client';
import { canonicalCoverage } from '../areaHierarchy';

// Directory mutations, login linking and new assignments share one short-lived
// transaction lock so a profile cannot change while it is being assigned.
export async function lockDriverDirectory(tx: Pick<Prisma.TransactionClient, '$executeRaw'>) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(84750)`;
}

export function withDriverDirectoryLock<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async tx => {
    await lockDriverDirectory(tx);
    return work(tx);
  });
}

export function parseCoverageAreas(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === 'string' && !!a.trim()) : [];
  } catch { return []; }
}

export class DriverConflictError extends Error {}
// A roster change reserved for Admin (TSK-119).
export class DriverPermissionError extends Error {}

export function driverInputError(body: { name?: unknown; type?: unknown; coverage_areas?: unknown; is_active?: unknown }, creating = false) {
  if ((creating || body.name !== undefined) && (typeof body.name !== 'string' || !body.name.trim())) return 'A non-empty name is required.';
  if (body.type !== undefined && body.type !== 'DRIVER' && body.type !== 'ASSISTANT') return 'Type must be DRIVER or ASSISTANT.';
  if (body.coverage_areas !== undefined && (!Array.isArray(body.coverage_areas) || body.coverage_areas.some(a => typeof a !== 'string' || !a.trim()))) return 'Coverage areas must be an array of non-empty strings.';
  if (Array.isArray(body.coverage_areas)) {
    const unknown = (body.coverage_areas as string[]).filter(a => canonicalCoverage(a) === null);
    if (unknown.length) return `Coverage must use areas or subregions from the area list. Not recognised: ${unknown.join(', ')}.`;
  }
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') return 'is_active must be a boolean.';
  return null;
}

// Stores coverage in canonical spelling without duplicates. Call after driverInputError.
export function canonicalCoverageList(values: string[]): string[] {
  return [...new Set(values.map(value => canonicalCoverage(value)!))];
}

export async function createDriverDirectory(db: PrismaClient, data: Prisma.DriverCreateInput, actor: { id: string; name: string }) {
  return db.$transaction(async tx => {
    await lockDriverDirectory(tx);
    const duplicate = await tx.driver.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' }, type: data.type } });
    if (duplicate) throw new DriverConflictError(duplicate.isActive ? 'This entry already exists.' : 'This entry is inactive. Activate the existing entry instead.');
    const created = await tx.driver.create({ data });
    await tx.auditLog.create({ data: {
      recordId: created.id, recordType: 'Driver', action: 'CREATE', changedById: actor.id,
      newValue: JSON.stringify(created),
    } });
    return created;
  });
}

export function readDriverDirectory(db: Pick<PrismaClient, 'driver'>, includeInactive: boolean) {
  return db.driver.findMany({
    where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function updateDriverDirectory(
  db: PrismaClient, id: string, data: Prisma.DriverUpdateInput,
  actor: { id: string; name: string }, deactivate = false, restrictIdentity = false,
) {
  return db.$transaction(async tx => {
    await lockDriverDirectory(tx);
    const existing = await tx.driver.findUnique({ where: { id } });
    if (!existing) return null;
    if (deactivate && !existing.isActive) return existing;
    // Non-Admin roster edits keep coverage and status only: an entry cannot
    // become (or stop being) a Driver, and a Driver cannot be renamed.
    if (restrictIdentity) {
      if (typeof data.type === 'string' && data.type !== existing.type) {
        throw new DriverPermissionError('Only Admin can change whether an entry is a Driver or an Assistant.');
      }
      if (existing.type === 'DRIVER' && typeof data.name === 'string' && data.name !== existing.name) {
        throw new DriverPermissionError('Only Admin can rename a Driver.');
      }
    }
    if (typeof data.name === 'string' || typeof data.type === 'string') {
      const duplicate = await tx.driver.findFirst({ where: {
        id: { not: id }, name: { equals: typeof data.name === 'string' ? data.name : existing.name, mode: 'insensitive' },
        type: typeof data.type === 'string' ? data.type : existing.type,
      } });
      if (duplicate) throw new DriverConflictError('Another directory entry already uses this name and type. Activate the existing entry if needed.');
    }
    // A Driver profile that owns a login or runs cannot silently become an Assistant.
    if (typeof data.type === 'string' && data.type !== existing.type && existing.type === 'DRIVER'
      && (existing.userId || await tx.deliveryRecord.count({ where: { driverId: id } }))) {
      throw new DriverConflictError('This Driver has a linked login or assigned runs, so its type cannot change.');
    }
    const updated = await tx.driver.update({ where: { id }, data: { ...data, modifiedBy: actor.name } });
    // The record name is a display snapshot; ownership stays on driverId.
    if (updated.type === 'DRIVER' && updated.name !== existing.name) {
      await tx.deliveryRecord.updateMany({ where: { driverId: id }, data: { driver: updated.name } });
    }
    await tx.auditLog.create({ data: {
      recordId: id, recordType: 'Driver', action: 'UPDATE', changedById: actor.id,
      previousValue: JSON.stringify(existing), newValue: JSON.stringify(updated),
    } });
    return updated;
  });
}

const normalize = (name: string) => name.trim().toLowerCase();

// A requested Driver assignment: a Driver profile id (preferred), or a legacy
// directory name that must resolve to exactly one active DRIVER profile.
export type DriverChange = { id: string | null } | { name: string };

// Resolves the stable assignment stored on the record. Ownership comes from
// the profile id; the name is only copied as display text. Keeping the current
// assignment never requires the profile to still be active.
export async function resolveDriverAssignment(
  db: Pick<PrismaClient, 'driver'>,
  current: { driver: string; driverId: string | null },
  change: DriverChange,
): Promise<{ error: string } | { driverId: string | null; driver: string }> {
  if ('id' in change) {
    if (!change.id) return { driverId: null, driver: '' };
    if (change.id === current.driverId) return { driverId: current.driverId, driver: current.driver };
    const profile = await db.driver.findUnique({ where: { id: change.id } });
    if (!profile || profile.type !== 'DRIVER') return { error: 'Choose a Driver from the directory.' };
    if (!profile.isActive) return { error: `Driver "${profile.name}" is inactive or not in the directory. Choose an active entry.` };
    return { driverId: profile.id, driver: profile.name };
  }
  const name = change.name.trim();
  if (!name) return { driverId: null, driver: '' };
  if (current.driverId && normalize(name) === normalize(current.driver)) return { driverId: current.driverId, driver: current.driver };
  const profile = await db.driver.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, type: 'DRIVER', isActive: true } });
  if (!profile) return { error: `Driver "${name}" is inactive or not in the directory. Choose an active entry.` };
  return { driverId: profile.id, driver: profile.name };
}

// Only validate new assistant assignments. Historical names remain valid for unrelated edits.
// Assistants are display names, not login identities.
export async function assignmentError(
  db: Pick<PrismaClient, 'driver'>,
  existing: { driverAssistants: string },
  changes: { driverAssistants?: string },
): Promise<string | null> {
  const added: { name: string; type: string }[] = [];
  if (changes.driverAssistants !== undefined) {
    let previous: unknown = [];
    try { previous = JSON.parse(existing.driverAssistants); } catch { /* Legacy malformed data has no usable assignments. */ }
    const names = new Set(Array.isArray(previous) ? previous.filter(n => typeof n === 'string').map(normalize) : []);
    const next: unknown = JSON.parse(changes.driverAssistants);
    if (!Array.isArray(next) || next.some(n => typeof n !== 'string' || !n.trim())) return 'Assistants must be an array of non-empty names.';
    for (const name of next as string[]) {
      if (!names.has(normalize(name))) added.push({ name: name.trim(), type: 'ASSISTANT' });
    }
  }
  for (const person of added) {
    const active = await db.driver.findFirst({ where: {
      name: { equals: person.name, mode: 'insensitive' }, type: person.type, isActive: true,
    } });
    if (!active) return `Assistant "${person.name}" is inactive or not in the directory. Choose an active entry.`;
  }
  return null;
}
