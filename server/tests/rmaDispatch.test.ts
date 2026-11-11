import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import router from '../src/routes/rmaDispatch';
import recordsRouter from '../src/routes/records';
import { signToken } from '../src/middleware/auth';
import { podStorage } from '../src/services/podStorage';
import { rmaTestPolicy } from './rmaTestPolicy';
import type { PolicyRole } from '../src/services/permissionCatalog';

const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWMwTpsJAAICATMDms/iAAAAAElFTkSuQmCC', 'base64');
const restorers: Array<() => void> = [];
function stub(target: any, key: string, fn: (...args: any[]) => any) {
  const previous = target[key]; target[key] = mock.fn(fn); restorers.push(() => { target[key] = previous; });
  return target[key];
}
afterEach(() => { while (restorers.length) restorers.pop()!(); mock.restoreAll(); });
function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(condition => matches(row, condition));
    if (key === 'OR') return value.some((condition: any) => matches(row, condition));
    if (key === 'NOT') return !matches(row, value);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('not' in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
}
function fixture(overrides: Record<string, any> = {}) {
  let actor: any;
  let row: any = { id: 'rma-test', category: 'RMA', draft: false, status: 'SCHEDULED', priority: '2 - Moderate',
    companyId: 'company', company: { name: 'Company' }, createdById: 'tass', modifiedById: 'tass', createdBy: { name: 'TASS' }, modifiedBy: { name: 'TASS' },
    rmaReference: 'POL-255', reference: '', driverId: 'driver-one', driver: 'Driver One', driverAssistants: '[]', vehicle: 'Van',
    rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'PENDING', rmaVersion: 0,
    deliveryDate: '2020-01-01', timeIn: null, timeOut: null, receivedBy: null, rmaReceivedAt: null,
    rmaTransportStartedAt: null, rmaTransportCompletedAt: null, rmaRecipient: null, rmaCompletedAt: null, deletedAt: null,
    createdAt: new Date(), updatedAt: new Date(), area: 'Carmona', accountManager: 'AM', ...overrides };
  let proof = false, failAudit = false;
  let audits: any[] = [], remarks: any[] = [];
  const profiles = [{ id: 'driver-one', name: 'Driver One', type: 'DRIVER', isActive: true }, { id: 'driver-two', name: 'Driver Two', type: 'DRIVER', isActive: true }, { id: 'inactive', name: 'Inactive', type: 'DRIVER', isActive: false }];
  stub(prisma.user, 'findUnique', async () => actor);
  stub(prisma.user, 'findMany', async () => []);
  stub(prisma.rolePolicy, 'findUnique', async ({ where }: any) => rmaTestPolicy(where.role));
  stub(prisma.rolePolicy, 'findMany', async () => []);
  stub(prisma.deliveryRecord, 'findUnique', async ({ where }: any) => row.id === where.id ? structuredClone(row) : null);
  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => matches(row, where) ? structuredClone(row) : null);
  stub(prisma.deliveryRecord, 'update', async ({ data }: any) => {
    row = { ...row, ...data, rmaVersion: data.rmaVersion?.increment ? row.rmaVersion + data.rmaVersion.increment : row.rmaVersion,
      modifiedBy: { name: actor.name }, updatedAt: new Date() };
    return structuredClone(row);
  });
  stub(prisma.driver, 'findUnique', async ({ where }: any) => profiles.find(profile => profile.id === where.id) ?? null);
  stub(prisma.driver, 'findFirst', async () => null);
  stub(prisma.auditLog, 'create', async ({ data }: any) => { if (failAudit) throw new Error('audit unavailable'); audits.push(data); return data; });
  stub(prisma.remarkLog, 'create', async ({ data }: any) => { remarks.push(data); return data; });
  stub(prisma.notification, 'createMany', async () => ({ count: 0 }));
  const attachment = { id: 'proof', recordId: row.id, storageKey: 'proof.png', mimeType: 'image/png', size: photo.length };
  stub(prisma.podAttachment, 'findMany', async () => proof ? [attachment] : []);
  stub(prisma.podAttachment, 'findFirst', async () => proof ? attachment : null);
  const reads = stub(podStorage, 'read', async () => photo);
  stub(prisma, '$queryRaw', async () => []);
  stub(prisma, '$executeRaw', async () => 1);
  stub(prisma, '$transaction', async (work: any) => {
    const before = structuredClone(row), beforeAudits = [...audits], beforeRemarks = [...remarks];
    try { return await work(prisma); }
    catch (error) { row = before; audits = beforeAudits; remarks = beforeRemarks; throw error; }
  });
  async function request(role: PolicyRole, method: string, path: string, body: any = {}, options: { profile?: string | null; deny?: string } = {}) {
    const profile = options.profile === undefined ? 'driver-one' : options.profile;
    actor = { id: role.toLowerCase(), name: role, email: `${role}@example.test`, role, permissions: [], permissionOverrides: options.deny ? [{ permissionKey: options.deny, effect: 'DENY' }] : [],
      isActive: true, authorizationRevision: 1n, driverProfile: role === 'DRIVER' && profile ? { id: profile, type: 'DRIVER', isActive: true } : null };
    const source = path === '/:id/status' || path === '/:id' ? recordsRouter : router;
    const route = (source as any).stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
    const req: any = { method: method.toUpperCase(), headers: {}, cookies: { mg_session: signToken({ id: actor.id, name: actor.name, email: actor.email, role: actor.role }) }, params: { id: row.id }, body };
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
      const res: any = { statusCode: 200, setHeader() {}, clearCookie() {}, status(code: number) { this.statusCode = code; return this; }, json(value: any) { resolve({ status: this.statusCode, body: value }); } };
      let index = 0;
      const next = (error?: any) => {
        if (error) { reject(error); return; }
        const handler = route.stack[index++]?.handle;
        if (!handler) { reject(new Error('No response')); return; }
        Promise.resolve(handler(req, res, next)).catch(reject);
      };
      next();
    });
  }
  return { request, saved: () => structuredClone(row), audits: () => audits, remarks: () => remarks, proof: () => { proof = true; }, failAudit: () => { failAudit = true; }, reads };
}

