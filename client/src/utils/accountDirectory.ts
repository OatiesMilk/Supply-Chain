import type { ApiAccountManagerOption, ApiCompany } from '@/api';

type CompanySaps = Partial<Pick<ApiCompany, 'sap_number' | 'sap_numbers'>>;
type CompanyAms = Partial<Pick<ApiCompany, 'default_account_manager' | 'account_managers'>>;

/** Companies offered for new choices. Older payloads without a status count as active. */
export const activeCompanies = <T extends Pick<ApiCompany, 'is_active'>>(companies: readonly T[]): T[] =>
  companies.filter(company => company.is_active !== false);

/** A company's SAP numbers (none for walk-in clients). Older payloads fall back to the single sap_number. */
export function companySapNumbers(company: CompanySaps | undefined): string[] {
  const values = company?.sap_numbers ?? (company?.sap_number ? [company.sap_number] : []);
  const seen = new Set<string>();
  return values.map(value => value.trim()).filter(value => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Names of the company's active assigned Account Managers, in the live directory spelling.
 * Older payloads without account_managers fall back to the single default. */
export function companyAccountManagers(company: CompanyAms | undefined,
  accountManagers: readonly ApiAccountManagerOption[] | undefined): string[] {
  const assigned = company?.account_managers ?? (company?.default_account_manager ? [company.default_account_manager] : []);
  return assigned.flatMap(row => {
    if (!row.is_active) return [];
    // Prefer the live list so a just-renamed Account Manager uses the current name.
    if (!accountManagers) return [row.name];
    const live = accountManagers.find(am => am.id === row.id && am.is_active);
    return live ? [live.name] : [];
  });
}

/** Auto-fill only when the company has exactly one active Account Manager; with several,
 * the user chooses (an enterprise client's AM depends on the transaction). */
export function defaultAccountManagerFor(company: CompanyAms | undefined,
  accountManagers: readonly ApiAccountManagerOption[] | undefined): string {
  const names = companyAccountManagers(company, accountManagers);
  return names.length === 1 ? names[0] : '';
}

/** Demo/Auto Fill: the first active assigned Account Manager, if any. */
export function preferredAccountManagerFor(company: CompanyAms | undefined,
  accountManagers: readonly ApiAccountManagerOption[] | undefined): string {
  return companyAccountManagers(company, accountManagers)[0] ?? '';
}

/** Picker groups: the company's assigned Account Managers first, then everyone else.
 * Undefined when the company has no active assigned Account Manager (use the flat list). */
export function accountManagerOptionGroups(company: (CompanyAms & Pick<ApiCompany, 'name'>) | undefined, choices: readonly string[],
  accountManagers: readonly ApiAccountManagerOption[] | undefined): { label: string; options: string[] }[] | undefined {
  if (!company) return undefined;
  const assigned = new Set(companyAccountManagers(company, accountManagers).map(name => name.toLowerCase()));
  const mine = choices.filter(name => assigned.has(name.toLowerCase()));
  if (!mine.length) return undefined;
  return [
    { label: `Assigned to ${company.name}`, options: mine },
    { label: 'Other Account Managers', options: choices.filter(name => !assigned.has(name.toLowerCase())) },
  ];
}

/** The record's Account Manager after the company changes. A manual pick is never overwritten;
 * an auto-filled one follows the new company (its single AM, kept if also assigned there, else cleared). */
export function accountManagerAfterCompanyChange(current: string, previous: CompanyAms | undefined, next: CompanyAms | undefined,
  accountManagers: readonly ApiAccountManagerOption[] | undefined): string {
  const previousDefault = defaultAccountManagerFor(previous, accountManagers);
  if (current.trim() && current !== previousDefault) return current;
  const nextDefault = defaultAccountManagerFor(next, accountManagers);
  if (nextDefault) return nextDefault;
  if (!current.trim()) return current;
  const key = current.trim().toLowerCase();
  return companyAccountManagers(next, accountManagers).some(name => name.toLowerCase() === key) ? current : '';
}

/** True when the name matches an active Account Manager, ignoring case and extra spaces. */
export function isListedAccountManager(name: string, accountManagers: readonly ApiAccountManagerOption[] | undefined): boolean {
  const key = name.trim().replace(/\s+/g, ' ').toLowerCase();
  return !!key && !!accountManagers?.some(row => row.is_active && row.name.toLowerCase() === key);
}
