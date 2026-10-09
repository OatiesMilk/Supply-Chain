/**
 * sales_coordinator.spec.ts
 *
 * UAT Part A — Sales Coordinator role E2E tests.
 * Covers: login, access control, create record, validation, attachments, comments.
 *
 * Test IDs match the UAT_PLAN.md document (A-1.x, A-2.x, A-3.x, A-4.x, A-5.x).
 */
import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function expectSidebarHas(page: Page, label: string) {
  await expect(page.getByRole('navigation').getByText(label, { exact: false })).toBeVisible();
}

async function expectSidebarMisses(page: Page, label: string) {
  await expect(page.getByRole('navigation').getByText(label, { exact: false })).not.toBeVisible();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('A-1 Login & Access Control', () => {
  test('A-1.1 Dashboard loads after login', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    // storageState already authenticated — should land on an app page, not login
    await expect(page).not.toHaveURL(/login/);
  });

  test('A-1.2 SC sidebar shows correct permitted screens', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await expectSidebarHas(page, 'Dashboard');
    await expectSidebarHas(page, 'Deliveries');
    await expectSidebarHas(page, 'Customers');
    await expectSidebarHas(page, 'Transaction');
  });

  test('A-1.3 SC sidebar does NOT show restricted screens', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await expectSidebarMisses(page, 'Driver View');
    await expectSidebarMisses(page, 'Driver Manager');
    await expectSidebarMisses(page, 'Driver Board');
    await expectSidebarMisses(page, 'Statistical Reports');
    await expectSidebarMisses(page, 'Admin');
  });
});

test.describe('A-2 Create a Delivery Record', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');
  });

  test('A-2.2 Empty form submission shows validation errors', async ({ page }) => {
    // Open the create form
    const newBtn = page.getByRole('button', { name: /new record|add record|\+ new/i }).first();
    await newBtn.click();
    await page.waitForLoadState('networkidle');

    // Click Save without filling anything
    await page.getByRole('button', { name: /save|create|submit/i }).first().click();

    // Expect validation errors
    await expect(page.getByText(/company name is required/i)).toBeVisible();
  });

  test('A-2.3 Company must be selected from list', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new record|add record|\+ new/i }).first();
    await newBtn.click();

    // Type a garbage company name
    const companyInput = page.getByPlaceholder(/company|customer/i).first();
    await companyInput.fill('ZZZZNOTACOMPANY');
    await page.getByRole('button', { name: /save|create|submit/i }).first().click();

    await expect(page.getByText(/select a company from the list/i)).toBeVisible();
  });

  test('A-2.4 Valid record creates with Scheduled status', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new record|add record|\+ new/i }).first();
    await newBtn.click();
    await page.waitForLoadState('networkidle');

    // Fill company (pick first suggestion)
    const companyInput = page.getByPlaceholder(/company|customer/i).first();
    await companyInput.fill('M'); // trigger dropdown
    await page.waitForTimeout(500);
    const firstOption = page.getByRole('option').first();
    if (await firstOption.isVisible()) {
      await firstOption.click();
    }

    // Fill reference
    const refInput = page.getByPlaceholder(/reference|sap/i).first();
    await refInput.fill(`UAT-${Date.now()}`);

    // Set delivery date to today
    const today = new Date().toISOString().split('T')[0];
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill(today);

    await page.getByRole('button', { name: /save|create|submit/i }).first().click();
    await page.waitForLoadState('networkidle');

    // Record should appear in the list — status badge shows Scheduled
    await expect(page.getByText(/scheduled/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('A-2.7 Reject file over 10 MB', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new record|add record|\+ new/i }).first();
    await newBtn.click();

    // Create a temporary > 10 MB file
    const bigFilePath = path.join('/tmp', 'big_test_file.pdf');
    const TEN_MB = 11 * 1024 * 1024;
    const buf = Buffer.alloc(TEN_MB, 'x');
    fs.writeFileSync(bigFilePath, buf);

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(bigFilePath);

    await expect(page.getByText(/size|too large|10\s*mb/i)).toBeVisible({ timeout: 5_000 });

    fs.unlinkSync(bigFilePath);
  });

  test('A-2.8 Reject unsupported file type', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new record|add record|\+ new/i }).first();
    await newBtn.click();

    const badFilePath = path.join('/tmp', 'malicious.exe');
    fs.writeFileSync(badFilePath, Buffer.from('MZ'));

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(badFilePath);

    await expect(page.getByText(/unsupported|invalid|type|format/i)).toBeVisible({ timeout: 5_000 });

    fs.unlinkSync(badFilePath);
  });
});

