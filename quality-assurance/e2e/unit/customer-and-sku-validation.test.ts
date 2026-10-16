import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCustomerUpdate,
  customerChanges,
  CUSTOMER_FIELDS,
} from '../../../server/src/services/customerValidation';

/**
 * ============================================================================
 * TESTING PYRAMID - LAYER 1 (UNIT TESTS)
 * Domain Module: Customer Input Validation & Concurrency Tokens
 * QA Reference: TC-MD-001, TC-MD-002, TC-MD-008, TC-MD-009
 * ============================================================================
 */

describe('Layer 1 (Unit): Customer Input Validation & Concurrency Tokens', () => {
  describe('Customer Update Body Parser (parseCustomerUpdate)', () => {
    test('test_accepts_clean_valid_update_with_concurrency_token', () => {
      const payload = {
        name: 'Updated Logistics Corp',
        contact_person: 'Alice Reyes',
        email: 'alice@logistics.com',
        phone: '+63 917 123 4567',
        city: 'Taguig',
        address: 'Bonifacio Global City',
        remarks: 'Updated phone and contact person per customer request',
        expected_modified_at: '2026-10-15T08:00:00.000Z',
      };

      const result = parseCustomerUpdate(payload);
      assert.ok('value' in result, 'Validation should succeed');
      assert.equal(result.value.data.name, 'Updated Logistics Corp');
      assert.equal(result.value.remarks, 'Updated phone and contact person per customer request');
      assert.equal(result.value.expectedModifiedAt, '2026-10-15T08:00:00.000Z');
    });

    test('test_rejects_empty_or_whitespace_customer_name', () => {
      const payload = {
        name: '   ',
        remarks: 'Attempt empty name',
        expected_modified_at: '2026-10-15T08:00:00.000Z',
      };

      const result = parseCustomerUpdate(payload);
      assert.ok('error' in result);
      assert.equal(result.fields.name, 'Customer name is required.');
    });

    test('test_rejects_malformed_email_address', () => {
      const payload = {
        name: 'Valid Name',
        email: 'not-an-email',
        remarks: 'Setting bad email',
        expected_modified_at: '2026-10-15T08:00:00.000Z',
      };

      const result = parseCustomerUpdate(payload);
      assert.ok('error' in result);
      assert.equal(result.fields.email, 'Enter a valid email address, like name@company.com.');
    });

    test('test_rejects_phone_with_invalid_characters', () => {
      const payload = {
        name: 'Valid Name',
        phone: '123-CALL-NOW!',
        remarks: 'Setting invalid phone',
        expected_modified_at: '2026-10-15T08:00:00.000Z',
      };

      const result = parseCustomerUpdate(payload);
      assert.ok('error' in result);
      assert.equal(result.fields.phone, 'Phone can only contain numbers, spaces and + ( ) - .');
    });

    test('test_requires_mandatory_change_remarks', () => {
      const payload = {
        name: 'Valid Name',
        remarks: '  ',
        expected_modified_at: '2026-10-15T08:00:00.000Z',
      };

      const result = parseCustomerUpdate(payload);
      assert.ok('error' in result);
      assert.equal(result.fields.remarks, 'Enter a reason for this change.');
    });

    test('test_requires_expected_modified_at_for_optimistic_locking', () => {
      const payload = {
        name: 'Valid Name',
        remarks: 'Valid reason',
      };

      const result = parseCustomerUpdate(payload);
      assert.ok('error' in result);
      assert.equal(result.error, 'expected_modified_at is required.');
    });
  });

  describe('Customer Snapshot Differences (customerChanges)', () => {
    test('test_computes_field_level_diffs_for_audit_trail', () => {
      const before = {
        name: 'Old Name Corp',
        contact_person: 'Bob',
        email: 'bob@old.com',
        phone: '123',
        city: 'Manila',
        address: 'Old St',
      };
      const after = {
        name: 'New Name Corp',
        contact_person: 'Bob',
        email: 'bob@new.com',
        phone: '123',
        city: 'Manila',
        address: 'Old St',
      };

      const diffs = customerChanges(before, after);
      assert.equal(diffs.length, 2);
      assert.deepEqual(diffs[0], { field: 'name', label: 'Customer name', from: 'Old Name Corp', to: 'New Name Corp' });
      assert.deepEqual(diffs[1], { field: 'email', label: 'Email', from: 'bob@old.com', to: 'bob@new.com' });
    });
  });
});
