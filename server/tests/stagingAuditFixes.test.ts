import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import recordsRoutes from '../src/routes/records';
import skusRoutes from '../src/routes/skus';
import { serializeRecord } from '../src/mappings';
import { canReadRecord } from '../src/services/recordAccess';
import type { AuthUser } from '../src/middleware/auth';

const restorers: (() => void)[] = [];
function stub(target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  const replacement = mock.fn(implementation);
  target[key] = replacement;
  restorers.push(() => { target[key] = original; });
  return replacement;
}

afterEach(() => {
  while (restorers.length) restorers.pop()!();
  mock.restoreAll();
});

async function invoke(router: any, method: string, path: string, body: any, user: AuthUser, params: Record<string, string> = { id: 'rec-1' }) {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`Route not found for ${method.toUpperCase()} ${path}`);
  const route = layer.route;
  let status = 200;
  let response: any;
  const req: any = {
    params,
    body,
    user,
    query: {},
    path: path.replace(':id', params.id),
  };
  const res: any = {
    status(n: number) { status = n; return this; },
    json(x: any) { response = x; return this; },
  };

  // Run the role check (penultimate) and handler (last)
  await route.stack.at(-2).handle(req, res, () => {});
  if (response === undefined) {
    await route.stack.at(-1).handle(req, res, (error: unknown) => { if (error) throw error; });
  }
  return { status, body: response };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Linked Collection Visibility and Scoping Tests
// ─────────────────────────────────────────────────────────────────────────────

test('canReadRecord respects category permissions and Driver profile ownership', () => {
  const driverA: AuthUser = {
    id: 'user-a', name: 'Driver A', role: 'DRIVER', permissions: [],
    effectiveScreens: ['driver_dashboard'], resources: ['records'],
    permissionVersion: 'v1', driverProfileId: 'profile-a',
  };
  const driverB: AuthUser = {
    ...driverA, id: 'user-b', name: 'Driver B', driverProfileId: 'profile-b',
  };
  const salesWithoutAccounting: AuthUser = {
    id: 'user-sc', name: 'Sales Rep', role: 'SALES_COORDINATOR',
    permissions: [{ screen: 'accounting_collection', granted: false }],
    effectiveScreens: ['deliveries'], resources: ['records'],
    permissionVersion: 'v1',
  };
  const admin: AuthUser = {
    id: 'user-admin', name: 'Admin', role: 'ADMIN', permissions: [],
    effectiveScreens: ['main', 'accounting_collection', 'deliveries'], resources: ['records'],
    permissionVersion: 'v1',
  };

  const deliveryOwnedByA = {
    id: 'del-1', category: 'DELIVERY', driverId: 'profile-a', draft: false,
  };
  const collectionOwnedByA = {
    id: 'col-1', category: 'ACCOUNTING_COLLECTION', driverId: 'profile-a', draft: false,
  };
  const collectionOwnedByB = {
    id: 'col-2', category: 'ACCOUNTING_COLLECTION', driverId: 'profile-b', draft: false,
  };

  assert.equal(canReadRecord(driverA, deliveryOwnedByA), true);
  assert.equal(canReadRecord(driverA, collectionOwnedByA), true);
  assert.equal(canReadRecord(driverA, collectionOwnedByB), false, 'Driver A must not read Driver B collection');
  assert.equal(canReadRecord(driverB, collectionOwnedByA), false, 'Driver B must not read Driver A collection');
  assert.equal(canReadRecord(salesWithoutAccounting, collectionOwnedByA), false, 'Explicit accounting denial blocks read');
  assert.equal(canReadRecord(admin, collectionOwnedByA), true, 'Admin can read collection');
  assert.equal(canReadRecord(admin, collectionOwnedByB), true, 'Admin can read any collection');
});

