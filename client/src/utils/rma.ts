export const RMA_CATEGORIES = [
  'Sales Orders',
  'Return to Customer',
  'Return to Supplier',
  'Pull-Out Slip',
  'Advance Replacement Demo',
  'Pick-Up',
  'Others',
] as const;

export type RmaCategory = (typeof RMA_CATEGORIES)[number];

/** Auto Fill must never invent or replace a manually supplied RMA reference. */
export function autoFillRmaFields(currentReference: string, categoryIndex: number) {
  const index = Number.isFinite(categoryIndex) ? Math.max(0, Math.min(RMA_CATEGORIES.length - 1, Math.floor(categoryIndex))) : 0;
  return { reference: currentReference, rma_type: RMA_CATEGORIES[index] };
}
