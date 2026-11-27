import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { evaluatePermissions } from '../../server/src/services/permissionEvaluator';
import { defaultRolePermissions, type PolicyRole } from '../../server/src/services/permissionCatalog';
import { api, ApiError, type ApiRmaLogisticsDispatchResult, type ApiUser } from '../src/api';
import { assertPermissionRequest, ClientPermissionError, rememberPermissionRecord } from '../src/api/permissionRuntime';
import { useAuthStore } from '../src/store/authStore';
import { useUIStore } from '../src/store/uiStore';
import type { DeliveryCategory, DeliveryRecord, UserRole } from '../src/types';
import { formatRmaMovementBadge, formatRmaTableItemPreview, RMA_MOVEMENT_FILTER_OPTIONS, rmaTableItemTooltip } from '../src/utils/rmaTableDisplay';
import { businessAuditChanges } from '../src/features/admin/BusinessAuditDiff';
import { EMAIL_STATUS_COPY } from '../src/features/deliveries/DispatchToLogisticsDialog';
import { installLegacySession } from './helpers/permissionSession';

// Feature 5b: RMA table columns, RMA filters, toolbar actions and V1 client rules (JSDOM + mocked API).

const record = (updates: Partial<DeliveryRecord> = {}) => ({
  id: 'rma-table-1', record_no: 'RMA-26-00042', company_id: 'company', company_name: 'BDO Unibank Inc.', category: 'RMA',
  priority: '2 - Moderate', reference: '', rma_reference: 'RTC111926-01', remarks: '', status: 'Scheduled', vehicle: '(None)', area: 'Caloocan',
  driver: 'Juan Driver', driver_id: 'driver-a', driver_assistants: [], time_in: null, time_out: null, received_by: null, account_manager: 'Leanne Pavoreal',
  delivery_date: '2026-11-19', item_type: 'Unit', is_draft: 'No', item_description: '', attachments: [], email_notification_sent: false, output_actions_log: [],
  created_by: 'Roselyn Arguelles', modified_by: 'Roselyn Arguelles', created_at: '', modified_at: '2026-11-19T01:00:00Z', rma_type: 'Return to Customer Slip',
  rma_movement: 'LOGISTICS_TRANSPORT', rma_transport_status: 'PENDING', rma_version: 0, case_number: 'CAS-31417-Y4Y6Z3', service_slip_no: 'SS#60167',
  line_items: [
    { sku: 'Lenovo ThinkPad E14', quantity: 1, unit_type: 'Unit', new_serial_number: 'NEW-7781', defective_serial_number: 'DEF-5512', status_tag: 'For Return' },
    { sku: 'Power Adaptor', quantity: 1, unit_type: 'Item', serial_number: 'PA-0001' },
  ],
  ...updates,
} as DeliveryRecord);

test('RMA table display helpers: movement badges, item preview and full tooltip', () => {
  assert.deepEqual(['LOGISTICS_TRANSPORT', 'SUPPLIER_COLLECTION', 'INTERNAL_NO_DRIVER', null].map(value => formatRmaMovementBadge(value).label),
    ['Logistics Route', 'Supplier Collection', 'Internal Printing', 'Unspecified']);
  assert.deepEqual(RMA_MOVEMENT_FILTER_OPTIONS.map(option => [option.value, option.label]), [
    ['', 'All Movement Methods'], ['LOGISTICS_TRANSPORT', 'Logistics Route (Logistics transport)'],
    ['SUPPLIER_COLLECTION', 'Supplier Collection'], ['INTERNAL_NO_DRIVER', 'Internal Printing (Internal / no driver)'],
  ]);
  assert.equal(formatRmaTableItemPreview(record()), '1Unit Lenovo ThinkPad E14 · New SN: NEW-7781 / Defective SN: DEF-5512 (+1 more)');
  assert.equal(formatRmaTableItemPreview(record({ line_items: [{ sku: 'Router', quantity: 2, serial_number: 'SN-1' }] })), 'x2 Router · SN: SN-1');
  assert.equal(formatRmaTableItemPreview(record({ line_items: [], item_description: 'Legacy description' })), 'Legacy description');
  const tooltip = rmaTableItemTooltip(record());
  assert.match(tooltip, /1Unit\nLenovo ThinkPad E14\nNew SN: NEW-7781\nDefective SN: DEF-5512\n"For Return"\n\n1Item\nPower Adaptor/);
});

