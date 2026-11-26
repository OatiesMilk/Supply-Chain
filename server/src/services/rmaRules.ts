import { isValidDateOnly, isoTimestamp, manilaToday } from './deliveryLifecycle';

/**
 * The six TASS slip categories confirmed by stakeholders. The label is what is
 * stored in DeliveryRecord.rmaType; the prefix starts the auto-generated
 * <PREFIX><MMDDYY>-<NN> slip reference. RESCH is a status, not a slip category.
 */
export const RMA_CATEGORIES = [
  'Pull Out Slip', 'Return to Customer Slip', 'Return to Supplier Slip',
  'Advance Replacement Slip', 'Receiving Slip', 'Transfer Out Slip',
] as const;
export type RmaCategory = typeof RMA_CATEGORIES[number];
export type RmaSlipPrefix = 'POS' | 'RTC' | 'RTS' | 'ARD' | 'RR' | 'TXO';
export const RMA_CATEGORY_META: Readonly<Record<RmaCategory, { prefix: RmaSlipPrefix; label: RmaCategory; slipTitle: string }>> = {
  'Pull Out Slip': { prefix: 'POS', label: 'Pull Out Slip', slipTitle: 'PULL OUT SLIP' },
  'Return to Customer Slip': { prefix: 'RTC', label: 'Return to Customer Slip', slipTitle: 'RETURN TO CUSTOMER SLIP' },
  'Return to Supplier Slip': { prefix: 'RTS', label: 'Return to Supplier Slip', slipTitle: 'RETURN TO SUPPLIER SLIP' },
  'Advance Replacement Slip': { prefix: 'ARD', label: 'Advance Replacement Slip', slipTitle: 'ADVANCE REPLACEMENT SLIP' },
  'Receiving Slip': { prefix: 'RR', label: 'Receiving Slip', slipTitle: 'RECEIVING SLIP' },
  'Transfer Out Slip': { prefix: 'TXO', label: 'Transfer Out Slip', slipTitle: 'TRANSFER OUT SLIP' },
};
export const TRANSFER_OUT_CATEGORY: RmaCategory = 'Transfer Out Slip';
/** Earlier stored labels and bare prefixes, mapped to their canonical category. */
export const RMA_LEGACY_CATEGORY_ALIASES: Readonly<Record<string, RmaCategory>> = {
  'Pull-Out Slip': 'Pull Out Slip', 'Pull out': 'Pull Out Slip', POS: 'Pull Out Slip',
  'Return to Customer': 'Return to Customer Slip', RTC: 'Return to Customer Slip',
  'Return to Supplier': 'Return to Supplier Slip', 'Return to suppliers': 'Return to Supplier Slip', RTS: 'Return to Supplier Slip',
  'Advance Replacement Demo': 'Advance Replacement Slip', 'Advance Replacement': 'Advance Replacement Slip', ARD: 'Advance Replacement Slip',
  'Receiving Report': 'Receiving Slip', RR: 'Receiving Slip',
  TXO: 'Transfer Out Slip',
};
/** Historical labels that stay readable on old records but cannot be chosen again. */
export const RETIRED_RMA_CATEGORIES = ['Sales Orders', 'Pick-Up', 'Others'] as const;
export const RMA_ITEM_TYPES = ['Small Item', 'Unit'] as const;
export const RMA_CONTACT_FIELDS = ['customer_contact_name', 'customer_contact_email', 'customer_contact_phone'] as const;
const categories = new Set<string>(RMA_CATEGORIES);
export const RMA_CATEGORY_REQUIRED_ERROR = `Category is required and must be one of: ${RMA_CATEGORIES.join(', ')}.`;
export const RMA_MANUAL_REFERENCE_ERROR = 'RMA Document Reference is auto-generated on save and cannot be manually supplied.';
export const RMA_REFERENCE_LOCKED_ERROR = 'RMA Document Reference is auto-generated and cannot be edited.';
export const RMA_CATEGORY_LOCKED_ERROR = 'Category cannot be changed after a slip reference number has been assigned.';

