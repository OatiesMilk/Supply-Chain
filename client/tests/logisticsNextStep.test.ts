import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { api } from '../src/api';
import { notify } from '../src/utils/notify';
import type { DeliveryCategory, DeliveryRecord, UserRole } from '../src/types';
import { installLegacySession } from './helpers/permissionSession';
import { uiHarness } from './helpers/uiHarness';

let sessionRole: Parameters<typeof installLegacySession>[0] = 'LOGISTICS';
beforeEach(() => { sessionRole = 'LOGISTICS'; installLegacySession(sessionRole, 'deliveries'); });
afterEach(() => mock.restoreAll());

const photo = [{ id: 'photo', original_name: 'pod.png', mime_type: 'image/png', is_photo: true }];
const run = (updates: Partial<DeliveryRecord> = {}) => ({
  id: 'run-1', company_id: 'company', company_name: 'Gap Check Company', category: 'Deliveries' as DeliveryCategory,
  priority: '2 - Moderate', reference: 'DR-1043', remarks: '', status: 'In Transit', vehicle: '(None)', area: 'Carmona',
  driver: 'Juan Driver', driver_id: 'driver-1', driver_assistants: [], time_in: '2026-11-13T01:42:00.000Z', time_out: null,
  received_by: null, account_manager: 'AM', delivery_date: '2026-11-13', item_type: 'Small Item', is_draft: 'No',
  item_description: 'Unit', attachments: [], email_notification_sent: false, output_actions_log: [],
  created_by: 'SC', modified_by: 'SC', created_at: '', modified_at: '2026-11-13T01:00:00Z', edit_version: 'v1',
  allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled', 'Delivered'], ...updates,
} as DeliveryRecord);

async function mount(record: DeliveryRecord, role: UserRole = 'Logistics', onUpdateRecord: (id: string, updates: any) => Promise<void> = async () => {}) {
  const ui = await uiHarness();
  mock.method(api, 'getRecord', async () => record);
  mock.method(api, 'getRecordAttachments', async () => photo as any);
  const { default: Workspace } = await import('../src/features/deliveries/DeliveryRecordWorkspace');
  await ui.render(React.createElement(Workspace, {
    record, allRecordIds: [record.id], currentUserRole: role, currentUserName: 'Logi', companies: [], onBack: () => {}, onNavigateToRecord: () => {},
    onUpdateRecord, forceReadOnly: false,
    outputActionConfigs: new Proxy({}, { get: () => ({ internalOnly: true, notifyLogistics: true }) }) as any,
  }));
  if (ui.button('Status & Actions')) { await ui.act(async () => ui.button('Status & Actions')!.click()); await ui.flush(); }
  return ui;
}
const dialogTitled = (ui: Awaited<ReturnType<typeof uiHarness>>, title: string) => [...ui.doc.querySelectorAll('dialog')].find(d => d.querySelector('h2')?.textContent === title) ?? null;
const outsideDialog = (ui: Awaited<ReturnType<typeof uiHarness>>, selector: string) => [...ui.doc.querySelectorAll<HTMLElement>(selector)].filter(el => !el.closest('dialog'));

for (const category of ['Deliveries', 'Sales Orders', 'Procurement Pick-up'] as const) {
  test(`${category}: Next step card replaces the inline completion controls (AC1, AC8)`, async () => {
    const ui = await mount(run({ category }));
    try {
      const card = ui.doc.querySelector('[data-testid="next-step-card"]')!;
      assert.ok(card, 'Next step card');
      assert.match(card.textContent!, /In transit since/); assert.match(card.textContent!, /Driver: Juan Driver/);
      assert.ok([...card.querySelectorAll('button')].some(b => b.textContent!.trim() === 'Mark as delivered'));
      assert.equal(outsideDialog(ui, 'input[type="file"]').length, 0, 'no inline proof uploader');
      assert.ok(!ui.doc.querySelector('input[placeholder="Name of receiver (if any)"]'), 'no Received By before delivery');
      assert.equal(ui.button('Delivered'), undefined, 'no Delivered status option');
      for (const status of ['Pending', 'On-Hold', 'Rescheduled']) assert.ok(ui.button(status), status);
      assert.ok(card.compareDocumentPosition(ui.button('Pending')!) & 4, 'card comes before the status options');
    } finally { await ui.close(); }
  });
}

