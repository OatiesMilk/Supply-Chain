import { beforeEach } from 'node:test';
import { installLegacySession } from './helpers/permissionSession';
beforeEach(() => { installLegacySession('TASS', 'rma'); });
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import type { DeliveryRecord, UserRole } from '../src/types';
import { notify } from '../src/utils/notify';

const base = (updates: Partial<DeliveryRecord> = {}) => ({
  id: 'rma-overview', company_id: 'company', company_name: 'RMA customer', category: 'RMA',
  priority: '2 - Moderate', reference: 'RMA-255', remarks: '', status: 'Scheduled',
  vehicle: '(None)', area: 'Carmona', driver: '', driver_id: null, driver_assistants: [], time_in: null, time_out: null,
  received_by: null, account_manager: 'AM', delivery_date: '2026-10-28', item_type: 'Small Item', is_draft: 'No',
  item_description: 'Returned unit', attachments: [], email_notification_sent: false, output_actions_log: [],
  created_by: 'TASS', modified_by: 'TASS', created_at: '', modified_at: '2026-10-28T01:00:00Z',
  allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled', 'Delivered', 'Draft'],
  rma_movement: 'SUPPLIER_COLLECTION', rma_version: 0, ...updates,
} as DeliveryRecord);
const none = { assign: false, transport: false, receive: false, complete: false, pod: false, correctTransport: false };

async function fixture() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const indexedDB = { open: () => {
    const request: any = { result: { transaction: () => ({ objectStore: () => ({ index: () => ({ getAll: () => {
      const read: any = { result: [] }; queueMicrotask(() => read.onsuccess?.()); return read;
    } }) }) }) } };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  // JSDOM has no native dialog behavior; the dialogs' handlers and markup are what these tests cover.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), indexedDB, requestAnimationFrame: (callback: () => void) => { callback(); return 0; }, IDBKeyRange: { only: (value: unknown) => value }, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, name, { value, configurable: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const { createRoot } = await import('react-dom/client');
  const { default: Workspace } = await import('../src/features/deliveries/DeliveryRecordWorkspace');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  // Opens the record on its Overview tab (the default), with the spy as the save handler.
  const render = async (record: DeliveryRecord, role: UserRole, onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>) => {
    const element = React.createElement(Workspace, {
      record, allRecordIds: [record.id], currentUserRole: role, currentUserName: role,
      companies: [], onBack: () => {}, onNavigateToRecord: () => {}, onUpdateRecord, forceReadOnly: false,
      outputActionConfigs: new Proxy({}, { get: () => ({ internalOnly: true }) }) as React.ComponentProps<typeof Workspace>['outputActionConfigs'],
    });
    await act(async () => { root.render(React.createElement(QueryClientProvider, { client }, element)); }); await flush();
  };
  const button = (label: string) => [...dom.window.document.querySelectorAll('button')].find(el => el.textContent?.trim() === label) as HTMLButtonElement | undefined;
  const field = (label: string) => {
    const el = [...dom.window.document.querySelectorAll('label')].find(el => el.childNodes[0]?.textContent?.trim() === label)!;
    return dom.window.document.getElementById(el.htmlFor) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  };
  const input = async (label: string, value: string) => {
    const el = field(label); const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  };
  const mockReads = (record: DeliveryRecord) => {
    mock.method(api, 'getRecord', async () => record); mock.method(api, 'getRecordAttachments', async () => []);
    mock.method(api, 'getRmaCapabilities', async () => none); mock.method(api, 'getAccountManagers', async () => []);
    mock.method(api, 'getCompanies', async () => []);
  };
  return { dom, client, flush, render, button, field, input, mockReads, close: async () => {
    await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
    for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'getComputedStyle', 'indexedDB', 'IDBKeyRange', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name); }
  } };
}

const lockHint = /Locked after transport starts or receipt is confirmed\./;
const lockedCases = [
  {
    name: 'transport started',
    record: base({ rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'IN_TRANSIT', rma_transport_started_at: '2026-11-20T01:00:00Z' }),
    edit: 'Edit', save: 'Save Changes', reason: 'Remarks — reason for change',
  },
  {
    name: 'receipt confirmed',
    record: base({ rma_received_at: '2026-11-20T02:00:00Z' }),
    edit: 'Edit', save: 'Save Changes', reason: 'Remarks — reason for change',
  },
  {
    name: 'completed',
    record: base({ status: 'Delivered', rma_received_at: '2026-11-20T02:00:00Z', rma_completed_at: '2026-11-20T03:00:00Z' }),
    edit: 'Correct completed RMA', save: 'Save correction', reason: 'Correction reason',
  },
];

