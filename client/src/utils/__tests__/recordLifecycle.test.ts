import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DeliveryRecord } from '../../types';
import { canRecordTimeIn, dashboardRunDaysLate, deliveryScheduleState, hasValidRunTimeIn, isDashboardRunActionable, isDraftRecord, selectableStatuses, manilaToday, manilaDateTimeInput, manilaInputToIso, rescheduleDateError, isPriorityLocked, returnToDraftConsequences, submissionErrors } from '../recordLifecycle';

const record = (overrides: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  status: 'Scheduled', is_draft: 'No', driver: 'Assigned Driver', time_in: null,
  allowed_statuses: ['On-Hold', 'Rescheduled', 'Draft'], ...overrides,
} as DeliveryRecord);

test('Save as Draft accepts an incomplete reference; Submit requires the reference and both require a selected company', () => {
  const draft = { company_name: 'Customer', company_id: 'company-1', reference: '   ', delivery_date: '2026-08-01' };
  assert.deepEqual(submissionErrors(draft, true), {});
  assert.match(submissionErrors(draft, false).reference, /required/);
  assert.deepEqual(submissionErrors({ ...draft, reference: 'SAP-89' }, false), {});
  assert.match(submissionErrors({ ...draft, company_id: '' }, true).company_name, /Select/);
  assert.match(submissionErrors({ ...draft, company_name: '   ' }, false).company_name, /required/);
});

test('RMA submissions add explicit movement and conditional transport date to shared required fields', () => {
  const draft = {
    company_name: 'Customer', company_id: 'company-1', reference: '', delivery_date: '2026-08-01', category: 'RMA',
    rma_reference: '', rma_type: '', purchase_date: '', customer_contact_name: '', customer_contact_email: '', customer_contact_phone: '',
  };
  for (const isDraft of [true, false]) {
    assert.deepEqual(Object.keys(submissionErrors(draft, isDraft)).sort(), isDraft ? ['account_manager', 'area', 'priority'] : ['account_manager', 'area', 'priority', 'rma_movement']);
    const complete = { ...draft, priority: '2 - Moderate', area: 'Carmona', account_manager: 'Alex AM', delivery_date: '', rma_movement: 'INTERNAL_NO_DRIVER' };
    assert.deepEqual(submissionErrors(complete, isDraft), {});
    assert.match(submissionErrors({ ...complete, company_id: '' }, isDraft).company_name, /Select/);
    assert.match(submissionErrors({ ...complete, priority: 'invalid' }, isDraft).priority, /valid/);
    assert.match(submissionErrors({ ...complete, customer_contact_email: 'invalid' }, isDraft).customer_contact_email, /valid email/);
  }
});

test('frontend choices use server transitions and limit Draft to SC/Admin before Time In', () => {
  const run = record();
  assert.deepEqual(selectableStatuses(run, 'Logistics'), ['On-Hold', 'Rescheduled']);
  assert.deepEqual(selectableStatuses(run, 'Admin'), ['On-Hold', 'Rescheduled', 'Draft']);
  assert.deepEqual(selectableStatuses(run, 'Sales Coordinator'), ['Draft']);
  assert.deepEqual(selectableStatuses(record({ time_in: '2026-10-06T01:00:00Z' }), 'Admin'), ['On-Hold', 'Rescheduled']);
  assert.deepEqual(selectableStatuses(record({ allowed_statuses: ['In Transit', 'Delivered', 'Pending'] }), 'Admin'), ['Delivered', 'Pending']);
  assert.deepEqual(selectableStatuses(record({ allowed_statuses: undefined }), 'Admin'), []);
});

test('drafts can be submitted but cannot start runs or receive assignments', () => {
  const draft = record({ status: 'Draft', is_draft: 'Yes', allowed_statuses: ['Scheduled'] });
  assert.equal(isDraftRecord(draft), true);
  assert.equal(canRecordTimeIn(draft), false);
  assert.deepEqual(selectableStatuses(draft, 'Sales Coordinator'), ['Scheduled']);
  assert.equal(canRecordTimeIn(record({ is_draft: 'Yes' })), false);
});

test('only assigned, not-yet-started Scheduled/Rescheduled runs offer Time In', () => {
  assert.equal(canRecordTimeIn(record({ category: 'RMA' })), false);
  assert.equal(canRecordTimeIn(record()), true);
  assert.equal(canRecordTimeIn(record({ status: 'Rescheduled' })), true);
  assert.equal(canRecordTimeIn(record({ driver: '' })), false);
  assert.equal(canRecordTimeIn(record({ time_in: '2026-10-06T01:00:00Z' })), false);
  for (const status of ['In Transit', 'Pending', 'Delivered', 'On-Hold'] as const) assert.equal(canRecordTimeIn(record({ status })), false);
});

