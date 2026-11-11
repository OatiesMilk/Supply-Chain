import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import {
  actionPermissionInputError, evaluatePermissions, hasActionPermission, loadEffectivePermissions,
  permissionSnapshot, type EffectivePermissionSnapshot, type PermissionEvaluationInput,
} from '../src/services/permissions';
import {
  PERMISSION_CATALOG, POLICY_ROLES, POLICY_SCREENS, defaultRolePermissions,
  type PolicyRole,
} from '../src/services/permissionCatalog';
import { planPermissionConversion } from '../src/services/permissionBackfill';
import {
  canCreatePolicyCategory, canPerformPolicyRecordAction, canReadPolicyRecord, canWritePolicyCategory,
  policyRecordScope, readablePolicyCategories, readableCategories,
  type PolicyRecord, type PolicyRecordPath, type RmaTransportContext,
} from '../src/services/recordAccess';
import {
  canAccessPolicyInventoryTransactions, canAccessPolicyTransactions, policyTransactionRecordScope,
} from '../src/services/transactionAccess';
import type { AuthUser } from '../src/middleware/auth';

function input(role: PolicyRole = 'LOGISTICS'): PermissionEvaluationInput {
  return {
    userId: 'account', role, isActive: true, authorizationRevision: 9007199254740993n,
    driverProfile: role === 'DRIVER' ? { id: 'profile-one', type: 'DRIVER', isActive: true } : null,
    rolePolicy: { role, revision: 9223372036854775807n, catalogVersion: 1,
      permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ role, permissionKey, effect })) },
    overrides: [],
  };
}
function withEffects(source: PermissionEvaluationInput, values: Record<string, string>, defaults = false) {
  if (defaults) source.rolePolicy!.permissions = source.rolePolicy!.permissions.map(row => ({ ...row, effect: values[row.permissionKey] ?? row.effect }));
  else source.overrides = Object.entries(values).map(([permissionKey, effect]) => ({ userId: source.userId, permissionKey, effect }));
  return source;
}
const can = (snapshot: EffectivePermissionSnapshot, key: string) => snapshot.decisions[key]?.allowed ?? false;
const now = new Date('2026-10-28T01:00:00Z');
const delivery = (changes: Partial<PolicyRecord> = {}): PolicyRecord => ({ id: 'run', category: 'DELIVERY', driverId: 'profile-one', driver: 'Display name',
  draft: false, deletedAt: null, status: 'SCHEDULED', deliveryDate: '2026-10-28', ...changes });
const transport: RmaTransportContext = { requiresLogistics: true, requiresInternalDriver: true, eligible: true, actionAllowed: true };
function enabledDriverRma() {
  return evaluatePermissions(withEffects(input('DRIVER'), Object.fromEntries(['READ', 'WRITE', 'STATUS', 'TIME_IN', 'POD', 'COMMENT'].map(action => [`CATEGORY:RMA:${action}`, 'ALLOW']))));
}

// Interpret the emitted Prisma constraints against fixtures; asserting only the
// presence of a category/driverId key would miss a broad OR/AND bypass.
function matches(record: Record<string, unknown>, predicate: any): boolean {
  if (!predicate || typeof predicate !== 'object') return false;
  if (predicate.AND && !(Array.isArray(predicate.AND) ? predicate.AND : [predicate.AND]).every((part: any) => matches(record, part))) return false;
  if (predicate.OR && !predicate.OR.some((part: any) => matches(record, part))) return false;
  return Object.entries(predicate).every(([key, value]: [string, any]) => {
    if (key === 'AND' || key === 'OR') return true;
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(record[key]);
    return record[key] === value;
  });
}

