import {
  DeliveryRecord,
  UserRole,
} from '@/types';
import {
  useCreateRecordMutation,
  useUpdateRecordMutation,
  useVerifyCollectionMutation,
} from '@/api/queries';
import { useUIStore } from '@/store/uiStore';

export interface UseDeliveryActionsParams {
  currentUser: { name: string; initials: string };
  currentUserRole: UserRole;
  refreshData: () => Promise<void>;
  setDeliveryRecords?: React.Dispatch<React.SetStateAction<DeliveryRecord[]>>;
}

export function useDeliveryActions({
  currentUser,
  currentUserRole,
}: UseDeliveryActionsParams) {
  const outputActionConfigs = useUIStore(s => s.outputActionConfigs);
  const handleUpdateOutputActionConfig = useUIStore(s => s.updateOutputActionConfig);

  const createRecordMutation = useCreateRecordMutation({
    name: currentUser.name,
    role: currentUserRole,
  });
  const updateRecordMutation = useUpdateRecordMutation();
  const verifyCollectionMutation = useVerifyCollectionMutation({
    name: currentUser.name,
  });

  const handleCreateRecord = async (
    data: Omit<
      DeliveryRecord,
      'id' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'email_notification_sent'
    >
  ) => {
    return createRecordMutation.mutateAsync(data);
  };

  const handleUpdateRecord = async (id: string, updates: Partial<DeliveryRecord>) => {
    await updateRecordMutation.mutateAsync({ id, updates });
  };

  const handleVerifyCollection = async (id: string) => {
    await verifyCollectionMutation.mutateAsync(id);
  };

  return {
    outputActionConfigs,
    handleUpdateOutputActionConfig,
    handleCreateRecord,
    handleUpdateRecord,
    handleVerifyCollection,
  };
}
