import { test, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/db';
import { signToken } from '../src/middleware/auth';
import dashboard from '../src/routes/dashboard';
import records from '../src/routes/records';
import { runViewWhere } from '../src/services/recordViewFilters';
import { manilaDateRange } from '../src/services/dateSemantics';
import { manilaToday } from '../src/services/deliveryLifecycle';
import { rmaTestAccount, rmaTestPolicy } from './rmaTestPolicy';
function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(condition => matches(row, condition));
    if (key === 'OR') return value.some((condition: any) => matches(row, condition));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(condition => matches(row, condition));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('not' in value && row[key] === value.not) return false;
      if (row[key] == null && Object.keys(value).some(k => ['gte', 'gt', 'lte', 'lt'].includes(k))) return false;
      if ('gte' in value && row[key] < value.gte || 'gt' in value && row[key] <= value.gt || 'lte' in value && row[key] > value.lte || 'lt' in value && row[key] >= value.lt) return false;
      if ('contains' in value) return String(row[key] ?? '').toLowerCase().includes(value.contains.toLowerCase());
      if (Object.keys(value).some(k => ['not', 'gte', 'gt', 'lte', 'lt'].includes(k))) return true;
      return matches(row[key], value);
    }
    return row[key] === value;
  });
}
const row = (index: number, extra = {}) => ({ id: `REC-${index}`, category: 'DELIVERY', status: 'SCHEDULED', draft: false, deletedAt: null,
  companyId: 'company', company: { name: 'Example Supplier' }, reference: `REF-${index}`, deliveryDate: '2026-10-01',
  driver: 'Driver One', driverId: 'profile-one', driverAssistants: '[]', area: 'Makati', accountManager: 'AM One',
  timeIn: null, timeOut: null, itemDescription: 'Example Supplier pickup', priority: '2 - Moderate',
  createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)), updatedAt: new Date(), lineItems: [], podAttachments: [], ...extra });
async function fixture(t: TestContext, source: any[], role = 'ADMIN', permissions: Array<{ screen: string; granted: boolean }> = [], provisionRma = false) {
  const mode = process.env.PERMISSION_MODE; process.env.PERMISSION_MODE = 'LEGACY';
  const undo: Array<() => void> = []; const calls: Array<{ method: string; args: any }> = [];
  const stub = (target: any, key: string, fn: (...args: any[]) => any) => { const old = target[key]; target[key] = mock.fn(fn); undo.push(() => { target[key] = old; }); };
  const baseActor = { id: 'actor', name: 'Actor', email: 'actor@example.test', role, isActive: true, permissions, driverProfile: role === 'DRIVER' ? { id: 'profile-one', type: 'DRIVER', isActive: true } : null };
  const actor = provisionRma ? rmaTestAccount(baseActor) : baseActor;
  stub(prisma.user, 'findUnique', async () => actor);
  if (provisionRma) stub(prisma.rolePolicy, 'findUnique', async ({ where }: any) => rmaTestPolicy(where.role));
  stub(prisma.deliveryRecord, 'findMany', async (args: any) => { calls.push({ method: 'findMany', args }); const rows = source.filter(row => matches(row, args.where)).sort((a, b) => b.createdAt - a.createdAt); return rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length)); });
  stub(prisma.deliveryRecord, 'count', async (args: any) => { calls.push({ method: 'count', args }); return source.filter(row => matches(row, args.where)).length; });
  stub(prisma.deliveryRecord, 'groupBy', async (args: any) => {
    calls.push({ method: 'groupBy', args }); const grouped = new Map<string, any>();
    for (const row of source.filter(row => matches(row, args.where))) { const key = JSON.stringify(args.by.map((field: string) => row[field] ?? null)); const group = grouped.get(key) ?? { ...Object.fromEntries(args.by.map((field: string) => [field, row[field] ?? null])), _count: { _all: 0 } }; group._count._all++; grouped.set(key, group); }
    return [...grouped.values()];
  });
  const app = express(); app.use(express.json(), cookieParser()); app.use('/records', records); app.use('/dashboard', dashboard);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); while (undo.length) undo.pop()!(); if (mode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = mode; });
  const cookie = `mg_session=${signToken({ id: actor.id, name: actor.name, email: actor.email, role: actor.role as any })}`;
  const get = (path: string, authenticated = true) => fetch(`http://127.0.0.1:${(server.address() as any).port}${path}`, { headers: authenticated ? { Cookie: cookie } : {} });
  return { calls, getStats: () => get('/dashboard/stats'), get: (query: string, authenticated = true) => get(`/records${query}`, authenticated) };
}

