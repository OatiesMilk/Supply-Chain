/**
 * logistics.spec.ts
 *
 * UAT Part B — Logistics role E2E tests.
 * Covers: login, access control, driver assignment, status updates,
 *         driver board, documents/POD upload, statistical reports.
 *
 * Test IDs match the UAT_PLAN.md document (B-1.x, B-2.x, B-3.x, B-4.x, B-5.x).
 */
import { test, expect, Page, type Browser } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { recordRows } from '../support/recordRows';

const BASE_URL = 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openFirstRecord(page: Page, status?: string) {
  await page.goto(`${BASE_URL}/deliveries`);
  await page.waitForLoadState('networkidle');
  if (status) await page.getByRole('button', { name: status, exact: true }).click();
  const firstRow = recordRows(page).first();
  await firstRow.waitFor({ state: 'visible', timeout: 10_000 });
  await firstRow.click();
  await page.waitForTimeout(800);
}

// Each mutating test owns its fixture; leave assigned Driver demo runs untouched.
// These records live in the disposable CI database (record deletion is disabled).
async function openNewScheduledRecord(page: Page, browser: Browser) {
  const sales = await browser.newContext({ storageState: './helpers/auth-sc.json' });
  let recordId: string;
  try {
    const session = await sales.request.get(`${BASE_URL}/api/v1/auth/me`);
    expect(session.ok()).toBeTruthy();
    const csrf = session.headers()['x-csrf-token'];
    expect(csrf).toBeTruthy();
    const companiesResponse = await sales.request.get(`${BASE_URL}/api/v1/companies`);
    expect(companiesResponse.ok()).toBeTruthy();
    const companies = await companiesResponse.json();
    expect(companies.length).toBeGreaterThan(0);
    // Records only accept an active Account Manager from the directory.
    const managersResponse = await sales.request.get(`${BASE_URL}/api/v1/account-managers?active=true`);
    expect(managersResponse.ok()).toBeTruthy();
    const managers: Array<{ name: string }> = await managersResponse.json();
    expect(managers.length, 'CI database must seed an active Account Manager').toBeGreaterThan(0);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const response = await sales.request.post(`${BASE_URL}/api/v1/records`, {
      headers: { 'X-CSRF-Token': csrf },
      data: {
        company_id: companies[0].id, category: 'Deliveries',
        reference: `UAT-LOG-${randomUUID()}`, delivery_date: today,
        status: 'Scheduled', is_draft: 'No', priority: '2 - Moderate',
        area: 'Makati', account_manager: managers[0].name,
      },
    });
    expect(response.status(), 'Sales Coordinator must create the test fixture').toBe(201);
    const saved = await response.json();
    expect(saved.status).toBe('Scheduled');
    expect(saved.id).toBeTruthy();
    recordId = saved.id;
  } finally {
    await sales.close();
  }
  await page.goto(`${BASE_URL}/deliveries`);
  await page.getByRole('textbox', { name: 'Search delivery records' }).fill(recordId);
  await page.getByRole('row').filter({
    has: page.getByRole('cell', { name: recordId, exact: true }),
  }).click();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('B-1 Login & Access Control', () => {
  test('B-1.1 Logistics sidebar has extended screens', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    const nav = page.getByRole('navigation');
    // Driver View, Board and Manager share one sidebar item and open as tabs.
    const drivers = nav.getByRole('button', { name: 'Drivers', exact: true });
    await expect(drivers).toBeVisible();
    await expect(nav.getByText(/calendar/i)).toBeVisible();

    await drivers.click();
    const tabs = page.getByRole('navigation', { name: 'Driver sections' });
    for (const tab of ['View', 'Board', 'Manager']) {
      await expect(tabs.getByRole('button', { name: tab, exact: true })).toBeVisible();
    }
  });

  test('B-1.2 RMA module is labelled "RMA" for Logistics', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('navigation').getByText('RMA', { exact: true })).toBeVisible();
  });

  test('B-1.3 Admin Panel NOT visible for Logistics', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('navigation').getByText('Admin', { exact: true })).not.toBeVisible();
  });

  test('B-1.4 RMA records are read-only for Logistics', async ({ page }) => {
    await page.goto(`${BASE_URL}/rma`);
    await page.waitForLoadState('networkidle');
    // Attempt to click new record — button should be absent OR blocked
    const newBtn = page.getByRole('button', { name: /new record|add record|\+ new/i }).first();
    // Either the button doesn't exist, or clicking it shows an error
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(page.getByText(/view.only|logistics.*rma|read.only/i)).toBeVisible({ timeout: 5_000 });
    }
  });

  test('B-1.5 Collapsed sidebar rail supports keyboard access, persistence, and the mobile drawer', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('#sidebar-panel');
    const mainContent = page.locator('#main-content-area');
    const toggle = page.locator('#desktop-sidebar-toggle');
    if (await sidebar.evaluate(element => getComputedStyle(element).width) === '72px') {
      await page.getByRole('button', { name: 'Expand menu' }).click();
    }
    await expect(sidebar).toHaveCSS('width', '224px');
    await expect(toggle).toHaveAttribute('aria-label', 'Collapse menu');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAttribute('aria-controls', 'sidebar-panel');
    const expandedToggleBox = await toggle.boundingBox();
    const expandedMainLeft = (await mainContent.boundingBox())?.x ?? 0;

    await toggle.click();
    await expect(sidebar).toHaveCSS('width', '72px');
    await expect(toggle).toHaveAttribute('aria-label', 'Expand menu');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const collapsedToggleBox = await toggle.boundingBox();
    expect(Math.abs((expandedToggleBox?.y ?? 0) - (collapsedToggleBox?.y ?? 0))).toBeLessThanOrEqual(1);
    const collapsedMainLeft = (await mainContent.boundingBox())?.x ?? 0;
    expect(expandedMainLeft - collapsedMainLeft).toBe(152);
    await expect(page.locator('#sidebar-nav hr')).toHaveCount(2);

    const activeDashboard = page.getByRole('navigation').getByRole('button', { name: 'Dashboard' });
    const activeAccent = await activeDashboard.evaluate(element => getComputedStyle(element, '::before').backgroundColor);
    expect(activeAccent).toBe('rgb(0, 120, 193)');

    const deliveries = page.getByRole('navigation').getByRole('button', { name: /^Deliveries/ });
    const deliveriesBox = await deliveries.boundingBox();
    expect(deliveriesBox?.width).toBe(44);
    expect(deliveriesBox?.height).toBe(44);
    await deliveries.focus();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText('Deliveries');
    expect((await tooltip.boundingBox())?.x).toBeGreaterThan(72);

    await page.keyboard.press('Control+b');
    await expect(sidebar).toHaveCSS('width', '224px');
    await toggle.click();
    await expect(sidebar).toHaveCSS('width', '72px');

    await page.locator('#global-search-button').click();
    const searchInput = page.getByPlaceholder(/Search records, companies, drivers, SKUs/);
    await expect(searchInput).toBeFocused();
    await page.keyboard.press('Control+b');
    await expect(sidebar).toHaveCSS('width', '72px');
    await page.keyboard.press('Escape');
    await expect(searchInput).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(sidebar).toHaveCSS('width', '72px');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('#mobile-sidebar-toggle').click();
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveCSS('width', '256px');
    await expect(page.getByRole('navigation').getByText('Deliveries', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Microgenesis' })).toBeVisible();

    // The shortcut is desktop-only and must not silently change persisted state on mobile.
    await page.keyboard.press('Control+b');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(sidebar).toHaveCSS('width', '72px');
  });
});

