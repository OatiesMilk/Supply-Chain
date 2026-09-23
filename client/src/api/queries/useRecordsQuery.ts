import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { DeliveryRecord } from '@/types';
import { loadState, saveState } from '@/utils/persistence';

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

export function useRecordsQuery() {
  return useQuery<DeliveryRecord[], Error>({
    queryKey: RECORDS_QUERY_KEY,
    queryFn: async () => {
      try {
        const raw = await api.getRecords();
        const records = raw.map(normalizeApiRecord);
        saveState('delivery_records', records);
        return records;
      } catch (err) {
        // Offline / fallback to stored state
        const stored = loadState<DeliveryRecord[]>('delivery_records', []);
        if (stored.length > 0) return stored;
        throw err;
      }
    },
    initialData: () => loadState<DeliveryRecord[]>('delivery_records', []),
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
      try {
        const created = await api.createRecord(data as unknown as Record<string, unknown>);
        return normalizeApiRecord(created);
      } catch {
        // Fallback offline mock record creation
        const newId = `REC-${Math.floor(10000 + Math.random() * 90000)}`;
        const now = new Date().toISOString();
        const fallbackRecord: DeliveryRecord = {
          ...data,
          id: newId,
          customer_id: data.customer_id || '',
          created_by: `${currentUser.name} (${currentUser.role})`,
          created_at: now,
          modified_by: `${currentUser.name} (${currentUser.role})`,
          modified_at: now,
          email_notification_sent: false,
          output_actions_log: [],
        };
        const prev = loadState<DeliveryRecord[]>('delivery_records', []);
        saveState('delivery_records', [fallbackRecord, ...prev]);
        return fallbackRecord;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY });
    },
  });
}

export function useUpdateRecordMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<DeliveryRecord> }) => {
      try {
        if (updates.status) {
          const u = updates as any;
          const extra: { time_out?: string; received_by?: string } = {};
          if (u.time_out) extra.time_out = u.time_out;
          if (u.received_by) extra.received_by = u.received_by;
          await api.patchStatus(
            id,
            updates.status,
            u.status_remarks ?? u.remarks ?? '',
            Object.keys(extra).length > 0 ? extra : undefined
          );
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
          await api.updateRecord(id, rest);
        }
      } catch {
        // Offline fallback
        const prev = loadState<DeliveryRecord[]>('delivery_records', []);
        const updated = prev.map(r =>
          r.id === id ? { ...r, ...updates, modified_at: new Date().toISOString() } : r
        );
        saveState('delivery_records', updated);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY });
    },
  });
}

export function useVerifyCollectionMutation(currentUser: { name: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await api.verifyCollection(id);
      } catch {
        const prev = loadState<DeliveryRecord[]>('delivery_records', []);
        const updated = prev.map(r =>
          r.id === id
            ? {
                ...r,
                collection_verified: true,
                collection_verified_at: new Date().toISOString(),
                collection_verified_by: currentUser.name,
              }
            : r
        );
        saveState('delivery_records', updated);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY });
    },
  });
}
