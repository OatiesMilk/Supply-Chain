import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { DeliveryRecord } from '@/types';

export const RECORDS_QUERY_KEY = ['records'] as const;

export function normalizeApiRecord(r: any): DeliveryRecord {
  return {
    ...r,
    customer_id: r.company_id,
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
        const extra: { time_out?: string; received_by?: string; priority?: string } = {};
        if (u.time_out) extra.time_out = u.time_out;
        if (u.received_by) extra.received_by = u.received_by;
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
          customer_id,
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
