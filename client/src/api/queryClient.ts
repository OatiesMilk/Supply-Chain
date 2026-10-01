import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './index';

export const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds fresh cache
      refetchInterval: 1000 * 60, // Background polling every 60s
      refetchOnWindowFocus: true, // Refresh data when switching back to tab
      retry: (failures, error) => !(error instanceof ApiError && [401, 403].includes(error.status)) && failures < 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
