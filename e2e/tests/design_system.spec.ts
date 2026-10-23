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

async function fontSize(control: Locator, pixels: number) {
  await expect(control).toBeVisible();
  expect(await control.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(pixels, 1);
}

const readableScreens = ['dashboard', 'deliveries', 'accounting_collection', 'procurement_pickup', 'am_directory', 'inventory'];
for (const { width, height } of [{ width: 320, height: 900 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 844, height: 390 }]) {
  test(`GH-210 readable sidebar, editable controls and filters at ${width}x${height} with 200% text`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem('ui_store', JSON.stringify({ state: { zoomFactor: 200 }, version: 1 })));
    const { writes } = await uiFixture(page, 'SALES_COORDINATOR', { screens: readableScreens, accountManager: 'Example Account Manager' });
    await page.goto('/deliveries');
    const sidebar = page.locator('#sidebar-panel');
    if (width < 1024) await page.locator('#mobile-sidebar-toggle').click();
    const accounting = sidebar.getByRole('button', { name: /^Accounting Collection/ });
    await accounting.scrollIntoViewIfNeeded();
    await fontSize(accounting.locator('span').filter({ hasText: /^Accounting Collection$/ }).last(), 28);
    expect(await page.locator('#sidebar-nav').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    if (width < 1024) expect(await sidebar.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await accounting.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await testInfo.attach(`sidebar-${width}x${height}-200pct`, { body: await page.screenshot(), contentType: 'image/png' });
    if (width < 1024) {
      await target(page.locator('#close-sidebar-button'));
      await page.locator('#close-sidebar-button').click();
      await expect(sidebar).toHaveAttribute('inert', '');
    } else {
      const toggle = page.locator('#desktop-sidebar-toggle');
      await target(toggle);
      await toggle.click();
      await expect(sidebar).toHaveCSS('width', '72px');
      const deliveries = sidebar.getByRole('button', { name: /^Deliveries/ });
      await deliveries.focus();
      await target(deliveries);
      await expect(page.getByRole('tooltip')).toContainText('Deliveries');
      await toggle.click();
    }
    await page.getByRole('button', { name: 'Create Record', exact: true }).click();
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Submit', exact: true }) });
    await fontSize(form.locator('input.mg-control').first(), 32);
    await fontSize(form.locator('select.mg-control').first(), 32);
    await fontSize(form.locator('textarea.mg-control').first(), 32);
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: /^Advanced filters/ }).click();
    const panel = page.getByRole('dialog', { name: 'Advanced Filters', exact: true });
    const manager = panel.getByRole('combobox', { name: 'Account Manager', exact: true });
    await manager.scrollIntoViewIfNeeded();
    await fontSize(manager, 32);
    await manager.focus();
    await page.keyboard.press('ArrowDown');
    const option = page.getByRole('option', { name: 'Example Account Manager', exact: true });
    await fontSize(option, 28);
    await page.keyboard.press('Enter');
    await expect(manager).toHaveValue('Example Account Manager');
    await testInfo.attach(`filters-${width}x${height}-200pct`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
    await noHorizontalOverflow(page);
    expect(writes).toEqual([]);
  });
}

test('GH-210 touched controls retain 44px targets at 90% text and filters retain keyboard selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('ui_store', JSON.stringify({ state: { zoomFactor: 90 }, version: 1 })));
  await uiFixture(page, 'SALES_COORDINATOR', { accountManager: 'Example Account Manager' });
  await page.goto('/deliveries');
  await page.locator('#mobile-sidebar-toggle').click();
  await target(page.locator('#close-sidebar-button'));
  await page.locator('#close-sidebar-button').click();
  const trigger = page.getByRole('button', { name: /^Advanced filters/ });
  await target(trigger);
  await trigger.click();
  const panel = page.getByRole('dialog', { name: 'Advanced Filters', exact: true });
  await target(panel.getByRole('button', { name: 'Close advanced filters', exact: true }));
  await target(panel.getByRole('button', { name: 'Done', exact: true }));
  const manager = panel.getByRole('combobox', { name: 'Account Manager', exact: true });
  await target(manager);
  await manager.focus();
  await page.keyboard.press('ArrowDown');
  await target(page.getByRole('option', { name: 'Example Account Manager', exact: true }));
  await page.keyboard.press('Enter');
  await target(panel.getByRole('button', { name: 'Clear Account Manager', exact: true }));
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.goto('/deliveries?item=REC-UI005');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await target(page.getByRole('button', { name: 'Save Changes', exact: true }));
});

test('GH-210 workspace Save and staged POD names reflow at 320px and 200% text without a write', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addInitScript(() => localStorage.setItem('ui_store', JSON.stringify({ state: { zoomFactor: 200 }, version: 1 })));
  const { writes } = await uiFixture(page, 'LOGISTICS');
  await page.goto('/deliveries?item=REC-UI005');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const save = page.getByRole('button', { name: 'Save Changes', exact: true });
  await save.scrollIntoViewIfNeeded();
  expect(await save.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await testInfo.attach('workspace-save-320px-200pct', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('tab', { name: /Dispatch & Logistics/ }).click();
  const picker = page.getByRole('button', { name: 'Select Photo / Document', exact: true });
  await picker.scrollIntoViewIfNeeded();
  await target(picker);
  const choosing = page.waitForEvent('filechooser');
  await picker.press('Space');
  const chooser = await choosing;
  const name = 'example-proof-of-delivery-with-an-intentionally-long-filename-for-mobile-reflow.pdf';
  await chooser.setFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n synthetic') });
  const filename = page.getByText(name, { exact: true });
  await fontSize(filename, 28);
  expect(await filename.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await testInfo.attach('staged-pod-320px-200pct', { body: await page.screenshot(), contentType: 'image/png' });
  await target(page.getByRole('button', { name: `Remove staged file ${name}`, exact: true }));
  await page.getByRole('button', { name: `Remove staged file ${name}`, exact: true }).click();
  await expect(filename).not.toBeVisible();
  await noHorizontalOverflow(page);
  expect(writes).toEqual([]);
});
