import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { api } from '../src/api';
import type { DeliveryRecord } from '../src/types';
import { installLegacySession } from './helpers/permissionSession';
import { uiHarness } from './helpers/uiHarness';

beforeEach(() => installLegacySession('LOGISTICS', 'accounting_collection'));
afterEach(() => mock.restoreAll());

const photo = [{ id: 'photo', original_name: 'receipt.png', mime_type: 'image/png', is_photo: true }];
const collection = (updates: Partial<DeliveryRecord> = {}) => ({
  id: 'col-1', company_id: 'company', company_name: 'Gap Check Company', category: 'Accounting Collection',
  priority: '2 - Moderate', reference: 'OR-77', remarks: '', status: 'Scheduled', vehicle: '(None)', area: 'Makati',
  driver: 'Juan Driver', driver_id: 'driver-1', driver_assistants: [], time_in: null, time_out: null, received_by: null,
  account_manager: 'AM', delivery_date: '2026-11-13', item_type: 'Small Item', is_draft: 'No', item_description: '',
  attachments: [], email_notification_sent: false, output_actions_log: [], created_by: 'AC', modified_by: 'AC',
  created_at: '', modified_at: '2026-11-13T01:00:00Z', edit_version: 'v1', amount: 100,
  allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled', 'Delivered'], ...updates,
} as DeliveryRecord);

const dialogTitled = (ui: Awaited<ReturnType<typeof uiHarness>>, title: string) =>
  [...ui.doc.querySelectorAll('dialog')].find(d => d.querySelector('h2')?.textContent === title) ?? null;

async function mount(record: DeliveryRecord, onUpdateRecord: (id: string, updates: any) => Promise<void> = async () => {}) {
  const ui = await uiHarness();
  mock.method(api, 'getRecord', async () => record);
  mock.method(api, 'getRecordAttachments', async () => photo as any);
  const { default: Workspace } = await import('../src/features/accounting/AccountingCollectionWorkspace');
  await ui.render(React.createElement(Workspace, {
    record, allRecordIds: [record.id], currentUserRole: 'Logistics', currentUserName: 'Logi',
    onBack: () => {}, onNavigateToRecord: () => {}, onVerifyCollection: async () => {}, onUpdateRecord,
  }));
  return ui;
}

test('collection card offers Start transport, then Mark as collected, with no inline completion controls (AC10)', async () => {
  const ui = await mount(collection());
  try {
    const card = ui.doc.querySelector('[data-testid="next-step-card"]');
    assert.ok(card, 'Next step card');
    assert.ok(card.textContent!.includes('Start transport'));
    assert.ok(!ui.doc.body.textContent!.includes('Record Time In'));
    assert.equal([...ui.doc.querySelectorAll('button')].filter(b => !b.closest('dialog') && b.textContent!.trim() === 'Delivered').length, 0);
  } finally { await ui.close(); }
});

test('an in-transit collection completes through the Mark as collected dialog (AC10)', async () => {
  const calls: any[] = [];
  const ui = await mount(collection({ status: 'In Transit', time_in: '2026-11-13T01:42:00.000Z' }), async (id, updates) => { calls.push({ id, updates }); });
  try {
    assert.ok(ui.doc.querySelector('[data-testid="next-step-card"]')!.textContent!.includes('Mark as collected'));
    await ui.click('Mark as collected');
    const dialog = dialogTitled(ui, 'Mark as collected');
    assert.ok(dialog && dialog.open, 'dialog open');
    await ui.type('Received by', ' Cashier '); await ui.type('Remarks', 'Cheque received');
    await ui.act(async () => [...dialog!.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Mark as collected')!.click());
    await ui.flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].updates.status, 'Delivered');
    assert.equal(calls[0].updates.received_by, 'Cashier');
    assert.equal(calls[0].updates.status_remarks, 'Cheque received');
  } finally { await ui.close(); }
});
