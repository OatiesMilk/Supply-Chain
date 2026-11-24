import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AuthUser } from '../src/middleware/auth';
import { categoryActionRestriction, categoryRestricted, policyEntryRestricted, screenRestricted } from '../src/services/moduleAccessRules';
import { LEGACY_POLICY_DEFAULT_SCREENS, PERMISSION_CATALOG, POLICY_ROLES, defaultRolePermissions, roleActionCeiling, type PolicyRole } from '../src/services/permissionCatalog';
import { evaluatePermissions, type PermissionEvaluationInput } from '../src/services/permissionEvaluator';
import { ROLE_DEFAULTS, editableScreens, effectiveScreens, sessionUser } from '../src/services/permissions';
import { canCreateCategory, canCreatePolicyCategory, canReadPolicyRecord, canWriteCategory, canWritePolicyCategory, readableCategories, transactionCategories } from '../src/services/recordAccess';

// Feature 1 (TASS scope): TASS has no Accounting Collection module; Logistics owns collection verification.
const v1 = (role: PolicyRole, overrides: Record<string, 'ALLOW' | 'DENY'> = {}): PermissionEvaluationInput => ({
  userId: `u-${role}`, role, isActive: true, authorizationRevision: 1n, driverProfile: null,
  rolePolicy: { role, revision: 1n, catalogVersion: 1, permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ role, permissionKey, effect })) },
  overrides: Object.entries(overrides).map(([permissionKey, effect]) => ({ userId: `u-${role}`, permissionKey, effect })),
});
const legacy = (role: string, permissions: { screen: string; granted: boolean }[] = []) =>
  ({ ...sessionUser({ id: `u-${role}`, name: role, email: `${role}@example.test`, role, permissions }), activeMode: 'LEGACY' } as unknown as AuthUser);

test('frozen V1 baselines still list Accounting Collection for TASS; module rules remove it at runtime', () => {
  assert.ok(ROLE_DEFAULTS.TASS.includes('accounting_collection'), 'ROLE_DEFAULTS is a frozen migration baseline');
  assert.ok(LEGACY_POLICY_DEFAULT_SCREENS.TASS.includes('accounting_collection'), 'LEGACY_POLICY_DEFAULT_SCREENS is frozen');
  assert.equal(defaultRolePermissions('TASS').get('SCREEN:accounting_collection:READ'), 'ALLOW');
  assert.equal(screenRestricted('TASS', 'accounting_collection'), true);
  assert.equal(screenRestricted('TASS', 'procurement_pickup'), true);
  assert.equal(categoryRestricted('TASS', 'ACCOUNTING_COLLECTION'), true);
  assert.equal(categoryRestricted('TASS', 'PROCUREMENT_PICKUP'), true);
  assert.equal(categoryRestricted('TASS', 'RMA'), false);
  for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER']) {
    assert.equal(screenRestricted(role, 'accounting_collection'), false, role);
    assert.equal(categoryRestricted(role, 'ACCOUNTING_COLLECTION'), false, role);
  }
  // READ stays unrestricted by the per-action rule; the whole-category rule covers TASS.
  assert.equal(categoryActionRestriction('TASS', 'ACCOUNTING_COLLECTION', 'READ'), null);
  for (const action of ['READ', 'WRITE', 'CREATE', 'COMMENT', 'VERIFY_COLLECTION'] as const) {
    assert.equal(policyEntryRestricted('TASS', { scope: 'CATEGORY', module: 'ACCOUNTING_COLLECTION', action }), true, action);
    assert.equal(policyEntryRestricted('LOGISTICS', { scope: 'CATEGORY', module: 'ACCOUNTING_COLLECTION', action }), false, action);
  }
  assert.equal(policyEntryRestricted('TASS', { scope: 'SCREEN', module: 'accounting_collection', action: 'READ' }), true);
  assert.equal(policyEntryRestricted('TASS', { scope: 'CATEGORY', module: 'RMA', action: 'READ' }), false);
});

test('LEGACY: TASS loses the Accounting Collection screen and category even with a stored grant', () => {
  for (const permissions of [[], [{ screen: 'accounting_collection', granted: true }]]) {
    const user = legacy('TASS', permissions);
    assert.ok(!effectiveScreens('TASS', permissions).includes('accounting_collection'));
    assert.deepEqual(readableCategories(user), ['RMA']);
    assert.equal(canWriteCategory(user, 'ACCOUNTING_COLLECTION'), false);
    assert.equal(canCreateCategory(user, 'ACCOUNTING_COLLECTION'), false);
    assert.equal(canWriteCategory(user, 'RMA'), true);
  }
  assert.ok(!editableScreens('TASS').includes('accounting_collection'), 'Admin cannot re-grant it to TASS');
  assert.ok(editableScreens('LOGISTICS').includes('accounting_collection'));
  assert.deepEqual(transactionCategories('TASS'), ['RMA']);
  assert.deepEqual(transactionCategories('LOGISTICS'), ['DELIVERY', 'RMA', 'PROCUREMENT_PICKUP'], 'Logistics transaction scope is unchanged');
  assert.ok(readableCategories(legacy('LOGISTICS')).includes('ACCOUNTING_COLLECTION'));
});

test('V1: stored TASS Allows for Accounting Collection are narrowed by the module rule', () => {
  const tass = evaluatePermissions(v1('TASS', {
    'SCREEN:accounting_collection:READ': 'ALLOW', 'CATEGORY:ACCOUNTING_COLLECTION:READ': 'ALLOW',
    'CATEGORY:ACCOUNTING_COLLECTION:WRITE': 'ALLOW', 'CATEGORY:ACCOUNTING_COLLECTION:VERIFY_COLLECTION': 'ALLOW',
  }));
  assert.equal(tass.valid, true);
  assert.deepEqual(tass.readableCategories, ['RMA']);
  assert.ok(!tass.effectiveScreens.includes('accounting_collection'));
  for (const action of ['READ', 'WRITE', 'CREATE', 'COMMENT', 'VERIFY_COLLECTION']) {
    assert.equal(tass.decisions[`CATEGORY:ACCOUNTING_COLLECTION:${action}`].allowed, false, action);
  }
  assert.equal(canWritePolicyCategory(tass, 'ACCOUNTING_COLLECTION'), false);
  assert.equal(canCreatePolicyCategory(tass, 'ACCOUNTING_COLLECTION'), false);
  const row = { id: 'c', category: 'ACCOUNTING_COLLECTION', status: 'ACCOMPLISHED', draft: false, deletedAt: null, collectionVerified: false, driverId: null };
  assert.equal(canReadPolicyRecord(tass, row), false);
});

test('collection verification ceiling admits Logistics (and the frozen TASS baseline) only', () => {
  const entry = PERMISSION_CATALOG.find(p => p.key === 'CATEGORY:ACCOUNTING_COLLECTION:VERIFY_COLLECTION')!;
  const ceiling = Object.fromEntries(POLICY_ROLES.map(role => [role, roleActionCeiling(role, entry)]));
  assert.deepEqual(ceiling, { SALES_COORDINATOR: false, LOGISTICS: true, TASS: true, ADMIN: false, DRIVER: false });
  // The Logistics baseline does not grant it; Admin must grant it explicitly in V1.
  assert.equal(defaultRolePermissions('LOGISTICS').get(entry.key), 'DENY');
  const granted = evaluatePermissions(v1('LOGISTICS', { [entry.key]: 'ALLOW' }));
  assert.equal(granted.decisions[entry.key].allowed, true);
});