test.describe('TSK-126 dashboard card filters', () => {
  test('Logistics unassigned card opens the matching Delivery list', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    const card = page.locator('#kpi-log-unassigned');
    await expect(card).toBeVisible();
    const cardCount = Number((await card.locator('h3').innerText()).trim());
    await card.click();

    await expect(page.getByText('Showing: No Driver Assigned (from Dashboard)', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear dashboard filter: No Driver Assigned' })).toBeVisible();
    const recordsInfo = page.getByTestId('pagination-records-info');
    await expect(recordsInfo).toContainText(/of\s+\d+\s+records/i);
    await expect.poll(async () =>
      Number((await recordsInfo.innerText()).match(/of\s+(\d+)\s+records/i)?.[1])
    ).toBe(cardCount);
  });
});

test.describe('B-2 Dispatch & Assign Driver', () => {
  test('B-2.0a Logistics cannot create Delivery records', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /new record/i })).toHaveCount(0);
  });

  test('B-2.0 Delivery dates support reverse dragging, keyboard selection and cancellation', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');

    const trigger = page.getByRole('button', { name: /^Delivery dates / });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Select delivery dates' });
    await dialog.getByLabel('Calendar year').selectOption('2026');
    await dialog.getByLabel('Calendar month').selectOption('9');
    const start = dialog.locator('[data-calendar-day="2026-10-20"]');
    const end = dialog.locator('[data-calendar-day="2026-10-14"]');
    const startBox = (await start.boundingBox())!;
    const endBox = (await end.boundingBox())!;
    await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(dialog.locator('[aria-live="polite"]')).toHaveText('14 Oct 2026 – 20 Oct 2026');
    await expect(trigger).toContainText('All delivery dates');
    await dialog.getByRole('button', { name: 'Apply dates', exact: true }).click();
    await expect(trigger).toContainText('14 Oct 2026 – 20 Oct 2026');
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole('button', { name: 'Today', exact: true }).click();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(trigger).toContainText('14 Oct 2026 – 20 Oct 2026');

    await trigger.click();
    await dialog.locator('[data-calendar-day="2026-10-14"]').click();
    await dialog.locator('[data-calendar-day="2026-10-14"]').press('ArrowRight');
    await expect(dialog.locator('[data-calendar-day="2026-10-15"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Apply dates', exact: true }).click();
    await expect(trigger).toContainText('14 Oct 2026 – 15 Oct 2026');
    await trigger.click();
    await dialog.getByRole('button', { name: 'Clear dates', exact: true }).click();
    await expect(trigger).toContainText('All delivery dates');
  });

  test('B-2.1 Status & Actions tab is visible', async ({ page }) => {
    await openFirstRecord(page);
    await expect(page.getByRole('tab', { name: 'Status & Actions', exact: true })).toBeVisible();
  });

  test('B-2.3 Driver assignment blocked without remarks', async ({ page }) => {
    await openFirstRecord(page, 'Scheduled');
    const dispatchTab = page.getByRole('tab', { name: 'Status & Actions', exact: true });
    await dispatchTab.click();
    await page.waitForTimeout(500);

    const driverSelect = page.locator('select').filter({ has: page.locator('option', { hasText: '-- Unassigned --' }) });
    await expect(driverSelect).toBeEnabled();
    const current = await driverSelect.inputValue();
    const values = await driverSelect.locator('option').evaluateAll(options =>
      options.map(option => (option as HTMLOptionElement).value));
    const replacement = values.find(value => value !== current);
    expect(replacement, 'The UAT fixture must offer an alternative Driver assignment').toBeDefined();
    await driverSelect.selectOption(replacement!);

    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(page.getByText('A reason is required when making changes to dispatch or status fields.', { exact: true })).toBeVisible();
    await expect(driverSelect).toHaveValue(replacement!);
  });

  test('B-2.5 Status change works with remarks', async ({ page, browser }) => {
    await openNewScheduledRecord(page, browser);
    const dispatchTab = page.getByRole('tab', { name: 'Status & Actions', exact: true });
    await dispatchTab.click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: 'On-Hold', exact: true }).click();
    await page.getByPlaceholder(/Reason for the changes|Optional note/i).fill('UAT automated status change');
    const updatedResponse = page.waitForResponse(response =>
      /\/api\/v1\/records\/[^/]+\/status$/.test(new URL(response.url()).pathname) && response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    const response = await updatedResponse;
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).status).toBe('On-Hold');
    await expect(page.getByText(/changes saved/i).first()).toBeVisible();
  });

  test('B-2.5a TSK-123 Rescheduled requires a new delivery date saved with the status', async ({ page, browser }) => {
    await openNewScheduledRecord(page, browser);
    await page.getByRole('tab', { name: 'Status & Actions', exact: true }).click();

    const reschedule = page.getByRole('button', { name: 'Rescheduled', exact: true });
    await expect(reschedule).toBeVisible();
    await expect(reschedule).toHaveAttribute('aria-pressed', 'false');

    const dateField = page.getByLabel(/new delivery date/i);
    await expect(dateField).toHaveCount(0);
    await reschedule.click();
    await expect(dateField).toBeVisible();

    const save = page.getByRole('button', { name: /save changes/i });
    await page.getByPlaceholder(/Reason for the changes|Optional note/i).fill('TSK-123 automated reschedule');
    await expect(save).toBeDisabled();

    const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const future = new Date(`${manilaToday}T00:00:00Z`);
    future.setUTCDate(future.getUTCDate() + 14);
    const newDate = future.toISOString().slice(0, 10);

    await dateField.fill('2000-01-01');
    await expect(save).toBeDisabled();
    await dateField.fill(newDate);
    await expect(save).toBeEnabled();

    // Another status removes the date field again.
    await page.getByRole('button', { name: 'On-Hold', exact: true }).click();
    await expect(dateField).toHaveCount(0);
    await reschedule.click();
    await dateField.fill(newDate);
    await save.click();
    await expect(page.getByText(/changes saved/i).first()).toBeVisible({ timeout: 8_000 });
    await page.getByRole('tab', { name: /overview|general/i }).click();
    await expect(page.getByText(newDate).first()).toBeVisible();
  });

  test('B-2.5b TSK-124 Priority is locked on Delivered records, including in bulk edit', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');
    const delivered = page.getByRole('row').filter({ hasText: 'REC-UAT-DELIVERED-' }).first();
    await expect(delivered, 'The UAT seed must provide its completed delivery fixture').toBeVisible();

    // Bulk: a Delivered-only selection disables the Priority select with the explanation.
    await delivered.getByRole('checkbox').check();
    await expect(page.locator('#bulk-priority-select')).toBeDisabled();
    await expect(page.locator('#bulk-action-bar')).toContainText('Priority is locked after delivery.');
    await delivered.getByRole('checkbox').uncheck();

    // Overview: Priority is plain text with the note, even while editing; Area/Address stay editable.
    await delivered.click();
    await expect(page.getByText('Priority is locked after delivery.')).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('select').filter({ has: page.locator('option[value="3 - High"]') })).toHaveCount(0);
    await expect(page.getByText('Priority is locked after delivery.')).toBeVisible();
  });

  test('B-2.5c TSK-125 Logistics has no Return to Draft action', async ({ page }) => {
    await openFirstRecord(page);
    await expect(page.getByRole('button', { name: 'Return to Draft', exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Status & Actions', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Return to Draft', exact: true })).toHaveCount(0);
  });

  test('B-2.6 Saving without changes shows feedback', async ({ page }) => {
    await openFirstRecord(page);
    const dispatchTab = page.getByRole('tab', { name: 'Status & Actions', exact: true });
    await dispatchTab.click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(page.getByText('No changes detected to save.', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('B-2.7 Active Deliveries sidebar uses the existing discard guard for unsaved driver changes', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Scheduled', exact: true }).click();

    const firstRow = recordRows(page).first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await page.getByRole('tab', { name: 'Status & Actions', exact: true }).click();

    const driverSelect = page.locator('select').filter({ hasText: /-- Unassigned --/i }).first();
    await expect(driverSelect).toBeEnabled();
    const currentDriver = await driverSelect.inputValue();
    const optionValues = await driverSelect.locator('option').evaluateAll(options =>
      options.map(option => (option as HTMLOptionElement).value)
    );
    const replacementDriver = currentDriver
      ? ''
      : optionValues.find(value => value !== '');
    test.skip(!currentDriver && !replacementDriver, 'No alternative driver option is available in the test data.');
    await driverSelect.selectOption(replacementDriver ?? '');

    const deliveriesLink = page.getByRole('navigation').getByRole('button', { name: /deliveries/i });
    await deliveriesLink.click();
    const discardDialog = page.getByRole('dialog', { name: 'Discard unfinished changes?' });
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.locator('[id^="delivery-record-workspace-"]')).toBeVisible();

    await deliveriesLink.click();
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole('button', { name: 'Discard and leave' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.locator('[id^="delivery-record-workspace-"]')).toHaveCount(0);
  });

  test('B-2.8 Active Accounting Collection sidebar returns to the list and guards unsaved edits', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole('navigation').getByRole('button', { name: /accounting collection/i }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Scheduled', exact: true }).click();

    const firstRow = recordRows(page).first();
    await expect(firstRow).toBeVisible();
    const recordId = (await firstRow.getByRole('cell').first().innerText()).trim();
    expect(recordId).toMatch(/^REC-[\w-]+$/);
    const search = page.getByRole('textbox', { name: 'Search accounting collection records' });
    await search.fill(recordId);
    const filteredRow = recordRows(page).filter({ hasText: recordId }).first();
    await expect(filteredRow).toBeVisible();
    await filteredRow.click();
    await expect(page.locator('#accounting-collection-workspace')).toBeVisible();
    await page.locator('#accounting-change-remarks').fill('Unsubmitted navigation guard check');

    const accountingLink = page.getByRole('navigation').getByRole('button', { name: /accounting collection/i });
    await accountingLink.click();
    const discardDialog = page.getByRole('dialog', { name: 'Discard unfinished changes?' });
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole('button', { name: 'Discard and leave' }).click();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search accounting collection records' })).toHaveValue(recordId);
    await expect(page.getByRole('button', { name: 'Scheduled', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('row').filter({ hasText: recordId }).first()).toBeVisible();
  });

  test('B-2.9 Active sidebar navigation returns to category lists without changing module behavior', async ({ page }) => {
    const modules = [
      { path: 'rma', sidebarName: /RMA/i },
      { path: 'procurement_pickup', sidebarName: /Procurement Pick-up/i },
      { path: 'sales_orders', sidebarName: /Sales Orders/i },
    ];

    for (const module of modules) {
      await page.goto(BASE_URL);
      await page.getByRole('navigation').getByRole('button', { name: module.sidebarName }).click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('table')).toBeVisible();

      const firstRow = recordRows(page).first();
      await expect(firstRow).toBeVisible();
      await firstRow.click();
      await expect(page.locator('[id^="delivery-record-workspace-"]')).toBeVisible();

      if (module.path === 'rma') {
        // RMA transport is visible to Logistics; physical receipt and final
        // completion remain TASS-only even when assignment is available.
        await page.getByRole('tab', { name: 'Status & Actions', exact: true }).click();
        const workflow = page.getByRole('region', { name: 'RMA transport', exact: true });
        await expect(workflow).toBeVisible();
        await expect(workflow.getByRole('button', {
          name: /^(Confirm physical receipt|Complete RMA|Save RMA status)$/,
        })).toHaveCount(0);
      }

      await page.getByRole('navigation').getByRole('button', { name: module.sidebarName }).click();
      await expect(page.getByRole('table')).toBeVisible();
      await expect(page.locator('[id^="delivery-record-workspace-"]')).toHaveCount(0);
    }
  });
});

test.describe('B-3 Driver Board & Calendar', () => {
  test('B-3.1 Driver Board renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/driver_board`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/not available for your account/i)).not.toBeVisible();
  });

  test('B-3.2 Delivery Calendar renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/calendar`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/not available for your account/i)).not.toBeVisible();
  });

  test('B-3.3 Driver Manager renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/driver_manager`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/not available for your account/i)).not.toBeVisible();
  });
});

