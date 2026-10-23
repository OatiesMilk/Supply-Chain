import { test, expect, type Locator, type Page } from '@playwright/test';
import { uiFixture } from '../helpers/ui-fixture';

async function target(control: Locator) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const width of [320, 390, 1280]) {
  test(`UI-005 shell, dashboard and record form remain consistent at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes } = await uiFixture(page);
    await page.goto('/dashboard');
    await expect(page.locator('#dashboard-kpis button')).toHaveCount(4);
    await target(page.locator('#global-search-button'));
    await target(page.locator('#logout-button'));
    await target(page.locator('#notification-bell-button'));
    const refresh = page.getByRole('button', { name: 'Refresh dashboard', exact: true });
    await target(refresh);
    await refresh.focus();
    await expect(refresh).toBeFocused();
    expect(await refresh.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none');
    await noHorizontalOverflow(page);
    await testInfo.attach(`dashboard-${width}px`, { body: await page.screenshot(), contentType: 'image/png' });

    const card = page.locator('#dashboard-kpis button').first();
    await card.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('1 total', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await expect(dialog.locator('.mg-badge').filter({ hasText: 'Scheduled' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(card).toBeFocused();

    await page.goto('/deliveries');
    await page.getByRole('button', { name: 'Create Record', exact: true }).click();
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Submit', exact: true }) });
    await target(form.getByRole('button', { name: 'Submit', exact: true }));
    await target(form.getByRole('button', { name: 'Save as Draft', exact: true }));
    await noHorizontalOverflow(page);
    await testInfo.attach(`record-form-${width}px`, { body: await page.screenshot(), contentType: 'image/png' });
    await form.getByRole('button', { name: 'Submit', exact: true }).click();
    const invalid = form.locator('[aria-invalid="true"]').first();
    await expect(invalid).toBeFocused();
    const description = await invalid.getAttribute('aria-describedby');
    expect(description).toBeTruthy();
    const errors = description!.split(/\s+/).map(id => page.locator(`[id="${id}"]`));
    expect((await Promise.all(errors.map(error => error.innerText()))).join(' ')).toMatch(/required/i);
    expect(await invalid.evaluate(node => (node.getAttribute('aria-describedby') || '').split(/\s+/).some(id => document.getElementById(id)?.getAttribute('role') === 'alert'))).toBe(true);
    expect(writes).toEqual([]);
  });
}

test('UI-005 reduced motion and enlarged text keep core controls usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.addInitScript(() => localStorage.setItem('ui_store', JSON.stringify({ state: { zoomFactor: 200 }, version: 1 })));
  await uiFixture(page);
  await page.goto('/dashboard');
  const refresh = page.getByRole('button', { name: 'Refresh dashboard', exact: true });
  await target(refresh);
  expect(await refresh.evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
  await target(page.locator('#global-search-button'));
  await noHorizontalOverflow(page);
});

test('UI-005 dashboard error state preserves recovery and previously loaded data', async ({ page }) => {
  await uiFixture(page);
  await page.goto('/dashboard');
  await expect(page.locator('#dashboard-kpis button')).toHaveCount(4);
  await page.route('**/api/dashboard/overview*', route => route.fulfill({ status: 503, json: { error: 'Example unavailable' } }));
  await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Dashboard is stale' })).toBeVisible();
  await expect(page.locator('#dashboard-kpis button')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Refresh dashboard', exact: true })).toBeEnabled();
});

test('UI-005 shared destructive dialog keeps pending, error, Escape and focus behavior', async ({ page }, testInfo) => {
  await uiFixture(page, 'ADMIN');
  let fail: (() => Promise<void>) | undefined;
  await page.route('**/api/dev/reset-seed', route => {
    // Never forward the reset request to a live API. Keep the fixture pending
    // so the existing protection against repeat confirmation is exercised.
    return new Promise<void>(resolve => {
      fail = async () => { await route.fulfill({ status: 503, json: { error: 'Example reset failed. Please try again.' } }); resolve(); };
    });
  });
  await page.goto('/deliveries');
  const trigger = page.locator('#reset-demo-data-button');
  await target(trigger);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Reset demo data?', exact: true });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Reset all data', exact: true });
  await target(confirm);
  await expect(confirm).toHaveCSS('background-color', 'rgb(185, 28, 28)');
  await testInfo.attach('destructive-dialog', { body: await dialog.screenshot(), contentType: 'image/png' });
  await confirm.click();
  await expect.poll(() => Boolean(fail)).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Working...' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await fail!();
  await expect(dialog.getByRole('alert')).toContainText('Example reset failed');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});


test('UI-005 shell includes an accessible skip link to the main task content', async ({ page }) => {
  await uiFixture(page);
  await page.goto('/dashboard');
  await expect(page.locator('#main-routed-view')).toBeVisible();
  const skip = page.getByRole('link', { name: 'Skip to main content', exact: true });
  await expect(skip).toHaveAttribute('href', '#main-routed-view');
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveCSS('position', 'fixed');
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-routed-view')).toBeFocused();
});
