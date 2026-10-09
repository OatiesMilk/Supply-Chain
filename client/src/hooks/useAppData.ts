import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { setManagedDriverList, subscribeManagedDrivers, getManagedDriverVersion } from '@/data';
import { useQueryClient } from '@tanstack/react-query';
import { ApiUser, ApiDriver } from '@/api';
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
} from '@/api/queries';

const EMPTY_DRIVERS: ApiDriver[] = [];

export function useAppData(
  authUser: ApiUser | null,
  currentUser: { name: string; initials: string },
  currentUserRole: UserRole
) {
  const queryClient = useQueryClient();
  const allowed = (resource: string) => !!authUser?.resources.includes(resource);

  const {
    data: deliveryRecords = [],
    isLoading: recordsLoading,
    error: recordsError,
  } = useRecordsQuery(allowed('records'));

  const { data: companies = [] } = useCompaniesQuery(allowed('companies'));
  const { data: customers = [] } = useCustomersQuery(allowed('customers'));
  const { data: suppliers = [] } = useSuppliersQuery(allowed('suppliers'));
  const { data: products = [] } = useSkusQuery(allowed('skus'));
  const { data: managedDrivers = EMPTY_DRIVERS, isError: driversError } = useDriversQuery(allowed('drivers'));
  // Legacy assignment dropdowns read the shared proxies; notify them after updates.
  useSyncExternalStore(subscribeManagedDrivers, getManagedDriverVersion, getManagedDriverVersion);
  useEffect(() => {
    setManagedDriverList(driversError ? [] : managedDrivers);
    return () => setManagedDriverList([]);
  }, [managedDrivers, driversError]);
  const { data: dashboardStats = null } = useDashboardStatsQuery(allowed('dashboard'));

  const createCustomerMutation = useCreateCustomerMutation(currentUser);
  const createSupplierMutation = useCreateSupplierMutation(currentUser);
  const createDriverMutation = useCreateDriverMutation();
  const updateDriverMutation = useUpdateDriverMutation();
  const deleteDriverMutation = useDeleteDriverMutation();

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
    refreshData,
    handleCreateCustomer,
    handleCreateSupplier,
    handleCreateDriver,
    handleUpdateDriver,
    handleDeleteDriver,
  };
}
