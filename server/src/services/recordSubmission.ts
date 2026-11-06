import { isValidDateOnly } from './deliveryLifecycle';

/** Validate the final persisted state at every non-RMA submission entry point. */
export function recordSubmissionError(record: { category: string; reference?: unknown; deliveryDate?: unknown }): string | null {
  // RMA has its own movement-specific submission rules.
  if (record.category === 'RMA') return null;
  if (typeof record.reference !== 'string' || !record.reference.trim()) return 'Reference is required to submit the record.';
  if (!record.deliveryDate) return 'Delivery Date is required';
  if (!isValidDateOnly(record.deliveryDate)) return 'Delivery Date must be a valid YYYY-MM-DD date.';
  return null;
}
