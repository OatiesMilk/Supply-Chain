import { test, expect, type Browser, type Locator, type BrowserContext, type Page, type APIResponse, type Response } from '@playwright/test';

type Rma = {
  id: string; record_no?: string | null; status: string; is_draft: string; rma_reference: string;
  driver_id: string | null; driver: string; rma_version: number;
  rma_movement: string | null; rma_transport_status: string | null;
  rma_transport_started_at: string | null; rma_transport_completed_at: string | null;
  rma_received_at: string | null; rma_received_by: string | null;
  rma_recipient: string | null; rma_completed_at: string | null; rma_transport_received_by?: string | null;
  time_in: string | null; time_out: string | null;
};
type Session = { context: BrowserContext; page: Page; headers: Record<string, string> };

const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWMwTpsJAAICATMDms/iAAAAAElFTkSuQmCC', 'base64');

async function session(browser: Browser, user: number): Promise<Session> {
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
  const response = await context.request.post('/api/v1/auth/login', {
    data: { email: `sc255-${user}@example.test`, password: 'sc255-test-password' },
  });
  expect(response.status(), 'local fixture login').toBe(200);
  const csrf = response.headers()['x-csrf-token'];
  expect(csrf).toBeTruthy();
  return { context, page: await context.newPage(), headers: { 'X-CSRF-Token': csrf } };
}

async function saved(response: APIResponse | Response, expected = 200): Promise<Rma> {
  expect(response.status(), await response.text()).toBe(expected);
  return response.json();
}

async function read(s: Session, id: string): Promise<Rma> {
  return saved(await s.context.request.get(`/api/v1/records/${id}`));
}

/** The server allocates RTC<MMDDYY>-<NN> on save; the slip reference is never sent by the client. */
async function create(s: Session, movement: string, draft = false): Promise<Rma> {
  const record = await saved(await s.context.request.post('/api/v1/records', {
    headers: s.headers,
    data: {
      company_id: 'sc255-company', category: 'RMA', priority: '2 - Moderate',
      rma_type: 'Return to Customer Slip',
      area: 'Carmona', account_manager: 'RMA Test AM', delivery_date: today(),
      rma_movement: movement, is_draft: draft ? 'Yes' : 'No',
      item_type: 'Unit', item_description: 'Browser verification unit',
      line_items: [{ sku: 'SC255-UNIT', quantity: 2 }], remarks: 'Local browser fixture',
    },
  }), 201);
  expect(record.rma_reference).toMatch(/^RTC\d{6}-\d{2,}$/);
  return record;
}

async function action(s: Session, id: string, path: string, data: Record<string, unknown>, method = 'PATCH') {
  return s.context.request.fetch(`/api/v1/records/${id}/${path}`, { method, headers: s.headers, data });
}

const transport = (page: Page) => page.getByRole('region', { name: 'RMA transport', exact: true });
// A NextStepCard is a region named by its heading, so each TASS stage is located by its own title.
const step = (page: Page, name: string) => transport(page).getByRole('region', { name, exact: true });
/** Opens the Transport card's action, fills the dialog and returns its confirm button. */
async function openDialog(card: Locator, page: Page, action: 'Start transport' | 'Mark as delivered') {
  await card.getByRole('button', { name: action === 'Start transport' ? 'Start transport' : 'Mark as delivered', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: action });
  await expect(dialog).toBeVisible();
  return dialog;
}
/** The Driver app shows one job card per assigned job (#326), named "Active rma <reference>, <company>". */
const driverCard = (page: Page, reference: string) => page
  .getByRole('article', { name: `Active rma ${reference}, RMA Dispatch Test Company`, exact: true });