async function fixture() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const indexedDB = { open: () => {
    const request: any = { result: { transaction: () => ({ objectStore: () => ({ index: () => ({ getAll: () => {
      const read: any = { result: [] }; queueMicrotask(() => read.onsuccess?.()); return read;
    } }) }) }) } };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), indexedDB, requestAnimationFrame: (callback: () => void) => { callback(); return 0; }, IDBKeyRange: { only: (value: unknown) => value }, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, name, { value, configurable: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const { createRoot } = await import('react-dom/client');
  const { default: RecordsView } = await import('../src/features/deliveries/DeliveryRecordsView');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const paged = mock.method(api, 'getPagedRecords', async () => ({ rows: rows, total: rows.length, page: 1, limit: 25, hasMore: false, nextCursor: null }));
  const history = mock.method(api, 'getStatusHistoryCounts', async () => ({} as any));
  mock.method(api, 'getRecordFilterOptions', async () => ({ accountManagers: ['Leanne Pavoreal'], drivers: ['Juan Driver'], areas: ['Caloocan'], creators: ['Abigail Celada', 'Roselyn Arguelles'] }));
  let rows: DeliveryRecord[] = [];
  const render = async (category: DeliveryCategory, role: UserRole, data: DeliveryRecord[]) => {
    rows = data;
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(RecordsView, {
      category, records: data, companies: [], currentUserRole: role, currentUserName: role,
      onCreateRecord: async () => { throw new Error('No record creation expected'); }, onUpdateRecord: async () => {},
      onVerifyCollection: async () => {}, outputActionConfigs: {} as any, onUpdateOutputActionConfig: () => {},
      dashboardFilterId: null, clearDashboardFilter: () => {},
    }))));
    await flush();
  };
  const doc = dom.window.document;
  const headers = () => [...doc.querySelectorAll('thead th')].map(th => th.textContent?.trim()).filter(Boolean);
  const setValue = async (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    const proto = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
    await flush();
  };
  const labelled = (text: string, scope: ParentNode = doc) => {
    const label = [...scope.querySelectorAll('label')].find(el => el.textContent?.trim() === text) as HTMLLabelElement | undefined;
    return label ? doc.getElementById(label.htmlFor) as HTMLInputElement : undefined;
  };
  return { dom, doc, render, headers, setValue, labelled, paged, history, flush, close: async () => {
    await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
    for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'getComputedStyle', 'indexedDB', 'IDBKeyRange', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name); }
  } };
}

beforeEach(() => { installLegacySession('TASS', 'rma'); });
afterEach(() => useAuthStore.getState().setAuthUser(null));

