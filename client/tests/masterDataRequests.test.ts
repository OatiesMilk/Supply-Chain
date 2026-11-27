import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { evaluatePermissions } from '../../server/src/services/permissionEvaluator';
import { defaultRolePermissions, type PolicyRole } from '../../server/src/services/permissionCatalog';
import { api, ApiError, type ApiMasterDataAdditionRequest, type ApiUser, type MasterDataRequestListParams } from '../src/api';
import { assertPermissionRequest, ClientPermissionError } from '../src/api/permissionRuntime';
import { useAuthStore } from '../src/store/authStore';
import { useUIStore } from '../src/store/uiStore';
import { installLegacySession } from './helpers/permissionSession';
import { additionRequestScreen, notificationScreen } from '../src/utils/notificationNavigation';
import { businessAuditChanges } from '../src/features/admin/BusinessAuditDiff';
import { MASTER_DATA_REQUEST_INVALIDATIONS, MASTER_DATA_REQUESTS_QUERY_KEY } from '../src/api/queries/useMasterDataRequestsQuery';
import { emptyRequestForm, requestFormErrors, reviewForm, serverFieldErrors, submitPayload } from '../src/features/masterDataRequests/requestForm';
import { countByStatus, filterRequests } from '../src/features/masterDataRequests/requestDisplay';
import { approvalChanges } from '../src/features/admin/directory/AdditionRequestsTab';
import MasterDataAdditionRequestDialog from '../src/features/masterDataRequests/MasterDataAdditionRequestDialog';
import MyAdditionRequestsModal from '../src/features/masterDataRequests/MyAdditionRequestsModal';
import AdditionRequestsTab from '../src/features/admin/directory/AdditionRequestsTab';

afterEach(() => { mock.restoreAll(); useAuthStore.getState().setAuthUser(null); });

const AT = '2026-11-25T02:00:00.000Z';
const request = (overrides: Partial<ApiMasterDataAdditionRequest> = {}): ApiMasterDataAdditionRequest => ({
  id: 'req-1', entity_type: 'COMPANY', status: 'PENDING', name: 'Juan Dela Cruz Repair', sap_numbers: [], contact_person: 'Juan', contact_phone: '0917',
  email: '', address: 'Caloocan', city: '', account_managers: [], supplier_categories: [], notes: 'Walk-in repair', version: 1,
  requested_by: { id: 'tass', name: 'Roselyn Arguelles' }, reviewed_by: null, reviewed_at: null, rejection_reason: null, review_notes: null,
  created_company_id: null, created_supplier_id: null, created_entity_name: null, created_at: AT, updated_at: AT, ...overrides,
});
/** A server double: filters, pages and counts like GET /master-data-requests. */
const serverList = (rows: ApiMasterDataAdditionRequest[], capabilities = { can_submit_company: true, can_submit_supplier: true }) =>
  async (params: MasterDataRequestListParams = {}) => {
    const typed = rows.filter(row => !params.entity_type || params.entity_type === 'ALL' || row.entity_type === params.entity_type);
    const matching = typed.filter(row => !params.status || params.status === 'ALL' || row.status === params.status);
    const limit = params.limit ?? 50, page = params.page ?? 1;
    const counts = { pending: typed.filter(r => r.status === 'PENDING').length, approved: typed.filter(r => r.status === 'APPROVED').length,
      rejected: typed.filter(r => r.status === 'REJECTED').length };
    return { requests: matching.slice((page - 1) * limit, page * limit), counts, total: matching.length, page, limit,
      pages: Math.max(1, Math.ceil(matching.length / limit)), capabilities };
  };
const list = (rows: ApiMasterDataAdditionRequest[]) => ({ requests: rows, counts: {
  pending: rows.filter(r => r.status === 'PENDING').length, approved: rows.filter(r => r.status === 'APPROVED').length, rejected: rows.filter(r => r.status === 'REJECTED').length } });

function v1Account(role: PolicyRole, deny: string[] = []): ApiUser {
  const snapshot = evaluatePermissions({ userId: `v1-${role}`, role, isActive: true, authorizationRevision: '3',
    driverProfile: role === 'DRIVER' ? { id: 'driver-1', type: 'DRIVER', isActive: true } : null,
    rolePolicy: { role, revision: '9', catalogVersion: 1, permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) },
    overrides: deny.map(permissionKey => ({ permissionKey, effect: 'DENY' })) });
  return { id: snapshot.userId, name: 'Permission Test', email: 'permission@example.test', role, permissions: [], effectiveScreens: snapshot.effectiveScreens,
    resources: snapshot.resources, permissionVersion: 'server-version', contractVersion: 1, activeMode: 'V1', snapshot };
}
const allowed = (path: string, method = 'GET', body?: unknown) => {
  try { assertPermissionRequest(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); return true; }
  catch (error) { assert.ok(error instanceof ClientPermissionError); return false; }
};
const as = (user: ApiUser, screen = 'rma') => { useAuthStore.getState().setAuthUser(user); useUIStore.setState({ currentScreen: screen }); };

type Doc = Document;
async function mounted(element: React.ReactElement, run: (doc: Doc, helpers: { click: (label: string, within?: ParentNode) => Promise<void>; type: (input: Element | null, value: string) => Promise<void>;
  key: (input: Element | null, key: string) => Promise<void>; settle: () => Promise<void>; client: QueryClient }) => Promise<void>) {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/rma' });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const doc = dom.window.document;
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const click = async (label: string, within: ParentNode = doc) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>('button')].filter(row => row.textContent?.trim() === label || row.getAttribute('aria-label') === label).at(-1);
    assert.ok(button, `Button ${label} exists`);
    await act(async () => button.click()); await settle();
  };
  const type = async (input: Element | null, value: string) => {
    assert.ok(input);
    const prototype = input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    await act(async () => { input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  };
  const key = async (input: Element | null, name: string) => {
    assert.ok(input);
    await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); });
  };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, element)));
    await settle();
    await run(doc, { click, type, key, settle, client });
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const name of Object.keys(globals)) {
      if (saved[name]) Object.defineProperty(globalThis, name, saved[name]);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}
const labelled = (doc: Doc, text: string) => {
  const label = [...doc.querySelectorAll('label')].find(row => row.textContent?.replace('*', '').trim().startsWith(text));
  assert.ok(label, `Label ${text}`);
  return doc.getElementById(label.getAttribute('for')!);
};