/** Keep earlier stored labels readable without rewriting existing records. Retired labels pass through unchanged. */
export function normalizeRmaCategory(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return RMA_LEGACY_CATEGORY_ALIASES[trimmed] ?? trimmed;
}

/** Canonical category for a stored or submitted value, or null for retired/unknown labels. */
export function canonicalRmaCategory(value: unknown): RmaCategory | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeRmaCategory(value);
  return normalized && categories.has(normalized) ? normalized as RmaCategory : null;
}

export function isCanonicalRmaCategory(value: unknown): value is string {
  return canonicalRmaCategory(value) !== null;
}

/** Every stored rmaType value that reads as this category (for list filtering). */
export function rmaCategoryDbValues(category: RmaCategory): string[] {
  return [category, ...Object.entries(RMA_LEGACY_CATEGORY_ALIASES).filter(([, target]) => target === category).map(([alias]) => alias)];
}

export interface RmaInputOptions {
  /** Category must be one of the six canonical slips (new creates, draft submission). */
  requireCategory?: boolean;
  /** Accept a client-supplied non-empty rma_reference. Defaults to true; new creates pass false. */
  allowManualReference?: boolean;
  /** Accept a retired historical label (e.g. 'Others') — only for values already stored on the record. */
  allowRetiredCategory?: boolean;
}

export function rmaInputError(body: Record<string, any>, requireComplete = false, options: RmaInputOptions = {}): string | null {
  const { requireCategory = false, allowManualReference = true, allowRetiredCategory = false } = options;
  for (const [field, label] of [['priority', 'Priority'], ['area', 'Area'], ['account_manager', 'Account Manager']]) {
    if ((requireComplete || field in body) && (typeof body[field] !== 'string' || !body[field].trim())) return `${label} is required.`;
  }
  if (body.priority !== undefined && !['1 - Low', '2 - Moderate', '3 - High'].includes(body.priority)) return 'Invalid record priority.';
  if (body.rma_reference !== undefined && body.rma_reference !== null && typeof body.rma_reference !== 'string') return 'Reference must be text.';
  if (!allowManualReference && typeof body.rma_reference === 'string' && body.rma_reference.trim()) return RMA_MANUAL_REFERENCE_ERROR;
  const suppliedCategory = body.rma_type !== undefined && body.rma_type !== null && body.rma_type !== '';
  if (suppliedCategory) {
    const normalized = typeof body.rma_type === 'string' ? normalizeRmaCategory(body.rma_type) : null;
    const retired = allowRetiredCategory && !requireCategory && !!normalized && (RETIRED_RMA_CATEGORIES as readonly string[]).includes(normalized);
    if (!normalized || (!categories.has(normalized) && !retired)) {
      return requireCategory ? RMA_CATEGORY_REQUIRED_ERROR : `Category must be one of: ${RMA_CATEGORIES.join(', ')}.`;
    }
  } else if (requireCategory) {
    return RMA_CATEGORY_REQUIRED_ERROR;
  }
  if (body.is_internal_transfer !== undefined && typeof body.is_internal_transfer !== 'boolean') return 'is_internal_transfer must be true or false.';
  if (body.purchase_date !== undefined && body.purchase_date !== null && body.purchase_date !== '' && !isValidDateOnly(body.purchase_date)) {
    return 'Purchase Date must be a valid YYYY-MM-DD date.';
  }
  for (const field of RMA_CONTACT_FIELDS) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') return 'Customer contact details must be text.';
  }
  if (typeof body.customer_contact_email === 'string' && body.customer_contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer_contact_email.trim())) {
    return 'Customer Contact Email must be a valid email address.';
  }
  const formError = rmaFormTextError(body);
  if (formError) return formError;
  if (body.rma_contacts !== undefined) {
    const contacts = normalizeRmaContacts(body.rma_contacts);
    if (contacts.ok === false) return contacts.error;
  }
  return null;
}

