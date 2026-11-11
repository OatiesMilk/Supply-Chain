import { beforeEach } from 'node:test';
import { installLegacySession } from './helpers/permissionSession';
beforeEach(() => { installLegacySession('SALES_COORDINATOR', 'deliveries'); });
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import type { DeliveryRecord, UserRole } from '../src/types';
import { saveRecordToCache } from '../src/api/queries/operationalSync';
import { createUpdateRecordMutationOptions } from '../src/api/queries/useRecordsQuery';

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
  const render = async (record: DeliveryRecord, role: UserRole, onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>) => {
    const workspace = true;
    const element = workspace ? React.createElement(Workspace, {
      record, allRecordIds: [record.id], currentUserRole: role, currentUserName: role,
      companies: [], onBack: () => {}, onNavigateToRecord: () => {}, onUpdateRecord, forceReadOnly: false,
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


test('ordinary metadata editor preserves draft and original version across refresh, conflict and review failure', async()=>{
 const ui=await fixture();
 let displayed=base({id:'delivery-ui',category:'Deliveries',reference:'REF-old',rma_movement:null,edit_version:'record:old',address:'Original address'});
 const requests:any[]=[];
 const update=async (_id:string,updates:Partial<DeliveryRecord>)=>{requests.push(updates);throw Object.assign(new Error('This record changed in another session.'),{status:409});};
 mock.method(api,'getRecordAttachments',async()=>[]);
 const latest=mock.method(api,'getRecord',async()=>{throw new Error('Latest record unavailable');});
 const field=()=>[...ui.dom.window.document.querySelectorAll<HTMLInputElement>('input')].find(el=>el.value==='REF-old'||el.value==='My proposed reference'||el.value==='REF-new')!;
 const setReference=async(value:string)=>{const el=field();await act(async()=>{Object.getOwnPropertyDescriptor(ui.dom.window.HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new ui.dom.window.Event('input',{bubbles:true}));});};
 try{
  await ui.render(displayed,'Sales Coordinator',update);
  await act(async()=>ui.button('Edit')!.click());
  await setReference('My proposed reference');await ui.input('Remarks — reason for change','Correct customer reference');
  displayed={...displayed,reference:'REF-new',edit_version:'record:new'};
  await ui.render(displayed,'Sales Coordinator',update);
  await act(async()=>ui.button('Save Changes')!.click());await ui.flush();
  assert.equal(requests[0].expected_edit_version,'record:old');assert.equal(field().value,'My proposed reference');
  assert.match(ui.dom.window.document.body.textContent!,/Your draft is still in the editor/);
  await act(async()=>ui.button('Review latest saved values')!.click());await ui.flush();
  assert.equal(field().value,'My proposed reference');assert.equal(ui.field('Remarks — reason for change').value,'Correct customer reference');
  latest.mock.mockImplementation(async()=>displayed);
  await act(async()=>ui.button('Review latest saved values')!.click());await ui.flush();
  assert.equal(field().value,'My proposed reference');assert.match(ui.dom.window.document.body.textContent!,/Latest saved values/);
  await act(async()=>ui.button('Replace draft with latest saved values')!.click());await ui.flush();
  assert.equal(field().value,'REF-new');assert.equal(ui.field('Remarks — reason for change').value,'');
 }finally{await ui.close();}
});

for (const competingEdit of [false, true]) test(`combined dispatch and reschedule uses its own save result${competingEdit ? ' and detects a competing edit' : ''}`, async () => {
  // Admin is view-only on Deliveries; Logistics owns dispatch and rescheduling.
  installLegacySession('LOGISTICS', 'deliveries');
  const ui = await fixture();
  let record = base({ id: 'dispatch-version', category: 'Deliveries', reference: 'REF', rma_movement: null,
    edit_version: 'record:original', delivery_date: '2099-01-01', allowed_statuses: ['Rescheduled', 'On-Hold'] });
  mock.method(api, 'getRecord', async () => record);
  mock.method(api, 'getRecordAttachments', async () => []);
  const put = mock.method(api, 'updateRecord', async (_id, updates: any) => {
    assert.equal(updates.expected_edit_version, 'record:original');
    const ownSave = { ...record, ...updates, edit_version: 'record:own-save', modified_at: '2026-10-28T01:00:01Z' };
    record = competingEdit ? { ...ownSave, reference: 'Concurrent change', edit_version: 'record:other-save', modified_at: '2026-10-28T01:00:02Z' } : ownSave;
    return ownSave;
  });
  const patch = mock.method(api, 'patchStatus', async (_id, status, _remarks, extra) => {
    assert.equal(extra?.expected_edit_version, 'record:own-save', 'the continuation must retain its own committed token, even after a newer read');
    if (extra?.expected_edit_version !== record.edit_version) throw Object.assign(new Error('Another session changed the record'), { status: 409 });
    record = { ...record, status: status as DeliveryRecord['status'], delivery_date: extra!.delivery_date!, edit_version: 'record:rescheduled' };
    return record;
  });
  const options = createUpdateRecordMutationOptions(ui.client);
  const update = async (id: string, updates: Partial<DeliveryRecord>) => {
    const saved = await options.mutationFn({ id, updates }); await options.onSuccess(saved);
  };
  const setInput = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = element.tagName === 'TEXTAREA' ? ui.dom.window.HTMLTextAreaElement.prototype : ui.dom.window.HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value); element.dispatchEvent(new ui.dom.window.Event('input', { bubbles: true })); });
  };
  try {
    await ui.render(record, 'Logistics', update);
    await act(async () => ui.button('Status & Actions')!.click()); await ui.flush();
    await act(async () => ui.button('Rescheduled')!.click());
    await ui.input('New delivery date', '2099-01-02');
    await setInput(ui.dom.window.document.querySelector<HTMLInputElement>('input[placeholder="Name of receiver (if any)"]')!, 'Receiver');
    await setInput(ui.dom.window.document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Reason for the changes above (required)…"]')!, 'Update dispatch and delivery date');
    const save = [...ui.dom.window.document.querySelectorAll('button')].find(button => button.textContent?.includes('Save Changes'))!;
    await act(async () => save.click()); await ui.flush();
    assert.equal(put.mock.callCount(), 1); assert.equal(patch.mock.callCount(), 1);
    assert.equal(record.status, competingEdit ? 'Scheduled' : 'Rescheduled');
    assert.equal(record.delivery_date, competingEdit ? '2099-01-01' : '2099-01-02');
  } finally { await ui.close(); }
});

