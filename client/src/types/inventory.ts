/**
 * Inventory and Product module types
 */

import { AuditFields } from './common';

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

export interface WarehouseLocation {
  bin_code: string;       // e.g. BIN-A01
  zone: string;           // e.g. A, B, C
  description: string;
}

export interface ApiSkuTransaction {
  id: string;
  type: string;
  qty_change: number;
  resulting_balance: number;
  reference: string;
  date: string;
}

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