test('Logistics Completed today counts all five completed record categories and matches its list', async t => {
  const start = new Date('2026-11-12T16:00:00.000Z');
  const end = new Date('2026-11-13T16:00:00.000Z');
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-13T02:00:00Z').getTime() });
  const completed = { status: 'ACCOMPLISHED', timeOut: start.toISOString() };
  const rma = { category: 'RMA', rmaMovement: 'INTERNAL_NO_DRIVER', status: 'ACCOMPLISHED' };
  const rows = [
    row(1, completed), // Scheduled on an earlier date, completed at today's Manila midnight.
    row(2, { ...completed, category: 'PROCUREMENT_PICKUP' }),
    row(3, { ...completed, category: 'SALES_ORDERS' }),
    row(4, { ...completed, category: 'ACCOUNTING_COLLECTION', collectionVerified: false }),
    row(5, { ...rma, rmaCompletedAt: start }),
    row(6, { ...rma, rmaCompletedAt: null, timeOut: start.toISOString() }), // Legacy RMA finalization.
    row(7, { ...rma, rmaMovement: 'LOGISTICS_TRANSPORT', status: 'SCHEDULED', rmaTransportStatus: 'COMPLETED', rmaTransportCompletedAt: start }),
    row(8, { ...completed, timeOut: end.toISOString() }),
    row(9, { ...rma, rmaCompletedAt: new Date(start.getTime() - 1), timeOut: start.toISOString() }),
    row(10, { ...completed, draft: true }),
    row(11, { ...completed, deletedAt: start }),
    row(12, { ...completed, timeOut: null, deliveryDate: '2026-11-13' }),
  ];
  const state = await fixture(t, rows, 'LOGISTICS', [], true);
  const statsResponse = await state.getStats();
  assert.equal(statsResponse.status, 200);
  assert.equal((await statsResponse.json() as any).completed_today, 6);
  const listResponse = await state.get('?paged=true&dashboard_filter=log-completed-today&limit=25');
  assert.equal(listResponse.status, 200);
  const list: any = await listResponse.json();
  assert.equal(list.total, 6);
  assert.deepEqual(list.rows.map((record: any) => record.id).sort(), ['REC-1', 'REC-2', 'REC-3', 'REC-4', 'REC-5', 'REC-6']);
});

