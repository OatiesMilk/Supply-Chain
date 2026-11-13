import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DeliveryRecord } from '../../types';
import { filterRecordsForDashboard, getManilaWeekRange, matchesDashboardFilter } from '../dashboardFilters';

const record = (overrides: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  id: 'REC-1',
  company_name: 'Example Company',
  company_id: 'company-1',
  priority: '2 - Moderate',
  reference: 'REF-1',
  remarks: '',
  status: 'Scheduled',
  vehicle: '(None)',
  area: 'Makati',
  driver: '',
  driver_assistants: [],
  account_manager: 'AM One',
  delivery_date: '2026-10-06',
  category: 'Deliveries',
  item_type: 'Small Item',
  is_draft: 'No',
  item_description: 'Sample',
  attachments: [],
  email_notification_sent: false,
  output_actions_log: [],
  created_by: 'Tester',
  created_at: '2026-10-05T16:30:00.000Z',
  modified_by: 'Tester',
  modified_at: '2026-10-05T16:30:00.000Z',
  time_out: null,
  collection_verified: false,
  collection_verified_at: null,
  ...overrides,
} as DeliveryRecord);

test('SC and Logistics delivery presets exclude other modules and both draft representations', () => {
  const scheduled = record({ status: 'Scheduled', delivery_date: '2026-10-06' });
  const wrongCategory = record({ category: 'Sales Orders' });
  const draftFlag = record({ is_draft: 'Yes' });
  const draftStatus = record({ status: 'Draft' });

  assert.equal(matchesDashboardFilter(scheduled, 'sc-scheduled-today', '2026-10-06'), true);
  assert.equal(matchesDashboardFilter(wrongCategory, 'sc-scheduled-today', '2026-10-06'), false);
  assert.equal(matchesDashboardFilter(draftFlag, 'sc-pending-assignment', '2026-10-06'), false);
  assert.equal(matchesDashboardFilter(draftStatus, 'log-unassigned', '2026-10-06'), false);
  assert.equal(matchesDashboardFilter(record({ status: 'On-Hold' }), 'sc-on-hold'), true);
  assert.equal(matchesDashboardFilter(record({ status: 'Rescheduled' }), 'log-rescheduled'), true);
  assert.equal(matchesDashboardFilter(record({ status: 'Delivered', driver: '' }), 'log-unassigned'), false);
});

test('SC needs-attention union counts each matching Delivery once and includes overdue due-soon rows', () => {
  const overdueOnHold = record({ status: 'On-Hold', delivery_date: '2026-10-01' });
  const dueInTwoDays = record({ id: 'REC-2', delivery_date: '2026-10-08' });
  const dueInThreeDays = record({ id: 'REC-3', status: 'In Transit', delivery_date: '2026-10-09' });
  const filtered = filterRecordsForDashboard(
    [overdueOnHold, dueInTwoDays, dueInThreeDays],
    'sc-attention-all',
    '2026-10-06',
  );

  assert.deepEqual(filtered.map(item => item.id), ['REC-1', 'REC-2']);
  assert.equal(matchesDashboardFilter(overdueOnHold, 'sc-attention-no-driver', '2026-10-06'), true);
  assert.equal(matchesDashboardFilter(dueInTwoDays, 'sc-attention-no-driver', '2026-10-06'), true);
  assert.equal(matchesDashboardFilter(dueInThreeDays, 'sc-attention-no-driver', '2026-10-06'), false);
});

test('Logistics Flags union counts unique unassigned and blocked Delivery rows', () => {
  const unassignedOnHold = record({ status: 'On-Hold' });
  const assignedRescheduled = record({ id: 'REC-2', status: 'Rescheduled', driver: 'Driver One' });
  const completedUnassigned = record({ id: 'REC-3', status: 'Delivered', driver: '' });
  const rmaOnHold = record({ id: 'REC-4', category: 'RMA', status: 'On-Hold' });

  assert.deepEqual(
    filterRecordsForDashboard([unassignedOnHold, assignedRescheduled, completedUnassigned, rmaOnHold], 'log-flags').map(item => item.id),
    ['REC-1', 'REC-2'],
  );
});

test('Completed Today uses Manila Time Out day boundaries', () => {
  const justBeforeManilaMidnight = record({ status: 'Delivered', time_out: '2026-10-05T15:59:59.999Z' });
  const atManilaMidnight = record({ status: 'Delivered', time_out: '2026-10-05T16:00:00.000Z' });
  const lastMillisecondOfManilaDay = record({ status: 'Delivered', time_out: '2026-10-06T15:59:59.999Z' });
  const nextManilaDay = record({ status: 'Delivered', time_out: '2026-10-06T16:00:00.000Z' });

  assert.equal(matchesDashboardFilter(justBeforeManilaMidnight, 'sc-completed-today', '2026-10-06'), false);
  assert.equal(matchesDashboardFilter(atManilaMidnight, 'log-completed-today', '2026-10-06'), true);
  assert.equal(matchesDashboardFilter(lastMillisecondOfManilaDay, 'sc-completed-today', '2026-10-06'), true);
  assert.equal(matchesDashboardFilter(nextManilaDay, 'log-completed-today', '2026-10-06'), false);
});

test('Logistics includes every completed category and uses RMA final completion', () => {
  const today = '2026-10-06';
  const now = '2026-10-06T01:00:00.000Z';
  const yesterday = '2026-10-05T01:00:00.000Z';
  const ordinary = { status: 'Delivered', time_out: now } as const;
  for (const category of ['Procurement Pick-up', 'Sales Orders', 'Accounting Collection'] as const) {
    assert.equal(matchesDashboardFilter(record({ ...ordinary, category }), 'log-completed-today', today), true);
    assert.equal(matchesDashboardFilter(record({ ...ordinary, category }), 'sc-completed-today', today), false);
  }
  const rma = { category: 'RMA', status: 'Delivered' } as const;
  assert.equal(matchesDashboardFilter(record({ ...rma, rma_completed_at: now }), 'log-completed-today', today), true);
  assert.equal(matchesDashboardFilter(record({ ...rma, time_out: now }), 'log-completed-today', today), true);
  assert.equal(matchesDashboardFilter(record({ ...rma, rma_completed_at: yesterday, time_out: now }), 'log-completed-today', today), false);
  assert.equal(matchesDashboardFilter(record({ ...rma, status: 'Scheduled', rma_transport_status: 'COMPLETED', rma_transport_completed_at: now }), 'log-completed-today', today), false);
});

test('TASS and Admin collection presets preserve category, lifecycle, and verification predicates', () => {
  const openRma = record({ category: 'RMA', status: 'Pending' });
  const heldRma = record({ category: 'RMA', status: 'On-Hold' });
  const pickup = record({ category: 'Procurement Pick-up', status: 'Scheduled' });
  const pendingCollection = record({ category: 'Accounting Collection', status: 'Delivered', collection_verified: false });

  assert.equal(matchesDashboardFilter(openRma, 'tass-open-rma'), true);
  assert.equal(matchesDashboardFilter(heldRma, 'tass-rma-on-hold'), true);
  assert.equal(matchesDashboardFilter(pickup, 'tass-pending-pickups'), true);
  assert.equal(matchesDashboardFilter(pendingCollection, 'tass-pending-verification'), true);
  assert.equal(matchesDashboardFilter(pendingCollection, 'admin-unverified-collections'), true);
});

test('Admin week preset starts Sunday in Manila', () => {
  assert.deepEqual(getManilaWeekRange('2026-10-06'), { from: '2026-10-04', to: '2026-10-06' });
});
