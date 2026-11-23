import { beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, type ApiPodAttachment } from '../src/api';
import type { DeliveryRecord, UserRole } from '../src/types';
import { setManagedDriverList } from '../src/data';
import { installLegacySession } from './helpers/permissionSession';
import { useAuthStore } from '../src/store/authStore';
import { evaluatePermissions } from '../../server/src/services/permissionEvaluator';
import { defaultRolePermissions } from '../../server/src/services/permissionCatalog';

const baseRecord = (overrides: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  id: 'ac-workspace-1',
  company_id: 'company-1',
  company_name: 'Metro Retail Corp',
  category: 'Accounting Collection',
  priority: '2 - Moderate',
  reference: 'SAP-COLL-1001',
  remarks: '',
  status: 'Scheduled',
  vehicle: '(None)',
  area: 'Makati CBD',
  driver: '',
  driver_id: null,
  driver_assistants: [],
  time_in: null,
  time_out: null,
  received_by: null,
  account_manager: 'M. Reyes',
  delivery_date: '2026-11-23',
  item_type: 'Small Item',
  is_draft: 'No',
  item_description: 'Billing statement collection',
  attachments: [],
  email_notification_sent: false,
  output_actions_log: [],
  created_by: 'Sales Coordinator',
  modified_by: 'Sales Coordinator',
  created_at: '2026-11-20T01:00:00Z',
  modified_at: '2026-11-20T01:00:00Z',
  amount: 25000,
  collection_verified: false,
  edit_version: 'record:v1',
  allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled', 'Delivered', 'Draft'],
  ...overrides,
} as DeliveryRecord);

const photoAttachment: ApiPodAttachment = {
  id: 'photo-1',
  name: 'collection-proof.jpg',
  mime_type: 'image/jpeg',
  is_photo: true,
  size: 2048,
  uploaded_at: '2026-11-22T03:00:00Z',
  download_url: '/api/v1/records/ac-workspace-1/attachments/photo-1/download',
  preview_url: '/api/v1/records/ac-workspace-1/attachments/photo-1/preview',
} as ApiPodAttachment;

function installV1Role(role: 'LOGISTICS' | 'SALES_COORDINATOR' | 'TASS' | 'ADMIN', deny: string[] = []) {
  const snapshot = evaluatePermissions({
    userId: `v1-${role.toLowerCase()}`,
    role,
    isActive: true,
    authorizationRevision: '1',
    driverProfile: null,
    rolePolicy: {
      role,
      revision: '1',
      catalogVersion: 1,
      permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect })),
    },
    overrides: deny.map(permissionKey => ({ permissionKey, effect: 'DENY' })),
  });
  useAuthStore.getState().setAuthUser({
    id: snapshot.userId,
    name: role,
    email: `${role.toLowerCase()}@example.test`,
    role,
    permissions: [],
    effectiveScreens: snapshot.effectiveScreens,
    resources: snapshot.resources,
    permissionVersion: `v1-${role}-${deny.join('-')}`,
    contractVersion: 1,
    activeMode: 'V1',
    snapshot,
  });
}

beforeEach(() => {
  setManagedDriverList([
    { id: 'drv-north', name: 'Carlos North', type: 'DRIVER', coverage_areas: ['Quezon City - Fairview'], is_active: true },
    { id: 'drv-makati', name: 'Rico Makati', type: 'DRIVER', coverage_areas: ['Makati CBD'], is_active: true },
    { id: 'drv-south', name: 'Lito South', type: 'DRIVER', coverage_areas: ['South Manila Belt'], is_active: true },
    { id: 'asst-1', name: 'Ben Helper', type: 'ASSISTANT', coverage_areas: [], is_active: true },
    { id: 'asst-2', name: 'Jude Helper', type: 'ASSISTANT', coverage_areas: [], is_active: true },
  ]);
});

