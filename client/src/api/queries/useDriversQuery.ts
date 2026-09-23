import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiDriver } from '@/api';
import { setManagedDriverList } from '@/data';

export const DRIVERS_QUERY_KEY = ['drivers'] as const;

export const DEFAULT_MOCK_DRIVERS: ApiDriver[] = [
  {
    id: 'drv-1',
    name: 'Lando Navarro',
    type: 'DRIVER',
    coverage_areas: ['Makati', 'BGC', 'Taguig', 'Mandaluyong', 'San Juan', 'Pasig', 'Ortigas', 'Ortigas Corridor', 'Ortigas Center (Pasig)'],
    is_active: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    modified_by: 'system',
    modified_at: new Date().toISOString(),
  },
  {
    id: 'drv-2',
    name: 'Manny Santos',
    type: 'DRIVER',
    coverage_areas: ['Quezon City', 'Marikina', 'Caloocan', 'Valenzuela', 'Malabon', 'Bulacan', 'Cainta', 'Antipolo'],
    is_active: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    modified_by: 'system',
    modified_at: new Date().toISOString(),
  },
  {
    id: 'drv-3',
    name: 'Ronald de la Cruz',
    type: 'DRIVER',
    coverage_areas: ['Manila', 'Parañaque', 'Pasay', 'Las Piñas', 'Muntinlupa', 'Cavite', 'Laguna', 'Batangas'],
    is_active: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    modified_by: 'system',
    modified_at: new Date().toISOString(),
  },
  {
    id: 'drv-4',
    name: 'Jayson Reyes',
    type: 'ASSISTANT',
    coverage_areas: [],
    is_active: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    modified_by: 'system',
    modified_at: new Date().toISOString(),
  },
  {
    id: 'drv-5',
    name: 'Bong Alvarez',
    type: 'ASSISTANT',
    coverage_areas: [],
    is_active: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    modified_by: 'system',
    modified_at: new Date().toISOString(),
  },
  {
    id: 'drv-6',
    name: 'Ricky Mendoza',
    type: 'ASSISTANT',
    coverage_areas: [],
    is_active: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    modified_by: 'system',
    modified_at: new Date().toISOString(),
  },
];

export function useDriversQuery() {
  return useQuery<ApiDriver[], Error>({
    queryKey: DRIVERS_QUERY_KEY,
    queryFn: async () => {
      try {
        const list = await api.getDrivers(true);
        if (list && list.length > 0) {
          setManagedDriverList(
            list.map(d => ({
              name: d.name,
              type: d.type,
              coverage_areas: d.coverage_areas,
              is_active: d.is_active,
            }))
          );
          return list;
        }
        return DEFAULT_MOCK_DRIVERS;
      } catch {
        setManagedDriverList(
          DEFAULT_MOCK_DRIVERS.map(d => ({
            name: d.name,
            type: d.type,
            coverage_areas: d.coverage_areas,
            is_active: d.is_active,
          }))
        );
        return DEFAULT_MOCK_DRIVERS;
      }
    },
    initialData: () => DEFAULT_MOCK_DRIVERS,
  });
}

export function useCreateDriverMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      type: 'DRIVER' | 'ASSISTANT';
      coverage_areas?: string[];
    }) => {
      try {
        return await api.createDriver(data);
      } catch {
        return {
          id: `drv-${Date.now()}`,
          name: data.name,
          type: data.type,
          coverage_areas: data.coverage_areas || [],
          is_active: true,
          created_by: 'system',
          created_at: new Date().toISOString(),
          modified_by: 'system',
          modified_at: new Date().toISOString(),
        } as ApiDriver;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DRIVERS_QUERY_KEY });
    },
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
      queryClient.invalidateQueries({ queryKey: DRIVERS_QUERY_KEY });
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
      queryClient.invalidateQueries({ queryKey: DRIVERS_QUERY_KEY });
    },
  });
}
