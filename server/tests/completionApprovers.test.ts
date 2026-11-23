import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSION_CATALOG, defaultRolePermissions } from '../src/services/permissionCatalog';
import { salesCompletionApproverIds } from '../src/services/completionApprovers';

const categories = ['DELIVERY', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'] as const;

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sc-1', role: 'SALES_COORDINATOR', isActive: true, authorizationRevision: 1n,
    permissions: [], permissionOverrides: [], permissionConversion: null, driverProfile: null,
    ...overrides,
  };
}

function rolePolicy(receiveFor: readonly string[] = categories) {
  const defaults = defaultRolePermissions('SALES_COORDINATOR');
  return {
    role: 'SALES_COORDINATOR', revision: 1n, catalogVersion: 1,
    permissions: PERMISSION_CATALOG.map(entry => ({
      permissionKey: entry.key,
      effect: entry.key.endsWith(':RECEIVE') && receiveFor.some(category => entry.key === `CATEGORY:${category}:RECEIVE`)
        ? 'ALLOW'
        : defaults.get(entry.key)!,
    })),
  };
}

function txFor(users: unknown[], policy = rolePolicy()) {
  return {
    user: { findMany: async () => users },
    rolePolicy: { findUnique: async () => policy },
  } as any;
}

test('completion approvers are eligible for each operational category in LEGACY mode and honor screen denials', async () => {
  const eligible = user();
  for (const category of categories) {
    assert.deepEqual(await salesCompletionApproverIds(txFor([eligible]), category, 'LEGACY'), ['sc-1']);
  }
  const denied = user({ id: 'sc-denied', permissions: [{ screen: 'accounting_collection', granted: false }] });
  assert.deepEqual(await salesCompletionApproverIds(txFor([denied]), 'ACCOUNTING_COLLECTION', 'LEGACY'), []);
  assert.deepEqual(await salesCompletionApproverIds(txFor([eligible]), 'RMA', 'LEGACY'), []);
});

test('V1 completion approvers need category RECEIVE for each category and explicit user denials remain in force', async () => {
  const policy = rolePolicy();
  const eligible = user({ permissionConversion: { catalogVersion: 1 } });
  for (const category of categories) {
    assert.deepEqual(await salesCompletionApproverIds(txFor([eligible], policy), category, 'V1'), ['sc-1']);
  }

  const roleWithoutCollection = rolePolicy(categories.filter(category => category !== 'ACCOUNTING_COLLECTION'));
  assert.deepEqual(await salesCompletionApproverIds(txFor([eligible], roleWithoutCollection), 'ACCOUNTING_COLLECTION', 'V1'), []);
  const userDenied = user({
    permissionConversion: { catalogVersion: 1 },
    permissionOverrides: [{ userId: 'sc-1', permissionKey: 'CATEGORY:DELIVERY:RECEIVE', effect: 'DENY' }],
  });
  assert.deepEqual(await salesCompletionApproverIds(txFor([userDenied], policy), 'DELIVERY', 'V1'), []);
  assert.deepEqual(await salesCompletionApproverIds(txFor([user({ id: 'inactive', isActive: false })], policy), 'DELIVERY', 'V1'), []);
  assert.deepEqual(await salesCompletionApproverIds(txFor([eligible], policy), 'RMA', 'V1'), []);
});