test('RMA table shows the Daily Route Slip columns; non-RMA tables keep the 6-column layout', async () => {
  const ui = await fixture();
  try {
    await ui.render('RMA', 'TASS', [record()]);
    assert.deepEqual(ui.headers(), ['Reference', 'Delivery Date', 'Company', 'Category', 'Movement Method', 'Account Manager', 'Item Description', 'Area', 'Created By', 'Status']);
    const cells = [...ui.doc.querySelectorAll('tbody tr')[0].children].map(cell => cell.textContent?.trim());
    assert.equal(cells[1]?.startsWith('RTC111926-01'), true);
    assert.match(cells[1]!, /RMA-26-00042/); assert.match(cells[1]!, /Case# CAS-31417-Y4Y6Z3 · SS#60167/);
    assert.deepEqual(cells.slice(2), ['2026-11-19', 'BDO Unibank Inc.', 'RTCReturn to Customer Slip', 'Logistics RouteJuan Driver', 'Leanne Pavoreal',
      '1Unit Lenovo ThinkPad E14 · New SN: NEW-7781 / Defective SN: DEF-5512 (+1 more)', 'Caloocan', 'Roselyn Arguelles', 'Scheduled']);
    assert.ok(ui.doc.querySelector('#rma-records-table table.min-w-\\[1180px\\]'), 'horizontally scrollable');

    await ui.render('Deliveries', 'Sales Coordinator', [record({ category: 'Deliveries', id: 'del-1' })]);
    assert.deepEqual(ui.headers(), ['Record No.', 'Company', 'Area', 'Delivery Date', 'Driver', 'Status']);
    assert.equal(ui.doc.querySelector('#rma-quick-filters'), null);
    assert.equal(ui.doc.querySelector('#toolbar-tass-daily-route-slip'), null);
  } finally { await ui.close(); }
});

test('RMA quick filters drive server queries and Status Trail counts, and Clear All resets them', async () => {
  const ui = await fixture();
  try {
    await ui.render('RMA', 'TASS', [record()]);
    const movement = ui.doc.querySelector('#rma-movement-filter') as HTMLSelectElement;
    assert.deepEqual([...movement.options].map(option => option.textContent), RMA_MOVEMENT_FILTER_OPTIONS.map(option => option.label));
    assert.equal(ui.doc.querySelectorAll('#rma-movement-filter').length, 1, 'no duplicate Movement Method control in the popover');
    await ui.setValue(movement, 'INTERNAL_NO_DRIVER');
    await ui.setValue(ui.labelled('Account Manager', ui.doc.querySelector('#rma-quick-filters')!)!, 'Leanne');
    await ui.setValue(ui.labelled('Created By', ui.doc.querySelector('#rma-quick-filters')!)!, 'Roselyn');
    const last = ui.paged.mock.calls.at(-1)!.arguments[0] as Record<string, unknown>;
    assert.deepEqual({ rma_movement: last.rma_movement, account_manager: last.account_manager, created_by: last.created_by },
      { rma_movement: 'INTERNAL_NO_DRIVER', account_manager: 'Leanne', created_by: 'Roselyn' });
    const params = ui.history.mock.calls.at(-1)!.arguments[0] as URLSearchParams;
    assert.deepEqual([params.get('rma_movement'), params.get('account_manager'), params.get('created_by')], ['INTERNAL_NO_DRIVER', 'Leanne', 'Roselyn']);
    const clear = [...ui.doc.querySelectorAll('button')].find(button => button.textContent?.includes('Clear All Filters'))!;
    await act(async () => clear.click()); await ui.flush();
    const reset = ui.paged.mock.calls.at(-1)!.arguments[0] as Record<string, unknown>;
    assert.deepEqual([reset.rma_movement, reset.account_manager, reset.created_by], [undefined, undefined, undefined]);
  } finally { await ui.close(); }
});

const genericRouteSlip = (doc: Document) => [...doc.querySelectorAll('button[aria-haspopup="dialog"]')].find(b => b.textContent?.includes('Route Slip'));
const openHandoff = async (ui: { doc: Document; flush: () => Promise<void> }, variant: 'toolbar' | 'bulk') => {
  await act(async () => (ui.doc.querySelector(`#${variant}-daily-handoff-menu`) as HTMLButtonElement).click()); await ui.flush();
};

test('RMA toolbar and bulk bar: TASS gets one Daily handoff control, exporters keep separate DRR buttons', async () => {
  const ui = await fixture();
  try {
    await ui.render('RMA', 'TASS', [record()]);
    const dispatchBtn = ui.doc.querySelector('#toolbar-dispatch-logistics')!;
    assert.ok(dispatchBtn, 'Dispatch to Logistics is the primary toolbar action');
    assert.match(dispatchBtn.className, /bg-brand-blue/, 'primary styling, not the same weight as the other buttons');
    assert.equal(ui.doc.querySelector('#toolbar-extract-slips'), null, 'slips live in the handoff menu');
    assert.equal(ui.doc.querySelector('#toolbar-tass-daily-route-slip'), null, 'DRR lives in the handoff menu');
    assert.equal(genericRouteSlip(ui.doc), undefined, 'TASS has no generic Route Slip menu on RMA');
    await openHandoff(ui, 'toolbar');
    assert.ok(ui.doc.querySelector('#toolbar-extract-slips'));
    assert.ok(ui.doc.querySelector('#toolbar-tass-daily-route-slip'));
    const checkbox = ui.doc.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    await act(async () => checkbox.click()); await ui.flush();
    for (const id of ['#bulk-dispatch-logistics', '#bulk-daily-handoff-menu', '#bulk-priority-select']) assert.ok(ui.doc.querySelector(id), id);
    assert.equal(ui.doc.querySelector('#bulk-extract-slips'), null);
    await openHandoff(ui, 'bulk');
    for (const id of ['#bulk-extract-slips', '#bulk-tass-daily-route-slip']) assert.ok(ui.doc.querySelector(id), id);

    for (const role of ['Logistics', 'Admin'] as UserRole[]) {
      installLegacySession(role === 'Logistics' ? 'LOGISTICS' : 'ADMIN', 'rma');
      await ui.render('Deliveries', role, []); // a category change starts a fresh selection
      await ui.render('RMA', role, [record({ id: `rma-${role}` })]);
      assert.ok(ui.doc.querySelector('#toolbar-extract-slips'), `${role} keeps the separate Extract Slips button`);
      assert.ok(ui.doc.querySelector('#toolbar-tass-daily-route-slip'), role);
      assert.ok(genericRouteSlip(ui.doc), `${role} keeps the generic Route Slip menu`);
      assert.equal(ui.doc.querySelector('[data-testid="toolbar-daily-handoff"]'), null, role);
      assert.equal(ui.doc.querySelector('#toolbar-dispatch-logistics'), null, role);
      const box = ui.doc.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
      await act(async () => box.click()); await ui.flush();
      assert.ok(ui.doc.querySelector('#bulk-tass-daily-route-slip'), `${role} bulk DRR`);
      assert.equal(ui.doc.querySelector('#bulk-dispatch-logistics'), null, role);
      assert.equal(ui.doc.querySelector('#bulk-priority-select'), null, `${role} never sees write-only bulk controls`);
    }
  } finally { await ui.close(); }
});

test('dispatch email status copy is truthful for MOCKED and FAILED', () => {
  assert.match(EMAIL_STATUS_COPY.MOCKED.detail, /No live mail provider is configured/);
  assert.match(EMAIL_STATUS_COPY.FAILED.detail, /could not be delivered/);
  assert.match(EMAIL_STATUS_COPY.MOCKED.detail, /Nothing was delivered by email/);
  assert.match(EMAIL_STATUS_COPY.SENT.detail, /accepted by the mail provider/);
  assert.deepEqual(Object.values(EMAIL_STATUS_COPY).map(copy => copy.label), ['SENT', 'MOCKED', 'SKIPPED', 'FAILED']);
});

function v1Account(role: PolicyRole, deny: string[] = []): ApiUser {
  const snapshot = evaluatePermissions({
    userId: `v1-${role}`, role, isActive: true, authorizationRevision: '3',
    driverProfile: role === 'DRIVER' ? { id: 'driver-1', type: 'DRIVER', isActive: true } : null,
    rolePolicy: { role, revision: '9', catalogVersion: 1, permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) },
    overrides: deny.map(permissionKey => ({ userId: `v1-${role}`, permissionKey, effect: 'DENY' as const })),
  });
  return { id: snapshot.userId, name: 'Dispatch Test', email: 'dispatch@example.test', role, permissions: [], effectiveScreens: snapshot.effectiveScreens,
    resources: snapshot.resources, permissionVersion: 'server-version', contractVersion: 1, activeMode: 'V1', snapshot };
}
const allowed = (path: string, options: RequestInit = {}) => {
  try { assertPermissionRequest(path, options); return true; } catch (error) { assert.ok(error instanceof ClientPermissionError); return false; }
};

