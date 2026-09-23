import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiSupplier } from '@/api';
import { Supplier } from '@/types';
import { loadState, saveState } from '@/utils/persistence';

export const SUPPLIERS_QUERY_KEY = ['suppliers'] as const;

export function useSuppliersQuery() {
  return useQuery<ApiSupplier[], Error>({
    queryKey: SUPPLIERS_QUERY_KEY,
    queryFn: async () => {
      try {
        const list = await api.getSuppliers();
        saveState('suppliers', list);
        return list;
      } catch {
        return loadState<Supplier[]>('suppliers', []) as unknown as ApiSupplier[];
      }
    },
    initialData: () => loadState<Supplier[]>('suppliers', []) as unknown as ApiSupplier[],
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
      try {
        await api.createSupplier(data);
      } catch {
        const newSupplier: Supplier = {
          id: `SUP-${Math.floor(100 + Math.random() * 900)}`,
          name: data.name,
          contact_person: data.contact_person || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          city: data.city || '',
          category: (data.category as any) || 'Hardware',
          created_by: currentUser.name,
          created_at: new Date().toISOString(),
          modified_by: currentUser.name,
          modified_at: new Date().toISOString(),
        };
        const prev = loadState<Supplier[]>('suppliers', []);
        saveState('suppliers', [newSupplier, ...prev]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPPLIERS_QUERY_KEY });
    },
  });
}
