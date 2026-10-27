import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import type { DeliveryRecord } from '../src/types';

test('TASS and Admin complete RMA through the workspace with recipient and remarks in one status request', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true },
    IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let root: import('react-dom/client').Root | undefined;
  try {
    const { createRoot } = await import('react-dom/client');
    const { default: Workspace } = await import('../src/features/deliveries/DeliveryRecordWorkspace');
    const { createUpdateRecordMutationOptions } = await import('../src/api/queries/useRecordsQuery');
    const record = {
      id: 'rma-ui', company_id: 'company', company_name: 'RMA customer', category: 'RMA',
      priority: '2 - Moderate', reference: '', remarks: '', status: 'Scheduled',
      vehicle: '', area: 'Carmona', driver: '', driver_assistants: [], time_in: null, time_out: null,
      received_by: null, account_manager: 'AM', delivery_date: '', item_type: 'Small Item', is_draft: 'No',
      item_description: '', attachments: [], email_notification_sent: false, output_actions_log: [],
      created_by: 'TASS', modified_by: 'TASS', created_at: '', modified_at: '',
      allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled', 'Delivered', 'Draft'],
    } as DeliveryRecord;
    mock.method(api, 'getRecord', async () => record);
    mock.method(api, 'getRecordAttachments', async () => []);
    const put = mock.method(api, 'updateRecord', async () => { throw new Error('Recipient must not be saved in a separate PUT'); });
    const patch = mock.method(api, 'patchStatus', async () => ({ ...record, status: 'Delivered', received_by: 'Collector' }));
    root = createRoot(dom.window.document.getElementById('root')!);
    const workspaceRoot = root;
    const options = createUpdateRecordMutationOptions(client);
    for (const role of ['TASS', 'Admin'] as const) {
      await act(async () => {
        workspaceRoot.render(React.createElement(QueryClientProvider, { client }, React.createElement(Workspace, {
          key: role, record, allRecordIds: [record.id], currentUserRole: role, currentUserName: role,
          companies: [], onBack: () => {}, onNavigateToRecord: () => {},
          onUpdateRecord: async (id, updates) => { await options.mutationFn({ id, updates }); },
          outputActionConfigs: new Proxy({}, { get: () => ({ internalOnly: true }) }) as React.ComponentProps<typeof Workspace>['outputActionConfigs'],
        })));
      });
      const button = (label: string) => [...dom.window.document.querySelectorAll('button')].find(el => el.textContent?.trim() === label)!;
      await act(async () => { button('Status & Actions').click(); });
      assert.doesNotMatch(dom.window.document.body.textContent!, /Record Time In|Driver & Delivery Details/);
      assert.equal(dom.window.document.getElementById('rma-recipient'), null, 'recipient-only edits are not offered before completion');
      await act(async () => { button('Pending').click(); });
      assert.equal(dom.window.document.getElementById('rma-recipient'), null, 'Pending cannot accept a recipient value that would be discarded');
      assert.match(dom.window.document.body.textContent!, /Select Complete RMA to enter the recipient/);
      await act(async () => { button('Complete RMA').click(); });
      const recipient = dom.window.document.getElementById('rma-recipient') as HTMLInputElement;
      assert.ok(recipient.required);
      const save = [...dom.window.document.querySelectorAll('button')].filter(el => el.textContent?.trim() === 'Complete RMA').at(-1)!;
      assert.equal(save.disabled, true, 'completion is blocked until a recipient is entered');
      const reason = dom.window.document.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Reason for the changes"]')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(recipient, ' Collector ');
        recipient.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(reason, 'Collected and verified');
        reason.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
      assert.equal(save.disabled, false);
      await act(async () => { save.click(); });
      assert.deepEqual(patch.mock.calls.at(-1)!.arguments, [record.id, 'Delivered', 'Collected and verified', { received_by: 'Collector' }]);
      assert.equal(put.mock.callCount(), 0);
    }
    assert.equal(patch.mock.callCount(), 2);
  } finally {
    await act(async () => { root?.unmount(); });
    mock.restoreAll();
    client.clear(); dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
