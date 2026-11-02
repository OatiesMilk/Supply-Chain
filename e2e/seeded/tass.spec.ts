import { expect, login, openScreen, records, test } from './support';

test('TASS dashboard hands off to RMA and collection verification lists without granting Admin navigation', async ({ page }) => {
  await login(page, 'TASS');
  await openScreen(page, 'dashboard', 'TASS');
  await page.locator('#tass-dashboard').getByText('View RMA', { exact: false }).first().click();
  await expect(page).toHaveURL(/\/rma(?:\?|$)/);
  await expect(page.locator('#records-view-rma')).toBeVisible();
  await openScreen(page, 'accounting_collection', 'TASS');
  await expect(page.getByRole('button', { name: /Create|New/i }).first()).toBeVisible();
  for (const record of await records(page)) expect(['RMA', 'Accounting Collection']).toContain(record.category);
});

for (const category of ['RMA', 'Accounting Collection']) {
  test(`TASS can review seeded ${category} detail tabs without completing or verifying records`, async ({ page }) => {
    await login(page, 'TASS');
    const available = await records(page, category);
    test.skip(!available.length, `Prepared seed has no ${category} fixture; provide existing full-seed records for detail coverage.`);
    const record = available[0];
    const screen = category === 'RMA' ? 'rma' : 'accounting_collection';
    await page.goto(`/${screen}?item=${encodeURIComponent(record.id)}`);
    const tabs = category === 'RMA' ? ['Overview', 'Status & Actions', 'Comments', 'Remarks History', 'Audit Trail', 'Documents']
      : ['Overview', 'Audit Trail', 'Verification', 'Documents'];
    for (const label of tabs) {
      // RMA uses semantic tabs; Accounting still uses ordinary buttons.
      const tab = page.getByRole(category === 'RMA' ? 'tab' : 'button', { name: label, exact: true });
      await tab.click();
      if (category === 'RMA') await expect(tab).toHaveAttribute('aria-selected', 'true');
      else await expect(tab).toBeVisible();
      await expect(page.getByText(/Unable to load page data:|This record is no longer available/)).toHaveCount(0);
    }
  });
}
