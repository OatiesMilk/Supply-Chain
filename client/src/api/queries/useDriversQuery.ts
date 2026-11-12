import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiDriver } from '@/api';

export const DRIVERS_QUERY_KEY = ['drivers'] as const;

export const driverQueryOptions = {
  queryKey: DRIVERS_QUERY_KEY,
  queryFn: async () => {
    const list = await api.getDrivers(true);
    return list;
  },
};

export function useDriversQuery(enabled = true) {
  return useQuery<ApiDriver[], Error>({ ...driverQueryOptions, enabled });
}

export const createDriver = (data: { name: string; type: 'DRIVER' | 'ASSISTANT'; coverage_areas?: string[] }) => api.createDriver(data);

export function useCreateDriverMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDriver,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DRIVERS_QUERY_KEY }),
  });
}

export function useUpdateDriverMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ name: string; type: string; coverage_areas: string[]; is_active: boolean }>;
    }) => {
      return await api.updateDriver(id, data);
    },
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: DRIVERS_QUERY_KEY });
    },
  });
}

export function useDeleteDriverMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return await api.deleteDriver(id);
    },
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: DRIVERS_QUERY_KEY });
    },
  });
}
