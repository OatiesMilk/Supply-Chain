import { test, expect, type Page, type Locator } from '@playwright/test';

// Synthetic API responses keep accessibility checks independent of live accounts,
// customer data and writes. Role authorization is covered by the real role suites.
async function fixture(page: Page, authenticated = true, role = 'ADMIN', includeRecord = false) {
  const writes: string[] = [];
  const record = { id: 'REC-A11Y', category: 'Deliveries', company_name: 'Example Company', company_id: 'a11y-company', reference: 'A11Y-REF', status: 'Scheduled', driver: '', account_manager: '', area: '', address: '', remarks: '', vehicle: '(None)', delivery_date: '2026-10-22', item_type: 'Small Item', item_description: 'Synthetic item', is_draft: 'No', line_items: [], priority: '2 - Moderate', attachments: [], created_by: 'Example Staff', modified_by: 'Example Staff', created_at: '2026-10-22T00:00:00Z', modified_at: '2026-10-22T00:00:00Z', driver_assistants: [], output_actions_log: [] };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${url.pathname}`);
      if (url.pathname === '/api/auth/login') return route.fulfill({ status: 401, json: { error: 'Email or password is incorrect. Please try again.' } });
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/api/auth/me' && !authenticated) return route.fulfill({ status: 401, json: { error: 'Not signed in' } });
    let body: unknown = [];
    if (url.pathname === '/api/auth/me') body = { id: 'a11y-user', name: 'Accessibility Tester', email: 'tester@example.test', role, permissions: [], permissionVersion: 'fixture', effectiveScreens: role === 'ADMIN' ? ['dashboard', 'deliveries', 'inventory', 'admin'] : ['dashboard', 'deliveries'], resources: ['dashboard', 'records', 'companies', 'skus', 'users', 'drivers'] };
    if (url.pathname === '/api/health') body = { ok: true };
    if (url.pathname === '/api/dev/can-reset') body = { enabled: false };
    if (url.pathname === '/api/records/active-counts') body = { deliveries: 0, rma: 0, sales_orders: 0, procurement_pickup: 0, accounting_collection: 0 };
    if (url.pathname === '/api/records') body = url.searchParams.has('paged') ? { rows: includeRecord ? [record] : [], total: includeRecord ? 1 : 0, page: 1, limit: 25, hasMore: false, nextCursor: null } : includeRecord ? [record] : [];
    if (url.pathname === '/api/companies') body = [{ id: 'a11y-company', name: 'Example Company' }];
    if (url.pathname === '/api/users') body = [{ id: 'other-user', name: 'Example Staff', email: 'staff@example.test', role: 'SALES_COORDINATOR', is_active: true, microsoft_linked: false }];
    if (url.pathname === '/api/skus') body = [{ id: 'a11y-sku', sku_code: 'A11Y-SKU', name: 'Keyboard test product', description: 'Synthetic product', category: 'A', unit_cost: 1, unit_price: 2, reorder_point: 0, inventory: { on_hand_qty: 1, allocated_qty: 0, atp: 1, warehouse_location: 'Test' } }];
    if (url.pathname === '/api/notifications') body = [{ id: 'a11y-notification', title: 'Review example delivery', message: 'Open the assigned example record.', record_id: 'REC-A11Y', record_type: 'DeliveryRecord', is_read: false, created_at: '2026-10-22T00:00:00Z' }];
    if (url.pathname === '/api/notifications/unread-count') body = { count: 1 };
    if (url.pathname === '/api/records/REC-A11Y') body = record;
    if (includeRecord && url.pathname === '/api/records/REC-A11Y/attachments') body = [{ id: 'a11y-file', name: 'example.pdf', mime_type: 'application/pdf', size: 100, uploaded_at: '2026-10-22T00:00:00Z', download_url: '/api/records/REC-A11Y/attachments/a11y-file/download' }];
    return route.fulfill({ json: body });
  });
  return writes;
}

async function touchTarget(control: Locator) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('UI-001 login labels focus their fields and authentication errors are announced', async ({ page }) => {
  await fixture(page, false);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with email instead' }).click();
  await page.locator('label').filter({ hasText: /^Email$/ }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await page.getByLabel('Email', { exact: true }).fill('tester@example.test');
  await page.locator('label').filter({ hasText: /^Password$/ }).click();
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.getByLabel('Password', { exact: true }).fill('incorrect-example');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await expect(page.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
});

for (const width of [320, 390, 1280]) {
  test(`UI-001 search contains focus, restores its trigger and fits ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page.goto('/inventory');
    const trigger = page.locator('#global-search-button');
    await touchTarget(trigger);
    await touchTarget(page.locator('#logout-button'));
    await touchTarget(page.locator('#notification-bell-button'));
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(/search/i);
    const search = dialog.getByLabel('Search records and products');
    await expect(search).toBeFocused();
    await search.fill('A11Y-SKU');
    await expect(dialog.getByText('Keyboard test product', { exact: true })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(search).toHaveAttribute('aria-activedescendant', /.+/);
    await testInfo.attach(`search-${width}px`, { body: await page.screenshot(), contentType: 'image/png' });
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(node => node.contains(document.activeElement)), `Tab ${i + 1} stays inside search`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await fitsViewport(page);
    await trigger.click();
    await dialog.getByLabel('Search records and products').fill('A11Y-SKU');
    await expect(dialog.getByText('Keyboard test product', { exact: true })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/inventory\?item=a11y-sku/);
    await expect(dialog).not.toBeVisible();
  });
}

