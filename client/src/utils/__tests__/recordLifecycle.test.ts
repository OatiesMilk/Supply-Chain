import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DeliveryRecord } from '../../types';
import { canRecordTimeIn, isDraftRecord, selectableStatuses, manilaToday, manilaDateTimeInput, manilaInputToIso, submissionErrors } from '../recordLifecycle';

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
