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
  contact_person: 'Ana', is_active: true, version: 1, default_account_manager: null, created_at: AT, updated_at: AT, ...overrides });
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
  assert.deepEqual(Object.keys(companyFormErrors({ name: 'Acme', sap_number: ' ', address: '', contact_person: '' })), ['sap_number']);
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
  mock.method(api, 'getCompanies', async () => [company({ default_account_manager: { id: 'am-1', name: 'P. Soriano', is_active: true } })]);
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
