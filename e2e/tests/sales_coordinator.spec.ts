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
    await expectSidebarMisses(page, 'Drivers');
    await expectSidebarMisses(page, 'Statistical Reports');
    await expectSidebarMisses(page, 'Admin');
  });
});

test.describe('Role dashboard drill-downs', () => {
  test('SC held card opens the matching dialog, fits supported widths, and closes', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    const card = page.locator('#dashboard-kpis').getByRole('button', { name: /^On Hold \/ Rescheduled/ });
    await expect(card).toBeVisible();
    const cardCount = Number((await card.locator('strong').innerText()).trim());
    await card.click();

    const dialog = page.getByRole('dialog', { name: 'On Hold / Rescheduled', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`${cardCount} total`, { exact: true })).toBeVisible();

    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).toBeTruthy();
      expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }

    await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).not.toBeVisible();
    await expect(card).toBeFocused();
    await card.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: /^Deliveries/ }).click();
    await expect(page).toHaveURL(/\/deliveries$/);
    await expect(page.getByRole('dialog')).not.toBeVisible();
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

    // Submit without filling anything
    await page.getByRole('button', { name: 'Submit', exact: true }).click();

    // Expect validation errors
    await expect(page.getByText(/company name is required/i)).toBeVisible();
  });

  test('A-2.3 Company must be selected from list', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new record|add record|\+ new/i }).first();
    await newBtn.click();

    // Type a garbage company name
    const companyInput = page.locator('form').getByPlaceholder('Type to search or scroll to browse...').first();
    await companyInput.fill('ZZZZNOTACOMPANY');
    await page.getByRole('button', { name: /save|create|submit/i }).first().click();

    await expect(page.getByText(/select a company from the list/i)).toBeVisible();
  });

  test('A-2.4 Valid record creates with Scheduled status', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new record|add record|\+ new/i }).first();
    await newBtn.click();
    await page.waitForLoadState('networkidle');

    // Fill company (pick first suggestion)
    const companyInput = page.locator('form').getByPlaceholder('Type to search or scroll to browse...').first();
    await companyInput.fill('M'); // trigger dropdown
    const companyListbox = page.locator('form').getByRole('listbox').first();
    const firstOption = companyListbox.getByRole('option').first();
    await expect(firstOption).toBeVisible();
    await firstOption.click();
    await expect(companyInput).not.toHaveValue('M');

    // Fill reference
    const refInput = page.getByPlaceholder(/reference|sap/i).first();
    await refInput.fill(`UAT-${Date.now()}`);

    // Set delivery date to today
    const today = new Date().toISOString().split('T')[0];
    const dateInput = page.locator('form input[type="date"]').first();
    await dateInput.fill(today);

    await page.getByRole('button', { name: 'Submit', exact: true }).click();
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

    await expect(page.getByText('big_test_file.pdf is 11.0 MB — maximum is 10 MB.', { exact: true })).toBeVisible({ timeout: 5_000 });

    fs.unlinkSync(bigFilePath);
  });

  test('A-2.8 Reject unsupported file type', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new record|add record|\+ new/i }).first();
    await newBtn.click();

    const badFilePath = path.join('/tmp', 'malicious.exe');
    fs.writeFileSync(badFilePath, Buffer.from('MZ'));

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(badFilePath);

    await expect(page.getByText('malicious.exe — file type not allowed. Use JPG, PNG, PDF, DOC or DOCX.', { exact: true })).toBeVisible({ timeout: 5_000 });

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
    const confirmation = page.getByRole('dialog', { name: 'Remove Attachment' });
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
    const recordId = (await firstRow.getByRole('cell').nth(1).innerText()).trim();
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
    const recordId = (await firstRow.getByRole('cell').nth(1).innerText()).trim();

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
        const commentsPanel = page.getByRole('tabpanel', { name: 'Comments' });
        const commentInput = commentsPanel.getByRole('textbox', { name: 'Comment (optional)' });
        await commentInput.fill('UAT automated comment test');
        await commentsPanel.getByRole('button', { name: 'Send comment' }).click();
        await expect(commentsPanel.getByText('UAT automated comment test', { exact: true })).toBeVisible({ timeout: 8_000 });
      }
    }
  });

  test('A-3.10 TSK-125 Return to Draft uses a confirmation dialog with a required reason', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('row').filter({ hasText: /scheduled/i }).first().click();

    const returnButton = page.getByRole('button', { name: 'Return to Draft', exact: true });
    test.skip(!(await returnButton.isVisible()), 'First Scheduled delivery has already started');

    // No page-level "required" remarks box any more.
    await expect(page.getByText('Remarks — reason for change (required)')).toHaveCount(0);

    // Keep as is changes nothing.
    await returnButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Return this record to Draft?' })).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Return to Draft' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Reason (required)').fill('Typed but not confirmed');
    await expect(confirm).toBeEnabled();
    await dialog.getByRole('button', { name: 'Keep as is' }).click();
    await expect(dialog).toBeHidden();
    await expect(returnButton).toBeVisible();

    // Confirming returns the record to Draft and records the reason.
    await returnButton.click();
    await dialog.getByLabel('Reason (required)').fill('TSK-125 automated return to draft');
    await confirm.click();
    await expect(page.getByText('Record returned to Draft').first()).toBeVisible({ timeout: 8_000 });
    await page.getByRole('tab', { name: /remarks history/i }).click();
    await expect(page.getByRole('tabpanel', { name: 'Remarks History' }).getByText('TSK-125 automated return to draft', { exact: true })).toBeVisible();

    // Restore the record through the unchanged Submit flow.
    await page.getByRole('tab', { name: /overview/i }).click();
    await page.locator('#submission-change-remarks').fill('TSK-125 automated resubmit');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Record submitted').first()).toBeVisible({ timeout: 8_000 });
  });

  test('A-3.9 TSK-124 Priority is read-only on a Delivered record', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');
    const delivered = page.getByRole('row').filter({ hasText: 'REC-UAT-DELIVERED-' }).first();
    await expect(delivered, 'The UAT seed must provide its completed delivery fixture').toBeVisible();
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
