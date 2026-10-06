import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiCompany, ApiCustomer } from '@/api';

export const COMPANIES_QUERY_KEY = ['companies'] as const;
export const CUSTOMERS_QUERY_KEY = ['customers'] as const;

export function useCompaniesQuery(enabled = true) {
  return useQuery<ApiCompany[], Error>({
    queryKey: COMPANIES_QUERY_KEY,
    queryFn: () => api.getCompanies(),
    enabled,
  });
}

export function useCustomersQuery(enabled = true) {
  return useQuery<ApiCustomer[], Error>({
    queryKey: CUSTOMERS_QUERY_KEY,
    queryFn: () => api.getCustomers(),
    enabled,
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
      await api.createCustomer(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY });
    },
  });
}