export const NON_RMA_INTERNAL_TRANSFER_ERROR = 'Non-RMA internal transfer flag only applies to Transfer Out Slip (TXO) records.';
export const INTERNAL_TRANSFER_CATEGORY_ERROR = 'Non-RMA internal transfer is only supported for Transfer Out Slip (TXO) records.';
export const INTERNAL_TRANSFER_MOVEMENT_ERROR = 'Non-RMA internal transfers must use Logistics transport or Internal / no driver.';
export const INTERNAL_TRANSFER_LOCKED_ERROR = 'Internal transfer classification cannot be changed after completion.';

/** Validates the effective (stored + submitted) internal transfer classification of an RMA record. */
export function rmaInternalTransferError(effective: { rmaType: string | null | undefined; isInternalTransfer: boolean; rmaMovement: string | null | undefined }): string | null {
  if (!effective.isInternalTransfer) return null;
  if (canonicalRmaCategory(effective.rmaType) !== TRANSFER_OUT_CATEGORY) return INTERNAL_TRANSFER_CATEGORY_ERROR;
  if (effective.rmaMovement === 'SUPPLIER_COLLECTION') return INTERNAL_TRANSFER_MOVEMENT_ERROR;
  return null;
}

export interface RmaEventDateOptions {
  label: string;
  /** Inclusive Asia/Manila YYYY-MM-DD lower bound. */
  minDate?: string | null;
  minDateError?: string;
  now?: Date;
}
export type ParsedRmaEventDate = { ok: true; date: Date } | { ok: false; error: string };

const RMA_EVENT_DATE_FLOOR = '2000-01-01';

/**
 * Parses an editable RMA event date (physical receipt or final completion).
 * Accepts an Asia/Manila calendar date (YYYY-MM-DD) or an ISO-8601 timestamp
 * with timezone; omitted/blank means "now". Bounds and chronology compare
 * Manila calendar days so a same-day event is always accepted.
 */
export function parseRmaEventDate(value: unknown, options: RmaEventDateOptions): ParsedRmaEventDate {
  const { label, minDate, minDateError } = options;
  const now = options.now ?? new Date();
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return { ok: true, date: now };
  const formatError = { ok: false as const, error: `${label} must be a valid YYYY-MM-DD date or ISO timestamp with timezone.` };
  if (typeof value !== 'string') return formatError;
  const trimmed = value.trim();
  const today = manilaToday(now);
  const check = (day: string): string | null => {
    if (day < RMA_EVENT_DATE_FLOOR) return `${label} must be on or after ${RMA_EVENT_DATE_FLOOR}.`;
    if (day > today) return `${label} cannot be in the future.`;
    if (minDate && day < minDate) return minDateError ?? `${label} cannot be earlier than ${minDate}.`;
    return null;
  };
  if (isValidDateOnly(trimmed)) {
    const error = check(trimmed);
    if (error) return { ok: false, error };
    // Today keeps the exact server time; a past day is stored at Manila noon so
    // it stays inside that Manila calendar day in every timezone.
    return { ok: true, date: trimmed === today ? now : new Date(`${trimmed}T12:00:00+08:00`) };
  }
  const iso = isoTimestamp(trimmed);
  if (!iso) return formatError;
  const parsed = new Date(iso);
  const error = check(manilaToday(parsed));
  return error ? { ok: false, error } : { ok: true, date: parsed };
}

// ── RMA form fields, structured items, contacts and separated remarks ───────

