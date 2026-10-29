# Client payload types and server serialization

Pinned merged source: `8660bdee15b502867716ca0c60683965c6cd87f6`. These are source declarations, not runtime validators. Server routes/serializers take precedence over permissive or outdated client types. Dates become JSON strings on the wire. `unknown`/`any` indicate a contract gap, not permission to assert arbitrary fields.

## client/src/api/index.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/api/index.ts).

```ts
export interface RecordActiveCounts {
  deliveries: number;
  rma: number;
  sales_orders: number;
  accounting_collection: number;
  procurement_pickup: number;
}
```

```ts
export interface RecordListFilters {
  company_id?: string;
  category?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  dateSort?: 'default' | 'nearest' | 'oldest' | 'furthest';
  search?: string;
  driver?: string;
  area?: string;
  region?: string;
  subregion?: string;
  account_manager?: string;
  priority?: string;
  dashboard_filter?: string;
  limit?: number;
  cursor?: string;
  page?: number;
  paged?: boolean;
}
```

```ts
export interface PagedRecordResponse {
  rows: any[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  page: number;
  limit: number;
}
```

```ts
export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: 'SALES_COORDINATOR' | 'LOGISTICS' | 'TASS' | 'ADMIN' | 'DRIVER';
  permissions: { screen: string; granted: boolean }[];
  effectiveScreens: string[];
  resources: string[];
  permissionVersion: string;
}
```

```ts
export interface ApiPermissionEditor {
  userId: string;
  permissions: { screen: string; granted: boolean }[];
  effectiveScreens: string[];
  resources: string[];
  permissionVersion: string;
  roleDefaults: string[];
  catalog: { screen: string; label: string }[];
  editableScreens: string[];
}
```

```ts
export interface ApiUserAdmin {
  id: string;
  name: string;
  email: string;
  role: 'SALES_COORDINATOR' | 'LOGISTICS' | 'TASS' | 'ADMIN' | 'DRIVER';
  is_active: boolean;
  microsoft_linked: boolean;
  created_at: string;
  driver_profile?: { id: string; name: string } | null; // DRIVER logins: the linked Driver profile
}
```

```ts
export interface ApiIntegrationStatus {
  azure_sso: { configured: boolean; tenant: string | null; redirect_uri: string | null };
  email: { method: 'graph' | 'smtp' | 'mock'; smtp_host: string | null; from: string | null };
  users: { total: number; active: number; microsoft_linked: number };
  app_url: string;
  node_env: string;
}
```

```ts
export interface ApiTestEmailResult {
  ok: boolean;
  method: 'graph' | 'smtp' | 'mock';
  error: string | null;
}
```

```ts
export interface ApiCompany {
  id: string;
  name: string;
  sap_number: string;
  address: string;
  contact_person: string;
  created_at: string;
}
```

```ts
export interface ApiCustomer {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}
```

```ts
export type CustomerEditableField = 'name' | 'contact_person' | 'email' | 'phone' | 'city' | 'address';
```

```ts
export type CustomerUpdateInput = Partial<Record<CustomerEditableField, string>> & {
  remarks: string;
  /** The modified_at value the edit was based on; the server rejects stale edits with 409. */
  expected_modified_at: string;
};
```

```ts
export interface ApiCustomerAuditEntry {
  id: string;
  action: string;
  changed_by: string;
  timestamp: string;
  remarks: string;
  changes: Array<{ field: string; label: string; from: string; to: string }>;
}
```

```ts
export interface ApiSupplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  category: string;
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}
```

```ts
export interface ApiDriver {
  id: string;
  name: string;
  type: 'DRIVER' | 'ASSISTANT';
  coverage_areas: string[];
  is_active: boolean;
  is_linked?: boolean; // has a DRIVER login (linked by Admin)
  linked_user?: { id: string; name: string; email: string } | null; // Admin responses only
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}
```

