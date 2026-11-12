import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparePermissionRehearsal, type RehearsalAccount } from '../src/services/permissionRehearsal';
import { evaluatePermissions, type PermissionEvaluationInput } from '../src/services/permissionEvaluator';
import { planPermissionConversion } from '../src/services/permissionBackfill';
import { defaultRolePermissions, POLICY_ROLES, type PolicyRole } from '../src/services/permissionCatalog';
import { rehearsalAdminTarget } from '../prisma/rehearse-permissions';

function fixture(role: PolicyRole, screens: Record<string, boolean> = {}, linked = true): RehearsalAccount {
  return { id: `rehearsal-${role}`, role, isActive: true,
    permissions: Object.entries(screens).map(([screen, granted]) => ({ id: screen, screen, granted })),
    driverProfile: role === 'DRIVER' && linked ? { id: 'driver-profile', type: 'DRIVER', isActive: true } : null };
}
function input(account: RehearsalAccount): PermissionEvaluationInput {
  return { userId: account.id, role: account.role, isActive: account.isActive, authorizationRevision: '1', driverProfile: account.driverProfile,
    overrides: planPermissionConversion(account).overrides,
    rolePolicy: { role: account.role, revision: '1', catalogVersion: 1,
      permissions: [...defaultRolePermissions(account.role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) } };
}

test('rehearsal matrix preserves five roles, exceptions, scheduling, lookups and ownership', () => {
  for (const role of POLICY_ROLES) for (const screens of [{}, { deliveries: false, calendar: true }, { inventory: true, suppliers: false }, { admin: true, unknown: true }]) {
    const account = fixture(role, screens);
    const report = comparePermissionRehearsal(account, evaluatePermissions(input(account)));
    assert.deepEqual(report.expansions, [], `${role} expansion`);
    assert.deepEqual(report.regressions, [], `${role} regression`);
    assert.deepEqual(report.intentionalTightening, []);
    assert.ok(report.comparisons > 150);
  }
  const tass = evaluatePermissions(input(fixture('TASS')));
  assert.ok(tass.effectiveScreens.includes('procurement_pickup'));
  assert.equal(tass.capabilities.categories.PROCUREMENT_PICKUP.read, false);
  assert.equal(tass.capabilities.resources.suppliers.read, true);
  assert.equal(tass.capabilities.resources.suppliers.write, false);
  assert.equal(tass.capabilities.categories.RMA.actions.COMPLETE, true);
  const logistics = evaluatePermissions(input(fixture('LOGISTICS')));
  assert.equal(logistics.capabilities.categories.DELIVERY.actions.CREATE, false);
  assert.equal(logistics.capabilities.categories.RMA.write, false);
  assert.equal(logistics.capabilities.resources.skus.read, true);
  assert.equal(logistics.capabilities.resources.skus.actions.ADJUST, false);
});

test('only explicit Driver identity and inactive-account tightening are accepted', () => {
  for (const active of [true, false]) {
    const account = { ...fixture('DRIVER', {}, false), isActive: active };
    const report = comparePermissionRehearsal(account, evaluatePermissions(input(account)));
    assert.deepEqual(report.expansions, []);
    assert.deepEqual(report.regressions, []);
    assert.ok(report.intentionalTightening.length > 0);
    assert.ok(report.intentionalTightening.every(d => d.classification === (active ? 'DRIVER_LINK_REQUIRED' : 'INACTIVE_ACCOUNT_FAIL_CLOSED')));
  }
  const account = fixture('DRIVER', {}, false), value = input(account);
  value.rolePolicy = null;
  assert.ok(comparePermissionRehearsal(account, evaluatePermissions(value)).regressions.length > 0, 'missing policy is never an approved tightening');
});

test('shadow gate detects hidden-screen expansion and an unexplained lost operation', () => {
  const account = fixture('SALES_COORDINATOR'), value = input(account);
  value.overrides = [{ permissionKey: 'SCREEN:calendar:READ', effect: 'ALLOW' }];
  assert.ok(comparePermissionRehearsal(account, evaluatePermissions(value)).expansions.some(d => d.key === 'SCREEN:calendar:READ'));
  value.overrides = [{ permissionKey: 'CATEGORY:DELIVERY:POD', effect: 'DENY' }];
  assert.ok(comparePermissionRehearsal(account, evaluatePermissions(value)).regressions.some(d => d.key === 'CATEGORY:DELIVERY:POD'));
});

test('incorrect snapshots cannot use the identity or inactive-account tightening exceptions', () => {
  const linked = fixture('DRIVER');
  const value = input(linked); value.driverProfile = null;
  const lostLink = comparePermissionRehearsal(linked, evaluatePermissions(value));
  assert.ok(lostLink.regressions.some(d => d.key === 'SNAPSHOT:DRIVER_ID'));
  assert.ok(lostLink.regressions.some(d => d.key === 'CATEGORY:DELIVERY:READ'));
  const inactive = { ...fixture('SALES_COORDINATOR'), isActive: false };
  const wrongOwner = evaluatePermissions(input(inactive)); wrongOwner.userId = 'another-account';
  assert.ok(comparePermissionRehearsal(inactive, wrongOwner).regressions.some(d => d.key === 'SNAPSHOT:ACCOUNT'));
  for (const profile of [{ id: 'inactive', type: 'DRIVER', isActive: false }, { id: 'assistant', type: 'ASSISTANT', isActive: true }]) {
    const account = { ...linked, driverProfile: profile };
    const result = comparePermissionRehearsal(account, evaluatePermissions(input(account)));
    assert.deepEqual(result.regressions, []);
    assert.ok(result.intentionalTightening.length > 0);
  }
});

test('rehearsal administrative connection has no fallback and rejects deployed/redirected targets', () => {
  const env = { PERMISSION_REHEARSAL_ADMIN_URL: 'postgresql://fixture@127.0.0.1:55449/postgres' };
  assert.equal(rehearsalAdminTarget(env).hostname, '127.0.0.1');
  for (const change of [{ PERMISSION_REHEARSAL_ADMIN_URL: undefined }, { DATABASE_URL: env.PERMISSION_REHEARSAL_ADMIN_URL, PERMISSION_REHEARSAL_ADMIN_URL: undefined },
    { PERMISSION_REHEARSAL_ADMIN_URL: 'postgresql://fixture@remote.example/postgres' },
    { PERMISSION_REHEARSAL_ADMIN_URL: `${env.PERMISSION_REHEARSAL_ADMIN_URL}?hostaddr=1.2.3.4` },
    { PERMISSION_REHEARSAL_ADMIN_URL: env.PERMISSION_REHEARSAL_ADMIN_URL.replace('/postgres', '/existing_test') },
    { NODE_ENV: 'production' }, { APP_ENV: 'staging' }, { CI: 'true' }, { RENDER: 'true' }]) {
    assert.throws(() => rehearsalAdminTarget({ ...env, ...change }));
  }
});
