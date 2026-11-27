import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, ApiError, type ApiAccountManager, type ApiCompany, type ApiUserAdmin } from '../src/api';
import { useAuthStore } from '../src/store/authStore';
import { installLegacySession } from './helpers/permissionSession';
import AccountManagersTab from '../src/features/admin/directory/AccountManagersTab';
import CompaniesTab from '../src/features/admin/directory/CompaniesTab';
import { accountManagerChoices } from '../src/api/queries/useAccountManagersQuery';
import { accountManagerFormErrors, changedFields, companyFormErrors, filterDirectory, statusCounts } from '../src/features/admin/directory/directoryFilters';

afterEach(() => { mock.restoreAll(); useAuthStore.getState().setAuthUser(null); });

const AT = '2026-11-10T01:00:00.000Z';
const am = (overrides: Partial<ApiAccountManager> = {}): ApiAccountManager => ({ id: 'am-1', name: 'P. Soriano', email: '', is_active: true, version: 1,
  linked_user: null, created_at: AT, updated_at: AT, ...overrides });
const company = (overrides: Partial<ApiCompany> = {}): ApiCompany => ({ id: 'co-1', name: 'Acme Corp', sap_number: 'SAP-1', address: 'Makati',
  contact_person: 'Ana', is_active: true, version: 1, default_account_manager: null, sap_numbers: ['SAP-1'], account_managers: [], created_at: AT, updated_at: AT,
  ...overrides });
const user = (overrides: Partial<ApiUserAdmin>): ApiUserAdmin => ({ id: 'u', name: 'User', email: 'user@example.test', role: 'SALES_COORDINATOR',
  is_active: true, microsoft_linked: false, created_at: AT, ...overrides });

test('directory filters search every listed field, filter by status and sort by name', () => {
  const rows = [am({ id: 'b', name: 'R. Pagkalinawan', email: 'rp@example.test' }), am({ id: 'a', name: 'c. lim', is_active: false }), am({ id: 'c', name: 'A. Santos' })];
  const fields = (row: ApiAccountManager) => [row.email];
  assert.deepEqual(filterDirectory(rows, '', 'active', fields).map(row => row.id), ['c', 'b']);
  assert.deepEqual(filterDirectory(rows, '', 'all', fields).map(row => row.id), ['c', 'a', 'b']);
  assert.deepEqual(filterDirectory(rows, '  RP@ ', 'all', fields).map(row => row.id), ['b']);
  assert.deepEqual(statusCounts(rows), { active: 2, inactive: 1, all: 3 });
});

test('form checks mirror the server rules and only changed fields are sent', () => {
  assert.deepEqual(Object.keys(accountManagerFormErrors({ name: ' x ', email: 'bad' })), ['name', 'email']);
  assert.deepEqual(accountManagerFormErrors({ name: 'P. Soriano', email: '' }), {});
  assert.deepEqual(changedFields({ name: 'A', email: 'x' }, { name: 'A', email: 'y' }), { email: 'y' });
});

test('record forms offer active Account Managers and keep a record\'s retired value', () => {
  const rows = [am(), am({ id: 'am-2', name: 'C. Lim', is_active: false })];
  assert.deepEqual(accountManagerChoices(rows), ['P. Soriano']);
  assert.deepEqual(accountManagerChoices(rows, 'C. Lim'), ['C. Lim', 'P. Soriano']);
  assert.deepEqual(accountManagerChoices(rows, 'p. soriano'), ['P. Soriano'], 'no duplicate when the value is still listed');
});