```ts
export type ApiDashboardStats =
  | {
      role: 'SALES_COORDINATOR';
      deliveries_scheduled_today: number;
      pending_driver_assignment: number;
      on_hold: number;
      rescheduled: number;
      accomplished_today: number;
    }
  | {
      role: 'LOGISTICS';
      assigned_today: number;
      unassigned_count: number;
      completed_today: number;
      on_hold_rescheduled: number;
    }
  | {
      role: 'TASS';
      open_rma: number;
      rma_on_hold: number;
      pending_procurement_pickup: number;
      pending_verification: number;
      verified_today: number;
    }
  | {
      role: 'ADMIN';
      total_active_users: number;
      user_breakdown: Record<string, number>;
      records_this_week: number;
      unverified_collections: number;
      audit_events_today: number;
      records_by_status: { status: string; count: number }[];
      recent_audit: {
        id: string;
        action: string;
        changed_by: string;
        record_id: string;
        record_type: string;
        timestamp: string;
      }[];
    };
```

```ts
export interface ApiNotification {
  id: string;
  title: string;
  message: string;
  record_id: string | null;
  record_type: string | null;
  is_read: boolean;
  created_at: string;
}
```

```ts
export interface ApiComment {
  id: string;
  body: string;
  author: string;
  created_at: string;
  updated_at: string;
}
```

```ts
export interface ApiAuditEntry {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changed_by: string;
  previous_value: unknown;
  new_value: unknown;
  timestamp: string;
}
```

```ts
export interface ApiRemarkLog {
  id: string;
  body: string;
  context: string; // CREATION | GENERAL_EDIT | DRIVER_UPDATE | STATUS_CHANGE
  author: string;
  author_role: string;
  created_at: string;
}
```

```ts
export interface ApiPodAttachment {
  id: string;
  is_photo: boolean;
  name: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
  download_url: string;
  preview_url?: string;
}
```

```ts
export interface ApiReportSummary {
  total: number;
  accomplished: number;
  completed_in_range: number;
  on_hold: number;
  pending: number;
  completion_rate: number;
  date_basis: { cohort: 'deliveryDate'; completion: 'timeOut'; time_zone: 'Asia/Manila' };
  by_status:   { status: string;   count: number }[];
  by_category: { category: string; count: number }[];
  by_area:     { area: string;     count: number }[];
  by_driver:   { driver: string;   count: number }[];
}
```

```ts
export interface ApiAdminAuditEntry {
  id: string;
  record_id: string;
  record_type: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changed_by: string;
  changed_by_id: string;
  timestamp: string;
}
```

```ts
export interface ApiAdminAuditLog {
  page: number;
  limit: number;
  total: number;
  pages: number;
  entries: ApiAdminAuditEntry[];
}
```

```ts
export interface ApiSkuTransaction {
  id: string;
  type: string;
  qty_change: number;
  resulting_balance: number;
  reference: string;
  date: string;
}
```

```ts
export interface ApiSku {
  id: string;
  sku_code: string;
  name: string;
  category: string;
  unit_cost: number;
  unit_price: number;
  reorder_point: number;
  description: string;
  created_by: string;
  modified_by: string;
  created_at: string;
  updated_at: string;
  inventory: {
    warehouse_location: string;
    on_hand_qty: number;
    allocated_qty: number;
    atp: number;
  } | null;
  recent_transactions: ApiSkuTransaction[];
}
```

```ts
export interface ApiTransaction {
  id: string;
  source: 'delivery' | 'inventory';
  type: string;
  date: string;
  reference: string;
  entity: string;
  entity_id: string;
  status: string | null;
  description: string;
  qty_change?: number;
  resulting_balance?: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
```

```ts
export interface ApiTransactionList {
  page: number;
  limit: number;
  total: number;
  pages: number;
  transactions: ApiTransaction[];
}
```

```ts
export interface ApiTimelineEvent {
  event_type: string;
  action: string;
  changed_by: string;
  timestamp: string;
  previous_value: unknown;
  new_value: unknown;
  label: string;
}
```

```ts
export interface ApiTransactionDetail {
  id: string;
  source: 'delivery' | 'inventory';
  type: string;
  reference: string;
  entity: string;
  entity_id: string;
  status: string | null;
  description?: string;
  // delivery-specific
  vehicle?: string;
  area?: string;
  driver?: string;
  driver_assistants?: string[];
  account_manager?: string;
  delivery_date?: string;
  item_type?: string;
  remarks?: string;
  priority?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  timeline?: ApiTimelineEvent[];
  // inventory-specific
  qty_change?: number;
  resulting_balance?: number;
  product?: {
    id: string;
    sku_code: string;
    name: string;
    category: string;
  };
  related_transactions?: Array<{
    id: string;
    date: string;
    type: string;
    qty_change: number;
    resulting_balance: number;
    reference: string;
  }>;
}
```

