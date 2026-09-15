/**
 * Microgenesis Supply Chain Portal - Type Definitions
 */

// --- Shared audit trail fields, present on every record in every module ---
export interface AuditFields {
  created_by: string;
  created_at: string; // ISO timestamp
  modified_by: string;
  modified_at: string; // ISO timestamp
}

export interface Product extends AuditFields {
  id: string;
  sku_code: string;
  name: string;
  category: 'A' | 'B' | 'C'; // A = High Value, B = Medium Value, C = Low Value / Consumables
  unit_cost: number;
  unit_price: number;
  reorder_point: number;
  description: string;
}

export interface InventoryItem {
  product_id: string;
  warehouse_location: string; // bin location like A-01, B-04
  on_hand_qty: number;
  allocated_qty: number;
}

export type TransactionType = 'Goods Receipt' | 'Sale' | 'Adjustment' | 'Transfer';

export interface InventoryTransaction {
  id: string;
  product_id: string;
  date: string;
  type: TransactionType;
  qty_change: number;
  resulting_balance: number;
  reference: string; // e.g., PO-1002, SO-2041, ADJ-882
}

export interface Customer extends AuditFields {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
}

// --- The real AS-IS system: ONE unified list of delivery/task records.       ---
// --- "Category" distinguishes Sales Orders / Deliveries / RMA / Accounting  ---
// --- Collection / Procurement Pick-up. All 4 sidebar "operations" screens   ---
// --- are simply filtered views over this same record list.                 ---

export type DeliveryCategory =
  | 'Sales Orders'
  | 'Deliveries'
  | 'RMA'
  | 'Accounting Collection'
  | 'Procurement Pick-up';

// Confirmed exact status labels
export type DeliveryStatus = 'Scheduled' | 'Delivered' | 'On-Hold' | 'Rescheduled' | 'Pending';

export type PriorityLevel = '1 - Low' | '2 - Moderate' | '3 - High';

export type ItemType = 'Small Item' | 'Medium Item' | 'Large / Pallet';

// --- IPO framework: every major process output gets a configurable "leave the
// --- system" option. Six key status-change events can trigger outputs; each
// --- has its own independently configurable set of channels.
export type OutputActionTrigger =
  | 'Record Created'
  | 'Accomplished'
  | 'Rescheduled'
  | 'On-Hold'
  | 'RMA Completed'
  | 'Collection Verified';

export interface OutputActionConfig {
  notifyAM: boolean;
  notifyLogistics: boolean;
  notifyTASS: boolean;
  exportPDF: boolean;
  internalOnly: boolean; // when true, suppresses all of the above
}

export interface OutputActionLogEntry {
  trigger: OutputActionTrigger;
  message: string;
  at: string; // ISO timestamp
}

export interface DeliveryRecord extends AuditFields {
  id: string; // e.g., REC-4001
  company_name: string; // validated lookup value, matches a Customer.name
  customer_id: string; // link back to Customer master
  priority: PriorityLevel;
  reference: string; // SAP number
  remarks: string;
  status: DeliveryStatus;
  vehicle: string;
  area: string;
  driver: string;
  driver_assistants: string[];
  time_in?: string | null;
  time_out?: string | null;
  received_by?: string | null;
  account_manager: string;
  delivery_date: string; // date, YYYY-MM-DD
  category: DeliveryCategory;
  item_type: ItemType;
  is_draft: 'Yes' | 'No';
  date_time: string; // separate date+time field, ISO datetime
  item_description: string;
  attachments: string[]; // mock file names only
  email_notification_sent: boolean;
  output_actions_log: OutputActionLogEntry[]; // full history of fired output actions
  // Collection verification (TASS action on Accounting Collection records)
  collection_verified?: boolean;
  collection_verified_by?: string | null;
  collection_verified_at?: string | null;
  amount?: number | null; // Philippine Peso — required for Accounting Collection, null for others
  address?: string;
  // Linked Accounting Collection record (set by Logistics/Admin)
  linked_collection_id?: string | null;
  linked_collection?: {
    id: string;
    reference: string;
    company_name: string;
    status: string;
    collection_verified: boolean;
  } | null;
}

// --- Supplier master record ---
export interface Supplier extends AuditFields {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  category: 'Hardware' | 'Consumables' | 'Electronics' | 'Packaging' | 'Services';
}

// --- Warehouse location master record ---
export interface WarehouseLocation {
  bin_code: string;       // e.g. BIN-A01
  zone: string;           // e.g. A, B, C
  description: string;
}

// --- Role-based access: 3 operational roles + Admin + Driver ---
export type UserRole = 'Sales Coordinator' | 'Logistics' | 'TASS' | 'Admin' | 'Driver';
