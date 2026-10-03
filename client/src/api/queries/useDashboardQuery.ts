import { useQuery } from '@tanstack/react-query';
import { api, ApiDashboardStats } from '@/api';

export const DASHBOARD_QUERY_KEY = ['dashboard-stats'] as const;

export function useDashboardStatsQuery(enabled = true) {
  return useQuery<ApiDashboardStats | null, Error>({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: async () => {
      try {
        return await api.getDashboardStats();
      } catch {
        return null;
      }
    },
    enabled,
    initialData: null,
  });
}
