import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeliveryRecord } from '../src/types';
import { buildRmaClientSlipData } from '../src/utils/rmaSlip';
import { buildRmaOutputPdfRow, PDF_RMA_CLIENT_SLIP_COLUMNS } from '../src/utils/recordOutputPdf';
import { PDF_RMA_COLUMNS, RMA_EXTRA_COLUMNS } from '../src/utils/export';
import { routeSlipRowValues } from '../src/utils/routeSlip';
import { rmaClientSlipFields, rmaClientSlipItemRows } from '../src/features/deliveries/DeliveryManifest';
import { formatRmaItemLines, formatRmaItemQty, formatRmaItemsSummary, rmaLineItemErrors } from '../src/utils/rmaItems';
import { submissionErrors } from '../src/utils/recordLifecycle';
import { diffAuditEntry, formatAuditValue } from '../src/features/deliveries/recordAuditDiff';
import { businessAuditChanges } from '../src/features/admin/BusinessAuditDiff';

const INTERNAL = 'INTERNAL_SECRET_COD_PHP2000_DO_NOT_PRINT';
const WORKFLOW = 'WORKFLOW_EDIT_REASON_SECRET';

function rmaRecord(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    id: 'rma-1', record_no: 'RMA-26-00001', company_name: 'BDO Unibank', company_id: 'c1', priority: '2 - Moderate', reference: 'RTC112426-03',
    rma_reference: 'RTC112426-03', remarks: WORKFLOW, status: 'Scheduled', vehicle: '(None)', area: 'Makati CBD', driver: '', driver_assistants: [],
    account_manager: 'Alex AM', delivery_date: '2026-11-24', category: 'RMA', item_type: 'Unit', is_draft: 'No', rma_type: 'Return to Customer Slip',
    case_number: 'CAS-31417-Y4Y6Z3', service_slip_no: 'SS#60142', client_remarks: 'SAP#12019325', internal_logistics_remarks: INTERNAL,
    rma_contacts: [{ name: 'Alvin Gatus', phone: '+639989765266' }, { name: 'Raymond Oliva', phone: '' }, { name: 'Jefferson Sualog', phone: null }],
    item_description: '', attachments: [], email_notification_sent: false, output_actions_log: [], created_by: 'TASS', created_at: '', modified_by: 'TASS', modified_at: '',
    line_items: [
      { sku: 'Lenovo ThinkPad E14', quantity: 1, unit_type: 'Unit', new_serial_number: 'NEW-7781', defective_serial_number: 'DEF-5512', purchase_date: '2025-08-14',
        sales_order_no: '12019325', repair_note: 'Replacement unit', status_tag: 'UNIT REPAIRED/FOR DELIVERY' },
      { sku: 'Power Adaptor', quantity: 1, unit_type: 'Item', serial_number: 'PA-0001', accessories: 'Bag', problem_description: 'Unusual color' },
    ],
    ...overrides,
  } as DeliveryRecord;
}

test('client slip data shows case number, RTC SS#, contacts, structured items and client remarks only', () => {
  const record = rmaRecord();
  const slip = buildRmaClientSlipData(record);
  const json = JSON.stringify(slip);
  for (const expected of ['SAP#12019325', 'CAS-31417-Y4Y6Z3', 'SS#60142', 'New SN: NEW-7781', 'Defective SN: DEF-5512', 'Date of Purchase: 08/14/2025 - SO: 12019325',
    'Serial Number: PA-0001', 'Accessories: Bag', 'Problem: Unusual color', 'Note: Replacement unit', 'UNIT REPAIRED/FOR DELIVERY', '1Unit', '1Item']) {
    assert.ok(json.includes(expected), expected);
  }
  assert.equal(slip.contacts, 'Alvin Gatus / Raymond Oliva / Jefferson Sualog - +639989765266');
  assert.equal(json.includes(INTERNAL), false);
  assert.equal(json.includes(WORKFLOW), false);
  assert.deepEqual(slip.items[0].lines.filter(line => line.bold).map(line => line.text), ['"UNIT REPAIRED/FOR DELIVERY"']);
});

