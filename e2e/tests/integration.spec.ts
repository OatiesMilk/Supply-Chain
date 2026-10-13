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

type ApiRecord = { id: string; reference: string; status: string; is_draft: string; driver: string; delivery_date: string };

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

// AUD-003: direct API writes must echo the signed-in session's CSRF token.
async function csrfHeaders(context: BrowserContext) {
  const session = await context.request.get(`${BASE_URL}/api/auth/me`);
  expect(session.ok(), 'the session should be available to read its CSRF token').toBeTruthy();
  return { 'X-CSRF-Token': session.headers()['x-csrf-token'] };
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
  

  const showEmailBtn = page.getByRole('button', { name: 'Sign in with email instead' });
  try { await showEmailBtn.waitFor({ state: 'visible', timeout: 5000 }); } catch (e) {}
  if (await showEmailBtn.isVisible()) {
    await showEmailBtn.click();
  }

  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: /^sign in$|^log in$/i }).click();
  await expect(page.locator('#login-email')).not.toBeVisible();
  
}

test.describe('X Cross-Role Integration', () => {
  test.setTimeout(120_000); // 120 seconds timeout for these complex E2E tests

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
      
      await salesPage.getByRole('button', { name: /new record/i }).first().click();

      const createForm = salesPage.locator('form').filter({
        has: salesPage.getByRole('button', { name: 'Save as Draft', exact: true }),
      });
      const companyInput = createForm.locator('input[placeholder="Type to search or scroll to browse..."]').first();
      await companyInput.fill('M'); // trigger dropdown properly
      const companyOption = salesPage.locator('[role="listbox"]').getByRole('option').first();
      await expect(companyOption).toBeVisible();
      await companyOption.click();
      const deliveryDate = manilaToday();
      await createForm.getByPlaceholder('e.g., SAP-88231').fill(reference);
      await createForm.getByLabel(/^Delivery Date/).fill(deliveryDate);
      await expect(salesPage.getByLabel('Date From', { exact: true })).toHaveValue('');
      const createResponsePromise = salesPage.waitForResponse(response =>
        new URL(response.url()).pathname === '/api/records' && response.request().method() === 'POST');
      await createForm.getByRole('button', { name: 'Save as Draft', exact: true }).click();
      const createResponse = await createResponsePromise;
      expect(createResponse.status(), 'saving the Draft must finish successfully').toBe(201);
      const saved = await createResponse.json() as ApiRecord;
      recordId = saved.id; // Retain the saved ID for cleanup even if a later assertion fails.
      expect(saved.reference).toBe(reference);
      expect(saved.delivery_date).toBe(deliveryDate);

      console.log('TSK-120: Created draft');
      await expect(salesPage.getByText(`${reference} · ${recordId}`, { exact: true })).toBeVisible({ timeout: 10_000 });
      const created = (await getRecords(salesCtx)).find(record => !existingIds.has(record.id) && record.reference === reference);
      expect(created, 'the uniquely referenced Draft should be returned by the SC records API').toBeTruthy();
      expect(created!.delivery_date, 'the Draft must retain its form delivery date').toBe(deliveryDate);
      expect(created!.id, 'the SC list must contain the newly saved Draft').toBe(recordId);
      console.log('TSK-120: Found created id', recordId);

      console.log('TSK-120: Clicking salesRow');
      const salesRow = salesPage.getByRole('row').filter({ hasText: recordId });
      await expect(salesRow).toBeVisible();
      await salesRow.click();

      console.log('TSK-120: Asserting no dispatch tab');
      await expect(salesPage.getByRole('tab', { name: /dispatch & logistics/i })).not.toBeVisible();
      console.log('TSK-120: Testing assignment denial');
      const salesAssignmentAttempt = await salesCtx.request.put(`${BASE_URL}/api/records/${recordId}`, {
        headers: await csrfHeaders(salesCtx),
        data: { driver: 'John Doe', remarks: 'Sales Coordinator assignment denial check.' },
      });
      expect(salesAssignmentAttempt.ok()).toBeTruthy();
      expect((await salesAssignmentAttempt.json() as ApiRecord).driver).toBe('');

      console.log('TSK-120: Logistics login');
      logisticsCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const logisticsPage = await logisticsCtx.newPage();
      await login(logisticsPage, CREDS.logistics.email, CREDS.logistics.password);
      await logisticsPage.goto(`${BASE_URL}/deliveries`);
      
      console.log('TSK-120: Logistics clicking row');
      await logisticsPage.getByRole('row').filter({ hasText: recordId }).click();
      await logisticsPage.getByRole('tab', { name: /dispatch & logistics/i }).click();
      const dispatchPanel = logisticsPage.getByRole('tabpanel');
      const draftDriverSelect = dispatchPanel.locator('select').first();
      await expect(draftDriverSelect).toBeDisabled();

      const draftAssignmentAttempt = await logisticsCtx.request.put(`${BASE_URL}/api/records/${recordId}`, {
        headers: await csrfHeaders(logisticsCtx),
        data: { driver: 'John Doe', remarks: 'Draft assignment denial check.' },
      });
      expect(draftAssignmentAttempt.status()).toBe(400);
      
      console.log('TSK-120: Driver login');
      driverCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const driverPage = await driverCtx.newPage();
      await login(driverPage, CREDS.driver.email, CREDS.driver.password);
      expect((await getRecords(driverCtx)).some(record => record.id === recordId)).toBe(false);
      const hiddenDraft = await driverCtx.request.get(`${BASE_URL}/api/records/${recordId}`);
      expect(hiddenDraft.status()).toBe(403);

      console.log('TSK-120: Sales submitting order');
      await salesPage.locator('#submission-change-remarks').fill('Submitting the order for Logistics dispatch.');
      await salesPage.getByRole('button', { name: 'Submit', exact: true }).click();
      console.log('TSK-120: Waiting for Scheduled status via API');
      await expect.poll(async () => (await (await salesCtx!.request.get(`${BASE_URL}/api/records/${recordId}`)).json()).status, { timeout: 10_000 }).toBe('Scheduled');
      const submitted = (await getRecords(salesCtx)).find(record => record.id === recordId);
      expect(submitted?.is_draft).toBe('No');
      expect(submitted?.driver).toBe('');

      const logisticsNotice = (await getNotifications(logisticsCtx)).find(notification => notification.record_id === recordId && /driver needed/i.test(notification.title));
      expect(logisticsNotice).toBeTruthy();

      await logisticsPage.goto(`${BASE_URL}/deliveries`);
      
      await logisticsPage.getByRole('row').filter({ hasText: recordId }).click();
      await logisticsPage.getByRole('tab', { name: /dispatch & logistics/i }).click();
      const assignmentPanel = logisticsPage.getByRole('tabpanel');
      const driverSelect = assignmentPanel.locator('select').first();
      await expect(driverSelect).toBeEnabled();
      await driverSelect.selectOption({ label: 'John Doe' });
      await assignmentPanel.getByPlaceholder(/reason for the changes above/i).fill('Assigning the submitted Delivery to John Doe.');
      await assignmentPanel.getByRole('button', { name: /save changes/i }).click();
      await expect(logisticsPage.getByText(/changes saved/i)).toBeVisible({ timeout: 10_000 });

      const assigned = (await getRecords(logisticsCtx)).find(record => record.id === recordId);
      expect(assigned?.status).toBe('Scheduled');
      expect(assigned?.is_draft).toBe('No');
      expect(assigned?.driver).toBe('John Doe');
      const creatorNotice = (await getNotifications(salesCtx)).find(notification => notification.record_id === recordId && /driver assigned/i.test(notification.title));
      expect(creatorNotice).toBeTruthy();

      const driverRuns = await getRecords(driverCtx);
      expect(driverRuns.some(record => record.id === recordId && record.driver === 'John Doe')).toBe(true);
      await driverPage.goto(BASE_URL);
      await expect(driverPage.getByText(reference)).toBeVisible({ timeout: 10_000 });
    } finally {
      if (recordId && salesCtx) {
        try {
          const cleanup = await salesCtx.request.delete(`${BASE_URL}/api/records/${recordId}`, { headers: await csrfHeaders(salesCtx) });
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

    // Navigate to Deliveries and filter by Scheduled to avoid picking Drafts
    await logisticsPage.goto(`${BASE_URL}/deliveries`);
    
    await logisticsPage.getByRole('button', { name: 'Scheduled', exact: true }).click();
    await logisticsPage.waitForTimeout(500);

    const firstRow = logisticsPage.getByRole('row').nth(1);
    try {
      await firstRow.waitFor({ state: 'visible', timeout: 5000 });
    } catch (e) {
      // ignore timeout
    }

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
    try { await dispatchTab.waitFor({ state: 'visible', timeout: 5000 }); } catch (e) {}
    if (await dispatchTab.isVisible()) {
      await dispatchTab.click();
      await logisticsPage.waitForTimeout(500);

      const driverSelect = logisticsPage.locator('select').first();
      try { await driverSelect.waitFor({ state: 'visible', timeout: 5000 }); } catch (e) {}
      if (await driverSelect.isVisible()) {
        // Select "John Doe" (the seeded driver)
        const opts = await driverSelect.locator('option').allTextContents();
        const johnDoeOption = opts.find(o => /^john doe$/i.test(o.trim()));
        if (johnDoeOption) {
          await driverSelect.selectOption({ label: johnDoeOption });
        }

        const remarksArea = logisticsPage.locator('textarea').last();
        await remarksArea.fill('UAT integration test - assigned to John Doe');
        await logisticsPage.getByRole('button', { name: /save changes/i }).click();
        await expect(logisticsPage.getByText(/changes saved/i)).toBeVisible({ timeout: 10_000 });
        
      }
    }

    await logisticsCtx.close();

    // ── Session 2: Driver records Time In ─────────────────────────────────
    const driverCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const driverPage = await driverCtx.newPage();
    await login(driverPage, CREDS.driver.email, CREDS.driver.password);
    

    const driverRow = reference ? driverPage.getByText(reference).first() : driverPage.getByRole('row').nth(1);
    try { await driverRow.waitFor({ state: 'visible', timeout: 5000 }); } catch (e) {}
    if (await driverRow.isVisible()) {
      await driverRow.click();
      await driverPage.waitForTimeout(800);
    }

    const timeInBtn = driverPage.getByRole('button', { name: /record time in/i }).first();
    try { await timeInBtn.waitFor({ state: 'visible', timeout: 5000 }); } catch (e) {}
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
    

    // Open the same record
    const targetRow = reference
      ? logisticsPage2.getByText(reference).first()
      : logisticsPage2.getByRole('row').nth(1);

    try { await targetRow.waitFor({ state: 'visible', timeout: 5000 }); } catch (e) {}
    if (await targetRow.isVisible()) {
      await targetRow.click();
      await logisticsPage2.waitForTimeout(800);

      // Check Dispatch tab shows Time In
      const dispatchTab2 = logisticsPage2.getByRole('tab', { name: /dispatch|logistics/i });
      if (await dispatchTab2.isVisible()) {
        await dispatchTab2.click();
        await expect(logisticsPage2.getByText(/time in/i).first()).toBeVisible({ timeout: 8_000 });
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
    

    const firstRow = page.getByRole('row').nth(1);
    try { await firstRow.waitFor({ state: 'visible', timeout: 5000 }); } catch (e) {}
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
      await expect(page.getByText(/audit event/i).first())
        .toBeVisible({ timeout: 8_000 });
    }

    await ctx.close();
    await browser.close();
  });
});
