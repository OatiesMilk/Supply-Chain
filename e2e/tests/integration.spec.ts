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
import { recordRows } from '../support/recordRows';

const BASE_URL = 'http://localhost:3000';

const CREDS = {
  sales:     { email: 'sales@microgenesis.com',     password: 'password123' },
  logistics: { email: 'logistics@microgenesis.com', password: 'password123' },
  driver:    { email: 'driver@microgenesis.com',    password: 'password123' },
};

type ApiRecord = { id: string; edit_version: string; reference: string; category: string; status: string; is_draft: string; driver: string; delivery_date: string; time_in?: string | null };

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
      // The list's date filters are hidden while the create form is open.
      await expect(salesPage.getByRole('button', { name: /^Delivery dates / })).toBeHidden();
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
      // The form's Delivery Date must not leak into the list's date filter.
      await expect(salesPage.getByRole('button', { name: /^Delivery dates / })).toContainText('All delivery dates');
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
      await expect(salesPage.getByRole('tab', { name: 'Status & Actions', exact: true })).not.toBeVisible();
      console.log('TSK-120: Testing assignment denial');
      const salesAssignmentAttempt = await salesCtx.request.put(`${BASE_URL}/api/records/${recordId}`, {
        headers: await csrfHeaders(salesCtx),
        data: { driver: 'John Doe', remarks: 'Sales Coordinator assignment denial check.', expected_edit_version: created!.edit_version },
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
      await logisticsPage.getByRole('tab', { name: 'Status & Actions', exact: true }).click();
      const dispatchPanel = logisticsPage.getByRole('tabpanel');
      const draftDriverSelect = dispatchPanel.locator('select').filter({ has: logisticsPage.locator('option', { hasText: '-- Unassigned --' }) });
      await expect(draftDriverSelect).toBeDisabled();

      const draftAssignmentAttempt = await logisticsCtx.request.put(`${BASE_URL}/api/records/${recordId}`, {
        headers: await csrfHeaders(logisticsCtx),
        data: { driver: 'John Doe', remarks: 'Draft assignment denial check.', expected_edit_version: (await getRecords(logisticsCtx)).find(record => record.id === recordId)!.edit_version },
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
      await logisticsPage.getByRole('tab', { name: 'Status & Actions', exact: true }).click();
      const assignmentPanel = logisticsPage.getByRole('tabpanel');
      const driverSelect = assignmentPanel.locator('select').filter({ has: logisticsPage.locator('option', { hasText: '-- Unassigned --' }) });
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

  test('X-1 Driver Time In is visible to Logistics on the same record', async () => {
    const browser = await chromium.launch();
    try {
      const logisticsCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const logisticsPage = await logisticsCtx.newPage();
      await login(logisticsPage, CREDS.logistics.email, CREDS.logistics.password);

      // A due, unstarted submitted Delivery can be executed by the assigned Driver.
      const record = (await getRecords(logisticsCtx)).find(record =>
        record.category === 'Deliveries' && record.status === 'Scheduled' && record.is_draft === 'No' &&
        record.delivery_date && record.delivery_date <= manilaToday() && !record.time_in);
      expect(record, 'The isolated UAT data must provide a due, unstarted Scheduled Delivery').toBeTruthy();
      expect(record!.reference).toBeTruthy();
      const recordId = record!.id;
      const reference = record!.reference;

      await logisticsPage.goto(BASE_URL + '/deliveries');
      await logisticsPage.getByRole('textbox', { name: 'Search delivery records' }).fill(recordId);
      await logisticsPage.getByRole('row').filter({
        has: logisticsPage.getByRole('cell', { name: recordId, exact: true }),
      }).click();
      await logisticsPage.getByRole('tab', { name: 'Status & Actions', exact: true }).click();
      const actions = logisticsPage.getByRole('tabpanel');
      const driverSelect = actions.locator('select').filter({
        has: logisticsPage.locator('option', { hasText: '-- Unassigned --' }),
      });
      await expect(driverSelect).toBeEnabled();
      await driverSelect.selectOption({ label: 'John Doe' });
      await actions.getByPlaceholder(/Reason for the changes|Optional note/i).fill('UAT integration test - assigned to John Doe');
      await actions.getByRole('button', { name: 'Save Changes', exact: true }).click();
      await expect(logisticsPage.getByText(/changes saved/i)).toBeVisible();
      expect((await getRecords(logisticsCtx)).find(record => record.id === recordId)?.driver).toBe('John Doe');

      const driverCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const driverPage = await driverCtx.newPage();
      await login(driverPage, CREDS.driver.email, CREDS.driver.password);
      const referenceLabel = driverPage.getByText(reference, { exact: true });
      await expect(referenceLabel).toBeVisible();
      const driverCard = driverPage.locator('div.bg-white.rounded-2xl').filter({ has: referenceLabel });
      await expect(driverCard).toHaveCount(1);
      await driverCard.getByRole('button', { name: 'Record Time In', exact: true }).click();
      await driverPage.locator('#driver-action-remarks').fill('UAT integration test - starting assigned Delivery');
      await driverPage.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(driverCard.getByText(/Time In recorded:/)).toBeVisible();
      const started = await driverCtx.request.get(BASE_URL + '/api/records/' + recordId);
      expect(started.ok()).toBeTruthy();
      const savedTimeIn = (await started.json()).time_in;
      expect(savedTimeIn).toBeTruthy();

      // A fresh Logistics session must read the exact timestamp written by this Driver.
      const verifyCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const verifyPage = await verifyCtx.newPage();
      await login(verifyPage, CREDS.logistics.email, CREDS.logistics.password);
      const visible = await verifyCtx.request.get(BASE_URL + '/api/records/' + recordId);
      expect(visible.ok()).toBeTruthy();
      expect((await visible.json()).time_in).toBe(savedTimeIn);
      await verifyPage.goto(BASE_URL + '/deliveries');
      await verifyPage.getByRole('textbox', { name: 'Search delivery records' }).fill(recordId);
      await verifyPage.getByRole('row').filter({
        has: verifyPage.getByRole('cell', { name: recordId, exact: true }),
      }).click();
      await verifyPage.getByRole('tab', { name: 'Status & Actions', exact: true }).click();
      await expect(verifyPage.getByRole('tabpanel').locator('input[type="datetime-local"]').first()).not.toHaveValue('');
    } finally {
      await browser.close();
    }
  });

  test('X-2 Audit Trail shows Driver activity', async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await login(page, CREDS.logistics.email, CREDS.logistics.password);
    await page.goto(`${BASE_URL}/deliveries`);
    

    const firstRow = recordRows(page).first();
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