test('the PDF row, manifest slip fields and PDF column sets never carry internal notes or workflow remarks', () => {
  const record = rmaRecord();
  const row = buildRmaOutputPdfRow(record);
  const json = JSON.stringify(row);
  assert.equal(row.case_number, 'CAS-31417-Y4Y6Z3');
  assert.equal(row.service_slip_no, 'SS#60142');
  assert.equal(row.slip_remarks, 'SAP#12019325');
  assert.match(row.items, /Lenovo ThinkPad E14/);
  assert.equal(json.includes(INTERNAL), false);
  assert.equal(json.includes(WORKFLOW), false);
  for (const value of [JSON.stringify(rmaClientSlipFields(record)), JSON.stringify(rmaClientSlipItemRows(record))]) {
    assert.equal(value.includes(INTERNAL), false);
    assert.equal(value.includes(WORKFLOW), false);
  }
  assert.ok(JSON.stringify(rmaClientSlipFields(record)).includes('SAP#12019325'));
  assert.ok(rmaClientSlipItemRows(record).some(row => row.bold && row.text === '"UNIT REPAIRED/FOR DELIVERY"'));
  for (const columns of [PDF_RMA_COLUMNS, PDF_RMA_CLIENT_SLIP_COLUMNS]) {
    const keys = columns.map(column => column.key);
    assert.equal(keys.includes('internal_logistics_remarks'), false);
    assert.equal(keys.includes('remarks'), false);
    assert.ok(columns.reduce((total, column) => total + (column.pdfWidth ?? 0), 0) <= 277, 'fits the landscape page');
  }
  assert.ok(PDF_RMA_COLUMNS.some(column => column.key === 'case_number'));
});

test('SS# is omitted from client output on every non-RTC category even if a stale value is in memory', () => {
  for (const rma_type of ['Pull Out Slip', 'Return to Supplier Slip', 'Advance Replacement Slip', 'Receiving Slip', 'Transfer Out Slip']) {
    const record = rmaRecord({ rma_type, service_slip_no: 'SS#STALE' });
    assert.equal(buildRmaClientSlipData(record).serviceSlipNo, null, rma_type);
    assert.equal(buildRmaOutputPdfRow(record).service_slip_no, '', rma_type);
    assert.equal(JSON.stringify(rmaClientSlipFields(record)).includes('SS#STALE'), false, rma_type);
  }
});

test('legacy RMAs fall back to simple items or the description and purchase date', () => {
  const simple = buildRmaClientSlipData(rmaRecord({ line_items: [{ sku: 'UTK-PRN-TH80', quantity: 2 }] }));
  assert.deepEqual(simple.items, [{ qty: 'x2', lines: [{ text: 'UTK-PRN-TH80' }] }]);
  const described = buildRmaClientSlipData(rmaRecord({ line_items: [], item_description: '1x Monitor pull-out', purchase_date: '2025-01-02', rma_contacts: [],
    customer_contact_name: 'Casey', customer_contact_phone: '+63 900' }));
  assert.deepEqual(described.items, [{ qty: '', lines: [{ text: '1x Monitor pull-out' }, { text: 'Date of Purchase: 01/02/2025' }] }]);
  assert.equal(described.contacts, 'Casey - +63 900');
  assert.equal(formatRmaItemsSummary({ line_items: [], item_description: '' }), '');
});

test('the internal Logistics route slip shows contacts plus internal notes, falling back to remarks on legacy RMAs', () => {
  const values = routeSlipRowValues(rmaRecord());
  assert.ok(values.some(value => value.includes('Alvin Gatus / Raymond Oliva / Jefferson Sualog - +639989765266') && value.includes(INTERNAL)));
  assert.equal(values.some(value => value.includes('SAP#12019325')), false, 'client slip remarks are not mixed into the driver note');
  const legacy = routeSlipRowValues(rmaRecord({ rma_contacts: [], internal_logistics_remarks: null, remarks: 'Legacy note' }));
  assert.ok(legacy.includes('Legacy note'));
  const delivery = routeSlipRowValues(rmaRecord({ category: 'Deliveries', remarks: 'Deliver to dock 3' }));
  assert.ok(delivery.includes('Deliver to dock 3'));
  const exportKeys = RMA_EXTRA_COLUMNS.map(column => column.key);
  for (const key of ['case_number', 'service_slip_no', 'structured_items_fmt', 'client_remarks', 'rma_contacts_fmt', 'internal_logistics_remarks']) assert.ok(exportKeys.includes(key), key);
});

