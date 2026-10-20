import { prisma } from '../db';
import type { AuthUser } from '../middleware/auth';
import { recordScope } from './recordAccess';

type Snapshot = Record<string, any> | null;
const LINK_FIELDS = ['linked_collection_id', 'linked_collection', 'linkedCollectionId', 'linkedCollection'] as const;

function parseSnapshot(value: string | null): Snapshot {
  if (!value) return null;
  try {
    const snapshot = JSON.parse(value);
    return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

function linkedId(snapshot: Snapshot): string | null {
  if (!snapshot) return null;
  const ids = new Set<string>();
  for (const field of LINK_FIELDS) {
    const value = snapshot[field];
    if (value == null) continue;
    const id = field.endsWith('_id') || field.endsWith('Id') ? value : value.id;
    if (typeof id !== 'string' || !id.trim()) return null;
    ids.add(id);
  }
  // Conflicting legacy and serialized links cannot authorize each other's data.
  return ids.size === 1 ? [...ids][0] : null;
}

// Stored snapshots remain complete audit evidence. Responses use the caller's
// current permissions and the linked record's current assignment, never the
// historic assignment embedded in a snapshot. Missing/deleted links fail closed.
export async function visibleRecordAuditSnapshots(
  entries: Array<{ previousValue: string | null; newValue: string | null }>,
  user: AuthUser,
) {
  const snapshots = entries.map(entry => ({
    previousValue: parseSnapshot(entry.previousValue),
    newValue: parseSnapshot(entry.newValue),
  }));
  const ids = [...new Set(snapshots.flatMap(entry => [linkedId(entry.previousValue), linkedId(entry.newValue)])
    .filter((id): id is string => id !== null))];
  const readable = ids.length ? await prisma.deliveryRecord.findMany({
    where: { id: { in: ids }, deletedAt: null, AND: [recordScope(user)] },
    select: { id: true },
  }) : [];
  const readableIds = new Set(readable.map(record => record.id));
  const redact = (snapshot: Snapshot): Snapshot => {
    if (!snapshot || readableIds.has(linkedId(snapshot) ?? '')) return snapshot;
    const result = { ...snapshot };
    for (const field of LINK_FIELDS) {
      if (field in result) result[field] = null;
    }
    return result;
  };
  return snapshots.map(entry => ({ previousValue: redact(entry.previousValue), newValue: redact(entry.newValue) }));
}
