import type { CustomerEditableField } from '../api';

// Mirrors server/src/services/customerValidation.ts so most mistakes are
// caught before a round trip. The server stays the source of truth.

export const CUSTOMER_FIELD_RULES: Record<CustomerEditableField, { label: string; max: number }> = {
  name:           { label: 'Customer name',  max: 120 },
  contact_person: { label: 'Contact person', max: 120 },
  email:          { label: 'Email',          max: 254 },
  phone:          { label: 'Phone',          max: 30 },
  city:           { label: 'City',           max: 80 },
  address:        { label: 'Address',        max: 300 },
};

export const CUSTOMER_FIELDS = Object.keys(CUSTOMER_FIELD_RULES) as CustomerEditableField[];
export const REMARKS_MAX = 1000;

export type CustomerDraft = Record<CustomerEditableField, string>;
export type CustomerErrors = Partial<Record<CustomerEditableField | 'remarks', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-.\s]*$/;

export function customerDraft(customer: CustomerDraft): CustomerDraft {
  return Object.fromEntries(CUSTOMER_FIELDS.map(field => [field, customer[field] ?? ''])) as CustomerDraft;
}

export function validateField(field: CustomerEditableField, raw: string): string | undefined {
  const { label, max } = CUSTOMER_FIELD_RULES[field];
  const value = raw.trim();
  if (value.length > max) return `${label} must be ${max} characters or fewer.`;
  if (field === 'name' && !value) return 'Customer name is required.';
  if (field === 'email' && value && !EMAIL_PATTERN.test(value)) return 'Enter a valid email address, like name@company.com.';
  if (field === 'phone' && !PHONE_PATTERN.test(value)) return 'Phone can only contain numbers, spaces and + ( ) - .';
  return undefined;
}

export function validateRemarks(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return 'Enter a reason for this change.';
  if (value.length > REMARKS_MAX) return `Reason must be ${REMARKS_MAX} characters or fewer.`;
  return undefined;
}

export function validateCustomerEdit(draft: CustomerDraft, remarks: string): CustomerErrors {
  const errors: CustomerErrors = {};
  for (const field of CUSTOMER_FIELDS) {
    const error = validateField(field, draft[field]);
    if (error) errors[field] = error;
  }
  const remarksError = validateRemarks(remarks);
  if (remarksError) errors.remarks = remarksError;
  return errors;
}

/** Fields whose trimmed value differs from the saved customer. */
export function changedCustomerFields(saved: CustomerDraft, draft: CustomerDraft): CustomerEditableField[] {
  return CUSTOMER_FIELDS.filter(field => (saved[field] ?? '').trim() !== draft[field].trim());
}