type Doc = Document;
async function mounted(element: React.ReactElement, run: (doc: Doc, helpers: {
  click: (label: string) => Promise<void>; type: (input: Element | null, value: string) => Promise<void>;
}) => Promise<void>) {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin' });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const doc = dom.window.document;
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const click = async (label: string) => {
    const button = [...doc.querySelectorAll<HTMLButtonElement>('button')].find(row => row.textContent?.trim() === label || row.getAttribute('aria-label') === label);
    assert.ok(button, `Button ${label} exists`);
    await act(async () => button.click()); await settle();
  };
  const type = async (input: Element | null, value: string) => {
    assert.ok(input);
    const prototype = input.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    await act(async () => { input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, element)));
    await settle();
    await run(doc, { click, type });
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('Account Managers tab lists active rows and creates one with a linked login', async () => {
  installLegacySession('ADMIN', 'admin');
  mock.method(api, 'getAccountManagers', async () => [am({ linked_user: { id: 'u-1', name: 'Paolo Soriano', email: 'p@example.test', is_active: true } }),
    am({ id: 'am-2', name: 'C. Lim', is_active: false })]);
  mock.method(api, 'getUsers', async () => [user({ id: 'u-1', name: 'Paolo Soriano' }), user({ id: 'u-2', name: 'Maria Reyes' }),
    user({ id: 'u-3', name: 'Driver', role: 'DRIVER' }), user({ id: 'u-4', name: 'Gone', is_active: false })]);
  const create = mock.method(api, 'createAccountManager', async (data: any) => am({ id: 'am-new', ...data }));
  await mounted(React.createElement(AccountManagersTab, { canManage: true }), async (doc, { click, type }) => {
    const table = () => doc.querySelector('[aria-label="Account managers"]')!.textContent!;
    assert.match(table(), /P\. Soriano/);
    assert.doesNotMatch(table(), /C\. Lim/, 'inactive rows are hidden by default');
    await click('Add Account Manager');
    const dialog = doc.querySelector('dialog[open]')!;
    const select = dialog.querySelector('select')!;
    assert.deepEqual([...select.options].map(option => option.textContent), ['Not linked', 'Maria Reyes (user@example.test)'],
      'only active non-Driver logins not linked elsewhere are offered');
    const confirm = () => [...dialog.querySelectorAll('button')].filter(button => button.textContent === 'Add Account Manager').at(-1)!;
    await act(async () => confirm().click());
    assert.match(dialog.textContent!, /2 to 100 characters/, 'blank names are rejected before saving');
    assert.equal(create.mock.callCount(), 0);
    await type(dialog.querySelector('input'), '  Maria   Reyes ');
    await type(select, 'u-2');
    await act(async () => confirm().click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.deepEqual(create.mock.calls[0].arguments[0], { name: 'Maria Reyes', email: '', user_id: 'u-2' });
    assert.match(doc.body.textContent!, /Saved Maria Reyes/);
  });
});

test('Companies tab hides management for read-only viewers and shows server SAP conflicts on the field', async () => {
  installLegacySession('ADMIN', 'admin');
  mock.method(api, 'getCompanies', async () => [company({ default_account_manager: { id: 'am-1', name: 'P. Soriano', is_active: true },
    account_managers: [{ id: 'am-1', name: 'P. Soriano', is_active: true }] })]);
  mock.method(api, 'getAccountManagers', async () => [am()]);
  await mounted(React.createElement(CompaniesTab, { canManage: false }), async doc => {
    assert.match(doc.body.textContent!, /Acme Corp/);
    assert.match(doc.body.textContent!, /P\. Soriano/);
    assert.equal([...doc.querySelectorAll('button')].some(button => /Add Company|Edit|Deactivate/.test(button.textContent ?? '')), false);
  });
  mock.method(api, 'createCompany', async () => { throw new ApiError('Another company already uses this SAP number', 409); });
  await mounted(React.createElement(CompaniesTab, { canManage: true }), async (doc, { click, type }) => {
    await click('Add Company');
    const dialog = doc.querySelector('dialog[open]')!;
    const [name, sap] = [...dialog.querySelectorAll('input')];
    await type(name, 'Beta Inc'); await type(sap, 'SAP-1');
    const save = [...dialog.querySelectorAll('button')].filter(button => button.textContent === 'Add Company').at(-1)!;
    await act(async () => save.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(sap.getAttribute('aria-invalid'), 'true');
    assert.match(dialog.textContent!, /already uses this SAP number/);
  });
});

test('company form checks: SAP numbers are optional, at most 50 characters each and unique ignoring case', () => {
  const base = { name: 'Acme', sap_numbers: [] as string[], address: '', contact_person: '' };
  assert.deepEqual(companyFormErrors(base), {}, 'a walk-in client needs no SAP number');
  assert.deepEqual(companyFormErrors({ ...base, sap_numbers: ['SAP-1', 'SAP-2'], pending_sap: ' ' }), {});
  assert.match(companyFormErrors({ ...base, sap_numbers: ['SAP-1'], pending_sap: ' sap-1 ' }).sap_numbers, /already in the list/);
  assert.match(companyFormErrors({ ...base, sap_numbers: ['x'.repeat(51)] }).sap_numbers, /50 characters/);
  assert.match(companyFormErrors({ ...base, sap_numbers: Array.from({ length: 51 }, (_, i) => `S-${i}`) }).sap_numbers, /at most 50/);
  assert.deepEqual(changedFields({ ids: ['a', 'b'], sap: ['1'] }, { ids: ['a', 'b'], sap: ['2'] }), { sap: ['2'] }, 'lists compare by value');
  assert.deepEqual(changedFields({ sap: ['1', '2'] }, { sap: ['2', '1'] }), { sap: ['2', '1'] }, 'order matters');
});

test('Companies tab shows every SAP number and Account Manager, None for walk-ins, and searches all of them', async () => {
  installLegacySession('ADMIN', 'admin');
  mock.method(api, 'getCompanies', async () => [
    company({ id: 'co-bdo', name: 'BDO Unibank', sap_number: 'SAP-BDO-1', sap_numbers: ['SAP-BDO-1', 'SAP-BDO-2'],
      account_managers: [{ id: 'am-1', name: 'P. Soriano', is_active: true }, { id: 'am-2', name: 'C. Lim', is_active: false }] }),
    company({ id: 'co-walk', name: 'Walk-in Client', sap_number: '', sap_numbers: [] }),
  ]);
  mock.method(api, 'getAccountManagers', async () => [am()]);
  await mounted(React.createElement(CompaniesTab, { canManage: false }), async (doc, { type }) => {
    const table = () => doc.querySelector('[aria-label="Companies"]')!.textContent!;
    assert.match(table(), /SAP-BDO-1/);
    assert.match(table(), /SAP-BDO-2/);
    assert.match(table(), /C\. Lim\(inactive\)/);
    assert.doesNotMatch(table(), /Missing/, 'a walk-in client is not flagged as an error');
    const walkIn = [...doc.querySelectorAll('tr')].find(row => /Walk-in Client/.test(row.textContent ?? ''))!;
    assert.match(walkIn.textContent!, /None/);
    const search = doc.querySelector('input[type="search"], input')!;
    await type(search, 'sap-bdo-2');
    assert.match(table(), /BDO Unibank/);
    assert.doesNotMatch(table(), /Walk-in Client/);
    await type(search, 'c. lim');
    assert.match(table(), /BDO Unibank/, 'search matches a secondary Account Manager');
  });
});

test('Companies dialog adds a walk-in client with no SAP number, and several SAP numbers and Account Managers', async () => {
  installLegacySession('ADMIN', 'admin');
  mock.method(api, 'getCompanies', async () => []);
  mock.method(api, 'getAccountManagers', async () => [am(), am({ id: 'am-3', name: 'B. Reyes' }), am({ id: 'am-2', name: 'C. Lim', is_active: false })]);
  const create = mock.method(api, 'createCompany', async (data: any) => company({ id: 'co-new', ...data }));
  await mounted(React.createElement(CompaniesTab, { canManage: true }), async (doc, { click, type }) => {
    await click('Add Company');
    let dialog = doc.querySelector('dialog[open]')!;
    await type(dialog.querySelector('input'), 'Walk-in Repair Client');
    const save = () => [...doc.querySelector('dialog[open]')!.querySelectorAll('button')].filter(button => button.textContent === 'Add Company').at(-1)!;
    await act(async () => save().click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.deepEqual(create.mock.calls[0].arguments[0], { name: 'Walk-in Repair Client', sap_numbers: [], address: '', contact_person: '', account_manager_ids: [] });

    await click('Add Company');
    dialog = doc.querySelector('dialog[open]')!;
    const labels = [...dialog.querySelectorAll('label')].map(label => label.textContent);
    assert.ok(labels.includes('P. Soriano') && labels.includes('B. Reyes'));
    assert.ok(!labels.some(label => /C\. Lim/.test(label ?? '')), 'an inactive AM is not offered for a new company');
    const [name, sap] = [...dialog.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])')];
    await type(name, 'BDO Unibank');
    await type(sap, 'SAP-BDO-1');
    await act(async () => { sap.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    assert.equal(sap.value, '', 'Enter adds the SAP number as a chip');
    await type(sap, 'sap-bdo-1');
    await click('Add');
    assert.equal(sap.getAttribute('aria-invalid'), 'true', 'a duplicate is flagged on the field');
    await type(sap, 'SAP-BDO-2');
    await click('Add');
    await type(sap, 'SAP-BDO-3');
    await click('Remove SAP number SAP-BDO-2');
    for (const box of [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]) await act(async () => box.click());
    await act(async () => save().click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.deepEqual(create.mock.calls[1].arguments[0], { name: 'BDO Unibank', sap_numbers: ['SAP-BDO-1', 'SAP-BDO-3'], address: '', contact_person: '',
      account_manager_ids: ['am-1', 'am-3'] }, 'a typed but not yet added SAP number is saved too');
  });
});

test('Companies dialog keeps or removes an existing inactive Account Manager and sends only what changed', async () => {
  installLegacySession('ADMIN', 'admin');
  const row = company({ sap_numbers: ['SAP-1', 'SAP-2'], account_managers: [{ id: 'am-2', name: 'C. Lim', is_active: false }] });
  mock.method(api, 'getCompanies', async () => [row]);
  mock.method(api, 'getAccountManagers', async () => [am(), am({ id: 'am-2', name: 'C. Lim', is_active: false })]);
  const update = mock.method(api, 'updateCompany', async (_id: string, data: any) => ({ ...row, ...data, version: 2 }));
  await mounted(React.createElement(CompaniesTab, { canManage: true }), async (doc, { click }) => {
    await click('Edit Acme Corp');
    const dialog = doc.querySelector('dialog[open]')!;
    assert.match(dialog.textContent!, /C\. Lim\(inactive — existing assignment\)/);
    const boxes = () => [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    assert.deepEqual(boxes().map(box => box.checked), [true, false], 'C. Lim (kept) is checked; P. Soriano is not');
    await act(async () => boxes()[0].click());
    await act(async () => boxes()[1].click());
    await click('Remove SAP number SAP-2');
    await click('Save changes');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const [id, payload] = update.mock.calls[0].arguments as [string, any];
    assert.equal(id, 'co-1');
    assert.deepEqual(payload, { sap_numbers: ['SAP-1'], account_manager_ids: ['am-1'], expected_version: 1 });
  });
});
