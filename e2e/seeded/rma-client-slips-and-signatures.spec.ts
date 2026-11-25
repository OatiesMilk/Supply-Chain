import type { Page } from '@playwright/test';
import { accountFor, apiUrl, expect, login, openScreen, records, test } from './support';

// Feature 5a against an already prepared seeded sandbox. The seeded runner is
// read-only (browser mutations are blocked by the readOnlyGuard), so these
// checks cover every GET path: signature metadata and private image
// endpoints, the Account Settings and Admin signature managers, and single +
// bulk client slip PDF generation. Upload/replace/delete are covered by
// server/tests/userSignatures.test.ts.

async function firstRma(page: Page) {
  const rows = await records(page, 'RMA');
  return rows.find(row => row.is_draft === 'No') ?? rows[0];
}

test('signature metadata never exposes a storage key and images are private', async ({ page }) => {
  await login(page, 'TASS');
  const meta = await page.request.get(apiUrl('/auth/me/signature'));
  expect(meta.status()).toBe(200);
  const body = await meta.json();
  expect(Object.keys(body).sort()).toEqual(['has_signature', 'height', 'image_url', 'mime_type', 'size', 'updated_at', 'width']);
  expect(JSON.stringify(body)).not.toMatch(/sig-[0-9a-f]{8}|storageKey/);
  const image = await page.request.get(apiUrl('/auth/me/signature/image'));
  expect([200, 404]).toContain(image.status());
  if (image.status() === 200) {
    expect(image.headers()['cache-control']).toBe('private, no-store');
    expect(image.headers()['x-content-type-options']).toBe('nosniff');
  }
  expect((await page.request.get(apiUrl('/users'))).status()).toBe(403);
});

test('issuer signatures are record-scoped: TASS may read, Sales Coordinator may not', async ({ page }) => {
  await login(page, 'TASS');
  const record = await firstRma(page);
  test.skip(!record, 'Prepared seed has no RMA records.');
  const allowed = await page.request.get(apiUrl(`/records/${encodeURIComponent(record.id)}/issuer-signature`));
  expect([200, 204]).toContain(allowed.status());
  expect(allowed.headers()['cache-control']).toBe('private, no-store');
  const listed = await page.request.get(apiUrl(`/records/${encodeURIComponent(record.id)}`));
  expect(typeof (await listed.json()).created_by_has_signature).toBe('boolean');

  await login(page, 'SALES_COORDINATOR');
  expect((await page.request.get(apiUrl(`/records/${encodeURIComponent(record.id)}/issuer-signature`))).status()).toBe(403);
});

test('Account Settings shows the Digital Signature manager for the signed-in user', async ({ page }) => {
  await login(page, 'TASS');
  await openScreen(page, 'dashboard', 'TASS');
  await page.locator('#account-menu-button').click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Digital Signature' })).toBeVisible();
  const manager = dialog.getByTestId('digital-signature-manager');
  await expect(manager.getByText('Issued by:')).toBeVisible();
  await expect(manager.getByText(/Upload signature|Replace signature/)).toBeVisible();
  await expect(manager.getByText(/PNG or JPG, up to 2 MB/)).toBeVisible();
});

test('Admin sees signature status and opens a user signature manager', async ({ page }) => {
  await login(page, 'ADMIN');
  await openScreen(page, 'admin', 'ADMIN');
  const accounts = page.getByRole('region', { name: 'User accounts' });
  await expect(accounts.getByRole('columnheader', { name: 'Signature', exact: true })).toBeVisible();
  const row = accounts.getByRole('row').filter({ has: page.getByRole('cell', { name: accountFor('TASS').email, exact: true }) });
  await row.getByRole('button', { name: /^Actions for / }).click();
  await page.getByRole('menu', { name: /^Actions for / }).getByRole('menuitem', { name: 'Signature', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Digital signature — /)).toBeVisible();
  await expect(dialog.getByTestId('digital-signature-manager')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});

for (const role of ['TASS', 'LOGISTICS'] as const) {
  test(`${role} extracts a bulk multi-page client slip PDF grouped by Movement Method`, async ({ page }) => {
    await login(page, role);
    const rows = await records(page, 'RMA');
    test.skip(rows.length === 0, 'Prepared seed has no RMA records.');
    await openScreen(page, 'rma', role);
    const checkboxes = page.locator('#records-view-rma tbody input[type="checkbox"]');
    await expect(checkboxes.first()).toBeVisible();
    await checkboxes.first().check();
    if (await checkboxes.count() > 1) await checkboxes.nth(1).check();
    const bar = page.locator('#bulk-action-bar');
    await expect(bar).toBeVisible();
    if (role === 'LOGISTICS') {
      // View-only on RMA: selection exists for slip extraction only.
      await expect(bar.locator('#bulk-status-select')).toHaveCount(0);
      await expect(bar.getByRole('button', { name: 'Apply' })).toHaveCount(0);
    }
    await bar.getByRole('button', { name: 'Extract Slips (PDF)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Extract Slips (PDF)' });
    await expect(dialog.getByLabel('Group & sort by Movement Method', { exact: false })).toBeChecked();
    await dialog.getByRole('combobox').first().selectOption('letter');
    await dialog.getByRole('button', { name: 'Extract PDF' }).click();
    const preview = page.getByRole('dialog', { name: 'Extracted slips preview' });
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview.getByText(/slip/)).toBeVisible();
    const download = page.waitForEvent('download');
    await preview.getByRole('button', { name: 'Download PDF' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^rma-client-slips-.*\.pdf$/);
  });
}

test('the RMA toolbar offers Extract Slips (PDF) for the filtered date range', async ({ page }) => {
  await login(page, 'TASS');
  await openScreen(page, 'rma', 'TASS');
  await page.locator('#toolbar-extract-slips').click();
  const dialog = page.getByRole('dialog', { name: 'Extract Slips (PDF)' });
  await expect(dialog.getByText('Current filters and delivery-date range')).toBeVisible();
  await expect(dialog.getByLabel('From')).toBeVisible();
  await expect(dialog.getByLabel('To')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});
