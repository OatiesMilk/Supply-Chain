import { test, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/db';
import { signToken, type Role } from '../src/middleware/auth';
import recordsRoutes from '../src/routes/records';
import { recordEditVersion } from '../src/services/recordEditVersion';

function record(extra: Record<string, unknown> = {}) {
  return { id: 'REC-legacy', category: 'DELIVERY', draft: true, status: 'SCHEDULED', deletedAt: null,
    reference: 'REF-1', deliveryDate: '', companyId: 'company-one', company: { name: 'Company' },
    priority: '2 - Moderate', driver: '', driverId: null, driverAssistants: '[]',
    timeIn: null, timeOut: null, receivedBy: null, collectionVerified: false,
    createdById: 'creator', modifiedById: 'actor', lineItems: [], podAttachments: [],
    createdAt: new Date(), updatedAt: new Date(), ...extra };
}

/** Actual HTTP/router checks with a transaction double, never a business database. */
async function fixture(t: TestContext, role: Role = 'ADMIN') {
  const originalMode = process.env.PERMISSION_MODE;
  process.env.PERMISSION_MODE = 'LEGACY';
  const restorers: Array<() => void> = [];
  function stub(target: any, method: string, implementation: (...args: any[]) => any) {
    const original = target[method];
    target[method] = mock.fn(implementation);
    restorers.push(() => { target[method] = original; });
  }
  t.after(() => {
    while (restorers.length) restorers.pop()!();
    if (originalMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = originalMode;
  });
  let row = record();
  const audits: unknown[] = [];
  const notifications: unknown[] = [];
  const updates: unknown[] = [];
  let failAudit = false;
  let failNotification = false;
  let onRead: (() => Promise<void>) | undefined;
  const actor = { id: 'actor', role, name: 'Verifier', email: 'actor@example.test', permissions: [], isActive: true };
  stub(prisma.user, 'findUnique', async () => actor);
  stub(prisma.user, 'findMany', async () => []);
  stub(prisma.company, 'findUnique', async () => ({ id: 'company-one', isActive: true }));
  stub(prisma.deliveryRecord, 'findFirst', async () => structuredClone(row));
  const tx = {
    user: { findMany: async () => [{ id: 'logistics-user' }] },
    $queryRaw: async () => [], $executeRaw: async () => 1,
    deliveryRecord: {
      findFirst: async () => { const current = structuredClone(row); await onRead?.(); return current; },
      findUnique: async () => structuredClone(row),
      findUniqueOrThrow: async () => structuredClone(row),
      create: async ({ data }: any) => { row = record(data); return structuredClone(row); },
      update: async ({ data }: any) => { updates.push(data); Object.assign(row, data); return structuredClone(row); },
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.collectionVerified, false);
        assert.equal(where.status, 'ACCOMPLISHED');
        assert.equal(where.draft, false);
        assert.equal(where.category, 'ACCOUNTING_COLLECTION');
        assert.equal(where.deletedAt, null);
        assert.ok(where.AND.length, 'conditional update retains authorization scope');
        if (row.collectionVerified || row.status !== where.status || row.deletedAt || row.draft) return { count: 0 };
        updates.push(data); Object.assign(row, data); return { count: 1 };
      },
    },
    auditLog: { create: async ({ data }: any) => { if (failAudit) throw new Error('Audit unavailable'); audits.push(data); } },
    remarkLog: { create: async () => ({}) },
    notification: { create: async ({ data }: any) => { if (failNotification) throw new Error('Notification unavailable'); notifications.push(data); }, createMany: async ({ data }: any) => { if (failNotification) throw new Error('Notification unavailable'); notifications.push(...data); return { count: data.length }; } },
  };
  stub(prisma, '$transaction', async (work: any) => {
    const before = structuredClone(row);
    const auditCount = audits.length;
    const notificationCount = notifications.length;
    try { return await work(tx); } catch (error) {
      row = before; audits.length = auditCount; notifications.length = notificationCount; throw error;
    }
  });
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/records', recordsRoutes);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookie = `mg_session=${signToken(actor)}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  return { stub, audits, notifications, updates, row: () => row, setRow(extra: Record<string, unknown>) { row = record(extra); },
    failAudit() { failAudit = true; }, failNotification() { failNotification = true; },
    interleaveReads() {
      let reads = 0; let release!: () => void;
      const barrier = new Promise<void>(resolve => { release = resolve; });
      onRead = async () => { if (++reads === 2) release(); await barrier; };
    },
    request(path: string, method: string, body: unknown, withPrecondition = true) {
      if (method === 'PUT' && row.category !== 'RMA' && withPrecondition) body = { expected_edit_version: recordEditVersion(row), ...(body as any) };
      return fetch(origin + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    },
  };
}

