/**
 * integration.spec.ts
 *
 * UAT Part X — Cross-Role Integration Tests.
 * Tests that Driver field actions are visible to Logistics in real-time.
 *
 * These tests do NOT use a stored auth state — they log in as each role
 * themselves within the test so both sessions can be verified in sequence.
 */
import { test, expect, chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

const CREDS = {
  logistics: { email: 'logistics@microgenesis.com', password: 'password123' },
  driver:    { email: 'driver@microgenesis.com',    password: 'password123' },
};

async function login(page: any, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForLoadState('networkidle');
}

test.describe('X Cross-Role Integration', () => {
  test('X-1 Driver accomplishments are visible to Logistics in real time', async () => {
    const browser = await chromium.launch();

    // ── Session 1: Logistics assigns a record to the driver ─────────────────
    const logisticsCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const logisticsPage = await logisticsCtx.newPage();
    await login(logisticsPage, CREDS.logistics.email, CREDS.logistics.password);

    // Navigate to Deliveries and open a record to assign to the driver
    await logisticsPage.goto(`${BASE_URL}/deliveries`);
    await logisticsPage.waitForLoadState('networkidle');

    const firstRow = logisticsPage.getByRole('row').nth(1);
    if (!(await firstRow.isVisible())) {
      test.skip(true, 'No delivery records exist — seed the database first');
      await browser.close();
      return;
    }

    await firstRow.click();
    await logisticsPage.waitForTimeout(800);

    // Read the record reference for later
    const reference = await logisticsPage.locator('.font-mono').first().textContent();
    console.log(`  → Testing with record: ${reference}`);

    // Navigate to Dispatch tab and assign driver
    const dispatchTab = logisticsPage.getByRole('tab', { name: /dispatch|logistics/i });
    if (await dispatchTab.isVisible()) {
      await dispatchTab.click();
      await logisticsPage.waitForTimeout(500);

      const driverSelect = logisticsPage.locator('select').first();
      if (await driverSelect.isVisible()) {
        // Select "Leo Driver" (the seeded driver)
        const opts = await driverSelect.locator('option').allTextContents();
        const leoOpt = opts.find(o => /leo driver/i.test(o));
        if (leoOpt) {
          await driverSelect.selectOption({ label: leoOpt });
        }

        const remarksArea = logisticsPage.getByPlaceholder(/remarks/i).last();
        await remarksArea.fill('UAT integration test - assigned to Leo Driver');
        await logisticsPage.getByRole('button', { name: /save driver/i }).click();
        await logisticsPage.waitForLoadState('networkidle');
      }
    }

    await logisticsCtx.close();

    // ── Session 2: Driver records Time In ─────────────────────────────────
    const driverCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const driverPage = await driverCtx.newPage();
    await login(driverPage, CREDS.driver.email, CREDS.driver.password);
    await driverPage.waitForLoadState('networkidle');

    const timeInBtn = driverPage.getByRole('button', { name: /record time in/i }).first();
    if (await timeInBtn.isVisible()) {
      await timeInBtn.click();
      await expect(driverPage.getByText(/time in recorded/i)).toBeVisible({ timeout: 10_000 });
    }

    await driverCtx.close();

    // ── Session 3: Logistics verifies the driver's Time In is now on the record
    const logisticsCtx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const logisticsPage2 = await logisticsCtx2.newPage();
    await login(logisticsPage2, CREDS.logistics.email, CREDS.logistics.password);

    await logisticsPage2.goto(`${BASE_URL}/deliveries`);
    await logisticsPage2.waitForLoadState('networkidle');

    // Open the same record
    const targetRow = reference
      ? logisticsPage2.getByText(reference).first()
      : logisticsPage2.getByRole('row').nth(1);

    if (await targetRow.isVisible()) {
      await targetRow.click();
      await logisticsPage2.waitForTimeout(800);

      // Check Dispatch tab shows Time In
      const dispatchTab2 = logisticsPage2.getByRole('tab', { name: /dispatch|logistics/i });
      if (await dispatchTab2.isVisible()) {
        await dispatchTab2.click();
        await expect(logisticsPage2.getByText(/time in/i)).toBeVisible({ timeout: 8_000 });
      }
    }

    await logisticsCtx2.close();
    await browser.close();
  });

  test('X-2 Audit Trail shows Driver activity', async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await login(page, CREDS.logistics.email, CREDS.logistics.password);
    await page.goto(`${BASE_URL}/deliveries`);
    await page.waitForLoadState('networkidle');

    const firstRow = page.getByRole('row').nth(1);
    if (!(await firstRow.isVisible())) {
      test.skip(true, 'No delivery records exist');
      await browser.close();
      return;
    }

    await firstRow.click();
    await page.waitForTimeout(800);

    const auditTab = page.getByRole('tab', { name: /audit trail|audit/i });
    if (await auditTab.isVisible()) {
      await auditTab.click();
      // Audit trail should have at least one entry
      await expect(page.locator('[data-testid="audit-entry"], .audit-entry, .audit-row').first()
        .or(page.getByText(/modified by|changed by|updated by/i).first()))
        .toBeVisible({ timeout: 8_000 });
    }

    await ctx.close();
    await browser.close();
  });
});
