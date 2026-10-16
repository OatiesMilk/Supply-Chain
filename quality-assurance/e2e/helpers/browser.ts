import { chromium, devices, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { artifactDir, assertWriteTarget, credentials, evidence, ROLE_CONFIG, WEB_BASE, type RoleKey } from './runtime';

// SSO runs use an interactive window. Never save storageState or automate MFA.
export async function browserLogin(page: Page, role: RoleKey | 'microsoft') {
  await page.goto(`${WEB_BASE}/login`);
  if (process.env.UAT_AUTH_MODE === 'microsoft') {
    const email = process.env.UAT_MICROSOFT_EMAIL;
    if (!email) throw new Error('Blocked: set UAT_MICROSOFT_EMAIL');
    if (role !== 'microsoft' && process.env.UAT_MICROSOFT_ROLE !== role) throw new Error(`Blocked: Microsoft account is configured for ${process.env.UAT_MICROSOFT_ROLE}, not ${role}`);
    let ssoError: string | null = null;
    page.on('framenavigated', frame => {
      if (frame !== page.mainFrame()) return;
      const url = new URL(frame.url());
      if (url.origin === WEB_BASE) {
        const error = url.searchParams.get('error');
        if (error && /^[a-z_]+$/.test(error)) ssoError = error;
      }
    });
    await page.getByRole('button', { name: /sign in with microsoft/i }).click();
    // The user completes Microsoft password, consent and MFA in the headed browser.
    console.log('Complete Microsoft sign-in in the QA browser window.');
    await page.waitForURL(url => url.origin === WEB_BASE && !url.pathname.startsWith('/api/') && (url.pathname !== '/login' || !!ssoError), { timeout: 600000 }).catch(() => {
      throw new Error('Microsoft sign-in did not return to the local portal within ten minutes. Complete password and MFA in the QA browser.');
    });
    if (ssoError) {
      evidence('SSO-account-rejection.json', { error: ssoError });
      throw new Error(`Microsoft callback rejected sign-in: ${ssoError}`);
    }
    let identity: { email?: string; role?: string; status: number } = { status: 0 };
    await expect.poll(async () => {
      identity = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me');
        if (!response.ok) return { status: response.status };
        const user = await response.json();
        return { status: response.status, email: user.email, role: user.role };
      });
      return identity.status;
    }, { timeout: 15000, message: 'Portal must establish an authenticated session after Microsoft callback' }).toBe(200);
    evidence('SSO-account-identity.json', identity);
    const expectedKey = role === 'microsoft' ? process.env.UAT_MICROSOFT_ROLE : role;
    const roleNames = { sales: 'SALES_COORDINATOR', logistics: 'LOGISTICS', tass: 'TASS', admin: 'ADMIN', driver: 'DRIVER' };
    if (expectedKey && !(expectedKey in roleNames)) throw new Error('Blocked: invalid UAT_MICROSOFT_ROLE');
    const expectedRole = expectedKey ? roleNames[expectedKey as RoleKey] : undefined;
    if (identity.email?.toLowerCase() !== email.toLowerCase() || (expectedRole && identity.role !== expectedRole)) throw new Error('Blocked: Microsoft identity or portal role does not match the configured test role');
  } else {
    if (role === 'microsoft') throw new Error('Blocked: Microsoft smoke requires --sso');
    const { email, password } = credentials(role);
    await page.getByRole('button', { name: /sign in with email instead/i }).click();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForURL(url => url.origin === WEB_BASE && url.pathname !== '/login', { timeout: 15000 });
  }
}

export async function withBrowser(name: string, action: (session: {
  pageFor: (role: RoleKey | 'microsoft') => Promise<Page>;
  checkpoint: (page: Page, step: string) => Promise<void>;
}) => Promise<void>, writes = false) {
  if (writes) assertWriteTarget();
  const browser: Browser = await chromium.launch({
    headless: process.env.UAT_AUTH_MODE !== 'microsoft',
    ...(process.env.UAT_BROWSER_EXECUTABLE ? { executablePath: process.env.UAT_BROWSER_EXECUTABLE } : {}),
  });
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const errors: string[] = [];
  const checkpoints: string[] = [];
  try {
    await action({
      pageFor: async role => {
        const context = await browser.newContext(role === 'driver' ? devices['Pixel 7'] : { viewport: { width: 1280, height: 800 } });
        contexts.push(context);
        const page = await context.newPage();
        pages.push(page);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await browserLogin(page, role);
        // No tracing during authentication; network traces can contain credentials/cookies.
        // snapshots=false records actions and screenshots without network snapshots.
        await context.tracing.start({ screenshots: true, snapshots: false, sources: false });
        await page.screenshot({ path: path.join(artifactDir(), `${name}-${role}-signed-in.png`), fullPage: true });
        return page;
      },
      checkpoint: async (page, step) => {
        checkpoints.push(step);
        await page.screenshot({ path: path.join(artifactDir(), `${name}-${step}.png`), fullPage: true });
      },
    });
  } catch (error) {
    for (const [index, page] of pages.entries()) {
      // Avoid capturing Microsoft authentication pages or filled login forms.
      if (page.url().startsWith(WEB_BASE) && new URL(page.url()).pathname !== '/login') {
        await page.screenshot({ path: path.join(artifactDir(), `${name}-failure-${index}.png`), fullPage: true }).catch(() => {});
      }
    }
    evidence(`${name}-failure.json`, { error: error instanceof Error ? error.message : 'Browser failure', checkpoints });
    throw error;
  } finally {
    evidence(`${name}-console.json`, errors);
    for (const [index, context] of contexts.entries()) {
      await context.tracing.stop({ path: path.join(artifactDir(), `${name}-actions-${index}.zip`) }).catch(() => {});
    }
    await browser.close();
  }
}
export { expect, WEB_BASE, ROLE_CONFIG };