// ── Pure rules ──────────────────────────────────────────────────────────────
test('request form rules mirror the server and the payload carries only fields for the entity type', () => {
  const company = { ...emptyRequestForm('COMPANY', ' Juan   Dela Cruz '), sap_numbers: ['SAP-1'], pending_sap: ' sap-2 ', account_manager_ids: ['am-1'], city: 'ignored' };
  assert.deepEqual(requestFormErrors(company), {});
  assert.deepEqual(submitPayload(company), { entity_type: 'COMPANY', name: 'Juan Dela Cruz', sap_numbers: ['SAP-1', 'sap-2'], contact_person: '', contact_phone: '',
    address: '', account_manager_ids: ['am-1'], notes: '' }, 'a typed SAP number is committed; city is never sent for a company');
  assert.deepEqual(submitPayload(emptyRequestForm('COMPANY', 'Walk In')).sap_numbers, [], 'walk-in clients send no SAP number');
  assert.deepEqual(Object.keys(requestFormErrors({ ...emptyRequestForm('COMPANY', 'A'), sap_numbers: ['X'], pending_sap: 'x' })).sort(), ['name', 'sap_numbers']);
  assert.ok(requestFormErrors({ ...emptyRequestForm('SUPPLIER', 'Acme'), email: 'bad' }).email);
  assert.ok(requestFormErrors({ ...emptyRequestForm('SUPPLIER', 'Acme'), sap_numbers: Array.from({ length: 11 }, (_, i) => `S${i}`) }).sap_numbers);
  const supplier = submitPayload({ ...emptyRequestForm('SUPPLIER', 'Acme'), email: ' PO@Acme.TEST ', city: ' Pasig ', supplier_category_ids: ['cat-1'], account_manager_ids: ['am-1'] });
  assert.deepEqual(supplier, { entity_type: 'SUPPLIER', name: 'Acme', sap_numbers: [], contact_person: '', contact_phone: '', address: '', email: 'po@acme.test', city: 'Pasig',
    supplier_category_ids: ['cat-1'], notes: '' });
  assert.deepEqual(serverFieldErrors(new ApiError('A company named "BDO" already exists in the directory.', 409, { name: 'A company named "BDO" already exists in the directory.' })),
    { fields: { name: 'A company named "BDO" already exists in the directory.' }, message: null });
  assert.deepEqual(serverFieldErrors(new ApiError('Another company already uses SAP number "S-1"', 409)).fields, { sap_numbers: 'Another company already uses SAP number "S-1"' });
  assert.deepEqual(serverFieldErrors(new Error('offline')), { fields: {}, message: 'offline' });
});

test('approval sends only fields the Admin changed, keeping one-click approval exact', () => {
  const row = request({ sap_numbers: ['S-1'], account_managers: [{ id: 'am-1', name: 'Leanne', is_active: true }] });
  assert.deepEqual(approvalChanges(row, reviewForm(row)), {}, 'untouched review form changes nothing');
  assert.deepEqual(approvalChanges(row, { ...reviewForm(row), name: 'Juan Dela Cruz Repair Shop', sap_numbers: ['S-1', 'S-2'] }),
    { name: 'Juan Dela Cruz Repair Shop', sap_numbers: ['S-1', 'S-2'] });
  assert.deepEqual(approvalChanges(row, { ...reviewForm(row), contact_person: 'Juan Cruz' }), { contact_person: 'Juan Cruz' });
});

test('queue filters by status, entity and search across requester, SAP numbers and notes', () => {
  const rows = [request(), request({ id: 'req-2', entity_type: 'SUPPLIER', name: 'Northwind', status: 'APPROVED', created_entity_name: 'Northwind', notes: '' }),
    request({ id: 'req-3', status: 'REJECTED', name: 'BDO Leasing', sap_numbers: ['SAP-77'], requested_by: { id: 'tass2', name: 'Abigail Celada' }, notes: '' })];
  assert.deepEqual(countByStatus(rows), { PENDING: 1, APPROVED: 1, REJECTED: 1, ALL: 3 });
  assert.deepEqual(filterRequests(rows, 'ALL', 'SUPPLIER').map(r => r.id), ['req-2']);
  assert.deepEqual(filterRequests(rows, 'ALL', 'ALL', 'abigail').map(r => r.id), ['req-3']);
  assert.deepEqual(filterRequests(rows, 'ALL', 'ALL', 'sap-77').map(r => r.id), ['req-3']);
  assert.deepEqual(filterRequests(rows, 'ALL', 'ALL', 'walk-in').map(r => r.id), ['req-1']);
  assert.deepEqual(filterRequests(rows, 'PENDING').map(r => r.id), ['req-1']);
});

test('mutations refresh the queue, the directories and notifications', () => {
  const keys = (kind: keyof typeof MASTER_DATA_REQUEST_INVALIDATIONS) => MASTER_DATA_REQUEST_INVALIDATIONS[kind].map(key => key.join('/'));
  assert.deepEqual(keys('submit'), ['master-data-requests', 'notifications']);
  assert.deepEqual(keys('approve'), ['master-data-requests', 'companies', 'suppliers', 'notifications']);
  assert.deepEqual(keys('reject'), ['master-data-requests', 'notifications']);
});

test('V1 permission runtime mirrors the server for every addition-request endpoint', () => {
  const company = { entity_type: 'COMPANY', name: 'Acme' }, supplier = { entity_type: 'SUPPLIER', name: 'Acme' };
  as(v1Account('TASS'));
  assert.equal(allowed('/master-data-requests'), true);
  assert.equal(allowed('/master-data-requests/req-1'), true);
  assert.equal(allowed('/master-data-requests', 'POST', company), true);
  as(v1Account('TASS'), 'suppliers');
  assert.equal(allowed('/master-data-requests', 'POST', supplier), true, 'TASS may request from Suppliers without Suppliers write');
  assert.equal(allowed('/master-data-requests/req-1/approve', 'POST', { expected_version: 1, entity_type: 'COMPANY' }), false);
  assert.equal(allowed('/master-data-requests/req-1/reject', 'POST', { expected_version: 1, rejection_reason: 'No' }), false);
  as(v1Account('TASS', ['CATEGORY:RMA:WRITE']));
  assert.equal(allowed('/master-data-requests', 'POST', company), false, 'RMA write is required');
  as(v1Account('TASS', ['RESOURCE:suppliers:READ']));
  assert.equal(allowed('/master-data-requests', 'POST', supplier), false);
  assert.equal(allowed('/master-data-requests', 'POST', company), true);

  as(v1Account('ADMIN'), 'admin');
  assert.equal(allowed('/master-data-requests?status=PENDING'), true);
  assert.equal(allowed('/master-data-requests', 'POST', company), false, 'Admin creates directly instead');
  assert.equal(allowed('/master-data-requests/req-1/approve', 'POST', { expected_version: 1, entity_type: 'COMPANY' }), true);
  assert.equal(allowed('/master-data-requests/req-1/approve', 'POST', { expected_version: 1, entity_type: 'SUPPLIER' }), true);
  assert.equal(allowed('/master-data-requests/req-1/approve', 'POST', { expected_version: 1 }), false, 'approval names its entity type');
  assert.equal(allowed('/master-data-requests/req-1/reject', 'POST', { expected_version: 1, rejection_reason: 'Duplicate' }), true);
  assert.equal(allowed('/master-data-requests/req-1', 'DELETE'), false);
  as(v1Account('ADMIN', ['RESOURCE:companies:CREATE']), 'admin');
  assert.equal(allowed('/master-data-requests/req-1/approve', 'POST', { expected_version: 1, entity_type: 'COMPANY' }), false, 'V1-denied Admin');
  assert.equal(allowed('/master-data-requests/req-1/approve', 'POST', { expected_version: 1, entity_type: 'SUPPLIER' }), true);
  as(v1Account('ADMIN', ['RESOURCE:suppliers:CREATE']), 'admin');
  assert.equal(allowed('/master-data-requests/req-1/approve', 'POST', { expected_version: 1, entity_type: 'SUPPLIER' }), false);

  for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'DRIVER'] as const) {
    as(v1Account(role), 'dashboard');
    assert.equal(allowed('/master-data-requests'), false, role);
    assert.equal(allowed('/master-data-requests', 'POST', company), false, role);
    assert.equal(allowed('/master-data-requests/req-1/approve', 'POST', { expected_version: 1, entity_type: 'COMPANY' }), false, role);
  }
});