test('eligible assignment validates Driver IDs, preserves bounded edits and rejects stale saves', async () => {
  const state = fixture({ driverId: null, driver: '' });
  const body = { driver_id: 'driver-one', vehicle: 'Van 2', driver_assistants: [], expected_version: 0, remarks: 'Dispatch' };
  for (const id of ['missing', 'inactive']) {
    assert.equal((await state.request('LOGISTICS', 'patch', '/:id/rma-assignment', { ...body, driver_id: id })).status, 400);
  }
  assert.equal((await state.request('LOGISTICS', 'patch', '/:id/rma-assignment', { ...body, priority: '3 - High' })).status, 400);
  const saved = await state.request('LOGISTICS', 'patch', '/:id/rma-assignment', body);
  assert.equal(saved.status, 200); assert.equal(saved.body.driver_id, 'driver-one'); assert.equal(saved.body.rma_version, 1);
  assert.equal((await state.request('LOGISTICS', 'patch', '/:id/rma-assignment', body)).status, 409);
  assert.equal(state.audits().length, 1); assert.equal(state.remarks().length, 1);
  assert.equal((await state.request('LOGISTICS', 'put', '/:id', { rma_reference: 'FORGED', remarks: 'Edit', expected_version: 1 })).status, 403);
});

test('transport access requires assigned linked Driver, eligible movement, Read/Write/action permissions and date', async () => {
  const state = fixture();
  const body = { transport_status: 'IN_TRANSIT', expected_version: 0, remarks: 'Starting' };
  for (const options of [{ profile: null }, { profile: 'driver-two' }, { deny: 'CATEGORY:RMA:READ' }, { deny: 'CATEGORY:RMA:WRITE' }, { deny: 'CATEGORY:RMA:STATUS' }]) {
    assert.equal((await state.request('DRIVER', 'patch', '/:id/rma-transport', body, options)).status, 403);
  }
  assert.equal(state.reads.mock.callCount(), 0, 'denied requests never inspect stored proof');
  assert.equal(state.audits().length, 0);
  for (const overrides of [{ draft: true }, { rmaMovement: 'SUPPLIER_COLLECTION' }, { rmaMovement: 'INTERNAL_NO_DRIVER' }, { rmaMovement: null }, { deliveryDate: '2999-01-01' }]) {
    const excluded = fixture(overrides);
    assert.equal((await excluded.request('DRIVER', 'patch', '/:id/rma-transport', body)).status, 403);
    assert.equal(excluded.audits().length, 0);
  }
});

