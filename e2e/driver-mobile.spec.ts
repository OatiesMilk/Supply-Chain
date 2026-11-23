import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://localhost:3000';
const DRIVER = { email: 'driver@microgenesis.com', password: 'password123' };
const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts', 'driver-mobile');

type Account = { email: string; password: string };

async function loginAs(page: Page, account: Account) {
  await page.goto('/');
  const emailLogin = page.getByRole('button', { name: /sign in with email instead/i });
  if (await emailLogin.isVisible().catch(() => false)) await emailLogin.click();
  await page.locator('#login-email').fill(account.email);
  await page.locator('#login-password').fill(account.password);
  await page.getByRole('button', { name: /^sign in$|^log in$/i }).click();
  await expect(page.locator('#login-email')).not.toBeVisible({ timeout: 20_000 });
}

async function openDriver(page: Page) {
  await loginAs(page, DRIVER);
  await expect(page.getByRole('heading', { name: 'Driver dashboard' })).toBeVisible();
  await expect(page.locator('#driver-run-list')).toContainText(/Active work|No records in this queue|No runs ready for execution today/);
}

async function saveScreenshot(page: Page, filename: string) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, filename), animations: 'disabled' });
}

async function assertTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has a visible bounding box`).not.toBeNull();
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function firstEnabled(page: Page, name: RegExp) {
  for (const candidate of await page.getByRole('button', { name }).all()) {
    if (await candidate.isVisible() && await candidate.isEnabled()) return candidate;
  }
  return null;
}

async function openAndCancelAction(page: Page, pattern: RegExp, expectedAction: RegExp, label: string) {
  const action = await firstEnabled(page, pattern);
  if (!action) test.skip(true, `No enabled ${label} action exists in the current seeded driver queue.`);
  await action!.click();
  const dialog = page.getByRole('dialog', { name: label });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: label })).toBeVisible();
  await expect(dialog).toContainText(expectedAction);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('Driver dashboard mobile redesign', () => {
  test('AC1, AC2, AC4, AC5, AC6, AC7, AC9, AC10, AC11, AC15 and AC19 at 393x852', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
    await openDriver(page);

    const list = page.locator('#driver-run-list');
    const cards = list.locator('article[aria-label^="Active "]');
    const cardCount = await cards.count();
    expect(cardCount, 'driver has an active run for mobile checks').toBeGreaterThan(0);

    const footer = page.locator('[data-run-list-footer]');
    await expect(footer).toBeVisible();
    const footerText = await footer.innerText();
    expect(footerText).toMatch(/Showing\s*1\s*[–-]\s*\d+\s*of\s*\d+\s*records/i);
    const footerPosition = await list.evaluate(element => {
      const runCards = element.querySelectorAll('article');
      const listFooter = element.querySelector('[data-run-list-footer]');
      if (!runCards.length || !listFooter) return false;
      return !!(runCards[runCards.length - 1].compareDocumentPosition(listFooter) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(footerPosition, 'pagination/footer follows the final job card').toBe(true);
    const pageButtons = await page.getByRole('navigation', { name: /pagination navigation/i }).getByRole('button').count();
    expect(pageButtons, 'single-page queue has no page number buttons').toBe(0);

    const runListTop = await cards.first().boundingBox();
    expect(runListTop).not.toBeNull();
    expect(runListTop!.y, 'first job card begins above the 852px fold').toBeLessThan(852);

    const longNameCard = cards.filter({ hasText: 'Jollibee Foods Corp. - Quezon City Cluster' }).first();
    if (await longNameCard.count()) {
      const header = longNameCard.locator('[data-card-header]');
      const order = await header.evaluate(element => {
        const badges = element.querySelector('[data-card-badges]');
        const customer = element.querySelector('[data-customer-name]');
        const reference = element.querySelector('[data-record-reference]');
        return !!badges && !!customer && !!reference
          && !!(badges.compareDocumentPosition(customer) & Node.DOCUMENT_POSITION_FOLLOWING)
          && !!(customer.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(order, 'card header order is badges, customer, reference').toBe(true);
      const customer = longNameCard.locator('[data-customer-name]');
      await expect(customer).toHaveAttribute('title', 'Jollibee Foods Corp. - Quezon City Cluster');
      const nameMetrics = await customer.evaluate(element => {
        const style = getComputedStyle(element);
        return { height: element.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight), clamp: style.webkitLineClamp };
      });
      expect(nameMetrics.clamp).toBe('2');
      expect(nameMetrics.height).toBeLessThanOrEqual(nameMetrics.lineHeight * 2 + 2);

      const reference = longNameCard.locator('[data-record-reference]');
      const fullReference = await reference.getAttribute('title');
      expect(fullReference).toMatch(/^SAP-/);
      await expect(reference).toHaveAttribute('aria-label', `Copy reference ${fullReference}`);
      const referenceText = reference.locator('.truncate');
      const referenceStyle = await referenceText.evaluate(element => {
        const style = getComputedStyle(element);
        return { textOverflow: style.textOverflow, whiteSpace: style.whiteSpace, height: element.getBoundingClientRect().height };
      });
      expect(referenceStyle.textOverflow).toBe('ellipsis');
      expect(referenceStyle.whiteSpace).toBe('nowrap');
      expect(referenceStyle.height).toBeLessThan(24);
    } else {
      test.info().annotations.push({ type: 'AC4/5 data limit', description: 'The current driver queue has no Jollibee long-name fixture.' });
    }

    const visibleText = await page.locator('body').innerText();
    expect(visibleText).not.toMatch(/\bREC-(?:DEMO-|[0-9a-f]{8}-)/i);
    const noReference = cards.locator('[data-record-reference]').filter({ hasText: 'No reference yet' });
    console.log(`[AC6] Active queue records without a reference: ${await noReference.count()}`);
    if (await noReference.count()) await expect(noReference.first()).toHaveText('No reference yet');

    const dueLines = list.locator('[data-due-date]');
    expect(await dueLines.count()).toBeGreaterThan(0);
    for (const dueText of await dueLines.allTextContents()) {
      expect(dueText).toMatch(/^Due [A-Z][a-z]{2} \d{1,2}, \d{4}(?: · \d+ days? late)?$/);
    }

    const queueNav = page.getByRole('navigation', { name: 'Run queues' });
    const activeTab = queueNav.getByRole('button', { name: /^Active\s*\(\d+\)$/i });
    const doneTab = queueNav.getByRole('button', { name: /^Done today\s*\(\d+\)$/i });
    await expect(activeTab).toBeVisible();
    await expect(doneTab).toBeVisible();
    const [activeBox, doneBox] = await Promise.all([activeTab.boundingBox(), doneTab.boundingBox()]);
    expect(activeBox).not.toBeNull();
    expect(doneBox).not.toBeNull();
    expect(Math.abs(activeBox!.width - doneBox!.width)).toBeLessThanOrEqual(1);
    expect(activeBox!.height).toBeGreaterThanOrEqual(44);
    expect(doneBox!.height).toBeGreaterThanOrEqual(44);

    const tiles = page.locator('[data-kpi-tile]');
    expect(await tiles.count()).toBe(3);
    const tileBoxes = await Promise.all((await tiles.all()).map(tile => tile.boundingBox()));
    expect(tileBoxes.every(box => box !== null)).toBe(true);
    expect(Math.max(...tileBoxes.map(box => box!.y)) - Math.min(...tileBoxes.map(box => box!.y))).toBeLessThanOrEqual(1);
    const subtitle = page.locator('[data-page-subtitle]');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toHaveText(/^[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}$/);

    await saveScreenshot(page, 'active-393.png');
    await doneTab.click();
    await expect(page.locator('[data-queue-hint]')).toHaveText('Includes RMA items waiting for TASS receipt.');
    const accomplishedHeading = page.getByRole('heading', { name: /^Accomplished \(\d+\)$/i });
    const emptyQueue = page.getByText('No records in this queue.');
    await expect(accomplishedHeading.or(emptyQueue).first()).toBeVisible({ timeout: 15_000 });
    await saveScreenshot(page, 'done-today-393.png');

    const copyButton = page.getByRole('button', { name: /^Copy reference /i }).first();
    if (await copyButton.count()) {
      const copiedValue = await copyButton.getAttribute('title');
      await assertTouchTarget(copyButton, 'copy reference control');
      await copyButton.click();
      await expect(page.getByText('Reference copied')).toBeVisible();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(copiedValue);
    } else {
      test.info().annotations.push({ type: 'AC19 data limit', description: 'Done today has no copyable reference in the current seed.' });
    }
  });

  test('AC3 changes page to the focused top of the run list when the queue has more than 25 records', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openDriver(page);
    const footerText = await page.locator('[data-run-list-footer]').innerText();
    const match = footerText.match(/Showing\s*\d+\s*[–-]\s*\d+\s*of\s*(\d+)\s*records/i);
    expect(match, `pagination total is readable: ${footerText}`).not.toBeNull();
    const total = Number(match![1]);
    test.skip(total <= 25, `AC3 needs more than 25 records in a queue; active queue has ${total}.`);

    const pagination = page.getByRole('navigation', { name: /pagination navigation/i });
    await pagination.getByRole('button', { name: '2', exact: true }).click();
    await expect(page.locator('#driver-run-list')).toBeFocused();
    const listBox = await page.locator('#driver-run-list').boundingBox();
    expect(listBox).not.toBeNull();
    expect(listBox!.y).toBeLessThanOrEqual(200);
  });

  test('AC7 overdue runs show red late text on the due line, without a separate Overdue badge', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openDriver(page);
    const lateLine = page.locator('#driver-run-list [data-due-date]').filter({ hasText: /\d+ days? late/ }).first();
    if (!(await lateLine.count())) test.skip(true, 'No overdue active run is assigned to this driver account.');
    await expect(lateLine).toContainText(/Due [A-Z][a-z]{2} \d{1,2}, \d{4} · \d+ days? late/);
    await expect(lateLine).toHaveClass(/text-rose-700/);
    const card = lateLine.locator('xpath=ancestor::article');
    await expect(card.locator('[data-card-badges]')).not.toContainText(/Overdue/i);
  });

  test('AC8 long item descriptions expand from the two-line clamp', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openDriver(page);
    const showMore = page.getByRole('button', { name: 'Show more' }).first();
    if (!(await showMore.count())) test.skip(true, 'No active record has an item description longer than the UI clamp threshold.');
    const clamped = showMore.locator('xpath=preceding-sibling::span[1]');
    await expect(clamped).toHaveAttribute('data-clamped', 'true');
    await showMore.click();
    await expect(page.getByRole('button', { name: 'Show less' }).first()).toHaveAttribute('aria-expanded', 'true');
  });

  test('AC7 due dates use the short month format and AC6 hides internal IDs', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openDriver(page);
    const dueLines = page.locator('#driver-run-list [data-due-date]');
    expect(await dueLines.count()).toBeGreaterThan(0);
    for (const text of await dueLines.allTextContents()) {
      expect(text).toMatch(/^Due [A-Z][a-z]{2} \d{1,2}, \d{4}(?: · \d+ days? late)?$/);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\bREC-(?:DEMO-|[0-9a-f]{8}-)/i);
    const noReference = page.locator('#driver-run-list [data-record-reference]').filter({ hasText: 'No reference yet' });
    if (await noReference.count()) await expect(noReference.first()).toHaveText('No reference yet');
    else test.info().annotations.push({ type: 'AC6 data limit', description: 'No active record without a reference was available to exercise the fallback label.' });
  });

  test('AC12, AC13 and AC14: confirm sheet is accessible, touch sized, escape closes and focus returns', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openDriver(page);
    const refresh = page.getByRole('button', { name: 'Refresh dashboard' });
    await assertTouchTarget(refresh, 'Refresh');

    const opener = await firstEnabled(page, /^start transport$/i);
    if (!opener) test.skip(true, 'No active run exposes an enabled Start transport action.');
    await opener!.click();
    const dialog = page.getByRole('dialog', { name: 'Start transport' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByRole('heading', { name: 'Start transport' })).toBeVisible();
    await saveScreenshot(page, 'confirm-sheet-393.png');

    const close = dialog.getByRole('button', { name: 'Close' });
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    const confirm = dialog.getByRole('button', { name: 'Confirm' });
    await assertTouchTarget(close, 'sheet Close');
    await assertTouchTarget(cancel, 'sheet Cancel');
    await assertTouchTarget(confirm, 'sheet Confirm');
    const remarks = dialog.locator('textarea');
    const fontSize = await remarks.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener!).toBeFocused();
    await opener!.click();
    const cancelDialog = page.getByRole('dialog', { name: 'Start transport' });
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(cancelDialog).toBeHidden();
  });

  // Drivers can only start transport and complete; Pending and Reschedule belong to Logistics.
  test('driver cards never offer Pending, Reschedule or On-Hold', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openDriver(page);
    const list = page.locator('#driver-run-list');
    for (const name of [/^Pending$/i, /^Reschedule$/i, /^On-Hold$/i, /^Accomplish$/i]) await expect(list.getByRole('button', { name })).toHaveCount(0);
  });

  for (const action of [
    { label: 'Start transport', button: /^start transport$/i, summary: /Start transport for/i },
  ]) {
    test(`AC17 ${action.label} confirm sheet opens and Cancel closes it`, async ({ page }) => {
      await page.setViewportSize({ width: 393, height: 852 });
      await openDriver(page);
      await openAndCancelAction(page, action.button, action.summary, action.label);
    });
  }

  test('AC17 completes one Start transport on SAP-71376 only', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openDriver(page);
    const card = page.locator('#driver-run-list article[aria-label*="SAP-71376"]').first();
    if (!(await card.count())) test.skip(true, 'SAP-71376 is not present in this driver account’s active queue.');
    if (await card.getByText(/Transport started:/i).count()) test.skip(true, 'SAP-71376 already has a transport start; avoiding a second status write.');
    const start = card.getByRole('button', { name: /^start transport$/i });
    if (!(await start.isEnabled().catch(() => false))) test.skip(true, 'SAP-71376 does not expose an enabled Start transport action.');
    await start.click();
    const dialog = page.getByRole('dialog', { name: 'Start transport' });
    await expect(dialog).toBeVisible();
    await dialog.locator('textarea').fill('Round 2 mobile dashboard QA 2026-11-11');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toContainText(/Transport started:/i, { timeout: 15_000 });
  });
});

test.describe('Driver viewport checks', () => {
  test('AC9, AC10 and AC16: no horizontal scroll at 360x800 on Active and Done today', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openDriver(page);
    const queueNav = page.getByRole('navigation', { name: 'Run queues' });
    const active = queueNav.getByRole('button', { name: /^Active\s*\(\d+\)$/i });
    const done = queueNav.getByRole('button', { name: /^Done today\s*\(\d+\)$/i });
    await expect(active).toBeVisible();
    await expect(done).toBeVisible();

    const checkNoHorizontalScroll = async () => {
      const widths = await page.evaluate(() => ({ innerWidth: window.innerWidth, documentWidth: document.documentElement.scrollWidth }));
      expect(widths.documentWidth, `${widths.documentWidth}px document at ${widths.innerWidth}px viewport`).toBeLessThanOrEqual(widths.innerWidth);
    };
    await checkNoHorizontalScroll();
    const tileBoxes = await Promise.all((await page.locator('[data-kpi-tile]').all()).map(tile => tile.boundingBox()));
    expect(tileBoxes).toHaveLength(3);
    expect(tileBoxes.every(box => box !== null)).toBe(true);
    expect(Math.max(...tileBoxes.map(box => box!.y)) - Math.min(...tileBoxes.map(box => box!.y))).toBeLessThanOrEqual(1);
    await done.click();
    await expect(page.locator('[data-queue-hint]')).toHaveText('Includes RMA items waiting for TASS receipt.');
    await checkNoHorizontalScroll();
  });

  test('driver dashboard still renders at 768x1024', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await openDriver(page);
    await expect(page.getByRole('navigation', { name: 'Run queues' })).toBeVisible();
    await expect(page.locator('#driver-run-list article').first()).toBeVisible();
  });
});

test.describe('Other role dashboard smoke checks at 1280px', () => {
  const accounts = [
    { role: 'Admin', email: 'admin@microgenesis.com', password: 'admin123' },
    { role: 'Logistics', email: 'logistics@microgenesis.com', password: 'password123' },
    { role: 'TASS', email: 'tass@microgenesis.com', password: 'password123' },
    { role: 'Sales Coordinator', email: 'sales@microgenesis.com', password: 'password123' },
  ];

  for (const account of accounts) {
    test(`${account.role} dashboard renders`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAs(page, account);
      const main = page.getByRole('main').first();
      await expect(main).toBeVisible();
      await expect(main.locator('h1, h2').first()).toBeVisible({ timeout: 20_000 });
      await expect(main).not.toContainText(/Loading view/);
    });
  }
});