/** Opens the Driver card's Start/Complete confirmation sheet. */
async function openDriverSheet(page: Page, reference: string, action: 'Start transport' | 'Complete transport') {
  await driverCard(page, reference).getByRole('button', { name: action, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: action });
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * Operational views poll every 30s (OPERATIONAL_POLL_INTERVAL_MS, #283) and refetch stale data
 * when a tab becomes visible or regains focus. The observing user returns to their tab, so the
 * budget measures that refresh path instead of waiting for a background poll tick.
 */
async function refocus(page: Page) {
  await page.evaluate(() => { window.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
}

async function propagated(label: string, since: number, observer: Page, verify: () => Promise<void>, observations: Record<string, number>) {
  await refocus(observer);
  await verify();
  const elapsed = Date.now() - since;
  observations[label] = elapsed;
  expect(elapsed, `${label} propagation budget`).toBeLessThanOrEqual(5_000);
}

test('three online sessions synchronize submission, reassignment, transport/POD and TASS receipt/completion', async ({ browser }, info) => {
  const sessions: Session[] = [];
  const observations: Record<string, number> = {};
  try {
    const tass = await session(browser, 1); sessions.push(tass);
    const logistics = await session(browser, 2); sessions.push(logistics);
    const driver = await session(browser, 3); sessions.push(driver);
    const otherDriver = await session(browser, 4); sessions.push(otherDriver);
    const draft = await create(tass, 'LOGISTICS_TRANSPORT', true);
    await Promise.all([
      tass.page.goto(`/rma?item=${draft.id}`),
      logistics.page.goto('/driver_board'),
      driver.page.goto('/driver_dashboard'),
    ]);
    await expect(logistics.page.getByRole('article').filter({ hasText: draft.rma_reference })).toHaveCount(0);
    expect([403, 404]).toContain((await driver.context.request.get(`/api/v1/records/${draft.id}`)).status());
    const draftAssignment = await action(logistics, draft.id, 'rma-assignment', {
      driver_id: 'sc255-driver-3', expected_version: draft.rma_version, remarks: 'Reject draft dispatch',
    });
    expect(draftAssignment.status()).toBeGreaterThanOrEqual(400);
    await tass.page.locator('#submission-change-remarks').fill('Submit for Logistics transport');
    const submission = tass.page.waitForResponse(r => r.url().endsWith(`/records/${draft.id}/status`) && r.request().method() === 'PATCH');
    const submittedAt = Date.now();
    await tass.page.getByRole('button', { name: 'Submit', exact: true }).click();
    const submitted = await saved(await submission);
    expect(submitted.rma_reference, 'a submitted draft keeps its allocated slip reference').toBe(draft.rma_reference);
    let since = submittedAt;
    const boardCard = logistics.page.getByRole('article').filter({ hasText: draft.rma_reference });
    await propagated('submission to Logistics board', since, logistics.page, () => expect(boardCard).toBeVisible(), observations);
    await tass.page.getByRole('tab', { name: 'Status & Actions', exact: true }).click();
    await logistics.page.goto(`/rma?item=${draft.id}`);
    const actions = logistics.page.getByRole('tab', { name: 'Status & Actions', exact: true });
    await actions.click();
    // The Driver/Vehicle labels wrap their selects, so the label text runs into the first option
    // ("DriverUnassigned…"); match each combobox by its accessible name instead.
    await transport(logistics.page).getByRole('combobox', { name: /^Driver/ }).selectOption('sc255-driver-3');
    await transport(logistics.page).getByRole('combobox', { name: /^Vehicle/ }).selectOption('Van-01 (L300)');
    await transport(logistics.page).getByLabel(/^Remarks\b/).fill('Assign linked Driver');
    const assignment = logistics.page.waitForResponse(r => r.url().endsWith(`/records/${draft.id}/rma-assignment`));
    const assignedAt = Date.now();
    await transport(logistics.page).getByRole('button', { name: 'Save assignment', exact: true }).click();
    const assigned = await saved(await assignment);
    since = assignedAt;
    await propagated('assignment to Driver task', since, driver.page, () => expect(driverCard(driver.page, draft.rma_reference)).toBeVisible(), observations);
    await refocus(tass.page);
    await expect(transport(tass.page)).toContainText('RMA Driver 3');

    // A stale assignment cannot overwrite the current one, and ownership moves immediately.
    expect((await action(logistics, draft.id, 'rma-assignment', {
      driver_id: 'sc255-driver-4', expected_version: submitted.rma_version, remarks: 'Stale attempt',
    })).status()).toBe(409);
    let current = await saved(await action(logistics, draft.id, 'rma-assignment', {
      driver_id: 'sc255-driver-4', expected_version: assigned.rma_version, remarks: 'Reassign to second linked Driver',
    }));
    since = Date.now();
    await propagated('reassignment removes old Driver task', since, driver.page, () => expect(driverCard(driver.page, draft.rma_reference)).toHaveCount(0), observations);
    expect([403, 404]).toContain((await driver.context.request.get(`/api/v1/records/${draft.id}`)).status());
    expect((await otherDriver.context.request.get(`/api/v1/records/${draft.id}`)).status()).toBe(200);
    current = await saved(await action(logistics, draft.id, 'rma-assignment', {
      driver_id: 'sc255-driver-3', expected_version: current.rma_version, remarks: 'Return assignment for transport verification',
    }));
    await refocus(driver.page);
    await expect(driverCard(driver.page, draft.rma_reference)).toBeVisible();
    const startSheet = await openDriverSheet(driver.page, draft.rma_reference, 'Start transport');
    await startSheet.getByLabel('Note (optional)').fill('Begin local transport');
    const startedResponse = driver.page.waitForResponse(r => r.url().endsWith(`/records/${draft.id}/rma-transport`));
    await startSheet.getByRole('button', { name: 'Confirm', exact: true }).click();
    current = await saved(await startedResponse);
    expect(current.rma_transport_status).toBe('IN_TRANSIT');
    expect(current.status).not.toBe('Delivered');
    expect(current.rma_received_at).toBeNull();
    since = Date.parse(current.rma_transport_started_at!);
    await propagated('transport start to TASS', since, tass.page, () => expect(transport(tass.page)).toContainText('In Transit'), observations);

    // The started card holds the POD photo and Received by; the sheet asks for the remarks.
    const card = driverCard(driver.page, draft.rma_reference);
    await card.locator('input[type=file]').setInputFiles({ name: 'sc255-pod.png', mimeType: 'image/png', buffer: png });
    await card.getByLabel(/^Received by/).fill('Warehouse guard');
    const completeSheet = await openDriverSheet(driver.page, draft.rma_reference, 'Complete transport');
    await completeSheet.getByLabel(/^Remarks/).fill('Transport and POD complete');
    const finish = completeSheet.getByRole('button', { name: 'Confirm', exact: true });
    await expect(finish).toBeEnabled();
    const [completedResponse] = await Promise.all([
      driver.page.waitForResponse(r => r.url().endsWith(`/records/${draft.id}/rma-transport`)),
      finish.click(),
    ]);
    current = await saved(completedResponse);
    expect(current.rma_transport_status).toBe('COMPLETED');
    expect(current.rma_transport_completed_at).toBeTruthy();
    expect(current.status).not.toBe('Delivered');
    expect(current.rma_received_at).toBeNull();
    since = Date.parse(current.rma_transport_completed_at!);
    await propagated('transport completion to TASS', since, tass.page, () => expect(transport(tass.page)).toContainText('Complete'), observations);
    await refocus(logistics.page);
    await expect(transport(logistics.page)).toContainText('Complete');
    expect((await action(driver, draft.id, 'status', { status: 'Delivered', remarks: 'Driver must not finalize RMA', expected_version: current.rma_version })).status()).toBe(403);

    // TASS records the receipt date and status only; there is no Recipient input. The date labels wrap
    // their input and hint ("Receipt dateActual date…"), so they are matched by substring.
    await expect(transport(tass.page).getByLabel('Recipient', { exact: true })).toHaveCount(0);
    const receiptDate = step(tass.page, 'Step 1 of 2 · Physical receipt').getByLabel('Receipt date');
    await expect(receiptDate).toHaveAttribute('type', 'date');
    const today = await receiptDate.inputValue();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(receiptDate).toHaveAttribute('max', today);
    await step(tass.page, 'Step 1 of 2 · Physical receipt').getByLabel(/^Remarks\b/).fill('Physical receipt verified separately');
    const receiptResponse = tass.page.waitForResponse(r => r.url().endsWith(`/records/${draft.id}/rma-receipt`));
    await step(tass.page, 'Step 1 of 2 · Physical receipt').getByRole('button', { name: 'Confirm physical receipt', exact: true }).click();
    const received = await saved(await receiptResponse);
    expect(received.rma_received_at).toBeTruthy();
    expect(received.rma_received_by).toBe('sc255-user-1');
    expect(received.rma_recipient).toBeNull();
    expect(received.status).not.toBe('Delivered');
    await expect(step(tass.page, 'Step 2 of 2 · Complete RMA').getByLabel('Completion date')).toHaveAttribute('type', 'date');
    await step(tass.page, 'Step 2 of 2 · Complete RMA').getByLabel(/^Remarks\b/).fill('TASS final completion verified');
    const finalResponse = tass.page.waitForResponse(r => r.url().endsWith(`/records/${draft.id}/status`) && r.request().method() === 'PATCH');
    await step(tass.page, 'Step 2 of 2 · Complete RMA').getByRole('button', { name: 'Complete RMA', exact: true }).click();
    await tass.page.getByRole('dialog', { name: 'Complete this RMA?' }).getByRole('button', { name: 'Complete RMA', exact: true }).click();
    const final = await saved(await finalResponse);
    expect(final.status).toBe('Delivered');
    expect(final.rma_completed_at).toBeTruthy();
    expect(final.time_in).toBeNull();
    expect(final.time_out).toBeNull();

    // Refocus/reconnect must reconcile from the saved server state.
    await logistics.context.setOffline(true);
    await logistics.page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await logistics.context.setOffline(false);
    await logistics.page.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')); });
    since = Date.now();
    // A completed (Delivered) RMA is badged "RMA: Complete" (RecordStatus).
    await propagated('reconnect to final TASS status', since, logistics.page, () => expect(logistics.page.getByRole('region', { name: 'Record summary' })).toContainText('RMA: Complete'), observations);
    await expect(logistics.page.getByText(final.record_no!, { exact: true })).toBeVisible();
    expect((await read(tass, draft.id)).rma_version).toBe(final.rma_version);
  } finally {
    await info.attach('observed-propagation-ms', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
    console.log('RMA propagation milliseconds:', JSON.stringify(observations));
    await Promise.allSettled(sessions.map(s => s.context.close()));
  }
});

test('supplier/internal no-driver movements retain view access without dispatch, notifications or clocks', async ({ browser }) => {
  const tass = await session(browser, 1);
  const logistics = await session(browser, 2);
  const driver = await session(browser, 3);
  try {
    await logistics.page.goto('/driver_board');
    for (const method of ['SUPPLIER_COLLECTION', 'INTERNAL_NO_DRIVER']) {
      const record = await create(tass, method);
      expect(record.driver_id).toBeNull();
      expect(record.rma_transport_status).toBeNull();
      expect((await logistics.context.request.get(`/api/v1/records/${record.id}`)).status()).toBe(200);
      expect([403, 404]).toContain((await driver.context.request.get(`/api/v1/records/${record.id}`)).status());
      const capabilityResponse = await logistics.context.request.get(`/api/v1/records/${record.id}/rma-capabilities`);
      expect(capabilityResponse.ok()).toBeTruthy();
      expect((await capabilityResponse.json()).assign).toBe(false);
      expect((await action(logistics, record.id, 'rma-assignment', {
        driver_id: 'sc255-driver-3', expected_version: record.rma_version, remarks: 'Non-transport assignment denied',
      })).status()).toBeGreaterThanOrEqual(400);
      const notices = await (await logistics.context.request.get('/api/v1/notifications')).json();
      expect(notices.some((n: { record_id: string }) => n.record_id === record.id)).toBe(false);
      await expect(logistics.page.getByRole('article').filter({ hasText: record.rma_reference })).toHaveCount(0);
      const receipt = await saved(await action(tass, record.id, 'rma-receipt', {
        expected_version: record.rma_version, remarks: 'Confirm no-driver receipt',
      }, 'POST'));
      expect(receipt.rma_recipient).toBeNull();
      const complete = await saved(await action(tass, record.id, 'status', {
        status: 'Delivered', expected_version: receipt.rma_version, remarks: 'Complete without invented driver clocks',
      }));
      expect(complete.status).toBe('Delivered');
      expect(complete.time_in).toBeNull();
      expect(complete.time_out).toBeNull();
      expect(complete.rma_transport_started_at).toBeNull();
      expect(complete.rma_transport_completed_at).toBeNull();
    }
  } finally {
    await Promise.allSettled([tass.context.close(), logistics.context.close(), driver.context.close()]);
  }
});

test('concurrent assignments commit once and retain one attributed audit change', async ({ browser }) => {
  const tass = await session(browser, 1);
  const logistics = await session(browser, 2);
  try {
    const record = await create(tass, 'LOGISTICS_TRANSPORT');
    const attempts = await Promise.all([3, 4].map(index => action(logistics, record.id, 'rma-assignment', {
      driver_id: `sc255-driver-${index}`, expected_version: record.rma_version,
      remarks: `Concurrent assignment ${index}`,
    })));
    expect(attempts.map(response => response.status()).sort()).toEqual([200, 409]);
    const committed = await read(tass, record.id);
    expect(committed.rma_version).toBe(record.rma_version + 1);
    const winner = await attempts.find(response => response.status() === 200)!.json() as Rma;
    expect(committed.driver_id).toBe(winner.driver_id);
    const audit = await logistics.context.request.get(`/api/v1/records/${record.id}/audit`);
    expect(audit.ok()).toBeTruthy();
    const entries = await audit.json() as { action: string; changed_by: string; new_value: Record<string, unknown> | string }[];
    const assignments = entries.filter(entry => entry.new_value &&
      (typeof entry.new_value === 'string' ? JSON.parse(entry.new_value) : entry.new_value).driver_id);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].changed_by).toBe('RMA Test LOGISTICS 2');
  } finally {
    await Promise.allSettled([tass.context.close(), logistics.context.close()]);
  }
});

test('Logistics starts and completes RMA transport for the assigned Driver under its own name', async ({ browser }) => {
  const tass = await session(browser, 1);
  const logistics = await session(browser, 2);
  const driver = await session(browser, 3);
  try {
    const created = await create(tass, 'LOGISTICS_TRANSPORT');
    const assigned = await saved(await action(logistics, created.id, 'rma-assignment', {
      driver_id: 'sc255-driver-3', expected_version: created.rma_version, remarks: 'Assign for on-behalf transport',
    }));
    await logistics.page.goto(`/rma?item=${created.id}`);
    await logistics.page.getByRole('tab', { name: 'Status & Actions', exact: true }).click();
    await expect(transport(logistics.page)).toContainText('Recording for RMA Driver 3. This is saved under your name.');

    // Remarks are required for Logistics on start.
    expect((await action(logistics, created.id, 'rma-transport', { transport_status: 'IN_TRANSIT', expected_version: assigned.rma_version })).status()).toBe(400);
    const startDialog = await openDialog(transport(logistics.page), logistics.page, 'Start transport');
    await startDialog.getByLabel('Remarks').fill('Driver phone is dead');
    const startResponse = logistics.page.waitForResponse(r => r.url().endsWith(`/records/${created.id}/rma-transport`));
    await startDialog.getByRole('button', { name: 'Start transport', exact: true }).click();
    const started = await saved(await startResponse);
    expect(started.rma_transport_status).toBe('IN_TRANSIT');
    expect(started.rma_transport_started_at).toBeTruthy();

    // Complete needs a saved photo, Received by and remarks.
    const completeDialog = await openDialog(transport(logistics.page), logistics.page, 'Mark as delivered');
    await completeDialog.locator('input[type=file]').setInputFiles({ name: 'sc255-pod.png', mimeType: 'image/png', buffer: png });
    await completeDialog.getByLabel('Received by').fill('Warehouse guard');
    await completeDialog.getByLabel('Remarks').fill('Handed over at warehouse');
    const finish = completeDialog.getByRole('button', { name: 'Mark as delivered', exact: true });
    await expect(finish).toBeEnabled();
    const [completeResponse] = await Promise.all([
      logistics.page.waitForResponse(r => r.url().endsWith(`/records/${created.id}/rma-transport`)),
      finish.click(),
    ]);
    const completed = await saved(completeResponse);
    expect(completed.rma_transport_status).toBe('COMPLETED');
    expect(completed.rma_transport_received_by).toBe('Warehouse guard');
    expect(completed.status).not.toBe('Delivered');
    expect(completed.rma_received_at).toBeNull();

    // Attribution and the Driver's own view.
    const entries = await (await logistics.context.request.get(`/api/v1/records/${created.id}/audit`)).json() as { changed_by: string; new_value: Record<string, unknown> | string }[];
    const transportEntries = entries.filter(entry => /"rma_transport_status":\s*"(IN_TRANSIT|COMPLETED)"/.test(JSON.stringify(entry.new_value)));
    expect(transportEntries.length).toBeGreaterThanOrEqual(1);
    for (const entry of transportEntries) expect(entry.changed_by).toBe('RMA Test LOGISTICS 2');
    expect((await read(driver, created.id)).rma_transport_status).toBe('COMPLETED');

    // Logistics still cannot change RMA status, receive, or finalize.
    for (const status of ['Pending', 'On-Hold', 'Rescheduled', 'Delivered']) {
      expect((await action(logistics, created.id, 'status', { status, remarks: 'Not allowed', expected_version: completed.rma_version })).status(), status).toBe(403);
    }
    expect((await action(logistics, created.id, 'rma-receipt', { recipient: 'Me', remarks: 'Not allowed', expected_version: completed.rma_version }, 'POST')).status()).toBe(403);
  } finally {
    await Promise.allSettled([tass.context.close(), logistics.context.close(), driver.context.close()]);
  }
});
