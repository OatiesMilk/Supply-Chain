import { formatManilaTimestamp } from '@/utils/manilaTimestamp';

// entry.previous_value / entry.new_value are full record snapshots (see
// server writeAuditLog calls), so a "diff" means comparing the two objects
// key by key rather than parsing a pre-computed delta.

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  driver: 'Driver',
  delivery_date: 'Delivery Date',
  vehicle: 'Vehicle',
  driver_assistants: 'Driver Assistants',
  time_in: 'Time In',
  time_out: 'Time Out',
  received_by: 'Received By',
  remarks: 'Remarks',
  priority: 'Priority',
  area: 'Area',
  address: 'Address',
  company_name: 'Company',
  amount: 'Amount',
  collection_verified: 'Collection Verified',
  collection_verified_by: 'Verified By',
  collection_verified_at: 'Verified At',
  account_manager: 'Account Manager',
  reference: 'Reference',
  item_type: 'Item Type',
  item_description: 'Item Description',
  is_draft: 'Draft',
  rma_reference: 'RMA Document Reference',
  legacy_sap_reference: 'Legacy SAP Reference',
  rma_type: 'RMA Category',
  is_internal_transfer: 'Non-RMA Internal Transfer',
  rma_movement: 'Movement method',
  rma_transport_status: 'Transport status',
  rma_transport_started_at: 'Transport started',
  rma_transport_completed_at: 'Transport completed',
  rma_transport_received_by: 'Transport received by',
  rma_received_at: 'Physical receipt confirmed',
  rma_received_by: 'Receipt confirmed by',
  rma_recipient: 'Recipient',
  rma_completed_at: 'RMA completed',
  purchase_date: 'Purchase Date',
  customer_contact_name: 'Customer Contact Name',
  customer_contact_email: 'Customer Contact Email',
  customer_contact_phone: 'Customer Contact Phone',
  line_items: 'Line Items',
  case_number: 'Case Number',
  service_slip_no: 'Service Slip (SS#)',
  client_remarks: 'Client Slip Remarks',
  internal_logistics_remarks: 'Internal Logistics Notes',
  rma_contacts: 'Contact Person(s)',
};

// Structured RMA item fields, compared and shown when present.
const STRUCTURED_ITEM_FIELDS = ['unit_type', 'serial_number', 'new_serial_number', 'defective_serial_number', 'purchase_date',
  'sales_order_no', 'accessories', 'problem_description', 'repair_note', 'status_tag'] as const;
const ITEM_FIELD_LABELS: Record<string, string> = {
  serial_number: 'SN', new_serial_number: 'New SN', defective_serial_number: 'Defective SN', purchase_date: 'Purchased',
  sales_order_no: 'SO', accessories: 'Accessories', problem_description: 'Problem', repair_note: 'Note', status_tag: 'Tag',
};

// Beyond the explicitly-listed skip fields, also drop audit meta-fields
// (created_by/modified_by/modified_at) since they duplicate what the entry's
// own header already shows (changed_by + timestamp), and internal/output-action
// flags that are not simple user-editable fields.
export const AUDIT_SKIP_FIELDS = new Set([
  'id',
  'company_id',
  'customer_id',
  'created_by_id',
  'created_at',
  'updated_at',
  'created_by',
  'modified_by',
  'modified_at',
  'document_attachment',
  'attachments',
  'output_actions_log',
  'email_notification_sent',
  'rma_version',
  'rma_received_by',
  'linked_collection',
  'linked_collection_id',
]);

export interface AuditDiffRow {
  label: string;
  oldVal: unknown;
  newVal: unknown;
  hasOld: boolean;
}

function shouldSkipAuditField(key: string): boolean {
  return AUDIT_SKIP_FIELDS.has(key) || key.endsWith('_id') || key.toLowerCase().includes('cmrx');
}

