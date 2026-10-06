import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import records from '../src/routes/records';
import { signToken } from '../src/middleware/auth';
import { podStorage } from '../src/services/podStorage';
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
const record = (overrides: Record<string, unknown> = {}) => ({ id: 'delivery-1', category: 'DELIVERY', status: 'SCHEDULED', priority: '2 - Moderate', driver: 'Assigned Driver', company: { name: 'Test Company' }, accountManager: 'Test AM', deletedAt: null, ...overrides });

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
async function request(method: string, path: string, options: { role?: string; body?: unknown; file?: unknown; attachmentId?: string } = {}) {
  const actor = user(options.role);
  stub(prisma.user, 'findUnique', async () => actor as any);
  const route = (records as any).stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req: any = { method: method.toUpperCase(), headers: {}, cookies: { mg_session: signToken(actor as any) },
    params: { id: 'delivery-1', attachmentId: options.attachmentId ?? 'photo-1' }, body: options.body ?? {}, file: options.file };
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
  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => {
    const scopedDriver = where.AND?.[0]?.driver;
    return scopedDriver && scopedDriver !== saved.driver ? null : saved as any;
  });
  const tx = {
    $queryRaw: async () => { events.push('lock'); return [{ id: saved.id }]; },
    deliveryRecord: {
      findUnique: async () => saved,
      updateMany: async ({ data }: any) => { events.push('update'); saved = { ...saved, ...data }; return { count: 1 }; },
      findUniqueOrThrow: async () => saved,
    },
    podAttachment: {
      findMany: async ({ where }: any) => { events.push('photos'); return files.filter(file => file.id !== where.id?.not); },
      findFirst: async () => files[0] ?? null,
      delete: async () => { events.push('delete'); return files.shift(); },
    },
    auditLog: { create: async () => { events.push('audit'); return {}; } },
    remarkLog: { create: async () => { events.push('remark'); return {}; } },
  };
  stub(prisma, '$transaction', async (fn: any) => fn(tx));
  stub(prisma.notificationLog, 'create', async () => ({} as any));
  stub(prisma.user, 'findMany', async () => []);
  stub(podStorage, 'read', async () => photo);
  return { events, saved: () => saved };
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
    assert.equal(state.saved().status, 'SCHEDULED');
  }
});

test('a persisted photo enables delivery completion after taking the record lock', async () => {
  const state = database(record(), [attachment()]);
  const result = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Completed' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'Delivered');
  assert.deepEqual(state.events, ['lock', 'photos', 'update', 'audit', 'remark']);
});

test('pending statuses and non-delivery completion do not require a photo', async () => {
  for (const [category, status] of [['DELIVERY', 'Pending'], ['PROCUREMENT_PICKUP', 'Delivered'], ['ACCOUNTING_COLLECTION', 'Delivered'], ['RMA', 'Delivered']]) {
    restoreStubs();
    const state = database(record({ category }));
    const result = await request('patch', '/:id/status', { role: 'ADMIN', body: { status, remarks: 'Updated' } });
    assert.equal(result.status, 200, category);
    assert.equal(state.events.includes('photos'), false);
  }
});

test('delivery creation cannot bypass proof by specifying Delivered or a filename', async () => {
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
  assert.deepEqual(state.events, ['lock', 'photos', 'delete']);
});