async function mountWorkspace(options: {
  record: DeliveryRecord;
  role: UserRole;
  allRecords?: DeliveryRecord[];
  onUpdateRecord?: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
}) {
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
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); };

  const renderRecord = async (record: DeliveryRecord) => {
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
              allRecords: options.allRecords ?? [record],
              currentUserRole: options.role,
              currentUserName: options.role,
              onBack: () => {},
              onVerifyCollection: async () => {},
              onNavigateToRecord: () => {},
              onUpdateRecord: options.onUpdateRecord ?? (async () => {}),
            }),
          ),
        ),
      );
    });
    await flush();
  };

  await renderRecord(options.record);

  const tabs = () => [...dom.window.document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const tab = (label: string) => tabs().find(el => el.textContent?.trim() === label);
  const button = (label: string) =>
    [...dom.window.document.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent?.trim() === label);
  const setValue = async (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
    const proto = el.tagName === 'TEXTAREA'
      ? dom.window.HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT'
        ? dom.window.HTMLSelectElement.prototype
        : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
      el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  };

  return {
    dom,
    client,
    flush,
    renderRecord,
    tabs,
    tab,
    button,
    setValue,
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

test('Sales Coordinator on Delivered (Sales verification complete) sees clean Overview with no remarks input and Sales verification summary on Verification tab', async () => {
  installLegacySession('SALES_COORDINATOR', 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => [photoAttachment]);

  const record = baseRecord({
    status: 'Delivered',
    allowed_statuses: [],
    received_by: 'AP Officer',
    driver: 'Rico Makati',
    driver_assistants: ['Ben Helper'],
    time_in: '2026-11-22T01:00:00Z',
    time_out: '2026-11-22T02:00:00Z',
    completion_signed_off_at: '2026-11-22T03:30:00Z',
    completion_signed_off_by: 'M. Reyes',
    completion_remarks: 'Verified receipt and amount.',
    completion_reviewed_photo_id: photoAttachment.id,
  });

  const ui = await mountWorkspace({ record, role: 'Sales Coordinator' });
  try {
    assert.equal(ui.dom.window.document.querySelector('#accounting-change-remarks'), null);
    assert.equal(ui.dom.window.document.querySelector('textarea'), null);
    assert.equal(ui.tab('Status & Actions'), undefined);
    const overviewPanel = ui.dom.window.document.querySelector('[id$="-panel-overview"]')!;
    assert.match(overviewPanel.textContent!, /Status Progression/);
    assert.match(overviewPanel.textContent!, /Draft/);
    assert.match(overviewPanel.textContent!, /Transport Complete/);
    assert.match(overviewPanel.textContent!, /Complete/);
    assert.match(overviewPanel.textContent!, /Ben Helper/);
    assert.match(overviewPanel.textContent!, /AP Officer/);
    assert.doesNotMatch(overviewPanel.textContent!, /Sales verification complete/);

    await act(async () => ui.tab('Verification')!.click());
    await ui.flush();
    const verificationPanel = ui.dom.window.document.querySelector('[id$="-panel-verification"]')!;
    assert.match(verificationPanel.textContent!, /Sales verification complete/);
    assert.match(verificationPanel.textContent!, /Verified receipt and amount\./);
  } finally {
    await ui.close();
  }
});

test('Sales Coordinator on Transport Complete sees an Open Verification cue on Overview and TransportSignoffPanel on Verification tab', async () => {
  installLegacySession('SALES_COORDINATOR', 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => [photoAttachment]);

  const record = baseRecord({
    status: 'Transport Complete',
    allowed_statuses: [],
    received_by: 'AP Officer',
    time_in: '2026-11-22T01:00:00Z',
    time_out: '2026-11-22T02:00:00Z',
  });

  const ui = await mountWorkspace({ record, role: 'Sales Coordinator' });
  try {
    assert.equal(ui.dom.window.document.querySelector('#accounting-change-remarks'), null);
    const overviewPanel = ui.dom.window.document.querySelector('[id$="-panel-overview"]')!;
    assert.match(overviewPanel.textContent!, /Awaiting your Sales verification sign-off\./);
    assert.equal(overviewPanel.querySelector('textarea'), null);

    const openBtn = [...overviewPanel.querySelectorAll<HTMLButtonElement>('button')].find(btn => btn.textContent?.includes('Open Verification'));
    assert.ok(openBtn);
    await act(async () => openBtn.click());
    await ui.flush();

    assert.equal(ui.tab('Verification')?.getAttribute('aria-selected'), 'true');
    const verificationPanel = ui.dom.window.document.querySelector('[id$="-panel-verification"]')!;
    const textareas = [...verificationPanel.querySelectorAll('textarea')];
    assert.equal(textareas.length, 1);
    assert.equal(textareas[0].id, `signoff-remarks-${record.id}`);
    assert.match(verificationPanel.textContent!, /Verification remarks/);
  } finally {
    await ui.close();
  }
});

test('Sales Coordinator sees Return to Draft dialog trigger on Scheduled records and unified Edit + Submit controls on Draft records', async () => {
  installLegacySession('SALES_COORDINATOR', 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => []);

  const scheduledUi = await mountWorkspace({
    record: baseRecord({ status: 'Scheduled', is_draft: 'No', allowed_statuses: ['Pending', 'On-Hold', 'Rescheduled', 'Delivered', 'Draft'] }),
    role: 'Sales Coordinator',
  });
  try {
    assert.ok(scheduledUi.button('Return to Draft'));
    assert.ok(scheduledUi.button('Edit'));
    assert.equal(scheduledUi.dom.window.document.querySelector('#accounting-change-remarks'), null);
    // Only the closed ReturnToDraftDialog modal contains a textarea; Overview itself has no inline textarea.
    const inlineTextareas = [...scheduledUi.dom.window.document.querySelectorAll('textarea')]
      .filter(el => !el.closest('dialog'));
    assert.equal(inlineTextareas.length, 0);
    const dialog = scheduledUi.dom.window.document.querySelector('dialog');
    assert.equal(dialog?.open ?? false, false);
  } finally {
    await scheduledUi.close();
  }

  const draftUi = await mountWorkspace({
    record: baseRecord({ status: 'Draft', is_draft: 'Yes', allowed_statuses: ['Scheduled'] }),
    role: 'Sales Coordinator',
  });
  try {
    assert.equal(draftUi.dom.window.document.querySelector('#accounting-draft-reference'), null);
    assert.ok(draftUi.button('Edit'));
    assert.ok(draftUi.dom.window.document.querySelector('#submission-change-remarks'));
    assert.match(draftUi.dom.window.document.body.textContent!, /Remarks — reason for change \(required\)/);
    assert.ok(draftUi.button('Submit'));
  } finally {
    await draftUi.close();
  }
});

test('Logistics assigns driver and assistants from Status & Actions with coverage ranking and required remarks', async () => {
  installLegacySession('LOGISTICS', 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => []);
  const put = mock.method(api, 'updateRecord', async (_id: string, updates: any) => ({
    ...baseRecord(),
    ...updates,
    driver: 'Rico Makati',
    driver_id: 'drv-makati',
    driver_assistants: ['Ben Helper'],
    edit_version: 'record:v2',
  }));

  const record = baseRecord({ status: 'Scheduled', area: 'Makati CBD', edit_version: 'record:v1' });
  const ui = await mountWorkspace({ record, role: 'Logistics' });
  try {
    const actionsTab = ui.tab('Status & Actions');
    assert.ok(actionsTab, 'Logistics should see Status & Actions tab');
    await act(async () => actionsTab.click());
    await ui.flush();

    const driverSelect = ui.dom.window.document.querySelector<HTMLSelectElement>('#accounting-driver-select')!;
    assert.ok(driverSelect);
    assert.equal(driverSelect.disabled, false);

    // Ranked by coverage: Makati CBD (area) -> BGC (subregion) -> Fairview (other)
    const optionValues = [...driverSelect.querySelectorAll('option')].map(o => o.value).filter(Boolean);
    assert.deepEqual(optionValues, ['Rico Makati', 'Lito South', 'Carlos North']);

    await ui.setValue(driverSelect, 'Rico Makati');

    const benCheckbox = [...ui.dom.window.document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
      .find(input => input.closest('label')?.textContent?.includes('Ben Helper'))!;
    assert.ok(benCheckbox);
    await act(async () => benCheckbox.click());

    // Attempting to save without remarks shows inline error and does not call PUT
    await act(async () => ui.button('Save Changes')!.click());
    await ui.flush();
    assert.equal(put.mock.callCount(), 0);
    assert.match(ui.dom.window.document.body.textContent!, /A reason is required when making changes to dispatch or status fields\./);

    // Entering remarks saves via PUT /records/:id with driver_id, driver_assistants, remarks, expected_edit_version
    const remarksBox = ui.dom.window.document.querySelector<HTMLTextAreaElement>('#accounting-action-remarks')!;
    await ui.setValue(remarksBox, 'Assign Makati driver and helper');
    await act(async () => ui.button('Save Changes')!.click());
    await ui.flush();

    assert.equal(put.mock.callCount(), 1);
    const payload = put.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.equal(payload.driver_id, 'drv-makati');
    assert.deepEqual(payload.driver_assistants, ['Ben Helper']);
    assert.equal(payload.remarks, 'Assign Makati driver and helper');
    assert.equal(payload.expected_edit_version, 'record:v1');
  } finally {
    await ui.close();
  }
});

test('Logistics sees locked driver/assistant controls on Draft and Transport Complete, and hides status/driver assignment cards on Delivered records', async () => {
  installLegacySession('LOGISTICS', 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => []);

  const lockedCases: Array<{ label: string; overrides: Partial<DeliveryRecord>; notice: RegExp }> = [
    {
      label: 'Draft',
      overrides: { status: 'Draft', is_draft: 'Yes', allowed_statuses: [] },
      notice: /Submit this draft before changing its assignment/,
    },
    {
      label: 'Transport Complete',
      overrides: { status: 'Transport Complete', is_draft: 'No', allowed_statuses: [], driver: 'Rico Makati' },
      notice: /Transport handoff is complete\. Driver assignment and run timestamps are locked/,
    },
  ];

  for (const testCase of lockedCases) {
    const ui = await mountWorkspace({ record: baseRecord(testCase.overrides), role: 'Logistics' });
    try {
      await act(async () => ui.tab('Status & Actions')!.click());
      await ui.flush();

      const driverSelect = ui.dom.window.document.querySelector<HTMLSelectElement>('#accounting-driver-select')!;
      assert.equal(driverSelect.disabled, true, `driver select should be disabled on ${testCase.label}`);
      const checkboxes = [...ui.dom.window.document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
      assert.ok(checkboxes.length > 0);
      assert.ok(checkboxes.every(cb => cb.disabled), `assistant checkboxes should be disabled on ${testCase.label}`);
      assert.match(ui.dom.window.document.body.textContent!, testCase.notice);
    } finally {
      await ui.close();
    }
  }

  // Completed (Delivered) collections hide the Collection status card and Driver/assistant assignment controls
  const deliveredUi = await mountWorkspace({
    record: baseRecord({
      status: 'Delivered',
      is_draft: 'No',
      allowed_statuses: [],
      driver: 'Rico Makati',
      received_by: 'AP Officer',
      time_in: '2026-11-22T01:00:00Z',
      time_out: '2026-11-22T02:00:00Z',
    }),
    role: 'Logistics',
  });
  try {
    await act(async () => deliveredUi.tab('Status & Actions')!.click());
    await deliveredUi.flush();

    const actionsPanel = deliveredUi.dom.window.document.querySelector('[id$="-panel-actions"]')!;
    assert.equal(actionsPanel.querySelector('#accounting-driver-select'), null);
    assert.equal(actionsPanel.querySelectorAll('input[type="checkbox"]').length, 0);
    assert.doesNotMatch(actionsPanel.textContent!, /Collection status|Driver & collection details|Save collection changes/);
    assert.match(actionsPanel.textContent!, /This collection is completed\. Status and driver assignment are locked\./);
    assert.ok(deliveredUi.button('Edit driver completion details'));
  } finally {
    await deliveredUi.close();
  }
});

test('TASS does not see Status & Actions tab while Verification and Documents tabs remain available', async () => {
  installLegacySession('TASS', 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => [photoAttachment]);

  const ui = await mountWorkspace({
    record: baseRecord({ status: 'Delivered', allowed_statuses: [] }),
    role: 'TASS',
  });
  try {
    assert.equal(ui.tab('Status & Actions'), undefined);
    assert.ok(ui.tab('Verification'));
    assert.ok(ui.tab('Documents'));
    await act(async () => ui.tab('Documents')!.click());
    await ui.flush();
    assert.ok(ui.dom.window.document.querySelector('[aria-label="Download collection-proof.jpg"]'));
  } finally {
    await ui.close();
  }
});

test('V1 permissions gate driver assignment via ASSIGN and Status & Actions tab visibility via WRITE', async () => {
  mock.method(api, 'getRecordAttachments', async () => []);

  installV1Role('LOGISTICS', ['CATEGORY:ACCOUNTING_COLLECTION:ASSIGN']);
  const noAssignUi = await mountWorkspace({
    record: baseRecord({ status: 'Scheduled' }),
    role: 'Logistics',
  });
  try {
    const actionsTab = noAssignUi.tab('Status & Actions');
    assert.ok(actionsTab, 'Status & Actions remains visible when WRITE is allowed');
    await act(async () => actionsTab.click());
    await noAssignUi.flush();
    const driverSelect = noAssignUi.dom.window.document.querySelector<HTMLSelectElement>('#accounting-driver-select')!;
    assert.equal(driverSelect.disabled, true, 'driver select must be disabled when ASSIGN is denied');
    const checkboxes = [...noAssignUi.dom.window.document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    assert.ok(checkboxes.every(cb => cb.disabled), 'assistant checkboxes must be disabled when ASSIGN is denied');
  } finally {
    await noAssignUi.close();
  }

  installV1Role('LOGISTICS', ['CATEGORY:ACCOUNTING_COLLECTION:WRITE']);
  const noWriteUi = await mountWorkspace({
    record: baseRecord({ status: 'Scheduled' }),
    role: 'Logistics',
  });
  try {
    assert.equal(noWriteUi.tab('Status & Actions'), undefined, 'Status & Actions tab must be hidden when WRITE is denied');
  } finally {
    await noWriteUi.close();
  }
});

test('Driver completion details (Received By, Time In, Time Out) are collapsed behind Enter/Edit driver completion details and expand on click', async () => {
  installLegacySession('LOGISTICS', 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => [photoAttachment]);

  // 1. Scheduled record: collapsed by default, opens on click
  const scheduledUi = await mountWorkspace({
    record: baseRecord({ status: 'Scheduled', allowed_statuses: ['On-Hold', 'Rescheduled'] }),
    role: 'Logistics',
  });
  try {
    await act(async () => scheduledUi.tab('Status & Actions')!.click());
    await scheduledUi.flush();

    assert.equal(scheduledUi.dom.window.document.querySelector('#accounting-received-by'), null);
    assert.equal(scheduledUi.dom.window.document.querySelector('#accounting-time-in'), null);
    assert.equal(scheduledUi.dom.window.document.querySelector('#accounting-time-out'), null);

    const toggle = scheduledUi.button('Enter driver completion details');
    assert.ok(toggle, 'Should display Enter driver completion details toggle');
    await act(async () => toggle.click());
    await scheduledUi.flush();

    assert.ok(scheduledUi.dom.window.document.querySelector('#accounting-received-by'));
    assert.ok(scheduledUi.dom.window.document.querySelector('#accounting-time-in'));
    assert.ok(scheduledUi.dom.window.document.querySelector('#accounting-time-out'));

    const hideBtn = scheduledUi.button('Hide');
    assert.ok(hideBtn);
    await act(async () => hideBtn.click());
    await scheduledUi.flush();
    assert.equal(scheduledUi.dom.window.document.querySelector('#accounting-received-by'), null);
  } finally {
    await scheduledUi.close();
  }

  // 2. In Transit record: clicking Edit driver completion details expands the fallback fields
  const inTransitUi = await mountWorkspace({
    record: baseRecord({
      status: 'In Transit',
      driver: 'Rico Makati',
      time_in: '2026-11-22T01:00:00Z',
      allowed_statuses: ['Delivered', 'Pending', 'On-Hold', 'Rescheduled'],
    }),
    role: 'Logistics',
  });
  try {
    await act(async () => inTransitUi.tab('Status & Actions')!.click());
    await inTransitUi.flush();

    assert.equal(inTransitUi.dom.window.document.querySelector('#accounting-received-by'), null);
    const editBtn = inTransitUi.button('Edit driver completion details');
    assert.ok(editBtn, 'Pre-existing Time In should label toggle as Edit');

    await act(async () => editBtn.click());
    await inTransitUi.flush();

    assert.ok(inTransitUi.dom.window.document.querySelector('#accounting-received-by'), 'Clicking Edit driver completion details must expand Received By');
  } finally {
    await inTransitUi.close();
  }

  // 3. Transport Complete record: read-only summary, no edit toggle
  const handedOffUi = await mountWorkspace({
    record: baseRecord({
      status: 'Transport Complete',
      driver: 'Rico Makati',
      received_by: 'AP Officer',
      time_in: '2026-11-22T01:00:00Z',
      time_out: '2026-11-22T02:00:00Z',
      allowed_statuses: [],
    }),
    role: 'Logistics',
  });
  try {
    await act(async () => handedOffUi.tab('Status & Actions')!.click());
    await handedOffUi.flush();

    assert.equal(handedOffUi.dom.window.document.querySelector('#accounting-received-by'), null);
    assert.equal(handedOffUi.button('Enter driver completion details'), undefined);
    assert.equal(handedOffUi.button('Edit driver completion details'), undefined);
    assert.match(handedOffUi.dom.window.document.body.textContent!, /Received by: AP Officer/);
  } finally {
    await handedOffUi.close();
  }
});

test('Accounting Collection exposes aligned tabs across roles and separates Comments, Remarks History, and Audit Trail', async () => {
  const roleCases: Array<{
    sessionRole: 'SALES_COORDINATOR' | 'TASS' | 'LOGISTICS' | 'ADMIN';
    role: UserRole;
    expectedTabs: string[];
  }> = [
    {
      sessionRole: 'SALES_COORDINATOR',
      role: 'Sales Coordinator',
      expectedTabs: ['Overview', 'Verification', 'Comments', 'Remarks History', 'Audit Trail', 'Documents'],
    },
    {
      sessionRole: 'TASS',
      role: 'TASS',
      expectedTabs: ['Overview', 'Verification', 'Comments', 'Remarks History', 'Audit Trail', 'Documents'],
    },
    {
      sessionRole: 'LOGISTICS',
      role: 'Logistics',
      expectedTabs: ['Overview', 'Status & Actions', 'Verification', 'Comments', 'Remarks History', 'Audit Trail', 'Documents'],
    },
    {
      sessionRole: 'ADMIN',
      role: 'Admin',
      expectedTabs: ['Overview', 'Status & Actions', 'Verification', 'Comments', 'Remarks History', 'Audit Trail', 'Documents'],
    },
  ];

  for (const testCase of roleCases) {
    installLegacySession(testCase.sessionRole, 'accounting_collection');
    mock.method(api, 'getRecordAttachments', async () => []);
    mock.method(api, 'getRecordComments', async () => [
      { id: 'c-1', record_id: 'ac-workspace-1', author: 'M. Reyes', body: 'Please confirm check amount', created_at: '2026-11-21T01:00:00Z' },
    ]);
    mock.method(api, 'getRecordRemarks', async () => [
      { id: 'r-1', record_id: 'ac-workspace-1', author: 'M. Reyes', context: 'GENERAL_EDIT', body: 'Adjusted billing amount', created_at: '2026-11-21T02:00:00Z' },
    ]);
    mock.method(api, 'getRecordAudit', async () => [
      {
        id: 'a-1',
        record_id: 'ac-workspace-1',
        action: 'UPDATE',
        changed_by: 'M. Reyes',
        timestamp: '2026-11-21T02:00:00Z',
        previous_value: { amount: 25000 },
        new_value: { amount: 30000 },
      },
    ]);

    const ui = await mountWorkspace({ record: baseRecord(), role: testCase.role });
    try {
      assert.deepEqual(
        ui.tabs().map(t => t.textContent?.trim()),
        testCase.expectedTabs,
        `Aligned tabs mismatch for ${testCase.role}`,
      );

      if (testCase.role === 'Sales Coordinator') {
        await act(async () => ui.tab('Comments')!.click());
        await ui.flush();
        const commentsPanel = ui.dom.window.document.querySelector('[id$="-panel-comments"]')!;
        assert.match(commentsPanel.textContent!, /Please confirm check amount/);

        await act(async () => ui.tab('Remarks History')!.click());
        await ui.flush();
        const remarksPanel = ui.dom.window.document.querySelector('[id$="-panel-remarks"]')!;
        assert.match(remarksPanel.textContent!, /Adjusted billing amount/);
        assert.match(remarksPanel.textContent!, /General Edit/);

        await act(async () => ui.tab('Audit Trail')!.click());
        await ui.flush();
        const auditPanel = ui.dom.window.document.querySelector('[id$="-panel-audit"]')!;
        assert.match(auditPanel.textContent!, /Amount/);
        assert.match(auditPanel.textContent!, /25000/);
        assert.match(auditPanel.textContent!, /30000/);
        assert.equal(auditPanel.querySelector('#record-comment-body'), null, 'Audit Trail must not embed Comments composer');
      }
    } finally {
      await ui.close();
    }
  }
});

test('Sales Coordinator edits Accounting Collection metadata including Amount on Draft and Scheduled, and metadata locks after dispatch', async () => {
  for (const statusCase of [
    { status: 'Draft' as const, is_draft: 'Yes' as const, allowed_statuses: ['Scheduled'] },
    { status: 'Scheduled' as const, is_draft: 'No' as const, allowed_statuses: ['Draft'] },
  ]) {
    installLegacySession('SALES_COORDINATOR', 'accounting_collection');
    mock.method(api, 'getRecordAttachments', async () => []);
    mock.method(api, 'getAccountManagers', async () => [{ id: 'am-1', name: 'M. Reyes', is_active: true }]);
    const savedCalls: Array<{ id: string; updates: Partial<DeliveryRecord> }> = [];
    const ui = await mountWorkspace({
      record: baseRecord({
        status: statusCase.status,
        is_draft: statusCase.is_draft,
        allowed_statuses: statusCase.allowed_statuses as DeliveryRecord['allowed_statuses'],
        edit_version: 'record:v3',
        amount: 25000,
      }),
      role: 'Sales Coordinator',
      onUpdateRecord: async (id, updates) => {
        savedCalls.push({ id, updates });
      },
    });
    try {
      const editBtn = ui.button('Edit');
      assert.ok(editBtn, `Sales Coordinator should see Edit button on ${statusCase.status}`);
      await act(async () => editBtn.click());
      await ui.flush();

      const refInput = ui.dom.window.document.querySelector<HTMLInputElement>('#overview-reference')!;
      const amountInput = ui.dom.window.document.querySelector<HTMLInputElement>('#overview-amount')!;
      const dateInput = ui.dom.window.document.querySelector<HTMLInputElement>('#overview-delivery-date')!;
      const remarksInput = ui.dom.window.document.querySelector<HTMLTextAreaElement>('#overview-change-remarks')!;
      assert.ok(refInput && amountInput && dateInput && remarksInput);
      assert.equal(amountInput.value, '25000');

      await ui.setValue(refInput, 'SAP-COLL-2002');
      await ui.setValue(amountInput, '31500.50');
      await ui.setValue(dateInput, '2026-11-28');

      // Saving without remarks is rejected client-side
      await act(async () => ui.button('Save Changes')!.click());
      await ui.flush();
      assert.equal(savedCalls.length, 0);
      assert.match(ui.dom.window.document.body.textContent!, /Remarks are required to save changes\./);

      await ui.setValue(remarksInput, 'Updated billing reference and amount');
      await act(async () => ui.button('Save Changes')!.click());
      await ui.flush();

      assert.equal(savedCalls.length, 1);
      assert.equal(savedCalls[0].id, 'ac-workspace-1');
      assert.equal(savedCalls[0].updates.reference, 'SAP-COLL-2002');
      assert.equal(savedCalls[0].updates.amount, 31500.5);
      assert.equal(savedCalls[0].updates.delivery_date, '2026-11-28');
      assert.equal(savedCalls[0].updates.remarks, 'Updated billing reference and amount');
      assert.equal(savedCalls[0].updates.expected_edit_version, 'record:v3');
    } finally {
      await ui.close();
    }
  }

  // After dispatch: In Transit locks Sales metadata fields (only Priority stays editable until transport completion)
  installLegacySession('SALES_COORDINATOR', 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => []);
  const inTransitUi = await mountWorkspace({
    record: baseRecord({ status: 'In Transit', time_in: '2026-11-22T01:00:00Z', allowed_statuses: [] }),
    role: 'Sales Coordinator',
  });
  try {
    const editBtn = inTransitUi.button('Edit');
    assert.ok(editBtn);
    await act(async () => editBtn.click());
    await inTransitUi.flush();
    assert.equal(inTransitUi.dom.window.document.querySelector('#overview-reference'), null, 'Reference must lock after dispatch');
    assert.equal(inTransitUi.dom.window.document.querySelector('#overview-amount'), null, 'Amount must lock after dispatch');
    assert.equal(inTransitUi.dom.window.document.querySelector('#overview-delivery-date'), null, 'Delivery Date must lock after dispatch');
    assert.ok(inTransitUi.dom.window.document.querySelector('#overview-priority'), 'Priority remains editable while In Transit');
  } finally {
    await inTransitUi.close();
  }

  // Transport Complete and Delivered lock Overview completely for Sales Coordinator
  for (const lockedStatus of ['Transport Complete', 'Delivered'] as const) {
    installLegacySession('SALES_COORDINATOR', 'accounting_collection');
    mock.method(api, 'getRecordAttachments', async () => []);
    const lockedUi = await mountWorkspace({
      record: baseRecord({ status: lockedStatus, allowed_statuses: [] }),
      role: 'Sales Coordinator',
    });
    try {
      assert.equal(lockedUi.button('Edit'), undefined, `Sales Coordinator must not see Edit on ${lockedStatus}`);
    } finally {
      await lockedUi.close();
    }
  }
});

test('Logistics edits Area, Address, and Priority on Accounting Collection Overview and TASS remains read-only', async () => {
  installLegacySession('LOGISTICS', 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => []);
  const savedCalls: Array<Partial<DeliveryRecord>> = [];
  const logisticsUi = await mountWorkspace({
    record: baseRecord({ status: 'Scheduled', area: 'Makati CBD', address: '123 Ayala Ave', priority: '2 - Moderate', edit_version: 'record:v5' }),
    role: 'Logistics',
    onUpdateRecord: async (_id, updates) => {
      savedCalls.push(updates);
    },
  });
  try {
    const editBtn = logisticsUi.button('Edit');
    assert.ok(editBtn, 'Logistics should see Edit on Overview');
    await act(async () => editBtn.click());
    await logisticsUi.flush();

    assert.equal(logisticsUi.dom.window.document.querySelector('#overview-reference'), null, 'Logistics must not edit Reference');
    assert.equal(logisticsUi.dom.window.document.querySelector('#overview-amount'), null, 'Logistics must not edit Amount');
    const addressInput = logisticsUi.dom.window.document.querySelector<HTMLInputElement>('#overview-address')!;
    const prioritySelect = logisticsUi.dom.window.document.querySelector<HTMLSelectElement>('#overview-priority')!;
    const remarksInput = logisticsUi.dom.window.document.querySelector<HTMLTextAreaElement>('#overview-change-remarks')!;
    assert.ok(addressInput && prioritySelect && remarksInput);

    await logisticsUi.setValue(addressInput, '456 Paseo de Roxas');
    await logisticsUi.setValue(prioritySelect, '3 - High');
    await logisticsUi.setValue(remarksInput, 'Updated drop address and escalated priority');
    await act(async () => logisticsUi.button('Save Changes')!.click());
    await logisticsUi.flush();

    assert.equal(savedCalls.length, 1);
    assert.equal(savedCalls[0].address, '456 Paseo de Roxas');
    assert.equal(savedCalls[0].priority, '3 - High');
    assert.equal(savedCalls[0].area, 'Makati CBD');
    assert.equal(savedCalls[0].expected_edit_version, 'record:v5');
    assert.equal('reference' in savedCalls[0], false);
    assert.equal('amount' in savedCalls[0], false);
  } finally {
    await logisticsUi.close();
  }

  // TASS Overview stays read-only even on Draft/Scheduled
  installLegacySession('TASS', 'accounting_collection');
  mock.method(api, 'getRecordAttachments', async () => []);
  const tassUi = await mountWorkspace({
    record: baseRecord({ status: 'Scheduled' }),
    role: 'TASS',
  });
  try {
    assert.equal(tassUi.button('Edit'), undefined, 'TASS must remain read-only on Accounting Collection Overview');
  } finally {
    await tassUi.close();
  }
});