for (const category of ['DELIVERY', 'PROCUREMENT_PICKUP', 'ACCOUNTING_COLLECTION', 'SALES_ORDERS']) {
  test(`${category} draft submission rejects missing and malformed dates through both PUT and PATCH`, async t => {
    const state = await fixture(t);
    for (const deliveryDate of ['', '2026-02-30', 'next week']) {
      state.setRow({ category, deliveryDate });
      for (const [path, method, body] of [
        ['/records/REC-legacy', 'PUT', { is_draft: 'No', remarks: 'Submit' }],
        ['/records/REC-legacy/status', 'PATCH', { status: 'Scheduled', remarks: 'Submit' }],
      ] as const) {
        const response = await state.request(path, method, body);
        assert.equal(response.status, 400, await response.text());
        assert.equal(state.row().draft, true);
      }
    }
    assert.equal(state.updates.length, 0);
    assert.equal(state.audits.length, 0);
  });
}

test('PUT submission validates and saves the merged reference/date; PATCH uses the saved valid date', async t => {
  const state = await fixture(t);
  const response = await state.request('/records/REC-legacy', 'PUT', { is_draft: 'No', delivery_date: '2026-10-30', reference: 'REF-NEW', remarks: 'Submit with date' });
  assert.equal(response.status, 200, await response.text());
  assert.equal(state.row().draft, false);
  assert.equal(state.row().deliveryDate, '2026-10-30');
  assert.equal(state.row().reference, 'REF-NEW');
  state.setRow({ deliveryDate: '2026-10-30' });
  const status = await state.request('/records/REC-legacy/status', 'PATCH', { status: 'Scheduled', remarks: 'Submit saved date' });
  assert.equal(status.status, 200, await status.text());
  assert.equal(state.row().draft, false);
});

test('submission checks the current locked record rather than the earlier middleware snapshot', async t => {
  const state = await fixture(t);
  state.stub(prisma.deliveryRecord, 'findFirst', async () => record({ deliveryDate: '2026-10-30' }));
  const response = await state.request('/records/REC-legacy', 'PUT', { is_draft: 'No', remarks: 'Submit stale draft' });
  assert.equal(response.status, 400);
  assert.match((await response.json() as any).error, /Delivery Date is required/);
  assert.equal(state.updates.length, 0);
});

test('valid record creation uses UUID IDs even when Math.random repeats, and legacy IDs remain addressable', async t => {
  const state = await fixture(t);
  t.mock.method(Math, 'random', () => 0);
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await state.request('/records', 'POST', { category: 'Deliveries', company_id: 'company-one', reference: 'REF-1', delivery_date: '2026-10-30' });
    assert.equal(response.status, 201, response.status === 201 ? undefined : await response.text());
    ids.push((await response.json() as any).id);
  }
  assert.notEqual(ids[0], ids[1]);
  for (const id of ids) assert.match(id, /^REC-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  state.setRow({ deliveryDate: '2026-10-30' });
  assert.equal((await state.request('/records/REC-legacy', 'PUT', { remarks: 'Edit legacy record' })).status, 200);
});

