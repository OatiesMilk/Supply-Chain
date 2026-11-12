import { chromium, devices } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const roles = [
  { key: 'sales', tc: 'TC-AUTH-001', name: 'Sales Coordinator', email: 'sales@microgenesis.com', env: 'UAT_PASSWORD_SC', expected: ['Maria Reyes'] },
  { key: 'logistics', tc: 'TC-AUTH-002', name: 'Logistics', email: 'logistics@microgenesis.com', env: 'UAT_PASSWORD_LOGISTICS', expected: ['Assigned to Drivers Today', 'No Driver Assigned'] },
  { key: 'tass', tc: 'TC-AUTH-003', name: 'TASS', email: 'tass@microgenesis.com', env: 'UAT_PASSWORD_TASS', expected: ['Open RMA Records', 'Collections Pending'] },
  { key: 'admin', tc: 'TC-AUTH-004', name: 'Admin', email: 'admin@microgenesis.com', env: 'UAT_PASSWORD_ADMIN', expected: ['Total Active Users', 'Audit Events Today'] },
  { key: 'driver', tc: 'TC-AUTH-005', name: 'Driver', email: 'driver@microgenesis.com', env: 'UAT_PASSWORD_DRIVER', expected: ['Microgenesis Field Mobile', 'John Doe', "Today's Runs", 'Accomplished', 'Remaining'] },
];

const missing = roles.filter((role) => !process.env[role.env]).map((role) => role.env);
if (missing.length) {
  console.error(`Missing runtime password variables: ${missing.join(', ')}`);
  process.exit(2);
}

const artifactDir = path.resolve(import.meta.dirname, '../artifacts/RUN-20261014-02');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const role of roles) {
    const mobile = role.key === 'driver' ? devices['Pixel 7'] : undefined;
    const context = await browser.newContext(mobile ?? (role.key === 'driver'
      ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 }
      : { viewport: { width: 1280, height: 800 } }));
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    const screenshot = path.join(artifactDir, `${role.tc}-05-${role.key}-signed-in.png`);
    try {
      await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.body.innerText.includes('Checking your session...'), null, { timeout: 15000 }).catch(() => {});
      await page.getByRole('button', { name: 'Sign in with email instead' }).click();
      await page.locator('input[type="email"]').fill(role.email);
      await page.locator('input[type="password"]').fill(process.env[role.env]);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.waitForFunction(() => location.pathname !== '/login', null, { timeout: 15000 }).catch(() => {});

      const pathname = new URL(page.url()).pathname;
      const body = await page.locator('body').innerText();
      const normalizedBody = body.toLocaleLowerCase();
      const checks = role.expected.map((text) => ({ text, visible: normalizedBody.includes(text.toLocaleLowerCase()) }));
      if (role.key === 'driver') checks.push({ text: 'five SAP-DEMO runs', visible: (body.match(/SAP-DEMO-/g) ?? []).length === 5 });
      const success = pathname !== '/login' && checks.every((check) => check.visible);

      if (success) {
        await page.screenshot({ path: screenshot, fullPage: true });
        console.log(JSON.stringify({ case: role.tc, role: role.name, status: 'Pass', path: pathname, checks, session: 'in-memory only' }));
      } else {
        await page.locator('input[type="password"]').fill('').catch(() => {});
        await page.screenshot({ path: screenshot, fullPage: true });
        const safeErrors = consoleErrors.map((message) => message
          .replace(/(password|token|authorization|cookie)(\s*[:=]\s*)[^\s,;]+/ig, '$1$2[redacted]')
          .replace(/([?&])[^=&#]+=[^&#]*/g, '$1[redacted]'));
        await writeFile(path.join(artifactDir, `${role.tc}-console.txt`), safeErrors.join('\n') || 'No browser console errors captured.\n');
        console.log(JSON.stringify({ case: role.tc, role: role.name, status: 'Fail', path: pathname, checks }));
      }
    } catch (error) {
      await page.locator('input[type="password"]').fill('').catch(() => {});
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
      const message = String(error?.message ?? error)
        .replace(/(password|token|authorization|cookie)(\s*[:=]\s*)[^\s,;]+/ig, '$1$2[redacted]')
        .replace(/([?&])[^=&#]+=[^&#]*/g, '$1[redacted]');
      await writeFile(path.join(artifactDir, `${role.tc}-console.txt`), `Harness error: ${message}\n`);
      console.log(JSON.stringify({ case: role.tc, role: role.name, status: 'Fail', error: message }));
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