test('V1 client rules for the Logistics dispatch endpoints, including FormData POST', () => {
  const form = new FormData(); form.append('recipient_user_id', 'log-a');
  const install = (user: ApiUser) => { useAuthStore.getState().setAuthUser(user); useUIStore.setState({ currentScreen: 'rma' }); rememberPermissionRecord({ id: 'rma-1', category: 'RMA', is_draft: 'No' }); };
  install(v1Account('TASS'));
  assert.equal(allowed('/records/rma-logistics-recipients'), true);
  assert.equal(allowed('/records/rma-logistics-dispatches?date=2026-11-19'), true);
  assert.equal(allowed('/records/rma-logistics-dispatch', { method: 'POST', body: form }), true, 'multipart has no JSON category');
  assert.equal(allowed('/records/rma-logistics-dispatch'), false, 'no GET on the dispatch action');
  assert.equal(allowed('/records/rma-logistics-recipients', { method: 'POST', body: '{}' }), false);
  for (const role of ['LOGISTICS', 'ADMIN', 'SALES_COORDINATOR', 'DRIVER'] as PolicyRole[]) {
    install(v1Account(role));
    assert.equal(allowed('/records/rma-logistics-recipients'), false, role);
    assert.equal(allowed('/records/rma-logistics-dispatch', { method: 'POST', body: form }), false, role);
    assert.equal(allowed('/records/rma-logistics-dispatches'), ['LOGISTICS', 'ADMIN'].includes(role), role);
  }
  install(v1Account('TASS', ['CATEGORY:RMA:READ']));
  assert.equal(allowed('/records/rma-logistics-recipients'), false, 'revoked TASS');
  assert.equal(allowed('/records/rma-logistics-dispatch', { method: 'POST', body: form }), false, 'revoked TASS');
  assert.equal(allowed('/records/rma-logistics-dispatches'), false, 'revoked TASS');
});

