import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RMA_CATEGORIES, autoFillRmaFields } from '../src/utils/rma';
import { buildManualDefaults, dataSamplerSubmissionError } from '../src/features/admin/DataSamplerView';

test('RMA Auto Fill preserves blank and manually entered references for every category', () => {
  const expected = ['Sales Orders', 'Return to Customer', 'Return to Supplier', 'Pull-Out Slip', 'Advance Replacement Demo', 'Pick-Up', 'Others'];
  assert.deepEqual([...RMA_CATEGORIES], expected);
  for (let index = 0; index < expected.length; index++) {
    assert.deepEqual(autoFillRmaFields('', index), { reference: '', rma_type: expected[index] });
    assert.deepEqual(autoFillRmaFields('00042 / manual-Ref', index), { reference: '00042 / manual-Ref', rma_type: expected[index] });
  }
});

test('Admin RMA sample defaults leave Reference empty and use the current category and item choices', () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const defaults = buildManualDefaults('rma', [{ id: 'company-1', name: 'Demo Company' }] as any, ['P. Soriano']);
    assert.equal(defaults.reference, '');
    assert.ok(RMA_CATEGORIES.some(value => value === defaults.rma_type));
    assert.equal(defaults.item_type, 'Small Item');
    assert.ok(defaults.area);
    assert.ok(defaults.account_manager);
    assert.equal(defaults.company_id, 'company-1');
  }
  assert.match(buildManualDefaults('deliveries', []).reference, /^SAP-/);
});

test('manual Data Sampler requires a reference and date for non-RMA records while keeping RMA fields optional', () => {
  assert.match(dataSamplerSubmissionError('sales_orders', { reference: '   ', delivery_date: '2026-10-07' }) ?? '', /Reference is required/);
  assert.match(dataSamplerSubmissionError('sales_orders', { reference: 'SO-123', delivery_date: '' }) ?? '', /Delivery Date is required/);
  assert.equal(dataSamplerSubmissionError('sales_orders', { reference: 'SO-123', delivery_date: '2026-10-07' }), null);
  assert.equal(dataSamplerSubmissionError('rma', { reference: '', delivery_date: '' }), null);
});
