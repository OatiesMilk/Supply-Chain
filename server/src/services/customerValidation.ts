// Field rules for editing a Customer (merchant directory entry). Keep the
// limits in sync with client/src/utils/customerValidation.ts.

export const CUSTOMER_FIELDS = {
  name:           { column: 'name',          label: 'Customer name',  max: 120 },
  contact_person: { column: 'contactPerson', label: 'Contact person', max: 120 },
  email:          { column: 'email',         label: 'Email',          max: 254 },
  phone:          { column: 'phone',         label: 'Phone',          max: 30 },
  city:           { column: 'city',          label: 'City',           max: 80 },
  address:        { column: 'address',       label: 'Address',        max: 300 },
} as const;

export type CustomerField = keyof typeof CUSTOMER_FIELDS;
export type CustomerColumn = (typeof CUSTOMER_FIELDS)[CustomerField]['column'];

export const REMARKS_MAX = 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-.\s]*$/;

export interface CustomerUpdate {
  data: Partial<Record<CustomerColumn, string>>;
  remarks: string;
  expectedModifiedAt: string;
}

/** Validates a PUT body. Field errors are keyed by the API field name so the client can show them inline. */
export function parseCustomerUpdate(body: unknown): { value: CustomerUpdate } | { error: string; fields: Record<string, string> } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const data: CustomerUpdate['data'] = {};

  for (const [key, rule] of Object.entries(CUSTOMER_FIELDS) as [CustomerField, (typeof CUSTOMER_FIELDS)[CustomerField]][]) {
    const raw = b[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') { fields[key] = `${rule.label} must be text.`; continue; }
    const value = raw.trim();
    if (value.length > rule.max) fields[key] = `${rule.label} must be ${rule.max} characters or fewer.`;
    else if (key === 'name' && !value) fields[key] = 'Customer name is required.';
    else if (key === 'email' && value && !EMAIL_PATTERN.test(value)) fields[key] = 'Enter a valid email address, like name@company.com.';
    else if (key === 'phone' && !PHONE_PATTERN.test(value)) fields[key] = 'Phone can only contain numbers, spaces and + ( ) - .';
    else data[rule.column] = value;
  }

  const remarks = typeof b.remarks === 'string' ? b.remarks.trim() : '';
  if (!remarks) fields.remarks = 'Enter a reason for this change.';
  else if (remarks.length > REMARKS_MAX) fields.remarks = `Reason must be ${REMARKS_MAX} characters or fewer.`;

  const expected = b.expected_modified_at;
  const expectedValid = typeof expected === 'string' && !Number.isNaN(Date.parse(expected));

  if (Object.keys(fields).length) return { error: 'Some fields need attention.', fields };
  if (!expectedValid) return { error: 'expected_modified_at is required.', fields };
  return { value: { data, remarks, expectedModifiedAt: expected as string } };
}

type CustomerSnapshot = Record<CustomerField, string>;

export function customerSnapshot(c: Record<CustomerColumn, string>): CustomerSnapshot {
  return Object.fromEntries(
    (Object.entries(CUSTOMER_FIELDS) as [CustomerField, { column: CustomerColumn }][]).map(([key, rule]) => [key, c[rule.column]]),
  ) as CustomerSnapshot;
}

/** Field-level differences between two snapshots, labelled for display. */
export function customerChanges(before: Partial<CustomerSnapshot> | null, after: Partial<CustomerSnapshot> | null) {
  return (Object.keys(CUSTOMER_FIELDS) as CustomerField[])
    .filter(key => (before?.[key] ?? '') !== (after?.[key] ?? ''))
    .map(key => ({ field: key, label: CUSTOMER_FIELDS[key].label, from: before?.[key] ?? '', to: after?.[key] ?? '' }));
}
