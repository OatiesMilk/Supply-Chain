import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AuthUser } from '../src/middleware/auth';
import { categoryActionRestriction, policyEntryRestricted, screenRestricted } from '../src/services/moduleAccessRules';
import { defaultRolePermissions, type PolicyRole } from '../src/services/permissionCatalog';
import { evaluatePermissions, hasActionPermission, type PermissionEvaluationInput } from '../src/services/permissionEvaluator';
import { sessionUser } from '../src/services/permissions';
import { canCreateCategory, canCreatePolicyCategory, canWriteCategory, canWritePolicyCategory, readableCategories } from '../src/services/recordAccess';

const CATEGORIES = ['DELIVERY', 'RMA', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'] as const;
type Category = typeof CATEGORIES[number];
type Access = { read: boolean; create: boolean; write: boolean };
const none: Access = { read: false, create: false, write: false };
const view: Access = { read: true, create: false, write: false };
const own: Access = { read: true, create: true, write: true };
const operate: Access = { read: true, create: false, write: true };

// Dylan's module access matrix (docs/plans/driver-job-cards-and-actions.md, section 4.1).
const MATRIX: Record<'SALES_COORDINATOR' | 'LOGISTICS' | 'TASS' | 'ADMIN', Record<Category, Access>> = {
  SALES_COORDINATOR: { DELIVERY: own, RMA: none, PROCUREMENT_PICKUP: own, SALES_ORDERS: own },
  // Logistics assigns and runs; RMA assignment is its own dedicated action (rma-assignment route).
  LOGISTICS: { DELIVERY: operate, RMA: view, PROCUREMENT_PICKUP: operate, SALES_ORDERS: operate },
  TASS: { DELIVERY: none, RMA: own, PROCUREMENT_PICKUP: none, SALES_ORDERS: none },
  ADMIN: { DELIVERY: view, RMA: view, PROCUREMENT_PICKUP: view, SALES_ORDERS: view },
};

const legacyUser = (role: string) => ({ ...sessionUser({ id: `u-${role}`, name: role, email: `${role}@example.test`, role, permissions: [] }), activeMode: 'LEGACY' } as unknown as AuthUser);
function v1Input(role: PolicyRole): PermissionEvaluationInput {
  return { userId: `u-${role}`, role, isActive: true, authorizationRevision: 1n, driverProfile: null,
    rolePolicy: { role, revision: 1n, catalogVersion: 1, permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ role, permissionKey, effect })) },
    overrides: [] };
}

test('legacy mode enforces the module access matrix for the four operational modules', () => {
  for (const [role, row] of Object.entries(MATRIX)) {
    const user = legacyUser(role);
    for (const category of CATEGORIES) {
      const expected = row[category];
      assert.equal(readableCategories(user).includes(category), expected.read, `${role} read ${category}`);
      assert.equal(canCreateCategory(user, category), expected.create, `${role} create ${category}`);
      assert.equal(canWriteCategory(user, category), expected.write, `${role} write ${category}`);
    }
  }
});

test('V1 mode applies the same matrix even when stored role policies still allow the old actions', () => {
  for (const [role, row] of Object.entries(MATRIX) as [PolicyRole, Record<Category, Access>][]) {
    const snapshot = evaluatePermissions(v1Input(role));
    assert.equal(snapshot.valid, true, `${role} policy stays valid`);
    for (const category of CATEGORIES) {
      const expected = row[category];
      assert.equal(snapshot.readableCategories.includes(category), expected.read, `${role} read ${category}`);
      assert.equal(canCreatePolicyCategory(snapshot, category), expected.create, `${role} create ${category}`);
      if (!expected.write) assert.equal(canWritePolicyCategory(snapshot, category), false, `${role} write ${category}`);
    }
  }
  const admin = evaluatePermissions(v1Input('ADMIN'));
  for (const category of CATEGORIES) for (const action of ['ASSIGN', 'STATUS', 'TIME_IN', 'POD', 'COMMENT', 'SUBMIT', 'COMPLETE', 'UPDATE'] as const) {
    assert.equal(hasActionPermission(admin, 'CATEGORY', category, action), false, `ADMIN ${category} ${action}`);
  }
  assert.equal(hasActionPermission(admin, 'CATEGORY', 'ACCOUNTING_COLLECTION', 'CREATE'), true, 'Accounting Collection is unchanged');
  assert.equal(hasActionPermission(admin, 'SCREEN', 'deliveries', 'WRITE'), false);
  assert.equal(hasActionPermission(admin, 'SCREEN', 'deliveries', 'READ'), true);
  assert.equal(hasActionPermission(evaluatePermissions(v1Input('LOGISTICS')), 'CATEGORY', 'DELIVERY', 'ASSIGN'), true, 'Logistics keeps driver assignment');
  assert.equal(evaluatePermissions(v1Input('TASS')).effectiveScreens.includes('procurement_pickup'), false);
});

test('rule helpers give plain reasons and never restrict reads', () => {
  assert.equal(categoryActionRestriction('ADMIN', 'SALES_ORDERS', 'WRITE'), 'Admin has view-only access to Sales Orders records.');
  assert.equal(categoryActionRestriction('LOGISTICS', 'PROCUREMENT_PICKUP', 'CREATE'), 'Only Sales Coordinator can create Procurement Pick-up records.');
  assert.equal(categoryActionRestriction('LOGISTICS', 'PROCUREMENT_PICKUP', 'ASSIGN'), null);
  assert.equal(categoryActionRestriction('SALES_COORDINATOR', 'DELIVERY', 'CREATE'), null);
  assert.equal(categoryActionRestriction('ADMIN', 'ACCOUNTING_COLLECTION', 'WRITE'), null);
  for (const role of ['ADMIN', 'LOGISTICS', 'TASS', 'SALES_COORDINATOR', 'DRIVER']) for (const category of CATEGORIES) assert.equal(categoryActionRestriction(role, category, 'READ'), null);
  assert.equal(screenRestricted('TASS', 'procurement_pickup'), true);
  assert.equal(screenRestricted('SALES_COORDINATOR', 'procurement_pickup'), false);
  assert.equal(policyEntryRestricted('ADMIN', { scope: 'SCREEN', module: 'rma', action: 'WRITE' }), true);
  assert.equal(policyEntryRestricted('ADMIN', { scope: 'SCREEN', module: 'admin', action: 'WRITE' }), false);
  assert.equal(policyEntryRestricted('ADMIN', { scope: 'RESOURCE', module: 'users', action: 'WRITE' }), false);
});
