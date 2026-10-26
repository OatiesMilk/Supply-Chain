import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type RecordActiveCounts } from '@/api';
import { DeliveryRecord } from '@/types';
import { completionError, hasSavedPodPhoto } from '@/utils/podRequirement';

export const RECORDS_QUERY_KEY = ['records'] as const;
export const RECORD_ACTIVE_COUNTS_KEY = ['records', 'active-counts'] as const;
// Existing ['records'] invalidations also refresh the sidebar aggregates.
export function useRecordActiveCountsQuery(enabled = true) {
  return useQuery<RecordActiveCounts, Error>({
    queryKey: RECORD_ACTIVE_COUNTS_KEY,
    queryFn: api.getRecordActiveCounts,
    enabled,
  });
}

export function normalizeApiRecord(r: any): DeliveryRecord {
  return {
    ...r,
    driver_assistants: Array.isArray(r.driver_assistants) ? r.driver_assistants : [],
    output_actions_log: r.output_actions_log ?? [],
    email_notification_sent: r.status === 'Delivered',
  };
}

export function useRecordsQuery(enabled = true) {
  return useQuery<DeliveryRecord[], Error>({
    queryKey: RECORDS_QUERY_KEY,
    queryFn: async () => (await api.getRecords()).map(normalizeApiRecord),
    enabled,
  });
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
    queryKey: AM_SUMMARY_QUERY_KEY,
    queryFn: api.getAmSummary,
    enabled,
  });
}

export function useCalendarSummaryQuery(dateFrom?: string, dateTo?: string, enabled = true) {
  return useQuery<DeliveryRecord[], Error>({
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
      return normalizeApiRecord(await api.createRecord(data as unknown as Record<string, unknown>));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY });
    },
  });
}

export function createUpdateRecordMutationOptions(queryClient: ReturnType<typeof useQueryClient>) {
  return {
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<DeliveryRecord> }) => {
      if (updates.status) {
        const u = updates as any;
        const extra: { received_by?: string; priority?: string; delivery_date?: string } = {};
        if (u.received_by) extra.received_by = u.received_by;
        if (updates.status === 'Rescheduled' && u.delivery_date) extra.delivery_date = u.delivery_date;
        if (updates.status === 'Delivered') {
          const record = normalizeApiRecord(await api.getRecord(id));
          if (record.status !== 'Delivered') {
            if (!(u.status_remarks ?? u.remarks ?? '').trim()) throw new Error('Remarks are required to complete this run.');
            const files = await api.getRecordAttachments(id);
            const receivedBy = updates.received_by !== undefined ? updates.received_by : record.received_by;
            const error = completionError(record, updates.status, receivedBy, {
              loading: false, uploading: false, loadFailed: false, hasPhoto: hasSavedPodPhoto(files), hasStagedFiles: false,
            });
            if (error) throw new Error(error);
            extra.received_by = receivedBy!.trim();
          }
        }
        if (updates.priority !== undefined) extra.priority = updates.priority;
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
        const saved = normalizeApiRecord(await api.updateRecord(id, rest));
        if (updates.priority !== undefined && saved.priority !== updates.priority) {
          throw new Error('The server did not save the selected priority. Please try again.');
        }
        return saved;
      }
    },
    onSuccess: async (saved: DeliveryRecord | undefined) => {
      if (saved) {
        await queryClient.cancelQueries({ queryKey: RECORDS_QUERY_KEY });
        queryClient.setQueryData<DeliveryRecord[]>(RECORDS_QUERY_KEY, previous => {
          const records = (previous ?? []).map(record => record.id === saved.id ? saved : record);
          return records;
        });
      }
      await queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY });
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
      await api.verifyCollection(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY });
    },
  });
}
