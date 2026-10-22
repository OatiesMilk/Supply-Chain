import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { prisma } from '../src/db';
import { signToken } from '../src/middleware/auth';
import router from '../src/routes/dashboardOverview';
import { manilaToday } from '../src/services/deliveryLifecycle';

let server: Server;
let base = '';
let actor: any;
let fail = false;
let seenWhere: any;
const restore: (() => void)[] = [];
const today = manilaToday();
const fixture = Array.from({ length: 72 }, (_, i) => ({ id: `REC-${i}`, reference: `SAP-${i}`, category: i % 3 === 0 ? 'RMA' : 'DELIVERY', status: 'SCHEDULED', draft: i === 70, deletedAt: i === 71 ? new Date() : null, deliveryDate: today, driverId: i % 2 ? 'profile-one' : 'profile-two', driver: 'Same Name', timeIn: null, timeOut: null, collectionVerified: false, collectionVerifiedAt: null, createdAt: new Date(), company: { name: 'Example Company' }, assignedDriver: { name: 'Same Name', userId: i % 2 ? 'user-one' : null } }));
const user = (role: string, permissions: any[] = [], profile: string | null = null) => ({ id: 'test-user', name: 'Same Name', email: 'test@example.test', role, permissions, isActive: true, driverProfile: profile ? { id: profile, type: 'DRIVER' } : null });
before(async () => {
  function stub(target: any, key: string, fn: any) { const old = target[key]; target[key] = fn; restore.push(() => { target[key] = old; }); }
  stub(prisma.user, 'findUnique', async () => actor);
  stub(prisma.deliveryRecord, 'findMany', async ({ where }: any) => {
    if (fail) throw new Error('Simulated database failure');
    seenWhere = where;
    const scope = where.AND[0];
    return fixture.filter(r => !r.deletedAt && !r.draft && scope.category.in.includes(r.category) && (!scope.id || scope.id.in.includes(r.id)) && (!scope.driverId || r.driverId === scope.driverId));
  });
  stub(prisma.user, 'count', async () => 2);
  stub(prisma.user, 'findMany', async () => [{ id: 'one', name: 'One', role: 'ADMIN' }, { id: 'two', name: 'Two', role: 'DRIVER' }]);
  stub(prisma.auditLog, 'count', async () => 0);
  stub(prisma.auditLog, 'findMany', async () => []);
  stub(prisma, '$transaction', async (queries: any[]) => Promise.all(queries));
  const app = express(); app.use(cookieParser()); app.use('/dashboard', router);
  app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/dashboard`;
});
after(async () => { restore.forEach(fn => fn()); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => { actor = user('SALES_COORDINATOR'); fail = false; });
async function get(path: string, auth = true) { const response = await fetch(base + path, { headers: auth ? { Cookie: `mg_session=${signToken(actor)}` } : {} }); return { status: response.status, body: await response.json() }; }

test('happy path: all role card counts match paginated lists, with complete totals beyond page one', async () => {
  for (const role of ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER']) {
    actor = user(role, [], 'profile-one');
    const overview = await get('/overview'); assert.equal(overview.status, 200);
    assert.equal(overview.body.cards.length, role === 'ADMIN' ? 3 : 4);
    for (const card of overview.body.cards) {
      const list = await get(`/records?metric=${card.metric}`);
      assert.equal(list.status, 200); assert.equal(list.body.total, card.count);
      let count = list.body.records.length;
      for (let page = 2; count < list.body.total; page++) { const next = await get(`/records?metric=${card.metric}&page=${page}`); count += next.body.records.length; }
      assert.equal(count, card.count);
    }
  }
});
test('sad path: explicit delivery denial removes charts, KPI counts, module options and lists', async () => {
  actor = user('ADMIN', [{ screen: 'deliveries', granted: false }]);
  const overview = await get('/overview');
  assert.equal(overview.body.modules.includes('DELIVERY'), false);
  assert.equal((await get('/records?module=DELIVERY')).body.total, 0);
  assert.equal((await get('/overview?module=DELIVERY')).body.status.reduce((n: number, s: any) => n + s.total, 0), 0);
  assert.equal(overview.body.cards.find((c: any) => c.metric === 'unassigned-today').count, 0);
  assert.equal(seenWhere.draft, false); assert.equal(seenWhere.deletedAt, null);
});
test('sad path: same-name drivers remain isolated by profile; no profile means empty', async () => {
  actor = user('DRIVER', [], 'profile-one');
  const list = await get('/records'); assert.ok(list.body.total > 0);
  assert.ok(list.body.records.every((r: any) => Number(r.id.split('-')[1]) % 2 === 1));
  assert.equal((await get('/records?driverId=profile-two')).status, 400);
  assert.equal((await get('/records?id=REC-2')).body.total, 0);
  actor = user('DRIVER'); assert.equal((await get('/records')).body.total, 0);
});
test('sad path: unauthenticated and revoked dashboard access are rejected, user list is Admin-only', async () => {
  assert.equal((await get('/overview', false)).status, 401);
  actor = user('LOGISTICS', [{ screen: 'dashboard', granted: false }]); assert.equal((await get('/overview')).status, 403);
  actor = user('DRIVER', [{ screen: 'driver_dashboard', granted: false }], 'profile-one'); assert.equal((await get('/records')).status, 403);
  actor = user('TASS'); assert.equal((await get('/users')).status, 403);
  actor = user('ADMIN'); const users = await get('/users'); assert.equal(users.body.total, 2); assert.equal(users.body.users.length, 2);
});
test('sad path: invalid filters produce 400 and backend failure produces 500, never empty success', async () => {
  for (const query of ['period=custom', 'module=SECRET', 'page=-1', 'page=abc', 'from=2026-02-30', 'period=custom&from=2026-10-22&to=2026-10-20']) assert.equal((await get(`/records?${query}`)).status, 400);
  fail = true; assert.equal((await get('/overview')).status, 500);
});
test('chart totals and overdue subsets match their drill-down selection for the same scope', async () => {
  actor = user('ADMIN');
  const overview = await get('/overview?period=today&module=DELIVERY');
  for (const bar of overview.body.status) {
    const query = `metric=open&period=today&module=DELIVERY&status=${encodeURIComponent(bar.status)}`;
    assert.equal((await get(`/records?${query}`)).body.total, bar.total);
    assert.equal((await get(`/records?${query}&overdue=true`)).body.total, bar.overdue);
  }
});
