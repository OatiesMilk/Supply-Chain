import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getSession, apiRequest } from '../helpers/auth';

/**
 * ============================================================================
 * TESTING PYRAMID - LAYER 2 (INTEGRATION / API TESTS)
 * Domain Module: Authentication, Session Management & CSRF Protection
 * QA Reference: TC-AUTH-001..TC-AUTH-012
 * ============================================================================
 */

describe('Layer 2 (API): Authentication & CSRF Protection', () => {
  test('test_api_health_endpoint_returns_ok', async () => {
    const res = await apiRequest('GET', '/health');
    assert.equal(res.status, 200);
    assert.ok(res.data?.ok === true || res.data?.status === 'ok');
  });

  describe('Multi-Role Session Establishment', () => {
    test('test_sales_coordinator_login_establishes_session', async () => {
      const session = await getSession('sales@microgenesis.com');
      assert.equal(session.role, 'SALES_COORDINATOR');
      assert.ok(session.cookie.includes('mg_session'));
      assert.ok(session.csrf.length > 0);

      const me = await apiRequest('GET', '/auth/me', session);
      assert.equal(me.status, 200);
      assert.equal(me.data?.email, 'sales@microgenesis.com');
      assert.equal(me.data?.role, 'SALES_COORDINATOR');
    });

    test('test_logistics_login_establishes_session', async () => {
      const session = await getSession('logistics@microgenesis.com');
      assert.equal(session.role, 'LOGISTICS');
      assert.ok(session.cookie.includes('mg_session'));

      const me = await apiRequest('GET', '/auth/me', session);
      assert.equal(me.status, 200);
      assert.equal(me.data?.role, 'LOGISTICS');
    });

    test('test_tass_login_establishes_session', async () => {
      const session = await getSession('tass@microgenesis.com');
      assert.equal(session.role, 'TASS');
      assert.ok(session.cookie.includes('mg_session'));

      const me = await apiRequest('GET', '/auth/me', session);
      assert.equal(me.status, 200);
      assert.equal(me.data?.role, 'TASS');
    });

    test('test_admin_login_establishes_session', async () => {
      const session = await getSession('admin@microgenesis.com');
      assert.equal(session.role, 'ADMIN');
      assert.ok(session.cookie.includes('mg_session'));

      const me = await apiRequest('GET', '/auth/me', session);
      assert.equal(me.status, 200);
      assert.equal(me.data?.role, 'ADMIN');
    });

    test('test_driver_login_establishes_session', async () => {
      const session = await getSession('driver@microgenesis.com');
      assert.equal(session.role, 'DRIVER');
      assert.ok(session.cookie.includes('mg_session'));

      const me = await apiRequest('GET', '/auth/me', session);
      assert.equal(me.status, 200);
      assert.equal(me.data?.role, 'DRIVER');
    });
  });

  describe('Negative Authentication & CSRF Enforcement', () => {
    test('test_unauthenticated_request_to_records_returns_401', async () => {
      const res = await apiRequest('GET', '/records');
      assert.equal(res.status, 401);
    });

    test('test_unknown_credentials_returns_401', async () => {
      const dynamicEmail = `unregistered-${Date.now()}@example.com`;
      const res = await apiRequest('POST', '/auth/login', undefined, {
        email: dynamicEmail,
        password: 'wrongpassword',
      });
      assert.equal(res.status, 401);
    });

    test('test_missing_credentials_returns_400_or_401', async () => {
      const res = await apiRequest('POST', '/auth/login', undefined, {});
      assert.ok([400, 401].includes(res.status));
    });

    test('test_csrf_rejection_on_mutating_api_call_without_token', async () => {
      const session = await getSession('sales@microgenesis.com');
      // Create session copy without csrf
      const sessionNoCsrf = { ...session, csrf: '' };

      const res = await apiRequest('POST', '/records', sessionNoCsrf, {
        record_type: 'Delivery',
        
        tracking_number: 'TEST-NO-CSRF',
      });

      assert.equal(res.status, 403, 'Mutating write without CSRF token must return 403 Forbidden');
    });
  });
});
