import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RMA_CATEGORIES, autoFillRmaFields, canonicalRmaCategory, formatRmaCategoryOption, isTransferOutCategory, previewRmaReference, rmaCategoryPrefix, rmaSlipTitle } from '../src/utils/rma';
import { buildManualDefaults, dataSamplerSubmissionError } from '../src/features/admin/DataSamplerView';

test('RMA Auto Fill picks one of the six slip categories and never invents a reference', () => {
  const expected = ['Pull Out Slip', 'Return to Customer Slip', 'Return to Supplier Slip', 'Advance Replacement Slip', 'Receiving Slip', 'Transfer Out Slip'];
  assert.deepEqual([...RMA_CATEGORIES], expected);
  for (let index = 0; index < expected.length; index++) {
    assert.deepEqual(autoFillRmaFields('', index), { reference: '', rma_type: expected[index] });
    assert.deepEqual(autoFillRmaFields('00042 / manual-Ref', index), { reference: '', rma_type: expected[index] }, 'the server generates the slip reference');
  }
});

test('slip helpers: prefixes, printed titles, option labels and the reference preview', () => {
  assert.deepEqual(RMA_CATEGORIES.map(category => rmaCategoryPrefix(category)), ['POS', 'RTC', 'RTS', 'ARD', 'RR', 'TXO']);
  assert.deepEqual(RMA_CATEGORIES.map(category => rmaSlipTitle(category)),
    ['PULL OUT SLIP', 'RETURN TO CUSTOMER SLIP', 'RETURN TO SUPPLIER SLIP', 'ADVANCE REPLACEMENT SLIP', 'RECEIVING SLIP', 'TRANSFER OUT SLIP']);
  assert.equal(rmaSlipTitle('Pull-Out Slip'), 'PULL OUT SLIP', 'legacy aliases print the canonical title');
  assert.equal(rmaSlipTitle('Others'), 'RMA SLIP');
  assert.equal(formatRmaCategoryOption('Pull Out Slip'), 'Pull Out Slip (POS)');
  assert.equal(formatRmaCategoryOption('Transfer Out Slip'), 'Transfer Out Slip (TXO)');
  assert.equal(canonicalRmaCategory('Advance Replacement Demo'), 'Advance Replacement Slip');
  assert.equal(canonicalRmaCategory('Others'), null);
  assert.equal(isTransferOutCategory('TXO'), true);
  assert.equal(isTransferOutCategory('Receiving Slip'), false);
  // 2026-11-20 23:59:59 Manila vs 2026-11-21 00:00:00 Manila.
  assert.equal(previewRmaReference('Pull Out Slip', new Date('2026-11-20T15:59:59Z')), 'POS112026-NN');
  assert.equal(previewRmaReference('Receiving Slip', new Date('2026-11-20T16:00:00Z')), 'RR112126-NN');
  assert.equal(previewRmaReference(''), null);
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

test('Data Sampler internal transfers need Logistics transport or Internal / no driver before generating', () => {
  const defaults = buildManualDefaults('rma', [{ id: 'company-1', name: 'Demo Company' }] as any, ['P. Soriano']);
  assert.equal(defaults.rma_movement, '');
  assert.equal(defaults.is_internal_transfer, '');
  const transfer = { reference: '', delivery_date: '', rma_type: 'Transfer Out Slip', is_internal_transfer: 'true' };
  for (const rma_movement of ['', 'SUPPLIER_COLLECTION']) {
    assert.match(dataSamplerSubmissionError('rma', { ...transfer, rma_movement }) ?? '', /must use Logistics transport or Internal/, rma_movement);
  }
  for (const rma_movement of ['LOGISTICS_TRANSPORT', 'INTERNAL_NO_DRIVER']) assert.equal(dataSamplerSubmissionError('rma', { ...transfer, rma_movement }), null, rma_movement);
  assert.equal(dataSamplerSubmissionError('rma', { reference: '', delivery_date: '', rma_type: 'Pull Out Slip', rma_movement: '' }), null, 'regular RMA samples may leave movement unset');
});