test.describe('A-3 Edit a Record', () => {
  test('A-3.9 SC can stage, save, and preview a photo from Documents', async ({ page }) => {
    const photoName = `sc-preview-${Date.now()}.png`;
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );

    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');
    const firstRow = page.getByRole('row').nth(1);
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await page.getByRole('tab', { name: /documents/i }).click();
    await page.locator('input[type="file"]').last().setInputFiles({
      name: photoName,
      mimeType: 'image/png',
      buffer: onePixelPng,
    });

    await expect(page.getByText('Waiting to upload', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `Remove staged ${photoName}` })).toBeVisible();
    await page.getByRole('button', { name: 'Save Files' }).click();

    const preview = page.getByRole('button', { name: `Preview ${photoName}` });
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await preview.click();
    await expect(page.getByRole('dialog', { name: `Preview ${photoName}` })).toBeVisible();
    await page.getByRole('button', { name: 'Close photo preview' }).click();

    await page.getByRole('button', { name: `Remove ${photoName}` }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Remove Attachment' });
    await expect(confirmation.getByRole('textbox')).toHaveCount(0);
    await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(preview).toHaveCount(0);
  });

  test('A-3.6 Active Deliveries sidebar returns to the list and preserves filters', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');

    const scheduledFilter = page.getByRole('button', { name: 'Scheduled', exact: true });
    await scheduledFilter.click();

    const firstRow = page.getByRole('row').nth(1);
    await expect(firstRow).toBeVisible();
    const recordId = (await firstRow.getByRole('cell').first().innerText()).trim();
    const search = page.getByRole('textbox', { name: 'Search delivery records' });
    await search.fill(recordId);

    const filteredRow = page.getByRole('row').filter({ hasText: recordId }).first();
    await expect(filteredRow).toBeVisible();
    await filteredRow.click();
    await expect(page.locator('[id^="delivery-record-workspace-"]')).toBeVisible();

    await page.getByRole('navigation').getByRole('button', { name: /deliveries/i }).click();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.locator('[id^="delivery-record-workspace-"]')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Search delivery records' })).toHaveValue(recordId);
    await expect(page.getByRole('button', { name: 'Scheduled', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('A-3.7 Global search deep links still open and browser back/forward returns between workspace and list', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');
    const firstRow = page.getByRole('row').nth(1);
    await expect(firstRow).toBeVisible();
    const recordId = (await firstRow.getByRole('cell').first().innerText()).trim();

    await page.keyboard.press('Control+k');
    const globalSearch = page.getByPlaceholder(/Search records, companies, drivers, SKUs/);
    await globalSearch.fill(recordId);
    await page.locator('[data-result-item]').filter({ hasText: recordId }).click();
    await expect(page.locator('[id^="delivery-record-workspace-"]')).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: /deliveries/i }).click();
    await expect(page.getByRole('table')).toBeVisible();

    await page.goBack();
    await expect(page.locator('[id^="delivery-record-workspace-"]')).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('A-3.8 Active module navigation works with collapsed and mobile sidebars', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Collapse menu' }).click();

    const firstRow = page.getByRole('row').nth(1);
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page.locator('[id^="delivery-record-workspace-"]')).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: /deliveries/i }).click();
    await expect(page.getByRole('table')).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('row').nth(1).click();
    await expect(page.locator('[id^="delivery-record-workspace-"]')).toBeVisible();
    await page.locator('#mobile-sidebar-toggle').click();
    await page.locator('#sidebar-panel').getByRole('button', { name: /deliveries/i }).click();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('A-3.3 Dispatch & Logistics tab NOT visible for SC', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');

    // Open first record
    const firstRow = page.getByRole('row').nth(1);
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(800);
      await expect(page.getByRole('tab', { name: /dispatch/i })).not.toBeVisible();
    }
  });

  test('A-3.5 SC can leave a comment', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');

    const firstRow = page.getByRole('row').nth(1);
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(800);

      // Navigate to Comments tab
      const commentsTab = page.getByRole('tab', { name: /comments/i });
      if (await commentsTab.isVisible()) {
        await commentsTab.click();
        const commentInput = page.getByPlaceholder(/comment|type/i);
        await commentInput.fill('UAT automated comment test');
        await page.getByRole('button', { name: /send|post|submit/i }).click();
        await expect(page.getByText('UAT automated comment test')).toBeVisible({ timeout: 8_000 });
      }
    }
  });

  test('A-3.9 TSK-124 Priority is read-only on a Delivered record', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');
    const delivered = page.getByRole('row').filter({ hasText: /delivered/i }).first();
    test.skip(!(await delivered.isVisible()), 'No Delivered delivery in the seeded data');
    await delivered.click();

    await expect(page.getByText('Priority is locked after delivery.')).toBeVisible();
    // Sales Coordinator cannot edit a Delivered record, so there is no Edit button or Priority dropdown.
    await expect(page.locator('select').filter({ has: page.locator('option[value="3 - High"]') })).toHaveCount(0);
  });
});

test.describe('A-5 Transaction Center', () => {
  test('A-5.1 Transaction Center page renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/transactions`);
    await page.waitForLoadState('networkidle');
    // Should not show "not available" message
    await expect(page.getByText(/not available for your account/i)).not.toBeVisible();
  });
});
