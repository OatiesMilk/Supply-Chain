import { isValidDateOnly } from './deliveryLifecycle';

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
