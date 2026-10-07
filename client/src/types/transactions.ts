/**
 * Transaction Center types
 */

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

export interface ApiTransactionList {
  page: number;
  limit: number;
  total: number;
  pages: number;
  transactions: ApiTransaction[];
}

export interface ApiTimelineEvent {
  event_type: string;
  action: string;
  changed_by: string;
  timestamp: string;
  previous_value: unknown;
  new_value: unknown;
  label: string;
}

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
