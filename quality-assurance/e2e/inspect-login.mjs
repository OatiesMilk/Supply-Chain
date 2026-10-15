import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failedPaths = [];
  let pageErrorCount = 0;
  page.on('requestfailed', (request) => failedPaths.push(new URL(request.url()).pathname));
  page.on('pageerror', () => { pageErrorCount += 1; });
  const response = await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);
  await page.screenshot({ path: '../artifacts/RUN-20261014-02/login-preflight.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign in with email instead' }).click();
  await page.locator('input').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.screenshot({ path: '../artifacts/RUN-20261014-02/login-email-form.png', fullPage: true });
  const inputs = await page.locator('input').evaluateAll((els) => els.map((el) => ({
    type: el.type,
    name: el.name,
    placeholder: el.placeholder,
    ariaLabel: el.getAttribute('aria-label'),
  })));
  const buttons = await page.getByRole('button').allTextContents();
  console.log(JSON.stringify({ status: response?.status(), path: new URL(page.url()).pathname, readyState: await page.evaluate(() => document.readyState), title: await page.title(), body: (await page.locator('body').innerText()).slice(0, 500), inputs, buttons, failedPaths, pageErrorCount }));
} finally {
  await browser.close();
}
