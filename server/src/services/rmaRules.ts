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