for (const lockedCase of lockedCases) test(`RMA Overview edit locks Movement method and Delivery Date after transport start, receipt or completion (${lockedCase.name})`, async () => {
  const ui = await fixture(); const record = lockedCase.record;
  const onUpdateRecord = mock.fn(async (_id: string, _updates: Partial<DeliveryRecord>) => {});
  ui.mockReads(record);
  try {
    await ui.render(record, 'TASS', onUpdateRecord);
    await act(async () => ui.button(lockedCase.edit)!.click()); await ui.flush();
    const movement = ui.dom.window.document.getElementById('edit-rma-movement') as HTMLSelectElement;
    const deliveryDate = ui.dom.window.document.getElementById('overview-delivery-date') as HTMLInputElement;
    assert.equal(movement.disabled, true, 'Movement method is locked');
    assert.equal(deliveryDate.disabled, true, 'Delivery Date is locked');
    assert.match(ui.dom.window.document.body.textContent!, lockHint);
    assert.match(movement.getAttribute('aria-describedby') ?? '', /edit-rma-movement-lock/);
    await ui.input(lockedCase.reason, 'Correct the case details');
    await act(async () => ui.button(lockedCase.save)!.click()); await ui.flush();
    assert.equal(onUpdateRecord.mock.callCount(), 1, 'the other edits still save');
    const updates = onUpdateRecord.mock.calls[0].arguments[1];
    assert.equal('delivery_date' in updates, false, 'a locked date is never sent');
    assert.equal('rma_movement' in updates, false, 'a locked movement is never sent');
  } finally { await ui.close(); }
});

test('a Scheduled RMA with nothing started keeps Movement method and Delivery Date editable', async () => {
  const ui = await fixture(); const record = base();
  const onUpdateRecord = mock.fn(async (_id: string, _updates: Partial<DeliveryRecord>) => {});
  ui.mockReads(record);
  try {
    await ui.render(record, 'TASS', onUpdateRecord);
    await act(async () => ui.button('Edit')!.click()); await ui.flush();
    const movement = ui.dom.window.document.getElementById('edit-rma-movement') as HTMLSelectElement;
    const deliveryDate = ui.dom.window.document.getElementById('overview-delivery-date') as HTMLInputElement;
    assert.equal(movement.disabled, false); assert.equal(deliveryDate.disabled, false);
    assert.doesNotMatch(ui.dom.window.document.body.textContent!, lockHint);
    await ui.input('Remarks — reason for change', 'Correct the reference');
    await act(async () => ui.button('Save Changes')!.click()); await ui.flush();
    const updates = onUpdateRecord.mock.calls[0].arguments[1];
    assert.ok('delivery_date' in updates, 'the date is sent when editable');
    assert.ok('rma_movement' in updates, 'the movement is sent when editable');
  } finally { await ui.close(); }
});

test('Admin has no RMA Edit control on a locked RMA, because RMA is read-only for Admin', async () => {
  // moduleAccessRules.ts lists RMA in ADMIN_READ_ONLY, so the Overview never offers Admin an RMA editor. The lock is TASS-facing.
  installLegacySession('ADMIN', 'rma');
  const ui = await fixture();
  const record = base({ rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'IN_TRANSIT', rma_transport_started_at: '2026-11-20T01:00:00Z' });
  ui.mockReads(record);
  try {
    await ui.render(record, 'Admin', mock.fn(async () => {}));
    assert.equal(ui.button('Edit'), undefined, 'Admin cannot open the RMA editor');
    assert.equal(ui.button('Correct completed RMA'), undefined);
  } finally { await ui.close(); }
});

test('TASS correcting a completed RMA sees a relabelled button, a completed-record warning and must give a correction reason', async () => {
  const ui = await fixture();
  const completed = base({ status: 'Delivered', rma_received_at: '2026-11-20T02:00:00Z', rma_completed_at: '2026-11-20T03:00:00Z' });
  const onUpdateRecord = mock.fn(async (_id: string, _updates: Partial<DeliveryRecord>) => {});
  const toast = mock.method(notify, 'success', () => {});
  ui.mockReads(completed);
  try {
    await ui.render(completed, 'TASS', onUpdateRecord);
    assert.equal(ui.button('Edit'), undefined, 'a completed RMA no longer offers a plain Edit');
    assert.ok(ui.button('Correct completed RMA'), 'the completed RMA offers a correction');
    assert.match(ui.dom.window.document.body.textContent!, /This RMA is completed\. Use “Correct completed RMA” only to fix a mistake/);
    await act(async () => ui.button('Correct completed RMA')!.click()); await ui.flush();
    const banner = [...ui.dom.window.document.querySelectorAll('[role="alert"]')].find(el => el.textContent?.includes('You are correcting a completed RMA.'));
    assert.ok(banner, 'the warning banner is shown while correcting');
    await act(async () => ui.button('Save correction')!.click()); await ui.flush();
    assert.equal(onUpdateRecord.mock.callCount(), 0, 'an empty reason sends nothing');
    assert.match(ui.dom.window.document.body.textContent!, /A correction reason is required to save changes to a completed RMA\./);
    await ui.input('Correction reason', 'Fixed serial number typo');
    await act(async () => ui.button('Save correction')!.click()); await ui.flush();
    assert.equal(onUpdateRecord.mock.callCount(), 1);
    assert.equal(onUpdateRecord.mock.calls[0].arguments[1].remarks, 'Fixed serial number typo');
    assert.equal(toast.mock.calls.at(-1)?.arguments[0], 'Completed RMA corrected');
  } finally { await ui.close(); }
});

