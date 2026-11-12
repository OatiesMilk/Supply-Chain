import type { Locator, Page } from '@playwright/test';
import { apiUrl, expect, expectOk, login, openScreen, test } from './support';

// Read-only checks of the Transport requests (Logistics), In transit (Sales
// Coordinator) and RMA in transit (TASS) panels against a prepared seeded sandbox.
// Panel numbers come from /dashboard/overview; each drill-down must list the
// same records the panel counted. Counts can be zero on a given seed, in which
// case the empty state is asserted and the drill-down is skipped.

type Overview = { counts: Record<string, number>; transport_requests_by_type?: Record<string, number> };

const CATEGORY_SCREENS = {
  DELIVERY: { category: 'Deliveries', screen: 'deliveries', link: 'Deliveries' },
  RMA: { category: 'RMA', screen: 'rma', link: 'RMA' },
  PROCUREMENT_PICKUP: { category: 'Procurement Pick-up', screen: 'procurement_pickup', link: 'Procurement Pickup' },
  SALES_ORDERS: { category: 'Sales Orders', screen: 'sales_orders', link: 'Sales Order' },
} as const;

async function overview(page: Page): Promise<Overview> {
  const response = await page.request.get(apiUrl('/dashboard/overview'));
  await expectOk(response, 'Dashboard overview');
  return response.json();
}

/** Total the server drill-down returns for one screen category and dashboard filter. */
async function drillDownTotal(page: Page, category: string, filter: string): Promise<number> {
  const query = new URLSearchParams({ category, dashboard_filter: filter, paged: 'true', limit: '1' });
  const response = await page.request.get(apiUrl(`/records?${query}`));
  await expectOk(response, `${filter} drill-down for ${category}`);
  return (await response.json()).total;
}

/** Clicks a panel link and checks the list screen asks the server for the same filter. */
async function openDrillDown(page: Page, panel: Locator, name: RegExp, screen: string, filter: string) {
  const listRequest = page.waitForRequest(request => request.method() === 'GET' && request.url().includes('/records?')
    && new URL(request.url()).searchParams.get('dashboard_filter') === filter);
  await panel.getByRole('button', { name }).click();
  await expect(page).toHaveURL(new RegExp(`/${screen}(?:[?]|$)`));
  await listRequest;
}

/** DashboardPanel is a section labelled by its title, so it is a named region. */
const panelFor = (page: Page, title: string) => page.getByRole('region', { name: title, exact: true });

test('Logistics Transport requests panel matches the per-type drill-downs (AC6)', async ({ page }) => {
  await login(page, 'LOGISTICS');
  const data = await overview(page);
  const total = data.counts['log-transport-requests'];
  expect(typeof total, 'overview returns the transport request total').toBe('number');
  const byType = data.transport_requests_by_type ?? {};
  expect(Object.values(byType).reduce((sum, n) => sum + n, 0)).toBe(total);
  for (const [key, count] of Object.entries(byType)) {
    const target = CATEGORY_SCREENS[key as keyof typeof CATEGORY_SCREENS];
    expect(target, `unexpected transport request type ${key}`).toBeTruthy();
    expect(await drillDownTotal(page, target.category, 'log-transport-requests')).toBe(count);
  }

  await openScreen(page, 'dashboard', 'LOGISTICS');
  const panel = panelFor(page, 'Transport requests');
  await expect(panel).toBeVisible();
  await expect(page.getByRole('heading', { name: 'RMA transport requests', exact: true })).toHaveCount(0);
  if (!total) {
    await expect(panel.getByText('No transport requests need dispatch')).toBeVisible();
    return;
  }
  await expect(panel.getByText(`${total} ${total === 1 ? 'request' : 'requests'}`, { exact: true })).toBeVisible();
  await expect(panel.getByRole('columnheader', { name: 'Type', exact: true })).toBeVisible();
  await expect(panel.getByRole('columnheader', { name: 'Driver', exact: true })).toHaveCount(0);
  // The No driver assigned tile counts the same jobs as the panel and brings the panel into view.
  const tile = page.getByRole('button', { name: `No driver assigned, ${total.toLocaleString('en-US')} jobs. Show transport requests`, exact: true });
  await tile.click();
  await expect(page.locator('#transport-requests-panel')).toBeFocused();
  const [key] = Object.entries(byType).find(([, count]) => count > 0)!;
  const target = CATEGORY_SCREENS[key as keyof typeof CATEGORY_SCREENS];
  await openDrillDown(page, panel, new RegExp(`^View \\d+ ${target.link}`), target.screen, 'log-transport-requests');
});

test('Sales Coordinator In transit panel matches its drill-downs (AC10)', async ({ page }) => {
  await login(page, 'SALES_COORDINATOR');
  const data = await overview(page);
  const total = data.counts['sc-in-transit'];
  expect(typeof total, 'overview returns the in-transit total').toBe('number');
  let listed = 0;
  for (const target of [CATEGORY_SCREENS.DELIVERY, CATEGORY_SCREENS.PROCUREMENT_PICKUP, CATEGORY_SCREENS.SALES_ORDERS]) {
    listed += await drillDownTotal(page, target.category, 'sc-in-transit');
  }
  expect(listed, 'the three type lists together hold exactly the counted jobs').toBe(total);

  await openScreen(page, 'dashboard', 'SALES_COORDINATOR');
  const panel = panelFor(page, 'In transit');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(`${total} in transit`, { exact: true })).toBeVisible();
  if (!total) {
    await expect(panel.getByText('No jobs are in transit')).toBeVisible();
    return;
  }
  await expect(panel.getByRole('columnheader', { name: 'Started', exact: true })).toBeVisible();
  await openDrillDown(page, panel, /^View Deliveries in transit/, 'deliveries', 'sc-in-transit');
});

test('TASS RMA in transit panel matches its drill-down (AC13)', async ({ page }) => {
  await login(page, 'TASS');
  const data = await overview(page);
  const total = data.counts['tass-rma-in-transit'];
  expect(typeof total, 'overview returns the RMA in-transit total').toBe('number');
  expect(await drillDownTotal(page, 'RMA', 'tass-rma-in-transit')).toBe(total);

  await openScreen(page, 'dashboard', 'TASS');
  const panel = panelFor(page, 'RMA in transit');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(`${total} in transit`, { exact: true })).toBeVisible();
  if (!total) {
    await expect(panel.getByText('No RMA are in transit')).toBeVisible();
    return;
  }
  await expect(panel.getByRole('columnheader', { name: 'Transport started', exact: true })).toBeVisible();
  await openDrillDown(page, panel, new RegExp(`^View all ${total} in transit`), 'rma', 'tass-rma-in-transit');
});
