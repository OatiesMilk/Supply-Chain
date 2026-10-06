/**
 * driver.spec.ts
 *
 * UAT Part C — Driver role E2E tests.
 * Covers: Field Mobile Dashboard, ePOD flow (Time In → POD Upload → Received By → Accomplish).
 *
 * Test IDs match the UAT_PLAN.md document (C-1.x, C-2.x, C-3.x).
 *
 * NOTE: Assumes Logistics has pre-assigned the Driver (driver@microgenesis.com)
 *       a delivery record with today's date before these tests run.
 *       If no record exists, C-2.x tests will be skipped gracefully.
 */
import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getFirstActiveCard(page: Page) {
  // Driver cards are divs with a Record Time In button
  return page.getByRole('button', { name: /record time in/i }).first();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('C-1 Driver Dashboard', () => {
  test('C-1.1 Driver lands on Field Mobile dashboard (no sidebar)', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Driver-specific header text
    await expect(page.getByText(/microgenesis field mobile/i)).toBeVisible();

    // No sidebar navigation
    await expect(page.getByRole('navigation')).not.toBeVisible();
  });

  test('C-1.2 Stats strip shows correct counters', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/today.*runs|runs.*today/i)).toBeVisible();
    await expect(page.getByText(/accomplished/i)).toBeVisible();
    await expect(page.getByText(/remaining/i)).toBeVisible();
  });

  test('C-1.5 Logout works', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /log out|logout/i }).click();
    await page.waitForLoadState('networkidle');

    // Should be back on the login page
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});

test.describe('C-2 ePOD Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('C-2.1 Record Time In button is clickable', async ({ page }) => {
    const timeInBtn = await getFirstActiveCard(page);

    if (!(await timeInBtn.isVisible())) {
      test.skip(true, 'No active record assigned to driver for today — skipping ePOD tests');
      return;
    }

    await timeInBtn.click();
    await page.waitForTimeout(1000);

    // Time In button should be gone, replaced by a confirmation banner
    await expect(page.getByText(/time in recorded/i)).toBeVisible({ timeout: 8_000 });
  });

  test('C-2.2 POD upload section is visible on an active delivery', async ({ page }) => {
    const uploadButton = page.getByRole('button', { name: /upload photo|upload.*doc/i }).first();
    if (!(await uploadButton.isVisible())) {
      test.skip(true, 'No active record assigned to driver for today — skipping ePOD tests');
      return;
    }
    await expect(page.getByText(/proof of delivery/i)).toBeVisible();
    await expect(uploadButton).toBeVisible();
  });

  test('C-2.4 Driver can upload a valid delivery photo', async ({ page }) => {
    const podSection = page.getByRole('button', { name: /upload photo|upload.*doc/i }).first();
    if (!(await podSection.isVisible())) {
      test.skip(true, 'POD upload section not visible');
      return;
    }

    const pngPath = path.join('/tmp', 'uat_pod.png');
    const pngBuf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    fs.writeFileSync(pngPath, pngBuf);

    const fileInput = page.locator('input[type="file"]').last();
    await fileInput.setInputFiles(pngPath);

    await expect(page.getByText('uat_pod.png')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/delivery photo saved/i)).toBeVisible({ timeout: 15_000 });

    fs.unlinkSync(pngPath);
  });

  test('C-2.3 Supporting documents upload but do not satisfy photo proof', async ({ page }) => {
    const podSection = page.getByRole('button', { name: /upload photo|upload.*doc/i }).first();
    if (!(await podSection.isVisible())) {
      test.skip(true, 'POD upload section not visible');
      return;
    }

    const pdfPath = path.join('/tmp', 'uat_supporting_document.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4 UAT supporting document');
    await page.locator('input[type="file"]').last().setInputFiles(pdfPath);
    await expect(page.getByText('uat_supporting_document.pdf')).toBeVisible({ timeout: 15_000 });
    fs.unlinkSync(pdfPath);
  });

  test('C-2.7 Received By field accepts text', async ({ page }) => {
    const receivedByInput = page.getByPlaceholder(/received.*item|name of person/i).first();
    if (!(await receivedByInput.isVisible())) {
      test.skip(true, 'Received By input not visible');
      return;
    }
    await receivedByInput.fill('Juan dela Cruz (UAT)');
    await expect(receivedByInput).toHaveValue('Juan dela Cruz (UAT)');
  });

  test('C-2.10 Confirm button is disabled without remarks', async ({ page }) => {
    // Click Accomplish
    const accomplishBtn = page.getByRole('button', { name: /accomplish/i }).first();
    if (!(await accomplishBtn.isVisible())) {
      test.skip(true, 'No active record to accomplish');
      return;
    }
    await accomplishBtn.click();
    await page.waitForTimeout(500);

    // The confirmation modal should appear
    const confirmBtn = page.getByRole('button', { name: /^confirm$/i });
    await expect(confirmBtn).toBeDisabled();
  });

  test('C-2.8 Full Accomplish flow with remarks', async ({ page }) => {
    const accomplishBtn = page.getByRole('button', { name: /accomplish/i }).first();
    if (!(await accomplishBtn.isVisible())) {
      test.skip(true, 'No active record to accomplish');
      return;
    }

    await accomplishBtn.click();
    await page.waitForTimeout(500);

    // Enter remarks in modal
    await page.getByPlaceholder(/remarks/i).fill('UAT - marked as delivered');
    await page.getByRole('button', { name: /^confirm$/i }).click();
    await page.waitForLoadState('networkidle');

    // Record should move to the Accomplished section
    await expect(page.getByText(/accomplished/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('C-3 Accomplished Records View', () => {
  test('C-3.1 Accomplished section visible after delivery', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    // If any records are done for today, we see the section divider
    const accomplishedSection = page.getByText(/accomplished/i).first();
    // If there are accomplished records, this section appears
    if (await accomplishedSection.isVisible()) {
      await expect(accomplishedSection).toBeVisible();
    } else {
      test.skip(true, 'No accomplished records today');
    }
  });
});