## client/src/types/auth.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/types/auth.ts).

```ts
export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: 'SALES_COORDINATOR' | 'LOGISTICS' | 'TASS' | 'ADMIN' | 'DRIVER';
  permissions: { screen: string; granted: boolean }[];
}
```

```ts
export interface ApiUserAdmin {
  id: string;
  name: string;
  email: string;
  role: 'SALES_COORDINATOR' | 'LOGISTICS' | 'TASS' | 'ADMIN' | 'DRIVER';
  is_active: boolean;
  microsoft_linked: boolean;
  created_at: string;
}
```

```ts
export interface ApiIntegrationStatus {
  azure_sso: { configured: boolean; tenant: string | null; redirect_uri: string | null };
  email: { method: 'graph' | 'smtp' | 'mock'; smtp_host: string | null; from: string | null };
  users: { total: number; active: number; microsoft_linked: number };
  app_url: string;
  node_env: string;
}
```

```ts
export interface ApiTestEmailResult {
  ok: boolean;
  method: 'graph' | 'smtp' | 'mock';
  error: string | null;
}
```

## client/src/types/common.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/types/common.ts).

```ts
export interface AuditFields {
  created_by: string;
  created_at: string; // ISO timestamp
  modified_by: string;
  modified_at: string; // ISO timestamp
}
```

```ts
export type UserRole = 'Sales Coordinator' | 'Logistics' | 'TASS' | 'Admin' | 'Driver';
```

```ts
export interface ApiNotification {
  id: string;
  title: string;
  message: string;
  record_id: string | null;
  record_type: string | null;
  is_read: boolean;
  created_at: string;
}
```

```ts
export interface ApiComment {
  id: string;
  body: string;
  author: string;
  created_at: string;
  updated_at: string;
}
```

```ts
export interface ApiAuditEntry {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changed_by: string;
  previous_value: unknown;
  new_value: unknown;
  timestamp: string;
}
```

```ts
export interface ApiRemarkLog {
  id: string;
  body: string;
  context: string; // CREATION | GENERAL_EDIT | DRIVER_UPDATE | STATUS_CHANGE
  author: string;
  author_role: string;
  created_at: string;
}
```

## client/src/types/customer.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/types/customer.ts).

```ts
export interface Customer extends AuditFields {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
}
```

```ts
export interface ApiCompany {
  id: string;
  name: string;
  sap_number: string;
  address: string;
  contact_person: string;
  created_at: string;
}
```

```ts
export interface ApiCustomer extends Customer {}
```

## client/src/types/dashboard.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/types/dashboard.ts).

```ts
export type ApiDashboardStats =
  | {
      role: 'SALES_COORDINATOR';
      deliveries_scheduled_today: number;
      pending_driver_assignment: number;
      on_hold: number;
      rescheduled: number;
      accomplished_today: number;
    }
  | {
      role: 'LOGISTICS';
      assigned_today: number;
      unassigned_count: number;
      completed_today: number;
      on_hold_rescheduled: number;
    }
  | {
      role: 'TASS';
      open_rma: number;
      rma_on_hold: number;
      pending_procurement_pickup: number;
      pending_verification: number;
      verified_today: number;
    }
  | {
      role: 'ADMIN';
      total_active_users: number;
      user_breakdown: Record<string, number>;
      records_this_week: number;
      unverified_collections: number;
      audit_events_today: number;
      records_by_status: { status: string; count: number }[];
      recent_audit: {
        id: string;
        action: string;
        changed_by: string;
        record_id: string;
        record_type: string;
        timestamp: string;
      }[];
    };
```

## client/src/types/delivery.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/types/delivery.ts).

```ts
export type DeliveryCategory =
  | 'Sales Orders'
  | 'Deliveries'
  | 'RMA'
  | 'Accounting Collection'
  | 'Procurement Pick-up';
```

