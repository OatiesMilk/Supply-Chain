import type { ApiAccountManagerOption, ApiCompany } from '@/api';

/** Companies offered for new choices. Older payloads without a status count as active. */
export const activeCompanies = <T extends Pick<ApiCompany, 'is_active'>>(companies: readonly T[]): T[] =>
  companies.filter(company => company.is_active !== false);

/** The company's default Account Manager name, only while that Account Manager is active. */
export function defaultAccountManagerFor(company: Pick<ApiCompany, 'default_account_manager'> | undefined,
  accountManagers: readonly ApiAccountManagerOption[] | undefined): string {
  const assigned = company?.default_account_manager;
  if (!assigned?.is_active) return '';
  // Prefer the live list so a just-renamed Account Manager uses the current name.
  return accountManagers?.find(row => row.id === assigned.id && row.is_active)?.name ?? (accountManagers ? '' : assigned.name);
}

/** True when the name matches an active Account Manager, ignoring case and extra spaces. */
export function isListedAccountManager(name: string, accountManagers: readonly ApiAccountManagerOption[] | undefined): boolean {
  const key = name.trim().replace(/\s+/g, ' ').toLowerCase();
  return !!key && !!accountManagers?.some(row => row.is_active && row.name.toLowerCase() === key);
}
