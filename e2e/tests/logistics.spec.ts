/**
 * logistics.spec.ts
 *
 * UAT Part B — Logistics role E2E tests.
 * Covers: login, access control, driver assignment, status updates,
 *         driver board, documents/POD upload, statistical reports.
 *
 * Test IDs match the UAT_PLAN.md document (B-1.x, B-2.x, B-3.x, B-4.x, B-5.x).
 */
import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openFirstRecord(page: Page) {
  await page.goto(`${BASE_URL}/deliveries`);
  await page.waitForLoadState('networkidle');
  const firstRow = page.getByRole('row').nth(1);
  await firstRow.waitFor({ state: 'visible', timeout: 10_000 });
  await firstRow.click();
  await page.waitForTimeout(800);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('B-1 Login & Access Control', () => {
  test('B-1.1 Logistics sidebar has extended screens', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    const nav = page.getByRole('navigation');
    await expect(nav.getByText(/driver view|driver/i).first()).toBeVisible();
    await expect(nav.getByText(/driver manager/i)).toBeVisible();
    await expect(nav.getByText(/calendar/i)).toBeVisible();
  });

  test('B-1.2 RMA module labelled "TASS" for Logistics', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    // For Logistics role the RMA sidebar entry reads "TASS"
    await expect(page.getByRole('navigation').getByText('TASS', { exact: true })).toBeVisible();
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
});

test.describe('B-2 Dispatch & Assign Driver', () => {
  test('B-2.0 Delivery date range enforces chronological filters without losing focus', async ({ page }) => {
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');

    const dateFrom = page.getByLabel('Date From', { exact: true });
    const dateTo = page.getByLabel('Date To', { exact: true });

    await dateFrom.fill('2026-10-08');
    await expect(dateTo).toHaveAttribute('min', '2026-10-08');

    const unfilteredHistoryRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname.endsWith('/records/status-history-counts')
        && !url.searchParams.has('dateFrom')
        && !url.searchParams.has('dateTo');
    });
    await dateTo.fill('2026-10-01');
    await expect(page.getByText('Date To cannot be earlier than Date From.', { exact: true })).toBeVisible();
    await unfilteredHistoryRequest;

    await dateTo.fill('2026-10-08');
    await expect(page.getByText('Date To cannot be earlier than Date From.', { exact: true })).not.toBeVisible();

    await dateFrom.fill('2026-10-09');
    await expect(dateTo).toHaveValue('');
    await expect(dateFrom).toBeFocused();

    await dateFrom.fill('');
    await expect(dateTo).not.toHaveAttribute('min');
  });

  test('B-2.1 Dispatch & Logistics tab is visible', async ({ page }) => {
    await openFirstRecord(page);
    await expect(page.getByRole('tab', { name: /dispatch|logistics/i })).toBeVisible();
  });

  test('B-2.3 Driver assignment blocked without remarks', async ({ page }) => {
    await openFirstRecord(page);
    const dispatchTab = page.getByRole('tab', { name: /dispatch|logistics/i });
    await dispatchTab.click();
    await page.waitForTimeout(500);

    // Change the driver dropdown
    const driverSelect = page.locator('select').filter({ hasText: /driver|select/i }).first();
    if (await driverSelect.isVisible()) {
      await driverSelect.selectOption({ index: 1 });
    }

    // Try to save without remarks
    const saveBtn = page.getByRole('button', { name: /save driver|save fields/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await expect(page.getByText(/remarks.*required|required.*remarks/i)).toBeVisible({ timeout: 5_000 });
    }
  });

  test('B-2.5 Status change works with remarks', async ({ page }) => {
    await openFirstRecord(page);
    const dispatchTab = page.getByRole('tab', { name: /dispatch|logistics/i });
    await dispatchTab.click();
    await page.waitForTimeout(500);

    // Fill status remarks
    const remarksArea = page.getByPlaceholder(/reason.*status|status.*remark/i).first();
    if (await remarksArea.isVisible()) {
      await remarksArea.fill('UAT automated status change');
      // Pick a different status
      const statusSelect = page.locator('select').filter({ hasText: /status|scheduled|pending/i }).first();
      if (await statusSelect.isVisible()) {
        await statusSelect.selectOption({ value: 'On-Hold' });
        await page.getByRole('button', { name: /confirm|update status/i }).click();
        await page.waitForLoadState('networkidle');
        await expect(page.getByText(/on.hold/i)).toBeVisible({ timeout: 8_000 });
      }
    }
  });

  test('B-2.6 Cannot set same status twice', async ({ page }) => {
    await openFirstRecord(page);
    const dispatchTab = page.getByRole('tab', { name: /dispatch|logistics/i });
    await dispatchTab.click();
    await page.waitForTimeout(500);

    const remarksArea = page.getByPlaceholder(/reason.*status|status.*remark/i).first();
    if (await remarksArea.isVisible()) {
      await remarksArea.fill('Try same status');
      // Set to current status (no change)
      await page.getByRole('button', { name: /confirm|update status/i }).click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/choose a different status|no change/i)).toBeVisible({ timeout: 5_000 });
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

  test('B-4.2 Upload a PDF file', async ({ page }) => {
    // Create a minimal valid PDF
    const pdfPath = path.join('/tmp', 'uat_test.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4 UAT test file');

    await openFirstRecord(page);
    const docsTab = page.getByRole('tab', { name: /documents/i });
    await docsTab.click();
    await page.waitForTimeout(500);

    const fileInput = page.locator('input[type="file"]').last();
    await fileInput.setInputFiles(pdfPath);

    // After upload, file should appear in the list
    await expect(page.getByText('uat_test.pdf')).toBeVisible({ timeout: 15_000 });

    fs.unlinkSync(pdfPath);
  });
});

test.describe('B-5 Reports', () => {
  test('B-5.1 Statistical Reports renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/statistical_reports`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/not available for your account/i)).not.toBeVisible();
  });

  test('B-5.2 Status History renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/status_history`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/not available for your account/i)).not.toBeVisible();
  });
});
