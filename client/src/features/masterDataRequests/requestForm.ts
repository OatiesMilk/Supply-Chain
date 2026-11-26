import { ApiError, type ApiMasterDataAdditionRequest, type MasterDataEntityType, type MasterDataRequestFields, type SubmitMasterDataRequestInput } from '@/api';

/** Shared form state and rules for Company/Supplier addition requests (mirrors server/services/masterDataRequests.ts). */
export interface RequestForm {
  entity_type: MasterDataEntityType;
  name: string;
  sap_numbers: string[];
  pending_sap: string;
  contact_person: string;
  contact_phone: string;
  email: string;
  address: string;
  city: string;
  account_manager_ids: string[];
  supplier_category_ids: string[];
  notes: string;
}

export const MAX_COMPANY_SAP_NUMBERS = 50;
export const MAX_SUPPLIER_SAP_NUMBERS = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, ' ');
export const entityLabel = (type: MasterDataEntityType) => type === 'COMPANY' ? 'Company' : 'Supplier';

export function emptyRequestForm(entity_type: MasterDataEntityType = 'COMPANY', name = ''): RequestForm {
  return { entity_type, name, sap_numbers: [], pending_sap: '', contact_person: '', contact_phone: '', email: '', address: '', city: '',
    account_manager_ids: [], supplier_category_ids: [], notes: '' };
}

/** Prefilled form for an Admin reviewing a request: every submitted value, editable before approval. */
export function reviewForm(request: ApiMasterDataAdditionRequest): RequestForm {
  return { entity_type: request.entity_type, name: request.name, sap_numbers: [...request.sap_numbers], pending_sap: '',
    contact_person: request.contact_person, contact_phone: request.contact_phone, email: request.email, address: request.address, city: request.city,
    account_manager_ids: request.account_managers.map(am => am.id), supplier_category_ids: request.supplier_categories.map(category => category.id), notes: request.notes };
}

/** The SAP numbers that will be sent, including a typed value that was not added with the Add button. */
export function committedSapNumbers(form: RequestForm): string[] {
  const pending = form.pending_sap.trim();
  return pending ? [...form.sap_numbers, pending] : form.sap_numbers;
}

export function requestFormErrors(form: RequestForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const label = entityLabel(form.entity_type);
  const name = normalizeSpaces(form.name);
  if (name.length < 2 || name.length > 200) errors.name = `${label} name must be 2 to 200 characters`;
  const saps = committedSapNumbers(form).map(sap => sap.trim());
  const max = form.entity_type === 'COMPANY' ? MAX_COMPANY_SAP_NUMBERS : MAX_SUPPLIER_SAP_NUMBERS;
  const keys = saps.map(sap => sap.toLowerCase());
  if (saps.some(sap => !sap || sap.length > 50)) errors.sap_numbers = 'Each SAP number must be 1 to 50 characters';
  else if (new Set(keys).size !== keys.length) errors.sap_numbers = 'Each SAP number may be listed once';
  else if (saps.length > max) errors.sap_numbers = `At most ${max} SAP numbers`;
  if (form.contact_person.trim().length > 200) errors.contact_person = 'Contact person must be at most 200 characters';
  if (form.contact_phone.trim().length > 50) errors.contact_phone = 'Phone must be at most 50 characters';
  if (form.email.trim() && (form.email.trim().length > 254 || !EMAIL.test(form.email.trim()))) errors.email = 'Enter a valid email address';
  if (form.address.trim().length > 1000) errors.address = 'Address must be at most 1000 characters';
  if (form.city.trim().length > 250) errors.city = 'City must be at most 250 characters';
  if (form.notes.trim().length > 1000) errors.notes = 'Notes must be at most 1000 characters';
  return errors;
}

/** Only the fields that apply to the entity type, trimmed like the server will store them. */
export function requestFields(form: RequestForm): Required<Pick<MasterDataRequestFields, 'name' | 'sap_numbers' | 'contact_person' | 'contact_phone' | 'address'>> & MasterDataRequestFields {
  const base = { name: normalizeSpaces(form.name), sap_numbers: committedSapNumbers(form).map(sap => sap.trim()),
    contact_person: form.contact_person.trim(), contact_phone: form.contact_phone.trim(), address: form.address.trim() };
  return form.entity_type === 'COMPANY'
    ? { ...base, account_manager_ids: [...form.account_manager_ids] }
    : { ...base, email: form.email.trim().toLowerCase(), city: form.city.trim(), supplier_category_ids: [...form.supplier_category_ids] };
}

export function submitPayload(form: RequestForm): SubmitMasterDataRequestInput {
  return { entity_type: form.entity_type, ...requestFields(form), notes: form.notes.trim() };
}

/** Server conflicts and validation errors land on the field they concern. */
export function serverFieldErrors(error: unknown): { fields: Record<string, string>; message: string | null } {
  const message = error instanceof Error ? error.message : 'Could not send the request. Try again.';
  if (error instanceof ApiError) {
    const fields = { ...error.fields };
    if (Object.keys(fields).length) return { fields, message: null };
    if (/SAP number/i.test(message)) return { fields: { sap_numbers: message }, message: null };
    if (/already exists|pending addition request/i.test(message)) return { fields: { name: message }, message: null };
    if (/Account Manager/i.test(message)) return { fields: { account_manager_ids: message }, message: null };
    if (/categor/i.test(message)) return { fields: { supplier_category_ids: message }, message: null };
  }
  return { fields: {}, message };
}
