import { rememberPermissionRecord } from '../permissionRuntime';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type RecordActiveCounts } from '@/api';
import { DeliveryRecord } from '@/types';
import { completionError, hasSavedPodPhoto } from '@/utils/podRequirement';
import { useEffect } from 'react';
import { invalidateOperationalQueries, newerRecord, operationalSyncOptions, recordDetailKey, saveRecordToCache, shareOperationalRecords } from './operationalSync';
export { invalidateOperationalQueries, saveRecordToCache } from './operationalSync';

export const RECORDS_QUERY_KEY = ['records'] as const;
export const RECORD_ACTIVE_COUNTS_KEY = ['records', 'active-counts'] as const;
// Existing ['records'] invalidations also refresh the sidebar aggregates.
export function useRecordActiveCountsQuery(enabled = true) {
  return useQuery<RecordActiveCounts, Error>({
    ...operationalSyncOptions,
    queryKey: RECORD_ACTIVE_COUNTS_KEY,
    queryFn: api.getRecordActiveCounts,
    enabled,
  });
}

export function normalizeApiRecord(r: any): DeliveryRecord {
  rememberPermissionRecord(r);
  return {
    ...r,
    ...(r.category === 'RMA' ? { rma_version: r.rma_version ?? 0 } : {}),
    driver_assistants: Array.isArray(r.driver_assistants) ? r.driver_assistants : [],
    output_actions_log: r.output_actions_log ?? [],
    email_notification_sent: r.email_notification_sent === true,
  };
}

export function useRecordsQuery(enabled = true) {
  return useQuery<DeliveryRecord[], Error>({
    ...operationalSyncOptions,
    structuralSharing: shareOperationalRecords,
    queryKey: RECORDS_QUERY_KEY,
    queryFn: async () => (await api.getRecords()).map(normalizeApiRecord),
    enabled,
  });
}

/** Detail links resolve independently of the currently loaded list page. */
export function useSelectedRecordQuery(id: string | null | undefined, initialRecord?: DeliveryRecord) {
  return useQuery<DeliveryRecord, Error>({
    ...operationalSyncOptions,
    queryKey: recordDetailKey(id ?? ''),
    queryFn: async () => normalizeApiRecord(await api.getRecord(id!)),
    initialData: initialRecord?.id === id ? normalizeApiRecord(initialRecord) : undefined,
    structuralSharing: shareOperationalRecords,
    enabled: !!id,
  });
}

export function useRecordDetailQuery(record: DeliveryRecord, enabled = true) {
  rememberPermissionRecord(record);
  const client = useQueryClient();
  const queryKey = recordDetailKey(record.id);
  const query = useQuery<DeliveryRecord, Error>({
    ...operationalSyncOptions,
    queryKey,
    queryFn: async () => normalizeApiRecord(await api.getRecord(record.id)),
    initialData: record,
    structuralSharing: shareOperationalRecords,
    enabled,
  });
  useEffect(() => {
    if (enabled) client.setQueryData<DeliveryRecord>(queryKey, previous => newerRecord(previous, record));
  }, [client, enabled, record]);
  return query;
}

export interface PagedRecordResult {
  rows: DeliveryRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  page: number;
  limit: number;
}

export function usePagedRecordsQuery(filters: import('@/api').RecordListFilters = {}, enabled = true) {
  return useQuery<PagedRecordResult, Error>({
    ...operationalSyncOptions,
    structuralSharing: shareOperationalRecords,
    queryKey: ['records', 'paged', filters] as const,
    queryFn: async () => {
      const res = await api.getPagedRecords(filters);
      return {
        ...res,
        rows: res.rows.map(normalizeApiRecord),
      };
    },
    enabled,
  });
}

export const AM_SUMMARY_QUERY_KEY = ['records', 'am-summary'] as const;
export function useAmSummaryQuery(enabled = true) {
  return useQuery({
    ...operationalSyncOptions,
    queryKey: AM_SUMMARY_QUERY_KEY,
    queryFn: api.getAmSummary,
    enabled,
  });
}

export function useCalendarSummaryQuery(dateFrom?: string, dateTo?: string, enabled = true) {
  return useQuery<DeliveryRecord[], Error>({
    ...operationalSyncOptions,
    structuralSharing: shareOperationalRecords,
    queryKey: ['records', 'calendar-summary', dateFrom, dateTo] as const,
    queryFn: async () => {
      const res = await api.getCalendarSummary(dateFrom, dateTo);
      return res.map(normalizeApiRecord);
    },
    enabled,
  });
}

export function useCreateRecordMutation(currentUser: { name: string; role: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: Omit<
        DeliveryRecord,
        'id' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'email_notification_sent'
      >
    ) => {
      const {
        collection_verified,
        collection_verified_by,
        collection_verified_at,
        ...payload
      } = data as unknown as Record<string, unknown>;
      return normalizeApiRecord(await api.createRecord(payload));
    },
    onSuccess: () => invalidateOperationalQueries(queryClient),
  });
}

