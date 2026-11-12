import React from 'react';

// Keep the client projection independent of server JSON and never render unknown
// keys. The server also checks current access before supplying these values.
const fields: Record<string, readonly string[]> = {
  DeliveryRecord: ['company_name', 'reference', 'rma_reference', 'priority', 'status', 'category', 'delivery_date', 'driver', 'vehicle', 'area', 'address',
    'account_manager', 'item_type', 'item_description', 'is_draft', 'remarks', 'time_in', 'time_out', 'received_by', 'amount',
    'collection_verified', 'collection_verified_by', 'collection_verified_at', 'rma_type', 'rma_movement', 'rma_transport_status',
    'rma_received_at', 'rma_recipient', 'rma_completed_at', 'attachment', 'attachment_id', 'attachment_removed', 'line_items'],
  Customer: ['name', 'contactPerson', 'contact_person', 'email', 'phone', 'address', 'city', 'remarks'],
  Supplier: ['name', 'contactPerson', 'contact_person', 'email', 'phone', 'address', 'city', 'category', 'categories'],
  SupplierCategory: ['name', 'is_active', 'version'],
  Driver: ['name', 'type', 'coverageAreas', 'isActive'],
  SKU: ['skuCode', 'name', 'category', 'unitCost', 'unitPrice', 'reorderPoint', 'description', 'warehouseLocation', 'onHandQty', 'allocatedQty', 'sku_code', 'unit_cost', 'unit_price', 'reorder_point', 'on_hand_qty', 'adjustment_type', 'qty_change', 'reference', 'inventory_warehouse_location', 'inventory_on_hand_qty', 'inventory_allocated_qty'],
  Product: ['skuCode', 'name', 'category', 'unitCost', 'unitPrice', 'reorderPoint', 'description'],
  InventoryTransaction: ['date', 'type', 'qtyChange', 'resultingBalance', 'reference'],
  User: ['name', 'email', 'role', 'isActive', 'microsoft_linked'],
};
function display(value: unknown, key: string): string {
  if (value == null) return 'none';
  if (key === 'categories' && Array.isArray(value)) return value.map(item => item && typeof item === 'object'
    && typeof item.name === 'string' ? `${item.name} (${typeof item.id === 'string' ? item.id : ''})` : '').join('; ') || 'none';
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (key === 'line_items' && Array.isArray(value)) return value.map(item => item && typeof item === 'object'
    ? `${typeof item.sku === 'string' ? item.sku : ''} × ${typeof item.quantity === 'number' ? item.quantity : ''}` : '').join('; ');
  return 'unavailable';
}
export function businessAuditChanges(recordType: string, previous?: Record<string, unknown> | null, next?: Record<string, unknown> | null) {
  return (Array.isArray(fields[recordType]) ? fields[recordType] : []).flatMap(field => {
    const before = display(previous?.[field], field), after = display(next?.[field], field);
    return before === after ? [] : [{ field, before, after }];
  });
}
export default function BusinessAuditDiff({ recordType, previous, next }: { recordType: string; previous?: Record<string, unknown> | null; next?: Record<string, unknown> | null }) {
  const changes = businessAuditChanges(recordType, previous, next);
  if (!changes.length) return null;
  return <details className="text-xs mt-2"><summary className="cursor-pointer">Record changes ({changes.length})</summary>
    <ul className="space-y-1 mt-2">{changes.map(change => <li className="break-words" key={change.field}>
      {change.field.replace(/_/g, ' ')}: {change.before} → {change.after}
    </li>)}</ul></details>;
}