test('RMA serialization exposes the document reference separately from any legacy SAP value', () => {
  const result = serializeRecord({
    id: 'rma-1', category: 'RMA', status: 'SCHEDULED', draft: false, reference: '',
    rmaReference: 'RMA-DOC-1001', legacySapReference: 'SAP-RMA-001',
    deliveryDate: '', timeIn: null, timeOut: null, driver: '', driverAssistants: '[]',
  });
  assert.equal(result.reference, 'RMA-DOC-1001');
  assert.equal(result.rma_reference, 'RMA-DOC-1001');
  assert.equal(result.legacy_sap_reference, 'SAP-RMA-001');
});

test('serializeRecord strips linked collection details and ID when target is unreadable by the caller', () => {
  const driverA: AuthUser = {
    id: 'user-a', name: 'Driver A', role: 'DRIVER', permissions: [],
    effectiveScreens: ['driver_dashboard'], resources: ['records'],
    permissionVersion: 'v1', driverProfileId: 'profile-a',
  };
  const salesDeniedAccounting: AuthUser = {
    id: 'user-sc', name: 'Sales Rep', role: 'SALES_COORDINATOR',
    permissions: [{ screen: 'accounting_collection', granted: false }],
    effectiveScreens: ['deliveries'], resources: ['records'],
    permissionVersion: 'v1',
  };
  const admin: AuthUser = {
    id: 'user-admin', name: 'Admin', role: 'ADMIN', permissions: [],
    effectiveScreens: ['main', 'accounting_collection', 'deliveries'], resources: ['records'],
    permissionVersion: 'v1',
  };

  const parentDelivery = {
    id: 'del-1',
    company: { name: 'Acme Corp' },
    companyId: 'comp-1',
    priority: '2 - Moderate',
    reference: 'REF-DEL-1',
    remarks: 'Deliver ASAP',
    category: 'DELIVERY',
    status: 'IN_TRANSIT',
    vehicle: 'Van-1',
    area: 'Area 1',
    driver: 'Driver A',
    driverId: 'profile-a',
    driverAssistants: '[]',
    deliveryDate: '2026-10-20',
    itemType: 'Standard',
    draft: false,
    itemDescription: '',
    lineItems: [],
    linkedCollectionId: 'col-other',
    linkedCollection: {
      id: 'col-other',
      category: 'ACCOUNTING_COLLECTION',
      driverId: 'profile-b', // Assigned to different driver!
      draft: false,
      reference: 'SECRET-COLLECTION-REF',
      status: 'SCHEDULED',
      collectionVerified: false,
      company: { name: 'Billing Customer' },
    },
    createdById: 'admin-1',
    createdAt: new Date(),
    modifiedById: 'admin-1',
    updatedAt: new Date(),
  };

  // 1. Driver A reading their own delivery, but the linked collection belongs to Driver B
  const serializedForDriver = serializeRecord(parentDelivery, driverA);
  assert.equal(serializedForDriver.id, 'del-1');
  assert.equal(serializedForDriver.linked_collection, null, 'Linked collection must be redacted for different Driver');
  assert.equal(serializedForDriver.linked_collection_id, null, 'Linked collection ID must be redacted for different Driver');

  // 2. Sales Coordinator with Accounting Collection denied
  const serializedForDeniedUser = serializeRecord(parentDelivery, salesDeniedAccounting);
  assert.equal(serializedForDeniedUser.linked_collection, null, 'Linked collection must be redacted when category is denied');
  assert.equal(serializedForDeniedUser.linked_collection_id, null, 'Linked collection ID must be redacted when category is denied');

  // 3. Admin can read both
  const serializedForAdmin = serializeRecord(parentDelivery, admin);
  assert.notEqual(serializedForAdmin.linked_collection, null, 'Admin can read linked collection');
  assert.equal(serializedForAdmin.linked_collection?.reference, 'SECRET-COLLECTION-REF');
  assert.equal(serializedForAdmin.linked_collection_id, 'col-other');

  // 4. Same Driver assigned to both delivery and linked collection
  const deliveryWithOwnCollection = {
    ...parentDelivery,
    linkedCollection: {
      ...parentDelivery.linkedCollection,
      driverId: 'profile-a', // Matching driver!
    },
  };
  const serializedOwnDriver = serializeRecord(deliveryWithOwnCollection, driverA);
  assert.notEqual(serializedOwnDriver.linked_collection, null, 'Driver can read own linked collection');
  assert.equal(serializedOwnDriver.linked_collection?.reference, 'SECRET-COLLECTION-REF');
  assert.equal(serializedOwnDriver.linked_collection_id, 'col-other');

  // 5. Internal backward compatibility (no user passed, e.g. audit logs)
  const internalSerialized = serializeRecord(parentDelivery);
  assert.notEqual(internalSerialized.linked_collection, null, 'Internal serialization without user retains raw record');
  assert.equal(internalSerialized.linked_collection_id, 'col-other');
});

