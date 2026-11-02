import { expect, login, openScreen, test } from './support';

test('report Driver and Area dropdowns send selected options and Clear restores all', async ({ page }) => {
  await login(page, 'ADMIN');
  await openScreen(page, 'statistical_reports', 'ADMIN');
  const driver = page.getByRole('combobox', { name: 'Driver', exact: true });
  const area = page.getByRole('combobox', { name: 'Area', exact: true });
  await expect(driver).toBeEnabled();
  await expect(area).toBeEnabled();
  const driverValue = await driver.locator('option').nth(1).getAttribute('value');
  const areaValue = await area.locator('option').nth(1).getAttribute('value');
  expect(driverValue).toBeTruthy();
  expect(areaValue).toBeTruthy();
  await driver.selectOption(driverValue!);
  await area.selectOption(areaValue!);
  const reportResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/reports/summary');
  await page.getByRole('button', { name: 'Generate Report', exact: true }).click();
  const response = await reportResponse;
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).searchParams.get('driver')).toBe(driverValue);
  expect(new URL(response.url()).searchParams.get('area')).toBe(areaValue);
  await expect(page.getByText('Delivery Date Cohort', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(driver).toHaveValue('');
  await expect(area).toHaveValue('');
});
