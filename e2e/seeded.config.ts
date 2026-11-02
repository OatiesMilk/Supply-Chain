import { defineConfig } from '@playwright/test';
import { seededTargets } from './seeded/targets';

const { baseURL } = seededTargets();

// Deliberately separate from tests/global.setup.ts and the mutating UAT suites.
// Services and seed data are supplied by the operator; never started/reset here.
export default defineConfig({
  testDir: './seeded',
  testMatch: /.*\.spec\.ts/,
  outputDir: './test-results/seeded',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
    // Never persist login payloads, session cookies or storage state as traces.
    trace: 'off',
    video: 'off',
  },
});