test('HTTP GET /api/v1/records/:id redacts linked collection details for unauthorized callers', async () => {
  const driverA: AuthUser = {
    id: 'user-a', name: 'Driver A', role: 'DRIVER', permissions: [],
    effectiveScreens: ['driver_dashboard'], resources: ['records'],
    permissionVersion: 'v1', driverProfileId: 'profile-a',
  };
  const recordRow = {
    id: 'rec-1',
    company: { name: 'Acme Corp' },
    companyId: 'comp-1',
    priority: '2 - Moderate',
    reference: 'REF-1',
    remarks: '',
    category: 'DELIVERY',
    status: 'SCHEDULED',
    vehicle: 'Truck-1',
    area: 'Area 1',
    driver: 'Driver A',
    driverId: 'profile-a',
    driverAssistants: '[]',
    deliveryDate: '2026-10-20',
    itemType: 'Box',
    draft: false,
    itemDescription: '',
    lineItems: [],
    linkedCollectionId: 'col-b',
    linkedCollection: {
      id: 'col-b',
      category: 'ACCOUNTING_COLLECTION',
      driverId: 'profile-b',
      draft: false,
      reference: 'CONFIDENTIAL-REF',
      status: 'ACCOMPLISHED',
      collectionVerified: true,
      company: { name: 'Other Co' },
    },
    createdById: 'admin-1',
    createdAt: new Date(),
    modifiedById: 'admin-1',
    updatedAt: new Date(),
  };

  stub(prisma.deliveryRecord, 'findFirst', async () => recordRow);

  const res = await invoke(recordsRoutes, 'get', '/:id', null, driverA, { id: 'rec-1' });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'rec-1');
  assert.equal(res.body.linked_collection, null);
  assert.equal(res.body.linked_collection_id, null);
});

