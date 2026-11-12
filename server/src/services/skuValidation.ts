/** Shared validation for SKU creation and partial catalog updates. */
export function skuInputError(b: Record<string, unknown>, partial = false): string | null {
  for (const key of ['sku_code', 'name']) {
    if ((!partial || b[key] !== undefined) && (typeof b[key] !== 'string' || !(b[key] as string).trim())) return 'SKU code and name are required.';
  }
  if ((!partial || b.category !== undefined) && !['A', 'B', 'C'].includes(b.category as string)) return 'Category must be A, B, or C.';
  for (const key of ['unit_cost', 'unit_price', 'reorder_point']) {
    if (partial && b[key] === undefined) continue;
    const raw = b[key];
    const value = (typeof raw === 'number' || (typeof raw === 'string' && raw.trim())) ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < 0 || (key === 'reorder_point' && (!Number.isInteger(value) || value > 2147483647))) {
      return 'Cost and price must be finite non-negative numbers; reorder point must be a non-negative whole number.';
    }
  }
  for (const key of ['description', 'warehouse_location']) {
    if (b[key] !== undefined && typeof b[key] !== 'string') return `${key} must be text.`;
  }
  return null;
}