test('today and corrections consistently use Manila around UTC day boundaries', () => {
  assert.equal(manilaToday(new Date('2026-10-05T16:01:00Z')), '2026-10-06');
  assert.equal(manilaToday(new Date('2026-10-06T15:59:59Z')), '2026-10-06');
  assert.equal(manilaDateTimeInput('2026-10-06T01:23:00Z'), '2026-10-06T09:23');
  assert.equal(manilaInputToIso('2026-10-06T09:23'), '2026-10-06T01:23:00.000Z');
  assert.equal(manilaDateTimeInput(null), '');
});

test('Delivery actionability uses the latest date, allows overdue runs, and keeps upcoming runs read-only', () => {
  const today = '2026-10-08';
  assert.deepEqual(deliveryScheduleState('2026-10-08', today), { valid: true, future: false, overdue: false, daysLate: 0 });
  assert.deepEqual(deliveryScheduleState('2026-10-06', today), { valid: true, future: false, overdue: true, daysLate: 2 });
  assert.equal(isDashboardRunActionable(record({ category: 'Deliveries', delivery_date: '2026-10-06' }), today), true);
  assert.equal(dashboardRunDaysLate(record({ category: 'Deliveries', delivery_date: '2026-10-06' }), today), 2);
  assert.equal(isDashboardRunActionable(record({ category: 'Deliveries', delivery_date: '2026-10-09' }), today), false);
  assert.equal(isDashboardRunActionable(record({ category: 'Deliveries', delivery_date: '2026-10-09', time_in: '2026-10-09T01:00:00Z' }), today), true);
  assert.equal(isDashboardRunActionable(record({ category: 'Accounting Collection', delivery_date: '2026-10-06' }), today), true);
  assert.equal(isDashboardRunActionable(record({ category: 'Deliveries', delivery_date: '2026-02-30' }), today), false);
});

test('every non-RMA category keeps unfinished overdue and started runs actionable across Manila midnight', () => {
  const beforeMidnight = manilaToday(new Date('2026-10-08T15:59:59Z'));
  const afterMidnight = manilaToday(new Date('2026-10-08T16:00:00Z'));
  for (const category of ['Deliveries', 'Procurement Pick-up', 'Accounting Collection', 'Sales Orders'] as const) {
    const run = record({ category, delivery_date: beforeMidnight });
    assert.equal(isDashboardRunActionable(run, beforeMidnight), true, category);
    assert.equal(isDashboardRunActionable(run, afterMidnight), true, category);
    assert.equal(isDashboardRunActionable({ ...run, time_in: '2026-10-08T15:00:00Z' }, afterMidnight), true, category);
    assert.equal(isDashboardRunActionable({ ...run, delivery_date: '2026-10-10' }, afterMidnight), false, category);
    assert.equal(isDashboardRunActionable({ ...run, delivery_date: '2026-10-10', time_in: '2026-10-08T15:00:00Z' }, afterMidnight), true, category);
    assert.equal(isDashboardRunActionable({ ...run, delivery_date: '2026-02-30' }, afterMidnight), false, category);
    assert.equal(isDashboardRunActionable({ ...run, delivery_date: '', time_in: 'bad timestamp' }, afterMidnight), false, category);
    assert.equal(isDashboardRunActionable({ ...run, status: 'Delivered' }, afterMidnight), false, category);
    assert.equal(isDashboardRunActionable({ ...run, status: 'Draft' }, afterMidnight), false, category);
    assert.equal(isDashboardRunActionable({ ...run, is_draft: 'Yes' }, afterMidnight), false, category);
    assert.equal(isDashboardRunActionable({ ...run, driver: '' }, afterMidnight), false, category);
    for (const status of ['Scheduled', 'Rescheduled', 'In Transit', 'Pending', 'On-Hold'] as const) {
      assert.equal(isDashboardRunActionable({ ...run, status }, afterMidnight), true, `${category}: ${status}`);
    }
  }
  assert.equal(isDashboardRunActionable(record({ category: 'RMA', delivery_date: beforeMidnight, time_in: '2026-10-08T15:00:00Z' }), afterMidnight), false);
});

test('completed-late display uses the persisted completion value', () => {
  assert.equal(dashboardRunDaysLate(record({ category: 'Deliveries', status: 'Delivered', delivery_date: '2026-10-06', completed_late: true, days_late: 2 }), '2026-10-12'), 2);
  assert.equal(dashboardRunDaysLate(record({ category: 'Deliveries', status: 'Delivered', delivery_date: '2026-10-06', completed_late: false, days_late: 0 }), '2026-10-12'), 0);
});