for (const [role, expectedCategories] of [
  ['SALES_COORDINATOR', ['DELIVERY', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS']],
  ['LOGISTICS', ['DELIVERY', 'RMA', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS']],
  ['TASS', ['RMA', 'ACCOUNTING_COLLECTION']],
  ['ADMIN', ['DELIVERY', 'RMA', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS']],
  ['DRIVER', ['DELIVERY', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS']],
] as const) test(`${role} baseline exposes a complete typed snapshot with independently expected categories`, () => {
  const source = input(role);
  assert.equal(actionPermissionInputError(source), null);
  const snapshot = evaluatePermissions(source);
  assert.equal(snapshot.valid, true);
  assert.equal(Object.keys(snapshot.decisions).length, PERMISSION_CATALOG.length);
  assert.deepEqual(snapshot.readableCategories, expectedCategories);
  assert.deepEqual(snapshot.effectiveScreens, permissionSnapshot(role, []).effectiveScreens);
  assert.equal(snapshot.authorizationRevision, '9007199254740993');
  assert.equal(snapshot.rolePolicyRevision, '9223372036854775807');
  assert.equal(typeof JSON.parse(JSON.stringify(snapshot)).authorizationRevision, 'string');
  for (const entry of PERMISSION_CATALOG) {
    const modules = entry.scope === 'SCREEN' ? snapshot.capabilities.screens : entry.scope === 'RESOURCE' ? snapshot.capabilities.resources : snapshot.capabilities.categories;
    assert.equal((modules as any)[entry.module].actions[entry.action], snapshot.decisions[entry.key].allowed);
  }
});

test('Inherit follows defaults; explicit Allow survives later default changes; Deny overrides Allow defaults', () => {
  const source = withEffects(input(), { 'SCREEN:inventory:READ': 'ALLOW', 'CATEGORY:DELIVERY:READ': 'DENY' });
  const before = structuredClone(source.overrides);
  const snapshot = evaluatePermissions(source);
  assert.equal(can(snapshot, 'SCREEN:inventory:READ'), true);
  assert.equal(snapshot.decisions['SCREEN:inventory:READ'].source, 'USER_OVERRIDE');
  assert.equal(snapshot.decisions['SCREEN:inventory:READ'].overrideEffect, 'ALLOW');
  assert.equal(can(snapshot, 'CATEGORY:DELIVERY:READ'), false);
  assert.equal(snapshot.decisions['CATEGORY:DELIVERY:READ'].reasons[0], 'USER_DENY');
  withEffects(source, { 'SCREEN:inventory:READ': 'ALLOW' }, true);
  assert.equal(evaluatePermissions(source).decisions['SCREEN:inventory:READ'].overrideEffect, 'ALLOW');
  withEffects(source, { 'SCREEN:inventory:READ': 'DENY' }, true);
  assert.equal(can(evaluatePermissions(source), 'SCREEN:inventory:READ'), true);
  source.overrides = [];
  assert.equal(can(evaluatePermissions(source), 'SCREEN:inventory:READ'), false);
  assert.equal(before[0].effect, 'ALLOW');
});

test('every missing role-policy row fails the whole snapshot closed', () => {
  for (const entry of PERMISSION_CATALOG) {
    const source = input('ADMIN');
    source.rolePolicy!.permissions = source.rolePolicy!.permissions.filter(row => row.permissionKey !== entry.key);
    const snapshot = evaluatePermissions(source);
    assert.equal(snapshot.valid, false, entry.key);
    assert.ok(Object.values(snapshot.decisions).every(decision => !decision.allowed), entry.key);
    assert.ok(actionPermissionInputError(source));
  }
});

test('unknown, duplicate, malformed, mismatched and unsupported policy data never grants access', () => {
  const bad: unknown[] = [null, undefined, {}, { ...input(), role: 'UNKNOWN' }, { ...input(), userId: '' }, { ...input(), isActive: false },
    { ...input(), rolePolicy: null }, { ...input(), overrides: null }];
  for (const change of [{ role: 'TASS' }, { revision: 0n }, { revision: '01' }, { revision: 1 }, { revision: '9223372036854775808' }, { catalogVersion: 2 }, { permissions: [] }]) {
    const source = input(); bad.push({ ...source, rolePolicy: { ...source.rolePolicy, ...change } });
  }
  for (const rows of [[null], [{ permissionKey: 'constructor', effect: 'ALLOW' }], [{ permissionKey: 'CATEGORY:DELIVERY:READ', effect: 'INHERIT' }],
    [{ permissionKey: 'CATEGORY:DELIVERY:READ', effect: 'ALLOW', userId: 'another' }],
    [{ permissionKey: 'CATEGORY:DELIVERY:READ', effect: 'ALLOW' }, { permissionKey: 'CATEGORY:DELIVERY:READ', effect: 'DENY' }]]) bad.push({ ...input(), overrides: rows });
  const duplicate = input(); duplicate.rolePolicy!.permissions = [...duplicate.rolePolicy!.permissions, duplicate.rolePolicy!.permissions[0]]; bad.push(duplicate);
  const wrongRoleRow = input(); wrongRoleRow.rolePolicy!.permissions = wrongRoleRow.rolePolicy!.permissions.map((row, index) => index ? row : { ...row, role: 'TASS' }); bad.push(wrongRoleRow);
  for (const value of bad) {
    const snapshot = evaluatePermissions(value as PermissionEvaluationInput);
    assert.equal(snapshot.valid, false);
    assert.ok(Object.values(snapshot.decisions).every(decision => !decision.allowed));
    assert.deepEqual(snapshot.effectiveScreens, []);
  }
  for (const value of [0n, -1n, '', '1.5', '+1', ' 1', '01', 1, Number.MAX_SAFE_INTEGER + 1, '9223372036854775808']) {
    assert.equal(evaluatePermissions({ ...input(), authorizationRevision: value } as any).valid, false);
  }
  const snapshot = evaluatePermissions(input());
  assert.equal(hasActionPermission(snapshot, 'CATEGORY', 'constructor', 'READ'), false);
  assert.equal(hasActionPermission(snapshot, 'RESOURCE', 'records', 'WRITE'), false, 'No invented generic record WRITE key');
});

test('new Write-without-Read and operation-without-Write inputs reject; stored combinations cannot grant operations', () => {
  for (const values of [
    { 'CATEGORY:DELIVERY:READ': 'DENY', 'CATEGORY:DELIVERY:WRITE': 'ALLOW', 'CATEGORY:DELIVERY:STATUS': 'ALLOW' },
    { 'CATEGORY:DELIVERY:WRITE': 'DENY', 'CATEGORY:DELIVERY:STATUS': 'ALLOW' },
  ]) {
    const source = withEffects(input(), values);
    assert.match(actionPermissionInputError(source)!, /Read|Write/);
    const snapshot = evaluatePermissions(source);
    assert.equal(can(snapshot, 'CATEGORY:DELIVERY:STATUS'), false);
    assert.ok(snapshot.decisions['CATEGORY:DELIVERY:STATUS'].reasons.some(reason => ['READ_REQUIRED', 'WRITE_REQUIRED'].includes(reason)));
  }
  const source = withEffects(input(), { 'CATEGORY:DELIVERY:READ': 'DENY' }, true);
  assert.match(actionPermissionInputError(source)!, /Read/);
  assert.equal(can(evaluatePermissions(source), 'CATEGORY:DELIVERY:WRITE'), false);
});

test('immutable ceilings defeat forged policy grants for Sales RMA, TASS scope, Logistics creation and deletion', () => {
  const forbidden: Array<[PolicyRole, string]> = [
    ['SALES_COORDINATOR', 'CATEGORY:RMA:READ'], ['TASS', 'CATEGORY:PROCUREMENT_PICKUP:READ'], ['LOGISTICS', 'CATEGORY:DELIVERY:CREATE'],
    ['LOGISTICS', 'CATEGORY:RMA:UPDATE'], ['LOGISTICS', 'CATEGORY:RMA:COMPLETE'], ['ADMIN', 'CATEGORY:RMA:RECEIVE'],
    ['DRIVER', 'SCREEN:admin:READ'], ['DRIVER', 'RESOURCE:skus:READ'],
  ];
  for (const role of POLICY_ROLES) forbidden.push([role, 'CATEGORY:DELIVERY:DELETE']);
  for (const [role, key] of forbidden) {
    for (const defaults of [false, true]) {
      const source = withEffects(input(role), { [key]: 'ALLOW' }, defaults);
      assert.match(actionPermissionInputError(source)!, /cannot allow/);
      assert.equal(can(evaluatePermissions(source), key), false, `${role} ${key}`);
    }
  }
});

test('ADMIN management stays protected without providing a business-operation bypass', () => {
  const source = input('ADMIN');
  const keys = ['SCREEN:admin:READ', 'SCREEN:admin:WRITE', 'RESOURCE:admin:READ', 'RESOURCE:admin:WRITE', 'RESOURCE:users:READ', 'RESOURCE:users:WRITE', 'RESOURCE:users:UPDATE'];
  withEffects(source, Object.fromEntries(keys.map(key => [key, 'DENY'])));
  assert.match(actionPermissionInputError(source)!, /protected/);
  const snapshot = evaluatePermissions(source);
  for (const key of keys) {
    assert.equal(can(snapshot, key), true, key);
    assert.equal(snapshot.decisions[key].source, 'PROTECTED_ADMIN');
    assert.equal(snapshot.decisions[key].overrideEffect, 'DENY', 'Preserve provenance of invalid stored data');
  }
  assert.equal(can(snapshot, 'CATEGORY:RMA:COMPLETE'), false);
  assert.equal(can(snapshot, 'CATEGORY:ACCOUNTING_COLLECTION:VERIFY_COLLECTION'), false);
});

test('navigation and category access remain independent without synthesizing new screens', () => {
  const source = withEffects(input('LOGISTICS'), { 'SCREEN:deliveries:READ': 'DENY', 'SCREEN:deliveries:WRITE': 'DENY' });
  const snapshot = evaluatePermissions(source);
  assert.equal(snapshot.effectiveScreens.includes('deliveries'), false);
  assert.equal(canReadPolicyRecord(snapshot, delivery(), { path: 'calendar' }), true);
  assert.equal(canReadPolicyRecord(snapshot, delivery(), { path: 'deliveries' }), false);
  assert.equal(canWritePolicyCategory(snapshot, 'DELIVERY', 'deliveries'), false);
  assert.equal(canWritePolicyCategory(snapshot, 'DELIVERY', 'calendar'), true);
  assert.equal(can(snapshot, 'SCREEN:deliveries:READ'), false);
});

test('category Read denial dominates aggregate, scheduling, report, generic-resource and transaction queries', () => {
  const source = withEffects(input(), { 'CATEGORY:DELIVERY:READ': 'DENY' });
  const snapshot = evaluatePermissions(source);
  const rows = [delivery(), delivery({ id: 'other-category', category: 'PROCUREMENT_PICKUP' }), delivery({ id: 'deleted', category: 'PROCUREMENT_PICKUP', deletedAt: new Date() })];
  for (const path of ['main', 'dashboard', 'calendar', 'driver', 'driver_board', 'statistical_reports', 'records', 'transactions'] as PolicyRecordPath[]) {
    assert.equal(canReadPolicyRecord(snapshot, delivery(), { path }), false, path);
    assert.equal(canPerformPolicyRecordAction(snapshot, delivery(), 'COMMENT', { path }), false, path);
    assert.equal(canWritePolicyCategory(snapshot, 'DELIVERY', path), false, path);
    assert.deepEqual(rows.filter(row => matches(row as any, policyRecordScope(snapshot, path))).map(row => row.id), ['other-category'], path);
  }
  assert.deepEqual(rows.filter(row => matches(row as any, policyTransactionRecordScope(snapshot))).map(row => row.id), ['other-category']);
});

test('category Write denial permits reads and blocks every allowed scheduling mutation', () => {
  const snapshot = evaluatePermissions(withEffects(input(), { 'CATEGORY:DELIVERY:WRITE': 'DENY' }));
  for (const path of ['deliveries', 'calendar', 'driver', 'driver_board', 'records'] as PolicyRecordPath[]) {
    assert.equal(canReadPolicyRecord(snapshot, delivery(), { path }), true);
    assert.equal(canPerformPolicyRecordAction(snapshot, delivery(), 'ASSIGN', { path }), false);
    assert.equal(canPerformPolicyRecordAction(snapshot, delivery(), 'TIME_IN', { path }), false);
    assert.equal(canPerformPolicyRecordAction(snapshot, delivery(), 'POD', { path }), false);
  }
});

test('shared supplier and SKU lookup Read never synthesizes management Write', () => {
  const tass = evaluatePermissions(input('TASS'));
  assert.equal(tass.capabilities.resources.suppliers.read, true);
  assert.equal(tass.capabilities.resources.suppliers.write, false);
  assert.equal(tass.capabilities.categories.PROCUREMENT_PICKUP.read, false);
  const logistics = evaluatePermissions(input());
  assert.equal(logistics.capabilities.resources.skus.read, true);
  assert.equal(can(logistics, 'RESOURCE:skus:ADJUST'), false);
  const source = withEffects(input(), { 'RESOURCE:skus:WRITE': 'ALLOW', 'RESOURCE:skus:ADJUST': 'ALLOW' });
  assert.match(actionPermissionInputError(source)!, /Module Write/);
  assert.equal(can(evaluatePermissions(source), 'RESOURCE:skus:ADJUST'), false, 'Explicit resource grants still require SKU Master');
  source.overrides = [...source.overrides, { permissionKey: 'SCREEN:inventory:READ', effect: 'ALLOW' }, { permissionKey: 'SCREEN:inventory:WRITE', effect: 'ALLOW' }];
  assert.equal(actionPermissionInputError(source), null);
  assert.equal(can(evaluatePermissions(source), 'RESOURCE:skus:ADJUST'), true);
});

test('driver profile identity must be active, linked and of DRIVER type; names do not decide ownership', () => {
  for (const driverProfile of [null, { id: '', type: 'DRIVER', isActive: true }, { id: 'profile-one', type: 'ASSISTANT', isActive: true }, { id: 'profile-one', type: 'DRIVER', isActive: false }]) {
    const snapshot = evaluatePermissions({ ...input('DRIVER'), driverProfile });
    assert.equal(snapshot.driverProfileId, null);
    assert.deepEqual(snapshot.readableCategories, []);
    assert.equal(canAccessPolicyTransactions(snapshot), false);
    assert.equal(canReadPolicyRecord(snapshot, delivery()), false);
    assert.equal(matches(delivery() as any, policyRecordScope(snapshot)), false);
  }
  const snapshot = evaluatePermissions(input('DRIVER'));
  assert.equal(canReadPolicyRecord(snapshot, delivery({ driver: 'Unrelated name' })), true);
  for (const row of [delivery({ driverId: 'other' }), delivery({ driverId: null }), delivery({ draft: true }), delivery({ draft: undefined })]) {
    assert.equal(canReadPolicyRecord(snapshot, row), false);
    assert.equal(canPerformPolicyRecordAction(snapshot, row, 'POD', { now }), false);
  }
});

test('driver list and transaction scopes enforce ownership, draft, deletion and category together', () => {
  const snapshot = evaluatePermissions(withEffects(input('DRIVER'), { 'CATEGORY:SALES_ORDERS:READ': 'DENY' }));
  const rows = [delivery({ id: 'own' }), delivery({ id: 'other', driverId: 'other' }), delivery({ id: 'unassigned', driverId: null }),
    delivery({ id: 'draft', draft: true }), delivery({ id: 'deleted', deletedAt: new Date() }), delivery({ id: 'rma', category: 'RMA' }),
    delivery({ id: 'denied-category', category: 'SALES_ORDERS' }), delivery({ id: 'unknown', category: 'UNKNOWN' })];
  for (const scope of [policyRecordScope(snapshot, 'driver_dashboard'), policyTransactionRecordScope(snapshot)]) {
    assert.deepEqual(rows.filter(row => matches(row as any, scope)).map(row => row.id), ['own']);
  }
});

test('driver Delivery actions preserve future-date, invalid-date and started-run rules in Manila', () => {
  const snapshot = evaluatePermissions(input('DRIVER'));
  assert.equal(canPerformPolicyRecordAction(snapshot, delivery(), 'TIME_IN', { now }), true);
  assert.equal(canPerformPolicyRecordAction(snapshot, delivery({ deliveryDate: '2026-10-27' }), 'POD', { now }), true, 'Overdue actions remain available');
  for (const deliveryDate of ['', '2026-02-30', '2026-10-29']) {
    const row = delivery({ deliveryDate });
    assert.equal(canReadPolicyRecord(snapshot, row), true, 'Upcoming records remain viewable');
    for (const action of ['POD', 'COMMENT', 'TIME_IN'] as const) assert.equal(canPerformPolicyRecordAction(snapshot, row, action, { now }), false);
  }
  assert.equal(canPerformPolicyRecordAction(snapshot, delivery({ deliveryDate: '2026-10-29', timeIn: '2026-10-27T01:00:00Z' }), 'POD', { now }), true, 'Existing started runs retain established lifecycle behavior');
  assert.equal(canPerformPolicyRecordAction(snapshot, delivery({ status: 'ACCOMPLISHED' }), 'TIME_IN', { now }), false);
});

test('RMA transport remains denied in baseline and enabling a ceiling still requires trusted movement context', () => {
  const row = delivery({ category: 'RMA', rmaType: 'Return to Customer' } as any);
  const baseline = evaluatePermissions(input('DRIVER'));
  assert.equal(canReadPolicyRecord(baseline, row, { rmaTransport: transport }), false);
  const enabled = enabledDriverRma();
  assert.equal(canReadPolicyRecord(enabled, row), false);
  assert.equal(canReadPolicyRecord(enabled, row, { rmaTransport: transport }), true);
  assert.equal(canPerformPolicyRecordAction(enabled, row, 'POD', { rmaTransport: transport }), true);
  for (const changed of [{ requiresLogistics: false }, { requiresInternalDriver: false }, { eligible: false }]) {
    const context = { ...transport, ...changed };
    assert.equal(canReadPolicyRecord(enabled, row, { rmaTransport: context }), false);
    assert.equal(canPerformPolicyRecordAction(enabled, row, 'TIME_IN', { rmaTransport: context }), false);
  }
  assert.equal(canPerformPolicyRecordAction(enabled, row, 'POD', { rmaTransport: { ...transport, actionAllowed: false } }), false);
  assert.equal(canPerformPolicyRecordAction(enabled, row, 'COMPLETE', { rmaTransport: transport }), false);
  assert.equal(canPerformPolicyRecordAction(enabled, row, 'STATUS', { targetStatus: 'Delivered', rmaTransport: transport }), false);
  assert.equal(matches(row as any, policyRecordScope(enabled)), false, 'No broad RMA list while eligibility has no persisted schema field');
  assert.equal(matches(row as any, policyRecordScope(enabled, 'records', ['run'])), true);
  assert.equal(matches({ ...row, id: 'other-movement' } as any, policyRecordScope(enabled, 'records', ['run'])), false);
});

test('Logistics RMA assignment is bounded; internal/non-Logistics movements remain viewable without driver writes', () => {
  const source = withEffects(input(), { 'CATEGORY:RMA:WRITE': 'ALLOW', 'CATEGORY:RMA:ASSIGN': 'ALLOW' });
  const snapshot = evaluatePermissions(source);
  const row = delivery({ category: 'RMA' });
  assert.equal(canReadPolicyRecord(snapshot, row), true);
  assert.equal(canPerformPolicyRecordAction(snapshot, row, 'ASSIGN'), false);
  assert.equal(canPerformPolicyRecordAction(snapshot, row, 'ASSIGN', { rmaTransport: transport }), true);
  for (const context of [{ ...transport, requiresLogistics: false }, { ...transport, requiresInternalDriver: false }]) {
    assert.equal(canReadPolicyRecord(snapshot, row, { rmaTransport: context }), true);
    assert.equal(canPerformPolicyRecordAction(snapshot, row, 'ASSIGN', { rmaTransport: context }), false);
  }
  for (const action of ['UPDATE', 'POD', 'STATUS', 'RECEIVE', 'COMPLETE'] as const) assert.equal(canPerformPolicyRecordAction(snapshot, row, action, { rmaTransport: transport, targetStatus: 'Delivered' }), false);
});

test('TASS alone may receive/finalize RMA; STATUS Delivered cannot bypass COMPLETE restriction', () => {
  const row = delivery({ category: 'RMA', driverId: null, driver: '', timeIn: null, timeOut: null });
  for (const role of ['ADMIN', 'LOGISTICS', 'SALES_COORDINATOR', 'DRIVER'] as const) {
    const snapshot = evaluatePermissions(input(role));
    assert.equal(canPerformPolicyRecordAction(snapshot, row, 'RECEIVE'), false, role);
    assert.equal(canPerformPolicyRecordAction(snapshot, row, 'COMPLETE'), false, role);
    assert.equal(canPerformPolicyRecordAction(snapshot, row, 'STATUS', { targetStatus: 'Delivered' }), false, role);
  }
  const tass = evaluatePermissions(input('TASS'));
  assert.equal(canPerformPolicyRecordAction(tass, row, 'RECEIVE'), true);
  assert.equal(canPerformPolicyRecordAction(tass, row, 'COMPLETE'), true);
  assert.equal(canPerformPolicyRecordAction(tass, row, 'STATUS', { targetStatus: 'Delivered' }), true);
  assert.equal(row.timeIn, null, 'Authorization does not fabricate clocks/assignment');
});

test('explicit COMPLETE Deny also blocks STATUS Delivered for ordinary Delivery records', () => {
  const snapshot = evaluatePermissions(withEffects(input(), { 'CATEGORY:DELIVERY:COMPLETE': 'DENY' }));
  const row = delivery({ status: 'IN_TRANSIT', timeIn: '2026-10-28T00:00:00Z' });
  assert.equal(can(snapshot, 'CATEGORY:DELIVERY:STATUS'), true);
  assert.equal(canPerformPolicyRecordAction(snapshot, row, 'STATUS', { targetStatus: 'Delivered' }), false);
  assert.equal(canPerformPolicyRecordAction(snapshot, row, 'COMPLETE'), false);
  assert.equal(canPerformPolicyRecordAction(snapshot, row, 'STATUS', { targetStatus: 'On-Hold' }), true);
});

test('Driver Dashboard cannot bypass a category denial and eligible RMA transport is not restricted to RTS', () => {
  const denied = evaluatePermissions(withEffects(input('DRIVER'), { 'CATEGORY:DELIVERY:READ': 'DENY' }));
  assert.equal(can(denied, 'SCREEN:driver_dashboard:READ'), true);
  assert.equal(canReadPolicyRecord(denied, delivery(), { path: 'driver_dashboard' }), false);
  assert.equal(matches(delivery() as any, policyRecordScope(denied, 'driver_dashboard')), false);
  const enabled = enabledDriverRma();
  for (const rmaType of ['Return to Supplier', 'Return to Customer', 'Pull-Out Slip', 'Pick-Up']) {
    const row = { ...delivery({ category: 'RMA' }), rmaType };
    assert.equal(canReadPolicyRecord(enabled, row, { rmaTransport: transport }), true, rmaType);
    assert.equal(canPerformPolicyRecordAction(enabled, row, 'POD', { rmaTransport: transport }), true, rmaType);
  }
});

test('Accounting verification requires TASS, category Write and accomplished/unverified state', () => {
  const row = delivery({ category: 'ACCOUNTING_COLLECTION', status: 'ACCOMPLISHED', collectionVerified: false });
  const snapshot = evaluatePermissions(input('TASS'));
  assert.equal(canPerformPolicyRecordAction(snapshot, row, 'VERIFY_COLLECTION'), true);
  for (const changed of [{ collectionVerified: true }, { collectionVerified: undefined }, { status: 'SCHEDULED' }, { draft: true }]) {
    assert.equal(canPerformPolicyRecordAction(snapshot, { ...row, ...changed }, 'VERIFY_COLLECTION'), false);
  }
  assert.equal(canPerformPolicyRecordAction(evaluatePermissions(withEffects(input('TASS'), { 'CATEGORY:ACCOUNTING_COLLECTION:WRITE': 'DENY' })), row, 'VERIFY_COLLECTION'), false);
  assert.equal(canPerformPolicyRecordAction(evaluatePermissions(input('ADMIN')), row, 'VERIFY_COLLECTION'), false);
  assert.equal(canCreatePolicyCategory(snapshot, 'ACCOUNTING_COLLECTION'), true);
  assert.equal(canPerformPolicyRecordAction(snapshot, row, 'UPDATE'), false);
});

test('transaction scope and instance reads agree on independently specified role category ceilings', () => {
  const expected: Record<PolicyRole, string[]> = {
    SALES_COORDINATOR: ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'], LOGISTICS: ['DELIVERY', 'RMA', 'PROCUREMENT_PICKUP'],
    TASS: ['RMA', 'ACCOUNTING_COLLECTION'], ADMIN: ['DELIVERY', 'RMA', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'],
    DRIVER: ['DELIVERY', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'],
  };
  const categories = ['DELIVERY', 'RMA', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'];
  for (const role of POLICY_ROLES) {
    const snapshot = evaluatePermissions(input(role));
    const rows = categories.map(category => delivery({ category }));
    assert.equal(canAccessPolicyTransactions(snapshot), true);
    assert.equal(canAccessPolicyInventoryTransactions(snapshot), ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS'].includes(role));
    assert.deepEqual(rows.filter(row => canReadPolicyRecord(snapshot, row, { path: 'transactions' })).map(row => row.category), expected[role]);
    assert.deepEqual(rows.filter(row => matches(row as any, policyTransactionRecordScope(snapshot))).map(row => row.category), expected[role]);
  }
});

test('Sales submission and Delivery creation remain narrower than general category Write', () => {
  const sc = evaluatePermissions(input('SALES_COORDINATOR'));
  assert.equal(canCreatePolicyCategory(sc, 'DELIVERY'), true);
  assert.equal(canCreatePolicyCategory(evaluatePermissions(input()), 'DELIVERY'), false);
  assert.equal(canPerformPolicyRecordAction(sc, delivery({ draft: true }), 'SUBMIT'), true);
  assert.equal(canPerformPolicyRecordAction(sc, delivery(), 'STATUS', { targetStatus: 'On-Hold' }), false);
  assert.equal(canPerformPolicyRecordAction(sc, delivery(), 'STATUS', { targetStatus: 'Draft' }), true);
});

test('explicit SUBMIT Deny cannot be bypassed through the generic STATUS action', () => {
  const snapshot = evaluatePermissions(withEffects(input('SALES_COORDINATOR'), { 'CATEGORY:DELIVERY:SUBMIT': 'DENY' }));
  const row = delivery({ draft: true });
  assert.equal(can(snapshot, 'CATEGORY:DELIVERY:STATUS'), true);
  assert.equal(canPerformPolicyRecordAction(snapshot, row, 'SUBMIT'), false);
  assert.equal(canPerformPolicyRecordAction(snapshot, row, 'STATUS', { targetStatus: 'Scheduled' }), false);
  assert.equal(canPerformPolicyRecordAction(snapshot, delivery(), 'STATUS', { targetStatus: 'Draft' }), false);
});

test('migrated navigation/category behavior matches the independent legacy helpers for 4005 override fixtures', () => {
  let comparisons = 0;
  for (const role of POLICY_ROLES) {
    const grants = POLICY_SCREENS.flatMap(screen => [true, false].map(granted => ({ id: `${screen}:${granted}`, screen, granted })));
    const cases = [[], ...grants.map(grant => [grant])];
    for (let a = 0; a < grants.length; a++) for (let b = a + 1; b < grants.length; b++) if (grants[a].screen !== grants[b].screen) cases.push([grants[a], grants[b]]);
    for (const permissions of cases) {
      const source = input(role);
      source.overrides = planPermissionConversion({ id: 'account', role, permissions }).overrides;
      const snapshot = evaluatePermissions(source);
      const legacy = permissionSnapshot(role, permissions);
      assert.deepEqual(snapshot.effectiveScreens, legacy.effectiveScreens, `${role} navigation`);
      assert.deepEqual(snapshot.readableCategories, readableCategories({ ...legacy, role } as AuthUser), `${role} categories`);
      comparisons++;
    }
  }
  assert.equal(comparisons, 4005);
});

test('loader selects only permission context, reads a coherent revision and reloads later changes', async () => {
  let source = input();
  const selections: any[] = [];
  const transactions: any[] = [];
  let missing = false;
  const db = { $transaction: async (callback: any, options: any) => {
    transactions.push(options);
    const captured = structuredClone(source);
    return callback({
      user: { findUnique: async (args: any) => {
        selections.push(args.select);
        return missing ? null : { id: captured.userId, role: captured.role, isActive: captured.isActive,
          authorizationRevision: captured.authorizationRevision, permissionOverrides: captured.overrides, driverProfile: captured.driverProfile };
      } },
      rolePolicy: { findUnique: async ({ where }: any) => { assert.equal(where.role, captured.role); return captured.rolePolicy; } },
    });
  } } as unknown as PrismaClient;
  const first = (await loadEffectivePermissions(db, 'account'))!;
  assert.equal(can(first, 'CATEGORY:DELIVERY:READ'), true);
  source = withEffects(input(), { 'CATEGORY:DELIVERY:READ': 'DENY' }); source.authorizationRevision = 9007199254740994n;
  const next = (await loadEffectivePermissions(db, 'account'))!;
  assert.equal(can(next, 'CATEGORY:DELIVERY:READ'), false);
  assert.equal(next.authorizationRevision, '9007199254740994');
  assert.equal(first.authorizationRevision, '9007199254740993');
  assert.deepEqual(transactions, [{ isolationLevel: 'RepeatableRead' }, { isolationLevel: 'RepeatableRead' }]);
  assert.equal(selections[0].password, undefined);
  assert.deepEqual(selections[0].driverProfile.select, { id: true, type: true, isActive: true });
  missing = true;
  assert.equal(await loadEffectivePermissions(db, 'missing'), null);
});