```ts
export type DeliveryStatus = 'Draft' | 'Scheduled' | 'In Transit' | 'Delivered' | 'On-Hold' | 'Rescheduled' | 'Pending';
```

```ts
export type PriorityLevel = '1 - Low' | '2 - Moderate' | '3 - High';
```

```ts
export type ItemType = 'Small Item' | 'Unit' | 'Medium Item' | 'Large / Pallet';
```

```ts
export type OutputActionTrigger =
  | 'Record Created'
  | 'Accomplished'
  | 'Rescheduled'
  | 'On-Hold'
  | 'RMA Completed'
  | 'Collection Verified';
```

```ts
export interface OutputActionConfig {
  notifyAM: boolean;
  notifyLogistics: boolean;
  notifyTASS: boolean;
  exportPDF: boolean;
  internalOnly: boolean; // when true, suppresses all of the above
}
```

```ts
export interface OutputActionLogEntry {
  trigger: OutputActionTrigger;
  message: string;
  at: string; // ISO timestamp
}
```

```ts
export interface DeliveryRecord extends AuditFields {
  id: string; // e.g., REC-4001
  company_name: string; // display name of the record's Company
  company_id: string; // Company the record belongs to (never a Customer ID)
  priority: PriorityLevel;
  reference: string; // SAP reference for non-RMA records; aliases the RMA document reference in the UI
  rma_reference?: string | null;
  legacy_sap_reference?: string | null;
  remarks: string;
  status: DeliveryStatus;
  allowed_statuses?: DeliveryStatus[]; // Authoritative transitions supplied by the server
  vehicle: string;
  area: string;
  driver: string; // display name of the assigned Driver profile
  driver_id?: string | null; // stable Driver profile id — what assignment saves and what decides Driver access
  driver_assistants: string[];
  time_in?: string | null;
  time_out?: string | null;
  received_by?: string | null;
  account_manager: string;
  delivery_date: string; // date, YYYY-MM-DD
  overdue?: boolean;
  days_late?: number;
  completed_late?: boolean;
  category: DeliveryCategory;
  item_type: ItemType;
  is_draft: 'Yes' | 'No';
  created_by_id?: string;
  modified_by_id?: string;
  deleted_at?: string | null;
  document_attachment?: string | null;
  rma_type?: RmaCategory | null;
  purchase_date?: string | null;
  customer_contact_name?: string | null;
  customer_contact_email?: string | null;
  customer_contact_phone?: string | null;
  item_description: string;
  line_items?: { id?: string, sku: string, quantity: number }[];
  attachments: string[]; // mock file names only
  email_notification_sent: boolean;
  output_actions_log: OutputActionLogEntry[]; // full history of fired output actions
  collection_verified?: boolean;
  collection_verified_by?: string | null;
  collection_verified_at?: string | null;
  amount?: number | null; // Philippine Peso — required for Accounting Collection, null for others
  address?: string;
  linked_collection_id?: string | null;
  linked_collection?: {
    id: string;
    reference: string;
    company_name: string;
    status: string;
    collection_verified: boolean;
  } | null;
}
```

```ts
export interface ApiDriver {
  id: string;
  name: string;
  type: 'DRIVER' | 'ASSISTANT';
  coverage_areas: string[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}
```

## client/src/types/index.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/types/index.ts).

## client/src/types/inventory.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/types/inventory.ts).

```ts
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
```

```ts
export interface InventoryItem {
  product_id: string;
  warehouse_location: string; // bin location like A-01, B-04
  on_hand_qty: number;
  allocated_qty: number;
}
```

```ts
export type TransactionType = 'Goods Receipt' | 'Sale' | 'Adjustment' | 'Transfer';
```

```ts
export interface InventoryTransaction {
  id: string;
  product_id: string;
  date: string;
  type: TransactionType;
  qty_change: number;
  resulting_balance: number;
  reference: string; // e.g., PO-1002, SO-2041, ADJ-882
}
```

```ts
export interface WarehouseLocation {
  bin_code: string;       // e.g. BIN-A01
  zone: string;           // e.g. A, B, C
  description: string;
}
```