test('addition-request notifications route to the Admin queue or TASS views, never to a record lookup', async () => {
  let lookups = 0;
  const load = async () => { lookups++; return { category: 'RMA' }; };
  const n = { record_id: 'req-1', record_type: 'MasterDataAdditionRequest' };
  assert.equal(await notificationScreen(n, [], load, { role: 'ADMIN', canAccess: () => true }), 'admin');
  assert.equal(await notificationScreen(n, [], load, { role: 'TASS', canAccess: screen => screen === 'rma' || screen === 'suppliers' }), 'rma');
  assert.equal(await notificationScreen(n, [], load, { role: 'TASS', canAccess: screen => screen === 'suppliers' }), 'suppliers');
  assert.equal(await notificationScreen(n, [], load, { role: 'LOGISTICS', canAccess: () => false }), 'dashboard');
  assert.equal(await notificationScreen(n, [], load), 'dashboard', 'three-argument callers keep working');
  assert.equal(lookups, 0, 'no GET /records/<requestId> is ever made');
  assert.equal(additionRequestScreen({ role: 'ADMIN' }), 'admin');
  // Existing routing is unchanged.
  assert.equal(await notificationScreen({ record_id: 'r', record_type: 'DeliveryRecord' }, [{ id: 'r', category: 'Sales Orders' }], load), 'sales_orders');
  assert.equal(await notificationScreen({ record_id: 'sku', record_type: 'Sku' }, [], load), 'inventory');
});

