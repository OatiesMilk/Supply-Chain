import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submissionErrors } from '../src/utils/recordLifecycle';

test('submitted records require a selected company, SAP reference, and nonblank delivery date', () => {
  const fields = { company_name: 'Merchant', company_id: 'company-1', reference: 'SAP-123', delivery_date: '  ' };
  assert.equal(submissionErrors(fields, false).delivery_date, 'Delivery Date is required');
  assert.deepEqual(submissionErrors({ ...fields, delivery_date: '2026-10-08' }, false), {});
  assert.equal(submissionErrors({ ...fields, company_id: '' }, false).company_name, 'Select a company from the list');
  assert.equal(submissionErrors({ ...fields, reference: ' ' }, false).reference, 'Reference (SAP number) is required');
  assert.deepEqual(submissionErrors({ ...fields, reference: '', delivery_date: '' }, true), {});
});
