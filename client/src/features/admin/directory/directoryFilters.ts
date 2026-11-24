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

export const MAX_COMPANY_SAP_NUMBERS = 50;

/** SAP numbers are optional (walk-in clients); each is at most 50 characters and unique ignoring case. */
export function companyFormErrors(form: { name: string; sap_numbers: readonly string[]; pending_sap?: string; address: string; contact_person: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = normalizeSpaces(form.name);
  if (name.length < 2 || name.length > 200) errors.name = 'Enter a company name of 2 to 200 characters.';
  const saps = [...form.sap_numbers, form.pending_sap ?? ''].map(value => value.trim()).filter(Boolean);
  const seen = new Set<string>();
  const duplicate = saps.find(sap => { const key = sap.toLowerCase(); if (seen.has(key)) return true; seen.add(key); return false; });
  if (saps.some(sap => sap.length > 50)) errors.sap_numbers = 'Use at most 50 characters per SAP number.';
  else if (duplicate) errors.sap_numbers = `${duplicate} is already in the list.`;
  else if (saps.length > MAX_COMPANY_SAP_NUMBERS) errors.sap_numbers = `Add at most ${MAX_COMPANY_SAP_NUMBERS} SAP numbers.`;
  if (form.address.trim().length > 1000) errors.address = 'Use at most 1000 characters.';
  if (form.contact_person.trim().length > 200) errors.contact_person = 'Use at most 200 characters.';
  return errors;
}

const sameValue = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b)
  ? a.length === b.length && a.every((value, index) => value === b[index]) : a === b;

/** Only changed fields are sent, so an untouched form is a no-op. Lists compare by value, in order. */
export function changedFields<T extends Record<string, unknown>>(before: T, after: T): Partial<T> {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => !sameValue(value, before[key]))) as Partial<T>;
}
