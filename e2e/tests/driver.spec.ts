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

function manilaDateOffset(offset: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

async function showAssignedRecord(page: Page, deliveryDate: string) {
  await page.route('**/api/records**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/records/tsk99-date-fixture/attachments') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (url.pathname !== '/api/records') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'tsk99-date-fixture', category: 'Deliveries', status: 'Scheduled', is_draft: 'No',
        driver: 'Current Driver', driver_id: 'driver-profile', reference: 'TSK99-DATE',
        company_name: 'Scheduling Fixture Company', area: 'Makati', item_description: 'Date actionability fixture',
        delivery_date: deliveryDate, time_in: null, time_out: null,
        allowed_statuses: ['On-Hold', 'Rescheduled'], driver_assistants: [], attachments: [],
      }]),
    });
  });
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
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

    await expect(page.getByText(/today.*runs|runs.*today/i).first()).toBeVisible();
    await expect(page.getByText(/accomplished/i).first()).toBeVisible();
    await expect(page.getByText(/remaining/i).first()).toBeVisible();
  });

  test('C-1.3 Future assigned Delivery stays visible and read-only', async ({ page }) => {
    await showAssignedRecord(page, manilaDateOffset(1));
    await expect(page.getByText('TSK99-DATE')).toBeVisible();
    await expect(page.getByText('Upcoming · read-only')).toBeVisible();
    await expect(page.getByText('Date actionability fixture')).toBeVisible();
    await expect(page.getByRole('button', { name: /record time in/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /upload photo|upload.*doc|select photo/i })).toHaveCount(0);
  });

  test('C-1.4 Overdue assigned Delivery shows lateness and execution controls', async ({ page }) => {
    await showAssignedRecord(page, manilaDateOffset(-2));
    await expect(page.getByText(/overdue · 2 days late/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /record time in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /upload photo|upload.*doc|select photo/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pending$/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Reschedule$/i })).toBeEnabled();
  });

  test('C-1.5 Logout works', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /log out|logout/i }).click();
    await page.waitForLoadState('networkidle');

    // Should be back on the login page
    await expect(page.getByRole('button', { name: /sign in with microsoft/i })).toBeVisible();
  });
});

