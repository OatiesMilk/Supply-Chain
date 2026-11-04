import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getSession, apiRequest } from '../helpers/auth';

/**
 * ============================================================================
 * TESTING PYRAMID - LAYER 2 (INTEGRATION / API TESTS)
 * Domain Module: Server-Side RBAC, Resource Scoping & Role Isolation
 * QA Reference: TC-ACC-001, TC-ACC-002, TC-ADM-018, TC-DIR-003, TC-SKU-011
 * ============================================================================
 */

describe('Layer 2 (API): Server-Side RBAC & Resource Scoping', () => {
  describe('User Administration API Protection (/api/v1/users)', () => {
    test('test_admin_accesses_user_directory', async () => {
      const admin = await getSession('admin@microgenesis.com');
      const res = await apiRequest('GET', '/users', admin);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data?.users || res.data));
    });

    test('test_sales_coordinator_is_forbidden_from_user_directory', async () => {
      const sales = await getSession('sales@microgenesis.com');
      const res = await apiRequest('GET', '/users', sales);
      assert.equal(res.status, 403, 'Non-admin must receive 403 Forbidden on /api/v1/users');
    });

    test('test_logistics_is_forbidden_from_user_directory', async () => {
      const logistics = await getSession('logistics@microgenesis.com');
      const res = await apiRequest('GET', '/users', logistics);
      assert.equal(res.status, 403);
    });

    test('test_driver_is_forbidden_from_user_directory', async () => {
      const driver = await getSession('driver@microgenesis.com');
      const res = await apiRequest('GET', '/users', driver);
      assert.equal(res.status, 403);
    });

    test('test_tass_is_forbidden_from_user_directory', async () => {
      const tass = await getSession('tass@microgenesis.com');
      const res = await apiRequest('GET', '/users', tass);
      assert.equal(res.status, 403);
    });
  });

  describe('Driver Roster Creation Permissions (TC-DIR-003)', () => {
    test('test_logistics_cannot_create_a_driver_profile', async () => {
      const logistics = await getSession('logistics@microgenesis.com');
      const res = await apiRequest('POST', '/drivers', logistics, {
        name: 'Unauthorized Driver Attempt',
        type: 'DRIVER',
        phone: '+63 917 000 0000',
      });
      // Logistics can only create Assistant profiles; creating DRIVER must return 403
      assert.equal(res.status, 403, 'TC-DIR-003: Logistics cannot add Driver profile via API');
    });

    test('test_driver_cannot_create_a_driver_profile', async () => {
      const driver = await getSession('driver@microgenesis.com');
      const res = await apiRequest('POST', '/drivers', driver, {
        name: 'Driver Self-Spawn Attempt',
        type: 'DRIVER',
      });
      assert.equal(res.status, 403);
    });
  });

  describe('SKU Master Write Guard (TC-SKU-011)', () => {
    test('test_sales_coordinator_cannot_create_sku', async () => {
      const sales = await getSession('sales@microgenesis.com');
      const res = await apiRequest('POST', '/skus', sales, {
        sku_code: 'SKU-UNAUTH-01',
        name: 'Unauthorized SKU',
        unit_price: 100,
      });
      assert.equal(res.status, 403, 'TC-SKU-011: Sales Coordinator cannot create SKUs');
    });

    test('test_driver_cannot_create_sku', async () => {
      const driver = await getSession('driver@microgenesis.com');
      const res = await apiRequest('POST', '/skus', driver, {
        sku_code: 'SKU-UNAUTH-02',
        name: 'Unauthorized SKU from Driver',
      });
      assert.equal(res.status, 403);
    });
  });

  describe('Driver Operational Boundaries', () => {
    test('test_driver_cannot_create_delivery_records', async () => {
      const driver = await getSession('driver@microgenesis.com');
      const res = await apiRequest('POST', '/records', driver, {
        record_type: 'Delivery',
        
        tracking_number: 'DRV-CREATION-ATTEMPT',
      });
      assert.equal(res.status, 403, 'Driver must not have permission to create records');
    });
  });
});
