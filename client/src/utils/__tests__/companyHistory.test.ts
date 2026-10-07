import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DeliveryRecord } from '../../types';
import { COMPANY_HISTORY_PAGE_SIZE, companyRecords, historyCategories, nextHistoryCursor, recordScreen } from '../companyHistory';

const record = (overrides: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  id: 'REC-1', company_id: 'company-1', company_name: 'Acme Corp', category: 'Deliveries', ...overrides,
} as DeliveryRecord);

const access = (...screens: string[]) => (screen: string) => screens.includes(screen);

test('company history joins on the Company ID, never on a matching name', () => {
  const records = [
    record({ id: 'REC-1' }),
    record({ id: 'REC-2', company_id: 'company-2', company_name: 'Acme Corp' }),
    record({ id: 'REC-3', company_id: 'customer-1', company_name: 'Acme Corp' }),
  ];
  assert.deepEqual(companyRecords(records, 'company-1').map(r => r.id), ['REC-1']);
  assert.deepEqual(companyRecords(records, 'Acme Corp'), []);
});

test('rows link to their own module only when the user can open it', () => {
  const tass = access('rma', 'accounting_collection');
  assert.equal(recordScreen(record({ category: 'RMA' }), tass), 'rma');
  assert.equal(recordScreen(record({ category: 'Accounting Collection' }), tass), 'accounting_collection');
  assert.equal(recordScreen(record({ category: 'Deliveries' }), tass), null);
  assert.equal(recordScreen(record({ category: 'Sales Orders' }), access('sales_orders')), 'sales_orders');
});

test('category filters only offer modules the user can access', () => {
  assert.deepEqual(historyCategories(access('rma', 'accounting_collection')), ['RMA', 'Accounting Collection']);
  assert.deepEqual(historyCategories(access()), []);
});

test('pagination continues from the last row only after a full page', () => {
  const full = Array.from({ length: COMPANY_HISTORY_PAGE_SIZE }, (_, i) => ({ id: `REC-${i}` }));
  assert.equal(nextHistoryCursor(full), `REC-${COMPANY_HISTORY_PAGE_SIZE - 1}`);
  assert.equal(nextHistoryCursor(full.slice(1)), undefined);
  assert.equal(nextHistoryCursor([]), undefined);
});