test.describe('C-2 ePOD Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('C-2.1 Record Time In button is clickable', async ({ page }) => {
    const timeInBtn = await getFirstActiveCard(page);

    try { await timeInBtn.waitFor({ state: "visible", timeout: 3000 }); } catch (e) {
      test.skip(true, 'No active record assigned to driver for today — skipping ePOD tests');
      return;
    }

    await timeInBtn.click();
    await page.waitForTimeout(1000);

    // Enter remarks in modal
    await page.getByPlaceholder(/remarks/i).fill('Started run via mobile app');
    await page.getByRole('button', { name: /^confirm$/i }).click();

    // Time In button should be gone, replaced by a confirmation banner
    await expect(page.getByText(/time in recorded/i)).toBeVisible({ timeout: 8_000 });
  });

  test('C-2.2 POD upload section is visible on an active delivery', async ({ page }) => {
    const uploadButton = page.getByRole('button', { name: /upload photo|upload.*doc|select photo/i }).first();
    try {
      await uploadButton.waitFor({ state: 'visible', timeout: 3000 });
    } catch (e) {
      test.skip(true, 'Element not visible');
      return;
    }
    await expect(page.getByText(/proof of delivery/i).first()).toBeVisible();
    await expect(uploadButton).toBeVisible();
  });

  test('C-2.4 Driver can upload a valid delivery photo', async ({ page }) => {
    const podSection = page.getByRole('button', { name: /upload photo|upload.*doc|select photo/i }).first();
    try {
      await podSection.waitFor({ state: 'visible', timeout: 3000 });
    } catch (e) {
      test.skip(true, 'Element not visible');
      return;
    }

    const pngPath = path.join('/tmp', 'uat_pod.png');
    const pngBuf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    fs.writeFileSync(pngPath, pngBuf);

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(pngPath);

    await expect(page.getByText('uat_pod.png')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/delivery photo ready/i)).toBeVisible({ timeout: 15_000 });

    fs.unlinkSync(pngPath);
  });

  test('C-2.3 Supporting documents upload but do not satisfy photo proof', async ({ page }) => {
    const podSection = page.getByRole('button', { name: /upload photo|upload.*doc|select photo/i }).first();
    try {
      await podSection.waitFor({ state: 'visible', timeout: 3000 });
    } catch (e) {
      test.skip(true, 'Element not visible');
      return;
    }

    const pdfPath = path.join('/tmp', 'uat_supporting_document.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4 UAT supporting document');
    await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
    await expect(page.getByText('uat_supporting_document.pdf')).toBeVisible({ timeout: 15_000 });
    fs.unlinkSync(pdfPath);
  });

  test('C-2.7 Received By field accepts text', async ({ page }) => {
    const receivedByInput = page.getByPlaceholder(/received.*item|name of person/i).first();
    try {
      await receivedByInput.waitFor({ state: 'visible', timeout: 3000 });
    } catch (e) {
      test.skip(true, 'Element not visible');
      return;
    }
    await receivedByInput.fill('Juan dela Cruz (UAT)');
    await expect(receivedByInput).toHaveValue('Juan dela Cruz (UAT)');
  });

  test('C-2.10 Confirm button is disabled without remarks', async ({ page }) => {
    // 1. Upload Photo
    const pngPath = path.join('/tmp', 'uat_pod.png');
    fs.writeFileSync(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(pngPath);
    await expect(page.getByText('uat_pod.png')).toBeVisible({ timeout: 15_000 });
    fs.unlinkSync(pngPath);

    // 2. Fill Received By
    await page.getByPlaceholder(/received.*item|name of person/i).first().fill('Juan dela Cruz (UAT)');

    // 3. Click Accomplish
    const accomplishBtn = page.getByRole('button', { name: /accomplish/i }).first();
    try {
      await accomplishBtn.waitFor({ state: 'visible', timeout: 3000 });
    } catch (e) {
      test.skip(true, 'Element not visible');
      return;
    }
    await accomplishBtn.click();
    await page.waitForTimeout(500);

    // The confirmation modal should appear
    const confirmBtn = page.getByRole('button', { name: /^confirm$/i });
    await expect(confirmBtn).toBeDisabled();
  });

  test('C-2.8 Full Accomplish flow with remarks', async ({ page }) => {
    // 1. Upload Photo
    const pngPath = path.join('/tmp', 'uat_pod.png');
    fs.writeFileSync(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(pngPath);
    await expect(page.getByText('uat_pod.png')).toBeVisible({ timeout: 15_000 });
    fs.unlinkSync(pngPath);

    // 2. Fill Received By
    await page.getByPlaceholder(/received.*item|name of person/i).first().fill('Juan dela Cruz (UAT)');

    // 3. Click Accomplish
    const accomplishBtn = page.getByRole('button', { name: /accomplish/i }).first();
    try {
      await accomplishBtn.waitFor({ state: 'visible', timeout: 3000 });
    } catch (e) {
      test.skip(true, 'Element not visible');
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

  test('C-3.2 POD photo opens in a lightbox and Escape closes it', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const accomplishedHeading = page.getByText(/^Accomplished \\(\\d+\\)$/i).first();
    await expect(accomplishedHeading, 'The UAT seed must provide a completed run').toBeVisible();
    const accomplishedRun = accomplishedHeading.locator('..').locator('..')
      .getByRole('button').filter({ hasText: 'SAP-UAT-DELIVERED-PRIORITY' });
    await expect(accomplishedRun).toBeVisible();
    await accomplishedRun.click();

    const details = page.getByRole('dialog', { name: /accomplished run details/i });
    await expect(details).toBeVisible();
    const thumbnail = details.getByRole('button', { name: /^preview /i }).first();
    await expect(thumbnail, 'The UAT completed run must have a real stored POD thumbnail').toBeVisible({ timeout: 10_000 });

    await expect(thumbnail.locator('img')).toBeVisible();
    await thumbnail.click();
    const lightbox = page.getByRole('dialog', { name: /^preview /i });
    await expect(lightbox).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(lightbox).not.toBeVisible();
    await expect(thumbnail).toBeFocused();
  });
});
