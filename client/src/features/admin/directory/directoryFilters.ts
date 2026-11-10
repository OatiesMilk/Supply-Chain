/** Pure helpers shared by the Account Managers and Companies tabs. */
export type StatusFilter = 'active' | 'inactive' | 'all';

export const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, ' ');

/** Case-insensitive search across the given fields, then a status filter, sorted by name. */
export function filterDirectory<T extends { name: string; is_active: boolean }>(
  rows: readonly T[], search: string, status: StatusFilter, fields: (row: T) => Array<string | null | undefined>,
): T[] {
  const needle = normalizeSpaces(search).toLowerCase();
  return rows
    .filter(row => status === 'all' || (status === 'active') === row.is_active)
    .filter(row => !needle || [row.name, ...fields(row)].some(value => (value ?? '').toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function statusCounts(rows: readonly { is_active: boolean }[]) {
  const active = rows.filter(row => row.is_active).length;
  return { active, inactive: rows.length - active, all: rows.length };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side checks match the server rules so most mistakes are caught before saving. */
export function accountManagerFormErrors(form: { name: string; email: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = normalizeSpaces(form.name);
  if (name.length < 2 || name.length > 100) errors.name = 'Enter a name of 2 to 100 characters.';
  if (form.email.trim() && !EMAIL.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  return errors;
}

export function companyFormErrors(form: { name: string; sap_number: string; address: string; contact_person: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = normalizeSpaces(form.name);
  if (name.length < 2 || name.length > 200) errors.name = 'Enter a company name of 2 to 200 characters.';
  if (!form.sap_number.trim()) errors.sap_number = 'SAP number is required.';
  else if (form.sap_number.trim().length > 50) errors.sap_number = 'Use at most 50 characters.';
  if (form.address.trim().length > 1000) errors.address = 'Use at most 1000 characters.';
  if (form.contact_person.trim().length > 200) errors.contact_person = 'Use at most 200 characters.';
  return errors;
}

/** Only changed fields are sent, so an untouched form is a no-op. */
export function changedFields<T extends Record<string, unknown>>(before: T, after: T): Partial<T> {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => value !== before[key])) as Partial<T>;
}
