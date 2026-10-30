import { defineConfig } from '@playwright/test';

/** Offline browser component checks: no application server, account or DB writes. */
export default defineConfig({
  testDir: './tests', testMatch: /permissions-ui\.spec\.ts/,
  outputDir: './test-results/permissions', timeout: 30000, fullyParallel: false,
  reporter: [['list']], use: { headless: true, screenshot: 'only-on-failure' },
  projects: [
    { name: 'permissions desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'permissions narrow', use: { viewport: { width: 390, height: 844 } } },
  ],
});
