/**
 * global.setup.ts
 *
 * Runs once before all test suites.
 * Logs in as each role and saves the auth cookie to a JSON file
 * so individual test suites can skip the login step.
 */
import { chromium, expect, test as setup } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';

// Seeded credentials — matches server/prisma/seeds/users.ts
const ROLES = [
  { role: 'sc',        email: 'sales@microgenesis.com',     password: 'password123', file: 'auth-sc.json' },
  { role: 'logistics', email: 'logistics@microgenesis.com', password: 'password123', file: 'auth-logistics.json' },
  { role: 'driver',    email: 'driver@microgenesis.com',    password: 'password123', file: 'auth-driver.json' },
];

async function loginAndSave(email: string, password: string, filePath: string) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel(/email/i)).not.toBeVisible();

  await context.storageState({ path: filePath });
  await browser.close();
  console.log(`  ✓ Saved auth state for ${email} → ${path.basename(filePath)}`);
}

setup('authenticate seeded roles', async () => {
  setup.setTimeout(90_000);
  const helpersDir = path.join(__dirname, '../helpers');
  if (!fs.existsSync(helpersDir)) fs.mkdirSync(helpersDir, { recursive: true });

  console.log('\n🔐 Saving auth state for each role...');
  for (const { email, password, file } of ROLES) {
    const filePath = path.join(helpersDir, file);
    await loginAndSave(email, password, filePath);
  }
});
