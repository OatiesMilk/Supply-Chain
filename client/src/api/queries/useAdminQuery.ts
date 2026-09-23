import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { clearPersistedState, saveState } from '@/utils/persistence';

export function useResetDemoDataMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        await api.resetSeed();
      } catch {
        clearPersistedState();
        saveState('delivery_records', []);
        saveState('customers', []);
        saveState('suppliers', []);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
}
