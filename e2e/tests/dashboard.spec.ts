import { test, expect, type Page } from '@playwright/test';

const definitions: Record<string, [string, string][]> = {
  ADMIN: [['overdue', 'Overdue Deliveries'], ['unassigned-today', 'Unassigned Today'], ['verification', 'Unverified Collections']],
  SALES_COORDINATOR: [['due', 'Deliveries Due Today'], ['unassigned', 'Awaiting Assignment'], ['held', 'On Hold / Rescheduled'], ['completed', 'Completed Today']],
  LOGISTICS: [['unassigned-today', 'Unassigned Today'], ['transit', 'In Transit'], ['overdue', 'Overdue Deliveries'], ['completed', 'Completed Today']],
  TASS: [['rma-open', 'Open RMA'], ['rma-held', 'RMA On Hold'], ['verification', 'Awaiting Verification'], ['verified', 'Verified Today']],
  DRIVER: [['my-today', 'My Runs Today'], ['my-overdue', 'My Overdue Runs'], ['my-remaining', 'My Remaining Runs'], ['my-completed', 'Completed Today']],
};
async function setup(page: Page, role: string) {
  const state = { fail: false, delay: false, requests: [] as string[] };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    state.requests.push(url.pathname + url.search);
    let body: any = [];
    if (url.pathname === '/api/health') body = { ok: true };
    if (url.pathname === '/api/auth/me') body = { id: 'fixture-user', name: 'Test User', email: 'test@example.test', role, permissions: [], permissionVersion: 'fixture', effectiveScreens: role === 'DRIVER' ? ['driver_dashboard'] : ['dashboard', 'deliveries'], resources: ['records', 'companies', 'dashboard'] };
    if (url.pathname === '/api/dashboard/overview') {
      if (state.delay) await new Promise(resolve => setTimeout(resolve, 700));
      if (state.fail) return route.fulfill({ status: 503, json: { error: 'Test unavailable' } });
      const count = url.searchParams.get('module') === 'RMA' ? 0 : 30;
      body = { role, today: '2026-10-21', updatedAt: '2026-10-21T02:00:00Z', modules: ['DELIVERY', 'RMA'], cards: definitions[role].map(([metric, label]) => ({ metric, label, scope: 'Fixed metric scope', count: 30 })), status: ['Scheduled', 'In Transit', 'Pending', 'On-Hold', 'Rescheduled'].map((status, i) => ({ status, total: i === 0 ? count : 0, overdue: i === 0 && count ? 3 : 0 })), missingDates: 2, daily: [{ day: '2026-10-21', due: 30, completed: 4 }], ages: [{ age: '0–1', count: 30 }, { age: 'Unknown', count: 1 }], attention: [], administration: role === 'ADMIN' ? { activeUsers: 2, auditEventsToday: 4, recordsThisWeek: 8, recentAudit: [] } : null };
    }
    if (url.pathname === '/api/dashboard/records') {
      const pageNumber = Number(url.searchParams.get('page') || 1);
      body = { total: 30, pageSize: 25, records: Array.from({ length: pageNumber === 1 ? 25 : 5 }, (_, i) => ({ id: `REC-${i + (pageNumber - 1) * 25}`, reference: `SAP-${i + (pageNumber - 1) * 25}`, company: 'Test Company', driver: 'Unassigned', assignment: 'unresolved', category: 'DELIVERY', status: 'Scheduled', scheduledDate: '2026-10-21', screen: role === 'DRIVER' ? null : 'deliveries' })) };
    }
    if (url.pathname === '/api/dashboard/users') body = { total: 2, pageSize: 25, users: [{ id: 'one', name: 'Active One', role: 'ADMIN' }, { id: 'two', name: 'Active Two', role: 'DRIVER' }] };
    if (url.pathname.endsWith('active-counts')) body = { deliveries: 0, rma: 0, sales_orders: 0, procurement_pickup: 0, accounting_collection: 0 };
    if (url.pathname.endsWith('unread-count')) body = { count: 0 };
    return route.fulfill({ json: body });
  });
  await page.goto('/dashboard');
  return state;
}
for (const role of Object.keys(definitions)) {
  test(`${role}: four actionable cards, keyboard drill-down and mobile layout`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page, role);
    await expect(page.locator('#dashboard-kpis button')).toHaveCount(4);
    const card = page.locator('#dashboard-kpis button').first();
    await card.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible(); await expect(dialog.getByText('30 total', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(dialog.getByText('Page 2 of 2')).toBeVisible(); await expect(dialog.getByText('SAP-29', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
    await expect(card).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
}
test('Admin: chart filter scope, custom dates, overdue segments and authorized record navigation', async ({ page }) => {
  const state = await setup(page, 'ADMIN');
  await page.getByLabel('Chart module').selectOption('RMA');
  await expect(page.getByText('No open records in this scope.')).toBeVisible();
  await expect(page.locator('#dashboard-kpis button').first()).toContainText('30');
  await page.getByLabel('Chart module').selectOption('DELIVERY');
  await page.getByLabel('Chart scheduled dates').selectOption('custom');
  await page.getByLabel('Chart from date').fill('2026-10-19'); await page.getByLabel('Chart to date').fill('2026-10-25');
  await page.getByRole('button', { name: 'Apply dates' }).click();
  await expect.poll(() => state.requests.some(r => r.includes('from=2026-10-19') && r.includes('to=2026-10-25'))).toBe(true);
  await page.getByRole('button', { name: 'Scheduled: overdue segment 3', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(state.requests.some(r => r.includes('/dashboard/records?') && r.includes('overdue=true') && r.includes('module=DELIVERY') && r.includes('from=2026-10-19'))).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'SAP-0', exact: true }).click();
  await expect(page).toHaveURL(/\/deliveries\?item=REC-0/);
});
test('refresh failure remains visibly stale with the last successful update and usable counts', async ({ page }) => {
  const state = await setup(page, 'ADMIN');
  await expect(page.getByText(/Last successful update/)).toBeVisible();
  state.fail = true;
  await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Dashboard is stale' })).toBeVisible();
  await expect(page.locator('#dashboard-kpis button').first()).toContainText('30');
  state.fail = false; await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Dashboard is stale' })).toHaveCount(0);
});
test('changed chart scope shows loading and never labels old counts with new filters', async ({ page }) => {
  const state = await setup(page, 'ADMIN');
  await expect(page.locator('#dashboard-kpis')).toBeVisible(); state.delay = true;
  await page.getByLabel('Chart module').selectOption('RMA');
  await expect(page.getByText('Loading dashboard…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scheduled: 30 total records', exact: true })).toHaveCount(0);
  await expect(page.getByText('No open records in this scope.')).toBeVisible();
});
