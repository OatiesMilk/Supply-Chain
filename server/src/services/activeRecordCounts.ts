// Sidebar badges count DB statuses. A legacy SCHEDULED row with Time In
// renders as "In Transit", and is still active; drafts are filtered upstream.
export interface ActiveCountRow { category: string; status: string; _count: { _all: number } }
export interface ActiveCounts {
  deliveries: number;
  rma: number;
  sales_orders: number;
  accounting_collection: number;
  procurement_pickup: number;
}

export function recordActiveCounts(rows: readonly ActiveCountRow[]): ActiveCounts {
  const result: ActiveCounts = { deliveries: 0, rma: 0, sales_orders: 0, accounting_collection: 0, procurement_pickup: 0 };
  const categoryKeys: Record<string, keyof ActiveCounts> = {
    DELIVERY: 'deliveries', RMA: 'rma', SALES_ORDERS: 'sales_orders',
    ACCOUNTING_COLLECTION: 'accounting_collection', PROCUREMENT_PICKUP: 'procurement_pickup'
  };
  for (const row of rows) {
    const key = categoryKeys[row.category];
    if (key && (['SCHEDULED','IN_TRANSIT','PENDING'].includes(row.status) ||
      (row.status === 'ON_HOLD' && row.category === 'RMA'))) result[key] += row._count._all;
  }
  return result;
}
