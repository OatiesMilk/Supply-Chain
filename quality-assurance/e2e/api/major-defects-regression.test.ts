import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getSession, apiRequest } from '../helpers/auth';
import { deliveryFixture, customerFixture, skuFixture } from '../helpers/fixtures';
import { manilaToday } from '../helpers/runtime';

/**
 * ============================================================================
 * TESTING PYRAMID - LAYER 2 (INTEGRATION / API REGRESSION TESTS)
 * Domain Module: Automated Probes for selected Major Defects (RUN-20261014-02)
 * Authority: quality-assurance/AGENTS.md & UAT-summary-RUN-20261014-02.md
 * ============================================================================
 */

describe('Layer 2 (API): Major Defects Automated Regression Probes', () => {
  // DEF-006 (TC-DEL-005): Malformed Delivery Date
  test('DEF-006 [TC-DEL-005]: API must refuse malformed delivery dates on create with HTTP 400', async () => {
    const sales = await getSession('sales@microgenesis.com');
    const res = await apiRequest('POST', '/records', sales, await deliveryFixture({
      category: 'Deliveries',
      
      reference: `REG-DEF006-${Date.now()}`,
      delivery_date: '2026-13-45', // Out of bounds month/day
      status: 'Scheduled',
    }));

    // Expected: 400 Bad Request naming the invalid date
    // Defect behavior: API returns 201 Created and accepts '2026-13-45'
    assert.equal(
      res.status,
      400,
      `DEF-006 Regression: Expected HTTP 400 for malformed date '2026-13-45', but received HTTP ${res.status}`
    );
    assert.match(JSON.stringify(res.data), /date/i, 'Rejection must identify the invalid date');
  });

  // DEF-007 (TC-DEL-006): Unknown Delivery Priority
  test('DEF-007 [TC-DEL-006]: API must refuse unknown priorities on create with HTTP 400', async () => {
    const sales = await getSession('sales@microgenesis.com');
    const res = await apiRequest('POST', '/records', sales, await deliveryFixture({
      category: 'Deliveries',
      
      reference: `REG-DEF007-${Date.now()}`,
      delivery_date: manilaToday(),
      priority: '9 - Urgent', // Unknown priority not in ('1 - Low', '2 - Moderate', '3 - High')
      status: 'Scheduled',
    }));

    // Expected: 400 Bad Request
    // Defect behavior: API returns 201 Created and accepts invalid priority
    assert.equal(
      res.status,
      400,
      `DEF-007 Regression: Expected HTTP 400 for unknown priority '9 - Urgent', but received HTTP ${res.status}`
    );
    assert.match(JSON.stringify(res.data), /priority/i, 'Rejection must identify the invalid priority');
  });

  // DEF-008 (TC-DEL-007): Unknown Company Clean Rejection
  test('DEF-008 [TC-DEL-007]: API must refuse non-existent company IDs cleanly with 400/404, not 500', async () => {
    const sales = await getSession('sales@microgenesis.com');
    const res = await apiRequest('POST', '/records', sales, await deliveryFixture({
      category: 'Deliveries',
      company_id: 'non-existent-company-uuid-00000',
      reference: `REG-DEF008-${Date.now()}`,
      delivery_date: manilaToday(),
      status: 'Scheduled',
    }));

    // Expected: HTTP 400 or 404 clean rejection
    // Defect behavior: Prisma throws unhandled foreign key error resulting in 500
    assert.ok(
      [400, 404].includes(res.status),
      `DEF-008 Regression: Expected HTTP 400/404 for unknown company, but received HTTP ${res.status}`
    );
  });

  // DEF-010 (TC-DEL-022): Prevent Unauthorized Logistics Draft Submission
  test('DEF-010 [TC-DEL-022]: Logistics must be forbidden from submitting drafts to Scheduled', async () => {
    const sales = await getSession('sales@microgenesis.com');
    const logistics = await getSession('logistics@microgenesis.com');

    // Create a draft as Sales
    const draft = await apiRequest('POST', '/records', sales, await deliveryFixture({
      category: 'Deliveries',
      
      reference: `REG-DRAFT-${Date.now()}`,
      status: 'Draft',
      is_draft: 'Yes',
    }));
    assert.equal(draft.status, 201);
    const draftId = draft.data?.id;

    // Logistics attempts to transition draft to Scheduled
    const submitAttempt = await apiRequest('PATCH', `/records/${draftId}/status`, logistics, {
      status: 'Scheduled',
      remarks: 'Logistics submitting draft attempt',
    });

    // Expected: 403 Forbidden (Only Sales Coordinator or Admin can submit drafts)
    // Defect behavior: Returns HTTP 200 and transitions record to Scheduled
    assert.equal(
      submitAttempt.status,
      403,
      `DEF-010 Regression: Expected HTTP 403 when Logistics submits draft, but received HTTP ${submitAttempt.status}`
    );
  });

  // DEF-011 (TC-DEL-024): Delivery Deletion Forbidden
  test('DEF-011 [TC-DEL-024]: Records must not be deleted through the API even by Sales Coordinator', async () => {
    const sales = await getSession('sales@microgenesis.com');

    // Create a record
    const draft = await apiRequest('POST', '/records', sales, await deliveryFixture({
      category: 'Deliveries',
      
      reference: `REG-DEL-${Date.now()}`,
      status: 'Draft',
      is_draft: 'Yes',
    }));
    assert.equal(draft.status, 201);
    const draftId = draft.data?.id;

    // Sales attempts DELETE
    const deleteAttempt = await apiRequest('DELETE', `/records/${draftId}`, sales);

    // Expected: HTTP 405 Method Not Allowed or 403 Forbidden (QA requirement: records cannot be deleted)
    // Defect behavior: Returns HTTP 200 and soft-deletes the record
    assert.ok(
      [403, 405].includes(deleteAttempt.status),
      `DEF-011 Regression: Expected HTTP 403/405 refusing delete, but received HTTP ${deleteAttempt.status}`
    );
  });

  // DEF-017 (TC-MD-006): Malformed Input Must Not Hang Without Response
  test('DEF-017 [TC-MD-006]: Malformed customer input must receive prompt 4xx response within 2000ms', async () => {
    const sales = await getSession('sales@microgenesis.com');

    let errorOccurred: any = null;
    let res: any = null;

    try {
      res = await apiRequest('POST', '/customers', sales, { name: 12345 }, 2000);
    } catch (err: any) {
      errorOccurred = err;
    }

    // Expected: HTTP 400 within 2000ms
    // Defect behavior: Server hangs indefinitely on unhandled async rejection, triggering TimeoutError
    assert.equal(
      errorOccurred,
      null,
      `DEF-017 Regression: Request hung and timed out without sending an HTTP response: ${errorOccurred?.message}`
    );
    assert.ok([400, 422].includes(res?.status), `Expected HTTP 400 for malformed customer name, got ${res?.status}`);
  });

  // API-only subset of DEF-021; does not verify the stale-edit UI.
  test('DEF-021 [TC-MD-009]: API detects stale customer edit and returns 409 Conflict', async () => {
    const sales = await getSession('sales@microgenesis.com');
    const customer = await customerFixture();
    const custId = customer.id;
    assert.ok(custId, 'Customer must exist for concurrency probe');

    // Provide stale concurrency token
    const res = await apiRequest('PUT', `/customers/${custId}`, sales, {
      name: 'Concurrent Test Customer',
      contact_person: 'Sofia',
      remarks: 'Attempting concurrent stale update',
      expected_modified_at: '2020-01-01T00:00:00.000Z',
    });

    // Expected: 409 Conflict
    assert.equal(
      res.status,
      409,
      `DEF-021 Regression: Expected HTTP 409 Conflict for stale edit, got HTTP ${res.status}`
    );
  });

  // DEF-025 (TC-SKU-003): Reject Negative SKU Prices
  test('DEF-025 [TC-SKU-003]: API must reject negative SKU prices on creation with HTTP 400', async () => {
    const admin = await getSession('admin@microgenesis.com');
    const res = await apiRequest('POST', '/skus', admin, {
      sku_code: `SKU-NEG-${Date.now()}`,
      name: 'Negative Price Printer',
      category: 'Hardware',
      unit_cost: 100,
      unit_price: -500, // Negative price
      reorder_point: 5,
    });

    // Expected: HTTP 400 Bad Request
    // Defect behavior: Accepts negative price with HTTP 201
    assert.equal(
      res.status,
      400,
      `DEF-025 Regression: Expected HTTP 400 for negative unit_price -500, but received HTTP ${res.status}`
    );
    assert.match(JSON.stringify(res.data), /price|unit_price/i, 'Rejection must identify the invalid price');
  });

  // DEF-026 (TC-SKU-008): Reject Invalid Inventory Adjustment Types
  test('DEF-026 [TC-SKU-008]: API must reject invalid stock adjustment types with HTTP 400', async () => {
    const admin = await getSession('admin@microgenesis.com');
    const sku = await skuFixture();
    const skuId = sku.id;
    assert.ok(skuId, 'A SKU must exist to test inventory adjustments');

    const res = await apiRequest('POST', `/skus/${skuId}/adjust`, admin, {
      type: 'Gift', // Invalid type not in recognized adjustment types
      qty_change: 5,
      reference: 'DEF-026 invalid adjustment type probe',
    });

    // Expected: HTTP 400 Bad Request
    // Defect behavior: Accepts 'Gift' with HTTP 200
    assert.equal(
      res.status,
      400,
      `DEF-026 Regression: Expected HTTP 400 for unrecognized adjustment type 'Gift', but received HTTP ${res.status}`
    );
    assert.match(JSON.stringify(res.data), /type/i, 'Rejection must identify the invalid adjustment type');
  });

  // API-only subset of TC-RPT-006; does not verify Reports loading/error UI.
  test('DEF-029 [TC-RPT-006]: Statistical reports API validates inverted date ranges with HTTP 400', async () => {
    const logistics = await getSession('logistics@microgenesis.com');
    const res = await apiRequest(
      'GET',
      '/reports/summary?dateFrom=2026-10-25&dateTo=2026-10-10',
      logistics
    );

    // Expected: HTTP 400 Bad Request
    assert.equal(
      res.status,
      400,
      `DEF-029 Regression: Expected HTTP 400 for inverted date range, got HTTP ${res.status}`
    );
  });

  // DEF-003 (TC-ACC-001 / TC-ACC-002): Sales Coordinator Reports Access
  test('DEF-003 [TC-ACC-001/002]: Sales Coordinator access to Statistical Reports endpoint', async () => {
    const sales = await getSession('sales@microgenesis.com');
    const res = await apiRequest('GET', '/reports/summary', sales);

    // Expected: HTTP 200 (per approved OQ-09 QA decision granting Reports to Sales Coordinator)
    // Defect behavior: Returns HTTP 403 {"error":"Module access denied"}
    assert.equal(
      res.status,
      200,
      `DEF-003 Regression: Expected HTTP 200 for Sales Coordinator accessing reports, but received HTTP ${res.status}`
    );
  });
});