function displayedRecord(queryClient: ReturnType<typeof useQueryClient>, id: string): DeliveryRecord | undefined {
  const detail = queryClient.getQueryData<DeliveryRecord>(recordDetailKey(id));
  if (detail) return detail;
  for (const [, data] of queryClient.getQueriesData({ queryKey: ['records'] })) {
    const value = data as any;
    const rows = Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : [];
    const match = rows.find((record: DeliveryRecord) => record.id === id);
    if (match) return match;
  }
}

export function createUpdateRecordMutationOptions(queryClient: ReturnType<typeof useQueryClient>) {
  return {
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<DeliveryRecord> }) => {
      if (updates.status) {
        const u = updates as any;
        const extra: { received_by?: string; priority?: string; delivery_date?: string; expected_version?: number; expected_edit_version?: string } = {};
        if (u.expected_version !== undefined) extra.expected_version = u.expected_version;
        if (u.received_by) extra.received_by = u.received_by;
        if (updates.status === 'Rescheduled' && u.delivery_date) extra.delivery_date = u.delivery_date;
        if (updates.status === 'Delivered') {
          const record = normalizeApiRecord(await api.getRecord(id));
          if (record.status !== 'Delivered') {
            if (!(u.status_remarks ?? u.remarks ?? '').trim()) throw new Error('Remarks are required to complete this run.');
            const files = record.category === 'RMA' ? [] : await api.getRecordAttachments(id);
            const receivedBy = updates.received_by !== undefined ? updates.received_by : record.rma_recipient ?? record.received_by;
            if (record.category === 'RMA') {
              if (!record.rma_received_at) throw new Error('Confirm physical receipt before completing this RMA.');
              if (extra.expected_version === undefined) {
                const cached = queryClient.getQueryData<DeliveryRecord>(recordDetailKey(id));
                extra.expected_version = cached?.rma_version ?? record.rma_version ?? 0;
              }
            }
            const error = completionError(record, updates.status, receivedBy, {
              loading: false, uploading: false, loadFailed: false, hasPhoto: hasSavedPodPhoto(files), hasStagedFiles: false,
            });
            if (error) throw new Error(error);
            extra.received_by = receivedBy!.trim();
          }
        }
        if (updates.priority !== undefined) extra.priority = updates.priority;
        if (extra.priority !== undefined || extra.delivery_date !== undefined) {
          const expected = u.expected_edit_version ?? displayedRecord(queryClient, id)?.edit_version;
          if (expected !== undefined) extra.expected_edit_version = expected;
        }
        const saved = normalizeApiRecord(await api.patchStatus(
          id,
          updates.status,
          u.status_remarks ?? u.remarks ?? '',
          Object.keys(extra).length > 0 ? extra : undefined
        ));
        if (updates.priority !== undefined && saved.priority !== updates.priority) {
          throw new Error('The server did not save the selected priority. Please try again.');
        }
        return saved;
      } else {
        const {
          modified_by,
          modified_at,
          output_actions_log,
          email_notification_sent,
          company_name,
          ...rest
        } = updates as any;
        // Editors send their captured precondition. Immediate single-field
        // actions may use the record snapshot already displayed in the cache;
        // never fetch a new token to make a stale draft pass.
        if (rest.expected_edit_version === undefined) {
          const snapshot = displayedRecord(queryClient, id);
          if (snapshot?.edit_version) rest.expected_edit_version = snapshot.edit_version;
        }
        delete rest.edit_version;
        const saved = normalizeApiRecord(await api.updateRecord(id, rest));
        if (updates.priority !== undefined && saved.priority !== updates.priority) {
          throw new Error('The server did not save the selected priority. Please try again.');
        }
        return saved;
      }
    },
    onSuccess: async (saved: DeliveryRecord | undefined) => {
      if (saved) await saveRecordToCache(queryClient, saved);
      await invalidateOperationalQueries(queryClient);
    },
  };
}

export function useUpdateRecordMutation() {
  const queryClient = useQueryClient();
  return useMutation(createUpdateRecordMutationOptions(queryClient));
}

export function useRecordTimeInMutation() {
  const queryClient = useQueryClient();
  const options = createUpdateRecordMutationOptions(queryClient);
  return useMutation({
    mutationFn: async ({ id, remarks }: { id: string; remarks: string }) => {
      if (!remarks.trim()) throw new Error('Remarks are required to record Time In.');
      return normalizeApiRecord(await api.recordTimeIn(id, remarks.trim()));
    },
    onSuccess: options.onSuccess,
  });
}

export function useVerifyCollectionMutation(currentUser: { name: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const saved = await api.verifyCollection(id);
      return saved ? normalizeApiRecord(saved) : undefined;
    },
    onSuccess: async (saved: DeliveryRecord | undefined) => {
      if (saved) await saveRecordToCache(queryClient, saved);
      await invalidateOperationalQueries(queryClient);
    },
  });
}
