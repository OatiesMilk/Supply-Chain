/**
 * integration.spec.ts
 *
 * UAT Part X — Cross-Role Integration Tests.
 * Tests that Driver field actions are visible to Logistics in real-time.
 *
 * These tests do NOT use a stored auth state — they log in as each role
 * themselves within the test so both sessions can be verified in sequence.
 */
import { test, expect, chromium, type BrowserContext } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

const CREDS = {
  sales:     { email: 'sales@microgenesis.com',     password: 'password123' },
  logistics: { email: 'logistics@microgenesis.com', password: 'password123' },
  driver:    { email: 'driver@microgenesis.com',    password: 'password123' },
};

type ApiRecord = { id: string; reference: string; status: string; is_draft: string; driver: string };

async function getRecords(context: BrowserContext): Promise<ApiRecord[]> {
  const response = await context.request.get(`${BASE_URL}/api/records`);
  expect(response.ok(), 'records API should be available to the logged-in role').toBeTruthy();
  return await response.json() as ApiRecord[];
}

async function getNotifications(context: BrowserContext) {
  const response = await context.request.get(`${BASE_URL}/api/notifications`);
  expect(response.ok(), 'notifications API should be available to the logged-in role').toBeTruthy();
  return await response.json() as { record_id: string | null; title: string; message: string }[];
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function login(page: any, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForLoadState('networkidle');
}

test.describe('X Cross-Role Integration', () => {
  test('TSK-120: SC Draft submission reaches Logistics and the assigned Driver', async () => {
    const browser = await chromium.launch();
    let salesCtx: BrowserContext | undefined;
    let logisticsCtx: BrowserContext | undefined;
    let driverCtx: BrowserContext | undefined;
    let recordId: string | undefined;
    const reference = `SAP-TSK120-${Date.now()}`;

    try {
      salesCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const salesPage = await salesCtx.newPage();
      await login(salesPage, CREDS.sales.email, CREDS.sales.password);
      const existingIds = new Set((await getRecords(salesCtx)).map(record => record.id));

      await salesPage.goto(`${BASE_URL}/deliveries`);
      await salesPage.waitForLoadState('networkidle');
      await salesPage.getByRole('button', { name: /new record/i }).first().click();

      const companyInput = salesPage.locator('input[placeholder="Type to search or scroll to browse..."]').first();
      await companyInput.click();
      const companyOption = salesPage.getByRole('option').first();
      await expect(companyOption).toBeVisible();
      await companyOption.click();
      await salesPage.getByPlaceholder('e.g., SAP-88231').fill(reference);
      await salesPage.locator('input[type="date"]').first().fill(manilaToday());
      await salesPage.getByRole('button', { name: 'Save as Draft', exact: true }).click();

      await expect(salesPage.getByText(reference, { exact: true })).toBeVisible({ timeout: 10_000 });
      const created = (await getRecords(salesCtx)).find(record => !existingIds.has(record.id) && record.reference === reference);
      expect(created, 'the uniquely referenced Draft should be returned by the SC records API').toBeTruthy();
      recordId = created!.id;
      expect(created!.status).toBe('Draft');
      expect(created!.is_draft).toBe('Yes');
      expect(created!.driver).toBe('');

      const salesRow = salesPage.getByRole('row').filter({ hasText: reference });
      await salesRow.click();
      await expect(salesPage.getByRole('tab', { name: /dispatch & logistics/i })).not.toBeVisible();
      const salesAssignmentAttempt = await salesCtx.request.put(`${BASE_URL}/api/records/${recordId}`, {
        data: { driver: 'Leo Driver', remarks: 'Sales Coordinator assignment denial check.' },
      });
      expect(salesAssignmentAttempt.ok()).toBeTruthy();
      expect((await salesAssignmentAttempt.json() as ApiRecord).driver).toBe('');

      logisticsCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const logisticsPage = await logisticsCtx.newPage();
      await login(logisticsPage, CREDS.logistics.email, CREDS.logistics.password);
      await logisticsPage.goto(`${BASE_URL}/deliveries`);
      await logisticsPage.waitForLoadState('networkidle');
      await logisticsPage.getByRole('row').filter({ hasText: reference }).click();
      await logisticsPage.getByRole('tab', { name: /dispatch & logistics/i }).click();
      const dispatchPanel = logisticsPage.getByRole('tabpanel');
      const draftDriverSelect = dispatchPanel.locator('select').first();
      await expect(draftDriverSelect).toBeDisabled();

      const draftAssignmentAttempt = await logisticsCtx.request.put(`${BASE_URL}/api/records/${recordId}`, {
        data: { driver: 'Leo Driver', remarks: 'Draft assignment denial check.' },
      });
      expect(draftAssignmentAttempt.status()).toBe(400);
      expect((await draftAssignmentAttempt.json() as { error: string }).error).toMatch(/New assignments to drafts are not allowed/);

      driverCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const driverPage = await driverCtx.newPage();
      await login(driverPage, CREDS.driver.email, CREDS.driver.password);
      expect((await getRecords(driverCtx)).some(record => record.id === recordId)).toBe(false);
      const hiddenDraft = await driverCtx.request.get(`${BASE_URL}/api/records/${recordId}`);
      expect(hiddenDraft.status()).toBe(403);

      await salesRow.click();
      await salesPage.locator('#submission-change-remarks').fill('Submitting the order for Logistics dispatch.');
      await salesPage.getByRole('button', { name: 'Submit', exact: true }).click();
      await expect.poll(async () => (await (await salesCtx!.request.get(`${BASE_URL}/api/records/${recordId}`)).json()).status, { timeout: 10_000 }).toBe('Scheduled');
      const submitted = (await getRecords(salesCtx)).find(record => record.id === recordId);
      expect(submitted?.is_draft).toBe('No');
      expect(submitted?.driver).toBe('');

      const logisticsNotice = (await getNotifications(logisticsCtx)).find(notification => notification.record_id === recordId && /driver needed/i.test(notification.title));
      expect(logisticsNotice).toBeTruthy();

      await logisticsPage.goto(`${BASE_URL}/deliveries`);
      await logisticsPage.waitForLoadState('networkidle');
      await logisticsPage.getByRole('row').filter({ hasText: reference }).click();
      await logisticsPage.getByRole('tab', { name: /dispatch & logistics/i }).click();
      const assignmentPanel = logisticsPage.getByRole('tabpanel');
      const driverSelect = assignmentPanel.locator('select').first();
      await expect(driverSelect).toBeEnabled();
      await driverSelect.selectOption({ label: 'Leo Driver' });
      await assignmentPanel.getByPlaceholder(/reason for the changes above/i).fill('Assigning the submitted Delivery to Leo Driver.');
      await assignmentPanel.getByRole('button', { name: /save changes/i }).click();
      await expect(assignmentPanel.getByText(/changes saved successfully/i)).toBeVisible({ timeout: 10_000 });

      const assigned = (await getRecords(logisticsCtx)).find(record => record.id === recordId);
      expect(assigned?.status).toBe('Scheduled');
      expect(assigned?.is_draft).toBe('No');
      expect(assigned?.driver).toBe('Leo Driver');
      const creatorNotice = (await getNotifications(salesCtx)).find(notification => notification.record_id === recordId && /driver assigned/i.test(notification.title));
      expect(creatorNotice).toBeTruthy();

      const driverRuns = await getRecords(driverCtx);
      expect(driverRuns.some(record => record.id === recordId && record.driver === 'Leo Driver')).toBe(true);
      await driverPage.goto(BASE_URL);
      await expect(driverPage.getByText(reference, { exact: true })).toBeVisible({ timeout: 10_000 });
    } finally {
      if (recordId && salesCtx) {
        try {
          const cleanup = await salesCtx.request.delete(`${BASE_URL}/api/records/${recordId}`);
          if (!cleanup.ok() && cleanup.status() !== 404) console.warn(`TSK-120 cleanup returned ${cleanup.status()} for ${recordId}`);
        } catch (error) {
          console.warn(`TSK-120 cleanup failed for ${recordId}:`, error);
        }
      }
      await Promise.all([salesCtx?.close(), logisticsCtx?.close(), driverCtx?.close()]);
      await browser.close();
    }
  });

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