export const RETURN_TO_CUSTOMER_CATEGORY: RmaCategory = 'Return to Customer Slip';
export const RMA_ITEM_UNIT_TYPES = ['Unit', 'Item'] as const;
export type RmaItemUnitType = typeof RMA_ITEM_UNIT_TYPES[number];
export const RMA_STATUS_TAG_PRESETS = ['For Pull Out', 'For Pick Up', 'For Return', 'UNIT REPAIRED/FOR DELIVERY'] as const;
export const RMA_SERVICE_SLIP_RTC_ONLY_ERROR = 'Service Slip (SS#) is only allowed for Return to Customer Slip (RTC) records.';
export const RMA_PAIR_INCOMPLETE_ERROR = 'Replacement unit items must include both New SN and Defective SN.';
export const RMA_SERIAL_MODE_ERROR = 'Use either a single Serial Number or a Replacement Unit pair (New SN + Defective SN), not both.';
export const RMA_PAIR_SAME_ERROR = 'New SN and Defective SN must be different.';
export const NON_RMA_FIELD_ERRORS = {
  case_number: 'Case Number only applies to RMA records.',
  service_slip_no: 'Service Slip (SS#) only applies to Return to Customer Slip (RTC) records.',
  remarks: 'Client Slip Remarks and Internal Logistics Notes only apply to RMA records.',
  rma_contacts: 'RMA contacts only apply to RMA records.',
  line_items: 'Structured RMA item fields only apply to RMA records.',
} as const;
const MAX_CONTACTS = 10;
const MAX_LINE_ITEMS = 50;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isReturnToCustomerCategory(value: unknown): boolean {
  return canonicalRmaCategory(value) === RETURN_TO_CUSTOMER_CATEGORY;
}

/** Trimmed text, or null when blank/absent. Non-text values are rejected by the validators below. */
export function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
const blank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !value.trim());

/** RMA record-level text fields: shape and length only (category rules are checked separately). */
export const RMA_FORM_TEXT_FIELDS: ReadonlyArray<readonly [field: string, label: string, max: number]> = [
  ['case_number', 'Case Number', 80],
  ['service_slip_no', 'Service Slip (SS#)', 60],
  ['client_remarks', 'Client Slip Remarks', 2000],
  ['internal_logistics_remarks', 'Internal Logistics Notes', 2000],
];
export function rmaFormTextError(body: Record<string, unknown>): string | null {
  for (const [field, label, max] of RMA_FORM_TEXT_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return `${label} must be text.`;
    if (value.trim().length > max) return `${label} must be ${max} characters or fewer.`;
  }
  return null;
}

/** A non-empty SS# is only valid on Return to Customer Slip (RTC) records. */
export function rmaServiceSlipError(rmaType: unknown, serviceSlipNo: unknown): string | null {
  return optionalText(serviceSlipNo) && !isReturnToCustomerCategory(rmaType) ? RMA_SERVICE_SLIP_RTC_ONLY_ERROR : null;
}

export interface NormalizedRmaContact { name: string; phone: string | null; email: string | null }
export type ContactsResult = { ok: true; contacts: NormalizedRmaContact[] } | { ok: false; error: string };

export function normalizeRmaContacts(value: unknown): ContactsResult {
  if (value === null) return { ok: true, contacts: [] };
  if (!Array.isArray(value)) return { ok: false, error: 'Contacts must be a list.' };
  if (value.length > MAX_CONTACTS) return { ok: false, error: `Enter at most ${MAX_CONTACTS} contacts.` };
  const contacts: NormalizedRmaContact[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Each contact must be an object.' };
    const entry = raw as Record<string, unknown>;
    for (const key of ['name', 'phone', 'email']) {
      if (entry[key] !== undefined && entry[key] !== null && typeof entry[key] !== 'string') return { ok: false, error: 'Contact details must be text.' };
    }
    const name = optionalText(entry.name) ?? '';
    const phone = optionalText(entry.phone);
    const email = optionalText(entry.email);
    if (!name && !phone && !email) continue; // a fully blank row is an empty editor line
    if (name.length > 120) return { ok: false, error: 'Contact Name must be 120 characters or fewer.' };
    if (phone && phone.length > 60) return { ok: false, error: 'Contact Phone must be 60 characters or fewer.' };
    if (email && email.length > 160) return { ok: false, error: 'Contact Email must be 160 characters or fewer.' };
    if (email && !EMAIL.test(email)) return { ok: false, error: 'Contact Email must be a valid email address.' };
    contacts.push({ name, phone, email });
  }
  return { ok: true, contacts };
}

