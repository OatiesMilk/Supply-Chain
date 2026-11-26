import type { Response } from '@playwright/test';
import { apiUrl, expect, login, openScreen, test } from './support';

// Feature 4b against an already prepared seeded sandbox. The seeded runner is
// read-only (browser mutations are blocked by the readOnlyGuard), so submitting,
// approving and rejecting requests are covered by server/tests/masterDataRequests*.test.ts
// and client/tests/masterDataRequests.test.ts; these checks cover the entry points,
// dialog validation without sending, the Admin queue's GET path and role denials.

const LIST_PATHNAME = new URL(apiUrl('/master-data-requests')).pathname;
/** A page read of the request list (not the one-row badge/summary read that runs on every mount). */
function listRead(response: Response, status: string) {
  const url = new URL(response.url());
  return response.request().method() === 'GET' && url.pathname === LIST_PATHNAME
    && url.searchParams.get('status') === status && url.searchParams.get('limit') !== '1';
}

test('TASS sees the request actions on RMA and validates the request dialog without sending', async ({ page }) => {
  await login(page, 'TASS');
  await openScreen(page, 'rma', 'TASS');
  const toolbar = page.locator('#records-toolbar');
  await expect(toolbar.getByRole('button', { name: 'Request Company / Supplier' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: /^My Requests/ })).toBeVisible();

  await toolbar.getByRole('button', { name: 'Request Company / Supplier' }).click();
  const dialog = page.getByRole('dialog', { name: 'Request to add company' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Company' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByLabel('SAP number(s)')).toBeVisible();
  await expect(dialog.getByText('Optional for walk-in clients; add multiple for enterprise accounts.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Send request' }).click();
  await expect(dialog.getByText('Company name must be 2 to 200 characters')).toBeVisible();

  await dialog.getByRole('radio', { name: 'Supplier' }).click();
  // The dialog's accessible name follows the selected type, so the Company locator no longer matches.
  const supplierDialog = page.getByRole('dialog', { name: 'Request to add supplier' });
  await expect(supplierDialog).toBeVisible();
  await expect(supplierDialog.getByLabel('Email')).toBeVisible();
  await expect(supplierDialog.getByLabel('City')).toBeVisible();
  await supplierDialog.getByLabel('Supplier name').fill('Seeded E2E Vendor');
  await supplierDialog.getByLabel('Email').fill('not-an-email');
  await supplierDialog.getByRole('button', { name: 'Send request' }).click();
  await expect(supplierDialog.getByText('Enter a valid email address')).toBeVisible();
  await supplierDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(supplierDialog).toBeHidden();

  const mine = page.waitForResponse(response => listRead(response, 'ALL'));
  await toolbar.getByRole('button', { name: /^My Requests/ }).click();
  expect((await mine).status()).toBe(200);
  await expect(page.getByRole('dialog', { name: 'My addition requests' })).toBeVisible();
});

test('TASS can open Request to add company from the RMA form without losing it', async ({ page }) => {
  await login(page, 'TASS');
  await openScreen(page, 'rma', 'TASS');
  await page.locator('#records-toolbar').getByRole('button', { name: 'New Record', exact: true }).click();
  const trigger = page.locator('#request-company-addition');
  await expect(trigger).toBeVisible();
  const category = page.locator('#create-rma-type');
  await category.selectOption({ index: 1 });
  const chosen = await category.inputValue();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Request to add company' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radiogroup')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(trigger).toBeVisible();
  await expect(category, 'the in-progress RMA form keeps its values').toHaveValue(chosen);
});

test('TASS sees Request Supplier and My Requests on Suppliers', async ({ page }) => {
  await login(page, 'TASS');
  await openScreen(page, 'suppliers', 'TASS');
  const main = page.locator('#main-routed-view');
  await expect(main.getByRole('button', { name: 'New Supplier' })).toHaveCount(0);
  await main.getByRole('button', { name: 'Request Supplier' }).click();
  const dialog = page.getByRole('dialog', { name: 'Request to add supplier' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radiogroup')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(main.getByRole('button', { name: /^My Requests/ })).toBeVisible();
});

test('Admin sees the Addition Requests tab and the queue loads', async ({ page }) => {
  await login(page, 'ADMIN');
  await openScreen(page, 'admin', 'ADMIN');
  const queue = page.waitForResponse(response => listRead(response, 'PENDING'));
  await page.locator('#admin-panel').getByRole('button', { name: /^Addition Requests/ }).click();
  expect((await queue).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Addition Requests', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filter by status' })).toBeVisible();
  const response = await page.request.get(apiUrl('/master-data-requests?limit=1'));
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Array.isArray(body.requests)).toBe(true);
  expect(body.requests.length).toBeLessThanOrEqual(1);
  expect(Object.keys(body.counts).sort()).toEqual(['approved', 'pending', 'rejected']);
  expect(body).toMatchObject({ page: 1, limit: 1 });
  expect(body.total).toBe(body.counts.pending + body.counts.approved + body.counts.rejected);
});

for (const role of ['SALES_COORDINATOR', 'LOGISTICS'] as const) {
  test(`${role} cannot read addition requests and sees no request actions`, async ({ page }) => {
    await login(page, role);
    expect((await page.request.get(apiUrl('/master-data-requests'))).status()).toBe(403);
    await openScreen(page, 'suppliers', role);
    await expect(page.locator('#main-routed-view').getByRole('button', { name: 'Request Supplier' })).toHaveCount(0);
  });
}