test('accounting draft reference advances its token after each own save', async () => {
  installLegacySession('ADMIN', 'accounting_collection');
  const ui = await fixture();
  const { default: CollectionWorkspace } = await import('../src/features/accounting/AccountingCollectionWorkspace');
  let record = base({ id: 'collection-reference', category: 'Accounting Collection', status: 'Draft', is_draft: 'Yes',
    rma_movement: null, reference: 'Original', edit_version: 'record:original' });
  mock.method(api, 'getRecordAttachments', async () => []);
  const put = mock.method(api, 'updateRecord', async (_id, updates: any) => {
    assert.equal(updates.expected_edit_version, record.edit_version);
    record = { ...record, ...updates, edit_version: `record:${updates.reference}` };
    return record;
  });
  const render = () => ui.renderElement(React.createElement(CollectionWorkspace, {
    record, allRecordIds: [record.id], currentUserRole: 'Admin', currentUserName: 'Admin', onBack() {},
    onNavigateToRecord() {}, onUpdateRecord: async () => {}, onVerifyCollection: async () => {},
  }));
  try {
    await render();
    for (const reference of ['First correction', 'Second correction']) {
      const input = [...ui.dom.window.document.querySelectorAll<HTMLInputElement>('input')].find(element => element.value === record.reference)!;
      await act(async () => { Object.getOwnPropertyDescriptor(ui.dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, reference); input.dispatchEvent(new ui.dom.window.Event('input', { bubbles: true })); });
      await ui.input('Remarks — reason for change (required)', 'Correct saved reference');
      await act(async () => ui.button('Save Draft Reference')!.click()); await ui.flush(); await render();
      assert.equal(record.reference, reference);
    }
    assert.equal(put.mock.callCount(), 2);
    assert.equal(put.mock.calls[1].arguments[1].expected_edit_version, 'record:First correction');
  } finally { await ui.close(); }
});
