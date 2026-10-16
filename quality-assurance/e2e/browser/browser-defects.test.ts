import { test } from 'node:test';
import { withBrowser, expect, WEB_BASE } from '../helpers/browser';

test('TC-ACC-001: Sales sidebar offers approved Calendar and Reports modules (DEF-003)', async () => {
  await withBrowser('TC-ACC-001', async ({ pageFor, checkpoint }) => {
    const page = await pageFor('sales');
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('button', { name: /calendar/i })).toBeVisible();
    await expect(nav.getByRole('button', { name: /reports/i })).toBeVisible();
    await checkpoint(page, '01-approved-modules');
  });
});

test('TC-SKU-002: Admin SKU Master exposes a create control (DEF-024, UI subset)', async () => {
  await withBrowser('TC-SKU-002', async ({ pageFor, checkpoint }) => {
    const page = await pageFor('admin');
    await page.goto(`${WEB_BASE}/inventory`);
    await expect(page.getByRole('button', { name: /create sku|new sku|add sku/i })).toBeVisible();
    await checkpoint(page, '01-create-control');
  });
});

test('TC-ACC-002: Sales cannot open Admin Panel by URL', async () => {
  await withBrowser('TC-ACC-002', async ({ pageFor, checkpoint }) => {
    const page = await pageFor('sales');
    await page.goto(`${WEB_BASE}/admin`);
    await expect(page).not.toHaveURL(/\/admin(?:\?|$)/);
    await expect(page.getByRole('navigation').getByRole('button', { name: /^Admin Panel/ })).toHaveCount(0);
    await checkpoint(page, '01-admin-denied');
  });
});
