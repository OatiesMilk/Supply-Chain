import type { Page } from '@playwright/test';

/** Synthetic UI data; no fixture requests are allowed to mutate the live API. */
export async function uiFixture(page: Page, role = 'SALES_COORDINATOR', options: { screens?: string[]; accountManager?: string } = {}) {
  const writes: string[] = [];
  const record = { id: 'REC-UI005', category: 'Deliveries', company_id: 'ui005-company', company_name: 'Example Company', reference: 'UI005-REF', status: 'Scheduled', driver: '', account_manager: options.accountManager ?? '', area: '', address: '', remarks: '', vehicle: '(None)', delivery_date: '2026-10-22', item_type: 'Small Item', item_description: 'Example item', is_draft: 'No', line_items: [], priority: '2 - Moderate', attachments: [], created_by: 'Example Staff', modified_by: 'Example Staff', created_at: '2026-10-22T00:00:00Z', modified_at: '2026-10-22T00:00:00Z', driver_assistants: [], output_actions_log: [] };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 503, json: { error: 'Example service unavailable. Your changes have not been saved.' } });
    }
    let body: unknown = [];
    if (url.pathname === '/api/health') body = { ok: true };
    if (url.pathname === '/api/auth/me') body = { id: 'ui005-user', name: 'Example Staff', email: 'staff@example.test', role, permissions: [], permissionVersion: 'ui005-fixture', effectiveScreens: options.screens ?? ['dashboard', 'deliveries'], resources: ['dashboard', 'records', 'companies'] };
    if (url.pathname === '/api/dev/reset-capability') body = { enabled: true };
    if (url.pathname === '/api/records/active-counts') body = { deliveries: 1, rma: 0, sales_orders: 0, procurement_pickup: 0, accounting_collection: 0 };
    if (url.pathname === '/api/companies') body = [{ id: 'ui005-company', name: 'Example Company' }];
    if (url.pathname === '/api/records') body = url.searchParams.has('paged') ? { rows: [record], total: 1, page: 1, limit: 10, hasMore: false, nextCursor: null } : [record];
    if (url.pathname === '/api/records/REC-UI005') body = record;
    if (url.pathname === '/api/notifications/unread-count') body = { count: 0 };
    if (url.pathname === '/api/dashboard/overview') body = { role: 'SALES_COORDINATOR', today: '2026-10-22', updatedAt: '2026-10-22T00:00:00Z', modules: ['DELIVERY'], cards: [['due', 'Deliveries Due Today'], ['unassigned', 'Awaiting Assignment'], ['held', 'On Hold / Rescheduled'], ['completed', 'Completed Today']].map(([metric, label]) => ({ metric, label, scope: 'Fixed metric scope', count: 1 })), status: [{ status: 'Scheduled', total: 1, overdue: 0 }], missingDates: 0, daily: [], ages: [], attention: [], administration: null };
    if (url.pathname === '/api/dashboard/records') body = { total: 1, pageSize: 25, records: [{ id: record.id, reference: record.reference, company: record.company_name, category: 'DELIVERY', status: record.status, scheduledDate: record.delivery_date, driver: 'Unassigned', assignment: 'unresolved', screen: 'deliveries' }] };
    return route.fulfill({ json: body });
  });
  return { writes };
}