test('Logistics Completed today respects an explicit record category denial in both endpoints', async t => {
  const timeOut = new Date().toISOString();
  const state = await fixture(t, [
    row(1, { status: 'ACCOMPLISHED', timeOut }),
    row(2, { category: 'ACCOUNTING_COLLECTION', status: 'ACCOMPLISHED', timeOut }),
  ], 'LOGISTICS', [{ screen: 'accounting_collection', granted: false }]);
  assert.equal((await (await state.getStats()).json() as any).completed_today, 1);
  const list: any = await (await state.get('?paged=true&dashboard_filter=log-completed-today')).json();
  assert.deepEqual(list.rows.map((record: any) => record.id), ['REC-1']);
});
test('legacy reads are bounded while paginated history reaches beyond 5000 records', async t => {
  const state = await fixture(t, Array.from({ length: 6001 }, (_, i) => row(i)));
  const response = await state.get(''); assert.equal(response.status, 200); assert.equal((await response.json() as any[]).length, 100); assert.equal(state.calls[0].args.take, 100);
  const last: any = await (await state.get('?paged=true&limit=25&page=241')).json();
  assert.equal(last.total, 6001); assert.equal(last.rows.length, 1); assert.equal(last.rows[0].id, 'REC-0'); assert.equal(last.hasMore, false);
});
test('dispatch reads retain linked ownership and exclude drafts/completed transports', async t => {
  const state = await fixture(t, [row(1), row(2, { driverId: 'other' }), row(3, { draft: true }), row(4, { status: 'ACCOMPLISHED' }), row(5, { category: 'RMA', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'COMPLETED' })], 'DRIVER');
  const response = await state.get('?paged=true&view=dispatch&limit=25'); assert.equal(response.status, 200); assert.deepEqual((await response.json() as any).rows.map((row: any) => row.id), ['REC-1']); assert.ok(state.calls[0].args.where.AND[0].driverId);
});
test('calendar and AM summaries return complete aggregates without full-record queries', async t => {
  const state = await fixture(t, Array.from({ length: 6001 }, (_, i) => row(i)));
  const calendar: any = await (await state.get('/calendar-counts?dateFrom=2026-10-01&dateTo=2026-10-31')).json(); assert.equal(calendar[0].total, 6001);
  const am: any = await (await state.get('/am-summary')).json(); assert.equal(am[0].total, 6001); assert.equal(am[0].company_count, 1); assert.equal(state.calls.some(call => call.method === 'findMany'), false);
});
test('AM scheduled counts include drafts and canonical Scheduled, excluding started ordinary runs and other states', async t => {
  const state = await fixture(t, [
    row(1), row(2, { draft: true }), row(3, { status: 'IN_TRANSIT' }),
    row(4, { timeIn: '2026-10-01T00:00:00Z' }),
    row(5, { category: 'RMA', timeIn: '2026-10-01T00:00:00Z' }),
    row(6, { status: 'ACCOMPLISHED' }), row(7, { status: 'PENDING' }),
    row(8, { status: 'ON_HOLD' }), row(9, { status: 'RESCHEDULED' }),
    row(10, { deletedAt: new Date() }),
  ], 'ADMIN', [], true);
  const response = await state.get('/am-summary'); assert.equal(response.status, 200);
  const [am]: any = await response.json();
  assert.deepEqual({ total: am.total, scheduled: am.scheduled, delivered: am.delivered, pending: am.pending, onHold: am.onHold, rescheduled: am.rescheduled },
    { total: 9, scheduled: 3, delivered: 1, pending: 1, onHold: 1, rescheduled: 1 });
  assert.equal(state.calls.some(call => call.method === 'findMany'), false);
});
test('filter options are complete sorted category aggregates and exclude deleted/blank values', async t => {
  const state = await fixture(t, [
    ...Array.from({ length: 151 }, (_, i) => row(i)),
    row(152, { accountManager: 'AM Before', driver: 'Driver Before', area: 'Alabang' }),
    row(153, { accountManager: '', driver: ' ', area: '' }),
    row(154, { category: 'RMA', accountManager: 'Other Category', driver: 'Other Category', area: 'Other Category' }),
    row(155, { deletedAt: new Date(), accountManager: 'Deleted', driver: 'Deleted', area: 'Deleted' }),
  ]);
  const response = await state.get('/filter-options?category=Deliveries'); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { accountManagers: ['AM Before', 'AM One'], drivers: ['Driver Before', 'Driver One'], areas: ['Alabang', 'Makati'] });
  assert.deepEqual(state.calls.map(call => call.method), ['groupBy', 'groupBy', 'groupBy']);
});
test('filter options retain linked Driver ownership and draft exclusion', async t => {
  const state = await fixture(t, [row(1), row(2, { driverId: 'other', accountManager: 'Other', area: 'Other' }), row(3, { draft: true, accountManager: 'Draft', area: 'Draft' })], 'DRIVER');
  const response = await state.get('/filter-options?category=Deliveries'); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accountManagers: ['AM One'], drivers: ['Driver One'], areas: ['Makati'] });
  assert.ok(state.calls.every(call => call.args.where.AND[0].driverId === 'profile-one'));
});
test('filter options cannot expose explicitly denied categories through aggregate access', async t => {
  const state = await fixture(t, [row(1)], 'ADMIN', [{ screen: 'deliveries', granted: false }]);
  const response = await state.get('/filter-options?category=Deliveries'); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accountManagers: [], drivers: [], areas: [] });
});
test('filter options reject missing/invalid categories and unauthenticated requests before aggregation', async t => {
  const state = await fixture(t, []);
  for (const query of ['', '?category=All', '?category=', '?category=unknown', '?category=DELIVERY', '?category=Deliveries&category=RMA']) {
    assert.equal((await state.get(`/filter-options${query}`)).status, 400);
  }
  assert.equal((await state.get('/filter-options?category=Deliveries', false)).status, 401);
  assert.equal(state.calls.length, 0);
});
test('filter options require records resource access', async t => {
  const state = await fixture(t, [row(1)], 'SALES_COORDINATOR', ['main', 'dashboard', 'deliveries', 'accounting_collection', 'procurement_pickup', 'sales_orders'].map(screen => ({ screen, granted: false })));
  assert.equal((await state.get('/filter-options?category=Deliveries')).status, 403);
  assert.equal(state.calls.length, 0);
});
test('Driver overview totals cover all records and late pages remain reachable', async t => {
  const state = await fixture(t, Array.from({ length: 6001 }, (_, i) => row(i)));
  const result: any = await (await state.get('/driver-overview')).json(); assert.equal(result.drivers[0].active, 6001); assert.equal(result.drivers[0].completed, 0); assert.equal(state.calls.some(call => call.method === 'findMany'), false);
  const page: any = await (await state.get('?paged=true&view=runs&driver_exact=Driver%20One&queue=active&page=241&limit=25')).json(); assert.equal(page.total, 6001); assert.equal(page.rows.length, 1);
});
test('operational scopes retain overdue/started work and distinguish completed today', () => {
  const active = runViewWhere('driver_dashboard', 'active', '2026-10-30'); assert.equal(matches(row(1), active), true); assert.equal(matches(row(1, { deliveryDate: '2026-11-01' }), active), false); assert.equal(matches(row(1, { deliveryDate: '2026-11-01', timeIn: '2026-10-30T01:00:00Z' }), active), true);
  const done = runViewWhere('driver_dashboard', 'completed', '2026-10-30'); assert.equal(matches(row(1, { status: 'ACCOMPLISHED', timeOut: '2026-10-30T01:00:00Z' }), done), true); assert.equal(matches(row(1, { status: 'ACCOMPLISHED', timeOut: '2026-10-28T01:00:00Z' }), done), false);
});
test('Driver completed queue includes logistics RMAs finalized today and keeps receipt follow-up separate', async t => {
  const today = manilaToday();
  const { gte: start, lt: end } = manilaDateRange(today, today);
  assert.ok(start && end);
  const rma = (index: number, status: string, transportStatus: string, completedAt: Date | null = null) => row(index, {
    category: 'RMA', status, rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: transportStatus, rmaCompletedAt: completedAt,
  });
  const state = await fixture(t, [
    rma(10, 'ACCOMPLISHED', 'COMPLETED', start),
    rma(11, 'ACCOMPLISHED', 'COMPLETED', new Date(start.getTime() - 1)),
    rma(12, 'SCHEDULED', 'COMPLETED'),
    rma(13, 'SCHEDULED', 'PENDING'),
    row(14, { status: 'ACCOMPLISHED', timeOut: start.toISOString(), deliveryDate: today }),
  ], 'DRIVER', [], true);

  const response = await state.get('?paged=true&view=driver_dashboard&queue=completed&limit=25');
  assert.equal(response.status, 200);
  const page: any = await response.json();
  const ids = page.rows.map((record: any) => record.id);
  assert.ok(ids.includes('REC-10'), 'a final RMA completed today is visible');
  assert.ok(ids.includes('REC-12'), 'transport-complete RMA awaiting receipt remains visible');
  assert.ok(ids.includes('REC-14'), 'completed Delivery remains visible');
  assert.ok(!ids.includes('REC-11'), 'a final RMA completed before today is excluded');
  assert.ok(!ids.includes('REC-13'), 'pending transport is excluded from the completed queue');

  const overview: any = await (await state.get('/driver-overview')).json();
  assert.equal(overview.dashboard.rma_active, 1);
  assert.equal(overview.dashboard.rma_completed, 1, 'transport-complete RMAs still awaiting TASS receipt');
  assert.equal(overview.dashboard.completed, 2, 'Accomplished counts the completed Delivery and TASS-finalized RMA, but not receipt follow-up');
});
test('unknown views and oversized calendar requests reject before queries', async t => {
  const state = await fixture(t, []); for (const path of ['?view=everything', '?queue=active', '/calendar-counts?dateFrom=2026-01-01&dateTo=2026-12-31']) assert.equal((await state.get(path)).status, 400); assert.equal(state.calls.length, 0);
});
