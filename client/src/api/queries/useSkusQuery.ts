import { useQuery } from '@tanstack/react-query';
import { api, ApiSku } from '@/api';

export const SKUS_QUERY_KEY = ['skus'] as const;

export function useSkusQuery() {
  return useQuery<ApiSku[], Error>({
    queryKey: SKUS_QUERY_KEY,
    queryFn: async () => {
      try {
        return await api.getSkus();
      } catch {
        return [];
      }
    },
    initialData: [],
  });
}