```ts
export interface ApiSkuTransaction {
  id: string;
  type: string;
  qty_change: number;
  resulting_balance: number;
  reference: string;
  date: string;
}
```

```ts
export interface ApiSku {
  id: string;
  sku_code: string;
  name: string;
  category: string;
  unit_cost: number;
  unit_price: number;
  reorder_point: number;
  description: string;
  created_by: string;
  modified_by: string;
  created_at: string;
  updated_at: string;
  inventory: {
    warehouse_location: string;
    on_hand_qty: number;
    allocated_qty: number;
    atp: number;
  } | null;
  recent_transactions: ApiSkuTransaction[];
}
```

## client/src/types/reports.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/types/reports.ts).

```ts
export interface ApiReportSummary {
  total: number;
  accomplished: number;
  completed_in_range: number;
  on_hold: number;
  pending: number;
  completion_rate: number;
  date_basis: { cohort: 'deliveryDate'; completion: 'timeOut'; time_zone: 'Asia/Manila' };
  by_status:   { status: string;   count: number }[];
  by_category: { category: string; count: number }[];
  by_area:     { area: string;     count: number }[];
  by_driver:   { driver: string;   count: number }[];
}
```

```ts
export interface ApiAdminAuditEntry {
  id: string;
  record_id: string;
  record_type: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changed_by: string;
  changed_by_id: string;
  timestamp: string;
}
```

```ts
export interface ApiAdminAuditLog {
  page: number;
  limit: number;
  total: number;
  pages: number;
  entries: ApiAdminAuditEntry[];
}
```

## client/src/types/supplier.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/types/supplier.ts).

```ts
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
```

```ts
export interface ApiSupplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  category: string;
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}
```

## client/src/types/transactions.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/types/transactions.ts).

```ts
export interface ApiTransaction {
  id: string;
  source: 'delivery' | 'inventory';
  type: string;
  date: string;
  reference: string;
  entity: string;
  entity_id: string;
  status: string | null;
  description: string;
  qty_change?: number;
  resulting_balance?: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
```

```ts
export interface ApiTransactionList {
  page: number;
  limit: number;
  total: number;
  pages: number;
  transactions: ApiTransaction[];
}
```

```ts
export interface ApiTimelineEvent {
  event_type: string;
  action: string;
  changed_by: string;
  timestamp: string;
  previous_value: unknown;
  new_value: unknown;
  label: string;
}
```

```ts
export interface ApiTransactionDetail {
  id: string;
  source: 'delivery' | 'inventory';
  type: string;
  reference: string;
  entity: string;
  entity_id: string;
  status: string | null;
  description?: string;
  // delivery-specific
  vehicle?: string;
  area?: string;
  driver?: string;
  driver_assistants?: string[];
  account_manager?: string;
  delivery_date?: string;
  item_type?: string;
  remarks?: string;
  priority?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  timeline?: ApiTimelineEvent[];
  // inventory-specific
  qty_change?: number;
  resulting_balance?: number;
  product?: {
    id: string;
    sku_code: string;
    name: string;
    category: string;
  };
  related_transactions?: Array<{
    id: string;
    date: string;
    type: string;
    qty_change: number;
    resulting_balance: number;
    reference: string;
  }>;
}
```

## serializeRecord

