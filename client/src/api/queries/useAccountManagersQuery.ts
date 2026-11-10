import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type AccountManagerInput, type ApiAccountManager, type ApiAccountManagerOption, type ApiCompany, type CompanyInput } from '@/api';
import { COMPANIES_QUERY_KEY } from './useCompaniesQuery';

export const ACCOUNT_MANAGERS_QUERY_KEY = ['account-managers'] as const;

/** Every Account Manager with its status. Admin sessions also get contact and login details. */
export function useAccountManagersQuery(enabled = true) {
  return useQuery<Array<ApiAccountManagerOption | ApiAccountManager>, Error>({
    queryKey: ACCOUNT_MANAGERS_QUERY_KEY,
    queryFn: () => api.getAccountManagers(),
    enabled,
    staleTime: 60_000,
  });
}

/** Names offered on record forms: active Account Managers, plus the record's current value if it is no longer listed. */
export function accountManagerChoices(rows: readonly ApiAccountManagerOption[] | undefined, current = ''): string[] {
  const names = (rows ?? []).filter(row => row.is_active).map(row => row.name);
  const kept = current.trim();
  return kept && !names.some(name => name.toLowerCase() === kept.toLowerCase()) ? [kept, ...names] : names;
}

const conflict = (error: Error) => error instanceof ApiError && error.status === 409;

export function useAccountManagerMutations() {
  const client = useQueryClient();
  // Company rows embed the default Account Manager's name, so refresh both lists.
  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ACCOUNT_MANAGERS_QUERY_KEY }), client.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY })]);
  };
  const onError = async (error: Error) => { if (conflict(error)) await refresh(); };
  return {
    create: useMutation<ApiAccountManager, Error, AccountManagerInput>({ mutationFn: data => api.createAccountManager(data), onSuccess: refresh, onError }),
    update: useMutation<ApiAccountManager, Error, { id: string } & Partial<AccountManagerInput> & { is_active?: boolean; expected_version: number }>({
      mutationFn: ({ id, ...data }) => api.updateAccountManager(id, data), onSuccess: refresh, onError,
    }),
  };
}

export function useCompanyMutations() {
  const client = useQueryClient();
  const refresh = async () => { await client.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY }); };
  const onError = async (error: Error) => { if (conflict(error)) await refresh(); };
  return {
    create: useMutation<ApiCompany, Error, CompanyInput>({ mutationFn: data => api.createCompany(data), onSuccess: refresh, onError }),
    update: useMutation<ApiCompany, Error, { id: string } & Partial<CompanyInput> & { is_active?: boolean; expected_version: number }>({
      mutationFn: ({ id, ...data }) => api.updateCompany(id, data), onSuccess: refresh, onError,
    }),
  };
}
