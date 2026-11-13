import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { api } from '../src/api';
import type { DeliveryRecord } from '../src/types';
import { installLegacySession } from './helpers/permissionSession';
import { uiHarness } from './helpers/uiHarness';

beforeEach(() => installLegacySession('LOGISTICS', 'deliveries'));
afterEach(() => mock.restoreAll());

const photo = [{ id: 'photo', original_name: 'pod.png', mime_type: 'image/png', is_photo: true }];
const run = (updates: Partial<DeliveryRecord> = {}) => ({
  id: 'run-1', company_id: 'company', company_name: 'Gap Check Company', category: 'Deliveries',
  priority: '2 - Moderate', reference: 'DR-1043', remarks: '', status: 'Scheduled', vehicle: '(None)', area: 'Carmona',
  driver: 'Juan Driver', driver_id: 'driver-1', driver_assistants: [], time_in: null, time_out: null, received_by: null,
  account_manager: 'AM', delivery_date: '2026-11-13', item_type: 'Small Item', is_draft: 'No', item_description: 'Unit',
  attachments: [], email_notification_sent: false, output_actions_log: [], created_by: 'SC', modified_by: 'SC',
  created_at: '', modified_at: '2026-11-13T01:00:00Z', edit_version: 'v1',
  allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled', 'Delivered'], ...updates,
} as DeliveryRecord);

const dialogTitled = (ui: Awaited<ReturnType<typeof uiHarness>>, title: string) =>
  [...ui.doc.querySelectorAll('dialog')].find(d => d.querySelector('h2')?.textContent === title) ?? null;
const outside = (ui: Awaited<ReturnType<typeof uiHarness>>, label: string) =>
  [...ui.doc.querySelectorAll('button')].filter(b => !b.closest('dialog') && b.textContent!.trim() === label);

async function mount(record: DeliveryRecord, onUpdateRecord: (id: string, updates: any) => Promise<void> = async () => {}) {
  const ui = await uiHarness();
  mock.method(api, 'getRecord', async () => record);
  mock.method(api, 'getRecordAttachments', async () => photo as any);
  const timeIn = mock.method(api, 'recordTimeIn', async () => record as any);
  const { default: DriverView } = await import('../src/features/drivers/DriverView');
  await ui.render(React.createElement(DriverView, {
    records: [record], onUpdateRecord, currentUserName: 'Logi', outputActionConfigs: {} as any, onNavigate: () => {},
  }));
  const open = [...ui.doc.querySelectorAll('button')].find(b => b.textContent!.includes('Gap Check Company'));
  await ui.act(async () => open!.click()); await ui.flush();
  return { ui, timeIn };
}

test('a scheduled run starts through the Start transport dialog, not Record time in (AC11)', async () => {
  const { ui, timeIn } = await mount(run());
  try {
    assert.equal(outside(ui, 'Record time in').length, 0);
    assert.equal(outside(ui, 'Accomplish').length, 0);
    await ui.click('Start transport');
    const dialog = dialogTitled(ui, 'Start transport');
    assert.ok(dialog && dialog.open, 'dialog open');
    await ui.type('Remarks', 'Leaving the depot');
    await ui.act(async () => [...dialog!.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Start transport')!.click());
    await ui.flush();
    assert.equal(timeIn.mock.callCount(), 1);
    assert.equal(timeIn.mock.calls[0].arguments[0], 'run-1');
  } finally { await ui.close(); }
});

test('an in-transit run completes through Mark as delivered with no inline Received By or uploader (AC11)', async () => {
  const calls: any[] = [];
  const { ui } = await mount(run({ status: 'In Transit', time_in: '2026-11-13T01:42:00.000Z' }), async (id, updates) => { calls.push({ id, updates }); });
  try {
    assert.equal(ui.doc.getElementById('driver-run-receiver'), null);
    assert.equal(outside(ui, 'Select Photo / Document').length, 0);
    await ui.click('Mark as delivered');
    const dialog = dialogTitled(ui, 'Mark as delivered');
    assert.ok(dialog && dialog.open, 'dialog open');
    await ui.type('Received by', ' Guard '); await ui.type('Remarks', 'Handed over');
    await ui.act(async () => [...dialog!.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Mark as delivered')!.click());
    await ui.flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].updates.status, 'Delivered');
    assert.equal(calls[0].updates.received_by, 'Guard');
    assert.equal(calls[0].updates.status_remarks, 'Handed over');
  } finally { await ui.close(); }
});

test('Pending keeps its confirm dialog and saves with the reason (AC11)', async () => {
  const calls: any[] = [];
  const { ui } = await mount(run({ status: 'In Transit', time_in: '2026-11-13T01:42:00.000Z' }), async (id, updates) => { calls.push({ id, updates }); });
  try {
    await ui.click('Pending');
    assert.ok(ui.doc.getElementById('driver-status-title'));
    await ui.type('Remarks — reason for change (required)', 'Customer closed');
    await ui.click('Confirm');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].updates.status, 'Pending');
    assert.equal(calls[0].updates.status_remarks, 'Customer closed');
  } finally { await ui.close(); }
});
