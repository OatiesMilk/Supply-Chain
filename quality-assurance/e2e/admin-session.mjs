import { chromium } from '@playwright/test';
import { createInterface } from 'node:readline';
import path from 'node:path';

const password = process.env.UAT_PASSWORD_ADMIN;
if (!password) throw new Error('Missing runtime password variable: UAT_PASSWORD_ADMIN');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(error.message));

try {
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.body.innerText.includes('Checking your session...'), null, { timeout: 15000 }).catch(() => {});
  await page.getByRole('button', { name: 'Sign in with email instead' }).click();
  await page.locator('input[type="email"]').fill('admin@microgenesis.com');
  await page.locator('input[type="password"]').fill(password);
  delete process.env.UAT_PASSWORD_ADMIN;
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForFunction(() => location.pathname !== '/login', null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  const body = await page.locator('body').innerText();
  const success = new URL(page.url()).pathname !== '/login' && body.includes('Total Active Users') && body.includes('Audit Events Today');
  if (success) await page.screenshot({ path: path.resolve(import.meta.dirname, '../artifacts/RUN-20261014-02/TC-AUTH-004-07-admin-resumed.png'), fullPage: true });
  console.log(JSON.stringify({ case: 'TC-AUTH-004', role: 'Admin', status: success ? 'Pass' : 'Fail', path: new URL(page.url()).pathname, checks: ['Total Active Users', 'Audit Events Today'].map((text) => ({ text, visible: body.includes(text) })), session: 'in-memory only' }));
} catch (error) {
  console.error(`Admin session bootstrap failed: ${String(error?.message ?? error).replace(/(password|token|authorization|cookie)(\s*[:=]\s*)[^\s,;]+/ig, '$1$2[redacted]')}`);
}

console.log('READY: in-memory Admin Playwright session; send one JSON command per line, or {"op":"close"}.');
const api = async (method, route, body, timeoutMs = 15000) => page.evaluate(async ({ method, route, body, timeoutMs }) => {
  const me = await fetch('/api/v1/auth/me');
  const csrf = me.headers.get('X-CSRF-Token');
  const response = await fetch(route.startsWith('/api/v1/') ? route : `/api/v1${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, body: await response.text() };
}, { method, route, body, timeoutMs });

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
for await (const line of rl) {
  let request;
  try { request = JSON.parse(line); } catch { process.stdout.write('{"error":"invalid JSON"}\n'); continue; }
  if (request.op === 'close') break;
  try {
    const run = new Function('page', 'context', 'browser', 'api', 'consoleErrors', `return (async () => { ${request.code ?? 'return null'} })()`);
    const result = await run(page, context, browser, api, consoleErrors);
    process.stdout.write(JSON.stringify({ id: request.id, result }, (key, value) => /password|cookie|token|secret|authorization/i.test(key) ? '[redacted]' : value) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ id: request.id, error: String(error?.message ?? error).replace(/(password|token|authorization|cookie)(\s*[:=]\s*)[^\s,;]+/ig, '$1$2[redacted]') }) + '\n');
  }
}
await browser.close();
