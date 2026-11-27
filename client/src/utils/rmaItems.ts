import type { RecordLineItem, RmaItemUnitType } from '../types';

export const RMA_ITEM_UNIT_TYPES: readonly RmaItemUnitType[] = ['Unit', 'Item'];
export const RMA_STATUS_TAG_PRESETS = ['For Pull Out', 'For Pick Up', 'For Return', 'UNIT REPAIRED/FOR DELIVERY'] as const;

const STRUCTURED_FIELDS = ['unit_type', 'serial_number', 'new_serial_number', 'defective_serial_number', 'purchase_date',
  'sales_order_no', 'accessories', 'problem_description', 'repair_note', 'status_tag'] as const;

const text = (value: string | null | undefined) => (value ?? '').trim();

/** True when the item carries any structured RMA unit field. */
export function isStructuredRmaItem(item: RecordLineItem): boolean {
  return STRUCTURED_FIELDS.some(field => !!text(item[field] as string | null | undefined));
}

/** "1Unit" / "1Item"; legacy items without a unit type read "x2". */
export function formatRmaItemQty(item: Pick<RecordLineItem, 'quantity' | 'unit_type'>): string {
  return item.unit_type ? `${item.quantity}${item.unit_type}` : `x${item.quantity}`;
}

/** YYYY-MM-DD as MM/DD/YYYY; other text is returned unchanged. */
export function formatSlipDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
  return match ? `${match[2]}/${match[3]}/${match[1]}` : text(value);
}

export function formatRmaPurchaseAndSo(purchaseDate: string | null | undefined, salesOrderNo: string | null | undefined): string {
  const parts = [text(purchaseDate) ? `Date of Purchase: ${formatSlipDate(purchaseDate)}` : '', text(salesOrderNo) ? `SO: ${text(salesOrderNo)}` : ''];
  return parts.filter(Boolean).join(' - ');
}

export interface RmaItemLine { text: string; bold?: boolean }

/** Stacked description lines for one item; the status tag line is bold and quoted. */
export function formatRmaItemLines(item: RecordLineItem): RmaItemLine[] {
  const lines: RmaItemLine[] = [{ text: text(item.sku) }];
  if (text(item.serial_number)) lines.push({ text: `Serial Number: ${text(item.serial_number)}` });
  if (text(item.new_serial_number)) lines.push({ text: `New SN: ${text(item.new_serial_number)}` });
  if (text(item.defective_serial_number)) lines.push({ text: `Defective SN: ${text(item.defective_serial_number)}` });
  const purchase = formatRmaPurchaseAndSo(item.purchase_date, item.sales_order_no);
  if (purchase) lines.push({ text: purchase });
  if (text(item.accessories)) lines.push({ text: `Accessories: ${text(item.accessories)}` });
  if (text(item.problem_description)) lines.push({ text: `Problem: ${text(item.problem_description)}` });
  if (text(item.repair_note)) lines.push({ text: `Note: ${text(item.repair_note)}` });
  if (text(item.status_tag)) lines.push({ text: `"${text(item.status_tag)}"`, bold: true });
  return lines.filter(line => line.text);
}

export interface RmaItemBlock { qty: string; lines: RmaItemLine[] }

/** Item blocks for an RMA, falling back to the legacy description and purchase date. */
export function rmaItemBlocks(record: { line_items?: RecordLineItem[] | null; item_description?: string | null; purchase_date?: string | null }): RmaItemBlock[] {
  const items = (record.line_items ?? []).filter(item => text(item.sku) || isStructuredRmaItem(item));
  if (items.length) return items.map(item => ({ qty: formatRmaItemQty(item), lines: formatRmaItemLines(item) }));
  const description = text(record.item_description);
  if (!description && !text(record.purchase_date)) return [];
  const lines: RmaItemLine[] = description ? [{ text: description }] : [];
  if (text(record.purchase_date)) lines.push({ text: formatRmaPurchaseAndSo(record.purchase_date, null) });
  return [{ qty: '', lines }];
}

/** Plain-text summary of all items, for exports and compact views. */
export function formatRmaItemsSummary(record: Parameters<typeof rmaItemBlocks>[0]): string {
  return rmaItemBlocks(record).map(block => [block.qty, block.lines.map(line => line.text).join('; ')].filter(Boolean).join(' ')).join('\n');
}

/** Client-side mirror of the server item rules. `submitted` requires complete replacement pairs. */
export function rmaLineItemErrors(items: readonly RecordLineItem[], submitted: boolean): string | null {
  for (const item of items) {
    if (!text(item.sku)) return 'Each item requires a unit description or model.';
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return 'Item quantity must be a whole number of at least 1.';
    if (item.unit_type && !RMA_ITEM_UNIT_TYPES.includes(item.unit_type)) return 'Item unit type must be "Unit" or "Item".';
    const single = text(item.serial_number), fresh = text(item.new_serial_number), defective = text(item.defective_serial_number);
    if (single && (fresh || defective)) return 'Use either a single Serial Number or a Replacement Unit pair (New SN + Defective SN), not both.';
    if (fresh && defective && fresh.toLowerCase() === defective.toLowerCase()) return 'New SN and Defective SN must be different.';
    if (submitted && !!fresh !== !!defective) return 'Replacement unit items must include both New SN and Defective SN.';
    if (text(item.purchase_date) && !/^\d{4}-\d{2}-\d{2}$/.test(text(item.purchase_date))) return 'Item Purchase Date must be a valid YYYY-MM-DD date.';
  }
  return null;
}
