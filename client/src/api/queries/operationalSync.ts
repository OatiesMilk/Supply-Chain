import { replaceEqualDeep, type QueryClient } from '@tanstack/react-query';
import type { DeliveryRecord } from '@/types';

/** Poll only mounted operational views. Hidden tabs refresh immediately on return. */
export const operationalSyncOptions = {
  staleTime: 0,
  refetchInterval: 2_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: 'always' as const,
  refetchOnReconnect: 'always' as const,
};

export const recordDetailKey = (id: string) => ['records', 'detail', id] as const;

/** Delayed reads/saves cannot replace a newer committed record. RMA versions
 * take precedence; other workflows use the server's modification timestamp. */
export function newerRecord(previous: DeliveryRecord | undefined, incoming: DeliveryRecord): DeliveryRecord {
  if (!previous || incoming.id !== previous.id) return incoming;
  if (incoming.category === 'RMA' && previous.category === 'RMA') {
    const previousVersion = previous.rma_version ?? 0;
    const incomingVersion = incoming.rma_version ?? 0;
    if (previousVersion !== incomingVersion) return previousVersion > incomingVersion ? previous : incoming;
  }
  const previousTime = Date.parse(previous.modified_at);
  const incomingTime = Date.parse(incoming.modified_at);
  return Number.isFinite(previousTime) && Number.isFinite(incomingTime) && previousTime > incomingTime ? previous : replaceEqualDeep(previous, incoming);
}

function recordLike(value: unknown): value is DeliveryRecord {
  return !!value && typeof value === 'object' && typeof (value as DeliveryRecord).id === 'string' && typeof (value as DeliveryRecord).category === 'string';
}

/** Keep server removals (including reassignment) while protecting matched rows. */
export function shareOperationalRecords(previous: unknown, incoming: unknown): unknown {
  if (recordLike(incoming)) return newerRecord(recordLike(previous) ? previous : undefined, incoming);
  if (Array.isArray(incoming)) {
    const oldById = new Map((Array.isArray(previous) ? previous : []).filter(recordLike).map(record => [record.id, record]));
    return incoming.map(record => recordLike(record) ? newerRecord(oldById.get(record.id), record) : record);
  }
  if (incoming && typeof incoming === 'object' && Array.isArray((incoming as { rows?: unknown }).rows)) {
    return {
      ...incoming,
      rows: shareOperationalRecords((previous as { rows?: unknown } | undefined)?.rows, (incoming as { rows: unknown }).rows),
    };
  }
  return incoming;
}

function updateMatchingRecord(data: unknown, saved: DeliveryRecord): unknown {
  if (recordLike(data)) return data.id === saved.id ? newerRecord(data, saved) : data;
  if (Array.isArray(data)) return data.map(record => recordLike(record) && record.id === saved.id ? newerRecord(record, saved) : record);
  if (data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)) {
    return { ...data, rows: updateMatchingRecord((data as { rows: unknown }).rows, saved) };
  }
  return data;
}

export async function saveRecordToCache(client: QueryClient, saved: DeliveryRecord): Promise<void> {
  // TanStack cancellation discards an old response even if the transport cannot abort it.
  await client.cancelQueries({ queryKey: ['records'] });
  client.setQueriesData({ queryKey: ['records'] }, data => updateMatchingRecord(data, saved));
  client.setQueryData<DeliveryRecord>(recordDetailKey(saved.id), previous => newerRecord(previous, saved));
}

export async function invalidateOperationalQueries(client: QueryClient): Promise<void> {
  await Promise.all([
    ['records'], ['dashboard-stats'], ['dashboard-overview'], ['notifications'], ['pod-attachments'],
    ['record-audit'], ['record-remarks'], ['record-comments'],
  ].map(queryKey => client.invalidateQueries({ queryKey })));
}
