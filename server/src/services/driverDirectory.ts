import type { PrismaClient, Prisma } from '@prisma/client';

// Directory mutations and new assignments share one short-lived transaction lock.
// This also protects legacy name identities without changing the database schema.
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

export function driverInputError(body: { name?: unknown; type?: unknown; coverage_areas?: unknown; is_active?: unknown }, creating = false) {
  if ((creating || body.name !== undefined) && (typeof body.name !== 'string' || !body.name.trim())) return 'A non-empty name is required.';
  if (body.type !== undefined && body.type !== 'DRIVER' && body.type !== 'ASSISTANT') return 'Type must be DRIVER or ASSISTANT.';
  if (body.coverage_areas !== undefined && (!Array.isArray(body.coverage_areas) || body.coverage_areas.some(a => typeof a !== 'string' || !a.trim()))) return 'Coverage areas must be an array of non-empty strings.';
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') return 'is_active must be a boolean.';
  return null;
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
  return db.driver.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' } });
}

export async function updateDriverDirectory(
  db: PrismaClient, id: string, data: Prisma.DriverUpdateInput,
  actor: { id: string; name: string }, deactivate = false,
) {
  return db.$transaction(async tx => {
    await lockDriverDirectory(tx);
    const existing = await tx.driver.findUnique({ where: { id } });
    if (!existing) return null;
    if (deactivate && !existing.isActive) return existing;
    if (typeof data.name === 'string' || typeof data.type === 'string') {
      const duplicate = await tx.driver.findFirst({ where: {
        id: { not: id }, name: { equals: typeof data.name === 'string' ? data.name : existing.name, mode: 'insensitive' },
        type: typeof data.type === 'string' ? data.type : existing.type,
      } });
      if (duplicate) throw new DriverConflictError('Another directory entry already uses this name and type. Activate the existing entry if needed.');
    }
    const updated = await tx.driver.update({ where: { id }, data: { ...data, modifiedBy: actor.name } });
    await tx.auditLog.create({ data: {
      recordId: id, recordType: 'Driver', action: 'UPDATE', changedById: actor.id,
      previousValue: JSON.stringify(existing), newValue: JSON.stringify(updated),
    } });
    return updated;
  });
}

const normalize = (name: string) => name.trim().toLowerCase();

// Only validate new assignments. Historical names remain valid for unrelated edits.
export async function assignmentError(
  db: Pick<PrismaClient, 'driver'>,
  existing: { driver: string; driverAssistants: string },
  changes: { driver?: unknown; driverAssistants?: string },
): Promise<string | null> {
  const added: { name: string; type: string }[] = [];
  if (changes.driver !== undefined) {
    if (typeof changes.driver !== 'string') return 'Driver must be a name or an empty string.';
    if (changes.driver.trim() && normalize(changes.driver) !== normalize(existing.driver)) {
      added.push({ name: changes.driver.trim(), type: 'DRIVER' });
    }
  }
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
    if (!active) return `${person.type === 'DRIVER' ? 'Driver' : 'Assistant'} "${person.name}" is inactive or not in the directory. Choose an active entry.`;
  }
  return null;
}