test('Admin audit diff renders the safe RmaLogisticsDispatch fields only', () => {
  const changes = businessAuditChanges('RmaLogisticsDispatch', null, {
    dispatch_date: '2026-11-19', recipient_name: 'Alpha Printer', record_count: 3, email_status: 'MOCKED', email_method: 'mock', in_app_notified: true,
    recipient_email: 'alpha@example.test', record_ids: ['rma-1'],
  });
  assert.deepEqual(changes.map(change => [change.field, change.after]), [
    ['dispatch_date', '2026-11-19'], ['recipient_name', 'Alpha Printer'], ['record_count', '3'], ['email_status', 'MOCKED'], ['email_method', 'mock'], ['in_app_notified', 'true'],
  ]);
});

// ── DispatchToLogisticsDialog: backup files on errors, unconfirmed outcomes, key rotation ──
async function dialogFixture(recent: ApiRmaLogisticsDispatchResult['dispatch'][] = []) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  dom.window.HTMLAnchorElement.prototype.click = function () {}; // downloads only; no navigation in JSDOM
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, name, { value, configurable: true });
  const urls = { created: [] as Blob[] };
  const createObjectURL = URL.createObjectURL, revokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = ((blob: Blob) => { urls.created.push(blob); return `blob:test-${urls.created.length}`; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => {};
  mock.method(api, 'getRmaLogisticsRecipients', async () => ({ recipients: [{ id: 'log-a', name: 'Alpha Printer', email: 'alpha@example.test' }] }));
  mock.method(api, 'getRmaLogisticsDispatches', async () => ({ dispatches: recent }));
  const { createRoot } = await import('react-dom/client');
  const { default: Dialog } = await import('../src/features/deliveries/DispatchToLogisticsDialog');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const pdf = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), xlsx = new Blob(['PK'], { type: 'application/zip' });
  const generateFiles = mock.fn(async () => ({ pdf, xlsx }));
  await act(async () => root.render(React.createElement(Dialog, {
    open: true, onClose: () => {}, selectedCount: 1, initialScope: 'selected', companies: [],
    loadSelected: async () => [record()], loadFiltered: async () => [record()], defaultDateFrom: '', defaultDateTo: '', generateFiles,
  })));
  await flush();
  const doc = dom.window.document;
  const buttons = () => [...doc.querySelectorAll('button')];
  const clickDispatch = async () => { await act(async () => buttons().find(b => b.textContent?.trim() === 'Dispatch')!.click()); await flush(); };
  const editNote = async (value: string) => {
    const area = doc.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value); area.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    await flush();
  };
  return { doc, buttons, clickDispatch, editNote, urls, pdf, xlsx, generateFiles, close: async () => {
    await act(async () => root.unmount()); mock.restoreAll(); dom.window.close();
    URL.createObjectURL = createObjectURL; URL.revokeObjectURL = revokeObjectURL;
    for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT']) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name); }
  } };
}
const dispatched = (overrides: Partial<ApiRmaLogisticsDispatchResult['dispatch']> = {}): ApiRmaLogisticsDispatchResult['dispatch'] => ({
  id: 'dispatch-1', dispatch_date: '2026-11-19', dispatched_by: 'Roselyn Arguelles', recipient: { id: 'log-a', name: 'Alpha Printer' },
  record_count: 1, logistics_count: 1, supplier_count: 0, internal_count: 0, route_slip_file_name: 'DRR111926.xlsx', client_slips_file_name: 'Tass_Route_111926.pdf',
  email_status: 'FAILED', email_method: null, in_app_notified: true, note: null, created_at: '2026-11-19T08:55:00Z', ...overrides,
});

