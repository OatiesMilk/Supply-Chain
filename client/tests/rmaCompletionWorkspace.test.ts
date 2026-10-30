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
import { saveRecordToCache } from '../src/api/queries/operationalSync';

const base = (updates: Partial<DeliveryRecord> = {}) => ({
  id: 'rma-ui', company_id: 'company', company_name: 'RMA customer', category: 'RMA',
  priority: '2 - Moderate', reference: 'RMA-255', remarks: '', status: 'Scheduled',
  vehicle: '(None)', area: 'Carmona', driver: '', driver_id: null, driver_assistants: [], time_in: null, time_out: null,
  received_by: null, account_manager: 'AM', delivery_date: '2026-10-28', item_type: 'Small Item', is_draft: 'No',
  item_description: 'Returned unit', attachments: [], email_notification_sent: false, output_actions_log: [],
  created_by: 'TASS', modified_by: 'TASS', created_at: '', modified_at: '2026-10-28T01:00:00Z',
  allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled', 'Delivered', 'Draft'],
  rma_movement: 'SUPPLIER_COLLECTION', rma_version: 0, ...updates,
} as DeliveryRecord);

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
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), indexedDB, requestAnimationFrame: (callback: () => void) => { callback(); return 0; }, IDBKeyRange: { only: (value: unknown) => value }, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, name, { value, configurable: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const { createRoot } = await import('react-dom/client');
  const { default: Workspace } = await import('../src/features/deliveries/DeliveryRecordWorkspace');
  const { default: Panel } = await import('../src/features/deliveries/RmaWorkflowPanel');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const render = async (record: DeliveryRecord, role: UserRole, workspace = false) => {
    const element = workspace ? React.createElement(Workspace, {
      record, allRecordIds: [record.id], currentUserRole: role, currentUserName: role,
      companies: [], onBack: () => {}, onNavigateToRecord: () => {}, onUpdateRecord: async () => {}, forceReadOnly: role === 'Logistics',
      outputActionConfigs: new Proxy({}, { get: () => ({ internalOnly: true }) }) as React.ComponentProps<typeof Workspace>['outputActionConfigs'],
    }) : React.createElement(Panel, { record, currentUserRole: role });
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
  const renderElement = async (element: React.ReactNode) => { await act(async () => root.render(React.createElement(QueryClientProvider, { client }, element))); await flush(); };
  return { dom, client, flush, render, renderElement, button, field, input, close: async () => {
    await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
    for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'getComputedStyle', 'indexedDB', 'IDBKeyRange', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name); }
  } };
}
const none = { assign: false, transport: false, receive: false, complete: false, pod: false };

test('TASS confirms physical receipt separately before final completion without a metadata PUT or driver clocks', async () => {
  const ui = await fixture(); let record = base();
  mock.method(api, 'getRecord', async () => record); mock.method(api, 'getRecordAttachments', async () => []);
  mock.method(api, 'getRmaCapabilities', async () => ({ ...none, receive: !record.rma_received_at, complete: !!record.rma_received_at && record.status !== 'Delivered' }));
  const put = mock.method(api, 'updateRecord', async () => { throw new Error('Receipt is a dedicated action'); });
  const receive = mock.method(api, 'receiveRma', async (_id, data) => record = { ...record, rma_version: 1, rma_recipient: data.recipient, rma_received_at: '2026-10-28T02:00:00Z', rma_received_by: 'tass-id' });
  const complete = mock.method(api, 'patchStatus', async () => record = { ...record, status: 'Delivered', rma_version: 2, rma_completed_at: '2026-10-28T02:01:00Z' });
  try {
    await ui.render(record, 'TASS', true); await act(async () => ui.button('Status & Actions')!.click()); await ui.flush();
    assert.equal(ui.button('Complete RMA'), undefined); assert.doesNotMatch(ui.dom.window.document.body.textContent!, /Record Time In|Driver & Delivery Details/);
    await ui.input('Recipient', 'Collector'); await ui.input('Remarks', 'Units physically received');
    await act(async () => ui.button('Confirm physical receipt')!.click()); await ui.flush();
    assert.deepEqual(receive.mock.calls[0].arguments, [record.id, { expected_version: 0, remarks: 'Units physically received', recipient: 'Collector' }]);
    assert.ok(ui.button('Complete RMA')); assert.match(ui.dom.window.document.body.textContent!, /Physical receipt: Collector/);
    await ui.input('Remarks', 'RMA reviewed and completed'); await act(async () => ui.button('Complete RMA')!.click()); await ui.flush();
    assert.deepEqual(complete.mock.calls[0].arguments, [record.id, 'Delivered', 'RMA reviewed and completed', { expected_version: 1, received_by: 'Collector' }]);
    assert.equal(record.time_in, null); assert.equal(record.time_out, null); assert.equal(put.mock.callCount(), 0);
  } finally { await ui.close(); }
});

