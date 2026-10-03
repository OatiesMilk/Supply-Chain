import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiUser } from '@/api';
import { UserRole } from '@/types';
import {
  useRecordsQuery,
  useCompaniesQuery,
  useCustomersQuery,
  useCreateCustomerMutation,
  useSuppliersQuery,
  useCreateSupplierMutation,
  useDriversQuery,
  useCreateDriverMutation,
  useUpdateDriverMutation,
  useDeleteDriverMutation,
  useSkusQuery,
  useDashboardStatsQuery,
  useResetDemoDataMutation,
} from '@/api/queries';

export function useAppData(
  authUser: ApiUser | null,
  currentUser: { name: string; initials: string },
  currentUserRole: UserRole
) {
  const queryClient = useQueryClient();

  const {
    data: deliveryRecords = [],
    isLoading: recordsLoading,
    error: recordsError,
  } = useRecordsQuery();

  const { data: companies = [] } = useCompaniesQuery();
  const { data: customers = [] } = useCustomersQuery();
  const { data: suppliers = [] } = useSuppliersQuery();
  const { data: products = [] } = useSkusQuery();
  const { data: managedDrivers = [] } = useDriversQuery();
  const { data: dashboardStats = null } = useDashboardStatsQuery(!!authUser);

  const createCustomerMutation = useCreateCustomerMutation(currentUser);
  const createSupplierMutation = useCreateSupplierMutation(currentUser);
  const createDriverMutation = useCreateDriverMutation();
  const updateDriverMutation = useUpdateDriverMutation();
  const deleteDriverMutation = useDeleteDriverMutation();
  const resetDemoDataMutation = useResetDemoDataMutation();

  const refreshData = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const handleCreateCustomer = async (data: {
    name: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
  }) => {
    await createCustomerMutation.mutateAsync(data);
  };

  const handleCreateSupplier = async (data: {
    name: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    category?: string;
  }) => {
    await createSupplierMutation.mutateAsync(data);
  };

  const handleCreateDriver = async (data: {
    name: string;
    type: 'DRIVER' | 'ASSISTANT';
    coverage_areas?: string[];
  }) => {
    await createDriverMutation.mutateAsync(data);
  };

  const handleUpdateDriver = async (
    id: string,
    data: Partial<{ name: string; type: string; coverage_areas: string[]; is_active: boolean }>
  ) => {
    await updateDriverMutation.mutateAsync({ id, data });
  };

  const handleDeleteDriver = async (id: string) => {
    await deleteDriverMutation.mutateAsync(id);
  };

  const handleResetDemoData = async () => {
    if (
      !window.confirm(
        'Reset all Supply Chain Portal data back to the original demo seed data? This clears every change made on the server and cannot be undone.'
      )
    )
      return;
    await resetDemoDataMutation.mutateAsync();
  };

  return {
    deliveryRecords,
    setDeliveryRecords: () => {
      // Maintained for backward compatibility; TanStack Query manages cache invalidation
    },
    companies,
    customers,
    suppliers,
    dashboardStats,
    products,
    managedDrivers,
    dataLoading: recordsLoading,
    dataError: recordsError?.message ?? null,
    resetting: resetDemoDataMutation.isPending,
    refreshData,
    handleCreateCustomer,
    handleCreateSupplier,
    handleCreateDriver,
    handleUpdateDriver,
    handleDeleteDriver,
    handleResetDemoData,
  };
}