test('a failed dispatch request keeps both generated files downloadable as a backup', async () => {
  const ui = await dialogFixture();
  try {
    mock.method(api, 'dispatchRmaToLogistics', async () => { throw new ApiError('In-app notification was sent; saving the final dispatch log failed.', 500); });
    await ui.clickDispatch();
    assert.match(ui.doc.querySelector('[role="alert"]')!.textContent!, /saving the final dispatch log failed/);
    const backup = ui.doc.querySelector('[data-testid="dispatch-error-backup"]')!;
    assert.ok(backup, 'backup panel renders on the error path');
    const downloads = [...backup.querySelectorAll('button')];
    assert.deepEqual(downloads.map(b => b.textContent?.trim()), ['Tass_Route_111926.pdf', 'DRR111926.xlsx']);
    for (const button of downloads) await act(async () => button.click());
    assert.deepEqual(ui.urls.created, [ui.pdf, ui.xlsx], 'each button downloads its generated blob');
  } finally { await ui.close(); }
});

test('an unconfirmed deduplicated outcome shows a warning instead of a plain FAILED result, with both downloads', async () => {
  const ui = await dialogFixture();
  try {
    mock.method(api, 'dispatchRmaToLogistics', async () => ({ deduplicated: true, outcome_unconfirmed: true,
      email_error: 'Mail attempt finished, but the final dispatch status could not be saved to the database.', dispatch: dispatched() }));
    await ui.clickDispatch();
    const outcome = ui.doc.querySelector('[data-testid="dispatch-outcome"]')!;
    assert.ok(outcome.querySelector('[data-testid="dispatch-unconfirmed-warning"]'));
    assert.match(outcome.textContent!, /UNCONFIRMED/);
    assert.doesNotMatch(outcome.textContent!, /could not be delivered/, 'not presented as a confirmed delivery failure');
    const banner = outcome.querySelector('[data-testid="dispatch-unconfirmed-warning"]')!.textContent!;
    assert.match(banner, /still in progress or its final email status has not been confirmed/);
    assert.doesNotMatch(banner, /Mail attempt finished|could not be saved/, 'the banner stays true while the original send is in flight');
    const names = [...outcome.querySelectorAll('button')].map(b => b.textContent?.trim());
    assert.ok(names.includes('Tass_Route_111926.pdf') && names.includes('DRR111926.xlsx'));
  } finally { await ui.close(); }
});

test('retrying the same intent reuses the idempotency key; editing the note rotates it and clears stale backups', async () => {
  const ui = await dialogFixture();
  try {
    const keys: string[] = [];
    mock.method(api, 'dispatchRmaToLogistics', async (form: FormData) => { keys.push(String(form.get('idempotency_key'))); throw new ApiError('Request failed (500)', 500); });
    await ui.clickDispatch();
    await ui.clickDispatch();
    assert.equal(keys.length, 2);
    assert.equal(keys[1], keys[0], 'same intent, same key');
    assert.ok(ui.doc.querySelector('[data-testid="dispatch-error-backup"]'));
    await ui.editNote('Please print the RTC slips first.');
    assert.equal(ui.doc.querySelector('[data-testid="dispatch-error-backup"]'), null, 'stale backups are cleared when the intent changes');
    await ui.clickDispatch();
    assert.equal(keys.length, 3);
    assert.notEqual(keys[2], keys[0], 'an edited note is a new intent with a new key');
  } finally { await ui.close(); }
});