test('Logistics reuses coverage-ranked assignment in its read-only workspace and refused saves preserve the edit', async () => {
  const ui = await fixture(); const record = base({ area: 'Imus, Cavite', rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'PENDING' });
  mock.method(api, 'getRecord', async () => record); mock.method(api, 'getRecordAttachments', async () => []); mock.method(api, 'getRmaCapabilities', async () => ({ ...none, assign: true }));
  mock.method(api, 'getDrivers', async () => [
    { id: 'driver-other', name: 'Other Driver', type: 'DRIVER', is_active: true, coverage_areas: [] },
    { id: 'driver-subregion', name: 'Subregion Driver', type: 'DRIVER', is_active: true, coverage_areas: ['Cavite'] },
    { id: 'driver-a', name: 'Driver A', type: 'DRIVER', is_active: true, coverage_areas: ['Imus, Cavite'] },
    { id: 'driver-inactive', name: 'Inactive Driver', type: 'DRIVER', is_active: false, coverage_areas: ['Imus, Cavite'] },
    { id: 'assistant-a', name: 'Assistant A', type: 'ASSISTANT', is_active: true, coverage_areas: ['Imus, Cavite'] },
  ] as any);
  let rejectSave: () => void = () => {}; const assignment = mock.method(api, 'assignRma', async () => new Promise((_done, reject) => { rejectSave = () => reject(new Error('Save refused; retry')); }));
  try {
    await ui.render(record, 'Logistics', true); assert.equal(ui.button('Edit'), undefined);
    await act(async () => ui.button('Status & Actions')!.click()); await ui.flush();
    const driverSelect = ui.field('Driver') as HTMLSelectElement;
    assert.deepEqual([...driverSelect.querySelectorAll('optgroup')].map(group => group.label), ['Covers Imus, Cavite', 'Covers Cavite (subregion)', 'Other drivers']);
    assert.deepEqual([...driverSelect.options].map(option => option.value), ['', 'driver-a', 'driver-subregion', 'driver-other']);
    await ui.input('Driver', 'driver-a'); await ui.input('Remarks', 'Assign today');
    await act(async () => ui.button('Save assignment')!.click()); await ui.flush(); assert.equal(ui.button('Save assignment')!.disabled, true);
    await act(async () => rejectSave()); await ui.flush(); assert.match(ui.dom.window.document.body.textContent!, /Save refused; retry/);
    assert.equal(ui.field('Driver').value, 'driver-a'); assert.equal(ui.field('Remarks').value, 'Assign today');
    assert.deepEqual(assignment.mock.calls[0].arguments[1], { expected_version: 0, remarks: 'Assign today', driver_id: 'driver-a', vehicle: '(None)', driver_assistants: [] });
    assert.equal(ui.button('Complete RMA'), undefined); assert.equal(ui.button('Confirm physical receipt'), undefined);
  } finally { await ui.close(); }
});

