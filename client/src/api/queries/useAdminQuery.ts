import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';

export function useResetDemoDataMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.resetSeed();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
}