test.describe('B-4 Documents Tab (POD upload)', () => {
  test('B-4.1 Documents tab visible with upload zone', async ({ page }) => {
    await openFirstRecord(page);
    const docsTab = page.getByRole('tab', { name: /documents/i });
    await expect(docsTab).toBeVisible();
    await docsTab.click();
    await expect(page.getByText(/drop files here|click to upload/i)).toBeVisible();
  });

  test('B-4.1a Invalid upload shows a toast and no inline duplicate', async ({ page }) => {
    const fileName = 'invoice.exe';

    await openFirstRecord(page);
    const docsTab = page.getByRole('tab', { name: /documents/i });
    await docsTab.click();

    const fileInput = page.locator('input[type="file"]').last();
    await fileInput.setInputFiles({ name: fileName, mimeType: 'application/octet-stream', buffer: Buffer.from('not an allowed attachment') });

    const message = 'invoice.exe — file type not allowed. Use JPG, PNG, PDF, DOCX or XLSX.';
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.locator('p', { hasText: message })).toHaveCount(0);
  });

  test('B-4.2 Stages a PDF until Save Files is clicked', async ({ page }) => {
    // Create a minimal valid PDF: the server verifies its structure (SEC-08).
    const pdfName = `uat-test-${Date.now()}.pdf`;
    const pdfPath = path.join('/tmp', pdfName);
    fs.writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer<</Size 2/Root 1 0 R>>\nstartxref\n39\n%%EOF\n');

    await openFirstRecord(page);
    const docsTab = page.getByRole('tab', { name: /documents/i });
    await docsTab.click();
    await page.waitForTimeout(500);

    const fileInput = page.locator('input[type="file"]').last();
    await fileInput.setInputFiles(pdfPath);

    // Selection is local until the user explicitly saves the Documents tab.
    await expect(page.getByText(pdfName)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Waiting to upload', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save Files' }).click();
    await expect(page.getByText('Waiting to upload', { exact: true })).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(pdfName)).toBeVisible();
    const preview = page.getByRole('button', { name: `Preview ${pdfName}` });
    await expect(preview).toBeVisible();
    const previewResponsePromise = page.waitForResponse(response =>
      response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/preview'),
    );
    await preview.click();
    const previewResponse = await previewResponsePromise;
    expect(previewResponse.ok()).toBeTruthy();
    expect(previewResponse.headers()['content-type']).toMatch(/^application\/pdf\b/i);
    expect(previewResponse.headers()['cache-control']).toMatch(/private.*no-store/i);
    const documentPreview = page.getByRole('dialog', { name: `Preview ${pdfName}` });
    await expect(documentPreview).toBeVisible();
    await expect(documentPreview.locator('iframe')).toHaveAttribute('src', /^blob:/);
    await page.keyboard.press('Shift+Tab');
    await expect(documentPreview.getByRole('link', { name: `Download ${pdfName}` })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(documentPreview.getByRole('button', { name: 'Close document preview' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(documentPreview).toBeHidden();
    await expect(preview).toBeFocused();
    await expect(page.getByRole('link', { name: `Download ${pdfName}` })).toHaveAttribute('download', pdfName);
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: `Download ${pdfName}` }).click(),
    ]);
    expect(pdfDownload.suggestedFilename()).toBe(pdfName);
    expect(fs.readFileSync(await pdfDownload.path()!)).toEqual(fs.readFileSync(pdfPath));
    await page.getByRole('button', { name: `Remove ${pdfName}` }).click();
    await page.getByRole('alertdialog', { name: 'Remove Attachment' }).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText(pdfName)).toHaveCount(0);

    fs.unlinkSync(pdfPath);
  });

  test('B-4.3 Excel attachments open in the in-app workbook preview', async ({ page }) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Reference', 'Status'],
      ['REC-XL-9001', 'Ready'],
    ]), 'Summary');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Total'],
      [1],
    ]), 'Totals');
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    const fileName = `uat-test-${Date.now()}.xlsx`;

    await openFirstRecord(page);
    await page.getByRole('tab', { name: /documents/i }).click();
    await page.locator('input[type="file"]').last().setInputFiles({
      name: fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: bytes,
    });
    await expect(page.getByText(fileName)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Save Files' }).click();
    await expect(page.getByText('Waiting to upload', { exact: true })).not.toBeVisible({ timeout: 15_000 });

    const preview = page.getByRole('button', { name: `Preview ${fileName}` });
    const previewResponsePromise = page.waitForResponse(response =>
      response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/preview'),
    );
    await preview.click();
    const previewResponse = await previewResponsePromise;
    expect(previewResponse.ok()).toBeTruthy();
    expect(previewResponse.headers()['content-type']).toMatch(/spreadsheetml\.sheet/i);

    const documentPreview = page.getByRole('dialog', { name: `Preview ${fileName}` });
    await expect(documentPreview.getByText('REC-XL-9001', { exact: true })).toBeVisible();
    await documentPreview.getByRole('tab', { name: 'Totals' }).click();
    await expect(documentPreview.locator('tbody tr').nth(1).locator('td').first()).toHaveText('1');
    await documentPreview.getByRole('button', { name: 'Close document preview' }).click();
    const [workbookDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: `Download ${fileName}` }).click(),
    ]);
    expect(workbookDownload.suggestedFilename()).toBe(fileName);
    expect(fs.readFileSync(await workbookDownload.path()!)).toEqual(bytes);
    await page.getByRole('button', { name: `Remove ${fileName}` }).click();
    await page.getByRole('alertdialog', { name: 'Remove Attachment' }).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText(fileName)).toHaveCount(0);
  });

  test('B-4.4 Persisted photos open in the shared preview with visible actions', async ({ page }) => {
    const photoName = `logistics-preview-${Date.now()}.png`;
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );

    await openFirstRecord(page);
    await page.getByRole('tab', { name: /documents/i }).click();
    await page.locator('input[type="file"]').last().setInputFiles({
      name: photoName,
      mimeType: 'image/png',
      buffer: onePixelPng,
    });
    await expect(page.getByText('Waiting to upload', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save Files' }).click();

    const preview = page.getByRole('button', { name: `Preview ${photoName}` });
    await expect(preview).toBeVisible({ timeout: 15_000 });
    const thumbnail = page.getByRole('img', { name: photoName });
    await expect(thumbnail).toBeVisible();
    await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(thumbnail).toHaveAttribute('src', /\/preview$/);
    await expect(page.getByRole('link', { name: `Download ${photoName}` })).toHaveAttribute('download', photoName);
    await expect(page.getByRole('button', { name: `Remove ${photoName}` })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await preview.click();
    const lightbox = page.getByRole('dialog', { name: `Preview ${photoName}` });
    await expect(lightbox).toBeVisible();
    const fullImage = lightbox.getByRole('img', { name: photoName });
    await expect(fullImage).toHaveAttribute('src', /\/preview$/);
    await expect.poll(() => fullImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    const bounds = await lightbox.boundingBox();
    expect(bounds?.width).toBeLessThanOrEqual(375);
    expect(bounds?.height).toBeLessThanOrEqual(812);
    await page.keyboard.press('Escape');
    await expect(lightbox).not.toBeVisible();

    await page.getByRole('button', { name: `Remove ${photoName}` }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Remove Attachment' });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole('textbox')).toHaveCount(0);
    await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(preview).toHaveCount(0);
  });

  test('B-4.5 Persisted JPG thumbnails and lightbox preview inline without downloading', async ({ page }) => {
    const photoName = `logistics-preview-${Date.now()}.jpg`;
    const jpegBase64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      context.fillStyle = '#2563eb';
      context.fillRect(0, 0, 2, 2);
      return canvas.toDataURL('image/jpeg').split(',')[1];
    });
    const downloads: string[] = [];
    page.on('download', download => downloads.push(download.suggestedFilename()));

    await openFirstRecord(page);
    await page.getByRole('tab', { name: /documents/i }).click();
    await page.locator('input[type="file"]').last().setInputFiles({
      name: photoName,
      mimeType: 'image/jpeg',
      buffer: Buffer.from(jpegBase64, 'base64'),
    });
    await expect(page.getByText('Waiting to upload', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save Files' }).click();

    const preview = page.getByRole('button', { name: `Preview ${photoName}` });
    await expect(preview).toBeVisible({ timeout: 15_000 });
    const thumbnail = page.getByRole('img', { name: photoName });
    await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(thumbnail).toHaveAttribute('src', /\/preview$/);
    await preview.click();

    const lightbox = page.getByRole('dialog', { name: `Preview ${photoName}` });
    await expect(lightbox).toBeVisible();
    const fullImage = lightbox.getByRole('img', { name: photoName });
    await expect(fullImage).toHaveAttribute('src', /\/preview$/);
    await expect.poll(() => fullImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    expect(downloads).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(lightbox).not.toBeVisible();
    await expect(preview).toBeFocused();
    expect(downloads).toEqual([]);

    await page.getByRole('button', { name: `Remove ${photoName}` }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Remove Attachment' });
    await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(preview).toHaveCount(0);
  });
});

test.describe('B-5 Reports', () => {
  test('B-5.1 Statistical Reports renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/statistical_reports`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/not available for your account/i)).not.toBeVisible();
  });

  test('B-5.2 Retired Status History screen redirects to dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/status_history`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
  });
});