test('concurrent collection confirmations produce one verification, one conflict, and one audit/alert', async t => {
  const state = await fixture(t, 'TASS');
  state.setRow({ category: 'ACCOUNTING_COLLECTION', draft: false, status: 'ACCOMPLISHED' });
  // Deliberately let both transactions read unverified state: the conditional
  // write must still protect confirmation even without a real PostgreSQL lock.
  state.interleaveReads();
  const responses = await Promise.all([state.request('/records/REC-legacy/verify-collection', 'PATCH', {}), state.request('/records/REC-legacy/verify-collection', 'PATCH', {})]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(state.updates.length, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.row().collectionVerified, true);
});

for (const failure of ['audit', 'notification']) {
  test(`collection verification rolls back when ${failure} persistence fails and forwards the async error`, async t => {
    const state = await fixture(t, 'TASS');
    state.setRow({ category: 'ACCOUNTING_COLLECTION', draft: false, status: 'ACCOMPLISHED' });
    failure === 'audit' ? state.failAudit() : state.failNotification();
    const response = await state.request('/records/REC-legacy/verify-collection', 'PATCH', {});
    assert.equal(response.status, 500);
    assert.match((await response.json() as any).error, /unavailable/);
    assert.equal(state.row().collectionVerified, false);
    assert.equal(state.audits.length, 0);
    assert.equal(state.notifications.length, 0);
  });
}

test('collection verification rejects completed drafts, uncompleted records, and repeats', async t => {
  const state = await fixture(t, 'TASS');
  for (const [extra, expected] of [
    [{ draft: true, status: 'ACCOMPLISHED' }, 400],
    [{ draft: false, status: 'SCHEDULED' }, 400],
    [{ draft: false, status: 'ACCOMPLISHED', collectionVerified: true }, 409],
  ] as const) {
    state.setRow({ category: 'ACCOUNTING_COLLECTION', ...extra });
    assert.equal((await state.request('/records/REC-legacy/verify-collection', 'PATCH', {})).status, expected);
  }
  assert.equal(state.updates.length, 0);
});

for (const category of ['DELIVERY', 'PROCUREMENT_PICKUP', 'ACCOUNTING_COLLECTION', 'SALES_ORDERS']) {
  test(`${category} submitted records cannot lose their required reference/date through metadata edits`, async t => {
    const state = await fixture(t);
    state.setRow({ category, draft: false, deliveryDate: '2026-10-30' });
    for (const invalid of [{ delivery_date: '' }, { delivery_date: '2026-02-30' }, { reference: '   ' }]) {
      const response = await state.request('/records/REC-legacy', 'PUT', { ...invalid, remarks: 'Invalid correction' });
      assert.equal(response.status, 400);
    }
    assert.equal(state.updates.length, 0);
  });
}

test('Admin cannot verify collections despite having broad record access', async t => {
  const state = await fixture(t, 'ADMIN');
  state.setRow({ category: 'ACCOUNTING_COLLECTION', draft: false, status: 'ACCOMPLISHED' });
  assert.equal((await state.request('/records/REC-legacy/verify-collection', 'PATCH', {})).status, 403);
  assert.equal(state.updates.length, 0);
});


test('ordinary editor requires a precondition and rejects a stale overwrite without audit effects', async t => {
 const state=await fixture(t,'SALES_COORDINATOR');
 state.setRow({draft:false,deliveryDate:'2026-10-30',reference:'REF-original',address:'Original address'});
 const version=recordEditVersion(state.row());
 assert.equal((await state.request('/records/REC-legacy','PUT',{address:'Missing',remarks:'Missing token'},false)).status,428);
 const first=await state.request('/records/REC-legacy','PUT',{expected_edit_version:version,reference:'REF-new',remarks:'Correct reference'});
 assert.equal(first.status,200,await first.text());
 const second=await state.request('/records/REC-legacy','PUT',{expected_edit_version:version,reference:'REF-original',address:'New address',remarks:'Stale draft'});
 assert.equal(second.status,409);assert.equal(state.row().reference,'REF-new');assert.equal(state.row().address,'Original address');
 assert.equal(state.updates.length,1);assert.equal(state.audits.length,1);
});

test('edit versions detect same-timestamp state and line-item changes, but allow independent POD uploads',()=>{
 const row=record({updatedAt:new Date('2026-10-30T01:00:00Z'),lineItems:[{sku:'SKU',quantity:1}]});
 const version=recordEditVersion(row);
 assert.notEqual(recordEditVersion({...row,reference:'Changed'}),version);
 assert.notEqual(recordEditVersion({...row,lineItems:[{sku:'SKU',quantity:2}]}),version);
 assert.equal(recordEditVersion({...row,podAttachments:[{id:'new-photo'}]}),version);
});

test('Sales metadata is locked after dispatch',async t=>{
 const state=await fixture(t,'SALES_COORDINATOR');
 for(const status of ['IN_TRANSIT','ACCOMPLISHED','ON_HOLD','RESCHEDULED']){
  state.setRow({draft:false,status,deliveryDate:'2026-10-30',timeIn:'2026-10-30T01:00:00Z'});
  assert.equal((await state.request('/records/REC-legacy','PUT',{reference:'Changed',remarks:'Disallowed correction'})).status,403);
 }
 assert.equal(state.updates.length,0);
});

for(const category of ['DELIVERY','PROCUREMENT_PICKUP','ACCOUNTING_COLLECTION','SALES_ORDERS']){
 test(`${category}: equivalent PUT/PATCH submissions notify Logistics once`,async t=>{
  const state=await fixture(t);
  state.setRow({category,deliveryDate:'2026-10-30'});
  const put=await state.request('/records/REC-legacy','PUT',{is_draft:'No',remarks:'Submit by PUT'});
  assert.equal(put.status,200,await put.text());assert.equal(state.notifications.length,1);
  assert.equal((state.notifications[0] as any).userId,'logistics-user');
  state.setRow({category,deliveryDate:'2026-10-30'});
  const patch=await state.request('/records/REC-legacy/status','PATCH',{status:'Scheduled',remarks:'Submit by PATCH'});
  assert.equal(patch.status,200,await patch.text());assert.equal(state.notifications.length,2);
  const repeat=await state.request('/records/REC-legacy','PUT',{is_draft:'No',remarks:'Same state'});
  assert.equal(repeat.status,200,await repeat.text());assert.equal(state.notifications.length,2);
 });
}

test('submission and audit roll back if Logistics alert persistence fails',async t=>{
 const state=await fixture(t);state.setRow({deliveryDate:'2026-10-30'});state.failNotification();
 assert.equal((await state.request('/records/REC-legacy','PUT',{is_draft:'No',remarks:'Submit'})).status,500);
 assert.equal(state.row().draft,true);assert.equal(state.audits.length,0);
});


test('status priority extras cannot bypass metadata version checks', async t=>{
 const state=await fixture(t);state.setRow({draft:false,deliveryDate:'2026-10-30',priority:'2 - Moderate'});
 const version=recordEditVersion(state.row());
 const body={status:'Scheduled',priority:'3 - High',remarks:'Priority correction'};
 assert.equal((await state.request('/records/REC-legacy/status','PATCH',body)).status,428);
 assert.equal((await state.request('/records/REC-legacy/status','PATCH',{...body,expected_edit_version:version})).status,200);
 assert.equal((await state.request('/records/REC-legacy/status','PATCH',{...body,priority:'1 - Low',expected_edit_version:version})).status,409);
 assert.equal(state.row().priority,'3 - High');assert.equal(state.audits.length,1);
});

test('Admin retains audited metadata correction authority on completed records', async t => {
  const state = await fixture(t, 'ADMIN');
  state.setRow({ draft: false, status: 'ACCOMPLISHED', deliveryDate: '2026-10-30' });
  const response = await state.request('/records/REC-legacy', 'PUT', { reference: 'Corrected reference', remarks: 'Approved administrative correction' });
  assert.equal(response.status, 200, await response.text());
  assert.equal(state.row().reference, 'Corrected reference');
  assert.equal(state.audits.length, 1);
});
