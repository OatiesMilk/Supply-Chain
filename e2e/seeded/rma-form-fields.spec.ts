import { apiUrl, expect, login, openScreen, records, test } from './support';

// Read-only checks against the full seed's structured RTC slip (REC-4102):
// case number, RTC-only SS#, several contacts, a replacement-unit pair and
// separated client slip remarks vs internal Logistics notes.
const CASE = 'CAS-31417-Y4Y6Z3';

async function seededRtc(page: Parameters<typeof login>[0]) {
  const response = await page.request.get(apiUrl(`/records?search=${encodeURIComponent(CASE)}`));
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const rows: any[] = Array.isArray(body) ? body : body.rows;
  return rows.find(row => row.case_number === CASE);
}

test('API search by Case#, SS# and serial number finds the seeded RTC slip with separated remarks', async ({ page }) => {
  await login(page, 'TASS');
  const record = await seededRtc(page);
  test.skip(!record, 'Prepared seed has no structured RTC fixture (full seed REC-4102).');
  expect(record.service_slip_no).toBe('SS#60142');
  expect(record.client_remarks).toBe('SAP#12019325');
  expect(record.internal_logistics_remarks).toMatch(/Php2,000\.00/);
  expect(record.rma_contacts.map((contact: { name: string }) => contact.name)).toEqual(['Alvin Gatus', 'Raymond Oliva', 'Jefferson Sualog']);
  expect(record.line_items[0].new_serial_number).toBeTruthy();
  expect(record.line_items[0].defective_serial_number).toBeTruthy();
  for (const term of ['ss#60142', record.line_items[0].new_serial_number, record.line_items[0].defective_serial_number]) {
    const found = await page.request.get(apiUrl(`/records?search=${encodeURIComponent(term)}`));
    const body = await found.json();
    expect((Array.isArray(body) ? body : body.rows).some((row: { id: string }) => row.id === record.id), term).toBeTruthy();
  }
});

test('TASS Overview separates client slip remarks, internal Logistics notes and workflow remarks', async ({ page }) => {
  await login(page, 'TASS');
  const record = await seededRtc(page);
  test.skip(!record, 'Prepared seed has no structured RTC fixture (full seed REC-4102).');
  await page.goto(`/rma?item=${encodeURIComponent(record.id)}`);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByText(CASE).first()).toBeVisible();
  await expect(page.getByText('SS#60142').first()).toBeVisible();
  await expect(page.getByText('Alvin Gatus / Raymond Oliva / Jefferson Sualog - +639989765266').first()).toBeVisible();
  await expect(page.getByText('SAP#12019325').first()).toBeVisible();
  await expect(page.getByRole('note', { name: 'Internal Logistics Notes' })).toContainText('Php2,000.00');
  await expect(page.getByText('"UNIT REPAIRED/FOR DELIVERY"').first()).toBeVisible();
});

test('Logistics sees the internal Logistics notes in the workspace', async ({ page }) => {
  await login(page, 'LOGISTICS');
  const available = await records(page, 'RMA');
  const record = available.find(row => (row as { case_number?: string }).case_number === CASE) ?? await seededRtc(page);
  test.skip(!record, 'Prepared seed has no structured RTC fixture (full seed REC-4102).');
  await page.goto(`/rma?item=${encodeURIComponent(record.id)}`);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('note', { name: 'Internal Logistics Notes' })).toContainText('Please bring CR.');
});

test('create form shows Service Slip (SS#) only for Return to Customer Slips (no submission)', async ({ page }) => {
  await login(page, 'TASS');
  await openScreen(page, 'rma', 'TASS');
  const create = page.getByRole('button', { name: /new record|create|add record/i }).first();
  test.skip(!(await create.count()), 'RMA create entry point not found in this build.');
  await create.click();
  const category = page.locator('#create-rma-type');
  await expect(category).toBeVisible();
  await expect(page.locator('#create-rma-case-number')).toBeVisible();
  await expect(page.locator('#create-rma-client-remarks')).toBeVisible();
  await expect(page.locator('#create-rma-internal-logistics-remarks')).toBeVisible();
  await category.selectOption('Return to Customer Slip');
  await page.locator('#create-rma-service-slip').fill('SS#60142');
  await category.selectOption('Pull Out Slip');
  await expect(page.locator('#create-rma-service-slip')).toHaveCount(0);
  await category.selectOption('Return to Customer Slip');
  await expect(page.locator('#create-rma-service-slip')).toHaveValue('', { timeout: 2000 });
});
