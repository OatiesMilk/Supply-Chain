import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import records from '../src/routes/records';
import sampler from '../src/routes/data-sampler';
import { signToken } from '../src/middleware/auth';
import { podStorage } from '../src/services/podStorage';
import { allowedStatuses, manilaToday } from '../src/services/deliveryLifecycle';
import { recordScope } from '../src/services/recordAccess';
import { isPodPhoto } from '../src/services/podPhotos';

const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const restorers: (() => void)[] = [];
function stub(target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  const replacement = mock.fn(implementation);
  target[key] = replacement;
  restorers.push(() => { target[key] = original; });
  return replacement;
}
function restoreStubs() {
  while (restorers.length) restorers.pop()!();
  mock.restoreAll();
}
const originalMailEnv = Object.fromEntries(['SMTP_HOST', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'].map(key => [key, process.env[key]]));
const user = (role = 'DRIVER') => ({ id: 'test-user', name: 'Assigned Driver', email: 'test@example.com', role, isActive: true, permissions: [] });
const attachment = (overrides: Record<string, unknown> = {}) => ({ id: 'photo-1', recordId: 'delivery-1', originalName: 'photo.png', mimeType: 'image/png', storageKey: 'photo.png', size: photo.length, createdAt: new Date(), ...overrides });
const record = (overrides: Record<string, unknown> = {}) => ({ id: 'delivery-1', category: 'DELIVERY', status: 'IN_TRANSIT', draft: false, timeIn: '2026-10-06T01:00:00.000Z', receivedBy: 'Receiver', reference: 'REF', driverAssistants: '[]', priority: '2 - Moderate', driver: 'Assigned Driver', company: { name: 'Test Company' }, accountManager: 'Test AM', deletedAt: null, ...overrides });

beforeEach(() => {
  for (const key of Object.keys(originalMailEnv)) delete process.env[key];
});
afterEach(() => {
  restoreStubs();
  for (const [key, value] of Object.entries(originalMailEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

// Exercise the actual middleware/handlers in memory: no listener, live DB or email.
async function request(method: string, path: string, options: { role?: string; body?: unknown; file?: unknown; attachmentId?: string; router?: any } = {}) {
  const actor = user(options.role);
  stub(prisma.user, 'findUnique', async () => actor as any);
  const route = (options.router ?? records).stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req: any = { method: method.toUpperCase(), headers: {}, cookies: { mg_session: signToken(actor as any) },
    params: { id: path === '/' ? undefined : 'delivery-1', attachmentId: options.attachmentId ?? 'photo-1' }, body: options.body ?? {}, file: options.file };
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const res: any = { statusCode: 200, setHeader() {}, clearCookie() {},
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { resolve({ status: this.statusCode, body }); return this; },
      send(body: unknown) { resolve({ status: this.statusCode, body }); return this; } };
    let index = 0;
    const next = (error?: unknown) => {
      if (error) return reject(error);
      const handler = route.stack[index++]?.handle;
      if (!handler) return reject(new Error('Route did not return a response'));
      try { Promise.resolve(handler(req, res, next)).catch(reject); } catch (error) { reject(error); }
    };
    next();
  });
}

function database(row = record(), files: any[] = []) {
  let saved = row;
  const events: string[] = [];
  const audit: any[] = [];
  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => {
    const scopedDriver = where.AND?.[0]?.driver;
    return scopedDriver && (scopedDriver !== saved.driver || saved.draft) ? null : saved as any;
  });
  const tx = {
    $executeRaw: async () => [],
    $queryRaw: async () => { events.push('lock'); return [{ id: saved.id }]; },
    deliveryRecord: {
      findFirst: async ({ where }: any) => { const scope = where.AND?.[0]; return scope?.driver && (saved.driver !== scope.driver || saved.draft) ? null : saved; },
      findUnique: async () => saved,
      update: async ({ data }: any) => { events.push('update'); saved = { ...saved, ...data }; return saved; },
      updateMany: async ({ data }: any) => { events.push('update'); saved = { ...saved, ...data }; return { count: 1 }; },
      findUniqueOrThrow: async () => saved,
    },
    podAttachment: {
      findMany: async ({ where }: any) => { events.push('photos'); return files.filter(file => file.id !== where.id?.not); },
      findFirst: async () => files[0] ?? null,
      delete: async () => { events.push('delete'); return files.shift(); },
    },
    auditLog: { create: async ({ data }: any) => { events.push('audit'); audit.push(data); return {}; } },
    remarkLog: { create: async () => { events.push('remark'); return {}; } },
  };
  stub(prisma, '$transaction', async (fn: any) => fn(tx));
  stub(prisma.notificationLog, 'create', async () => ({} as any));
  stub(prisma.user, 'findMany', async () => []);
  stub(podStorage, 'read', async () => photo);
  return { events, audit, saved: () => saved };
}

test('image proof checks bytes, rejecting renamed, empty, mismatched and truncated files', () => {
  assert.equal(isPodPhoto(photo, 'image/png'), true);
  assert.equal(isPodPhoto(photo, 'image/jpeg'), false);
  assert.equal(isPodPhoto(Buffer.from('not a photo'), 'image/png'), false);
  assert.equal(isPodPhoto(Buffer.alloc(0), 'image/jpeg'), false);
  assert.equal(isPodPhoto(photo.subarray(0, 30), 'image/png'), false);
});

test('assigned driver can upload a saved photo and list its verified photo flag', async () => {
  database();
  const save = stub(podStorage, 'save', async () => 'photo.png');
  stub(prisma.podAttachment, 'create', async () => attachment() as any);
  const result = await request('post', '/:id/attachments', { file: { originalname: 'photo.png', mimetype: 'image/png', size: photo.length, buffer: photo } });
  assert.equal(result.status, 201);
  assert.equal(result.body.is_photo, true);
  assert.equal(save.mock.callCount(), 1);
  stub(prisma.podAttachment, 'findMany', async () => [attachment(), attachment({ id: 'pdf', mimeType: 'application/pdf' })] as any);
  const listed = await request('get', '/:id/attachments');
  assert.deepEqual(listed.body.map((file: any) => file.is_photo), [true, false]);
});

test('driver cannot upload to another driver record and counterfeit image uploads are rejected before storage', async () => {
  database(record({ driver: 'Another Driver' }));
  const save = stub(podStorage, 'save', async () => 'unexpected');
  const file = { originalname: 'photo.png', mimetype: 'image/png', size: photo.length, buffer: photo };
  assert.equal((await request('post', '/:id/attachments', { file })).status, 403);
  stub(prisma.deliveryRecord, 'findFirst', async () => record() as any);
  assert.equal((await request('post', '/:id/attachments', { file: { ...file, buffer: Buffer.from('not a photo') } })).status, 400);
  assert.equal(save.mock.callCount(), 0);
});

test('delivery completion rejects absent, document-only, missing and counterfeit photos without writes', async () => {
  for (const kind of ['empty', 'document', 'missing', 'counterfeit']) {
    restoreStubs();
    const state = database(record(), kind === 'empty' ? [] : [attachment(kind === 'document' ? { mimeType: 'application/pdf' } : {})]);
    if (kind === 'missing') stub(podStorage, 'read', async () => { throw new Error('missing'); });
    if (kind === 'counterfeit') stub(podStorage, 'read', async () => Buffer.alloc(photo.length));
    const result = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Completed' } });
    assert.equal(result.status, 400, kind);
    assert.match(result.body.error, /photo/);
    assert.deepEqual(state.events, ['lock', 'photos']);
    assert.equal(state.saved().status, 'IN_TRANSIT');
  }
});

test('a persisted photo enables delivery completion after taking the record lock', async () => {
  const state = database(record(), [attachment()]);
  const result = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Completed' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'Delivered');
  assert.deepEqual(state.events, ['lock', 'photos', 'update', 'audit', 'remark']);
});

test('Pending requires a started run and every category requires photo for completion', async () => {
  const pending = database();
  assert.equal((await request('patch', '/:id/status', { body: { status: 'Pending', remarks: 'Customer unavailable' } })).status, 200);
  assert.equal(pending.events.includes('photos'), false);
  for (const category of ['PROCUREMENT_PICKUP', 'ACCOUNTING_COLLECTION', 'RMA', 'SALES_ORDERS']) {
    restoreStubs();
    const state = database(record({ category }));
    const result = await request('patch', '/:id/status', { role: 'ADMIN', body: { status: 'Delivered', remarks: 'Updated' } });
    assert.equal(result.status, 400, category);
    assert.equal(state.events.includes('update'), false);
  }
});

test('delivery creation cannot bypass proof by specifying Delivered or a filename', async () => {
  database();
  const create = stub(prisma.deliveryRecord, 'create', async () => { throw new Error('Unexpected write'); });
  const result = await request('post', '/', { role: 'SALES_COORDINATOR', body: { company_id: 'company', category: 'Deliveries', reference: 'REF', status: 'Delivered', attachments: ['pretend-photo.jpg'] } });
  assert.equal(result.status, 400);
  assert.equal(create.mock.callCount(), 0);
});

test('last photo deletion on accomplished delivery is blocked under the same record lock', async () => {
  const state = database(record({ status: 'ACCOMPLISHED' }), [attachment()]);
  const remove = stub(podStorage, 'remove', async () => {});
  const result = await request('delete', '/:id/attachments/:attachmentId', { role: 'ADMIN' });
  assert.equal(result.status, 409);
  assert.deepEqual(state.events, ['lock', 'photos']);
  assert.equal(remove.mock.callCount(), 0);
});

test('a replacement photo allows removal while preserving delivery proof', async () => {
  const state = database(record({ status: 'ACCOMPLISHED' }), [attachment(), attachment({ id: 'replacement' })]);
  stub(podStorage, 'remove', async () => {});
  const result = await request('delete', '/:id/attachments/:attachmentId', { role: 'ADMIN' });
  assert.equal(result.status, 204);
  assert.deepEqual(state.events, ['lock', 'photos', 'delete', 'audit']);
});


test('completion enforces Time In, Received By and remarks for every role without partial writes', async () => {
  for (const role of ['DRIVER', 'LOGISTICS', 'ADMIN', 'TASS']) {
    for (const invalid of ['receiver', 'remarks', 'timeIn']) {
      restoreStubs();
      const state = database(record({ ...(role === 'TASS' ? { category: 'RMA' } : {}), ...(invalid === 'timeIn' ? { timeIn: null } : {}) }), [attachment()]);
      const result = await request('patch', '/:id/status', { role, body: { status: 'Delivered', remarks: invalid === 'remarks' ? '  ' : 'Completed', received_by: invalid === 'receiver' ? '   ' : 'Receiver' } });
      assert.equal(result.status, 400, `${role}/${invalid}`);
      assert.equal(state.events.includes('update'), false);
      assert.equal(state.events.includes('audit'), false);
    }
  }
});

test('all allowed completion roles persist Delivered with automatic server Time Out', async () => {
  for (const role of ['DRIVER', 'LOGISTICS', 'ADMIN', 'TASS']) {
    restoreStubs();
    const state = database(record(role === 'TASS' ? { category: 'RMA' } : {}), [attachment()]);
    const before = Date.now();
    const result = await request('patch', '/:id/status', { role, body: { status: 'Delivered', remarks: 'Completed', received_by: ' Receiver ' } });
    assert.equal(result.status, 200, role);
    assert.equal(result.body.status, 'Delivered');
    assert.equal(result.body.received_by, 'Receiver');
    assert.ok(new Date(result.body.time_out).getTime() >= before);
    assert.equal(state.audit[0].changedById, 'test-user');
  }
});

test('Time In stamps once for an assigned actionable run, ignores client clock and rejects repeat', async () => {
  const state = database(record({ status: 'SCHEDULED', timeIn: null }));
  const before = Date.now();
  const result = await request('post', '/:id/time-in', { body: { remarks: 'Starting run', time_in: 'spoofed' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'In Transit');
  assert.ok(new Date(result.body.time_in).getTime() >= before);
  const again = await request('post', '/:id/time-in', { body: { remarks: 'Start again' } });
  assert.equal(again.status, 400);
  assert.equal(state.events.filter(event => event === 'update').length, 1);
  assert.equal(state.audit.length, 1);
});

test('Time In rejects drafts, unassigned, held, completed and other-driver runs', async () => {
  for (const overrides of [{ draft: true }, { driver: '' }, { status: 'ON_HOLD' }, { status: 'ACCOMPLISHED' }, { driver: 'Someone else' }]) {
    restoreStubs();
    const state = database(record({ timeIn: null, ...overrides }));
    assert.notEqual((await request('post', '/:id/time-in', { body: { remarks: 'Start' } })).status, 200);
    assert.equal(state.events.includes('update'), false);
  }
});

test('manual In Transit, early completion, early Pending and reopening Delivered are rejected', async () => {
  for (const [row, target] of [[{ status: 'SCHEDULED', timeIn: null }, 'In Transit'], [{ status: 'SCHEDULED', timeIn: null }, 'Delivered'], [{ status: 'SCHEDULED', timeIn: null }, 'Pending'], [{ status: 'ACCOMPLISHED' }, 'Rescheduled']] as const) {
    restoreStubs();
    const state = database(record(row), [attachment()]);
    const result = await request('patch', '/:id/status', { role: 'ADMIN', body: { status: target, remarks: 'Update' } });
    assert.equal(result.status, 400);
    assert.equal(state.events.includes('update'), false);
  }
});

test('SC/Admin return pre-start run to Draft, retain assignment and audit; started run cannot revert', async () => {
  for (const role of ['SALES_COORDINATOR', 'ADMIN']) {
    restoreStubs();
    const state = database(record({ status: 'SCHEDULED', timeIn: null }));
    const result = await request('patch', '/:id/status', { role, body: { status: 'Draft', remarks: 'Fix details' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'Draft');
    assert.equal(state.saved().driver, 'Assigned Driver');
    assert.deepEqual(result.body.allowed_statuses, ['Scheduled']);
    assert.equal(state.audit.length, 1);
    assert.equal((await request('get', '/:id')).status, 403);
    assert.equal((await request('get', '/:id/attachments')).status, 403);
    restoreStubs();
    database();
    assert.equal((await request('patch', '/:id/status', { role, body: { status: 'Draft', remarks: 'Revert' } })).status, 400);
  }
});

test('draft assignment blocked; ISO corrections are restricted, audited and cannot stamp a new attempt', async () => {
  let state = database(record({ draft: true, timeIn: null, status: 'SCHEDULED' }));
  assert.equal((await request('put', '/:id', { role: 'LOGISTICS', body: { driver: 'New Driver', remarks: 'Assign' } })).status, 400);
  assert.equal(state.events.includes('update'), false);
  restoreStubs();
  state = database();
  assert.equal((await request('put', '/:id', { body: { time_in: '2026-10-06T09:00:00+08:00', remarks: 'Correct' } })).status, 403);
  assert.equal((await request('put', '/:id', { role: 'LOGISTICS', body: { time_in: '09:00', remarks: 'Correct' } })).status, 400);
  const corrected = await request('put', '/:id', { role: 'LOGISTICS', body: { time_in: '2026-10-06T09:30:00+08:00', remarks: 'Correct capture' } });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.body.time_in, '2026-10-06T01:30:00.000Z');
  assert.equal(state.audit.length, 1);
  restoreStubs();
  database(record({ timeIn: null, status: 'SCHEDULED' }));
  assert.equal((await request('put', '/:id', { role: 'ADMIN', body: { time_in: '2026-10-06T09:00:00+08:00', remarks: 'Start bypass' } })).status, 400);
});

test('rescheduling clears timestamps and preserves them and actor in audit for next attempt', async () => {
  const state = database(record({ timeOut: '2026-10-06T02:00:00.000Z' }));
  const result = await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: 'Rescheduled', remarks: 'Try tomorrow' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.time_in, null);
  assert.equal(result.body.time_out, null);
  const previous = JSON.parse(state.audit[0].previousValue);
  assert.equal(previous.time_in, '2026-10-06T01:00:00.000Z');
  assert.equal(previous.time_out, '2026-10-06T02:00:00.000Z');
  assert.equal(state.audit[0].changedById, 'test-user');
  assert.equal((await request('post', '/:id/time-in', { role: 'LOGISTICS', body: { remarks: 'New attempt' } })).status, 200);
});

test('record scope hides drafts in driver list/detail and related transactions; table omits manual In Transit', () => {
  assert.equal(recordScope({ ...user(), effectiveScreens: ['driver_dashboard'] } as any).draft, false);
  assert.deepEqual(allowedStatuses(record({ timeIn: null, status: 'SCHEDULED' })), ['On-Hold', 'Rescheduled', 'Draft']);
  assert.equal(allowedStatuses(record()).includes('In Transit'), false);
  assert.equal(manilaToday(new Date('2026-10-05T16:01:00.000Z')), '2026-10-06');
});


test('same-status priority changes remain audited without resetting timestamps', async () => {
  const state = database(record({ status: 'ACCOMPLISHED', timeOut: '2026-10-06T02:00:00.000Z' }));
  const result = await request('patch', '/:id/status', { role: 'ADMIN', body: { status: 'Delivered', priority: '3 - High', remarks: 'Adjust priority' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.priority, '3 - High');
  assert.equal(result.body.time_out, '2026-10-06T02:00:00.000Z');
  assert.equal(state.events.includes('photos'), false);
  assert.equal(state.audit.length, 1);
});


test('legacy Scheduled ISO Time In is normalized; invalid legacy clocks cannot complete and can be corrected', async () => {
  let state = database(record({ status: 'SCHEDULED' }), [attachment()]);
  const complete = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Finish existing attempt' } });
  assert.equal(complete.status, 200);
  assert.equal(state.saved().timeIn, '2026-10-06T01:00:00.000Z');
  restoreStubs();
  state = database(record({ status: 'SCHEDULED', timeIn: '09:00' }), [attachment()]);
  assert.equal((await request('patch', '/:id/status', { role: 'ADMIN', body: { status: 'Delivered', remarks: 'Complete' } })).status, 400);
  assert.equal(state.events.includes('update'), false);
  const corrected = await request('put', '/:id', { role: 'LOGISTICS', body: { time_in: '2026-10-06T09:00:00+08:00', remarks: 'Correct legacy clock' } });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.body.status, 'In Transit');
  assert.equal((await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: 'Delivered', remarks: 'Completed' } })).status, 200);
});

test('data sampler rejects manually requested In Transit or Delivered before database work', async () => {
  const companyRead = stub(prisma.company, 'findMany', async () => { throw new Error('Unexpected database read'); });
  for (const status of ['IN_TRANSIT', 'ACCOMPLISHED', 'PENDING', 'Delivered']) {
    const result = await request('post', '/generate', { role: 'ADMIN', router: sampler, body: { module: 'deliveries', fields: { status } } });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /Scheduled/);
  }
  assert.equal(companyRead.mock.callCount(), 0);
});

test('Admin can fill a draft reference with remarks and submit, preserving assignment', async () => {
  const state = database(record({ draft: true, status: 'SCHEDULED', timeIn: null, reference: '' }));
  assert.equal((await request('patch', '/:id/status', { role: 'ADMIN', body: { status: 'Scheduled', remarks: 'Submit' } })).status, 400);
  assert.equal((await request('put', '/:id', { role: 'ADMIN', body: { reference: 'REF' } })).status, 400);
  assert.equal((await request('put', '/:id', { role: 'ADMIN', body: { reference: 'REF', remarks: 'Fill reference' } })).status, 200);
  const submit = await request('patch', '/:id/status', { role: 'ADMIN', body: { status: 'Scheduled', remarks: 'Submit' } });
  assert.equal(submit.status, 200);
  assert.equal(state.saved().draft, false);
  assert.equal(state.saved().driver, 'Assigned Driver');
});