test('an in-flight same-key retry shows the truthful in-progress banner and an UNCONFIRMED badge, never FAILED', async () => {
  const ui = await dialogFixture();
  try {
    mock.method(api, 'dispatchRmaToLogistics', async () => ({ deduplicated: true, outcome_unconfirmed: true,
      email_error: 'This dispatch is still in progress or its final email outcome has not yet been confirmed. Check recent dispatches or verify with the recipient before starting a new dispatch; retrying will not resend.',
      dispatch: dispatched({ outcome_unconfirmed: true }) }));
    await ui.clickDispatch();
    const outcome = ui.doc.querySelector('[data-testid="dispatch-outcome"]')!;
    const banner = outcome.querySelector('[data-testid="dispatch-unconfirmed-warning"]')!.textContent!;
    assert.match(banner, /still in progress or its final email status has not been confirmed/);
    assert.doesNotMatch(outcome.textContent!, /Mail attempt finished|could not be saved|could not be delivered/);
    const badges = [...outcome.querySelectorAll('span')].map(span => span.textContent?.trim());
    assert.ok(badges.includes('UNCONFIRMED')); assert.equal(badges.includes('FAILED'), false);
    // The dialog's own title and aria-describedby description must be just as truthful.
    const copy = dialogCopy(ui.doc);
    assert.equal(copy.title, 'Dispatch Status Unconfirmed');
    assert.match(copy.description, /In-app notification recorded for Alpha Printer .* email delivery status is still in progress or unconfirmed/);
    assert.doesNotMatch(copy.description, /\bsent to\b|Mail attempt finished|could not be saved/i);
    assert.doesNotMatch(ui.doc.querySelector('dialog')!.textContent!, /\bsent to\b/i, 'nothing in the dialog claims the slips were sent');
  } finally { await ui.close(); }
});

/** The rendered dialog's accessible name and description (aria-labelledby / aria-describedby). */
function dialogCopy(doc: Document) {
  const dialog = doc.querySelector('dialog')!;
  return {
    title: doc.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent!.trim(),
    description: doc.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent!.trim(),
  };
}

const FINAL_OUTCOMES: Array<{ status: 'SENT' | 'MOCKED' | 'SKIPPED' | 'FAILED'; method: 'smtp' | 'mock' | null; title: string; description: RegExp }> = [
  { status: 'SENT', method: 'smtp', title: 'Dispatched to Logistics', description: /accepted by the mail provider for Alpha Printer and in-app notification delivered/ },
  { status: 'MOCKED', method: 'mock', title: 'Dispatch Recorded (Email Mocked)', description: /In-app notification recorded for Alpha Printer .* mocked on the server and not delivered by email/ },
  { status: 'SKIPPED', method: null, title: 'Dispatch Recorded (Email Skipped)', description: /In-app notification recorded for Alpha Printer .* email was skipped/ },
  { status: 'FAILED', method: 'smtp', title: 'Dispatch Recorded (Email Failed)', description: /In-app notification recorded for Alpha Printer .* email delivery failed/ },
];
for (const expected of FINAL_OUTCOMES) {
  test(`the ${expected.status} outcome dialog title and aria-describedby description match the email result`, async () => {
    const ui = await dialogFixture();
    try {
      mock.method(api, 'dispatchRmaToLogistics', async () => ({ deduplicated: false,
        email_error: expected.status === 'FAILED' ? 'SMTP 554 relay denied' : null,
        dispatch: dispatched({ email_status: expected.status, email_method: expected.method }) }));
      await ui.clickDispatch();
      const copy = dialogCopy(ui.doc);
      assert.equal(copy.title, expected.title);
      assert.match(copy.description, expected.description);
      assert.match(copy.description, /1 RMA slip for 11\/19\/2026/);
      if (expected.status !== 'SENT') assert.doesNotMatch(copy.description, /\bsent to\b/i);
      assert.equal(ui.doc.querySelector('[data-testid="dispatch-unconfirmed-warning"]'), null, 'a finalized outcome is not flagged unconfirmed');
    } finally { await ui.close(); }
  });
}

test("Today's dispatches labels unconfirmed rows UNCONFIRMED and confirmed failures FAILED", async () => {
  const ui = await dialogFixture([
    dispatched({ id: 'd-unconfirmed', recipient: { id: 'log-a', name: 'Alpha Printer' }, email_status: 'FAILED', outcome_unconfirmed: true }),
    dispatched({ id: 'd-failed', recipient: { id: 'log-b', name: 'Bravo Printer' }, email_status: 'FAILED' }),
  ]);
  try {
    const items = [...ui.doc.querySelectorAll('li')];
    const alpha = items.find(li => li.textContent?.includes('Alpha Printer'))!;
    const bravo = items.find(li => li.textContent?.includes('Bravo Printer'))!;
    assert.ok(alpha && bravo, 'both recent dispatches render');
    assert.match(alpha.textContent!, /UNCONFIRMED/); assert.doesNotMatch(alpha.textContent!, /FAILED/);
    assert.match(bravo.textContent!, /FAILED/); assert.doesNotMatch(bravo.textContent!, /UNCONFIRMED/);
  } finally { await ui.close(); }
});