test('Driver transport completion requires POD and never calls the final RMA status action', async () => {
  const ui = await fixture(); let record = base({ rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'IN_TRANSIT', driver_id: 'driver-a', driver: 'Driver A' }); let photos: any[] = [];
  const initialRecord = record;
  mock.method(api, 'getRecord', async () => record); mock.method(api, 'getRecordAttachments', async () => photos);
  mock.method(api, 'getRmaCapabilities', async () => ({ ...none, transport: record.rma_transport_status !== 'COMPLETED', pod: true }));
  const final = mock.method(api, 'patchStatus', async () => { throw new Error('Driver cannot finalize RMA'); });
  const transport = mock.method(api, 'progressRmaTransport', async () => record = { ...record, rma_version: 1, rma_transport_status: 'COMPLETED', rma_transport_completed_at: '2026-10-28T02:00:00Z' });
  try {
    await ui.render(record, 'Driver');
    await ui.input('Remarks', 'Transport finished'); assert.equal(ui.button('Complete transport')!.disabled, true);
    photos = [{ id: 'photo', original_name: 'pod.png', mime_type: 'image/png', is_photo: true }]; await act(async () => { await ui.client.invalidateQueries({ queryKey: ['pod-attachments', record.id] }); }); await ui.flush();
    assert.equal(ui.button('Complete transport')!.disabled, false); await act(async () => ui.button('Complete transport')!.click()); await ui.flush();
    assert.equal(transport.mock.callCount(), 1); assert.equal(final.mock.callCount(), 0); assert.equal(record.status, 'Scheduled'); assert.equal(record.rma_received_at, undefined);
    assert.match(ui.dom.window.document.body.textContent!, /Transport: Complete/); assert.equal(ui.button('Complete RMA'), undefined);
    await ui.render(initialRecord, 'Logistics', true);
    const summary = () => ui.dom.window.document.querySelector('[aria-label="Record summary"]')!.textContent!;
    assert.match(summary(), /Transport: Complete/);
    assert.match(summary(), /RMA: Scheduled/);
    assert.doesNotMatch(summary(), /Transport: In Transit|RMA: Complete/);
    assert.match(ui.dom.window.document.body.textContent!, /Awaiting physical receipt confirmation by TASS/);
  } finally { await ui.close(); }
});

test('a newer assignment preserves dirty fields and requires review before saving', async () => {
  const ui = await fixture(); let record = base({ rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'PENDING' });
  mock.method(api, 'getRecord', async () => record); mock.method(api, 'getRecordAttachments', async () => []); mock.method(api, 'getRmaCapabilities', async () => ({ ...none, assign: true })); mock.method(api, 'getDrivers', async () => []);
  const save = mock.method(api, 'assignRma', async () => record);
  try {
    await ui.render(record, 'Logistics'); await ui.input('Remarks', 'My draft note'); record = { ...record, rma_version: 1, driver_id: 'driver-b', driver: 'Driver B' };
    await act(async () => { await ui.client.invalidateQueries({ queryKey: ['records', 'detail', record.id] }); }); await ui.flush();
    assert.equal(ui.field('Remarks').value, 'My draft note'); assert.equal(ui.button('Save assignment')!.disabled, true); assert.match(ui.dom.window.document.body.textContent!, /changed while you were editing/); assert.equal(save.mock.callCount(), 0);
    await act(async () => ui.button('Use latest saved values')!.click()); await ui.flush(); assert.equal(ui.field('Remarks').value, ''); assert.match(ui.dom.window.document.body.textContent!, /Driver: Driver B/);
  } finally { await ui.close(); }
});

test('Admin cannot receive or finalize even if a malformed capability response allows it', async () => {
  const ui = await fixture(); const record = base({ rma_received_at: '2026-10-28T02:00:00Z', rma_recipient: 'Collector' });
  mock.method(api, 'getRecord', async () => record); mock.method(api, 'getRecordAttachments', async () => []); mock.method(api, 'getRmaCapabilities', async () => ({ ...none, receive: true, complete: true }));
  try { await ui.render(record, 'Admin'); assert.equal(ui.button('Complete RMA'), undefined); assert.equal(ui.button('Confirm physical receipt'), undefined); } finally { await ui.close(); }
});


test('shared RMA creation requires an explicit movement choice and preserves submitted items and document reference', async () => {
  const ui = await fixture();
  const { default: CreateForm } = await import('../src/features/deliveries/RecordCreateForm');
  const submit = mock.fn(async (data: any) => base({ ...data, id: 'created-rma' }));
  const company = { id: 'company', name: 'RMA Company', contact_person: 'Contact' } as any;
  try {
    await ui.renderElement(React.createElement(CreateForm, { category: 'RMA', categoryLocked: true, companies: [company], onSubmit: submit, onCancel: () => {} }));
    await act(async () => ui.button('Auto Fill')!.click());
    const form = ui.dom.window.document.querySelector('form')!;
    const submitForm = async (label: string) => { await act(async () => form.dispatchEvent(new ui.dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: ui.button(label) }))); await ui.flush(); };
    await submitForm('Submit');
    assert.equal(submit.mock.callCount(), 0);
    assert.match(ui.dom.window.document.body.textContent!, /Select a movement method before submitting/);
    const select = ui.dom.window.document.getElementById('create-rma-movement') as HTMLSelectElement;
    await act(async () => { select.value = 'LOGISTICS_TRANSPORT'; select.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true })); });
    await submitForm('Submit');
    assert.equal(submit.mock.callCount(), 1);
    const saved = submit.mock.calls[0].arguments[0];
    assert.equal(saved.rma_movement, 'LOGISTICS_TRANSPORT'); assert.equal(saved.category, 'RMA'); assert.equal(saved.is_draft, 'No');
    assert.equal(saved.company_id, company.id); assert.ok(saved.delivery_date); assert.ok(saved.line_items.length > 0);
    assert.equal(saved.reference, ''); assert.equal(saved.rma_reference, null, 'auto-fill does not invent manual references');
  } finally { await ui.close(); }
});

