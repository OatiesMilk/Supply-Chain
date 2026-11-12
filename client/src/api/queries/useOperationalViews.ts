import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import { operationalSyncOptions } from './operationalSync';

export function useDriverOverviewQuery(search = '', enabled = true) {
  return useQuery({ ...operationalSyncOptions, queryKey: ['records', 'driver-overview', search],
    queryFn: () => api.getDriverOverview(search), enabled,
    retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 3,
    refetchInterval: query => query.state.error instanceof ApiError && query.state.error.status >= 400 && query.state.error.status < 500
      ? false : operationalSyncOptions.refetchInterval,
  });
}
export function useCalendarCountsQuery(from: string, to: string) {
  return useQuery({ ...operationalSyncOptions, queryKey: ['records', 'calendar-counts', from, to],
    queryFn: () => api.getCalendarCounts(from, to), enabled: !!from && !!to });
}
export function useRecordFilterOptionsQuery(category: string) {
  return useQuery({ ...operationalSyncOptions, queryKey: ['records', 'filter-options', category],
    queryFn: () => api.getRecordFilterOptions(category), enabled: !!category });
}
export function useSupplierPickupCountsQuery(ids: string[]) {
  return useQuery({ ...operationalSyncOptions, queryKey: ['records', 'supplier-pickup-counts', ids],
    queryFn: () => api.getSupplierPickupCounts(ids), enabled: ids.length > 0 });
}

/** Background writes can remove the last row on the last page. */
export function useClampRecordPage(page: number, total: number | undefined, setPage: (page: number) => void) {
  useEffect(() => {
    if (total === undefined) return;
    const lastPage = Math.max(1, Math.ceil(total / 25));
    if (page > lastPage) setPage(lastPage);
  }, [page, total, setPage]);
}