test('item formatters and client-side item rules', () => {
  assert.equal(formatRmaItemQty({ quantity: 1, unit_type: 'Unit' }), '1Unit');
  assert.equal(formatRmaItemQty({ quantity: 2, unit_type: 'Item' }), '2Item');
  assert.equal(formatRmaItemQty({ quantity: 3, unit_type: null }), 'x3');
  assert.deepEqual(formatRmaItemLines({ sku: 'X', quantity: 1, sales_order_no: 'SO-1' }).map(line => line.text), ['X', 'SO: SO-1']);
  assert.equal(rmaLineItemErrors([{ sku: 'A', quantity: 1, serial_number: 'S', new_serial_number: 'N' }], false), 'Use either a single Serial Number or a Replacement Unit pair (New SN + Defective SN), not both.');
  assert.equal(rmaLineItemErrors([{ sku: 'A', quantity: 1, new_serial_number: 'N' }], true), 'Replacement unit items must include both New SN and Defective SN.');
  assert.equal(rmaLineItemErrors([{ sku: 'A', quantity: 1, new_serial_number: 'N' }], false), null);
  assert.equal(rmaLineItemErrors([{ sku: 'A', quantity: 1, new_serial_number: 'n', defective_serial_number: 'N' }], false), 'New SN and Defective SN must be different.');
});

test('submission errors cover RTC-only SS#, contact emails and structured items', () => {
  const base = { company_name: 'BDO', company_id: 'c1', reference: '', delivery_date: '2026-11-24', category: 'RMA', rma_movement: 'INTERNAL_NO_DRIVER',
    priority: '2 - Moderate', area: 'Makati', account_manager: 'Alex AM' };
  assert.equal(submissionErrors({ ...base, rma_type: 'Return to Customer Slip', service_slip_no: 'SS#1' }, false).service_slip_no, undefined);
  assert.match(submissionErrors({ ...base, rma_type: 'Pull Out Slip', service_slip_no: 'SS#1' }, false).service_slip_no, /Return to Customer Slip/);
  assert.match(submissionErrors({ ...base, rma_type: 'Pull Out Slip', rma_contacts: [{ name: 'A', email: 'nope' }] }, false).rma_contacts, /email/);
  assert.match(submissionErrors({ ...base, rma_type: 'Pull Out Slip', line_items: [{ sku: 'A', quantity: 1, defective_serial_number: 'D' }] }, false).line_items, /both New SN and Defective SN/);
  assert.equal(submissionErrors({ ...base, rma_type: 'Pull Out Slip', line_items: [{ sku: 'A', quantity: 1, defective_serial_number: 'D' }] }, true).line_items, undefined);
});

test('audit diffs detect and label the new fields, structured item changes and contacts', () => {
  const before = { case_number: null, service_slip_no: null, client_remarks: null, internal_logistics_remarks: null, rma_contacts: [],
    line_items: [{ id: 'l1', sku: 'Laptop', quantity: 1, unit_type: 'Unit', serial_number: 'S1' }] };
  const after = { case_number: 'CAS-1', service_slip_no: 'SS#1', client_remarks: 'SAP#1', internal_logistics_remarks: 'call', rma_contacts: [{ name: 'Alvin', phone: '1' }],
    line_items: [{ id: 'l2', sku: 'Laptop', quantity: 1, unit_type: 'Unit', serial_number: 'S2' }] };
  const labels = diffAuditEntry(before, after).map(row => row.label);
  for (const label of ['Case Number', 'Service Slip (SS#)', 'Client Slip Remarks', 'Internal Logistics Notes', 'Contact Person(s)', 'Line Items']) assert.ok(labels.includes(label), label);
  assert.equal(diffAuditEntry({ line_items: [{ id: 'a', sku: 'X', quantity: 1 }] }, { line_items: [{ id: 'b', sku: 'X', quantity: 1 }] }).length, 0, 'ids alone are not a change');
  assert.match(formatAuditValue(after.line_items), /SN: S2/);
  assert.equal(formatAuditValue(after.rma_contacts), 'Alvin - 1');
  const changes = businessAuditChanges('DeliveryRecord', before, after).map(change => change.field);
  for (const field of ['case_number', 'service_slip_no', 'client_remarks', 'internal_logistics_remarks', 'rma_contacts', 'line_items']) assert.ok(changes.includes(field), field);
});
