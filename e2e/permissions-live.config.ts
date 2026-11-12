import { defineConfig } from '@playwright/test';

/** Real application, real API and disposable PostgreSQL. No mocked responses. */
export default defineConfig({
  testDir: './tests', testMatch: /permissions-live\.spec\.ts/,
  outputDir: './test-results/permissions-live', timeout: 120000, fullyParallel: false, workers: 1,
  reporter: [['list']], use: { baseURL: process.env.PERMISSION_LIVE_BASE_URL || 'http://127.0.0.1:3000', headless: true, viewport: { width: 1280, height: 800 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
