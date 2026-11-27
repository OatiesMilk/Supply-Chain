import { apiUrl, expect, login, openScreen, records, test } from './support';

// Feature 5b against an already prepared seeded sandbox. The seeded runner is
// read-only (browser mutations are blocked by the readOnlyGuard), so the actual
// POST /records/rma-logistics-dispatch is covered by
// server/tests/rmaLogisticsDispatch.test.ts; these checks cover the RMA table,
// filters, Daily Route Slip download and the Dispatch dialog's GET paths.

test('the RMA table shows the Daily Route Slip columns and the inline RMA filters', async ({ page }) => {
  await login(page, 'TASS');
  await openScreen(page, 'rma', 'TASS');
  const view = page.locator('#records-view-rma');
  for (const header of ['Reference', 'Delivery Date', 'Company', 'Category', 'Movement Method', 'Account Manager', 'Item Description', 'Area', 'Created By', 'Status']) {
    await expect(view.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
  }
  const quick = page.locator('#rma-quick-filters');
  await expect(quick.locator('#rma-movement-filter')).toBeVisible();
  await expect(quick.getByLabel('Account Manager')).toBeVisible();
  await expect(quick.getByLabel('Created By')).toBeVisible();
  await quick.locator('#rma-movement-filter').selectOption('LOGISTICS_TRANSPORT');
  await expect(view.locator('tbody tr').first()).toBeVisible();

  const options = await page.request.get(apiUrl('/records/filter-options?category=RMA'));
  expect(options.status()).toBe(200);
  const body = await options.json();
  expect(Array.isArray(body.creators)).toBe(true);
  expect(Object.keys(body).sort()).toEqual(['accountManagers', 'areas', 'creators', 'drivers']);
  const filtered = await page.request.get(apiUrl('/records?category=RMA&paged=true&created_by=zz-no-such-creator'));
  expect(filtered.status()).toBe(200);
  expect((await filtered.json()).total).toBe(0);
});

test('TASS previews and downloads a DRRMMDDYY.xlsx Daily Route Slip for selected RMA rows', async ({ page }) => {
  await login(page, 'TASS');
  const rows = await records(page, 'RMA');
  test.skip(rows.length === 0, 'Prepared seed has no RMA records.');
  await openScreen(page, 'rma', 'TASS');
  const checkboxes = page.locator('#records-view-rma tbody input[type="checkbox"]');
  await checkboxes.first().check();
  if (await checkboxes.count() > 1) await checkboxes.nth(1).check();
  await page.locator('#bulk-daily-handoff-menu').click();
  await page.locator('#bulk-tass-daily-route-slip').click();
  const dialog = page.getByRole('dialog', { name: 'Daily Route Slip (DRR)' });
  await expect(dialog.getByLabel('Group & sort by Movement Method', { exact: false })).toBeChecked();
  await dialog.getByRole('button', { name: 'Generate & preview' }).click();
  const preview = page.getByRole('dialog', { name: /Preview Daily Route Slip DRR\d{6}/ });
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByText('DeliveryDate', { exact: true })).toBeVisible();
  await expect(preview.getByText('FOR INTERNAL USE ONLY', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await preview.getByRole('button', { name: /Download/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^DRR\d{6}(-\d{6})?\.xlsx$/);
});

test('TASS opens Dispatch to Logistics and the coordinator list loads from the scoped lookup', async ({ page }) => {
  await login(page, 'TASS');
  await openScreen(page, 'rma', 'TASS');
  // Product decision (#352): TASS has no generic Route Slip menu on RMA; the DRR is in the Daily handoff menu.
  await expect(page.getByRole('button', { name: /^Route Slip/ })).toHaveCount(0);
  const recipients = page.waitForResponse(response => response.url().includes('/records/rma-logistics-recipients'));
  await page.locator('#toolbar-dispatch-logistics').click();
  const response = await recipients;
  expect(response.status()).toBe(200);
  const { recipients: list } = await response.json();
  const dialog = page.getByRole('dialog', { name: 'Dispatch to Logistics' });
  const picker = dialog.getByLabel('Logistics printing coordinator');
  await expect(picker).toBeVisible();
  if (list.length) await expect(picker.locator('option')).toHaveCount(list.length);
  else await expect(dialog.getByText(/No active Logistics coordinator/).first()).toBeVisible();
  for (const recipient of list) expect(Object.keys(recipient).sort()).toEqual(['email', 'id', 'name']);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await page.request.get(apiUrl('/records/rma-logistics-dispatches'))).status()).toBe(200);
});

for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'ADMIN'] as const) {
  test(`${role} cannot use the TASS-only Logistics recipient lookup and has no Dispatch action`, async ({ page }) => {
    await login(page, role);
    expect((await page.request.get(apiUrl('/records/rma-logistics-recipients'))).status()).toBe(403);
    expect((await page.request.get(apiUrl('/users'))).status()).toBe(role === 'ADMIN' ? 200 : 403);
    if (role !== 'SALES_COORDINATOR') {
      await openScreen(page, 'rma', role);
      await expect(page.locator('#toolbar-tass-daily-route-slip')).toBeVisible();
      await expect(page.locator('#toolbar-dispatch-logistics')).toHaveCount(0);
    }
  });
}