test('PUT /api/v1/records/:id rejects linking to an Accounting Collection outside the caller recordScope', async () => {
  const logistics: AuthUser = {
    id: 'user-logistics', name: 'Logistics User', role: 'LOGISTICS',
    permissions: [{ screen: 'accounting_collection', granted: false }], // Denied Accounting Collection
    effectiveScreens: ['deliveries'], resources: ['records'],
    permissionVersion: 'v1',
  };
  const existingDelivery = {
    id: 'del-1',
    category: 'DELIVERY',
    status: 'SCHEDULED',
    draft: false,
    companyId: 'comp-1',
  };

  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => {
    // If querying existing delivery
    if (where.id === 'del-1') return existingDelivery;
    // If checking linked collection target with recordScope
    if (where.id === 'col-unauthorized') {
      // Because where.AND includes recordScope which requires category in readableCategories,
      // and logistics has accounting_collection denied, this returns null!
      const scope = where.AND?.[0];
      if (scope?.category?.in && !scope.category.in.includes('ACCOUNTING_COLLECTION')) {
        return null;
      }
      return { id: 'col-unauthorized', category: 'ACCOUNTING_COLLECTION' };
    }
    return null;
  });

  const res = await invoke(recordsRoutes, 'put', '/:id', {
    remarks: 'Link collection',
    linked_collection_id: 'col-unauthorized',
  }, logistics, { id: 'del-1' });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /Linked record must be an existing Accounting Collection record/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Concurrent Stock Adjustment Race Condition Tests
// ─────────────────────────────────────────────────────────────────────────────

test('concurrent stock adjustments are serialized, preventing overselling and inventory desynchronization', async () => {
  const admin: AuthUser = {
    id: 'admin-1', name: 'Admin', role: 'ADMIN', permissions: [],
    effectiveScreens: ['inventory'], resources: ['skus'],
    permissionVersion: 'v1',
  };

  let stockBalance = 10;
  let activeInTx = 0;
  let maxConcurrentTx = 0;
  const ledgerEntries: any[] = [];
  const rawQueries: string[] = [];

  const product = {
    id: 'sku-target',
    skuCode: 'SKU-CONCURRENT-1',
    name: 'Concurrent SKU',
    category: 'Hardware',
    unitCost: 10,
    unitPrice: 20,
    reorderPoint: 5,
    inventory: { onHandQty: stockBalance, allocatedQty: 0, warehouseLocation: 'WH-1' },
    transactions: [],
  };

  stub(prisma.product, 'findFirst', async () => product);

  stub(prisma, '$transaction', async (callback: any) => {
    activeInTx++;
    maxConcurrentTx = Math.max(maxConcurrentTx, activeInTx);

    // Simulate async tick delay to provoke interleaving if not locked
    await new Promise(r => setTimeout(r, 15));

    try {
      const txMock: any = {
        $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
          rawQueries.push(strings.join('?'));
          return [];
        },
        inventoryItem: {
          findUnique: async () => ({ onHandQty: stockBalance }),
          update: async ({ data }: any) => {
            stockBalance = data.onHandQty;
            return { onHandQty: stockBalance };
          },
        },
        inventoryTransaction: {
          create: async ({ data }: any) => {
            ledgerEntries.push(data);
            return data;
          },
        },
        product: {
          update: async () => product,
          findUniqueOrThrow: async () => ({
            ...product,
            inventory: { onHandQty: stockBalance, allocatedQty: 0 },
            transactions: ledgerEntries,
          }),
        },
        auditLog: {
          create: async () => ({}),
        },
      };

      const result = await callback(txMock);
      return result;
    } finally {
      activeInTx--;
    }
  });

  // Launch two concurrent deductions of 7 units when stock is only 10
  const adjustment = { type: 'Sale', qty_change: -7, reference: 'CONCURRENT-TEST' };
  const [res1, res2] = await Promise.all([
    invoke(skusRoutes, 'post', '/:id/adjust', adjustment, admin, { id: 'sku-target' }),
    invoke(skusRoutes, 'post', '/:id/adjust', adjustment, admin, { id: 'sku-target' }),
  ]);

  const statuses = [res1.status, res2.status].sort();
  // Exactly one request must succeed (200), and the second must be rejected with 400 (Insufficient stock)
  assert.deepEqual(statuses, [200, 400], 'One sale must succeed and the second must be rejected');

  // Verify failure message
  const failedRes = res1.status === 400 ? res1 : res2;
  assert.match(failedRes.body.error, /Insufficient stock/);
  assert.match(failedRes.body.error, /Current on-hand quantity is 3, cannot deduct 7/);

  // Stored stock balance must be 3 (10 - 7 = 3)
  assert.equal(stockBalance, 3, 'Stock must be exactly 3 and not negative');

  // Ledger transactions must contain exactly one -7 entry with resultingBalance = 3
  assert.equal(ledgerEntries.length, 1, 'Only one transaction entry should be written');
  assert.equal(ledgerEntries[0].qtyChange, -7);
  assert.equal(ledgerEntries[0].resultingBalance, 3);

  // Concurrency inside the transaction handler must have been strictly serialized (max 1 active transaction)
  assert.equal(maxConcurrentTx, 1, 'Transactions for the same product must be serialized without interleaving');

  // FOR UPDATE locking queries must have been executed
  assert.ok(rawQueries.some(q => q.includes('FOR UPDATE') && q.includes('Product')), 'Product must be locked with FOR UPDATE');
  assert.ok(rawQueries.some(q => q.includes('FOR UPDATE') && q.includes('InventoryItem')), 'InventoryItem must be locked with FOR UPDATE');
});
