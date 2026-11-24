import { isValidDateOnly, isoTimestamp, manilaToday } from './deliveryLifecycle';

export const RMA_CATEGORIES = [
  'Sales Orders', 'Return to Customer', 'Return to Supplier', 'Pull-Out Slip',
  'Advance Replacement Demo', 'Pick-Up', 'Others',
] as const;
export const RMA_ITEM_TYPES = ['Small Item', 'Unit'] as const;
export const RMA_CONTACT_FIELDS = ['customer_contact_name', 'customer_contact_email', 'customer_contact_phone'] as const;
const categories = new Set<string>(RMA_CATEGORIES);

/** Keep earlier stored labels readable without rewriting existing records. */
export function normalizeRmaCategory(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === 'Pull out') return 'Pull-Out Slip';
  if (value === 'Return to suppliers') return 'Return to Supplier';
  return value;
}

export function rmaInputError(body: Record<string, any>, requireComplete = false): string | null {
  for (const [field, label] of [['priority', 'Priority'], ['area', 'Area'], ['account_manager', 'Account Manager']]) {
    if ((requireComplete || field in body) && (typeof body[field] !== 'string' || !body[field].trim())) return `${label} is required.`;
  }
  if (body.priority !== undefined && !['1 - Low', '2 - Moderate', '3 - High'].includes(body.priority)) return 'Invalid record priority.';
  if (body.rma_reference !== undefined && body.rma_reference !== null && typeof body.rma_reference !== 'string') return 'Reference must be text.';
  if (body.rma_type !== undefined && body.rma_type !== null && body.rma_type !== '' &&
      (typeof body.rma_type !== 'string' || !categories.has(normalizeRmaCategory(body.rma_type)!))) {
    return `Category must be one of: ${RMA_CATEGORIES.join(', ')}.`;
  }
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