test('RMA POD capability is withheld until the assigned transport is in transit', async () => {
  const state = fixture({ rmaTransportStatus: 'PENDING' });
  const pending = await state.request('DRIVER', 'get', '/:id/rma-capabilities');
  assert.equal(pending.status, 200);
  assert.equal(pending.body.transport, true);
  assert.equal(pending.body.pod, false);

  const started = await state.request('DRIVER', 'patch', '/:id/rma-transport', {
    transport_status: 'IN_TRANSIT', expected_version: 0, remarks: 'Start transport',
  });
  assert.equal(started.status, 200);
  const inTransit = await state.request('DRIVER', 'get', '/:id/rma-capabilities');
  assert.equal(inTransit.status, 200);
  assert.equal(inTransit.body.transport, true);
  assert.equal(inTransit.body.pod, true);
});

test('reassignment immediately transfers Driver read/transport authority and keeps audit attribution', async () => {
  const state = fixture();
  assert.equal((await state.request('LOGISTICS', 'patch', '/:id/rma-assignment', { driver_id: 'driver-two', expected_version: 0, remarks: 'Cover another route' })).status, 200);
  assert.equal((await state.request('DRIVER', 'get', '/:id/rma-capabilities')).status, 403);
  assert.equal((await state.request('DRIVER', 'patch', '/:id/rma-transport', { transport_status: 'IN_TRANSIT', expected_version: 1, remarks: 'Start' })).status, 403);
  const updated = await state.request('DRIVER', 'patch', '/:id/rma-transport', { transport_status: 'IN_TRANSIT', expected_version: 1, remarks: 'Start' }, { profile: 'driver-two' });
  assert.equal(updated.status, 200); assert.equal(updated.body.rma_transport_status, 'IN_TRANSIT');
  assert.equal(state.audits()[0].changedById, 'logistics'); assert.equal(state.audits()[1].changedById, 'driver');
});

test('transport proof, physical receipt and final completion remain separate with no fabricated driver clocks', async () => {
  const state = fixture();
  assert.equal((await state.request('TASS', 'post', '/:id/rma-receipt', { recipient: 'Recipient', expected_version: 0, remarks: 'Receive too soon' })).status, 403);
  const started = await state.request('DRIVER', 'patch', '/:id/rma-transport', { transport_status: 'IN_TRANSIT', expected_version: 0, remarks: 'Start' });
  assert.equal(started.status, 200);
  assert.deepEqual(started.body.driver_actions, { start: false, complete: true, start_blocked_reason: null });
  const finish = { transport_status: 'COMPLETED', expected_version: 1, remarks: 'Transport delivered', received_by: ' Warehouse guard ' };
  assert.equal((await state.request('DRIVER', 'patch', '/:id/rma-transport', finish)).status, 400);
  state.proof();
  // Received By is required on every driver completion, RMA included.
  for (const received_by of [undefined, '', '   ', 'x'.repeat(121)]) {
    const missing = await state.request('DRIVER', 'patch', '/:id/rma-transport', { ...finish, received_by });
    assert.equal(missing.status, 400); assert.match(missing.body.error, /Received By/);
  }
  assert.equal((await state.request('DRIVER', 'patch', '/:id/rma-transport', { transport_status: 'IN_TRANSIT', expected_version: 1, remarks: 'Again', received_by: 'Early' })).status, 400);
  const done = await state.request('DRIVER', 'patch', '/:id/rma-transport', finish);
  assert.equal(done.status, 200); assert.equal(done.body.status, 'Scheduled'); assert.equal(done.body.rma_received_at, null);
  assert.equal(done.body.rma_transport_received_by, 'Warehouse guard');
  assert.deepEqual(done.body.driver_actions, { start: false, complete: false, start_blocked_reason: null });
  assert.equal(done.body.time_in, null); assert.equal(done.body.time_out, null);
  const receipt = await state.request('TASS', 'post', '/:id/rma-receipt', { recipient: ' Recipient ', expected_version: 2, remarks: 'Units received' });
  assert.equal(receipt.status, 200); assert.equal(receipt.body.rma_received_by, 'tass'); assert.equal(receipt.body.rma_recipient, 'Recipient');
  assert.equal(receipt.body.rma_transport_received_by, 'Warehouse guard', 'TASS receipt does not overwrite the transport handover name');
  assert.equal(receipt.body.driver_actions, undefined, 'only Drivers receive driver_actions');
  assert.equal(receipt.body.status, 'Scheduled');
  assert.equal((await state.request('ADMIN', 'patch', '/:id/status', { status: 'Delivered', expected_version: 3, remarks: 'Complete' })).status, 403);
  const completed = await state.request('TASS', 'patch', '/:id/status', { status: 'Delivered', expected_version: 3, remarks: 'Checked and complete' });
  assert.equal(completed.status, 200); assert.equal(completed.body.status, 'Delivered'); assert.ok(completed.body.rma_completed_at);
  assert.equal(completed.body.time_in, null); assert.equal(completed.body.time_out, null);
});

