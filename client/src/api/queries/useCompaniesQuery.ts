import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiCompany, ApiCustomer } from '@/api';
import { Customer } from '@/types';
import { loadState, saveState } from '@/utils/persistence';

export const COMPANIES_QUERY_KEY = ['companies'] as const;
export const CUSTOMERS_QUERY_KEY = ['customers'] as const;

export function useCompaniesQuery() {
  return useQuery<ApiCompany[], Error>({
    queryKey: COMPANIES_QUERY_KEY,
    queryFn: async () => {
      try {
        return await api.getCompanies();
      } catch {
        return [];
      }
    },
    initialData: [],
  });
}

export function useCustomersQuery() {
  return useQuery<ApiCustomer[], Error>({
    queryKey: CUSTOMERS_QUERY_KEY,
    queryFn: async () => {
      try {
        const list = await api.getCustomers();
        saveState('customers', list);
        return list;
      } catch {
        return loadState<Customer[]>('customers', []) as unknown as ApiCustomer[];
      }
    },
    initialData: () => loadState<Customer[]>('customers', []) as unknown as ApiCustomer[],
  });
}

export function useCreateCustomerMutation(currentUser: { name: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      contact_person?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
    }) => {
      try {
        await api.createCustomer(data);
      } catch {
        const newCustomer: Customer = {
          id: `CST-${Math.floor(100 + Math.random() * 900)}`,
          name: data.name,
          contact_person: data.contact_person || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          city: data.city || '',
          created_by: currentUser.name,
          created_at: new Date().toISOString(),
          modified_by: currentUser.name,
          modified_at: new Date().toISOString(),
        };
        const prev = loadState<Customer[]>('customers', []);
        saveState('customers', [newCustomer, ...prev]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY });
    },
  });
}