[Server source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/mappings.ts#L57).

```ts
export function serializeRecord(r: any, user?: AuthUser) {
  const state = r.category === 'DELIVERY' ? deliveryScheduleState(r.deliveryDate) : null;
  const completed = runState(r) === 'Delivered';
  const completedLate = r.category === 'DELIVERY' && completed && Boolean(r.completedLate);
  const canViewLinked = !user || (
    r.linkedCollection
      ? canReadRecord(user, r.linkedCollection)
      : (r.linkedCollectionId ? (user.role !== 'DRIVER' && readableCategories(user).includes('ACCOUNTING_COLLECTION')) : true)
  );
  return {
    id: r.id,
    company_name: r.company?.name ?? '',
    company_id: r.companyId,
    priority: r.priority,
    reference: r.category === 'RMA' ? (r.rmaReference ?? '') : r.reference,
    rma_reference: r.category === 'RMA' ? (r.rmaReference ?? null) : null,
    legacy_sap_reference: r.category === 'RMA' ? (r.legacySapReference ?? null) : null,
    remarks: r.remarks,
    status: runState(r),
    allowed_statuses: allowedStatuses(r),
    vehicle: r.vehicle,
    area: r.area,
    driver: r.driver,
    driver_id: r.driverId ?? null,
    driver_assistants: parseDriverAssistants(r.driverAssistants),
    time_in: r.timeIn ?? null,
    time_out: r.timeOut ?? null,
    received_by: r.receivedBy ?? null,
    account_manager: r.accountManager,
    delivery_date: r.deliveryDate,
    ...(state ? {
      overdue: completed ? completedLate : state.overdue,
      days_late: completed ? (completedLate ? Number(r.daysLate ?? 0) : 0) : state.daysLate,
      completed_late: completedLate,
    } : {}),
    category: CATEGORY_FROM_DB[r.category] ?? r.category,
    item_type: r.itemType,
    is_draft: r.draft ? 'Yes' : 'No',
    rma_type: normalizeRmaCategory(r.rmaType),
    purchase_date: r.purchaseDate ?? null,
    customer_contact_name: r.customerContactName ?? null,
    customer_contact_email: r.customerContactEmail ?? null,
    customer_contact_phone: r.customerContactPhone ?? null,
    item_description: r.itemDescription,
    line_items: r.lineItems?.map((li: any) => ({ id: li.id, sku: li.sku, quantity: li.quantity })) || [],
    address: r.address ?? '',
    document_attachment: r.documentAttachment,
    attachments: r.documentAttachment ? [r.documentAttachment] : [],
    collection_verified: r.collectionVerified ?? false,
    collection_verified_by: r.collectionVerifiedBy ?? null,
    collection_verified_at: r.collectionVerifiedAt ?? null,
    amount: r.amount ?? null,
    linked_collection_id: canViewLinked ? (r.linkedCollectionId ?? null) : null,
    linked_collection: (canViewLinked && r.linkedCollection && !r.linkedCollection.draft) ? {
      id: r.linkedCollection.id,
      reference: r.linkedCollection.reference,
      company_name: r.linkedCollection.company?.name ?? '',
      status: STATUS_FROM_DB[r.linkedCollection.status] ?? r.linkedCollection.status,
      collection_verified: r.linkedCollection.collectionVerified ?? false,
    } : null,
    created_by: r.createdBy?.name ?? '',
    created_by_id: r.createdById,
    created_at: r.createdAt,
    modified_by: r.modifiedBy?.name ?? '',
    modified_by_id: r.modifiedById,
    modified_at: r.updatedAt,
    deleted_at: r.deletedAt
  };
}
```

## serializeProduct

[Server source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L16).

```ts
function serializeProduct(p: any, includeTransactions = false): object {
  return {
    id: p.id,
    sku_code: p.skuCode,
    name: p.name,
    category: p.category,
    unit_cost: p.unitCost,
    unit_price: p.unitPrice,
    reorder_point: p.reorderPoint,
    description: p.description,
    created_by: p.createdBy?.name ?? '',
    modified_by: p.modifiedBy?.name ?? '',
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    inventory: p.inventory
      ? {
          warehouse_location: p.inventory.warehouseLocation,
          on_hand_qty: p.inventory.onHandQty,
          allocated_qty: p.inventory.allocatedQty,
          atp: p.inventory.onHandQty - p.inventory.allocatedQty
        }
      : null,
    recent_transactions: includeTransactions
      ? (p.transactions ?? []).slice(0, 20).map((t: any) => ({
          id: t.id,
          type: t.type,
          qty_change: t.qtyChange,
          resulting_balance: t.resultingBalance,
          reference: t.reference,
          date: t.date
        }))
      : []
  };
}
```

## permissionSnapshot

[Server source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/services/permissions.ts#L64).

```ts
export function permissionSnapshot(role: string, permissions: readonly Permission[]) {
  const overrides = permissions.map(({ screen, granted }) => ({ screen, granted })).sort((a, b) => a.screen.localeCompare(b.screen));
  const screens = effectiveScreens(role, overrides);
  const version = createHash('sha256').update(JSON.stringify({ role, overrides, screens })).digest('hex');
  return { permissions: overrides, effectiveScreens: screens, resources: resourcesFor(screens), permissionVersion: version };
}
```

## sessionUser

[Server source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/services/permissions.ts#L71).

```ts
export function sessionUser(user: { id: string; name: string; email: string; role: string; permissions: Permission[] }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, ...permissionSnapshot(user.role, user.permissions) };
}
```

## permissionEditor

[Server source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/services/permissions.ts#L75).

```ts
export function permissionEditor(user: { id: string; role: string; permissions: Permission[] }) {
  return {
    userId: user.id, ...permissionSnapshot(user.role, user.permissions),
    roleDefaults: ROLE_DEFAULTS[user.role] ?? [],
    catalog: Object.entries(SCREEN_LABELS).map(([screen, label]) => ({ screen, label })),
    editableScreens: editableScreens(user.role),
  };
}
```

```ts
export type DatabaseIdentity = { host: string; port: string; database: string; loopback: boolean };
```

## deploymentStatus

[Server source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/services/deploymentStatus.ts#L74).

```ts
export async function deploymentStatus(req: Request, env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const database = databaseIdentity(env.DATABASE_URL);
  const storage = await podStorageStatus(env);
  const address = clientAddress(req, env);
  const secretConfigured = Boolean(env.PROXY_SHARED_SECRET);
  const secretRequired = proxySecretRequired(env);
  const viaWorker = address.source === 'worker-proxy';
  const hops = trustedProxyHops(env);
  const cookie = sessionCookieOptions(env);

  return {
    node_env: env.NODE_ENV || 'development',
    database,
    storage,
    origins: {
      cors: env.CLIENT_ORIGIN || 'http://localhost:3000',
      trusted_for_writes: [...trustedOrigins(env)].sort(),
    },
    session_cookie: { http_only: cookie.httpOnly, secure: cookie.secure, same_site: cookie.sameSite },
    proxy: {
      shared_secret_configured: secretConfigured,
      // True when requests without the secret are refused (REQUIRE_PROXY_SECRET).
      secret_required: secretRequired,
      request_carried_valid_secret: viaWorker,
      trusted_proxy_hops: hops,
      // The address this request is rate-limited under, and how it was decided.
      client_address: address.ip,
      client_address_source: address.source,
    },
    settings_present: Object.fromEntries(REVIEWED_SETTINGS.map(name => [name, Boolean(env[name]?.trim())])),
    warnings: findings({ production, database, storage, secretConfigured, secretRequired, viaWorker, hops, env }),
  };
}
```

```ts
export type PodStorageStatus =
  | { provider: 'local'; directory: string; exists: boolean; writable: boolean }
  | {
    provider: 'supabase'; host: string; bucket: string; reachable: boolean;
    public: boolean | null; file_size_limit: number | null; allowed_mime_types: string[] | null; error?: string;
  };
```

## podStorageStatus

[Server source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/services/podStorage.ts#L158).

```ts
export async function podStorageStatus(env: NodeJS.ProcessEnv = process.env): Promise<PodStorageStatus> {
  if (podStorageProvider(env) === 'local') {
    const writable = await fs.promises.access(uploadDir, fs.constants.W_OK).then(() => true, () => false);
    const exists = writable || await fs.promises.access(uploadDir).then(() => true, () => false);
    return { provider: 'local', directory: uploadDir, exists, writable };
  }

  const { url, key, bucket } = supabaseConfig(env);
  const status: PodStorageStatus = {
    provider: 'supabase', host: new URL(url).host, bucket, reachable: false,
    public: null, file_size_limit: null, allowed_mime_types: null,
  };
  try {
    const response = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ...status, error: `Bucket lookup failed (${response.status})` };
    const details = await response.json() as { public?: boolean; file_size_limit?: number | null; allowed_mime_types?: string[] | null };
    return {
      ...status, reachable: true,
      public: typeof details.public === 'boolean' ? details.public : null,
      file_size_limit: details.file_size_limit ?? null,
      allowed_mime_types: details.allowed_mime_types ?? null,
    };
  } catch {
    return { ...status, error: 'Bucket lookup failed (network error or timeout)' };
  }
}
```
