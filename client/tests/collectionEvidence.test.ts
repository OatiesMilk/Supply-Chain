import { beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, type ApiPodAttachment } from '../src/api';
import type { DeliveryRecord } from '../src/types';
import { installLegacySession } from './helpers/permissionSession';
import { podAttachmentsKey } from '../src/api/queries/usePodAttachments';
import { useAuthStore } from '../src/store/authStore';
import { evaluatePermissions } from '../../server/src/services/permissionEvaluator';
import { defaultRolePermissions } from '../../server/src/services/permissionCatalog';

beforeEach(() => { installLegacySession('TASS', 'accounting_collection'); });

const record = {
  id: 'collection-evidence', company_id: 'company', company_name: 'Collection customer', category: 'Accounting Collection',
  priority: '2 - Moderate', reference: 'SAP-123', remarks: '', status: 'Delivered', vehicle: '', area: 'Makati',
  driver: 'Driver', driver_assistants: [], time_in: '2026-10-30T01:00:00Z', time_out: '2026-10-30T02:00:00Z',
  account_manager: 'AM', delivery_date: '2026-10-30', item_type: 'Small Item', is_draft: 'No', item_description: '',
  attachments: [], email_notification_sent: false, output_actions_log: [], created_by: 'Sales', modified_by: 'Driver',
  created_at: '2026-10-30T01:00:00Z', modified_at: '2026-10-30T02:00:00Z', amount: 100, collection_verified: false,
} as DeliveryRecord;
const attachment = (name: string): ApiPodAttachment => ({
  id: name, name, mime_type: 'application/pdf', size: 100, uploaded_at: '2026-10-30T01:00:00Z',
  download_url: `/api/records/${record.id}/attachments/${name}/download`,
  preview_url: `/api/records/${record.id}/attachments/${name}/preview`,
} as ApiPodAttachment);

function installTassV1(deny: string[] = []) {
  const snapshot = evaluatePermissions({
    userId: 'tass-evidence', role: 'TASS', isActive: true, authorizationRevision: '1', driverProfile: null,
    rolePolicy: { role: 'TASS', revision: '1', catalogVersion: 1,
      permissions: [...defaultRolePermissions('TASS')].map(([permissionKey, effect]) => ({ permissionKey, effect })) },
    overrides: deny.map(permissionKey => ({ permissionKey, effect: 'DENY' })),
  });
  useAuthStore.getState().setAuthUser({
    id: snapshot.userId, name: 'TASS', email: 'tass@example.test', role: 'TASS', permissions: [],
    effectiveScreens: snapshot.effectiveScreens, resources: snapshot.resources, permissionVersion: `evidence-${deny.join('-')}`,
    contractVersion: 1, activeMode: 'V1', snapshot,
  });
}

async function fixture(currentRecord: DeliveryRecord = record) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const indexedDB = { open: () => {
    const request: any = { result: { transaction: () => ({ objectStore: () => ({ index: () => ({ getAll: () => {
      const read: any = { result: [] }; queueMicrotask(() => read.onsuccess?.()); return read;
    } }) }) }) } };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, indexedDB, IDBKeyRange: { only: (value: unknown) => value }, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, name, { value, configurable: true });
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const { createRoot } = await import('react-dom/client');
  const { default: Workspace } = await import('../src/features/accounting/AccountingCollectionWorkspace');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const verify = mock.fn(async () => {});
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const button = (name: string) => [...dom.window.document.querySelectorAll('button')].find(el => el.textContent?.trim() === name)!;
  await act(async () => { root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Workspace, {
    record: currentRecord, allRecordIds: [currentRecord.id], currentUserRole: 'TASS', currentUserName: 'TASS', onBack: () => {},
    onVerifyCollection: verify, onNavigateToRecord: () => {}, onUpdateRecord: async () => {},
  }))); });
  await flush();
  return { dom, client, verify, flush, button, close: async () => {
    await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
    for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'indexedDB', 'IDBKeyRange', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name);
    }
  } };
}

