import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { DeliveryCategory } from '@/types';
import { COMPANY_HISTORY_PAGE_SIZE, nextHistoryCursor } from '@/utils/companyHistory';
import { RECORDS_QUERY_KEY, normalizeApiRecord } from './useRecordsQuery';

// Nested under the records key so any record mutation that invalidates
// ['records'] also refreshes open company histories.
export const companyRecordsQueryKey = (companyId: string, category: DeliveryCategory | 'All') =>
  [...RECORDS_QUERY_KEY, 'company', companyId, category] as const;

export function useCompanyRecordsQuery(companyId: string, category: DeliveryCategory | 'All', enabled = true) {
  return useInfiniteQuery({
    queryKey: companyRecordsQueryKey(companyId, category),
    queryFn: async ({ pageParam }) => (await api.getRecords({
      company_id: companyId,
      category: category === 'All' ? undefined : category,
      limit: COMPANY_HISTORY_PAGE_SIZE,
      cursor: pageParam,
    })).map(normalizeApiRecord),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => nextHistoryCursor(lastPage),
    enabled: enabled && Boolean(companyId),
  });
}
