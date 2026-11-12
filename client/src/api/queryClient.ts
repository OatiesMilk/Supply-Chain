import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './index';

export const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds fresh cache
      refetchInterval: 1000 * 60, // Background polling every 60s
      refetchOnWindowFocus: true, // Refresh data when switching back to tab
      // Retrying client errors immediately can amplify bad requests and rate limits.
      retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
