import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DeliveryRecord } from '../../types';
import { recordLabel } from '../recordLabel';
import { serializeAllOpsRow, ALL_OPS_COLUMNS, PDF_ALL_OPS_COLUMNS } from '../allOpsExport';
import { DELIVERY_COLUMNS, PDF_AC_COLUMNS, PDF_DELIVERY_COLUMNS, PDF_RMA_COLUMNS } from '../export';

const record = (overrides: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  id: 'REC-0b7c1f8e-2f1d-4e4a-9a51-3f6f2c7d9e10', record_no: 'DEL-26-00042', company_id: 'company-1', company_name: 'Acme Corp',
  category: 'Deliveries', reference: 'SAP-1', status: 'Scheduled', driver_assistants: [], line_items: [], ...overrides,
} as DeliveryRecord);

test('recordLabel shows the record number, and the internal id only for payloads without one', () => {
  assert.equal(recordLabel(record()), 'DEL-26-00042');
  assert.equal(recordLabel(record({ record_no: null })), 'REC-0b7c1f8e-2f1d-4e4a-9a51-3f6f2c7d9e10');
  assert.equal(recordLabel({ id: 'col-1', record_no: 'COL-26-00019' }), 'COL-26-00019');
});

test('exports label the column Record No. and fill it with the record number', () => {
  for (const columns of [DELIVERY_COLUMNS, PDF_DELIVERY_COLUMNS, PDF_RMA_COLUMNS, PDF_AC_COLUMNS, ALL_OPS_COLUMNS, PDF_ALL_OPS_COLUMNS]) {
    const column = columns.find(c => c.key === 'id');
    assert.equal(column?.header, 'Record No.');
  }
  assert.equal(serializeAllOpsRow(record()).id, 'DEL-26-00042');
});
