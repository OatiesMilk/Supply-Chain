import { test as base, expect, type APIResponse, type Page } from '@playwright/test';
import { LEGACY_POLICY_DEFAULT_SCREENS, POLICY_SCREENS, type PolicyRole } from '../../server/src/services/permissionCatalog';
import { apiUrl } from './targets';
export { apiUrl } from './targets';

// Public disposable fixture credentials from server/prisma/seeds/users.ts.
// Keep this mapping aligned with USERS. Importing the seed module would load
// Prisma/configuration into a browser suite, so no seed code is imported/run.
export const accounts = [
  { role: 'SALES_COORDINATOR', name: 'Maria Reyes', email: 'sales@microgenesis.com', password: 'password123' },
  { role: 'LOGISTICS', name: 'Juan Santos', email: 'logistics@microgenesis.com', password: 'password123' },
  { role: 'TASS', name: 'Ana Cruz', email: 'tass@microgenesis.com', password: 'password123' },
  { role: 'ADMIN', name: 'System Admin', email: 'admin@microgenesis.com', password: 'admin123' },
  { role: 'DRIVER', name: 'John Doe', email: 'driver@microgenesis.com', password: 'password123' },
] as const;
export type SeedAccount = typeof accounts[number];
export const accountFor = (role: PolicyRole) => accounts.find(account => account.role === role)!;

export type SeedSession = { id: string; name: string; email: string; role: PolicyRole; effectiveScreens: string[]; activeMode?: 'LEGACY' | 'V1'; driverProfileId?: string | null; snapshot?: { readableCategories: string[] } };
export type SeedRecord = { id: string; category: string; is_draft: string; driver_id?: string | null; reference?: string; rma_reference?: string | null };

