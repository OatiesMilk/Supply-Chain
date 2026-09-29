import { useQuery } from '@tanstack/react-query';
import { api, ApiSku } from '@/api';

export const SKUS_QUERY_KEY = ['skus'] as const;

export function useSkusQuery(enabled = true) {
  return useQuery<ApiSku[], Error>({
    queryKey: SKUS_QUERY_KEY,
    queryFn: () => api.getSkus(),
    enabled,
  });
}
