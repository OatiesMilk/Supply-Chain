import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, type ApiPodAttachment } from '../src/api';
import type { DeliveryRecord, UserRole } from '../src/types';
import { installLegacySession } from './helpers/permissionSession';
import { formatManilaTimestamp } from '../src/utils/manilaTimestamp';

const baseRecord = (overrides: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  id: 'tass-vis-1',
  company_id: 'company-1',
  company_name: 'Metro Retail Corp',
  category: 'Accounting Collection',
  priority: '2 - Moderate',
  reference: 'SAP-COLL-2001',
  remarks: '',
  status: 'Delivered',
  vehicle: '(None)',
  area: 'Makati CBD',
  driver: 'Rico Makati',
  driver_id: 'drv-makati',
  driver_assistants: [],
  time_in: '2026-11-22T01:00:00Z',
  time_out: '2026-11-22T02:00:00Z',
  received_by: 'AP Officer',
  account_manager: 'M. Reyes',
  delivery_date: '2026-11-22',
  item_type: 'Small Item',
  is_draft: 'No',
  item_description: 'Billing statement collection',
  attachments: [],
  email_notification_sent: false,
  output_actions_log: [],
  created_by: 'Sales Coordinator',
  modified_by: 'Sales Coordinator',
  created_at: '2026-11-20T01:00:00Z',
  modified_at: '2026-11-22T03:00:00Z',
  amount: 42500,
  collection_verified: false,
  collection_verified_by: null,
  collection_verified_at: null,
  completion_signed_off_at: '2026-11-22T03:00:00Z',
  completion_signed_off_by: 'M. Reyes',
  completion_remarks: 'Sales verified proof.',
  completion_reviewed_photo_id: 'photo-1',
  edit_version: 'record:v1',
  allowed_statuses: [],
  ...overrides,
} as DeliveryRecord);

const photoAttachment: ApiPodAttachment = {
  id: 'photo-1',
  name: 'collection-proof.jpg',
  mime_type: 'image/jpeg',
  is_photo: true,
  size: 2048,
  uploaded_at: '2026-11-22T02:00:00Z',
  download_url: '/api/v1/records/tass-vis-1/attachments/photo-1/download',
  preview_url: '/api/v1/records/tass-vis-1/attachments/photo-1/preview',
} as ApiPodAttachment;

const SESSION_ROLE: Record<Exclude<UserRole, 'Driver'>, 'LOGISTICS' | 'SALES_COORDINATOR' | 'ADMIN' | 'TASS'> = {
  Logistics: 'LOGISTICS',
  'Sales Coordinator': 'SALES_COORDINATOR',
  Admin: 'ADMIN',
  TASS: 'TASS',
};

