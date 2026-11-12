import { prisma } from '../db';
import type { AuthUser } from '../middleware/auth';
import { recordScope } from './recordAccess';
import { hasActionPermission } from './permissionEvaluator';

// Explicit business fields only. Relations, linked-record identifiers, storage
// keys, passwords and provider identities are intentionally absent.
export const BUSINESS_AUDIT_FIELDS: Record<string, readonly string[]> = {
  DeliveryRecord: ['company_name', 'reference', 'rma_reference', 'priority', 'status', 'category', 'delivery_date', 'driver', 'vehicle',
    'area', 'address', 'account_manager', 'item_type', 'item_description', 'is_draft', 'remarks', 'time_in', 'time_out', 'received_by',
    'amount', 'collection_verified', 'collection_verified_by', 'collection_verified_at', 'rma_type', 'rma_movement', 'rma_transport_status',
    'rma_received_at', 'rma_recipient', 'rma_completed_at', 'attachment', 'attachment_id', 'attachment_removed', 'line_items'],
  Customer: ['name', 'contactPerson', 'contact_person', 'email', 'phone', 'address', 'city', 'remarks'],
  Supplier: ['name', 'contactPerson', 'contact_person', 'email', 'phone', 'address', 'city', 'category', 'categories'],
  SupplierCategory: ['name', 'is_active', 'version'],
  Company: ['name', 'sap_number', 'address', 'contact_person', 'default_account_manager', 'is_active', 'version'],
  AccountManager: ['name', 'email', 'linked_user', 'is_active', 'version'],
  Driver: ['name', 'type', 'coverageAreas', 'isActive'],
  SKU: ['skuCode', 'name', 'category', 'unitCost', 'unitPrice', 'reorderPoint', 'description', 'warehouseLocation', 'onHandQty', 'allocatedQty', 'sku_code', 'unit_cost', 'unit_price', 'reorder_point', 'on_hand_qty', 'adjustment_type', 'qty_change', 'reference', 'inventory_warehouse_location', 'inventory_on_hand_qty', 'inventory_allocated_qty'],
  Product: ['skuCode', 'name', 'category', 'unitCost', 'unitPrice', 'reorderPoint', 'description'],
  InventoryTransaction: ['date', 'type', 'qtyChange', 'resultingBalance', 'reference'],
  User: ['name', 'email', 'role', 'isActive', 'microsoft_linked'],
};
const RESOURCES: Record<string, string> = { Customer: 'customers', Supplier: 'suppliers', SupplierCategory: 'suppliers', Company: 'companies', AccountManager: 'admin', Driver: 'drivers', SKU: 'skus',
  Product: 'skus', InventoryTransaction: 'skus', User: 'admin' };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function safeBusinessAudit(recordType: string, value: string | null): Record<string, unknown> | null {
  if (!value || !Array.isArray(BUSINESS_AUDIT_FIELDS[recordType])) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!object(parsed)) return null;
    const safe: Record<string, unknown> = {};
    for (const key of BUSINESS_AUDIT_FIELDS[recordType]) {
      const field = parsed[key];
      if (recordType === 'Supplier' && key === 'categories' && Array.isArray(field)) safe[key] = field.filter(object).map(item => ({
        ...(typeof item.id === 'string' ? { id: item.id } : {}),
        ...(typeof item.name === 'string' ? { name: item.name } : {}),
      }));
      if (field === null || typeof field === 'string' || typeof field === 'boolean' || typeof field === 'number' && Number.isFinite(field)) safe[key] = field;
      if (key === 'line_items' && Array.isArray(field)) safe[key] = field.filter(object).map(item => ({
        ...(typeof item.sku === 'string' ? { sku: item.sku } : {}),
        ...(typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? { quantity: item.quantity } : {}),
      }));
    }
    if (recordType === 'SKU' && object(parsed.inventory)) {
      for (const key of ['warehouse_location', 'on_hand_qty', 'allocated_qty']) {
        const field = parsed.inventory[key];
        if (typeof field === 'string' || typeof field === 'number' && Number.isFinite(field)) safe[`inventory_${key}`] = field;
      }
    }
    return Object.keys(safe).length ? safe : null;
  } catch { return null; }
}

/** Current permission/record checks precede disclosure of historic business
 * values. No old assignment or linked object in stored JSON can grant access. */
export async function visibleBusinessAuditSnapshots(entries: Array<{ recordId: string; recordType: string; previousValue: string | null; newValue: string | null }>, user: AuthUser) {
  const ids = [...new Set(entries.filter(entry => entry.recordType === 'DeliveryRecord').map(entry => entry.recordId))];
  const readable = ids.length ? await prisma.deliveryRecord.findMany({
    where: { id: { in: ids }, deletedAt: null, AND: [recordScope(user)] }, select: { id: true },
  }) : [];
  const allowedIds = new Set(readable.map(row => row.id));
  return entries.map(entry => {
    const resource = RESOURCES[entry.recordType];
    const allowed = entry.recordType === 'DeliveryRecord' ? allowedIds.has(entry.recordId)
      : !!resource && (user.activeMode === 'V1' ? !!user.snapshot && hasActionPermission(user.snapshot, 'RESOURCE', resource, 'READ') : user.resources.includes(resource as typeof user.resources[number]));
    return { previous: allowed ? safeBusinessAudit(entry.recordType, entry.previousValue) : null,
      next: allowed ? safeBusinessAudit(entry.recordType, entry.newValue) : null };
  });
}
