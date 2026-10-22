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
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 800 },
    // Store auth state per role so each suite re-uses the session
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'Dashboard', testMatch: /dashboard\.spec\.ts/ },
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
  ],
});
