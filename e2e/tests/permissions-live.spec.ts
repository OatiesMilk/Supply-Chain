import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { defaultRolePermissions, PERMISSION_CATALOG } from '../../server/src/services/permissionCatalog';

const base = process.env.PERMISSION_LIVE_BASE_URL || 'http://127.0.0.1:3000';
if (!['http://127.0.0.1:3000', 'http://127.0.0.1:3001'].includes(base)) throw new Error('Use an isolated localhost frontend');
const target = 'gh250-live-logistics';
const password = 'GH250-synthetic-local-only';
const customerWrites = ['RESOURCE:customers:CREATE', 'RESOURCE:customers:UPDATE', 'RESOURCE:customers:WRITE'];
let operator: APIRequestContext;

async function csrf(request: APIRequestContext) {
  const response = await request.get(`${base}/api/auth/me`);
  expect(response.status()).toBe(200);
  return { 'X-CSRF-Token': response.headers()['x-csrf-token'] };
}
async function userEditor(request: APIRequestContext, id = target) {
  const response = await request.get(`${base}/api/users/${id}/permissions?contractVersion=1`);
  expect(response.status()).toBe(200); return response.json();
}
async function reset(request: APIRequestContext, id = target) {
  const current = await userEditor(request, id);
  const response = await request.post(`${base}/api/users/${id}/permissions/reset`, {
    headers: await csrf(request), data: { contractVersion: 1, catalogVersion: 1, expectedVersion: current.expectedVersion },
  });
  expect(response.status()).toBe(200);
}
async function login(page: Page, name: string) {
  await page.goto(`${base}/login`);
  const emailOption = page.getByRole('button', { name: 'Sign in with email instead' });
  await expect(emailOption).toBeVisible();
  await emailOption.click();
  await page.locator('#login-email').fill(`${name}@gh250.invalid`);
  await page.locator('#login-password').fill(password);
  const pending = page.waitForResponse(response => response.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: /^sign in$|^log in$/i }).click();
  expect((await pending).status()).toBe(200);
  await expect(page.locator('#login-email')).toBeHidden();
}
async function permissionsTab(page: Page) {
  await page.goto(`${base}/admin`);
  await expect(page.getByText('GH250 logistics', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Roles & Permissions', exact: true }).click();
}
async function openUser(page: Page) {
  await permissionsTab(page);
  await page.getByRole('combobox', { name: 'Individual account', exact: true }).selectOption(target);
  await expect(page.getByLabel('Search permission modules')).toBeVisible();
  await page.getByRole('button', { name: 'Edit permissions', exact: true }).click();
}
async function selectPolicy(page: Page, key: string, effect: string) {
  await expect(page.getByLabel('Search permission modules')).toBeVisible();
  const edit = page.getByRole('button', { name: 'Edit permissions', exact: true });
  if (await edit.isVisible()) await edit.click();
  const [scope, module] = key.split(':');
  await page.getByLabel('Search permission modules').fill(module);
  await page.getByLabel('Permission scope').selectOption(scope);
  await page.getByRole('combobox', { name: key, exact: true }).selectOption(effect);
}
async function save(page: Page, expectedStatus = 200) {
  const pending = page.waitForResponse(response => response.request().method() === 'PUT' && /\/permissions$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Save permissions', exact: true }).click();
  expect((await pending).status()).toBe(expectedStatus);
  if (expectedStatus === 200) await expect(page.getByRole('status').filter({ hasText: 'Permissions saved' })).toBeVisible();
}
async function refresh(page: Page) {
  const pending = page.waitForResponse(response => response.url().endsWith('/api/auth/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await pending).status()).toBe(200);
}

test.describe.serial('GH250 actual application permission workflow', () => {
  test.beforeAll(async ({ playwright }) => {
    if (process.env.PERMISSION_LIVE_CONFIRM_DATABASE !== 'gh250_live_test') throw new Error('Set PERMISSION_LIVE_CONFIRM_DATABASE=gh250_live_test for the explicitly isolated live run');
    operator = await playwright.request.newContext();
    const login = await operator.post(`${base}/api/auth/login`, { data: { email: 'admin@gh250.invalid', password } });
    expect(login.status()).toBe(200);
    const identity = await operator.get(`${base}/api/admin/deployment-status`);
    expect(identity.status()).toBe(200);
    const deployment = await identity.json();
    expect(deployment.database).toMatchObject({ database: 'gh250_live_test', loopback: true, port: '55450' });
    const session = await operator.get(`${base}/api/auth/me`);
    expect(await session.json()).toMatchObject({ id: 'gh250-live-admin', contractVersion: 1, activeMode: 'V1' });
  });
  test.beforeEach(async () => {
    const usersResponse = await operator.get(`${base}/api/users`);
    const users = await usersResponse.json();
    if (!users.find((user: any) => user.id === target)?.is_active) {
      const editor = await userEditor(operator);
      const active = await operator.patch(`${base}/api/users/${target}/activate`, { headers: await csrf(operator), data: { contractVersion: 1, expectedVersion: editor.expectedVersion } });
      expect(active.status()).toBe(200);
    }
    await reset(operator);
    const editorResponse = await operator.get(`${base}/api/admin/roles/LOGISTICS/permissions`);
    const editor = await editorResponse.json();
    const response = await operator.put(`${base}/api/admin/roles/LOGISTICS/permissions`, { headers: await csrf(operator),
      data: { contractVersion: 1, catalogVersion: 1, expectedVersion: editor.expectedVersion,
        permissions: [...defaultRolePermissions('LOGISTICS')].map(([permissionKey, effect]) => ({ permissionKey, effect })) } });
    expect(response.status()).toBe(200);
  });
  test.afterAll(async () => { await operator?.dispose(); });

  test('Admin UI role and individual saves/reset change another signed-in browser without replacing its cookie', async ({ browser }) => {
    const admin = await browser.newContext(); const user = await browser.newContext();
    try {
      const adminPage = await admin.newPage(); const userPage = await user.newPage();
      await login(adminPage, 'admin'); await login(userPage, 'logistics');
      await userPage.goto(`${base}/customers`);
      await expect(userPage.getByRole('button', { name: 'New Customer', exact: true })).toBeVisible();
      const original = (await user.cookies()).find(cookie => cookie.name === 'mg_session')!.value;
      await permissionsTab(adminPage);
      await adminPage.getByRole('button', { name: 'Edit Logistics permissions', exact: true }).click();
      for (const key of customerWrites) await selectPolicy(adminPage, key, 'DENY');
      await save(adminPage);
      await refresh(userPage);
      await expect(userPage.getByRole('button', { name: 'New Customer', exact: true })).toBeHidden();
      await expect(userPage.getByText('Merchant Customer Registry', { exact: true })).toBeVisible();
      await expect(userPage.locator('table tbody tr')).toHaveCount(0);
      const emptyCustomers = await user.request.get(`${base}/api/customers`);
      expect(emptyCustomers.status()).toBe(200); expect(await emptyCustomers.json()).toEqual([]);
      const denied = await user.request.post(`${base}/api/customers`, { headers: await csrf(user.request), data: { name: 'Must not be created' } });
      expect(denied.status()).toBe(403);
      expect((await user.cookies()).find(cookie => cookie.name === 'mg_session')!.value).toBe(original);
      // Restore through the real role editor, then create explicit per-user exceptions.
      for (const key of [...customerWrites].reverse()) await selectPolicy(adminPage, key, 'ALLOW');
      await save(adminPage); await refresh(userPage);
      await expect(userPage.getByRole('button', { name: 'New Customer', exact: true })).toBeVisible();
      await adminPage.getByRole('button', { name: 'Close editor', exact: true }).click();
      await adminPage.getByRole('combobox', { name: 'Individual account', exact: true }).selectOption(target);
      await selectPolicy(adminPage, 'SCREEN:main:READ', 'ALLOW');
      for (const key of customerWrites) await selectPolicy(adminPage, key, 'DENY');
      await save(adminPage); await refresh(userPage);
      await expect(userPage.getByRole('button', { name: 'New Customer', exact: true })).toBeHidden();
      const saved = await userEditor(admin.request);
      expect(saved.permissions).toContainEqual({ permissionKey: 'SCREEN:main:READ', effect: 'ALLOW' });
      adminPage.once('dialog', dialog => dialog.accept());
      await adminPage.getByRole('button', { name: 'Reset exceptions', exact: true }).click();
      const resetResponse = adminPage.waitForResponse(response => response.url().endsWith(`/api/users/${target}/permissions/reset`));
      await adminPage.getByRole('button', { name: 'Save permissions', exact: true }).click();
      expect((await resetResponse).status()).toBe(200);
      await refresh(userPage);
      await expect(userPage.getByRole('button', { name: 'New Customer', exact: true })).toBeVisible();
      expect((await userEditor(admin.request)).permissions).toEqual([]);
    } finally { await admin.close(); await user.close(); }
  });

  test('two live Admin editors recover a real 409, show safe audits, and retain narrow keyboard/unsaved protections', async ({ browser }, testInfo) => {
    const first = await browser.newContext(); const second = await browser.newContext();
    try {
      const a = await first.newPage(); const b = await second.newPage();
      await login(a, 'admin'); await login(b, 'admin2');
      await openUser(a); await openUser(b);
      await selectPolicy(a, 'SCREEN:main:READ', 'DENY');
      await selectPolicy(b, 'SCREEN:main:READ', 'ALLOW'); await save(b);
      await save(a, 409);
      await expect(a.getByRole('combobox', { name: 'SCREEN:main:READ', exact: true })).toHaveValue('DENY');
      await expect(a.getByRole('button', { name: 'Save permissions', exact: true })).toBeDisabled();
      await a.getByRole('button', { name: 'Refresh for conflict review', exact: true }).click();
      await a.getByLabel('I reviewed the refreshed policy and my preserved draft.').check();
      await save(a);
      await a.getByRole('button', { name: 'Close editor', exact: true }).click();
      await a.getByRole('combobox', { name: 'Individual account', exact: true }).selectOption('gh250-live-admin2');
      await a.getByRole('button', { name: 'Edit permissions', exact: true }).click();
      await a.getByLabel('Search permission modules').fill('users');
      await a.getByLabel('Permission scope').selectOption('RESOURCE');
      await expect(a.getByRole('combobox', { name: 'RESOURCE:users:WRITE', exact: true })).toBeDisabled();
      await a.getByRole('button', { name: 'Close editor', exact: true }).click();
      await a.getByRole('combobox', { name: 'Individual account', exact: true }).selectOption(target);
      await a.getByRole('button', { name: 'Edit permissions', exact: true }).click();
      await a.setViewportSize({ width: 390, height: 844 });
      const filter = a.getByLabel('Search permission modules'); await filter.focus(); await a.keyboard.type('main');
      await a.keyboard.press('Tab'); await expect(a.getByLabel('Permission scope')).toBeFocused();
      await a.keyboard.press('Tab'); await expect(a.getByRole('button', { name: 'Clear module filters', exact: true })).toBeFocused();
      await a.keyboard.press('Tab'); await expect(a.getByRole('region', { name: 'Permission matrix', exact: true })).toBeFocused();
      await a.keyboard.press('Tab');
      await expect(a.getByRole('combobox', { name: 'SCREEN:main:READ', exact: true })).toBeFocused();
      await selectPolicy(a, 'SCREEN:main:READ', 'INHERIT');
      a.once('dialog', dialog => dialog.dismiss());
      await a.getByRole('button', { name: 'System Audit Log', exact: true }).click();
      await expect(a.getByLabel('Search permission modules')).toBeVisible();
      const widths = await a.evaluate(() => ({
        viewport: window.innerWidth,
        main: document.getElementById('main-routed-view')?.scrollWidth,
        matrix: document.querySelector<HTMLElement>('[aria-label="Permission matrix"]')?.scrollWidth,
        matrixViewport: document.querySelector<HTMLElement>('[aria-label="Permission matrix"]')?.clientWidth,
      }));
      // The matrix intentionally scrolls its wide action table internally; the routed page must not.
      expect(widths.main, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport);
      expect(widths.matrix).toBeGreaterThan(widths.matrixViewport!);
      await a.screenshot({ path: testInfo.outputPath('actual-admin-narrow.png') });
      await a.getByRole('button', { name: 'Cancel changes', exact: true }).click();
      await a.getByRole('button', { name: 'System Audit Log', exact: true }).click();
      const details = a.locator('summary').filter({ hasText: 'Permission changes' }).first();
      await expect(details).toBeVisible(); await details.click();
      await expect(a.getByText(/SCREEN:main:READ:/).first()).toBeVisible();
    } finally { await first.close(); await second.close(); }
  });

  test('Sales, TASS and linked Driver logins retain their distinct real application boundaries', async ({ browser }) => {
    for (const [name, role] of [['sales', 'SALES_COORDINATOR'], ['tass', 'TASS'], ['driver', 'DRIVER']]) {
      const context = await browser.newContext({ viewport: role === 'DRIVER' ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
      try {
        const page = await context.newPage(); await login(page, name);
        const sessionResponse = await context.request.get(`${base}/api/auth/me`);
        const session = await sessionResponse.json();
        expect(session).toMatchObject({ role, activeMode: 'V1', contractVersion: 1, snapshot: { valid: true, role } });
        expect((await context.request.get(`${base}/api/users`)).status()).toBe(403);
        if (role === 'SALES_COORDINATOR') {
          await page.goto(`${base}/rma`); await expect(page).not.toHaveURL(/\/rma$/);
          expect(session.snapshot.readableCategories).not.toContain('RMA');
        } else if (role === 'TASS') {
          await page.goto(`${base}/rma`); await expect(page).toHaveURL(/\/rma$/);
          const records = await context.request.get(`${base}/api/records`);
          expect(records.status()).toBe(200); expect(await records.json()).toEqual([]);
          const supplier = await context.request.post(`${base}/api/suppliers`, { headers: await csrf(context.request), data: { name: 'Denied TASS supplier' } });
          expect(supplier.status()).toBe(403);
        } else {
          expect(session.driverProfileId).toBe('gh250-live-driver-profile');
          await expect(page.getByText('GH250-LIVE-DELIVERY', { exact: true }).first()).toBeVisible();
          const records = await context.request.get(`${base}/api/records`);
          expect(records.status()).toBe(200);
          expect((await records.json()).map((record: any) => record.id)).toEqual(['gh250-live-record']);
        }
      } finally { await context.close(); }
    }
  });

  test('actual deep links, stale record workspaces, no-access accounts and deactivation fail closed', async ({ browser }) => {
    const user = await browser.newContext(); const noAccess = await browser.newContext();
    try {
      const page = await user.newPage(); await login(page, 'logistics');
      await page.goto(`${base}/deliveries?item=gh250-live-record`);
      await expect(page.getByText('GH250-LIVE-DELIVERY', { exact: true }).first()).toBeVisible();
      const current = await userEditor(operator);
      const response = await operator.put(`${base}/api/users/${target}/permissions`, { headers: await csrf(operator),
        data: { contractVersion: 1, catalogVersion: 1, expectedVersion: current.expectedVersion,
          permissions: PERMISSION_CATALOG.filter(row => row.scope === 'CATEGORY' && row.module === 'DELIVERY').map(row => ({ permissionKey: row.key, effect: 'DENY' })) } });
      expect(response.status()).toBe(200); await refresh(page);
      await expect(page.getByText('GH250-LIVE-DELIVERY', { exact: true })).toHaveCount(0);
      const forbidden = await user.request.get(`${base}/api/records/gh250-live-record`);
      expect(forbidden.status()).toBe(403);
      expect(await forbidden.json()).toMatchObject({ error: 'Record access denied' });
      await page.goto(`${base}/admin`); await expect(page).not.toHaveURL(/\/admin$/);
      const empty = await noAccess.newPage(); await login(empty, 'noaccess');
      await expect(empty).toHaveURL(/\/no-access$/);
      await expect(empty.getByRole('heading', { name: 'No modules assigned', exact: true })).toBeVisible();
      await expect(empty.getByText('Contact your administrator to request access.', { exact: true })).toBeVisible();
      expect((await noAccess.request.get(`${base}/api/records`)).status()).toBe(403);
      const final = await userEditor(operator);
      const deactivate = await operator.patch(`${base}/api/users/${target}/deactivate`, { headers: await csrf(operator), data: { contractVersion: 1, expectedVersion: final.expectedVersion } });
      expect(deactivate.status()).toBe(200);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('button', { name: 'Sign in with email instead' })).toBeVisible();
      expect((await user.request.get(`${base}/api/auth/me`)).status()).toBe(401);
    } finally { await user.close(); await noAccess.close(); }
  });
});