test('Non-completed RMAs keep Edit, the remarks label and Save Changes for TASS', async () => {
  const ui = await fixture(); const record = base();
  ui.mockReads(record);
  try {
    await ui.render(record, 'TASS', mock.fn(async () => {}));
    assert.ok(ui.button('Edit'), 'Edit is unchanged for a Scheduled RMA');
    assert.equal(ui.button('Correct completed RMA'), undefined);
    await act(async () => ui.button('Edit')!.click()); await ui.flush();
    assert.equal(ui.dom.window.document.querySelector('[role="alert"]')?.textContent?.includes('You are correcting a completed RMA.') ?? false, false);
    assert.ok(ui.field('Remarks — reason for change'), 'the standard reason label stays');
    assert.ok(ui.button('Save Changes'), 'the standard save label stays');
  } finally { await ui.close(); }
});

test('a completed legacy RMA with no movement or Logistics date saves an unrelated correction without a movement or date error', async () => {
  const ui = await fixture();
  const legacy = base({ status: 'Delivered', rma_movement: null, delivery_date: '', rma_received_at: '2026-11-20T02:00:00Z', rma_completed_at: '2026-11-20T03:00:00Z' });
  const onUpdateRecord = mock.fn(async (_id: string, _updates: Partial<DeliveryRecord>) => {});
  ui.mockReads(legacy);
  try {
    await ui.render(legacy, 'TASS', onUpdateRecord);
    await act(async () => ui.button('Correct completed RMA')!.click()); await ui.flush();
    await ui.input('Correction reason', 'Fix the case number');
    await act(async () => ui.button('Save correction')!.click()); await ui.flush();
    assert.equal(onUpdateRecord.mock.callCount(), 1, 'the unrelated correction is saved');
    const updates = onUpdateRecord.mock.calls[0].arguments[1];
    assert.equal('rma_movement' in updates, false, 'an unclassified movement is never sent');
    assert.equal('delivery_date' in updates, false, 'a locked date is never sent');
    assert.doesNotMatch(ui.dom.window.document.body.textContent!, /Choose a movement method|planned transport date/);
  } finally { await ui.close(); }
});

// #360: Return to Draft follows the server guard (records.ts) even when allowed_statuses still lists Draft.
const returnToDraftLockedCases = [
  { name: 'transport started', record: base({ rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'IN_TRANSIT', rma_transport_started_at: '2026-11-20T01:00:00Z' }) },
  { name: 'receipt confirmed', record: base({ rma_received_at: '2026-11-20T02:00:00Z' }) },
  { name: 'completed without transport or receipt timestamps', record: base({ status: 'Delivered', rma_received_at: null, rma_transport_started_at: null }) },
];

for (const lockedCase of returnToDraftLockedCases) test(`Return to Draft is hidden for an RMA once it is locked (${lockedCase.name})`, async () => {
  const ui = await fixture(); const record = lockedCase.record;
  assert.ok(record.allowed_statuses?.includes('Draft'), 'the fixture still lists Draft as an allowed status');
  ui.mockReads(record);
  try {
    await ui.render(record, 'TASS', mock.fn(async () => {}));
    assert.equal(ui.button('Return to Draft'), undefined, 'Return to Draft is not offered');
    assert.equal(ui.dom.window.document.getElementById('submission-change-remarks'), null, 'no submission panel is shown');
  } finally { await ui.close(); }
});

test('Return to Draft stays available for a Scheduled RMA with nothing started', async () => {
  const ui = await fixture(); const record = base();
  ui.mockReads(record);
  try {
    await ui.render(record, 'TASS', mock.fn(async () => {}));
    assert.ok(ui.button('Return to Draft'), 'Return to Draft is offered before transport or receipt');
  } finally { await ui.close(); }
});

test('a Draft RMA still offers Submit to TASS', async () => {
  const ui = await fixture(); const record = base({ status: 'Draft', is_draft: 'Yes', allowed_statuses: ['Scheduled'] });
  ui.mockReads(record);
  try {
    await ui.render(record, 'TASS', mock.fn(async () => {}));
    assert.ok(ui.dom.window.document.getElementById('submission-change-remarks'), 'the submission panel is shown');
    assert.ok(ui.button('Submit'), 'Submit is offered');
  } finally { await ui.close(); }
});

test('non-RMA Return to Draft keeps the existing Time In rule', async () => {
  installLegacySession('SALES_COORDINATOR', 'deliveries');
  const delivery = (updates: Partial<DeliveryRecord> = {}) => base({
    category: 'Deliveries', rma_movement: null, allowed_statuses: ['On-Hold', 'Rescheduled', 'Draft'], ...updates,
  });
  for (const [record, shown] of [[delivery(), true], [delivery({ time_in: '2026-11-20T01:00:00Z' }), false]] as const) {
    const ui = await fixture();
    ui.mockReads(record);
    try {
      await ui.render(record, 'Sales Coordinator', mock.fn(async () => {}));
      assert.equal(Boolean(ui.button('Return to Draft')), shown, shown ? 'offered before Time In' : 'hidden after Time In');
    } finally { await ui.close(); }
  }
});
