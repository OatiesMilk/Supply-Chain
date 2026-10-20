import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordActiveCounts } from '../src/services/activeRecordCounts';

test('grouped counts preserve badge statuses and exclude non-RMA On-Hold', () => {
  assert.deepEqual(recordActiveCounts([
    { category: 'DELIVERY', status: 'SCHEDULED', _count: { _all: 4 } },
    { category: 'DELIVERY', status: 'IN_TRANSIT', _count: { _all: 1 } },
    { category: 'DELIVERY', status: 'PENDING', _count: { _all: 2 } },
    { category: 'DELIVERY', status: 'ON_HOLD', _count: { _all: 5 } },
    { category: 'RMA', status: 'ON_HOLD', _count: { _all: 3 } },
    { category: 'RMA', status: 'PENDING', _count: { _all: 1 } },
    { category: 'SALES_ORDERS', status: 'SCHEDULED', _count: { _all: 2 } },
    { category: 'ACCOUNTING_COLLECTION', status: 'IN_TRANSIT', _count: { _all: 6 } },
    { category: 'PROCUREMENT_PICKUP', status: 'PENDING', _count: { _all: 1 } },
  ]), { deliveries: 7, rma: 4, sales_orders: 2, accounting_collection: 6, procurement_pickup: 1 });
});
