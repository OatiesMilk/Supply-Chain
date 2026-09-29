import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiSupplier } from '@/api';

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
    mutationFn: async (data: {
      name: string;
      contact_person?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      category?: string;
    }) => {
      await api.createSupplier(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPPLIERS_QUERY_KEY });
    },
  });
}
