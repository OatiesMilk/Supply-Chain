import { useState, useEffect } from 'react';
import {
  DeliveryRecord,
  UserRole,
  OutputActionConfig,
  OutputActionTrigger,
} from '@/types';
import { api } from '@/api';
import { loadState, saveState } from '@/utils/persistence';
import { DEFAULT_OUTPUT_ACTIONS } from '@/outputActions';

export interface UseDeliveryActionsParams {
  currentUser: { name: string; initials: string };
  currentUserRole: UserRole;
  refreshData: () => Promise<void>;
  setDeliveryRecords: React.Dispatch<React.SetStateAction<DeliveryRecord[]>>;
}

export function useDeliveryActions({
  currentUser,
  currentUserRole,
  refreshData,
  setDeliveryRecords,
}: UseDeliveryActionsParams) {
  const [outputActionConfigs, setOutputActionConfigs] = useState<
    Record<OutputActionTrigger, OutputActionConfig>
  >(() => loadState('outputActionConfigs', DEFAULT_OUTPUT_ACTIONS));

  useEffect(() => {
    saveState('outputActionConfigs', outputActionConfigs);
  }, [outputActionConfigs]);

  const handleUpdateOutputActionConfig = (
    trigger: OutputActionTrigger,
    patch: Partial<OutputActionConfig>
  ) => {
    setOutputActionConfigs(prev => ({
      ...prev,
      [trigger]: { ...prev[trigger], ...patch },
    }));
  };

  const handleCreateRecord = async (
    data: Omit<
      DeliveryRecord,
      'id' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'email_notification_sent'
    >
  ) => {
    try {
      await api.createRecord(data as unknown as Record<string, unknown>);
      await refreshData();
    } catch {
      const newId = `REC-${Math.floor(10000 + Math.random() * 90000)}`;
      const now = new Date().toISOString();
      const newRecord: DeliveryRecord = {
        ...data,
        id: newId,
        customer_id: data.customer_id || '',
        created_by: `${currentUser.name} (${currentUserRole})`,
        created_at: now,
        modified_by: `${currentUser.name} (${currentUserRole})`,
        modified_at: now,
        email_notification_sent: false,
        output_actions_log: [],
      };
      setDeliveryRecords(prev => {
        const next = [newRecord, ...prev];
        saveState('delivery_records', next);
        return next;
      });
    }
  };

  const handleUpdateRecord = async (id: string, updates: Partial<DeliveryRecord>) => {
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
      await refreshData();
    } catch {
      setDeliveryRecords(prev => {
        const next = prev.map(r =>
          r.id === id ? { ...r, ...updates, modified_at: new Date().toISOString() } : r
        );
        saveState('delivery_records', next);
        return next;
      });
    }
  };

  const handleVerifyCollection = async (id: string) => {
    try {
      await api.verifyCollection(id);
      await refreshData();
    } catch {
      setDeliveryRecords(prev => {
        const next = prev.map(r =>
          r.id === id
            ? {
                ...r,
                collection_verified: true,
                collection_verified_at: new Date().toISOString(),
                collection_verified_by: currentUser.name,
              }
            : r
        );
        saveState('delivery_records', next);
        return next;
      });
    }
  };

  return {
    outputActionConfigs,
    handleUpdateOutputActionConfig,
    handleCreateRecord,
    handleUpdateRecord,
    handleVerifyCollection,
  };
}
