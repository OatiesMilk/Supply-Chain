import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiSupplier } from '@/api';
import type { CreateSupplierInput } from '@/types/supplier';

export const SUPPLIERS_QUERY_KEY = ['suppliers'] as const;

export function useSuppliersQuery(enabled = true) {
  return useQuery<ApiSupplier[], Error>({
    queryKey: SUPPLIERS_QUERY_KEY,
    queryFn: () => api.getSuppliers(),
    enabled,
  });
}

export function useCreateSupplierMutation(currentUser: { name: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSupplierInput) => {
      await api.createSupplier(data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SUPPLIERS_QUERY_KEY });
    },
    onError: async (error: Error) => {
      if ('status' in error && error.status === 409) await queryClient.invalidateQueries({ queryKey: SUPPLIERS_QUERY_KEY });
    },
  });
}

export const SUPPLIER_CATEGORIES_QUERY_KEY = ['suppliers', 'categories'] as const;
export function useSupplierCategoriesQuery(enabled = true) {
  return useQuery({ queryKey: SUPPLIER_CATEGORIES_QUERY_KEY, queryFn: api.getSupplierCategories, enabled });
}
export function useSupplierCategoryMutations() {
  const client = useQueryClient();
  const onSuccess = async () => {
    await client.invalidateQueries({ queryKey: SUPPLIERS_QUERY_KEY });
  };
  const onError = async (error: Error) => {
    if ('status' in error && error.status === 409) await onSuccess();
  };
  return {
    create: useMutation({ mutationFn: api.createSupplierCategory, onSuccess }),
    update: useMutation({ mutationFn: ({ id, ...data }: { id: string; name?: string; is_active?: boolean; expected_version: number }) => api.updateSupplierCategory(id, data), onSuccess, onError }),
    assign: useMutation({ mutationFn: ({ id, ...data }: { id: string; category_ids: string[]; expected_version: number }) => api.updateSupplierCategories(id, data), onSuccess, onError }),
  };
}
