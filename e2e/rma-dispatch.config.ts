import { defineConfig } from '@playwright/test';

// Services are started separately; the runner never starts or resets them.
export default defineConfig({
  testDir: './tests',
  testMatch: /rma-dispatch\.spec\.ts/,
  outputDir: './test-results/rma-dispatch',
  timeout: 120_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    actionTimeout: 10_000,
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