async function mountWorkspace(record: DeliveryRecord, role: Exclude<UserRole, 'Driver'>) {
  installLegacySession(SESSION_ROLE[role], 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => [photoAttachment]);

  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const indexedDB = {
    open: () => {
      const request: any = {
        result: {
          transaction: () => ({
            objectStore: () => ({
              index: () => ({
                getAll: () => {
                  const read: any = { result: [] };
                  queueMicrotask(() => read.onsuccess?.());
                  return read;
                },
              }),
            }),
          }),
        },
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    indexedDB,
    IDBKeyRange: { only: (value: unknown) => value },
    requestAnimationFrame: (callback: () => void) => { callback(); return 0; },
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true });
  }

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const { createRoot } = await import('react-dom/client');
  const { default: Workspace } = await import('../src/features/accounting/AccountingCollectionWorkspace');
  const { WorkspaceDraftProvider } = await import('../src/features/deliveries/WorkspaceDrafts');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const verify = mock.fn(async () => {});
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); };

  await act(async () => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(
          WorkspaceDraftProvider,
          null,
          React.createElement(Workspace, {
            record,
            allRecordIds: [record.id],
            allRecords: [record],
            currentUserRole: role,
            currentUserName: role,
            onBack: () => {},
            onVerifyCollection: verify,
            onNavigateToRecord: () => {},
            onUpdateRecord: async () => {},
          }),
        ),
      ),
    );
  });
  await flush();

  const tab = (label: string) =>
    [...dom.window.document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(el => el.textContent?.trim() === label);
  const verifyButtons = () =>
    [...dom.window.document.querySelectorAll<HTMLButtonElement>('button')]
      .filter(el => /verify collection|mark as collection verified/i.test(el.textContent ?? ''));

  return {
    dom,
    verify,
    flush,
    tab,
    verifyButtons,
    close: async () => {
      await act(async () => root.unmount());
      client.clear();
      mock.restoreAll();
      dom.window.close();
      for (const name of Object.keys(globals)) {
        if (original[name]) Object.defineProperty(globalThis, name, original[name]);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

test('Logistics sees compact Collection Verified badge on Overview and unified Sales + collection verification details on Verification tab', async () => {
  const verifiedAt = '2026-11-22T05:30:00Z';
  const record = baseRecord({
    status: 'Delivered',
    collection_verified: true,
    collection_verified_by: 'Ana Cruz',
    collection_verified_at: verifiedAt,
  });

  const ui = await mountWorkspace(record, 'Logistics');
  try {
    const overviewPanel = ui.dom.window.document.querySelector('[id$="-panel-overview"]')!;
    const overviewText = overviewPanel.textContent ?? '';
    assert.match(overviewText, /Collection Verified/);
    assert.doesNotMatch(overviewText, /TASS/);
    assert.doesNotMatch(overviewText, /Collection verification complete/, 'Full verification panels belong in Verification tab');
    assert.doesNotMatch(overviewText, /Collection Status:/, 'Collection status banner belongs in Verification tab');
    assert.doesNotMatch(overviewText, /Open Verification/, 'An already verified collection has no pending action');
    assert.equal(ui.verifyButtons().length, 0);

    await act(async () => ui.tab('Verification')!.click());
    await ui.flush();

    const verificationPanel = ui.dom.window.document.querySelector('[id$="-panel-verification"]')!;
    const verificationText = verificationPanel.textContent ?? '';
    assert.match(verificationText, /Collection Status: Complete · Collection Verified/);
    assert.match(verificationText, /Sales verification complete/);
    assert.match(verificationText, /Collection verification complete/);
    assert.match(verificationText, /Logistics has verified that this billing collection is complete\./);
    assert.match(verificationText, /Ana Cruz/);
    assert.ok(verificationText.includes(formatManilaTimestamp(verifiedAt)), 'Verification tab should display formatted Verified at timestamp');
    assert.doesNotMatch(verificationText, /Verification requires Logistics collection-verification permission/);
    assert.doesNotMatch(verificationText, /TASS/);
    assert.equal(ui.verifyButtons().length, 0);
    assert.equal(ui.verify.mock.callCount(), 0);
  } finally {
    await ui.close();
  }
});

test('Logistics sees Pending Verification badge and an Open Verification cue, then verifies unverified Delivered collections', async () => {
  const record = baseRecord({
    status: 'Delivered',
    collection_verified: false,
  });

  const ui = await mountWorkspace(record, 'Logistics');
  try {
    const overviewPanel = ui.dom.window.document.querySelector('[id$="-panel-overview"]')!;
    const overviewText = overviewPanel.textContent ?? '';
    assert.match(overviewText, /Pending Verification/);
    assert.match(overviewText, /Ready for Logistics collection verification\./);
    assert.doesNotMatch(overviewText, /TASS/);
    const openBtn = [...overviewPanel.querySelectorAll<HTMLButtonElement>('button')].find(btn => btn.textContent?.includes('Open Verification'));
    assert.ok(openBtn, 'Logistics should see Open Verification cue on Overview');
    await act(async () => openBtn.click());
    await ui.flush();
    assert.equal(ui.tab('Verification')?.getAttribute('aria-selected'), 'true');

    const verificationPanel = ui.dom.window.document.querySelector('[id$="-panel-verification"]')!;
    assert.doesNotMatch(verificationPanel.textContent ?? '', /Verification requires Logistics collection-verification permission/);
    assert.ok(ui.verifyButtons().length > 0, 'Logistics can verify the collection');
  } finally {
    await ui.close();
  }
});

test('TassVerificationPanel does not render before Sales sign-off completes (Scheduled, In Transit, Transport Complete)', async () => {
  for (const status of ['Scheduled', 'In Transit', 'Transport Complete'] as const) {
    const ui = await mountWorkspace(
      baseRecord({
        status,
        collection_verified: false,
        completion_signed_off_at: null,
        completion_signed_off_by: null,
      }),
      'Logistics',
    );
    try {
      assert.doesNotMatch(ui.dom.window.document.body.textContent ?? '', /Collection Verified|Pending Verification/);
      await act(async () => ui.tab('Verification')!.click());
      await ui.flush();
      assert.equal(Boolean(ui.dom.window.document.querySelector('#tass-verification-title')), false, `Panel must not render on ${status}`);
    } finally {
      await ui.close();
    }
  }
});

test('Sales Coordinator and Admin see read-only collection verification visibility without verify controls, and TASS never gets a verification cue', async () => {
  for (const role of ['Sales Coordinator', 'Admin'] as const) {
    const verifiedUi = await mountWorkspace(
      baseRecord({
        status: 'Delivered',
        collection_verified: true,
        collection_verified_by: 'Ana Cruz',
        collection_verified_at: '2026-11-22T05:30:00Z',
      }),
      role,
    );
    try {
      assert.match(verifiedUi.dom.window.document.body.textContent ?? '', /Collection Verified/);
      await act(async () => verifiedUi.tab('Verification')!.click());
      await verifiedUi.flush();
      const verificationPanel = verifiedUi.dom.window.document.querySelector('[id$="-panel-verification"]')!;
      assert.match(verificationPanel.textContent ?? '', /Collection verification complete/);
      assert.match(verificationPanel.textContent ?? '', /Ana Cruz/);
      assert.equal(verifiedUi.verifyButtons().length, 0);
      assert.equal(verifiedUi.verify.mock.callCount(), 0);
    } finally {
      await verifiedUi.close();
    }

    const pendingUi = await mountWorkspace(
      baseRecord({ status: 'Delivered', collection_verified: false }),
      role,
    );
    try {
      assert.match(pendingUi.dom.window.document.body.textContent ?? '', /Pending Verification/);
      await act(async () => pendingUi.tab('Verification')!.click());
      await pendingUi.flush();
      const verificationPanel = pendingUi.dom.window.document.querySelector('[id$="-panel-verification"]')!;
      assert.match(verificationPanel.textContent ?? '', /Awaiting collection verification/);
      assert.match(verificationPanel.textContent ?? '', /Waiting for Logistics to review and verify this collection\./);
      assert.match(verificationPanel.textContent ?? '', /Verification requires Logistics collection-verification permission\./);
      assert.equal(pendingUi.verifyButtons().length, 0);
    } finally {
      await pendingUi.close();
    }
  }

  const tassPendingUi = await mountWorkspace(
    baseRecord({ status: 'Delivered', collection_verified: false }),
    'TASS',
  );
  try {
    const overviewPanel = tassPendingUi.dom.window.document.querySelector('[id$="-panel-overview"]')!;
    assert.doesNotMatch(overviewPanel.textContent ?? '', /collection verification\./);
    const openBtn = [...overviewPanel.querySelectorAll<HTMLButtonElement>('button')].find(btn => btn.textContent?.includes('Open Verification'));
    assert.equal(openBtn, undefined, 'TASS no longer verifies collections');
    assert.equal(tassPendingUi.verifyButtons().length, 0);
  } finally {
    await tassPendingUi.close();
  }
});
