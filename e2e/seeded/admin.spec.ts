import type { Locator, Page } from '@playwright/test';
import { accountFor, apiUrl, expect, login, openScreen, test } from './support';

/** Account actions live in a per-row kebab menu (a portal), not as inline row buttons. */
async function accountAction(page: Page, row: Locator, action: string) {
  await row.getByRole('button', { name: /^Actions for / }).click();
  await page.getByRole('menu', { name: /^Actions for / }).getByRole('menuitem', { name: action, exact: true }).click();
}

/** Access opens the V1 policy editor, or the legacy module-access panel while the environment is still on LEGACY permissions. */
async function openAccess(page: Page, row: Locator) {
  const permissions = page.waitForResponse(response => /\/api\/v1\/users\/[^/]+\/permissions$/.test(new URL(response.url()).pathname));
  await accountAction(page, row, 'Access');
  expect((await permissions).status()).toBe(200);
  const close = page.getByRole('button', { name: /^(Close editor|Close account permissions)$/ });
  await expect(close).toBeVisible();
  await expect(page.getByText(/Loading permissions|Loading policy/)).toHaveCount(0);
  expect(await close.evaluate(element => element.closest('table') === null)).toBe(true);
  return close;
}

const accountsRegion = (page: Page) => page.getByRole('region', { name: 'User accounts', exact: true });
const salesRow = (page: Page) => accountsRegion(page).getByRole('row')
  .filter({ has: page.getByRole('cell', { name: accountFor('SALES_COORDINATOR').email, exact: true }) });

test('Admin account actions open and cancel their workflows without submitting changes', async ({ page }) => {
  await login(page, 'ADMIN');
  await openScreen(page, 'admin', 'ADMIN');
  const accounts = accountsRegion(page);
  const sales = salesRow(page);
  await expect(sales).toBeVisible();
  const salesName = (await sales.getByRole('cell').first().innerText()).trim();
  const salesRowIndex = await sales.evaluate(row => (row as HTMLTableRowElement).sectionRowIndex);
  const editedRow = accounts.locator('tbody tr').nth(salesRowIndex);
  await accountAction(page, sales, 'Edit');
  await expect(editedRow.locator('input')).toHaveCount(2);
  await editedRow.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sales.locator('input')).toHaveCount(0);

  const close = await openAccess(page, sales);
  await close.click();
  await expect(close).toHaveCount(0);

  await page.getByRole('button', { name: /User Management/ }).click();
  for (const [action, confirm] of [['Deactivate', 'Deactivate user'], ['Delete', 'Delete user']]) {
    await accountAction(page, salesRow(page), action);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: confirm, exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  const form = page.locator('#admin-panel form').filter({ has: page.getByRole('heading', { name: 'New User Account', exact: true }) });
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(form).toHaveCount(0);
});

test('Admin tabs read audit, integrations and policy previews without mail or policy writes', async ({ page }) => {
  await login(page, 'ADMIN');
  await openScreen(page, 'admin', 'ADMIN');
  await page.getByRole('button', { name: 'System Audit Log', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply Filters', exact: true })).toBeVisible();
  const auditResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/admin/audit-log');
  await page.getByRole('button', { name: 'Apply Filters', exact: true }).click();
  expect((await auditResponse).status()).toBe(200);

  const diagnostics = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/admin/integration-status');
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  expect((await diagnostics).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Email Delivery', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send Test', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Roles & Permissions', exact: true }).click();
  await page.getByRole('button', { name: 'View Admin permissions', exact: true }).click();
  const policy = page.getByRole('region', { name: 'admin permission editor', exact: true });
  await expect(policy).toBeVisible();
  await expect(policy.getByLabel('User Management → Shared resource → Write', { exact: true })).toBeDisabled();
  await policy.getByRole('button', { name: 'Close editor', exact: true }).click();
  await expect(policy).toHaveCount(0);
});

test('Admin account pagination reflects seeded totals and preserves users when changing pages', async ({ page }) => {
  await login(page, 'ADMIN');
  const response = await page.request.get(apiUrl('/users'));
  expect(response.status()).toBe(200);
  const users = await response.json() as Array<{ id: string }>;
  expect(users.length).toBeGreaterThanOrEqual(5);
  await openScreen(page, 'admin', 'ADMIN');
  const rows = page.getByRole('region', { name: 'User accounts', exact: true }).locator('tbody tr');
  await expect(rows).toHaveCount(Math.min(10, users.length));
  const next = page.getByRole('button', { name: 'Next page', exact: true });
  if (users.length > 10) {
    await next.click();
    await expect(rows).toHaveCount(Math.min(10, users.length - 10));
    await page.getByRole('button', { name: 'Previous page', exact: true }).click();
    await expect(rows).toHaveCount(10);
  } else await expect(next).toBeDisabled();
  await page.getByRole('combobox', { name: 'Rows per page', exact: true }).selectOption('25');
  await expect(rows).toHaveCount(Math.min(25, users.length));
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`Admin scrolling and Access keep the page within ${viewport.width}px viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page, 'ADMIN');
    await openScreen(page, 'admin', 'ADMIN');
    const table = page.getByRole('region', { name: 'User accounts', exact: true });
    const firstRow = table.locator('tbody tr').first();
    // The row's actions menu stays reachable through the table's own scroll area.
    const actions = firstRow.getByRole('button', { name: /^Actions for / });
    await firstRow.scrollIntoViewIfNeeded();
    await table.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await expect(actions).toBeInViewport();
    await openAccess(page, firstRow);
    await page.evaluate(() => document.fonts.ready);
    const measure = () => page.evaluate(() => {
      const main = document.querySelector<HTMLElement>('#main-routed-view')!;
      return { viewport: innerWidth, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        viewportHeight: innerHeight, mainHeight: main.clientHeight, contentHeight: main.scrollHeight };
    });
    const initial = await measure();
    expect(initial.width).toBeLessThanOrEqual(initial.viewport + 1);
    expect(initial.height).toBeLessThanOrEqual(initial.viewportHeight + 1);
    for (let index = 0; index < 5; index++) {
      await page.locator('#main-routed-view').evaluate(element => { element.scrollTop = element.scrollHeight; });
      const current = await measure();
      expect(current.width).toBeLessThanOrEqual(current.viewport + 1);
      expect(current.height).toBeLessThanOrEqual(current.viewportHeight + 1);
      expect(current.mainHeight).toBe(initial.mainHeight);
      expect(Math.abs(current.contentHeight - initial.contentHeight)).toBeLessThanOrEqual(2);
    }
  });
}
