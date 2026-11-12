import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiSku } from '@/api';

export const SKUS_QUERY_KEY = ['skus'] as const;

export function useSkusQuery(enabled = true) {
  return useQuery<ApiSku[], Error>({
    queryKey: SKUS_QUERY_KEY,
    queryFn: () => api.getSkus(),
    enabled,
  });
}

export function createSkuMutationOptions(queryClient: ReturnType<typeof useQueryClient>) {
  return {
    mutationFn: (data: Parameters<typeof api.createSku>[0]) => api.createSku(data),
    onSuccess: (saved: ApiSku) => {
      queryClient.setQueryData<ApiSku[]>(SKUS_QUERY_KEY, previous =>
        [...(previous ?? []).filter(sku => sku.id !== saved.id), saved].sort((a, b) => a.sku_code.localeCompare(b.sku_code)));
      void queryClient.invalidateQueries({ queryKey: SKUS_QUERY_KEY });
    },
  };
}

export function useCreateSkuMutation() {
  return useMutation(createSkuMutationOptions(useQueryClient()));
}