/** Legacy single-contact columns kept in step with the contact list. */
export function syncLegacyContactSnapshot(contacts: readonly NormalizedRmaContact[]) {
  const unique = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => !!v))];
  const names = unique(contacts.map(c => c.name || null));
  const phones = unique(contacts.map(c => c.phone));
  return {
    customerContactName: names.length ? names.join(' / ') : null,
    customerContactPhone: phones.length ? phones.join(' / ') : null,
    customerContactEmail: contacts.find(c => c.email)?.email ?? null,
  };
}

/** One contact from the legacy single-contact fields, or none when all are blank. */
export function contactsFromLegacySnapshot(name: unknown, email: unknown, phone: unknown): NormalizedRmaContact[] {
  const contact = { name: optionalText(name) ?? '', phone: optionalText(phone), email: optionalText(email) };
  return contact.name || contact.phone || contact.email ? [contact] : [];
}

export interface NormalizedLineItem {
  position: number;
  sku: string;
  quantity: number;
  unitType: RmaItemUnitType | null;
  serialNumber: string | null;
  newSerialNumber: string | null;
  defectiveSerialNumber: string | null;
  purchaseDate: string | null;
  salesOrderNo: string | null;
  accessories: string | null;
  problemDescription: string | null;
  repairNote: string | null;
  statusTag: string | null;
}
export type LineItemsResult = { ok: true; items: NormalizedLineItem[] } | { ok: false; error: string };

/** Snake-case API field, database column and maximum length of each structured item text field. */
export const RMA_ITEM_TEXT_FIELDS = [
  ['serial_number', 'serialNumber', 120], ['new_serial_number', 'newSerialNumber', 120], ['defective_serial_number', 'defectiveSerialNumber', 120],
  ['purchase_date', 'purchaseDate', 10], ['sales_order_no', 'salesOrderNo', 60], ['accessories', 'accessories', 300],
  ['problem_description', 'problemDescription', 500], ['repair_note', 'repairNote', 500], ['status_tag', 'statusTag', 100],
] as const;
export const RMA_ITEM_STRUCTURED_FIELDS = ['unit_type', ...RMA_ITEM_TEXT_FIELDS.map(([field]) => field)] as const;
const ITEM_LABELS: Record<string, string> = {
  serial_number: 'Serial Number', new_serial_number: 'New SN', defective_serial_number: 'Defective SN', purchase_date: 'Item Purchase Date',
  sales_order_no: 'SO#', accessories: 'Accessories', problem_description: 'Problem / Fault Description', repair_note: 'Note / Repair Summary', status_tag: 'Status Tag',
};

function lineQuantity(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 99_999 ? parsed : null;
}

/**
 * Validates and normalizes structured RMA line items. `requireCompletePairs`
 * is true when the record is (or is becoming) submitted: a replacement unit
 * then needs both New SN and Defective SN. Drafts may hold half a pair.
 */