test('existing RMA rescheduling can resume Scheduled through a versioned non-final status action', async () => {
  const ui = await fixture(); const record = base({ status: 'Rescheduled', allowed_statuses: ['Scheduled', 'On-Hold', 'Draft'], rma_version: 4 });
  mock.method(api, 'getRecord', async () => record); mock.method(api, 'getRecordAttachments', async () => []);
  mock.method(api, 'getRmaCapabilities', async () => ({ ...none, status: true }));
  const patch = mock.method(api, 'patchStatus', async () => ({ ...record, status: 'Scheduled', rma_version: 5 }));
  try {
    await ui.render(record, 'TASS'); await ui.input('RMA status', 'Scheduled'); await ui.input('Remarks', 'Resume the planned return');
    await act(async () => ui.button('Save RMA status')!.click()); await ui.flush();
    assert.deepEqual(patch.mock.calls[0].arguments, [record.id, 'Scheduled', 'Resume the planned return', { expected_version: 4 }]);
    assert.equal(ui.button('Complete RMA'), undefined);
  } finally { await ui.close(); }
});

test('record rows update from saved transport and ordinary status changes across operational roles', async () => {
  const { default: RecordsView } = await import('../src/features/deliveries/DeliveryRecordsView');
  const cases: Array<{ category: DeliveryRecord['category']; role: UserRole }> = [
    { category: 'RMA', role: 'Logistics' }, { category: 'RMA', role: 'TASS' },
    { category: 'Sales Orders', role: 'Sales Coordinator' },
    { category: 'Deliveries', role: 'Logistics' }, { category: 'Deliveries', role: 'Driver' },
  ];
  for (const { category, role } of cases) {
    const ui = await fixture();
    let record = base({ category, rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'PENDING' });
    mock.method(api, 'getPagedRecords', async () => ({ rows: [record], total: 1, page: 1, limit: 25, hasMore: false, nextCursor: null }));
    mock.method(api, 'getStatusHistoryCounts', async () => ({} as any));
    try {
      await ui.renderElement(React.createElement(RecordsView, {
        category, records: [record], companies: [], currentUserRole: role, currentUserName: role,
        onCreateRecord: async () => { throw new Error('No record creation expected'); }, onUpdateRecord: async () => {},
        onVerifyCollection: async () => {}, outputActionConfigs: {} as any, onUpdateOutputActionConfig: () => {},
        dashboardFilterId: null, clearDashboardFilter: () => {},
      }));
      const row = () => ui.dom.window.document.querySelector('tbody tr')!.textContent!;
      assert.match(row(), category === 'RMA' ? /Transport: Pending/ : /Scheduled/);
      for (const [index, status] of ['In Transit', 'Delivered'].entries()) {
        record = category === 'RMA'
          ? { ...record, rma_version: index + 1, rma_transport_status: index === 0 ? 'IN_TRANSIT' : 'COMPLETED' }
          : { ...record, status: status as DeliveryRecord['status'], modified_at: `2026-10-30T01:00:0${index + 1}Z` };
        await act(async () => { await saveRecordToCache(ui.client, record); }); await ui.flush();
        assert.match(row(), category === 'RMA' ? index === 0 ? /Transport: In Transit/ : /Transport: Complete/ : new RegExp(status));
        if (category === 'RMA') { assert.match(row(), /RMA: Scheduled/); assert.doesNotMatch(row(), /RMA: Complete/); }
        else assert.doesNotMatch(row(), /Scheduled|Transport:/);
      }
    } finally { await ui.close(); }
  }
});
