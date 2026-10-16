import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROLE_DEFAULTS,
  editableScreens,
  effectiveScreens,
  resourcesFor,
  permissionInputError,
  permissionSnapshot,
  SCREEN_LABELS,
  type Screen,
  type Permission,
} from '../../../server/src/services/permissions';

/**
 * ============================================================================
 * TESTING PYRAMID - LAYER 1 (UNIT TESTS)
 * Domain Module: RBAC, Permissions, and Scoping Engine
 * QA Reference: TC-ACC-001, TC-ACC-002, TC-ACC-007, TC-ADM-006
 * ============================================================================
 */

describe('Layer 1 (Unit): RBAC, Permissions & Scoping Engine', () => {
  describe('Role Screen Defaults', () => {
    test('test_sales_coordinator_defaults_exclude_admin_driver_manager_and_inventory', () => {
      const screens = ROLE_DEFAULTS.SALES_COORDINATOR;
      assert.ok(screens.includes('deliveries'), 'SC should have deliveries access');
      assert.ok(screens.includes('customers'), 'SC should have customers access');
      assert.ok(screens.includes('dashboard'), 'SC should have dashboard access');
      assert.ok(!screens.includes('admin'), 'SC must NOT have admin panel');
      assert.ok(!screens.includes('driver_manager'), 'SC must NOT manage drivers');
      assert.ok(!screens.includes('inventory'), 'SC must NOT have SKU Master by default');
      assert.ok(!screens.includes('driver_dashboard'), 'SC must NOT access driver mobile dashboard');
    });

    test('test_logistics_defaults_include_driver_dispatch_and_reports', () => {
      const screens = ROLE_DEFAULTS.LOGISTICS;
      assert.ok(screens.includes('driver'), 'Logistics must access Driver View');
      assert.ok(screens.includes('driver_manager'), 'Logistics must access Driver Manager');
      assert.ok(screens.includes('driver_board'), 'Logistics must access Driver Board');
      assert.ok(screens.includes('calendar'), 'Logistics must access Delivery Calendar');
      assert.ok(screens.includes('statistical_reports'), 'Logistics must access Statistical Reports');
      assert.ok(!screens.includes('admin'), 'Logistics must NOT have admin panel');
    });

    test('test_driver_role_is_sandboxed_strictly_to_driver_dashboard', () => {
      const screens = ROLE_DEFAULTS.DRIVER;
      assert.deepEqual(screens, ['driver_dashboard'], 'Driver must only access driver_dashboard');
    });

    test('test_admin_defaults_include_all_operational_screens_except_driver_dashboard', () => {
      const screens = ROLE_DEFAULTS.ADMIN;
      assert.ok(screens.includes('admin'));
      assert.ok(screens.includes('deliveries'));
      assert.ok(screens.includes('inventory'));
      assert.ok(!screens.includes('driver_dashboard'), 'Admin desktop portal excludes driver_dashboard');
    });
  });

  describe('Permission Overrides and Effective Screens', () => {
    test('test_can_grant_sku_master_to_sales_coordinator_via_override', () => {
      const overrides: Permission[] = [{ screen: 'inventory', granted: true }];
      const effective = effectiveScreens('SALES_COORDINATOR', overrides);
      assert.ok(effective.includes('inventory'), 'Granted override should enable inventory screen');
      assert.ok(effective.includes('deliveries'), 'Default screen should still be retained');
    });

    test('test_can_revoke_screen_from_logistics_via_override', () => {
      const overrides: Permission[] = [{ screen: 'statistical_reports', granted: false }];
      const effective = effectiveScreens('LOGISTICS', overrides);
      assert.ok(!effective.includes('statistical_reports'), 'Revoked screen must be excluded');
      assert.ok(effective.includes('driver_board'), 'Other screens must remain active');
    });

    test('test_driver_permissions_cannot_be_expanded_to_admin_or_web_screens', () => {
      const editable = editableScreens('DRIVER');
      assert.deepEqual(editable, ['driver_dashboard']);
      // If someone tries to override admin for a driver, effectiveScreens ignores it
      const overrides: Permission[] = [{ screen: 'admin', granted: true }, { screen: 'deliveries', granted: true }];
      const effective = effectiveScreens('DRIVER', overrides);
      assert.deepEqual(effective, ['driver_dashboard'], 'Overrides outside editableScreens must be ignored');
    });
  });

  describe('Permission Input Validation', () => {
    test('test_rejects_non_array_payloads', () => {
      assert.equal(permissionInputError('invalid'), 'permissions must be an array');
      assert.equal(permissionInputError(null), 'permissions must be an array');
      assert.equal(permissionInputError({}), 'permissions must be an array');
    });

    test('test_rejects_unknown_screens_or_invalid_values', () => {
      assert.equal(
        permissionInputError([{ screen: 'non_existent_screen', granted: true }]),
        'Each permission must contain a known screen and a boolean granted value'
      );
      assert.equal(
        permissionInputError([{ screen: 'deliveries', granted: 'yes' }]),
        'Each permission must contain a known screen and a boolean granted value'
      );
    });

    test('test_rejects_duplicate_screen_entries', () => {
      assert.equal(
        permissionInputError([
          { screen: 'deliveries', granted: true },
          { screen: 'deliveries', granted: false },
        ]),
        'Duplicate screen: deliveries'
      );
    });

    test('test_accepts_clean_valid_permission_array', () => {
      assert.equal(
        permissionInputError([
          { screen: 'inventory', granted: true },
          { screen: 'calendar', granted: false },
        ]),
        null
      );
    });
  });

  describe('Resource Scoping & Hash Generation', () => {
    test('test_maps_screens_to_required_backend_resources', () => {
      const resources = resourcesFor(['deliveries', 'customers']);
      assert.ok(resources.includes('records'));
      assert.ok(resources.includes('companies'));
      assert.ok(resources.includes('customers'));
      assert.ok(!resources.includes('users'));
    });

    test('test_permission_snapshot_computes_deterministic_sha256_hash', () => {
      const snap1 = permissionSnapshot('SALES_COORDINATOR', [{ screen: 'inventory', granted: true }]);
      const snap2 = permissionSnapshot('SALES_COORDINATOR', [{ screen: 'inventory', granted: true }]);
      assert.equal(snap1.permissionVersion, snap2.permissionVersion);
      assert.equal(snap1.permissionVersion.length, 64);
    });
  });
});