test('supplier/internal no-driver receipt and completion require no assignment, date or transport clocks', async () => {
  for (const movement of ['SUPPLIER_COLLECTION', 'INTERNAL_NO_DRIVER']) {
    const state = fixture({ rmaMovement: movement, rmaTransportStatus: null, driverId: null, driver: '', deliveryDate: '' });
    assert.equal((await state.request('LOGISTICS', 'patch', '/:id/rma-assignment', { driver_id: 'driver-one', expected_version: 0, remarks: 'Forbidden' })).status, 403);
    assert.equal((await state.request('TASS', 'post', '/:id/rma-receipt', { recipient: 'Collector', expected_version: 0, remarks: 'Received' })).status, 200);
    assert.equal((await state.request('TASS', 'patch', '/:id/status', { status: 'Delivered', expected_version: 1, remarks: 'Completed' })).status, 200);
    assert.equal(state.saved().driverId, null); assert.equal(state.saved().timeIn, null); assert.equal(state.saved().timeOut, null);
  }
});

test('an audit failure rolls assignment and version back with no success response', async () => {
  const state = fixture(); state.failAudit();
  await assert.rejects(state.request('LOGISTICS', 'patch', '/:id/rma-assignment', { driver_id: 'driver-two', expected_version: 0, remarks: 'Reassign' }), /audit unavailable/);
  assert.equal(state.saved().driverId, 'driver-one'); assert.equal(state.saved().rmaVersion, 0);
  assert.equal(state.audits().length, 0); assert.equal(state.remarks().length, 0);
});

test('generic RMA writes cannot bypass assignment, receiving or metadata Update denials', async () => {
  const state = fixture();
  for (const body of [{ driver_id: 'driver-two' }, { vehicle: 'Van' }, { driver_assistants: [] }, { received_by: 'Admin' }, { time_out: new Date().toISOString() }]) {
    assert.equal((await state.request('ADMIN', 'put', '/:id', { ...body, remarks: 'Bypass', expected_version: 0 })).status, 403);
  }
  assert.equal((await state.request('TASS', 'patch', '/:id/status', { status: 'On-Hold', priority: '3 - High', remarks: 'Bypass', expected_version: 0 }, { deny: 'CATEGORY:RMA:UPDATE' })).status, 403);
  const draft = fixture({ draft: true });
  assert.equal((await draft.request('TASS', 'put', '/:id', { is_draft: 'No', item_description: 'Changed', remarks: 'Submit plus edit', expected_version: 0 }, { deny: 'CATEGORY:RMA:UPDATE' })).status, 403);
  assert.equal(state.audits().length, 0); assert.equal(draft.audits().length, 0);
});
