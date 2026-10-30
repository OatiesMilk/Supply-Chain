import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

let script: string;
let css: string;
test.beforeAll(async () => {
  const result = await build({ entryPoints: [path.resolve(__dirname, '../fixtures/permissions.tsx')], bundle: true,
    write: false, platform: 'browser', format: 'iife', tsconfig: path.resolve(__dirname, '../../client/tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': '{}' } });
  script = result.outputFiles[0].text;
  const assets = path.resolve(__dirname, '../../client/dist/assets');
  const styles = readdirSync(assets).filter(file => file.endsWith('.css'));
  if (!styles.length) throw new Error('Build the current client before browser checks; actual application CSS is required.');
  // Offline fixture uses the application's declared system-font fallback. The
  // external Google font is not a prerequisite for permission interaction tests.
  css = styles.map(file => readFileSync(path.join(assets, file), 'utf8')).join('\n')
    .replace(/@import\s*(?:url\(\s*)?['"]https:\/\/fonts\.googleapis\.com[^'"]+['"]\s*\)?\s*;/g, '');
});

async function mount(page: import('@playwright/test').Page, role = 'SALES_COORDINATOR', conflict = false) {
  await page.route('**/*', route => route.abort());
  await page.setContent('<main style="padding:12px;max-width:1100px;margin:auto"><div id="root"></div><button id="leave">Other page</button></main>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.evaluate(({ role, conflict }) => (window as any).mountPermissions(role, conflict), { role, conflict });
  await expect(page.getByLabel('Filter permissions')).toBeVisible();
  // Loading a CSS file alone is not evidence it parsed and applied correctly.
  await expect(page.locator('section [class*="max-h-"]')).toHaveCSS('max-height', '512px');
  await expect(page.locator('section [class*="max-h-"]')).toHaveCSS('overflow-y', 'auto');
}

test('keyboard focus, labelled controls and actual CSS fit the viewport', async ({ page }, testInfo) => {
  await mount(page);
  await page.screenshot({ path: testInfo.outputPath('permission-editor.png') });
  const filter = page.getByLabel('Filter permissions');
  await filter.focus(); await expect(filter).toBeFocused();
  await page.keyboard.type('screen main read');
  const policy = page.getByRole('combobox', { name: 'SCREEN:main:READ', exact: true });
  await page.keyboard.press('Tab'); await expect(policy).toBeFocused();
  await expect(policy).toHaveValue('INHERIT');
  const outline = await policy.evaluate(element => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('protected Admin controls stay locked and denied Allow options explain restrictions', async ({ page }) => {
  await mount(page, 'ADMIN');
  await page.getByLabel('Filter permissions').fill('resource users write');
  await expect(page.getByRole('combobox', { name: 'RESOURCE:users:WRITE', exact: true })).toBeDisabled();
  await expect(page.getByText('Protected Admin management — locked Allow.')).toBeVisible();
});

test('409 keeps draft until refreshed review, announces status, and guards unsaved navigation', async ({ page }) => {
  await mount(page, 'SALES_COORDINATOR', true);
  await page.getByLabel('Filter permissions').fill('screen main read');
  const policy = page.getByRole('combobox', { name: 'SCREEN:main:READ', exact: true });
  await policy.selectOption('DENY');
  await page.getByRole('button', { name: 'Save permissions', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your draft is preserved' })).toBeVisible();
  await expect(policy).toHaveValue('DENY');
  await expect(page.getByRole('button', { name: 'Save permissions', exact: true })).toBeDisabled();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Other page', exact: true }).click();
  await expect(policy).toHaveValue('DENY');
  await page.getByRole('button', { name: 'Refresh for conflict review' }).click();
  await page.getByLabel('I reviewed the refreshed policy and my preserved draft.').check();
  await page.getByRole('button', { name: 'Save permissions', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Permissions saved' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).permissionFixtureWrites())).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