test('started Delivery eligibility requires the server timestamp format', () => {
  assert.equal(hasValidRunTimeIn('2026-10-08T01:00:00.000Z'), true);
  assert.equal(hasValidRunTimeIn('2026-10-08 01:00:00'), false);
  assert.equal(isDashboardRunActionable(record({ category: 'Deliveries', delivery_date: '2026-10-09', time_in: '2026-10-08 01:00:00' }), '2026-10-08'), false);
});

test('TSK-123: reschedule date must be present, valid, not past and different from the current date', () => {
  assert.match(rescheduleDateError('', '2026-10-09', '2026-10-09') ?? '', /Enter the new/);
  assert.match(rescheduleDateError('2026-02-30', '2026-10-09', '2026-10-09') ?? '', /valid/);
  assert.match(rescheduleDateError('2026-10-08', '2026-10-12', '2026-10-09') ?? '', /past/);
  assert.match(rescheduleDateError('2026-10-12', '2026-10-12', '2026-10-09') ?? '', /different/);
  assert.equal(rescheduleDateError('2026-10-09', '2026-10-05', '2026-10-09'), null);
  assert.equal(rescheduleDateError('2026-10-10', '2026-10-09', '2026-10-09'), null);
});

test('TSK-124: Priority is locked only once a record is Delivered', () => {
  assert.equal(isPriorityLocked({ status: 'Delivered' }), true);
  for (const status of ['Draft', 'Scheduled', 'In Transit', 'On-Hold', 'Pending', 'Rescheduled'] as const) {
    assert.equal(isPriorityLocked({ status }), false, status);
  }
});

test('TSK-125: Return to Draft consequences name the driver only when assigned and mention Logistics only with dispatch', () => {
  const assigned = returnToDraftConsequences({ driver: 'Ronald de la Cruz', category: 'Deliveries' });
  assert.deepEqual(assigned, [
    'Ronald de la Cruz will no longer see this run until you submit it again.',
    "Logistics can't change the driver or vehicle while it's a Draft.",
    'You can edit the order details, then press Submit to send it back to Logistics.',
  ]);

  const unassigned = returnToDraftConsequences({ driver: '', category: 'Sales Orders' });
  assert.equal(unassigned.some(line => /will no longer see/.test(line)), false);
  assert.equal(unassigned.some(line => /Logistics can't change/.test(line)), true);

  const rma = returnToDraftConsequences({ driver: '  ', category: 'RMA' });
  assert.deepEqual(rma, ['You can edit the details, then press Submit to send it again.']);
  assert.equal(returnToDraftConsequences({ driver: 'Leo Driver', category: 'RMA' }).some(line => /Logistics/.test(line)), false);
});

test('Logistics RMA submission needs a valid date; no-driver and supplier movements never require a driver or date', () => {
  const fields = { company_name: 'Company', company_id: 'company', reference: '', delivery_date: '', category: 'RMA', priority: '2 - Moderate', area: 'Carmona', account_manager: 'AM' };
  for (const rma_movement of ['SUPPLIER_COLLECTION', 'INTERNAL_NO_DRIVER']) assert.deepEqual(submissionErrors({ ...fields, rma_movement }, false), {});
  assert.match(submissionErrors({ ...fields, rma_movement: 'LOGISTICS_TRANSPORT' }, false).delivery_date, /valid Delivery Date/);
  assert.match(submissionErrors({ ...fields, rma_movement: 'LOGISTICS_TRANSPORT', delivery_date: '2026-02-30' }, false).delivery_date, /valid Delivery Date/);
  assert.deepEqual(submissionErrors({ ...fields, rma_movement: 'LOGISTICS_TRANSPORT', delivery_date: '2026-10-28' }, false), {});
  assert.deepEqual(submissionErrors({ ...fields, rma_movement: null }, true), {});
});

test('final RMA completion is selectable only by TASS while Admin Delivery completion remains available', () => {
  const rma = record({ category: 'RMA', allowed_statuses: ['Pending', 'Delivered'] });
  assert.deepEqual(selectableStatuses(rma, 'TASS'), ['Pending', 'Delivered']);
  for (const role of ['Admin', 'Logistics', 'Driver', 'Sales Coordinator'] as const) assert.equal(selectableStatuses(rma, role).includes('Delivered'), false);
  assert.deepEqual(selectableStatuses(record({ category: 'Deliveries', allowed_statuses: ['Delivered'] }), 'Admin'), ['Delivered']);
});
