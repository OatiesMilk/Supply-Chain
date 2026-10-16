import { test } from 'node:test';
import { withBrowser, expect } from '../helpers/browser';

test('Microsoft account smoke: requested identity reaches its authorized portal screen', { timeout: 640000 }, async () => {
  await withBrowser('SSO-account', async ({ pageFor, checkpoint }) => {
    const page = await pageFor('microsoft');
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
    await expect(page.locator('body')).not.toContainText('Checking your session...');
    await checkpoint(page, '01-authenticated-role-screen');
  });
});
