import { apiUrl, expect, login, openScreen, records, test } from './support';

test('TASS dashboard hands off to RMA lists and TASS has no Accounting Collection module', async ({ page }) => {
  const session = await login(page, 'TASS');
  expect(session.effectiveScreens).not.toContain('accounting_collection');
  await openScreen(page, 'dashboard', 'TASS');
  const dashboard = page.locator('#tass-dashboard');
  await expect(dashboard.getByText(/Collections to verify|Pick-ups pending/)).toHaveCount(0);
  await dashboard.getByRole('button', { name: /^View all \d+ open RMA records$/ }).click();
  await expect(page).toHaveURL(/\/rma(?:\?|$)/);
  await expect(page.locator('#records-view-rma')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accounting Collection', exact: true })).toHaveCount(0);
  // The router refuses the screen and the API never returns collection records.
  await page.goto('/accounting_collection');
  await expect(page).not.toHaveURL(/\/accounting_collection(?:\?|$)/);
  await expect(page.locator('#accounting-collection-view')).toHaveCount(0);
  for (const record of await records(page)) expect(record.category).toBe('RMA');
  const collectionList = await page.request.get(apiUrl(`/records?category=${encodeURIComponent('Accounting Collection')}`));
  if (collectionList.ok()) {
    const body = await collectionList.json();
    expect(Array.isArray(body) ? body : body.rows).toEqual([]);
  } else expect(collectionList.status()).toBe(403);
});

test('TASS cannot read or verify an Accounting Collection record by id', async ({ page }) => {
  await login(page, 'LOGISTICS');
  const collections = await records(page, 'Accounting Collection');
  test.skip(!collections.length, 'Prepared seed has no Accounting Collection fixture.');
  const id = collections[0].id;
  await login(page, 'TASS');
  expect((await page.request.get(apiUrl(`/records/${encodeURIComponent(id)}`))).status()).toBe(403);
  // Send a valid CSRF token so the 403 comes from the role/module rule, not request forgery protection.
  const me = await page.request.get(apiUrl('/auth/me'));
  const headers = { 'X-CSRF-Token': me.headers()['x-csrf-token'] ?? '' };
  expect((await page.request.patch(apiUrl(`/records/${encodeURIComponent(id)}/verify-collection`), { headers, data: {} })).status()).toBe(403);
});

test('TASS can review seeded RMA detail tabs without completing records', async ({ page }) => {
  await login(page, 'TASS');
  const available = await records(page, 'RMA');
  test.skip(!available.length, 'Prepared seed has no RMA fixture; provide existing full-seed records for detail coverage.');
  const record = available[0];
  await page.goto(`/rma?item=${encodeURIComponent(record.id)}`);
  for (const label of ['Overview', 'Status & Actions', 'Comments', 'Remarks History', 'Audit Trail', 'Documents']) {
    const tab = page.getByRole('tab', { name: label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/Unable to load page data:|This record is no longer available/)).toHaveCount(0);
  }
});
