import { test, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/db';
import { signToken } from '../src/middleware/auth';
import records from '../src/routes/records';
import { runViewWhere } from '../src/services/recordViewFilters';
import { rmaTestAccount, rmaTestPolicy } from './rmaTestPolicy';
function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(condition => matches(row, condition));
    if (key === 'OR') return value.some((condition: any) => matches(row, condition));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(condition => matches(row, condition));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('not' in value && row[key] === value.not) return false;
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
  const app = express(); app.use(express.json(), cookieParser()); app.use('/records', records);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); while (undo.length) undo.pop()!(); if (mode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = mode; });
  const cookie = `mg_session=${signToken({ id: actor.id, name: actor.name, email: actor.email, role: actor.role as any })}`;
  return { calls, get: (query: string, authenticated = true) => fetch(`http://127.0.0.1:${(server.address() as any).port}/records${query}`, { headers: authenticated ? { Cookie: cookie } : {} }) };
}
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
test('unknown views and oversized calendar requests reject before queries', async t => {
  const state = await fixture(t, []); for (const path of ['?view=everything', '?queue=active', '/calendar-counts?dateFrom=2026-01-01&dateTo=2026-12-31']) assert.equal((await state.get(path)).status, 400); assert.equal(state.calls.length, 0);
});
