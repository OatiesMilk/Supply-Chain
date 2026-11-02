import { accounts, accountFor, apiUrl, expect, login, logout, openScreen, records, test, uiLogin } from './support';

for (const account of accounts) {
  test(`${account.role}: every granted seeded screen renders after reload`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.name));
    const session = await login(page, account.role);
    for (const screen of session.effectiveScreens) {
      await test.step(screen, () => openScreen(page, screen, account.role));
    }
    expect(runtimeErrors, 'Granted screens must not throw browser runtime errors').toEqual([]);
  });

  test(`${account.role}: denied navigation and protected read endpoints stay denied`, async ({ page }) => {
    const session = await login(page, account.role);
    const forbidden = account.role === 'ADMIN' ? 'driver_dashboard' : 'admin';
    expect(session.effectiveScreens).not.toContain(forbidden);
    await page.goto(`/${forbidden}`);
    await expect(page).not.toHaveURL(new RegExp(`/${forbidden}(?:[?]|$)`));
    await expect(page.locator('#admin-panel')).toHaveCount(0);
    if (account.role !== 'ADMIN') {
      for (const path of ['/users', '/admin/audit-log', '/admin/integration-status']) {
        const response = await page.request.get(apiUrl(path));
        expect(response.status(), `${account.role} cannot read ${path}`).toBe(403);
      }
      await expect(page.locator('#sidebar-nav').getByRole('button', { name: 'Admin Panel', exact: true })).toHaveCount(0);
    }
    if (account.role === 'DRIVER') {
      const me = await page.request.get(apiUrl('/auth/me'));
      const profile = (await me.json()).driverProfileId;
      expect(profile, 'The canonical Driver fixture must own an active linked Driver profile').toBeTruthy();
      for (const record of await records(page)) {
        expect(record.is_draft).not.toBe('Yes');
        expect(record.driver_id).toBe(profile);
      }
    }
  });
}

test('Admin logout followed by Driver and TASS email login isolates account data and permissions', async ({ page }) => {
  await login(page, 'ADMIN');
  await openScreen(page, 'admin', 'ADMIN');
  await logout(page, 'ADMIN');
  await uiLogin(page, 'DRIVER');
  const driverSessionResponse = await page.request.get(apiUrl('/auth/me'));
  expect(driverSessionResponse.status()).toBe(200);
  const driverSession = await driverSessionResponse.json();
  expect(driverSession).toMatchObject({ role: 'DRIVER', email: accountFor('DRIVER').email });
  await expect(page.getByRole('heading', { name: driverSession.name, exact: true })).toBeVisible();
  await expect(page.locator('#admin-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create User', exact: true })).toHaveCount(0);
  await logout(page, 'DRIVER');
  await uiLogin(page, 'TASS');
  await openScreen(page, 'dashboard', 'TASS');
  await expect(page.locator('#sidebar-nav').getByRole('button', { name: 'Admin Panel', exact: true })).toHaveCount(0);
  await logout(page, 'TASS');
});
