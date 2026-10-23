import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { setManagedDriverList, subscribeManagedDrivers, getManagedDriverVersion } from '@/data';
import { useQueryClient } from '@tanstack/react-query';
import { ApiUser, ApiDriver } from '@/api';
import { UserRole } from '@/types';
import { CATEGORY_SCREENS } from '@/routes/screenRouting';
import {
  useRecordsQuery,
  useRecordActiveCountsQuery,
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

import { getPageDataState, pageResources, type PageQueryState } from './pageDataState';

const EMPTY_DRIVERS: ApiDriver[] = [];

export function isResourceQueryEnabled(
  resource: string,
  user: ApiUser | null,
  currentScreen?: string
): boolean {
  if (!user?.resources.includes(resource)) return false;
  if (!currentScreen) return true;
  switch (resource) {
    case 'records':
      // Full lists belong on operational screens; global badges use aggregates.
      return (
        Boolean(CATEGORY_SCREENS[currentScreen]) ||
        ['main', 'calendar', 'driver', 'driver_board', 'suppliers', 'am_directory'].includes(currentScreen) ||
        (user.role === 'DRIVER' && user.effectiveScreens.includes('driver_dashboard'))
      );
    case 'companies':
      return true;
    case 'customers':
      return currentScreen === 'customers';
    case 'suppliers':
      return currentScreen === 'suppliers';
    case 'skus':
      return currentScreen === 'inventory' || currentScreen === 'transactions';
    case 'drivers':
      return (
        currentScreen.startsWith('driver') ||
        Boolean(CATEGORY_SCREENS[currentScreen]) ||
        currentScreen === 'main' ||
        currentScreen === 'calendar' ||
        currentScreen === 'data_sampler'
      );
    case 'dashboard':
      return false; // OperationalDashboard owns its aggregate query and load/error state.
    default:
      return true;
  }
}

export function useAppData(
  authUser: ApiUser | null,
  currentUser: { name: string; initials: string },
  currentUserRole: UserRole,
  currentScreen?: string,
  searchOpen = false
) {
  const queryClient = useQueryClient();
  // A forbidden screen cannot initiate protected data loading.
  const routeAllowed = !currentScreen || Boolean(authUser?.effectiveScreens.includes(currentScreen));
  const allowed = (resource: string) =>
    routeAllowed && (isResourceQueryEnabled(resource, authUser, currentScreen) ||
      // Opening global search explicitly requests its data; normal visits do not.
      (searchOpen && authUser?.resources.includes(resource) === true));

  const recordsQuery = useRecordsQuery(allowed('records'));
  const { data: deliveryRecords = [] } = recordsQuery;
  const { data: activeRecordCounts = null } = useRecordActiveCountsQuery(Boolean(authUser?.resources.includes('records')));
  const companiesQuery = useCompaniesQuery(allowed('companies'));
  const customersQuery = useCustomersQuery(allowed('customers'));
  const suppliersQuery = useSuppliersQuery(allowed('suppliers'));
  const skusQuery = useSkusQuery(allowed('skus'));
  const driversQuery = useDriversQuery(allowed('drivers'));
  const { data: companies = [] } = companiesQuery;
  const { data: customers = [] } = customersQuery;
  const { data: suppliers = [] } = suppliersQuery;
  const { data: products = [] } = skusQuery;
  const { data: managedDrivers = EMPTY_DRIVERS, isError: driversError } = driversQuery;
  // Legacy assignment dropdowns read the shared proxies; notify them after updates.
  useSyncExternalStore(subscribeManagedDrivers, getManagedDriverVersion, getManagedDriverVersion);
  useEffect(() => {
    setManagedDriverList(driversError ? [] : managedDrivers);
    return () => setManagedDriverList([]);
  }, [managedDrivers, driversError]);
  const dashboardQuery = useDashboardStatsQuery(allowed('dashboard'));
  const { data: dashboardStats = null } = dashboardQuery;
  const resourceQueries: Record<string, PageQueryState> = {
    records: recordsQuery, companies: companiesQuery, customers: customersQuery,
    suppliers: suppliersQuery, skus: skusQuery, drivers: driversQuery, dashboard: dashboardQuery,
  };
  const activeQueries = pageResources(currentScreen)
    .filter(resource => routeAllowed && isResourceQueryEnabled(resource, authUser, currentScreen))
    .map(resource => resourceQueries[resource]);
  const pageState = getPageDataState(activeQueries);
  const retryPageData = async () => { await Promise.all(activeQueries.map(query => query.refetch())); };

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
    await resetDemoDataMutation.mutateAsync();
  };

  return {
    deliveryRecords,
    activeRecordCounts,
    setDeliveryRecords: () => {
      // Maintained for backward compatibility; TanStack Query manages cache invalidation
    },
    companies,
    customers,
    suppliers,
    dashboardStats,
    products,
    managedDrivers,
    dataLoading: pageState.loading,
    dataError: pageState.error,
    retryPageData,
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