test('TASS can review saved collection documents before verification without upload or remove controls', async () => {
  const get = mock.method(api, 'getRecordAttachments', async () => [attachment('receipt.pdf')]);
  const upload = mock.method(api, 'uploadRecordAttachment', async () => { throw new Error('Read-only evidence must not upload'); });
  const remove = mock.method(api, 'deleteRecordAttachment', async () => { throw new Error('Read-only evidence must not delete'); });
  const ui = await fixture();
  try {
    await act(async () => ui.button('Documents').click()); await ui.flush();
    assert.ok(ui.dom.window.document.querySelector('[aria-label="Preview receipt.pdf"]'));
    assert.equal(ui.dom.window.document.querySelector('a[aria-label="Download receipt.pdf"]')?.getAttribute('href'), attachment('receipt.pdf').download_url);
    assert.equal(ui.dom.window.document.querySelector('input[type=file]'), null);
    assert.equal(ui.dom.window.document.querySelector('[aria-label^="Remove "]'), null);
    await act(async () => ui.button('Verification').click()); await ui.flush();
    assert.ok(ui.dom.window.document.querySelector('[aria-label="Saved collection evidence"] [aria-label="Preview receipt.pdf"]'));
    assert.equal(ui.verify.mock.callCount(), 0, 'viewing evidence does not confirm the collection');
    assert.ok(ui.button('Verify Collection of ₱100.00'));
    assert.ok(get.mock.callCount() >= 1);
    assert.equal(upload.mock.callCount(), 0); assert.equal(remove.mock.callCount(), 0);
    await act(async () => { ui.client.setQueryData(podAttachmentsKey(record.id), [attachment('updated-receipt.pdf')]); });
    await ui.flush();
    assert.ok(ui.dom.window.document.querySelector('[aria-label="Download updated-receipt.pdf"]'), 'shared attachment cache updates the verifier view');
    assert.equal(ui.dom.window.document.querySelector('[aria-label="Download receipt.pdf"]'), null);
  } finally { await ui.close(); }
});

test('collection evidence distinguishes fetch failure from no saved documents and supports retry', async () => {
  let fail = true;
  mock.method(api, 'getRecordAttachments', async () => { if (fail) throw new Error('Unavailable'); return []; });
  const ui = await fixture();
  try {
    await act(async () => ui.button('Documents').click()); await ui.flush();
    assert.match(ui.dom.window.document.querySelector('[role=alert]')?.textContent ?? '', /Could not load collection evidence/);
    assert.doesNotMatch(ui.dom.window.document.body.textContent!, /No saved collection evidence/);
    fail = false;
    await act(async () => ui.button('Retry loading evidence').click()); await ui.flush();
    assert.match(ui.dom.window.document.body.textContent!, /No saved collection evidence is attached/);
    assert.equal(ui.verify.mock.callCount(), 0);
  } finally { await ui.close(); }
});

test('V1 collection evidence reads remain independent of verification permission and disappear when Read is revoked', async () => {
  installTassV1(['CATEGORY:ACCOUNTING_COLLECTION:VERIFY_COLLECTION']);
  mock.method(api, 'getRecordAttachments', async () => [attachment('receipt.pdf')]);
  const ui = await fixture();
  try {
    await act(async () => ui.button('Documents').click()); await ui.flush();
    assert.ok(ui.dom.window.document.querySelector('[aria-label="Download receipt.pdf"]'));
    assert.equal(ui.dom.window.document.querySelector('input[type=file]'), null);
    await act(async () => ui.button('Verification').click()); await ui.flush();
    assert.match(ui.dom.window.document.body.textContent!, /Verification requires TASS collection-verification permission/);
    assert.equal(ui.button('Verify Collection of ₱100.00'), undefined);
    await act(async () => ui.button('Documents').click()); await ui.flush();
    await act(async () => installTassV1(['CATEGORY:ACCOUNTING_COLLECTION:READ'])); await ui.flush();
    assert.equal(ui.dom.window.document.querySelector('[aria-label="Download receipt.pdf"]'), null);
    assert.match(ui.dom.window.document.body.textContent!, /Collection evidence is not available for your account/);
    assert.equal(ui.verify.mock.callCount(), 0);
  } finally { await ui.close(); }
});

test('overview distinguishes unverified collected records from verified collections', async () => {
  mock.method(api, 'getRecordAttachments', async () => [attachment('receipt.pdf')]);
  const unverifiedUi = await fixture();
  try {
    assert.match(unverifiedUi.dom.window.document.body.textContent!, /Collection confirmed\. Verification is now available\./);
  } finally {
    await unverifiedUi.close();
  }

  const verifiedUi = await fixture({
    ...record,
    collection_verified: true,
    collection_verified_by: 'Ana Cruz',
    collection_verified_at: '2026-11-03T04:55:00Z',
  });
  try {
    assert.match(verifiedUi.dom.window.document.body.textContent!, /Collection Status: Collected · Collection Verified/);
    assert.match(verifiedUi.dom.window.document.body.textContent!, /Collection verified by Ana Cruz at /);
    assert.doesNotMatch(verifiedUi.dom.window.document.body.textContent!, /Verification is now available\./);
  } finally {
    await verifiedUi.close();
  }
});