export const test = base.extend<{ readOnlyGuard: void }>({
  readOnlyGuard: [async ({ context }, use) => {
    expect(process.env.SEEDED_E2E_TARGET, 'Confirm an already prepared local seeded sandbox with SEEDED_E2E_TARGET=local; this runner never creates or resets data.').toBe('local');
    const blocked: string[] = [];
    // Browser requests only: Playwright APIRequestContext bypasses routing.
    // API helpers below use GET except the explicit /auth/login POST.
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !['/api/auth/login', '/api/auth/logout'].includes(path)) {
        blocked.push(`${request.method()} ${path}`);
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    await use();
    expect(blocked, 'Seeded smoke tests must never submit a business mutation').toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function expectOk(response: APIResponse, label: string) {
  expect(response.status(), label).toBe(200);
}

export async function login(page: Page, role: PolicyRole): Promise<SeedSession> {
  const account = accountFor(role);
  const response = await page.request.post(apiUrl('/auth/login'), { data: { email: account.email, password: account.password } });
  await expectOk(response, `Seeded ${role} login; check fixture preparation`);
  const session = await response.json() as SeedSession;
  expect(session.role).toBe(role);
  expect(session.email).toBe(account.email);
  expect(session.id).toBeTruthy();
  const fixtures = process.env.SEEDED_E2E_FIXTURES ?? 'canonical';
  expect(['canonical', 'current']).toContain(fixtures);
  if (fixtures === 'canonical') {
    expect(session.name).toBe(account.name);
    expect([...session.effectiveScreens].sort(), `Unexpected customized ${role} fixture permissions`).toEqual([...LEGACY_POLICY_DEFAULT_SCREENS[role]].sort());
  } else {
    expect(session.name.trim()).not.toBe('');
    expect(session.effectiveScreens.length).toBeGreaterThan(0);
    expect(new Set(session.effectiveScreens).size).toBe(session.effectiveScreens.length);
    for (const screen of session.effectiveScreens) expect(POLICY_SCREENS).toContain(screen);
    const me = await page.request.get(apiUrl('/auth/me'));
    await expectOk(me, 'Current account session');
    expect(await me.json()).toMatchObject({ id: session.id, role, email: account.email, effectiveScreens: session.effectiveScreens });
  }
  return session;
}

export async function uiLogin(page: Page, role: PolicyRole) {
  const account = accountFor(role);
  const emailChoice = page.getByRole('button', { name: 'Sign in with email instead' });
  await expect(page.locator('#login-email').or(emailChoice)).toBeVisible();
  if (await emailChoice.isVisible()) await emailChoice.click();
  await page.locator('#login-email').fill(account.email);
  await page.locator('#login-password').fill(account.password);
  await page.getByRole('button', { name: /^sign in$|^log in$/i }).click();
  await expect(page.locator('#login-email')).not.toBeVisible();
}

export async function logout(page: Page, role: PolicyRole) {
  if (role === 'DRIVER') await page.getByRole('button', { name: 'Log Out', exact: true }).click();
  else {
    await page.getByRole('button', { name: 'Account menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Log out', exact: true }).click();
  }
  await expect(page.locator('#app-root')).toHaveCount(0);
  const me = await page.request.get(apiUrl('/auth/me'));
  expect(me.status(), 'Logout clears the authenticated cookie').toBe(401);
}

const roots: Record<string, string> = {
  deliveries: '[id="records-view-deliveries"]', rma: '[id="records-view-rma"]',
  accounting_collection: '#accounting-collection-view', procurement_pickup: '[id="records-view-procurement-pick-up"]',
  sales_orders: '[id="records-view-sales-orders"]', customers: '#customers-view-container',
  driver: '#drivers-page', driver_board: '#drivers-page', driver_manager: '#drivers-page',
  calendar: '#delivery-calendar-view', am_directory: '#am-directory-view', transactions: '#transaction-center',
  inventory: '#inventory-view-container', admin: '#admin-panel',
};
export async function openScreen(page: Page, screen: string, role: PolicyRole) {
  await page.goto(`/${screen}`);
  await expect(page).toHaveURL(new RegExp(`/${screen}(?:[?]|$)`));
  if (screen === 'driver_dashboard') {
    const me = await page.request.get(apiUrl('/auth/me'));
    await expectOk(me, 'Driver session');
    const session = await me.json() as SeedSession;
    expect(session.role).toBe(role);
    await expect(page.getByRole('heading', { name: session.name, exact: true })).toBeVisible();
  }
  else {
    const main = page.locator('#main-routed-view');
    await expect(main).toBeVisible();
    if (screen === 'dashboard') {
      const id = role === 'ADMIN' ? '#admin-dashboard' : role === 'LOGISTICS' ? '#logistics-dashboard' : role === 'TASS' ? '#tass-dashboard' : '#dashboard-view-container';
      await expect(page.locator(id)).toBeVisible();
    } else if (roots[screen]) await expect(page.locator(roots[screen])).toBeVisible();
    else if (screen === 'main') await expect(main.getByRole('button', { name: 'New Delivery', exact: true })).toBeVisible();
    else if (screen === 'suppliers') await expect(main.getByRole('heading', { name: 'Supplier Registry', exact: true })).toBeVisible();
    else if (screen === 'statistical_reports') await expect(main.getByRole('button', { name: 'Generate Report', exact: true })).toBeVisible();
    else if (screen === 'data_sampler') await expect(main.getByRole('heading', { name: 'Generate Sample Records', exact: true })).toBeVisible();
    else throw new Error(`Add a readiness assertion for granted screen ${screen}`);
    await expect(main.getByText(/Unable to load page data:|This page could not be loaded|View Not Found|This page is not available for your account/)).toHaveCount(0);
  }
}

export async function records(page: Page, category?: string): Promise<SeedRecord[]> {
  const response = await page.request.get(apiUrl(`/records${category ? `?category=${encodeURIComponent(category)}` : ''}`));
  await expectOk(response, 'Seeded record list');
  const body = await response.json();
  return Array.isArray(body) ? body : body.rows;
}
