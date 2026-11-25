import type { DeliveryRecord, RmaMovement } from '../types';
import { formatRmaItemQty, rmaItemBlocks } from './rmaItems';

export type RmaMovementTone = 'route' | 'supplier' | 'internal' | 'none';

export interface RmaMovementBadge {
  label: 'Logistics Route' | 'Supplier Collection' | 'Internal Printing' | 'Unspecified';
  fullLabel: string;
  tone: RmaMovementTone;
}

/** Readable Movement Method label for the RMA table and Daily Route Slip grouping. */
export function formatRmaMovementBadge(movement: RmaMovement | string | null | undefined): RmaMovementBadge {
  switch (movement) {
    case 'LOGISTICS_TRANSPORT': return { label: 'Logistics Route', fullLabel: 'Logistics Route (Logistics transport)', tone: 'route' };
    case 'SUPPLIER_COLLECTION': return { label: 'Supplier Collection', fullLabel: 'Supplier Collection', tone: 'supplier' };
    case 'INTERNAL_NO_DRIVER': return { label: 'Internal Printing', fullLabel: 'Internal Printing (Internal / no driver)', tone: 'internal' };
    default: return { label: 'Unspecified', fullLabel: 'Movement method not set', tone: 'none' };
  }
}

/** Options for the RMA Movement Method filter, mapped to the canonical enum values. */
export const RMA_MOVEMENT_FILTER_OPTIONS: ReadonlyArray<{ value: '' | RmaMovement; label: string }> = [
  { value: '', label: 'All Movement Methods' },
  { value: 'LOGISTICS_TRANSPORT', label: 'Logistics Route (Logistics transport)' },
  { value: 'SUPPLIER_COLLECTION', label: 'Supplier Collection' },
  { value: 'INTERNAL_NO_DRIVER', label: 'Internal Printing (Internal / no driver)' },
];

type PreviewSource = Pick<DeliveryRecord, 'item_description'> & Partial<Pick<DeliveryRecord, 'line_items' | 'purchase_date'>>;

function serialSummary(item: NonNullable<DeliveryRecord['line_items']>[number]): string {
  const fresh = (item.new_serial_number ?? '').trim(), defective = (item.defective_serial_number ?? '').trim(), single = (item.serial_number ?? '').trim();
  if (fresh || defective) return [fresh && `New SN: ${fresh}`, defective && `Defective SN: ${defective}`].filter(Boolean).join(' / ');
  return single ? `SN: ${single}` : '';
}

/**
 * Concise 1–2 line summary for the RMA table: the first item with its serials,
 * "+N more" for further items, or the legacy description.
 */
export function formatRmaTableItemPreview(record: PreviewSource): string {
  const items = (record.line_items ?? []).filter(item => (item.sku ?? '').trim());
  if (items.length) {
    const [first] = items;
    const lead = [formatRmaItemQty(first), first.sku.trim()].filter(Boolean).join(' ');
    const serials = serialSummary(first);
    const more = items.length > 1 ? ` (+${items.length - 1} more)` : '';
    return `${lead}${serials ? ` · ${serials}` : ''}${more}`;
  }
  return (record.item_description ?? '').trim();
}

/** Full multi-line tooltip text for the Item Description cell. */
export function rmaTableItemTooltip(record: PreviewSource): string {
  return rmaItemBlocks(record)
    .map(block => [block.qty, ...block.lines.map(line => line.text)].filter(Boolean).join('\n'))
    .join('\n\n');
}
