import { chromium, devices } from '@playwright/test';
import { createInterface } from 'node:readline';
import path from 'node:path';

// Holds one isolated Playwright context per available role in memory for the UAT.
// Session cookies and CSRF tokens are never written to disk or echoed to stdout.
const roles = [
  { key: 'sales', name: 'Sales Coordinator', email: 'sales@microgenesis.com', env: 'UAT_PASSWORD_SC', tc: 'TC-AUTH-001', expected: ['Maria Reyes'] },
  { key: 'logistics', name: 'Logistics', email: 'logistics@microgenesis.com', env: 'UAT_PASSWORD_LOGISTICS', tc: 'TC-AUTH-002', expected: ['Assigned to Drivers Today', 'No Driver Assigned'] },
  { key: 'tass', name: 'TASS', email: 'tass@microgenesis.com', env: 'UAT_PASSWORD_TASS', tc: 'TC-AUTH-003', expected: ['Open RMA Records', 'Collections Pending'] },
  { key: 'driver', name: 'Driver', email: 'driver@microgenesis.com', env: 'UAT_PASSWORD_DRIVER', tc: 'TC-AUTH-005', expected: ['Microgenesis Field Mobile', 'John Doe', "Today's Runs", 'Accomplished', 'Remaining'] },
];
const missing = roles.filter((role) => !process.env[role.env]).map((role) => role.env);
if (missing.length) throw new Error(`Missing runtime password variables: ${missing.join(', ')}`);

const artifactDir = path.resolve(import.meta.dirname, '../artifacts/RUN-20261014-02');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const contexts = {};
const pages = {};
const consoleErrors = {};
const safe = (value) => JSON.stringify(value, (key, entry) =>
  /password|cookie|token|secret|authorization/i.test(key) ? '[redacted]' : entry);

try {
  for (const role of roles) {
    const device = role.key === 'driver' ? devices['Pixel 7'] : undefined;
    const context = await browser.newContext(device ?? (role.key === 'driver'
      ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 }
      : { viewport: { width: 1280, height: 800 } }));
    const page = await context.newPage();
    contexts[role.key] = context;
    pages[role.key] = page;
    consoleErrors[role.key] = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors[role.key].push(message.text()); });
    page.on('pageerror', (error) => consoleErrors[role.key].push(error.message));
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.innerText.includes('Checking your session...'), null, { timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: 'Sign in with email instead' }).click();
    await page.locator('input[type="email"]').fill(role.email);
    const password = process.env[role.env];
    await page.locator('input[type="password"]').fill(password);
    delete process.env[role.env];
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForFunction(() => location.pathname !== '/login', null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const body = (await page.locator('body').innerText()).toLocaleLowerCase();
    const checks = role.expected.map((text) => ({ text, visible: body.includes(text.toLocaleLowerCase()) }));
    if (role.key === 'driver') checks.push({ text: 'five SAP-DEMO runs', visible: (body.match(/sap-demo-/g) ?? []).length === 5 });
    const success = new URL(page.url()).pathname !== '/login' && checks.every((item) => item.visible);
    const screenshot = path.join(artifactDir, `${role.tc}-05-${role.key}-signed-in.png`);
    if (success) {
      await page.screenshot({ path: screenshot, fullPage: true });
      console.log(safe({ case: role.tc, role: role.name, status: 'Pass', path: new URL(page.url()).pathname, checks, session: 'in-memory only' }));
    } else {
      await page.locator('input[type="password"]').fill('').catch(() => {});
      await page.screenshot({ path: screenshot, fullPage: true });
      console.log(safe({ case: role.tc, role: role.name, status: 'Fail', path: new URL(page.url()).pathname, checks }));
    }
  }
} catch (error) {
  console.error(`Session bootstrap failed: ${String(error?.message ?? error).replace(/(password|token|authorization|cookie)(\s*[:=]\s*)[^\s,;]+/ig, '$1$2[redacted]')}`);
}

console.log('READY: in-memory Playwright sessions; send one JSON command per line, or {"op":"close"}.');
const api = async (role, method, route, body) => pages[role].evaluate(async ({ method, route, body }) => {
  const me = await fetch('/api/v1/auth/me');
  const csrf = me.headers.get('X-CSRF-Token');
  const response = await fetch(route.startsWith('/api/v1/') ? route : `/api/v1${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text.replace(/("?(?:password|token|cookie|secret|authorization)"?\s*:\s*)"?[^",}]+"?/ig, '$1"[redacted]"') };
}, { method, route, body });

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
for await (const line of rl) {
  let request;
  try { request = JSON.parse(line); } catch { process.stdout.write('{"error":"invalid JSON"}\n'); continue; }
  if (request.op === 'close') break;
  const role = request.role;
  const page = pages[role];
  if (!page) { process.stdout.write(safe({ id: request.id, error: 'role context is unavailable' }) + '\n'); continue; }
  try {
    const run = new Function('page', 'context', 'browser', 'pages', 'contexts', 'api', 'consoleErrors', `return (async () => { ${request.code ?? 'return null'} })()`);
    const result = await run(page, contexts[role], browser, pages, contexts, api, consoleErrors);
    process.stdout.write(safe({ id: request.id, result }) + '\n');
  } catch (error) {
    const message = String(error?.message ?? error)
      .replace(/(password|token|authorization|cookie)(\s*[:=]\s*)[^\s,;]+/ig, '$1$2[redacted]')
      .replace(/([?&])[^=&#]+=[^&#]*/g, '$1[redacted]');
    process.stdout.write(safe({ id: request.id, error: message }) + '\n');
  }
}
await browser.close();
