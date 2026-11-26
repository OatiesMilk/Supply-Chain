import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  api, ApiError, type ApiMasterDataAdditionRequest, type ApproveMasterDataRequestInput, type ApproveMasterDataRequestResult,
  type MasterDataRequestListParams, type MasterDataRequestListResponse, type RejectMasterDataRequestInput, type SubmitMasterDataRequestInput,
} from '@/api';
import { operationalSyncOptions } from './operationalSync';
import { COMPANIES_QUERY_KEY } from './useCompaniesQuery';
import { SUPPLIERS_QUERY_KEY } from './useSuppliersQuery';

/** Company & Supplier addition requests (Feature 4b): TASS sees its own, ADMIN the review queue. */
export const MASTER_DATA_REQUESTS_QUERY_KEY = ['master-data-requests'] as const;
export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;
export const masterDataRequestsKey = (params: MasterDataRequestListParams = {}) =>
  [...MASTER_DATA_REQUESTS_QUERY_KEY, params.status ?? 'ALL', params.entity_type ?? 'ALL', params.search?.trim() ?? '', params.page ?? 1, params.limit ?? 0] as const;
/** Under the same prefix, so every list invalidation also refreshes opened-from-notification lookups. */
export const masterDataRequestDetailKey = (id: string) => [...MASTER_DATA_REQUESTS_QUERY_KEY, 'detail', id] as const;
/** Smallest list read: exact counts and capabilities for badges and entry points. */
export const MASTER_DATA_REQUEST_SUMMARY: MasterDataRequestListParams = { limit: 1 };

export function useMasterDataRequestsQuery(params: MasterDataRequestListParams = {}, enabled = true) {
  return useQuery<MasterDataRequestListResponse, Error>({
    ...operationalSyncOptions,
    queryKey: masterDataRequestsKey(params),
    queryFn: () => api.getMasterDataRequests(params),
    enabled,
  });
}

/** A single scoped request (TASS: own only), e.g. a notification target outside the loaded page. */
export function useMasterDataRequestDetailQuery(id: string | null | undefined, enabled = true) {
  return useQuery<ApiMasterDataAdditionRequest, Error>({
    ...operationalSyncOptions,
    queryKey: masterDataRequestDetailKey(id ?? ''),
    queryFn: () => api.getMasterDataRequest(id!),
    enabled: enabled && !!id,
    retry: false,
  });
}

/** Query keys each mutation must refresh, so every affected list updates without a reload. */
export const MASTER_DATA_REQUEST_INVALIDATIONS = {
  submit: [MASTER_DATA_REQUESTS_QUERY_KEY, NOTIFICATIONS_QUERY_KEY],
  approve: [MASTER_DATA_REQUESTS_QUERY_KEY, COMPANIES_QUERY_KEY, SUPPLIERS_QUERY_KEY, NOTIFICATIONS_QUERY_KEY],
  reject: [MASTER_DATA_REQUESTS_QUERY_KEY, NOTIFICATIONS_QUERY_KEY],
} as const;

export async function invalidateMasterDataRequestQueries(client: QueryClient, kind: keyof typeof MASTER_DATA_REQUEST_INVALIDATIONS) {
  await Promise.all(MASTER_DATA_REQUEST_INVALIDATIONS[kind].map(queryKey => client.invalidateQueries({ queryKey })));
}

const conflict = (error: Error) => error instanceof ApiError && error.status === 409;

export function useMasterDataRequestMutations(options: { onAuditAffected?: () => void } = {}) {
  const client = useQueryClient();
  const reviewed = (kind: 'approve' | 'reject') => async () => {
    await invalidateMasterDataRequestQueries(client, kind);
    options.onAuditAffected?.();
  };
  // A conflict means someone else changed the queue or the directory; show the current state.
  const onReviewError = async (error: Error) => { if (conflict(error)) await invalidateMasterDataRequestQueries(client, 'approve'); };
  return {
    submit: useMutation<ApiMasterDataAdditionRequest, Error, SubmitMasterDataRequestInput>({
      mutationFn: data => api.submitMasterDataRequest(data),
      onSuccess: async () => { await invalidateMasterDataRequestQueries(client, 'submit'); },
    }),
    approve: useMutation<ApproveMasterDataRequestResult, Error, { id: string } & ApproveMasterDataRequestInput>({
      mutationFn: ({ id, ...data }) => api.approveMasterDataRequest(id, data), onSuccess: reviewed('approve'), onError: onReviewError,
    }),
    reject: useMutation<{ request: ApiMasterDataAdditionRequest }, Error, { id: string } & RejectMasterDataRequestInput>({
      mutationFn: ({ id, ...data }) => api.rejectMasterDataRequest(id, data), onSuccess: reviewed('reject'), onError: onReviewError,
    }),
  };
}
