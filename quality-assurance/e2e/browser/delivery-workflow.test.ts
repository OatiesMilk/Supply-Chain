import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { withBrowser, expect, WEB_BASE } from '../helpers/browser';
import { getSession, apiRequest } from '../helpers/auth';
import { linkedDriverFixture, companyFixture } from '../helpers/fixtures';
import { QA_ROOT, manilaToday, uniqueRef } from '../helpers/runtime';

// This is a UI journey with record-audit verification. System Audit Log and
// dashboard chart requirements of TC-ADM-023 are deliberately not claimed here.
test('TS-001: create, assign, Time In, upload and complete through UI; inspect record audit (partial TC-ADM-023)', { timeout: 180000 }, async () => {
  const company = await companyFixture();
  const { profile } = await linkedDriverFixture();
  const reference = uniqueRef('QA-UI');
  await withBrowser('TS-001', async ({ pageFor, checkpoint }) => {
    const sales = await pageFor('sales');
    await sales.goto(`${WEB_BASE}/deliveries`);
    await sales.getByRole('button', { name: /new record/i }).click();
    const form = sales.locator('form');
    await form.getByPlaceholder('Type to search or scroll to browse...').first().fill(company.name);
    await form.getByRole('option', { name: company.name, exact: true }).click();
    await form.getByPlaceholder('e.g., SAP-88231').fill(reference);
    await form.locator('input[type="date"]').fill(manilaToday());
    const createdPromise = sales.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/records');
    await form.getByRole('button', { name: 'Submit', exact: true }).click();
    const created = await createdPromise;
    assert.equal(created.status(), 201);
    const record = await created.json();
    assert.ok(record.id);
    await sales.goto(`${WEB_BASE}/deliveries?item=${encodeURIComponent(record.id)}`);
    await expect(sales.getByText(reference, { exact: true }).first()).toBeVisible();
    await checkpoint(sales, '01-created');

    const logistics = await pageFor('logistics');
    await logistics.goto(`${WEB_BASE}/deliveries?item=${encodeURIComponent(record.id)}`);
    await logistics.getByRole('tab', { name: /Dispatch & Logistics/i }).click();
    const driverSelect = logistics.locator('select').filter({ has: logistics.locator('option', { hasText: profile.name }) });
    await expect(driverSelect).toHaveCount(1);
    await driverSelect.selectOption({ label: profile.name });
    await logistics.getByPlaceholder(/Reason for the changes above/).fill('QA UI driver assignment');
    await logistics.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(logistics.getByText('Dispatch & Logistics changes saved', { exact: true })).toBeVisible();
    await logistics.reload();
    await logistics.getByRole('tab', { name: /Dispatch & Logistics/i }).click();
    await expect(driverSelect).toHaveValue(profile.name);
    await checkpoint(logistics, '02-assigned');

    const driver = await pageFor('driver');
    await driver.goto(`${WEB_BASE}/driver_dashboard`);
    const card = driver.locator('div.rounded-2xl.overflow-hidden').filter({ has: driver.getByText(reference, { exact: true }) });
    await expect(card).toHaveCount(1);
    await card.getByRole('button', { name: /Record Time In/i }).click();
    await driver.getByPlaceholder('Enter remarks…').fill('QA UI arrival');
    await driver.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(card.getByText(/Time In recorded:/)).toBeVisible();
    await checkpoint(driver, '03-time-in');
    await card.locator('input[type="file"]').setInputFiles(path.join(QA_ROOT, 'e2e/fixtures/uat-photo.jpg'));
    await expect(card.getByText('uat-photo.jpg', { exact: true })).toBeVisible();
    await card.getByPlaceholder('Name of person who received the item…').fill('QA Receiver');
    await card.getByRole('button', { name: 'Accomplish', exact: true }).click();
    await driver.getByPlaceholder('Enter remarks…').fill('QA UI completion');
    await driver.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(card).toHaveCount(0);
    // The completed run itself, not a global status label, must survive reload.
    await driver.reload();
    await expect(driver.getByText(reference, { exact: true })).toBeVisible();
    await driver.getByText(reference, { exact: true }).click();
    await expect(driver.getByText('QA Receiver', { exact: false }).first()).toBeVisible();
    await checkpoint(driver, '04-completed');

    const adminSession = await getSession('admin@microgenesis.com');
    const audit = await apiRequest('GET', `/records/${record.id}/audit`, adminSession);
    assert.equal(audit.status, 200);
    assert.ok(Array.isArray(audit.data) && audit.data.length >= 4);
    for (const email of ['sales@microgenesis.com', 'logistics@microgenesis.com', 'driver@microgenesis.com']) {
      const actor = (await getSession(email)).body.name;
      assert.ok(audit.data.some((entry: any) => entry.changed_by === actor), 'Audit must attribute each role');
    }
    assert.ok(audit.data.some((entry: any) => entry.action === 'CREATE'));
    const timestamps = audit.data.map((entry: any) => Date.parse(entry.timestamp));
    assert.ok(timestamps.every((stamp: number) => Number.isFinite(stamp)));
    assert.deepEqual(timestamps, [...timestamps].sort((a: number, b: number) => b - a));
    const admin = await pageFor('admin');
    await admin.goto(`${WEB_BASE}/deliveries?item=${encodeURIComponent(record.id)}`);
    await admin.getByRole('tab', { name: 'Audit Trail', exact: true }).click();
    await expect(admin.getByText(`${audit.data.length} audit events — most recent first`, { exact: false })).toBeVisible();
    for (const actor of new Set(audit.data.map((entry: any) => entry.changed_by as string))) {
      await expect(admin.getByText(actor as string, { exact: true }).first()).toBeVisible();
    }
    for (const reason of ['QA UI driver assignment', 'QA UI arrival', 'QA UI completion']) {
      await expect(admin.getByText(reason, { exact: false }).first()).toBeVisible();
    }
    await checkpoint(admin, '05-record-audit');
  }, true);
});
