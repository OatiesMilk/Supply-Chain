import { useQuery } from '@tanstack/react-query';
import { api, ApiDashboardStats } from '@/api';
import { operationalSyncOptions } from './operationalSync';

export const DASHBOARD_QUERY_KEY = ['dashboard-stats'] as const;

export function useDashboardStatsQuery(enabled = true) {
  return useQuery<ApiDashboardStats | null, Error>({
    ...operationalSyncOptions,
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: () => api.getDashboardStats(),
    enabled,
    initialData: null,
  });
}