test('the UI store opens a request without selecting a record and syncs ?request= links', async () => {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('', { url: 'http://localhost/dashboard' });
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  try {
    useUIStore.setState({ selectedRecordId: 'record-1', selectedProductId: 'sku-1' });
    useUIStore.getState().handleNavigateAdditionRequest('admin', 'req 1');
    const state = useUIStore.getState();
    assert.deepEqual([state.currentScreen, state.selectedAdditionRequestId, state.selectedRecordId, state.selectedProductId], ['admin', 'req 1', null, null]);
    assert.equal(dom.window.location.pathname + dom.window.location.search, '/admin?request=req%201');
    useUIStore.getState().handleNavigate('dashboard');
    assert.equal(useUIStore.getState().selectedAdditionRequestId, null, 'ordinary navigation clears it');
    const { syncAuthenticatedRoute } = await import('../src/routes/screenRouting');
    dom.window.history.replaceState({}, '', '/rma?request=req-9');
    const calls: string[] = [];
    syncAuthenticatedRoute(new Set(['rma', 'dashboard']), (screen, item) => calls.push(`nav:${screen}:${item ?? ''}`), (screen, id) => calls.push(`req:${screen}:${id}`));
    assert.deepEqual(calls, ['req:rma:req-9']);
    useUIStore.getState().handleNavigateAdditionRequest('rma', 'req-2');
    useUIStore.getState().resetSession();
    assert.equal(useUIStore.getState().selectedAdditionRequestId, null);
  } finally {
    dom.window.close();
    if (saved.window) Object.defineProperty(globalThis, 'window', saved.window); else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('business audit diff renders addition request fields and lists', () => {
  const changes = businessAuditChanges('MasterDataAdditionRequest',
    { entity_type: 'COMPANY', status: 'PENDING', name: 'Acme', sap_numbers: [], account_managers: [], version: 1 },
    { entity_type: 'COMPANY', status: 'APPROVED', name: 'Acme', sap_numbers: ['S-1', 'S-2'], account_managers: [{ id: 'am-1', name: 'Leanne' }],
      supplier_categories: [{ id: 'c', name: 'Printers' }], created_entity_name: 'Acme', version: 2, secret: 'never shown' });
  assert.deepEqual(changes.map(c => [c.field, c.before, c.after]), [
    ['status', 'PENDING', 'APPROVED'], ['sap_numbers', 'none', 'S-1, S-2'], ['account_managers', 'none', 'Leanne'],
    ['supplier_categories', 'none', 'Printers'], ['created_entity_name', 'none', 'Acme'], ['version', '1', '2'],
  ]);
});

// ── Components ──────────────────────────────────────────────────────────────
test('company request dialog: walk-in submit, SAP chips with Enter, multi-AM picks and server 409 on the field', async () => {
  installLegacySession('TASS', 'rma');
  mock.method(api, 'getAccountManagers', async () => [{ id: 'am-1', name: 'Leanne Pavoreal', is_active: true }, { id: 'am-2', name: 'Paolo Soriano', is_active: true },
    { id: 'am-off', name: 'Retired', is_active: false }]);
  const submit = mock.method(api, 'submitMasterDataRequest', async (data: any) => request({ name: data.name }));
  let closed: unknown = 'open';
  await mounted(React.createElement(MasterDataAdditionRequestDialog, { initialName: 'Juan Dela Cruz', onClose: (value?: unknown) => { closed = value; } }), async (doc, { click, type, key, settle }) => {
    const dialog = doc.querySelector('dialog[open]')!;
    assert.match(dialog.textContent!, /Request to add company/);
    assert.equal((labelled(doc, 'Company name') as HTMLInputElement).value, 'Juan Dela Cruz', 'an unlisted typed name is prefilled');
    assert.doesNotMatch(dialog.textContent!, /Retired/, 'only active Account Managers are offered');
    const sap = labelled(doc, 'SAP number(s)');
    await type(sap, 'SAP-1'); await key(sap, 'Enter');
    await type(sap, 'sap-1'); await key(sap, 'Enter');
    assert.match(dialog.textContent!, /Each SAP number may be listed once/);
    await type(sap, 'SAP-2'); await click('Add', dialog);
    await click('Remove SAP number SAP-1', dialog);
    const boxes = [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await act(async () => { boxes[0].click(); boxes[1].click(); });
    await click('Send request', dialog); await settle();
    assert.equal(submit.mock.callCount(), 1);
    assert.deepEqual(submit.mock.calls[0].arguments[0], { entity_type: 'COMPANY', name: 'Juan Dela Cruz', sap_numbers: ['SAP-2'], contact_person: '', contact_phone: '',
      address: '', account_manager_ids: ['am-1', 'am-2'], notes: '' });
    assert.equal((closed as ApiMasterDataAdditionRequest).name, 'Juan Dela Cruz');
  });
  mock.method(api, 'submitMasterDataRequest', async () => { throw new ApiError('Another company already uses SAP number "SAP-100"', 409, { sap_numbers: 'Another company already uses SAP number "SAP-100"' }); });
  await mounted(React.createElement(MasterDataAdditionRequestDialog, { onClose() {} }), async (doc, { click, type, settle }) => {
    const dialog = doc.querySelector('dialog[open]')!;
    await click('Send request', dialog);
    assert.match(dialog.textContent!, /must be 2 to 200 characters/, 'a blank name is caught before sending');
    await type(labelled(doc, 'Company name'), 'Walk-in Client');
    const sap = labelled(doc, 'SAP number(s)');
    await type(sap, 'SAP-100');
    await click('Send request', dialog); await settle();
    assert.equal(sap!.getAttribute('aria-invalid'), 'true');
    assert.match(dialog.textContent!, /already uses SAP number "SAP-100"/);
  });
});

test('supplier request dialog sends supplier fields and categories', async () => {
  installLegacySession('TASS', 'suppliers');
  mock.method(api, 'getSupplierCategories', async () => [{ id: 'cat-1', name: 'Printers', is_active: true, version: 1 }, { id: 'cat-off', name: 'Legacy', is_active: false, version: 1 }]);
  const submit = mock.method(api, 'submitMasterDataRequest', async (data: any) => request({ entity_type: 'SUPPLIER', name: data.name }));
  await mounted(React.createElement(MasterDataAdditionRequestDialog, { allowedTypes: ['SUPPLIER'], initialEntityType: 'SUPPLIER', onClose() {} }), async (doc, { click, type, settle }) => {
    const dialog = doc.querySelector('dialog[open]')!;
    assert.equal(dialog.querySelector('[role="radiogroup"]'), null, 'no type switch when only suppliers may be requested');
    await type(labelled(doc, 'Supplier name'), 'Northwind Trading');
    await type(labelled(doc, 'Email'), 'PO@Northwind.test');
    await type(labelled(doc, 'City'), 'Pasig');
    assert.doesNotMatch(dialog.textContent!, /Legacy/);
    await act(async () => dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await click('Send request', dialog); await settle();
    assert.deepEqual(submit.mock.calls[0].arguments[0], { entity_type: 'SUPPLIER', name: 'Northwind Trading', sap_numbers: [], contact_person: '', contact_phone: '',
      address: '', email: 'po@northwind.test', city: 'Pasig', supplier_category_ids: ['cat-1'], notes: '' });
  });
});

test('My Requests shows outcomes, filters by status and highlights the notified request', async () => {
  installLegacySession('TASS', 'rma');
  const getList = mock.method(api, 'getMasterDataRequests', serverList([
    request(), request({ id: 'req-2', status: 'APPROVED', name: 'BDO Leasing', created_entity_name: 'BDO Leasing Corp', reviewed_by: { id: 'admin', name: 'System Admin' }, reviewed_at: AT }),
    request({ id: 'req-3', entity_type: 'SUPPLIER', status: 'REJECTED', name: 'Northwind', rejection_reason: 'Use Acme Parts', reviewed_by: { id: 'admin', name: 'System Admin' }, reviewed_at: AT }),
  ]));
  const detail = mock.method(api, 'getMasterDataRequest', async () => { throw new Error('the target is on the loaded page'); });
  await mounted(React.createElement(MyAdditionRequestsModal, { highlightedRequestId: 'req-3', onClose() {} }), async (doc, { click }) => {
    assert.deepEqual(getList.mock.calls[0].arguments[0], { status: 'ALL', page: 1, limit: 25 }, 'filtered and paged on the server');
    assert.equal(detail.mock.callCount(), 0, 'no lookup when the target is already loaded');
    const items = () => [...doc.querySelectorAll('[aria-label="My addition requests"] > li[data-request-id]')].map(li => li.getAttribute('data-request-id'));
    assert.deepEqual(items(), ['req-1', 'req-2', 'req-3']);
    assert.match(doc.body.textContent!, /Created: BDO Leasing Corp/);
    assert.match(doc.body.textContent!, /Reason: Use Acme Parts/);
    assert.equal(doc.querySelector('[data-request-id="req-3"]')!.getAttribute('aria-current'), 'true');
    await click('Pending 1'); assert.deepEqual(items(), ['req-1']);
    assert.equal(getList.mock.calls.at(-1)!.arguments[0].status, 'PENDING');
    await click('Rejected 1'); assert.deepEqual(items(), ['req-3']);
  });
});

test('My Requests fetches and pins a notified request that is not on the loaded page', async () => {
  installLegacySession('TASS', 'rma');
  const rows = Array.from({ length: 30 }, (_, i) => request({ id: `req-${i}`, name: `Client ${i}` }));
  mock.method(api, 'getMasterDataRequests', serverList(rows));
  const target = request({ id: 'req-old', name: 'Old Walk-in', status: 'APPROVED', created_entity_name: 'Old Walk-in' });
  const detail = mock.method(api, 'getMasterDataRequest', async () => target);
  await mounted(React.createElement(MyAdditionRequestsModal, { highlightedRequestId: 'req-old', onClose() {} }), async (doc, { settle }) => {
    await settle();
    assert.equal(detail.mock.callCount(), 1);
    assert.deepEqual(detail.mock.calls[0].arguments, ['req-old']);
    const first = doc.querySelector('[aria-label="My addition requests"] > li[data-request-id]')!;
    assert.equal(first.getAttribute('data-request-id'), 'req-old', 'pinned first');
    assert.equal(first.getAttribute('aria-current'), 'true');
    assert.match(first.textContent!, /Opened from notification/);
    assert.match(doc.body.textContent!, /All 30/, 'tab counts are the server\'s, not the loaded rows');
    assert.ok(doc.querySelector('[aria-label="Next page"]'), 'pagination is shown');
  });
});

test('Admin queue: one-click approve, approve with edits, reject needs a reason, and caches refresh', async () => {
  installLegacySession('ADMIN', 'admin');
  const rows = [request(), request({ id: 'req-2', entity_type: 'SUPPLIER', name: 'Northwind Trading', supplier_categories: [{ id: 'cat-1', name: 'Printers', is_active: true }], notes: '' })];
  mock.method(api, 'getMasterDataRequests', async () => list(rows));
  mock.method(api, 'getAccountManagers', async () => [{ id: 'am-1', name: 'Leanne Pavoreal', is_active: true }]);
  mock.method(api, 'getSupplierCategories', async () => [{ id: 'cat-1', name: 'Printers', is_active: true, version: 1 }]);
  const approve = mock.method(api, 'approveMasterDataRequest', async (id: string) => ({ request: { ...rows.find(r => r.id === id)!, status: 'APPROVED' as const },
    created_company: id === 'req-1' ? { name: 'Juan Dela Cruz Repair' } as any : undefined, created_supplier: id === 'req-2' ? { name: 'Northwind Trading Inc.' } as any : undefined }));
  const reject = mock.method(api, 'rejectMasterDataRequest', async (id: string) => ({ request: { ...rows.find(r => r.id === id)!, status: 'REJECTED' as const } }));
  await mounted(React.createElement(AdditionRequestsTab, { highlightedRequestId: 'req-2' }), async (doc, { click, type, settle, client }) => {
    const invalidate = mock.method(client, 'invalidateQueries');
    assert.match(doc.body.textContent!, /Pending 2/);
    assert.equal(doc.querySelector('[data-request-id="req-2"]')!.getAttribute('aria-current'), 'true', 'the notified request is highlighted');
    await click('Approve and create Juan Dela Cruz Repair');
    let dialog = doc.querySelector('dialog[open]')!;
    assert.equal((labelled(doc, 'Company name') as HTMLInputElement).value, 'Juan Dela Cruz Repair', 'prefilled with the submitted details');
    await click('Confirm Approve & Create', dialog); await settle();
    assert.deepEqual(approve.mock.calls[0].arguments, ['req-1', { expected_version: 1, entity_type: 'COMPANY' }], 'one click sends no field overrides');
    assert.match(doc.body.textContent!, /Juan Dela Cruz Repair was added to the directory/);
    const keys = invalidate.mock.calls.map(call => JSON.stringify((call.arguments[0] as any).queryKey));
    for (const key of ['["master-data-requests"]', '["companies"]', '["suppliers"]', '["notifications"]']) assert.ok(keys.includes(key), key);

    await click('Approve and create Northwind Trading');
    dialog = doc.querySelector('dialog[open]')!;
    await type(labelled(doc, 'Supplier name'), 'Northwind Trading Inc.');
    await type(labelled(doc, 'Review notes'), 'Legal name');
    await click('Confirm Approve & Create', dialog); await settle();
    assert.deepEqual(approve.mock.calls[1].arguments, ['req-2', { expected_version: 1, entity_type: 'SUPPLIER', name: 'Northwind Trading Inc.', review_notes: 'Legal name' }]);

    await click('Reject Juan Dela Cruz Repair');
    dialog = doc.querySelector('dialog[open]')!;
    await click('Reject request', dialog);
    assert.match(dialog.textContent!, /3 to 1000 characters/);
    assert.equal(reject.mock.callCount(), 0, 'a blank reason is never sent');
    await type(dialog.querySelector('textarea'), 'Duplicate of BDO');
    await click('Reject request', dialog); await settle();
    assert.deepEqual(reject.mock.calls[0].arguments, ['req-1', { expected_version: 1, rejection_reason: 'Duplicate of BDO' }]);
  });
});

test('Admin queue keeps an approval dialog open with the conflict on the field', async () => {
  installLegacySession('ADMIN', 'admin');
  mock.method(api, 'getMasterDataRequests', async () => list([request()]));
  mock.method(api, 'getAccountManagers', async () => []);
  mock.method(api, 'approveMasterDataRequest', async () => { throw new ApiError('A company named "Juan Dela Cruz Repair" already exists in the directory.', 409,
    { name: 'A company named "Juan Dela Cruz Repair" already exists in the directory.' }); });
  await mounted(React.createElement(AdditionRequestsTab, {}), async (doc, { click, settle }) => {
    await click('Approve and create Juan Dela Cruz Repair');
    const dialog = doc.querySelector('dialog[open]')!;
    await click('Confirm Approve & Create', dialog); await settle();
    assert.ok(doc.querySelector('dialog[open]'), 'the dialog stays open with the edits');
    assert.equal(labelled(doc, 'Company name')!.getAttribute('aria-invalid'), 'true');
  });
});

test('RMA form: TASS opens Request to add company under Company Name without losing the form; Sales sees no trigger', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/rma' });
  const originals = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => { callback(); return 0; }, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const { default: RecordCreateForm } = await import('../src/features/deliveries/RecordCreateForm');
  mock.method(api, 'getAccountManagers', async () => [{ id: 'am-1', name: 'Leanne Pavoreal', is_active: true }]);
  // LEGACY shows the trigger only once the server confirms the capability.
  mock.method(api, 'getMasterDataRequests', serverList([]));
  const submit = mock.method(api, 'submitMasterDataRequest', async (data: any) => request({ name: data.name }));
  const doc = dom.window.document;
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const render = async (role: 'TASS' | 'SALES_COORDINATOR') => {
    installLegacySession(role, 'rma');
    const root = createRoot(doc.getElementById('root')!);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let cancelled = 0, submitted = 0;
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(RecordCreateForm, {
      category: 'RMA', categoryLocked: true, companies: [], onSubmit: async data => { submitted++; return { ...data, id: 'r' } as any; }, onCancel: () => { cancelled++; },
    }))));
    await settle();
    return { root, client, counts: () => ({ cancelled, submitted }) };
  };
  try {
    const tass = await render('TASS');
    const category = doc.querySelector<HTMLSelectElement>('#create-rma-type')!;
    const chosen = category.options[1].value;
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')!.set!.call(category, chosen);
    await act(async () => { category.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    const trigger = doc.querySelector<HTMLButtonElement>('#request-company-addition')!;
    assert.ok(trigger, 'TASS sees the trigger under Company Name');
    assert.equal(trigger.type, 'button', 'it never submits the RMA form');
    await act(async () => trigger.click()); await settle();
    const dialog = doc.querySelector('dialog[open]')!;
    assert.match(dialog.textContent!, /Request to add company/);
    assert.equal(dialog.querySelector('[role="radiogroup"]'), null, 'company only from the RMA form');
    const name = dialog.querySelector<HTMLInputElement>('input')!;
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(name, 'Walk-in Repair Client');
    await act(async () => { name.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    const send = [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Send request')!;
    await act(async () => send.click()); await settle();
    assert.equal(submit.mock.callCount(), 1);
    assert.equal(submit.mock.calls[0].arguments[0].entity_type, 'COMPANY');
    assert.deepEqual(tass.counts(), { cancelled: 0, submitted: 0 }, 'the RMA form is neither submitted nor closed');
    assert.equal(doc.querySelector<HTMLSelectElement>('#create-rma-type')!.value, chosen, 'in-progress RMA values are kept');
    assert.match(doc.body.textContent!, /Request sent for "Walk-in Repair Client"/);
    await act(async () => tass.root.unmount()); tass.client.clear();

    const sales = await render('SALES_COORDINATOR');
    assert.equal(doc.querySelector('#request-company-addition'), null, 'only TASS may request');
    await act(async () => sales.root.unmount()); sales.client.clear();
  } finally {
    dom.window.close();
    for (const name of Object.keys(globals)) {
      if (originals[name]) Object.defineProperty(globalThis, name, originals[name]);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

// ── QA Run 1 remediation ────────────────────────────────────────────────────
const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

test('Admin queue: tab counts are the server totals (>500), filters and pages are sent to the server, an off-page target is pinned', async () => {
  installLegacySession('ADMIN', 'admin');
  const pageRows = [request({ id: 'req-1' }), request({ id: 'req-2', name: 'Second Client' })];
  const getList = mock.method(api, 'getMasterDataRequests', async (params: MasterDataRequestListParams = {}) => ({
    requests: pageRows, counts: { pending: 501, approved: 10, rejected: 2 }, total: params.status === 'APPROVED' ? 10 : 501, page: params.page ?? 1,
    limit: params.limit ?? 25, pages: params.status === 'APPROVED' ? 1 : 21 }));
  const target = request({ id: 'req-501', name: 'Old Pending Client', created_at: '2026-01-02T00:00:00.000Z' });
  const detail = mock.method(api, 'getMasterDataRequest', async () => target);
  mock.method(api, 'getAccountManagers', async () => []);
  await mounted(React.createElement(AdditionRequestsTab, { highlightedRequestId: 'req-501' }), async (doc, { click, type, settle }) => {
    await settle();
    assert.match(doc.body.textContent!, /Pending 501/, 'the Pending tab shows the server count, not the 2 loaded rows');
    assert.match(doc.body.textContent!, /All 513/);
    const first = getList.mock.calls[0].arguments[0]!;
    assert.deepEqual({ status: first.status, entity_type: first.entity_type, page: first.page, limit: first.limit }, { status: 'PENDING', entity_type: 'ALL', page: 1, limit: 25 });
    assert.equal(detail.mock.callCount(), 1, 'the off-page notification target is looked up once');
    assert.deepEqual(detail.mock.calls[0].arguments, ['req-501']);
    const pinned = doc.querySelector('[data-request-id="req-501"]')!;
    assert.equal(pinned.getAttribute('aria-current'), 'true');
    assert.match(pinned.textContent!, /Opened from notification/);
    assert.ok([...pinned.querySelectorAll('button')].some(button => button.getAttribute('aria-label') === 'Approve and create Old Pending Client'));
    assert.equal(doc.querySelector('tbody tr')!.getAttribute('data-request-id'), 'req-501', 'pinned first');

    await click('Next page');
    assert.equal(getList.mock.calls.at(-1)!.arguments[0]!.page, 2);
    await type(doc.querySelector('input[type="search"]'), ' sap-77 ');
    await wait(300);
    const searched = getList.mock.calls.at(-1)!.arguments[0]!;
    assert.deepEqual({ search: searched.search, page: searched.page }, { search: 'sap-77', page: 1 }, 'search is trimmed, sent to the server and resets the page');
    const select = doc.querySelector('select:not([aria-label])') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value')!.set!.call(select, 'SUPPLIER');
      select.dispatchEvent(new (select.ownerDocument.defaultView as any).Event('change', { bubbles: true }));
    });
    await settle();
    assert.equal(getList.mock.calls.at(-1)!.arguments[0]!.entity_type, 'SUPPLIER');
    await click('Approved 10');
    assert.equal(getList.mock.calls.at(-1)!.arguments[0]!.status, 'APPROVED');
  });
  mock.method(api, 'getMasterDataRequest', async () => { throw new ApiError('Addition request not found', 404); });
  await mounted(React.createElement(AdditionRequestsTab, { highlightedRequestId: 'req-gone' }), async (doc, { settle }) => {
    await settle();
    assert.match(doc.body.textContent!, /could not be found or is no longer available/);
    assert.ok(doc.querySelector('[data-request-id="req-1"]'), 'the queue still renders');
  });
});

test('Admin Panel badge reads the exact pending count with a one-row summary and matches the Pending tab', async () => {
  installLegacySession('ADMIN', 'admin');
  const getList = mock.method(api, 'getMasterDataRequests', async (params: MasterDataRequestListParams = {}) => ({
    requests: [request()].slice(0, params.limit ?? 25), counts: { pending: 501, approved: 0, rejected: 0 }, total: 501, page: 1, limit: params.limit ?? 25, pages: 21 }));
  mock.method(api, 'getUsers', async () => []);
  mock.method(api, 'getDrivers', async () => []);
  const { default: AdminPanel } = await import('../src/features/admin/AdminPanel');
  await mounted(React.createElement(AdminPanel, { dashboardFilterId: null, clearDashboardFilter() {} }), async (doc, { settle }) => {
    await settle();
    assert.deepEqual(getList.mock.calls[0].arguments[0], { limit: 1 }, 'the badge never downloads the queue');
    const tab = [...doc.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === 'Addition Requests, 501 pending');
    assert.ok(tab, 'badge shows 501');
    await act(async () => tab.click()); await settle();
    assert.match(doc.body.textContent!, /Pending 501/, 'badge and tab agree');
  });
});

function legacyTass(screens: string[], resources: string[]): ApiUser {
  const user: ApiUser = { id: 'fixture-TASS', name: 'Fixture User', email: 'fixture@example.test', role: 'TASS', permissions: [],
    effectiveScreens: screens, resources, permissionVersion: 'legacy-fixture-2' };
  useAuthStore.getState().setAuthUser(user);
  useUIStore.setState({ currentScreen: screens[0] });
  return user;
}
const buttons = (doc: Doc) => [...doc.querySelectorAll('button')].map(button => button.textContent?.trim() ?? '');

test('LEGACY TASS without an RMA editor screen or without server RMA write sees My Requests but no submit button', async () => {
  const { default: TassAdditionRequestActions } = await import('../src/features/masterDataRequests/TassAdditionRequestActions');
  legacyTass(['dashboard', 'suppliers'], ['records', 'suppliers']);
  mock.method(api, 'getMasterDataRequests', serverList([], { can_submit_company: false, can_submit_supplier: false }));
  for (const variant of ['suppliers', 'rma'] as const) {
    await mounted(React.createElement(TassAdditionRequestActions, { variant }), async doc => {
      assert.ok(!buttons(doc).some(text => /^Request (Supplier|Company \/ Supplier)/.test(text)), `${variant}: no submit button`);
      assert.ok(buttons(doc).some(text => text.startsWith('My Requests')), `${variant}: My Requests stays`);
    });
  }
  // Keeps the RMA screen but the server reports RMA write was revoked (role policy / override).
  legacyTass(['rma', 'suppliers', 'dashboard'], ['records', 'suppliers', 'companies']);
  await mounted(React.createElement(TassAdditionRequestActions, { variant: 'rma' }), async doc => {
    assert.ok(!buttons(doc).some(text => text.startsWith('Request Company')), 'server capabilities hide the submit button');
    assert.ok(buttons(doc).some(text => text.startsWith('My Requests')));
  });
  // Same session, server allows: the button appears.
  mock.method(api, 'getMasterDataRequests', serverList([request()]));
  await mounted(React.createElement(TassAdditionRequestActions, { variant: 'rma' }), async doc => {
    assert.ok(buttons(doc).some(text => text.startsWith('Request Company / Supplier')));
    assert.ok(buttons(doc).some(text => /^My Requests\s*1$/.test(text)), 'pending pill comes from the shared summary');
  });
});

test('V1 TASS on Suppliers without Suppliers write still sees Request Supplier', async () => {
  const { default: TassAdditionRequestActions } = await import('../src/features/masterDataRequests/TassAdditionRequestActions');
  as(v1Account('TASS'), 'suppliers');
  const getList = mock.method(api, 'getMasterDataRequests', serverList([]));
  await mounted(React.createElement(TassAdditionRequestActions, { variant: 'suppliers' }), async doc => {
    assert.ok(buttons(doc).some(text => text === 'Request Supplier'));
    assert.deepEqual(getList.mock.calls[0].arguments[0], { limit: 1 });
  });
});

test('a request notification while a supplier detail is open returns to the registry and opens My Requests on it', async () => {
  installLegacySession('TASS', 'suppliers');
  const { default: SuppliersView } = await import('../src/features/suppliers/SuppliersView');
  mock.method(api, 'getMasterDataRequests', serverList([request({ id: 'req-sup-target', entity_type: 'SUPPLIER', name: 'Northwind' })]));
  mock.method(api, 'getSupplierCategories', async () => []);
  mock.method(api, 'getSupplierPickupCounts', async () => []);
  mock.method(api, 'getPagedRecords', async () => ({ rows: [], total: 0, page: 1, pages: 1, limit: 25 }) as any);
  const supplier = { id: 'sup-1', name: 'Acme Parts', contact_person: '', email: '', phone: '', address: '', city: '', category: '', categories: [], version: 1,
    created_by: 'Admin', created_at: AT, modified_by: 'Admin', modified_at: AT };
  const clear = mock.fn();
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/suppliers' });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const doc = dom.window.document;
  const render = (selectedAdditionRequestId: string | null) => act(async () => root.render(React.createElement(QueryClientProvider, { client },
    React.createElement(SuppliersView, { suppliers: [supplier], deliveryRecords: [], currentUserRole: 'TASS', onCreateSupplier: async () => {},
      selectedAdditionRequestId, clearSelectedAdditionRequestId: clear }))));
  try {
    await render(null); await wait(0);
    const open = [...doc.querySelectorAll('button')].find(button => button.textContent === 'Acme Parts')!;
    await act(async () => open.click()); await wait(0);
    assert.ok(!buttons(doc).includes('Request Supplier'), 'the supplier detail is shown');
    await render('req-sup-target'); await wait(0); await wait(0);
    const modal = doc.querySelector('dialog[open]');
    assert.ok(modal, 'My Requests opened');
    assert.match(modal!.textContent!, /My addition requests/);
    assert.equal(doc.querySelector('[data-request-id="req-sup-target"]')!.getAttribute('aria-current'), 'true');
    assert.equal(clear.mock.callCount(), 1);
    assert.ok(buttons(doc).includes('Request Supplier'), 'back on the registry');
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const name of Object.keys(globals)) {
      if (saved[name]) Object.defineProperty(globalThis, name, saved[name]); else Reflect.deleteProperty(globalThis, name);
    }
  }
});

// ── QA Run 2 remediation ────────────────────────────────────────────────────
const pagerText = (doc: Doc) => doc.querySelector('[aria-label="Pagination"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

test('LEGACY: an initial summary failure never shows a submit button (toolbar and RMA form)', async () => {
  const { default: TassAdditionRequestActions } = await import('../src/features/masterDataRequests/TassAdditionRequestActions');
  const summary = mock.method(api, 'getMasterDataRequests', async () => { throw new ApiError('Service unavailable', 503); });
  for (const variant of ['rma', 'suppliers'] as const) {
    legacyTass(['rma', 'suppliers', 'dashboard'], ['records', 'companies', 'suppliers']);
    await mounted(React.createElement(TassAdditionRequestActions, { variant }), async (doc, { settle }) => {
      await settle(); await settle();
      assert.ok(summary.mock.callCount() > 0, 'the summary was requested and failed');
      assert.ok(!buttons(doc).some(text => /^Request (Supplier|Company \/ Supplier)/.test(text)), `${variant}: fails closed`);
      assert.ok(buttons(doc).some(text => text.startsWith('My Requests')), `${variant}: My Requests stays`);
    });
  }
  legacyTass(['rma', 'suppliers', 'dashboard'], ['records', 'companies', 'suppliers']);
  mock.method(api, 'getAccountManagers', async () => []);
  const { default: RecordCreateForm } = await import('../src/features/deliveries/RecordCreateForm');
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/rma' });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => { callback(); return 0; }, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const before = summary.mock.callCount();
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(RecordCreateForm, {
      category: 'RMA', categoryLocked: true, companies: [], onSubmit: async data => ({ ...data, id: 'r' } as any), onCancel: () => {},
    }))));
    await wait(0); await wait(0);
    assert.ok(summary.mock.callCount() > before, 'the form requested the summary');
    assert.ok(client.getQueryCache().findAll({ queryKey: ['master-data-requests'] }).some(entry => entry.state.status === 'error'), 'the summary settled in error');
    assert.equal(dom.window.document.querySelector('#request-company-addition'), null, 'no Request to add company on a failed summary');
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const name of Object.keys(globals)) {
      if (saved[name]) Object.defineProperty(globalThis, name, saved[name]); else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('LEGACY: a failed summary refetch hides submit controls despite stale affirmative data, until capabilities return', async () => {
  const { default: TassAdditionRequestActions } = await import('../src/features/masterDataRequests/TassAdditionRequestActions');
  const { default: RecordCreateForm } = await import('../src/features/deliveries/RecordCreateForm');
  legacyTass(['rma', 'suppliers', 'dashboard'], ['records', 'companies', 'suppliers']);
  mock.method(api, 'getAccountManagers', async () => []);
  let respond: () => Promise<unknown> = serverList([]);
  mock.method(api, 'getMasterDataRequests', async () => respond());
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/rma' });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => { callback(); return 0; }, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const doc = dom.window.document;
  const summaryEntry = () => client.getQueryCache().findAll({ queryKey: MASTER_DATA_REQUESTS_QUERY_KEY })[0];
  const state = () => ({
    rmaSubmit: buttons(doc).includes('Request Company / Supplier'),
    supplierSubmit: buttons(doc).includes('Request Supplier'),
    formTrigger: !!doc.querySelector('#request-company-addition'),
    myRequests: buttons(doc).filter(text => text.startsWith('My Requests')).length === 2,
  });
  const refetch = async (next: () => Promise<unknown>) => {
    respond = next;
    await act(async () => { await client.invalidateQueries({ queryKey: MASTER_DATA_REQUESTS_QUERY_KEY }); });
    await wait(0); await wait(0);
  };
  try {
    // All three consumers share one QueryClient, so they read the same summary cache entry.
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(React.Fragment, null,
      React.createElement(TassAdditionRequestActions, { variant: 'rma' }),
      React.createElement(TassAdditionRequestActions, { variant: 'suppliers' }),
      React.createElement(RecordCreateForm, { category: 'RMA', categoryLocked: true, companies: [], onSubmit: async data => ({ ...data, id: 'r' } as any), onCancel: () => {} })))));
    await wait(0); await wait(0);
    assert.equal(client.getQueryCache().findAll({ queryKey: MASTER_DATA_REQUESTS_QUERY_KEY }).length, 1, 'one shared summary entry');
    assert.deepEqual(state(), { rmaSubmit: true, supplierSubmit: true, formTrigger: true, myRequests: true }, 'A: affirmative success shows submit controls');

    await refetch(async () => { throw new ApiError('Service unavailable', 503); });
    assert.equal(summaryEntry().state.status, 'error', 'B: the refetch failed');
    assert.equal((summaryEntry().state.data as any)?.capabilities?.can_submit_company, true, 'B: TanStack Query keeps the stale affirmative data');
    assert.deepEqual(state(), { rmaSubmit: false, supplierSubmit: false, formTrigger: false, myRequests: true }, 'B: a failed refetch hides every submit control');

    await refetch(async () => ({ requests: [], counts: { pending: 0, approved: 0, rejected: 0 }, total: 0, page: 1, limit: 1, pages: 1 }));
    assert.equal(summaryEntry().state.status, 'success');
    assert.deepEqual(state(), { rmaSubmit: false, supplierSubmit: false, formTrigger: false, myRequests: true }, 'C: success without capabilities stays hidden');

    await refetch(serverList([]));
    assert.deepEqual(state(), { rmaSubmit: true, supplierSubmit: true, formTrigger: true, myRequests: true }, 'C: affirmative capabilities restore submit controls');
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const name of Object.keys(globals)) {
      if (saved[name]) Object.defineProperty(globalThis, name, saved[name]); else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('Admin queue: approving the only request on page 2 returns to page 1 instead of an empty table', async () => {
  installLegacySession('ADMIN', 'admin');
  const store = Array.from({ length: 26 }, (_, i) => request({ id: `req-${String(i).padStart(2, '0')}`, name: `Client ${String(i).padStart(2, '0')}` }));
  const getList = mock.method(api, 'getMasterDataRequests', serverList(store));
  mock.method(api, 'getAccountManagers', async () => []);
  mock.method(api, 'approveMasterDataRequest', async (id: string) => {
    const row = store.splice(store.findIndex(r => r.id === id), 1)[0];
    return { request: { ...row, status: 'APPROVED' as const }, created_company: { name: row.name } as any };
  });
  await mounted(React.createElement(AdditionRequestsTab, {}), async (doc, { click, settle }) => {
    await settle();
    assert.match(pagerText(doc), /1–25 of 26/);
    await click('Next page'); await settle();
    await wait(300); // past the search debounce: an unchanged search must not reset the page
    assert.ok(doc.querySelector('[data-request-id="req-25"]'), 'page 2 shows the 26th request');
    await click('Approve and create Client 25');
    await click('Confirm Approve & Create', doc.querySelector('dialog[open]')!);
    await settle(); await settle(); await settle();
    assert.equal(getList.mock.calls.at(-1)!.arguments[0]!.page, 1, 'refetched page 1 automatically');
    assert.ok(doc.querySelector('tbody [data-request-id="req-00"]'), 'the table is not empty');
    assert.match(pagerText(doc), /1–25 of 25/);
  });
});

test('My Requests: a background shrink to one page moves back to page 1', async () => {
  installLegacySession('TASS', 'rma');
  const store = Array.from({ length: 26 }, (_, i) => request({ id: `mine-${String(i).padStart(2, '0')}`, name: `Mine ${i}` }));
  const getList = mock.method(api, 'getMasterDataRequests', serverList(store));
  await mounted(React.createElement(MyAdditionRequestsModal, { onClose() {} }), async (doc, { click, settle, client }) => {
    await settle();
    await click('Next page'); await settle();
    assert.ok(doc.querySelector('[data-request-id="mine-25"]'));
    store.splice(25, 1);
    await act(async () => { await client.invalidateQueries({ queryKey: MASTER_DATA_REQUESTS_QUERY_KEY }); });
    await settle(); await settle();
    assert.equal(getList.mock.calls.at(-1)!.arguments[0]!.page, 1);
    assert.ok(doc.querySelector('[data-request-id="mine-00"]'), 'the list is not empty');
    assert.match(pagerText(doc), /1–25 of 25/);
  });
});

test('a notification target that later fails to load (404/403) is no longer pinned in either view', async () => {
  const target = request({ id: 'req-stale', name: 'Stale Target' });
  for (const [view, role, failure] of [['admin', 'ADMIN', 404], ['mine', 'TASS', 403]] as const) {
    installLegacySession(role, view === 'admin' ? 'admin' : 'rma');
    mock.method(api, 'getMasterDataRequests', serverList([request({ id: 'req-visible', name: 'Visible Client' })]));
    mock.method(api, 'getAccountManagers', async () => []);
    let fail = false;
    mock.method(api, 'getMasterDataRequest', async () => { if (fail) throw new ApiError(failure === 404 ? 'Addition request not found' : 'Forbidden', failure); return target; });
    const element = view === 'admin' ? React.createElement(AdditionRequestsTab, { highlightedRequestId: 'req-stale' })
      : React.createElement(MyAdditionRequestsModal, { highlightedRequestId: 'req-stale', onClose() {} });
    await mounted(element, async (doc, { settle, client }) => {
      await settle(); await settle();
      assert.equal(doc.querySelector('[data-request-id="req-stale"]')!.getAttribute('aria-current'), 'true', `${view}: pinned first`);
      assert.doesNotMatch(doc.body.textContent!, /could not be found or is no longer available/);
      fail = true;
      await act(async () => { await client.invalidateQueries({ queryKey: MASTER_DATA_REQUESTS_QUERY_KEY }); });
      await settle(); await settle();
      assert.match(doc.body.textContent!, /could not be found or is no longer available/, `${view}: notice shown`);
      assert.equal(doc.querySelector('[data-request-id="req-stale"]'), null, `${view}: the stale cached target is gone`);
      assert.ok(doc.querySelector('[data-request-id="req-visible"]'), `${view}: the regular rows remain`);
    });
    mock.restoreAll();
  }
});