export function normalizeRmaLineItems(value: unknown, options: { requireCompletePairs: boolean }): LineItemsResult {
  if (!Array.isArray(value)) return { ok: false, error: 'Items must be a list.' };
  if (value.length > MAX_LINE_ITEMS) return { ok: false, error: `Enter at most ${MAX_LINE_ITEMS} items.` };
  const items: NormalizedLineItem[] = [];
  for (const [position, raw] of value.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Each item must be an object.' };
    const entry = raw as Record<string, unknown>;
    const skuSource = entry.sku ?? entry.description;
    if (skuSource !== undefined && skuSource !== null && typeof skuSource !== 'string') return { ok: false, error: 'Item description must be text.' };
    const sku = optionalText(skuSource);
    if (!sku) return { ok: false, error: 'Each item requires a unit description or model.' };
    if (sku.length > 300) return { ok: false, error: 'Item description must be 300 characters or fewer.' };
    const quantity = entry.quantity === undefined || entry.quantity === null || entry.quantity === '' ? 1 : lineQuantity(entry.quantity);
    if (quantity === null) return { ok: false, error: 'Item quantity must be a whole number of at least 1.' };
    let unitType: RmaItemUnitType | null = null;
    if (!blank(entry.unit_type)) {
      if (typeof entry.unit_type !== 'string' || !(RMA_ITEM_UNIT_TYPES as readonly string[]).includes(entry.unit_type.trim())) return { ok: false, error: 'Item unit type must be "Unit" or "Item".' };
      unitType = entry.unit_type.trim() as RmaItemUnitType;
    }
    const text: Record<string, string | null> = {};
    for (const [field, , max] of RMA_ITEM_TEXT_FIELDS) {
      const fieldValue = entry[field];
      if (fieldValue !== undefined && fieldValue !== null && typeof fieldValue !== 'string') return { ok: false, error: `${ITEM_LABELS[field]} must be text.` };
      const trimmed = optionalText(fieldValue);
      if (trimmed && trimmed.length > max && field !== 'purchase_date') return { ok: false, error: `${ITEM_LABELS[field]} must be ${max} characters or fewer.` };
      text[field] = trimmed;
    }
    if (text.purchase_date && !isValidDateOnly(text.purchase_date)) return { ok: false, error: 'Item Purchase Date must be a valid YYYY-MM-DD date.' };
    const single = text.serial_number;
    const fresh = text.new_serial_number;
    const defective = text.defective_serial_number;
    if (single && (fresh || defective)) return { ok: false, error: RMA_SERIAL_MODE_ERROR };
    if (fresh && defective && fresh.toLowerCase() === defective.toLowerCase()) return { ok: false, error: RMA_PAIR_SAME_ERROR };
    if (options.requireCompletePairs && !!fresh !== !!defective) return { ok: false, error: RMA_PAIR_INCOMPLETE_ERROR };
    items.push({
      position, sku, quantity, unitType,
      serialNumber: single, newSerialNumber: fresh, defectiveSerialNumber: defective,
      purchaseDate: text.purchase_date, salesOrderNo: text.sales_order_no, accessories: text.accessories,
      problemDescription: text.problem_description, repairNote: text.repair_note, statusTag: text.status_tag,
    });
  }
  return { ok: true, items };
}

/** Stored LineItem rows in the API input shape, to revalidate them on submission. */
export function lineItemInputFromRow(row: Record<string, any>): Record<string, unknown> {
  const input: Record<string, unknown> = { sku: row.sku, quantity: row.quantity, unit_type: row.unitType ?? null };
  for (const [field, column] of RMA_ITEM_TEXT_FIELDS) input[field] = row[column] ?? null;
  return input;
}

/** Simple non-RMA items keep the historical { sku, quantity } mapping. */
export function nonRmaLineItemsError(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    if (RMA_ITEM_STRUCTURED_FIELDS.some(field => !blank((raw as Record<string, unknown>)[field]))) return NON_RMA_FIELD_ERRORS.line_items;
  }
  return null;
}
export function simpleLineItems(value: unknown[]): { position: number; sku: string; quantity: number }[] {
  return value.map((li: any, position) => ({
    position,
    sku: li?.sku || li?.description || '',
    quantity: typeof li?.quantity === 'number' ? li.quantity : parseInt(li?.quantity, 10) || 1,
  }));
}

/** Non-empty RMA-only fields sent for a non-RMA record. Blank values are ignored. */
export function nonRmaFieldError(body: Record<string, unknown>): string | null {
  if (!blank(body.case_number)) return NON_RMA_FIELD_ERRORS.case_number;
  if (!blank(body.service_slip_no)) return NON_RMA_FIELD_ERRORS.service_slip_no;
  if (!blank(body.client_remarks) || !blank(body.internal_logistics_remarks)) return NON_RMA_FIELD_ERRORS.remarks;
  if (Array.isArray(body.rma_contacts) ? body.rma_contacts.length > 0 : !blank(body.rma_contacts)) return NON_RMA_FIELD_ERRORS.rma_contacts;
  return nonRmaLineItemsError(body.line_items);
}