test('UI-001 notifications are nonmodal, keyboard operable and return focus on Escape', async ({ page }) => {
  await fixture(page);
  await page.goto('/inventory');
  const trigger = page.locator('#notification-bell-button');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const panel = page.locator('#notification-panel');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute('aria-modal', 'true');
  await expect(panel.getByRole('button', { name: /Review example delivery.*Open linked record/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  // A nonmodal popup must allow focus outside it without trapping Tab.
  await page.locator('#logout-button').focus();
  await expect(page.locator('#logout-button')).toBeFocused();
  await trigger.click();
  if (!(await panel.isVisible())) await trigger.click();
  const link = panel.getByRole('button', { name: /Review example delivery.*Open linked record/ });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/deliveries\?item=REC-A11Y/);
});

test('UI-001 record validation connects errors, focuses a field and supports keyboard file selection', async ({ page }) => {
  const writes = await fixture(page, true, 'SALES_COORDINATOR');
  await page.goto('/deliveries');
  const create = page.getByRole('button', { name: 'Create Record', exact: true });
  await touchTarget(create);
  await create.click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Submit', exact: true }) });
  await touchTarget(form.getByRole('button', { name: 'Submit', exact: true }));
  await form.getByRole('button', { name: 'Submit', exact: true }).click();
  const company = form.getByRole('combobox', { name: /Company Name/ });
  await expect(company).toBeFocused();
  await expect(company).toHaveAttribute('aria-invalid', 'true');
  const errorId = await company.getAttribute('aria-describedby');
  expect(errorId).toBeTruthy();
  await expect(page.locator(`[id="${errorId}"]`)).toContainText(/company/i);
  await company.fill('Example');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(company).toHaveValue('Example Company');
  const picker = form.getByLabel(/Document Attachments/);
  await picker.focus();
  await expect(picker).toBeFocused();
  await page.bringToFront();
  const choosing = page.waitForEvent('filechooser', { timeout: 5000 });
  await picker.press('Space');
  const chooser = await choosing;
  await chooser.setFiles({ name: 'example.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n synthetic') });
  await expect(form.getByText('example.pdf', { exact: true })).toBeVisible();
  expect(writes.filter(write => write.includes('/records'))).toEqual([]);
});

test('UI-001 admin fields have clickable labels and destructive dialogs restore focus', async ({ page }) => {
  const writes = await fixture(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  for (const label of ['Full Name', 'Email', 'Password', 'Role']) {
    await page.locator('label').filter({ hasText: new RegExp(`^${label}$`) }).click();
    await expect(page.getByLabel(label, { exact: true })).toBeFocused();
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const remove = page.getByRole('button', { name: 'Delete Example Staff', exact: true });
  await touchTarget(remove);
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'Permanently delete Example Staff?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(remove).toBeFocused();
  expect(writes).toEqual([]);
});

test('UI-001 inventory filters and shell remain keyboard accessible at 200% text size', async ({ page }) => {
  await fixture(page);
  // Use the portal's persisted text-size control, not a CSS transform that
  // merely magnifies a screenshot without exercising layout/reflow.
  await page.addInitScript(() => localStorage.setItem('ui_store', JSON.stringify({ state: { zoomFactor: 200 }, version: 1 })));
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/inventory');
  await expect(page.getByLabel('Search inventory', { exact: true })).toBeVisible();
  for (const label of ['Category', 'Warehouse zone', 'Stock status']) {
    const control = page.getByLabel(label, { exact: true });
    await control.focus();
    await expect(control).toBeFocused();
  }
  await touchTarget(page.locator('#global-search-button'));
  await fitsViewport(page);
  await page.locator('#global-search-button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(640);
  await page.keyboard.press('Escape');
  await expect(page.locator('#global-search-button')).toBeFocused();
});

test('UI-001 workspace validation focuses required remarks and attachment removal supports Escape', async ({ page }) => {
  const writes = await fixture(page, true, 'SALES_COORDINATOR', true);
  await page.goto('/deliveries?item=REC-A11Y');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Reference (SAP)', { exact: true }).fill('A11Y-UPDATED');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  const remarks = page.locator('#overview-change-remarks');
  await expect(remarks).toBeFocused();
  await expect(remarks).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#overview-change-remarks-error')).toHaveAttribute('role', 'alert');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('tab', { name: /Documents/ }).click();
  await expect(page.getByLabel('Add documents', { exact: true })).toBeVisible();
  const remove = page.getByRole('button', { name: 'Remove example.pdf', exact: true });
  await touchTarget(remove);
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'Remove Attachment', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(remove).toBeFocused();
  expect(writes).toEqual([]);
});


test('UI-001 keyboard skip link bypasses repeated navigation and focuses main content', async ({ page }) => {
  await fixture(page);
  await page.goto('/dashboard');
  const main = page.locator('#main-routed-view');
  await expect(main).toBeVisible();
  const skip = page.getByRole('link', { name: 'Skip to main content', exact: true });
  await expect(skip).toHaveAttribute('href', '#main-routed-view');
  // The bypass link is the first keyboard stop and only becomes visible on focus.
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveCSS('position', 'fixed');
  await page.keyboard.press('Enter');
  await expect(main).toBeFocused();
});