test('Mark as delivered sends the completion, runs output actions and closes (AC2, AC4, AC6)', async () => {
  const calls: any[] = [];
  const info = mock.method(notify, 'info', () => {}); const success = mock.method(notify, 'success', () => {});
  const ui = await mount(run(), 'Logistics', async (id, updates) => { calls.push({ id, updates }); });
  try {
    await ui.click('Mark as delivered');
    const dialog = dialogTitled(ui, 'Mark as delivered')!;
    assert.ok(dialog.open);
    assert.match(dialog.textContent!, /Gap Check Company · Deliveries · Ref DR-1043/);
    assert.match(dialog.textContent!, /Recording for Juan Driver\. This is saved under your name\./);
    await ui.type('Received by', ' Warehouse guard '); await ui.type('Remarks', ' Handed over ');
    await ui.act(async () => [...dialog.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Mark as delivered')!.click()); await ui.flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'run-1');
    assert.equal(calls[0].updates.status, 'Delivered'); assert.equal(calls[0].updates.received_by, 'Warehouse guard'); assert.equal(calls[0].updates.status_remarks, 'Handed over');
    assert.equal(success.mock.calls[0].arguments[0], 'Marked as delivered');
    assert.ok(info.mock.callCount() >= 1, 'Accomplished output actions ran');
    assert.ok(!dialogTitled(ui, 'Mark as delivered'), 'dialog closed');
  } finally { await ui.close(); }
});

test('a rejected completion keeps the dialog open with the message and typed values (AC5)', async () => {
  const ui = await mount(run(), 'Logistics', async () => { throw new Error('Upload at least one JPG or PNG delivery photo before completing this delivery.'); });
  try {
    await ui.click('Mark as delivered');
    await ui.type('Received by', 'Guard'); await ui.type('Remarks', 'Done');
    const dialog = dialogTitled(ui, 'Mark as delivered')!;
    await ui.act(async () => [...dialog.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Mark as delivered')!.click()); await ui.flush();
    assert.ok(dialogTitled(ui, 'Mark as delivered'));
    assert.match(dialogTitled(ui, 'Mark as delivered')!.querySelector('[role="alert"]')!.textContent!, /Upload at least one JPG or PNG/);
    assert.equal((ui.field('Received by') as HTMLInputElement).value, 'Guard');
  } finally { await ui.close(); }
});

test('Cancel closes the dialog without saving (AC7)', async () => {
  const calls: unknown[] = [];
  const ui = await mount(run(), 'Logistics', async (...args) => { calls.push(args); });
  try {
    await ui.click('Mark as delivered'); await ui.type('Remarks', 'Draft note');
    await ui.act(async () => [...dialogTitled(ui, 'Mark as delivered')!.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Cancel')!.click()); await ui.flush();
    assert.ok(!dialogTitled(ui, 'Mark as delivered')); assert.equal(calls.length, 0);
  } finally { await ui.close(); }
});

test('Start transport replaces the Record Time In box and sends remarks (AC9)', async () => {
  const timeIn = mock.method(api, 'recordTimeIn', async () => run({ status: 'In Transit' }) as any);
  const ui = await mount(run({ status: 'Scheduled', time_in: null, allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled'] }));
  try {
    assert.equal(ui.button('Record Time In'), undefined, 'blue box is gone');
    assert.match(ui.doc.querySelector('[data-testid="next-step-card"]')!.textContent!, /Not started yet/);
    assert.equal(ui.button('Mark as delivered'), undefined);
    await ui.click('Start transport');
    assert.ok(dialogTitled(ui, 'Start transport'));
    assert.equal([...dialogTitled(ui, 'Start transport')!.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Start transport')!.hasAttribute('disabled'), true);
    await ui.type('Remarks', ' Leaving now ');
    await ui.act(async () => [...dialogTitled(ui, 'Start transport')!.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Start transport')!.click()); await ui.flush();
    assert.deepEqual(timeIn.mock.calls[0].arguments, ['run-1', 'Leaving now']);
  } finally { await ui.close(); }
});

test('no driver: the card asks for an assignment and shows no button (AC9)', async () => {
  const ui = await mount(run({ status: 'Scheduled', time_in: null, driver: '', driver_id: null, allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled'] }));
  try {
    const card = ui.doc.querySelector('[data-testid="next-step-card"]')!;
    assert.match(card.textContent!, /Assign a driver below before this run can start\./);
    assert.equal(card.querySelectorAll('button').length, 0);
  } finally { await ui.close(); }
});

test('Delivered runs show who received them and no button; Received By stays for corrections (AC14)', async () => {
  const ui = await mount(run({ status: 'Delivered', time_out: '2026-11-13T03:00:00.000Z', received_by: 'Guard', allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled'] }));
  try {
    const card = ui.doc.querySelector('[data-testid="next-step-card"]')!;
    assert.match(card.textContent!, /Delivered .*Received by Guard\./);
    assert.equal(card.querySelectorAll('button').length, 0);
    assert.ok(ui.doc.querySelector('input[placeholder="Name of receiver (if any)"]'), 'correction field remains after delivery');
  } finally { await ui.close(); }
});

test('Draft records show no Next step card (AC14)', async () => {
  const ui = await mount(run({ status: 'Draft', is_draft: 'Yes', time_in: null, allowed_statuses: ['Scheduled'] }));
  try { assert.ok(!ui.doc.querySelector('[data-testid="next-step-card"]')); } finally { await ui.close(); }
});

test('unsaved edits disable the Next step button and say why (AC15)', async () => {
  const ui = await mount(run());
  try {
    assert.equal(ui.button('Mark as delivered')!.disabled, false);
    await ui.act(async () => ui.button('Pending')!.click());
    assert.equal(ui.button('Mark as delivered')!.disabled, true);
    assert.match(ui.doc.querySelector('[data-testid="next-step-card"]')!.textContent!, /Save or revert your changes below first\./);
    await ui.click('Revert');
    assert.equal(ui.button('Mark as delivered')!.disabled, false);
  } finally { await ui.close(); }
});

test('only Logistics and Admin see the card, and only with the right permissions (AC13)', async () => {
  const ui = await mount(run(), 'Sales Coordinator');
  try { assert.ok(!ui.doc.querySelector('[data-testid="next-step-card"]')); } finally { await ui.close(); }
});
