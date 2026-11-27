import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // run sequentially — tests share a live DB
  retries: 1,
  reporter: [['html', { outputFolder: './playwright-report', open: 'never' }], ['list']],
  use: {
    // E2E_BASE_URL lets local verification target an ephemeral server port.
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 800 },
    // Store auth state per role so each suite re-uses the session
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'Sales Coordinator',
      testMatch: /sales_coordinator\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        storageState: './helpers/auth-sc.json',
      },
    },
    {
      name: 'Logistics',
      testMatch: /logistics\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        storageState: './helpers/auth-logistics.json',
      },
    },
    {
      name: 'Driver',
      testMatch: /driver\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        // Driver uses mobile viewport for the mobile dashboard
        viewport: { width: 390, height: 844 },
        storageState: './helpers/auth-driver.json',
      },
    },
    {
      name: 'Cross Role Integration',
      testMatch: /integration\.spec\.ts/,
      dependencies: ['setup'],
    },
    {
      // Logs in through the API as the sc255 fixtures from seed-rma-dispatch-e2e.ts;
      // it does not use the setup project's seed-uat sessions.
      name: 'RMA Dispatch',
      testMatch: /rma-dispatch\.spec\.ts/,
      timeout: 120_000,
      retries: 0,
      use: {
        viewport: { width: 1280, height: 900 },
        actionTimeout: 10_000,
        trace: 'retain-on-failure',
      },
    },
  ],
});