function auditFieldLabel(key: string): string {
  if (AUDIT_FIELD_LABELS[key]) return AUDIT_FIELD_LABELS[key];
  return key
    .split('_')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function isEmptyAuditValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

export function formatAuditValue(v: unknown): string {
  if (isEmptyAuditValue(v)) return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))) {
    return formatManilaTimestamp(v);
  }
  if (Array.isArray(v)) {
    if (v.every(item => typeof item === 'string' || typeof item === 'number')) return v.join(', ');
    const formatted = v
      .map(item => {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          const sku = obj.sku || obj.description;
          const qty = obj.quantity;
          if (sku !== undefined && qty !== undefined) {
            const unit = typeof obj.unit_type === 'string' && obj.unit_type ? ` ${obj.unit_type}` : '';
            const details = STRUCTURED_ITEM_FIELDS.filter(field => field !== 'unit_type' && typeof obj[field] === 'string' && obj[field])
              .map(field => `${ITEM_FIELD_LABELS[field]}: ${String(obj[field])}`);
            return `${String(sku)} × ${String(qty)}${unit}${details.length ? ` (${details.join('; ')})` : ''}`;
          }
          if (sku !== undefined) return String(sku);
          if (typeof obj.name === 'string') return [obj.name, obj.phone, obj.email].filter(value => typeof value === 'string' && value).join(' - ');
        }
        return typeof item === 'object' ? JSON.stringify(item) : String(item);
      })
      .filter(Boolean);
    return formatted.length > 0 ? formatted.join(', ') : '—';
  }
  if (typeof v === 'object' && v !== null) {
    const obj = v as Record<string, unknown>;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.reference === 'string') return obj.reference;
    try {
      return JSON.stringify(v);
    } catch {
      return '—';
    }
  }
  return String(v);
}

function normalizeAuditForDiff(key: string, v: unknown): unknown {
  if (key === 'line_items' && Array.isArray(v)) {
    return v.map(item => {
      const obj = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {};
      const sku = typeof obj.sku === 'string'
        ? obj.sku
        : typeof obj.description === 'string'
          ? obj.description
          : '';
      const quantity = typeof obj.quantity === 'number'
        ? obj.quantity
        : parseInt(String(obj.quantity ?? ''), 10) || 1;
      const structured = Object.fromEntries(STRUCTURED_ITEM_FIELDS.filter(field => typeof obj[field] === 'string' && obj[field]).map(field => [field, obj[field]]));
      return { sku, quantity, ...structured };
    });
  }
  if (key === 'rma_contacts' && Array.isArray(v)) {
    return v.map(item => {
      const obj = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {};
      return { name: obj.name ?? '', phone: obj.phone ?? null, email: obj.email ?? null };
    });
  }
  return v;
}

export function diffAuditEntry(oldVal: unknown, newVal: unknown): AuditDiffRow[] {
  if (!newVal || typeof newVal !== 'object') return [];
  const newObj = newVal as Record<string, unknown>;
  const oldObj = oldVal && typeof oldVal === 'object' ? (oldVal as Record<string, unknown>) : null;
  const rows: AuditDiffRow[] = [];

  if (oldObj) {
    const keys = Array.from(new Set([...Object.keys(newObj), ...Object.keys(oldObj)]));
    for (const key of keys) {
      if (shouldSkipAuditField(key)) continue;
      const ov = oldObj[key];
      const nv = newObj[key];
      if (JSON.stringify(normalizeAuditForDiff(key, ov)) === JSON.stringify(normalizeAuditForDiff(key, nv))) {
        continue;
      }
      rows.push({ label: auditFieldLabel(key), oldVal: ov, newVal: nv, hasOld: true });
    }
  } else {
    for (const key of Object.keys(newObj)) {
      if (shouldSkipAuditField(key)) continue;
      const nv = newObj[key];
      if (isEmptyAuditValue(nv)) continue;
      rows.push({ label: auditFieldLabel(key), oldVal: undefined, newVal: nv, hasOld: false });
    }
  }
  return rows;
}