export interface RmaFormWriteContext {
  /** Effective (stored + submitted) slip category. */
  rmaType: unknown;
  /** True when the record is, or is becoming, submitted. */
  submitted: boolean;
  /** Stored values used to merge partial legacy contact updates and clear a stale SS#. */
  existing?: { serviceSlipNo?: string | null; customerContactName?: string | null; customerContactEmail?: string | null; customerContactPhone?: string | null } | null;
}
export interface RmaFormWrite {
  data: Record<string, string | null>;
  contacts?: NormalizedRmaContact[];
  lineItems?: NormalizedLineItem[];
}

/**
 * Builds the persisted changes for the RMA form fields of a create or edit.
 * Never touches DeliveryRecord.remarks (the workflow reason-for-change).
 */
export function rmaFormWrite(body: Record<string, unknown>, context: RmaFormWriteContext): { ok: true; write: RmaFormWrite } | { ok: false; error: string } {
  const textError = rmaFormTextError(body);
  if (textError) return { ok: false, error: textError };
  const data: Record<string, string | null> = {};
  if (body.case_number !== undefined) data.caseNumber = optionalText(body.case_number);
  if (body.client_remarks !== undefined) data.clientRemarks = optionalText(body.client_remarks);
  if (body.internal_logistics_remarks !== undefined) data.internalLogisticsRemarks = optionalText(body.internal_logistics_remarks);
  if (body.service_slip_no !== undefined) {
    const slipError = rmaServiceSlipError(context.rmaType, body.service_slip_no);
    if (slipError) return { ok: false, error: slipError };
    data.serviceSlipNo = optionalText(body.service_slip_no);
  } else if (context.existing?.serviceSlipNo && !isReturnToCustomerCategory(context.rmaType)) {
    // A legacy record moving off RTC drops its SS# instead of violating the RTC-only rule.
    data.serviceSlipNo = null;
  }
  const write: RmaFormWrite = { data };
  if (body.rma_contacts !== undefined) {
    const result = normalizeRmaContacts(body.rma_contacts);
    if (result.ok === false) return { ok: false, error: result.error };
    write.contacts = result.contacts;
    Object.assign(data, syncLegacyContactSnapshot(result.contacts));
  } else if (RMA_CONTACT_FIELDS.some(field => body[field] !== undefined)) {
    const existing = context.existing ?? {};
    const pick = (field: typeof RMA_CONTACT_FIELDS[number], stored: string | null | undefined) => body[field] !== undefined ? optionalText(body[field]) : (stored ?? null);
    const name = pick('customer_contact_name', existing.customerContactName);
    const email = pick('customer_contact_email', existing.customerContactEmail);
    const phone = pick('customer_contact_phone', existing.customerContactPhone);
    Object.assign(data, { customerContactName: name, customerContactEmail: email, customerContactPhone: phone });
    write.contacts = contactsFromLegacySnapshot(name, email, phone);
  }
  if (Array.isArray(body.line_items)) {
    const result = normalizeRmaLineItems(body.line_items, { requireCompletePairs: context.submitted });
    if (result.ok === false) return { ok: false, error: result.error };
    write.lineItems = result.items;
  } else if (body.line_items !== undefined && body.line_items !== null) {
    return { ok: false, error: 'Items must be a list.' };
  }
  return { ok: true, write };
}

/** Stored replacement pairs must be complete before an RMA leaves Draft. */
export function storedLineItemsPairError(rows: ReadonlyArray<{ newSerialNumber?: string | null; defectiveSerialNumber?: string | null }>): string | null {
  return rows.some(row => !!optionalText(row.newSerialNumber) !== !!optionalText(row.defectiveSerialNumber)) ? RMA_PAIR_INCOMPLETE_ERROR : null;
}
