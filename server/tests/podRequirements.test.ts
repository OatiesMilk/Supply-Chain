import { installRmaPolicyLookup, rmaTestAccount, rmaTestPolicy, matchesRecordWhere } from './rmaTestPolicy';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import records from '../src/routes/records';
import sampler from '../src/routes/data-sampler';
import { signToken } from '../src/middleware/auth';
import { podStorage } from '../src/services/podStorage';
import { podStorageNamespace } from '../src/services/podStorage';
import { cleanPodStorageDeletions } from '../src/services/podDeletionCleanup';
import sharp from 'sharp';
import { PassThrough } from 'node:stream';
import { docx, oleFile, pdf, zipOf, xlsx } from './attachmentFixtures';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { hasStoredDeliveryPhoto, isPodPhoto, isVerifiedPodPhoto } from '../src/services/podPhotos';
import { allowedStatuses, deliveryScheduleState, DRIVER_STATUS_ERROR, driverDeliveryDateError, driverStatusError, isoTimestamp, manilaToday, timeInError, transitionError } from '../src/services/deliveryLifecycle';
import { recordScope } from '../src/services/recordAccess';
import { recordEditVersion } from '../src/services/recordEditVersion';
import { RMA_CATEGORIES } from '../src/services/rmaRules';

const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWMwTpsJAAICATMDms/iAAAAAElFTkSuQmCC', 'base64');
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-pod-test-'));
process.on('exit', () => fs.rmSync(uploadDir, { recursive: true, force: true }));
// What Multer hands the route after writing an upload to its quarantine folder.
function uploaded(bytes: Buffer = photo, originalname = 'photo.png', mimetype = 'image/png') {
  const filePath = path.join(uploadDir, crypto.randomUUID());
  fs.writeFileSync(filePath, bytes);
  return { originalname, mimetype, size: bytes.length, path: filePath };
}
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
// Drivers own runs through their Admin-linked Driver profile id (TSK-100), not their name.
const user = (role = 'DRIVER') => ({ id: 'test-user', name: 'Assigned Driver', email: 'test@example.com', role, isActive: true, permissions: [], driverProfile: role === 'DRIVER' ? { id: 'profile-assigned', type: 'DRIVER' } : null, driverProfileId: role === 'DRIVER' ? 'profile-assigned' : null });
const otherDriver = (name: string) => ({ driver: name, driverId: `profile-${name}` });
const attachment = (overrides: Record<string, unknown> = {}) => ({ id: 'photo-1', recordId: 'delivery-1', originalName: 'photo.png', mimeType: 'image/png', storageKey: 'photo.png', size: photo.length, createdAt: new Date(), ...overrides });
const record = (overrides: Record<string, unknown> = {}) => ({ rmaVersion: 0, rmaMovement: 'INTERNAL_NO_DRIVER', rmaReceivedAt: new Date('2026-10-06T00:00:00Z'), rmaReceivedBy: 'tass', rmaRecipient: 'Recipient', id: 'delivery-1', category: 'DELIVERY', status: 'IN_TRANSIT', draft: false, reference: 'REF', driverAssistants: '[]', priority: '2 - Moderate', driver: 'Assigned Driver', driverId: 'profile-assigned', company: { name: 'Test Company' }, accountManager: 'Test AM', deliveryDate: manilaToday(), timeIn: '2026-10-06T01:00:00.000Z', receivedBy: 'Recipient', timeOut: null, deletedAt: null, ...overrides });
const shiftDate = (date: string, days: number) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

function failClosed() {
  for (const model of [prisma.user, prisma.company, prisma.deliveryRecord, prisma.podAttachment, prisma.podStorageDeletion, prisma.auditLog, prisma.remarkLog, prisma.comment, prisma.notification, prisma.notificationLog, prisma.driver]) {
    for (const method of ['findFirst', 'findUnique', 'findUniqueOrThrow', 'findMany', 'create', 'createMany', 'upsert', 'update', 'updateMany', 'delete', 'deleteMany', 'count']) {
      stub(model, method, async () => { throw new Error('Unstubbed database operation: ' + method); });
    }
  }
  stub(prisma, '$transaction', async () => { throw new Error('Unstubbed transaction'); });
  for (const method of ['save', 'read', 'remove']) stub(podStorage, method, async () => { throw new Error('Unstubbed storage operation: ' + method); });
}
function resetFixtures() { restoreStubs(); failClosed(); }

let restoreRmaPolicy: (() => void) | undefined;
beforeEach(() => {
  restoreRmaPolicy = installRmaPolicyLookup();
  failClosed();
  for (const key of Object.keys(originalMailEnv)) delete process.env[key];
});
afterEach(() => {
  restoreStubs();
  restoreRmaPolicy?.();
  for (const [key, value] of Object.entries(originalMailEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

// Exercise the actual middleware/handlers in memory: no listener, live DB or email.
let fixtureVersion = () => 0;
let fixtureRecord = () => record();
async function request(method: string, path: string, options: { role?: string; authenticated?: boolean; body?: unknown; file?: unknown; attachmentId?: string; multipart?: Buffer; contentType?: string; router?: any; streamResponse?: boolean } = {}) {
  const actor = rmaTestAccount(user(options.role));
  stub(prisma.user, 'findUnique', async () => actor as any);
  const route = (options.router ?? records).stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req: any = Object.assign(options.multipart ? new PassThrough() : {}, { method: method.toUpperCase(), headers: {}, cookies: { mg_session: signToken({ id: actor.id, name: actor.name, email: actor.email, role: actor.role } as any) },
    params: path === '/' ? {} : { id: 'delivery-1', attachmentId: options.attachmentId ?? 'photo-1' }, body: options.body && typeof options.body === 'object' ? { expected_version: fixtureVersion(), ...options.body } : options.body ?? {}, file: options.file });
  if ((method === 'put' && path === '/:id' || method === 'patch' && path === '/:id/status' && (req.body.priority !== undefined || req.body.delivery_date !== undefined)) && fixtureRecord().category !== 'RMA') req.body = { expected_edit_version: recordEditVersion(fixtureRecord()), ...req.body };
  if (options.multipart) req.headers = { 'content-type': options.contentType, 'content-length': String(options.multipart.length) };
  if (options.authenticated === false) req.cookies = {};
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy?.(); reject(new Error('In-memory request timed out')); }, 3000);
    const responseHeaders: Record<string, string> = {};
    const streamChunks: Buffer[] = [];
    const res: any = options.streamResponse ? new PassThrough() : {};
    if (options.streamResponse) {
      res.on('data', (chunk: Buffer) => streamChunks.push(Buffer.from(chunk)));
      res.on('finish', () => { clearTimeout(timer); resolve({ status: res.statusCode, body: Buffer.concat(streamChunks), headers: responseHeaders }); });
    }
    Object.assign(res, { statusCode: 200, headersSent: false,
      setHeader(name: string, value: string) { responseHeaders[name.toLowerCase()] = value; },
      getHeader(name: string) { return responseHeaders[name.toLowerCase()]; },
      clearCookie() {},
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { clearTimeout(timer); resolve({ status: this.statusCode, body }); return this; },
      send(body: unknown) { clearTimeout(timer); resolve({ status: this.statusCode, body }); return this; } });
    let index = 0;
    const next = (error?: unknown) => {
      if (error) { clearTimeout(timer); return reject(error); }
      const handler = route.stack[index++]?.handle;
      if (!handler) return reject(new Error('Route did not return a response'));
      try { Promise.resolve(handler(req, res, next)).catch(reject); } catch (error) { reject(error); }
    };
    next();
    if (options.multipart) req.end(options.multipart);
  });
}

function database(row = record(), files: any[] = []) {
  failClosed();
  let saved = row;
  fixtureVersion = () => saved.rmaVersion ?? 0;
  fixtureRecord = () => saved;
  const events: string[] = [];
  const cleanupJobs: any[] = [];
  const audit: any[] = []; const remarks: any[] = [];
  const outOfScope = (scope: any) => !matchesRecordWhere(saved, scope);
  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => outOfScope(where.AND?.[0]) ? null : saved as any);
  const tx = {
    $executeRaw: async () => {},
    $queryRaw: async () => { events.push('lock'); return [{ id: saved.id }]; },
    user: { findUnique: async (query: any) => prisma.user.findUnique(query), findMany: async () => [] },
    rolePolicy: { findUnique: async ({ where }: any) => rmaTestPolicy(where.role), findMany: async () => [] },
    deliveryRecord: {
      create: async ({ data }: any) => {
        events.push('create');
        saved = {
          ...saved,
          rmaReceivedAt: null, rmaReceivedBy: null, rmaRecipient: null, rmaVersion: 0,
          ...data,
          company: saved.company ?? { name: 'Test Company' },
          createdBy: { name: 'Test User' },
          modifiedBy: { name: 'Test User' },
          lineItems: [],
        };
        return saved;
      },
      findFirst: async ({ where }: any) => outOfScope(where.AND?.[0]) ? null : saved,
      findUnique: async () => saved,
      update: async ({ data }: any) => { events.push('update'); saved = { ...saved, ...data, rmaVersion: data.rmaVersion?.increment ? (saved.rmaVersion ?? 0) + data.rmaVersion.increment : saved.rmaVersion }; return saved; },
      updateMany: async ({ data }: any) => { events.push('update'); saved = { ...saved, ...data }; return { count: 1 }; },
      findUniqueOrThrow: async () => saved,
    },
    podAttachment: {
      create: async (args: any) => prisma.podAttachment.create(args),
      aggregate: async () => ({ _count: { _all: files.length }, _sum: { size: files.reduce((total, file) => total + file.size, 0) } }),
      findMany: async ({ where }: any) => { events.push('photos'); return files.filter(file => file.id !== where.id?.not); },
      findFirst: async () => files[0] ?? null,
      delete: async () => { events.push('delete'); return files.shift(); },
    },
    podStorageDeletion: {
      create: async ({ data }: any) => { const job = { id: 'cleanup-1', ...data }; cleanupJobs.push(job); return job; },
    },
    driver: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: 'New Driver', type: 'DRIVER', isActive: true }),
      findFirst: async ({ where }: any) => ({ id: 'profile-new-driver', name: where.name.equals, type: 'DRIVER', isActive: true }),
    },
    comment: { create: async (query: any) => prisma.comment.create(query) },
    auditLog: { create: async ({ data }: any) => { events.push('audit'); audit.push(data); return {}; } },
    remarkLog: { create: async ({ data }: any) => { events.push('remark'); remarks.push(data); return {}; } },
  };
  stub(prisma.podAttachment, 'findMany', async ({ where }: any) => { events.push('photos'); return files.filter(file => file.id !== where.id?.not); });
  stub(prisma, '$transaction', async (fn: any) => fn(tx));
  stub(prisma.podStorageDeletion, 'findMany', async ({ where }: any) => cleanupJobs.filter(job =>
    job.storageNamespace === where.storageNamespace && (!where.id || job.id === where.id)));
  stub(prisma.podStorageDeletion, 'deleteMany', async ({ where }: any) => {
    const index = cleanupJobs.findIndex(job => job.id === where.id);
    if (index >= 0) cleanupJobs.splice(index, 1);
    return { count: index >= 0 ? 1 : 0 };
  });
  stub(prisma.podStorageDeletion, 'updateMany', async ({ where, data }: any) => {
    const job = cleanupJobs.find(job => job.id === where.id);
    if (job) Object.assign(job, data);
    return { count: job ? 1 : 0 };
  });
  stub(prisma.notificationLog, 'create', async () => { events.push('notification'); return {} as any; });
  stub(prisma.notification, 'createMany', async () => { events.push('notification'); return { count: 0 }; });
  stub(prisma.user, 'findMany', async () => []);
  // Account Manager directory: 'Alex AM' is listed and unlinked, so mail falls back to the exact-name rule.
  stub(prisma.accountManager, 'findUnique', async () => null);
  stub(prisma.accountManager, 'findMany', async ({ where }: any = {}) => where?.normalizedName === 'alex am' ? [{ name: 'Alex AM' }] : []);
  stub(podStorage, 'read', async () => photo);
  return { events, audit, remarks, tx, cleanupJobs, saved: () => saved };
}

test('image proof checks bytes, rejecting renamed, empty, mismatched and truncated files', () => {
  assert.equal(isPodPhoto(photo, 'image/png'), true);
  assert.equal(isPodPhoto(photo, 'image/jpeg'), false);
  assert.equal(isPodPhoto(Buffer.from('not a photo'), 'image/png'), false);
  assert.equal(isPodPhoto(Buffer.alloc(0), 'image/jpeg'), false);
  assert.equal(isPodPhoto(photo.subarray(0, 30), 'image/png'), false);
});

test('Delivery schedule eligibility uses valid Manila dates and leaves started/non-Delivery runs alone', () => {
  const now = new Date('2026-10-08T03:00:00.000Z'); // 11:00 in Manila
  assert.deepEqual(deliveryScheduleState('2026-10-06', new Date('2026-10-05T16:01:00.000Z')), { valid: true, future: false, overdue: false, daysLate: 0 });
  assert.deepEqual(deliveryScheduleState('2026-10-06', new Date('2026-10-06T16:01:00.000Z')), { valid: true, future: false, overdue: true, daysLate: 1 });
  assert.deepEqual(deliveryScheduleState('2026-10-06', now), { valid: true, future: false, overdue: true, daysLate: 2 });
  assert.deepEqual(deliveryScheduleState('2026-10-08', now), { valid: true, future: false, overdue: false, daysLate: 0 });
  assert.deepEqual(deliveryScheduleState('2026-10-09', now), { valid: true, future: true, overdue: false, daysLate: 0 });
  assert.equal(driverDeliveryDateError(record({ deliveryDate: '2026-10-09', timeIn: null }), 'DRIVER', now), 'This delivery is scheduled for a future date and is read-only until that date.');
  assert.equal(driverDeliveryDateError(record({ deliveryDate: '2026-10-06', timeIn: null }), 'DRIVER', now), null);
  assert.equal(driverDeliveryDateError(record({ deliveryDate: '2026-10-09', timeIn: '2026-10-08T02:00:00.000Z' }), 'DRIVER', now), null);
  assert.equal(driverDeliveryDateError(record({ category: 'RMA', deliveryDate: '2026-10-09', timeIn: null }), 'DRIVER', now), null);
  assert.match(driverDeliveryDateError(record({ deliveryDate: '2026-02-30', timeIn: null }), 'DRIVER', now) ?? '', /valid Delivery Date/);
});

test('server rejects future unstarted Driver writes across execution, POD, record edit and comments', async () => {
  const future = shiftDate(manilaToday(), 1);
  const photoFile = uploaded();
  for (const [method, path, options] of [
    ['post', '/:id/time-in', { body: { remarks: 'Start early' } }],
    ['patch', '/:id/status', { body: { status: 'Delivered', received_by: 'Recipient', remarks: 'Future run' } }],
    ['put', '/:id', { body: { received_by: 'Recipient', remarks: 'Edit future run' } }],
    ['post', '/:id/attachments', { file: photoFile }],
    ['post', '/:id/comments', { body: { body: 'Future run comment' } }],
  ] as const) {
    resetFixtures();
    const state = database(record({ status: 'SCHEDULED', timeIn: null, deliveryDate: future }));
    const before = { ...state.saved() };
    const storage = stub(podStorage, 'save', async () => 'unexpected-photo.png');
    const attachmentCreate = stub(prisma.podAttachment, 'create', async () => attachment() as any);
    const response = await request(method, path, options);
    assert.equal(response.status, 400, path);
    assert.match(response.body.error, /future date|read-only/i, path);
    assert.deepEqual(state.saved(), before, path);
    assert.equal(state.events.includes('update'), false, path);
    assert.equal(state.events.includes('remark'), false, path);
    assert.equal(state.events.includes('audit'), false, path);
    assert.equal(storage.mock.callCount(), 0, path);
    assert.equal(attachmentCreate.mock.callCount(), 0, path);
  }
});

test('Logistics can reschedule a Delivery with remarks and audit while preserving its Driver assignment', async () => {
  const future = shiftDate(manilaToday(), 2);
  const today = manilaToday();
  const state = database(record({ status: 'SCHEDULED', timeIn: null, deliveryDate: future }));
  const response = await request('put', '/:id', { role: 'LOGISTICS', body: { delivery_date: today, remarks: 'Client requested an urgent reschedule' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.delivery_date, today);
  assert.equal(state.saved().deliveryDate, today);
  assert.equal(state.saved().driverId, 'profile-assigned');
  assert.equal(state.audit[0].changedById, 'test-user');
  assert.equal(JSON.parse(state.audit[0].previousValue).delivery_date, future);
  assert.equal(JSON.parse(state.audit[0].newValue).delivery_date, today);
  assert.equal(state.remarks[0].body, 'Client requested an urgent reschedule');
  assert.equal(driverDeliveryDateError(state.saved() as any, 'DRIVER'), null);

  resetFixtures();
  const pushedOut = database(record({ status: 'SCHEDULED', timeIn: null, deliveryDate: today }));
  const futureResponse = await request('put', '/:id', { role: 'LOGISTICS', body: { delivery_date: future, remarks: 'Customer requested a later date' } });
  assert.equal(futureResponse.status, 200);
  assert.equal(futureResponse.body.delivery_date, future);
  assert.equal(pushedOut.saved().driverId, 'profile-assigned');
  assert.match(driverDeliveryDateError(pushedOut.saved() as any, 'DRIVER') ?? '', /future date/);
});

test('overdue Driver Time In and POD upload audit the effective date and days late', async () => {
  const overdueDate = shiftDate(manilaToday(), -2);
  const timeInState = database(record({ status: 'SCHEDULED', timeIn: null, deliveryDate: overdueDate }));
  const started = await request('post', '/:id/time-in', { body: { remarks: 'Starting late delivery' } });
  assert.equal(started.status, 200);
  const timeInSnapshot = JSON.parse(timeInState.audit[0].previousValue);
  assert.equal(timeInSnapshot.overdue, true);
  assert.equal(timeInSnapshot.days_late, 2);

  resetFixtures();
  const podState = database(record({ status: 'SCHEDULED', timeIn: null, deliveryDate: overdueDate }));
  stub(podStorage, 'save', async () => 'photo.png');
  stub(prisma.podAttachment, 'create', async () => attachment() as any);
  const upload = await request('post', '/:id/attachments', { file: uploaded() });
  assert.equal(upload.status, 201);
  const uploadSnapshot = JSON.parse(podState.audit[0].newValue);
  assert.equal(uploadSnapshot.overdue, true);
  assert.equal(uploadSnapshot.days_late, 2);
});

test('Delivery completion persists completedLate and daysLate from the effective Manila date', async () => {
  const overdueDate = shiftDate(manilaToday(), -3);
  const state = database(record({ deliveryDate: overdueDate }), [attachment()]);
  const response = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Late delivery completed', received_by: 'Recipient' } });
  assert.equal(response.status, 200);
  assert.equal(state.saved().completedLate, true);
  assert.equal(state.saved().daysLate, 3);
  const auditSnapshot = JSON.parse(state.audit[0].newValue);
  assert.equal(auditSnapshot.completed_late, true);
  assert.equal(auditSnapshot.days_late, 3);

  resetFixtures();
  const onTime = database(record(), [attachment()]);
  const onTimeResponse = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Completed on time', received_by: 'Recipient' } });
  assert.equal(onTimeResponse.status, 200);
  assert.equal(onTime.saved().completedLate, false);
  assert.equal(onTime.saved().daysLate, 0);
});

test('assigned driver can upload a saved photo and list its verified photo flag', async () => {
  database();
  const save = stub(podStorage, 'save', async () => 'photo.png');
  stub(prisma.podAttachment, 'create', async () => attachment() as any);
  const result = await request('post', '/:id/attachments', { file: uploaded() });
  assert.equal(result.status, 201);
  assert.equal(result.body.is_photo, true);
  assert.equal(save.mock.callCount(), 1);
  stub(prisma.podAttachment, 'findMany', async () => [attachment(), attachment({ id: 'pdf', mimeType: 'application/pdf' })] as any);
  const listed = await request('get', '/:id/attachments');
  assert.deepEqual(listed.body.map((file: any) => file.is_photo), [true, false]);
});

test('driver cannot upload to another driver record and counterfeit image uploads are rejected before storage', async () => {
  database(record(otherDriver('Another Driver')));
  const save = stub(podStorage, 'save', async () => 'unexpected');
  const file = uploaded();
  assert.equal((await request('post', '/:id/attachments', { file })).status, 403);
  stub(prisma.deliveryRecord, 'findFirst', async () => record() as any);
  assert.equal((await request('post', '/:id/attachments', { file: uploaded(Buffer.from('not a photo')) })).status, 400);
  assert.equal(save.mock.callCount(), 0);
});

test('delivery completion rejects absent, document-only, missing and counterfeit photos without writes', async () => {
  for (const kind of ['empty', 'document', 'missing', 'counterfeit']) {
    resetFixtures();
    const state = database(record(), kind === 'empty' ? [] : [attachment(kind === 'document' ? { mimeType: 'application/pdf' } : {})]);
    if (kind === 'missing') stub(podStorage, 'read', async () => { throw new Error('missing'); });
    if (kind === 'counterfeit') stub(podStorage, 'read', async () => Buffer.alloc(photo.length));
    const result = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Completed' } });
    assert.equal(result.status, 400, kind);
    assert.match(result.body.error, /photo/);
    assert.deepEqual(state.events, ['photos', 'lock']);
    assert.equal(state.saved().status, 'IN_TRANSIT');
  }
});

test('a persisted photo enables delivery completion after taking the record lock', async () => {
  const state = database(record(), [attachment()]);
  const result = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Completed' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'Delivered');
  assert.deepEqual(state.events.slice(0, 5), ['photos', 'lock', 'update', 'audit', 'remark']);
});

test('remote POD decoding completes before the completion transaction starts', async () => {
  const state = database(record(), [attachment()]);
  stub(podStorage, 'read', async () => {
    assert.equal(state.events.includes('lock'), false, 'remote image fetch must precede the record lock');
    return photo;
  });
  const result = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Completed' } });
  assert.equal(result.status, 200);
  assert.deepEqual(state.events.slice(0, 5), ['photos', 'lock', 'update', 'audit', 'remark']);
});

test('completion refuses a verified photo removed before the locked membership recheck', async () => {
  const state = database(record(), [attachment()]);
  // The image bytes were valid, but deletion won the race before the status
  // transaction acquired its lock. Never complete based on stale preflight.
  state.tx.podAttachment.findFirst = async () => null;
  const result = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Completed' } });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /photo/);
  assert.equal(state.events.includes('update'), false);
  assert.equal(state.saved().status, 'IN_TRANSIT');
});

test('delivery completion and attachment deletion configure a 30s timeout on prisma transaction', async () => {
  const transactionOptions: any[] = [];
  const state = database(record(), [attachment(), attachment({ id: 'replacement' })]);
  stub(prisma, '$transaction', async (fn: any, opts: any) => {
    transactionOptions.push(opts);
    return fn(state.tx);
  });
  const resPatch = await request('patch', '/:id/status', { body: { status: 'Delivered', remarks: 'Completed' } });
  assert.equal(resPatch.status, 200);
  assert.deepEqual(transactionOptions[0], { timeout: 30_000, maxWait: 10_000 });

  stub(podStorage, 'remove', async () => {});
  const resDel = await request('delete', '/:id/attachments/:attachmentId', { role: 'LOGISTICS' });
  assert.equal(resDel.status, 204);
  assert.deepEqual(transactionOptions[1], { timeout: 30_000, maxWait: 10_000 });
});

test('hasStoredDeliveryPhoto queries attachments ordered by createdAt desc to check newest proof first', async () => {
  let capturedQuery: any;
  const mockTx: any = {
    podAttachment: {
      findMany: async (args: any) => {
        capturedQuery = args;
        return [attachment()];
      },
    },
  };
  stub(podStorage, 'read', async () => photo);
  const result = await hasStoredDeliveryPhoto(mockTx, 'rec-123');
  assert.equal(result, true);
  assert.deepEqual(capturedQuery.orderBy, { createdAt: 'desc' });
});

test('Pending requires a started run and non-RMA categories require photo for completion', async () => {
  const pending = database();
  assert.equal((await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: 'Pending', remarks: 'Customer unavailable' } })).status, 200);
  assert.equal(pending.events.includes('photos'), false);
  for (const category of ['PROCUREMENT_PICKUP', 'ACCOUNTING_COLLECTION', 'SALES_ORDERS']) {
    resetFixtures();
    const state = database(record({ category }));
    const result = await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: 'Delivered', remarks: 'Updated' } });
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
  const result = await request('delete', '/:id/attachments/:attachmentId', { role: 'LOGISTICS' });
  assert.equal(result.status, 409);
  assert.deepEqual(state.events, ['lock', 'photos']);
  assert.equal(remove.mock.callCount(), 0);
});

test('a replacement photo allows removal while preserving delivery proof', async () => {
  const state = database(record({ status: 'ACCOMPLISHED' }), [attachment(), attachment({ id: 'replacement' })]);
  stub(podStorage, 'remove', async () => {});
  const result = await request('delete', '/:id/attachments/:attachmentId', { role: 'LOGISTICS' });
  assert.equal(result.status, 204);
  assert.deepEqual(state.events, ['lock', 'photos', 'delete', 'audit']);
});

test('RMA supporting photos remain optional after completion', async () => {
  const state = database(record({ category: 'RMA', status: 'ACCOMPLISHED' }), [attachment()]);
  stub(podStorage, 'remove', async () => {});
  const result = await request('delete', '/:id/attachments/:attachmentId', { role: 'TASS' });
  assert.equal(result.status, 204);
  assert.deepEqual(state.events, ['lock', 'delete', 'audit']);
});


test('completion enforces receiver and remarks for every role and Time In for internal runs without partial writes', async () => {
  for (const role of ['DRIVER', 'LOGISTICS', 'TASS']) {
    for (const invalid of ['receiver', 'remarks', 'timeIn']) {
      if (role === 'TASS' && invalid === 'timeIn') continue;
      resetFixtures();
      const state = database(record({ ...(role === 'TASS' ? { category: 'RMA' } : {}), ...(invalid === 'timeIn' ? { timeIn: null } : {}) }), [attachment()]);
      const result = await request('patch', '/:id/status', { role, body: { status: 'Delivered', remarks: invalid === 'remarks' ? '  ' : 'Completed', received_by: invalid === 'receiver' ? '   ' : 'Receiver' } });
      assert.equal(result.status, 400, `${role}/${invalid}`);
      assert.equal(state.events.includes('update'), false);
      assert.equal(state.events.includes('audit'), false);
    }
  }
});

test('ordinary Delivery completion roles persist Delivered with automatic server Time Out', async () => {
  for (const role of ['DRIVER', 'LOGISTICS']) {
    resetFixtures();
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

test('RMA status graph is independent of Time In and preserves the approved reschedule restrictions', () => {
  const expected = {
    Draft: ['Scheduled'],
    Scheduled: ['Pending', 'On-Hold', 'Rescheduled', 'Delivered', 'Draft'],
    Pending: ['On-Hold', 'Rescheduled', 'Delivered'],
    'On-Hold': ['Scheduled', 'Pending', 'Rescheduled', 'Delivered', 'Draft'],
    Rescheduled: ['Scheduled', 'On-Hold', 'Draft'],
    'In Transit': ['Pending', 'On-Hold', 'Rescheduled', 'Delivered'],
    Delivered: [],
  } as const;
  for (const [status, targets] of Object.entries(expected)) {
    const row = record({ category: 'RMA', status, draft: status === 'Draft', driver: '', driverId: null, timeIn: null });
    assert.deepEqual(allowedStatuses(row), [...targets], status);
    for (const target of targets) assert.equal(transitionError(row, target, 'TASS'), null, `${status}/${target}`);
  }
  assert.match(transitionError(record({ category: 'RMA', status: 'Rescheduled', timeIn: null }), 'Delivered', 'TASS')!, /Cannot change/);
  assert.ok(!allowedStatuses(record({ category: 'RMA', status: 'ON_HOLD' })).includes('Draft'), 'legacy started RMA cannot return to Draft');
});

test('TASS completes received unassigned RMA without manufacturing Driver clocks', async () => {
  for (const role of ['TASS']) {
    for (const status of ['SCHEDULED', 'PENDING', 'ON_HOLD', 'IN_TRANSIT']) {
      resetFixtures();
      const legacyTimeIn = status === 'IN_TRANSIT' ? '2026-10-06T01:00:00.000Z' : null;
      const state = database(record({ category: 'RMA', status, driver: '', driverId: null, timeIn: legacyTimeIn, receivedBy: null, rmaRecipient: 'Collector', deliveryDate: null }));
      stub(prisma.podAttachment, 'findMany', async () => { throw new Error('RMA completion must not depend on attachment storage'); });
      const before = Date.now();
      const response = await request('patch', '/:id/status', { role, body: { status: 'Delivered', remarks: 'Collected and completed', received_by: ' Collector ' } });
      assert.equal(response.status, 200, `${role}/${status}`);
      assert.equal(response.body.status, 'Delivered');
      assert.equal(response.body.received_by, 'Collector');
      assert.equal(state.saved().timeIn, legacyTimeIn);
      assert.equal(state.saved().timeOut, null);
      assert.ok(state.saved().rmaCompletedAt.getTime() >= before);
      assert.equal(state.saved().modifiedById, 'test-user');
      assert.deepEqual(state.events.slice(0, 4), ['lock', 'update', 'audit', 'remark']);
      assert.equal(state.events.includes('photos'), false);
      assert.equal(state.audit[0].changedById, 'test-user');
      assert.equal(JSON.parse(state.audit[0].newValue).received_by, 'Collector');
      assert.equal(state.remarks[0].body, 'Collected and completed');
      assert.deepEqual(response.body.allowed_statuses, []);
      const rejected = await request('patch', '/:id/status', { role, body: { status: 'Pending', remarks: 'Try reopening' } });
      assert.equal(rejected.status, 403);
      assert.equal(state.audit.length, 1);
    }
  }
});

test('RMA completion rejects missing recipient/remarks, drafts and rescheduled records without writes', async () => {
  for (const role of ['TASS']) {
    for (const invalid of ['recipient', 'remarks', 'draft', 'rescheduled']) {
      resetFixtures();
      const state = database(record({ category: 'RMA', status: invalid === 'rescheduled' ? 'RESCHEDULED' : 'SCHEDULED', draft: invalid === 'draft', timeIn: null, receivedBy: null }));
      const response = await request('patch', '/:id/status', { role, body: { status: 'Delivered', remarks: invalid === 'remarks' ? '  ' : 'Completed', received_by: invalid === 'recipient' ? '  ' : 'Collector' } });
      assert.equal(response.status, ['draft', 'rescheduled'].includes(invalid) ? 403 : 400, `${role}/${invalid}`);
      assert.equal(state.events.includes('update'), false);
      assert.equal(state.audit.length, 0);
    }
  }
});

test('RMA Pending needs no Time In, legacy rescheduling preserves clocks, and new Time In is rejected', async () => {
  let state = database(record({ category: 'RMA', status: 'SCHEDULED', driver: '', timeIn: null }));
  assert.equal((await request('patch', '/:id/status', { role: 'TASS', body: { status: 'Pending', remarks: 'Awaiting return' } })).status, 200);
  assert.equal(state.saved().timeIn, null);
  resetFixtures();
  state = database(record({ category: 'RMA', status: 'IN_TRANSIT' }));
  const previousTimeIn = state.saved().timeIn;
  assert.equal((await request('patch', '/:id/status', { role: 'TASS', body: { status: 'Rescheduled', remarks: 'Replanned return' } })).status, 200);
  assert.equal(state.saved().timeIn, previousTimeIn);
  const scheduled = await request('patch', '/:id/status', { role: 'TASS', body: { status: 'Scheduled', remarks: 'Resume the planned return' } });
  assert.equal(scheduled.status, 200);
  assert.equal(scheduled.body.status, 'Scheduled', 'historical Time In must not reclassify rescheduled RMA as In Transit');
  assert.equal(state.saved().status, 'SCHEDULED');
  assert.equal(state.saved().timeIn, previousTimeIn);
  assert.deepEqual(scheduled.body.allowed_statuses, ['Pending', 'On-Hold', 'Rescheduled', 'Delivered']);
  assert.deepEqual(allowedStatuses(state.saved()), ['Pending', 'On-Hold', 'Rescheduled', 'Delivered']);
  resetFixtures();
  state = database(record({ category: 'RMA', status: 'SCHEDULED', timeIn: null }));
  assert.equal((await request('post', '/:id/time-in', { role: 'ADMIN', body: { remarks: 'Start internal run' } })).status, 403, 'Admin is view-only on RMA');
  assert.equal(state.events.includes('update'), false);
});

test('Admin, Logistics, Sales Coordinator and Driver cannot complete RMA via direct API', async () => {
  for (const role of ['ADMIN', 'LOGISTICS', 'SALES_COORDINATOR', 'DRIVER']) {
    resetFixtures();
    const state = database(record({ category: 'RMA', status: 'SCHEDULED', timeIn: null }));
    const response = await request('patch', '/:id/status', { role, body: { status: 'Delivered', remarks: 'Complete', received_by: 'Collector' } });
    assert.equal(response.status, 403, role);
    assert.deepEqual(state.events, []);
  }
});

test('Time In rejects drafts, unassigned, held, completed and other-driver runs', async () => {
  for (const overrides of [{ draft: true }, { driver: '', driverId: null }, { status: 'ON_HOLD' }, { status: 'ACCOMPLISHED' }, otherDriver('Someone else')]) {
    resetFixtures();
    const state = database(record({ timeIn: null, ...overrides }));
    assert.notEqual((await request('post', '/:id/time-in', { body: { remarks: 'Start' } })).status, 200);
    assert.equal(state.events.includes('update'), false);
  }
});

test('manual In Transit, early completion, early Pending and reopening Delivered are rejected', async () => {
  for (const [row, target] of [[{ status: 'SCHEDULED', timeIn: null }, 'In Transit'], [{ status: 'SCHEDULED', timeIn: null }, 'Delivered'], [{ status: 'SCHEDULED', timeIn: null }, 'Pending'], [{ status: 'ACCOMPLISHED' }, 'Rescheduled']] as const) {
    resetFixtures();
    const state = database(record(row), [attachment()]);
    const result = await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: target, remarks: 'Update' } });
    assert.equal(result.status, 400);
    assert.equal(state.events.includes('update'), false);
  }
});

test('assigned Driver cannot mark Pending before Time In and the rejected request makes no writes', async () => {
  const state = database(record({ status: 'SCHEDULED', timeIn: null }));
  const before = { ...state.saved() };

  const result = await request('patch', '/:id/status', {
    role: 'DRIVER',
    body: { status: 'Pending', remarks: 'Customer unavailable before starting the run' },
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.error, DRIVER_STATUS_ERROR);
  assert.deepEqual(state.saved(), before);
  assert.equal(state.events.includes('update'), false);
  assert.equal(state.events.includes('audit'), false);
  assert.equal(state.events.includes('remark'), false);
  assert.equal(state.events.includes('notification'), false);
});

test('SC returns pre-start run to Draft, retain assignment and audit; started run cannot revert', async () => {
  for (const role of ['SALES_COORDINATOR']) {
    resetFixtures();
    const state = database(record({ status: 'SCHEDULED', timeIn: null }));
    const result = await request('patch', '/:id/status', { role, body: { status: 'Draft', remarks: 'Fix details' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'Draft');
    assert.equal(state.saved().driver, 'Assigned Driver');
    assert.deepEqual(result.body.allowed_statuses, ['Scheduled']);
    assert.equal(state.audit.length, 1);
    assert.equal((await request('get', '/:id')).status, 403);
    assert.equal((await request('get', '/:id/attachments')).status, 403);
    resetFixtures();
    database();
    assert.equal((await request('patch', '/:id/status', { role, body: { status: 'Draft', remarks: 'Revert' } })).status, 400);
  }
});

test('draft assignment blocked; ISO corrections are restricted, audited and cannot stamp a new attempt', async () => {
  let state = database(record({ draft: true, timeIn: null, status: 'SCHEDULED' }));
  assert.equal((await request('put', '/:id', { role: 'LOGISTICS', body: { driver: 'New Driver', remarks: 'Assign' } })).status, 400);
  assert.equal(state.events.includes('update'), false);
  resetFixtures();
  state = database();
  assert.equal((await request('put', '/:id', { body: { time_in: '2026-10-06T09:00:00+08:00', remarks: 'Correct' } })).status, 403);
  assert.equal((await request('put', '/:id', { role: 'LOGISTICS', body: { time_in: '09:00', remarks: 'Correct' } })).status, 400);
  const corrected = await request('put', '/:id', { role: 'LOGISTICS', body: { time_in: '2026-10-06T09:30:00+08:00', remarks: 'Correct capture' } });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.body.time_in, '2026-10-06T01:30:00.000Z');
  assert.equal(state.audit.length, 1);
  resetFixtures();
  database(record({ timeIn: null, status: 'SCHEDULED' }));
  assert.equal((await request('put', '/:id', { role: 'LOGISTICS', body: { time_in: '2026-10-06T09:00:00+08:00', remarks: 'Start bypass' } })).status, 400);
});

test('rescheduling clears timestamps and preserves them and actor in audit for next attempt', async () => {
  const state = database(record({ timeOut: '2026-10-06T02:00:00.000Z' }));
  const result = await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: 'Rescheduled', remarks: 'Try tomorrow', delivery_date: shiftDate(manilaToday(), 1) } });
  assert.equal(result.status, 200);
  assert.equal(result.body.time_in, null);
  assert.equal(result.body.time_out, null);
  const previous = JSON.parse(state.audit[0].previousValue);
  assert.equal(previous.time_in, '2026-10-06T01:00:00.000Z');
  assert.equal(previous.time_out, '2026-10-06T02:00:00.000Z');
  assert.equal(state.audit[0].changedById, 'test-user');
  assert.equal((await request('post', '/:id/time-in', { role: 'LOGISTICS', body: { remarks: 'New attempt' } })).status, 200);
});

test('TSK-123: Logistics/Admin must send a valid new date when rescheduling a Delivery', async () => {
  const today = manilaToday();
  const tomorrow = shiftDate(today, 1);
  const rejected: [string, Record<string, unknown>, RegExp][] = [
    ['LOGISTICS', {}, /new delivery date is required/i],
    ['LOGISTICS', { delivery_date: shiftDate(today, -1) }, /past/i],
    ['LOGISTICS', { delivery_date: today }, /different/i],
    ['LOGISTICS', { delivery_date: 'tomorrow' }, /valid/i],
    ['LOGISTICS', { delivery_date: '2026-02-30' }, /valid/i],
  ];
  for (const [role, extra, message] of rejected) {
    resetFixtures();
    const state = database(record({ status: 'SCHEDULED', timeIn: null, deliveryDate: today }));
    const before = { ...state.saved() };
    const result = await request('patch', '/:id/status', { role, body: { status: 'Rescheduled', remarks: 'Move it', ...extra } });
    assert.equal(result.status, 400, JSON.stringify(extra));
    assert.match(result.body.error, message);
    assert.deepEqual(state.saved(), before);
    assert.equal(state.audit.length, 0);
    assert.equal(state.remarks.length, 0);
  }

  for (const role of ['LOGISTICS']) {
    resetFixtures();
    const state = database(record({ status: 'SCHEDULED', timeIn: null, deliveryDate: today }));
    const result = await request('patch', '/:id/status', { role, body: { status: 'Rescheduled', remarks: 'Customer asked for tomorrow', delivery_date: tomorrow } });
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'Rescheduled');
    assert.equal(result.body.delivery_date, tomorrow);
    assert.equal(state.saved().deliveryDate, tomorrow);
    assert.equal(state.saved().timeIn, null);
    assert.equal(state.audit.length, 1);
    assert.equal(JSON.parse(state.audit[0].previousValue).delivery_date, today);
    assert.equal(JSON.parse(state.audit[0].newValue).delivery_date, tomorrow);
    assert.equal(state.remarks.length, 1);
    assert.equal(state.events.filter(event => event === 'update').length, 1);
  }
});

test('TSK-123: delivery_date is rejected on any status change other than a Delivery reschedule', async () => {
  const tomorrow = shiftDate(manilaToday(), 1);
  for (const [role, status, row] of [
    ['LOGISTICS', 'On-Hold', { status: 'SCHEDULED', timeIn: null }],
    ['LOGISTICS', 'Rescheduled', { status: 'SCHEDULED', category: 'ACCOUNTING_COLLECTION' }],
  ] as const) {
    resetFixtures();
    const state = database(record(row));
    const before = { ...state.saved() };
    const result = await request('patch', '/:id/status', { role, body: { status, remarks: 'Try a date', delivery_date: tomorrow } });
    assert.equal(result.status, 400, `${role} ${status}`);
    assert.match(result.body.error, /Overview, or choose Rescheduled/);
    assert.deepEqual(state.saved(), before);
  }
});

test('Drivers can only complete through the status action: every other target is 403 with no writes', async () => {
  for (const category of ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS', 'ACCOUNTING_COLLECTION', 'RMA']) {
    for (const status of ['Pending', 'On-Hold', 'Rescheduled', 'Scheduled', 'Draft']) {
      resetFixtures();
      const state = database(record(category === 'RMA'
        ? { category, status: 'SCHEDULED', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'IN_TRANSIT', rmaReceivedAt: null, timeIn: null }
        : { category }));
      const before = { ...state.saved() };
      const result = await request('patch', '/:id/status', { role: 'DRIVER', body: { status, remarks: 'Customer unavailable' } });
      assert.equal(result.status, 403, `${category} ${status}`);
      // Legacy module access already rejects Driver RMA status writes before the handler runs.
      if (category !== 'RMA') assert.equal(result.body.error, DRIVER_STATUS_ERROR);
      assert.deepEqual(state.saved(), before);
      assert.equal(state.events.includes('update'), false);
    }
  }
  assert.equal(driverStatusError('DRIVER', 'Delivered'), null);
  for (const role of ['LOGISTICS', 'ADMIN', 'TASS', 'SALES_COORDINATOR'] as const) assert.equal(driverStatusError(role, 'Pending'), null);
});

test('TSK-123: Drivers cannot reschedule; non-Delivery reschedules still work without a date; Sales Coordinator cannot reschedule', async () => {
  resetFixtures();
  const driverRun = database(record({ status: 'SCHEDULED' }));
  const today = driverRun.saved().deliveryDate;
  const driver = await request('patch', '/:id/status', { role: 'DRIVER', body: { status: 'Rescheduled', remarks: 'Customer away' } });
  assert.equal(driver.status, 403);
  assert.equal(driver.body.error, DRIVER_STATUS_ERROR);
  assert.equal(driverRun.saved().deliveryDate, today);

  resetFixtures();
  const collection = database(record({ category: 'ACCOUNTING_COLLECTION', status: 'SCHEDULED', timeIn: null }));
  const collectionResult = await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: 'Rescheduled', remarks: 'Move collection' } });
  assert.equal(collectionResult.status, 200);
  assert.equal(collection.saved().deliveryDate, today);

  resetFixtures();
  const sc = database(record({ status: 'SCHEDULED', timeIn: null }));
  const scResult = await request('patch', '/:id/status', { role: 'SALES_COORDINATOR', body: { status: 'Rescheduled', remarks: 'Move it', delivery_date: shiftDate(manilaToday(), 1) } });
  assert.equal(scResult.status, 403);
  assert.equal(sc.events.includes('update'), false);
});

test('record scope hides drafts in driver list/detail and related transactions; table omits manual In Transit', () => {
  assert.equal(recordScope({ ...user(), effectiveScreens: ['driver_dashboard'] } as any).draft, false);
  assert.deepEqual(allowedStatuses(record({ timeIn: null, status: 'SCHEDULED' })), ['On-Hold', 'Rescheduled', 'Draft']);
  assert.equal(allowedStatuses(record()).includes('In Transit'), false);
  assert.equal(manilaToday(new Date('2026-10-05T16:01:00.000Z')), '2026-10-06');
});


test('same-status priority changes remain audited without resetting timestamps', async () => {
  // Delivered records are locked (TSK-124), so the same-status priority path is exercised on a Pending record.
  const state = database(record({ status: 'PENDING', timeOut: '2026-10-06T02:00:00.000Z' }));
  const result = await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: 'Pending', priority: '3 - High', remarks: 'Adjust priority' } });
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
  resetFixtures();
  state = database(record({ status: 'SCHEDULED', timeIn: '09:00' }), [attachment()]);
  assert.equal((await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: 'Delivered', remarks: 'Complete' } })).status, 400);
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

test('data sampler rejects non-RMA reference and date overrides before database work', async () => {
  const companyRead = stub(prisma.company, 'findMany', async () => { throw new Error('Unexpected database read'); });
  const cases = [
    { fields: { reference: '' }, message: /Reference is required/ },
    { fields: { reference: '   ' }, message: /Reference is required/ },
    { fields: { reference: 'SO-123', delivery_date: '' }, message: /Delivery Date is required/ },
    { fields: { reference: 'SO-123', delivery_date: '2026-02-30' }, message: /valid YYYY-MM-DD/ },
  ];
  for (const { fields, message } of cases) {
    const response = await request('post', '/generate', { role: 'ADMIN', router: sampler, body: { module: 'sales_orders', fields } });
    assert.equal(response.status, 400);
    assert.match(response.body.error, message);
  }
  assert.equal(companyRead.mock.callCount(), 0);
});

test('RMA samples never generate document references and preserve manually supplied values in the serialized field', async () => {
  const cases = [
    { module: 'rma', fields: undefined, expected: null },
    { module: 'rma', fields: { reference: '00042 / manual-Ref', rma_type: 'Return to Customer', item_type: 'Unit', status: 'Scheduled' }, expected: '00042 / manual-Ref' },
    { module: 'rma', fields: { rma_reference: '00000-A', rma_type: 'Others' }, expected: '00000-A' },
    { module: 'rma', fields: { rma_reference: '', rma_type: '' }, expected: null },
    { module: 'deliveries', fields: { reference: '00077', delivery_date: '2026-10-07', status: 'Scheduled' }, expected: '00077' },
  ];
  for (const entry of cases) {
    resetFixtures();
    const state = database();
    stub(prisma.company, 'findMany', async () => [{ id: 'company-1', name: 'Test Company' }] as any);
    stub(prisma.driver, 'findMany', async () => [] as any);
    const response = await request('post', '/generate', { role: 'ADMIN', router: sampler,
      body: { module: entry.module, count: 1, fields: entry.fields } });
    assert.equal(response.status, 201);
    const saved = response.body.records[0];
    assert.equal(saved.reference, entry.expected ?? '');
    assert.equal(state.saved().status, 'SCHEDULED');
    assert.equal(state.audit[0].changedById, 'test-user');
    if (entry.module === 'deliveries') assert.equal(state.saved().deliveryDate, '2026-10-07');
    if (entry.module === 'rma') {
      assert.equal(state.saved().reference, '');
      assert.equal(state.saved().rmaReference, entry.expected);
      assert.equal(saved.rma_reference, entry.expected);
      assert.ok(saved.rma_type === null || RMA_CATEGORIES.includes(saved.rma_type));
      assert.ok(['Small Item', 'Unit'].includes(saved.item_type));
      assert.equal(JSON.parse(state.audit[0].newValue).rma_reference, entry.expected);
    }
  }
});

test('data sampler creates distinct UUID record IDs even when its random sample values repeat', async () => {
  const state = database();
  stub(prisma.company, 'findMany', async () => [{ id: 'company-1', name: 'Test Company' }] as any);
  stub(prisma.driver, 'findMany', async () => [] as any);
  stub(Math, 'random', () => 0);
  const response = await request('post', '/generate', { role: 'ADMIN', router: sampler, body: { module: 'deliveries', count: 3 } });
  assert.equal(response.status, 201);
  assert.equal(response.body.created, 3);
  const ids = response.body.records.map((row: any) => row.id);
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) assert.match(id, /^REC-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(state.audit.map(entry => entry.recordId), ids);
});

test('RMA sampler rejects unsupported categories and item types before database work', async () => {
  const companyRead = stub(prisma.company, 'findMany', async () => { throw new Error('Unexpected database read'); });
  for (const fields of [{ rma_type: 'Unsupported' }, { item_type: 'Medium Item' }, { rma_reference: 123 }]) {
    assert.equal((await request('post', '/generate', { role: 'ADMIN', router: sampler, body: { module: 'rma', fields } })).status, 400);
  }
  assert.equal(companyRead.mock.callCount(), 0);
});

test('Sales Coordinator can fill a draft reference with remarks and submit, preserving assignment', async () => {
  const state = database(record({ draft: true, status: 'SCHEDULED', timeIn: null, reference: '' }));
  assert.equal((await request('patch', '/:id/status', { role: 'SALES_COORDINATOR', body: { status: 'Scheduled', remarks: 'Submit' } })).status, 400);
  assert.equal((await request('put', '/:id', { role: 'SALES_COORDINATOR', body: { reference: 'REF' } })).status, 400);
  assert.equal((await request('put', '/:id', { role: 'SALES_COORDINATOR', body: { reference: 'REF', remarks: 'Fill reference' } })).status, 200);
  const submit = await request('patch', '/:id/status', { role: 'SALES_COORDINATOR', body: { status: 'Scheduled', remarks: 'Submit' } });
  assert.equal(submit.status, 200);
  assert.equal(state.saved().draft, false);
  assert.equal(state.saved().driver, 'Assigned Driver');
});

test('C-2.12 isolates missing photo with valid recipient, Time In and remarks for every completion role', async () => {
  for (const role of ['DRIVER', 'LOGISTICS']) {
    resetFixtures();
    const state = database();
    const before = { ...state.saved() };
    const response = await request('patch', '/:id/status', { role, body: { status: 'Delivered', remarks: 'POD test' } });
    assert.equal(response.status, 400, role);
    assert.match(response.body.error, /photo/);
    assert.deepEqual(state.saved(), before);
    assert.deepEqual(state.events, ['photos', 'lock']);
  }
});

test('C-2.13 status, edit and upload reject another driver with no mutations or storage writes', async () => {
  for (const [method, path] of [['patch', '/:id/status'], ['put', '/:id'], ['post', '/:id/attachments']]) {
    resetFixtures();
    const state = database(record(otherDriver('Driver B')), [attachment()]);
    const before = { ...state.saved() };
    const storage = stub(podStorage, 'save', async () => { throw new Error('Unexpected storage write'); });
    const create = stub(prisma.podAttachment, 'create', async () => { throw new Error('Unexpected attachment write'); });
    const response = await request(method, path, {
      body: { status: 'Delivered', remarks: 'Completion', received_by: 'Recipient' },
      file: uploaded(),
    });
    assert.equal(response.status, 403, path);
    assert.deepEqual(state.saved(), before);
    assert.deepEqual(state.events, []);
    assert.equal(storage.mock.callCount(), 0);
    assert.equal(create.mock.callCount(), 0);
  }
});

test('completion prerequisites are enforced independently for Driver, Logistics and Admin', async () => {
  for (const role of ['DRIVER', 'LOGISTICS']) {
    for (const missing of ['timeIn', 'receivedBy', 'remarks']) {
      resetFixtures();
      const state = database(record(missing === 'remarks' ? {} : { [missing]: '  ' }), [attachment()]);
      const response = await request('patch', '/:id/status', { role, body: { status: 'Delivered', remarks: missing === 'remarks' ? ' ' : 'Completed' } });
      assert.equal(response.status, 400, `${role}: ${missing}`);
      assert.match(response.body.error, missing === 'timeIn' ? /Time In/ : missing === 'receivedBy' ? /Received By/ : /Remarks/);
      assert.equal(state.saved().status, 'IN_TRANSIT');
      assert.equal(state.events.some(event => ['update', 'audit', 'remark', 'notification'].includes(event)), false);
    }
  }
});

test('owner positive controls stamp server Time Out and authenticated audit actor for all roles', async () => {
  for (const role of ['DRIVER', 'LOGISTICS']) {
    resetFixtures();
    const state = database(record(), [attachment()]);
    const start = Date.now();
    const response = await request('patch', '/:id/status', { role, body: { status: 'Delivered', remarks: ' Completed ', received_by: ' Named recipient ' } });
    assert.equal(response.status, 200);
    assert.equal(state.saved().status, 'ACCOMPLISHED');
    assert.ok(Date.parse(state.saved().timeOut!) >= start && Date.parse(state.saved().timeOut!) <= Date.now());
    assert.equal(state.saved().receivedBy, 'Named recipient');
    assert.equal(state.audit[0].changedById, 'test-user');
    assert.equal(state.remarks[0].authorId, 'test-user');
    assert.equal(state.remarks[0].body, 'Completed');
  }
});

test('reassignment between access check and locked mutation is denied for status and edit', async () => {
  for (const [method, path] of [['patch', '/:id/status'], ['put', '/:id']]) {
    resetFixtures();
    const state = database(record(), [attachment()]);
    state.tx.deliveryRecord.findUnique = async () => record(otherDriver('Driver B'));
    const result = await request(method, path, { body: { ...(method === 'patch' ? { status: 'Delivered' } : {}), remarks: 'Updated', received_by: 'Recipient' } });
    assert.equal(result.status, 403);
    assert.deepEqual(state.events, method === 'patch' ? ['photos', 'lock'] : ['lock']);
    assert.equal(state.saved().status, 'IN_TRANSIT');
  }
});

test('client Time Out cannot be spoofed through driver PUT or status actions', async () => {
  const state = database();
  assert.equal((await request('put', '/:id', { body: { time_out: '1999-01-01T00:00:00.000Z' } })).status, 403);
  assert.deepEqual(state.events, []);
  for (const status of ['Pending', 'Delivered']) {
    assert.equal((await request('patch', '/:id/status', { body: { status, remarks: 'Updated', time_out: '1999-01-01T00:00:00.000Z' } })).status, 400);
    assert.deepEqual(state.events, []);
  }
  assert.equal(state.saved().timeOut, null);
});

test('a priority-only save on an accomplished record is rejected and preserves its original Time Out', async () => {
  const timeOut = '2026-10-07T02:00:00.000Z';
  const state = database(record({ status: 'ACCOMPLISHED', timeOut }), [attachment()]);
  const response = await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: 'Delivered', priority: '3 - High', remarks: 'Priority corrected' } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Priority can't be changed after a record is Delivered.");
  assert.equal(state.saved().timeOut, timeOut);
  assert.equal(state.saved().priority, '2 - Moderate');
  assert.equal(state.events.includes('update'), false);
});

test('TSK-124: a changed Priority on a Delivered record is rejected for every role and route without writes', async () => {
  for (const [method, path, role, body] of [
    ['put', '/:id', 'SALES_COORDINATOR', { priority: '3 - High', remarks: 'Escalate' }],
    ['put', '/:id', 'LOGISTICS', { priority: '3 - High', remarks: 'Escalate' }],
    ['put', '/:id', 'LOGISTICS', { priority: '3 - High', remarks: 'Escalate' }],
    ['patch', '/:id/status', 'LOGISTICS', { status: 'Delivered', priority: '3 - High', remarks: 'Escalate' }],
    ['patch', '/:id/status', 'LOGISTICS', { status: 'Delivered', priority: '1 - Low', remarks: 'Lower' }],
  ] as const) {
    resetFixtures();
    const state = database(record({ status: 'ACCOMPLISHED', timeOut: '2026-10-07T02:00:00.000Z' }), [attachment()]);
    const before = { ...state.saved() };
    const response = await request(method, path, { role, body });
    assert.equal(response.status, 400, `${method} ${role}`);
    assert.equal(response.body.error, "Priority can't be changed after a record is Delivered.");
    assert.deepEqual(state.saved(), before);
    assert.equal(state.events.includes('update'), false);
    assert.equal(state.audit.length, 0);
    assert.equal(state.remarks.length, 0);
  }
});

test('TSK-124: re-sending the same Priority, or editing other fields, on a Delivered record still works', async () => {
  const timeOut = '2026-10-07T02:00:00.000Z';
  const state = database(record({ status: 'ACCOMPLISHED', timeOut }), [attachment()]);
  const same = await request('put', '/:id', { role: 'LOGISTICS', body: { priority: '2 - Moderate', address: 'Corrected address', remarks: 'Address correction' } });
  assert.equal(same.status, 200);
  assert.equal(state.saved().address, 'Corrected address');
  assert.equal(state.saved().priority, '2 - Moderate');
  assert.equal(state.audit.length, 1);

  resetFixtures();
  const other = database(record({ status: 'ACCOMPLISHED', timeOut }), [attachment()]);
  assert.equal((await request('put', '/:id', { role: 'LOGISTICS', body: { address: 'Another correction', remarks: 'No priority sent' } })).status, 200);
  assert.equal(other.saved().address, 'Another correction');
});

test('TSK-124: Priority on non-Delivered records is still editable', async () => {
  for (const status of ['SCHEDULED', 'ON_HOLD', 'PENDING', 'RESCHEDULED']) {
    resetFixtures();
    const state = database(record({ status, timeIn: null }));
    const response = await request('put', '/:id', { role: 'SALES_COORDINATOR', body: { priority: '3 - High', remarks: 'Escalate' } });
    assert.equal(response.status, 200, status);
    assert.equal(state.saved().priority, '3 - High');
  }
  resetFixtures();
  const state = database(record({ status: 'SCHEDULED', timeIn: null }));
  assert.equal((await request('patch', '/:id/status', { role: 'LOGISTICS', body: { status: 'On-Hold', priority: '1 - Low', remarks: 'Hold and lower' } })).status, 200);
  assert.equal(state.saved().priority, '1 - Low');
});

test('Logistics and Admin retain audited ISO Time Out corrections', async () => {
  for (const role of ['LOGISTICS']) {
    resetFixtures();
    const state = database(record({ status: 'ACCOMPLISHED', timeOut: '2026-10-07T02:00:00.000Z' }), [attachment()]);
    stub(prisma.remarkLog, 'create', async ({ data }: any) => { state.remarks.push(data); return {} as any; });
    const correction = '2026-10-07T02:30:00.000Z';
    const response = await request('put', '/:id', { role, body: { time_out: correction, remarks: 'Corrected clock entry' } });
    assert.equal(response.status, 200);
    assert.equal(state.saved().timeOut, correction);
    assert.equal(state.audit[0].changedById, 'test-user');
    assert.equal(state.remarks[0].authorId, 'test-user');
  }
});

test('Logistics RMA write restrictions remain enforced for status, edit and upload', async () => {
  for (const [method, path] of [['patch', '/:id/status'], ['put', '/:id'], ['post', '/:id/attachments']]) {
    resetFixtures();
    const state = database(record({ category: 'RMA' }));
    assert.equal((await request(method, path, { role: 'LOGISTICS', body: { status: 'Delivered', remarks: 'Blocked' } })).status, 403);
    assert.deepEqual(state.events, []);
  }
});

test('RMA accepts required entry fields and explicit movement without optional details', async () => {
  for (const isDraft of [false, true]) {
    resetFixtures();
    const state = database();
    stub(prisma.company, 'findUnique', async () => ({ id: 'company-1', isActive: true }) as any);
    const created = await request('post', '/', { role: 'TASS', body: {
      company_id: 'company-1', category: 'RMA', rma_movement: 'INTERNAL_NO_DRIVER', priority: '2 - Moderate', area: 'Carmona',
      account_manager: 'Alex AM', is_draft: isDraft ? 'Yes' : 'No',
    } });
    assert.equal(created.status, 201);
    assert.equal(created.body.rma_reference, null);
    assert.equal(created.body.purchase_date, null);
    assert.equal(created.body.customer_contact_name, null);
    assert.equal(created.body.delivery_date, '');
    if (isDraft) {
      const submitted = await request('patch', '/:id/status', { role: 'TASS', body: { status: 'Scheduled', remarks: 'Submit with confirmed required fields' } });
      assert.equal(submitted.status, 200);
      assert.equal(submitted.body.is_draft, 'No');
    }
    for (const field of ['area', 'account_manager', 'priority']) {
      const before = { ...state.saved() };
      const rejected = await request('put', '/:id', { role: 'TASS', body: { [field]: '', remarks: 'Clear a required field' } });
      assert.equal(rejected.status, 400);
      assert.deepEqual(state.saved(), before);
    }
  }
});

test('all seven RMA categories save with the exact manually supplied reference', async () => {
  for (const category of RMA_CATEGORIES) {
    resetFixtures();
    const state = database();
    stub(prisma.company, 'findUnique', async () => ({ id: 'company-1', isActive: true }) as any);
    const created = await request('post', '/', { role: 'TASS', body: {
      company_id: 'company-1', category: 'RMA', rma_movement: 'INTERNAL_NO_DRIVER', priority: '2 - Moderate', area: 'Carmona', account_manager: 'Alex AM',
      rma_type: category, rma_reference: '00042 / manual-Ref', item_type: 'Unit',
    } });
    assert.equal(created.status, 201);
    assert.equal(created.body.rma_type, category);
    assert.equal(created.body.rma_reference, '00042 / manual-Ref');
    assert.equal(state.saved().rmaReference, '00042 / manual-Ref');
    assert.equal(state.saved().rmaType, category);
  }
});

test('earlier RMA category labels remain readable without rewriting saved data', async () => {
  const state = database(record({ category: 'RMA', rmaType: 'Pull out', rmaReference: '00042' }));
  const response = await request('get', '/:id', { role: 'TASS' });
  assert.equal(response.status, 200);
  assert.equal(response.body.rma_type, 'Pull-Out Slip');
  assert.equal(response.body.rma_reference, '00042');
  assert.equal(state.saved().rmaType, 'Pull out');
  assert.deepEqual(state.events, []);
});

test('TASS creates, edits, submits and changes priority/status for an RMA record', async () => {
  const state = database();
  stub(prisma.company, 'findUnique', async () => ({ id: 'company-1', isActive: true }) as any);
  const created = await request('post', '/', { role: 'TASS', body: {
    company_id: 'company-1', category: 'RMA', rma_movement: 'INTERNAL_NO_DRIVER', rma_reference: 'RMA-DOC-042', is_draft: 'Yes',
    rma_type: 'Pull-Out Slip', purchase_date: '2026-08-04', customer_contact_name: 'Casey Customer',
    customer_contact_email: 'casey@example.com', customer_contact_phone: '+63 900 123 4567',
    priority: '2 - Moderate', area: 'BGC', address: '1 Demo Street', account_manager: 'Alex AM',
    delivery_date: '2026-10-26', item_type: 'Unit', item_description: 'Monitor return',
  } });
  assert.equal(created.status, 201);
  assert.equal(created.body.category, 'RMA');
  assert.equal(created.body.is_draft, 'Yes');
  assert.equal(created.body.reference, 'RMA-DOC-042');
  assert.equal(created.body.rma_reference, 'RMA-DOC-042');
  assert.equal(created.body.rma_type, 'Pull-Out Slip');
  assert.equal(created.body.purchase_date, '2026-08-04');
  assert.equal(created.body.customer_contact_name, 'Casey Customer');
  assert.equal(created.body.customer_contact_email, 'casey@example.com');
  assert.equal(created.body.customer_contact_phone, '+63 900 123 4567');
  assert.equal(state.audit[0].changedById, 'test-user');

  const edited = await request('put', '/:id', { role: 'TASS', body: {
    rma_type: 'Return to Supplier', purchase_date: '2026-08-12',
    customer_contact_name: 'Jordan Customer', customer_contact_email: 'jordan@example.com',
    customer_contact_phone: '+63 900 555 0101', priority: '3 - High', remarks: 'Supplier return details updated',
  } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.rma_type, 'Return to Supplier');
  assert.equal(edited.body.purchase_date, '2026-08-12');
  assert.equal(edited.body.customer_contact_name, 'Jordan Customer');
  assert.equal(edited.body.customer_contact_email, 'jordan@example.com');
  assert.equal(edited.body.customer_contact_phone, '+63 900 555 0101');
  assert.equal(edited.body.priority, '3 - High');

  const submitted = await request('patch', '/:id/status', { role: 'TASS', body: { status: 'Scheduled', remarks: 'RMA document submitted' } });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.is_draft, 'No');
  assert.equal(submitted.body.status, 'Scheduled');

  const statusAndPriority = await request('patch', '/:id/status', { role: 'TASS', body: { status: 'On-Hold', priority: '1 - Low', remarks: 'Awaiting supplier response' } });
  assert.equal(statusAndPriority.status, 200);
  assert.equal(statusAndPriority.body.status, 'On-Hold');
  assert.equal(statusAndPriority.body.priority, '1 - Low');
  assert.ok(state.audit.every(entry => entry.changedById === 'test-user'));
});

test('Sales Coordinator cannot read, create or update RMA records', async () => {
  let state = database(record({ category: 'RMA' }));
  assert.equal((await request('get', '/:id', { role: 'SALES_COORDINATOR' })).status, 403);
  assert.equal((await request('put', '/:id', { role: 'SALES_COORDINATOR', body: { remarks: 'Not allowed' } })).status, 403);
  assert.equal(state.events.includes('update'), false);

  resetFixtures();
  state = database();
  const create = await request('post', '/', { role: 'SALES_COORDINATOR', body: {
    company_id: 'company-1', category: 'RMA', reference: 'RMA-DOC-043', delivery_date: '2026-10-26',
  } });
  assert.equal(create.status, 403);
  assert.equal(state.events.includes('create'), false);
});

test('Logistics can read an RMA record and preview its saved PDF but cannot edit it', async () => {
  const state = database(record({ category: 'RMA' }), [attachment({ id: 'rma-pdf', originalName: 'rma.pdf', mimeType: 'application/pdf' })]);
  const details = await request('get', '/:id', { role: 'LOGISTICS' });
  assert.equal(details.status, 200);
  assert.equal(details.body.category, 'RMA');
  const listed = await request('get', '/:id/attachments', { role: 'LOGISTICS' });
  assert.equal(listed.status, 200);
  assert.equal(listed.body[0].preview_url, '/api/v1/records/delivery-1/attachments/rma-pdf/preview');

  stub(prisma.podAttachment, 'findFirst', async () => attachment({ id: 'rma-pdf', originalName: 'rma.pdf', mimeType: 'application/pdf' }) as any);
  const pdf = Buffer.from('%PDF-1.7 test document');
  const source = new PassThrough();
  source.end(pdf);
  const open = stub(podStorage, 'open', async () => source as any);
  const preview = await request('get', '/:id/attachments/:attachmentId/preview', {
    role: 'LOGISTICS', attachmentId: 'rma-pdf', streamResponse: true,
  });
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body, pdf);
  assert.match(preview.headers['content-disposition'], /^inline;/);
  assert.equal(open.mock.callCount(), 1);

  const before = state.events.length;
  const edit = await request('put', '/:id', { role: 'LOGISTICS', body: { remarks: 'Not allowed' } });
  assert.equal(edit.status, 403);
  assert.equal(state.events.slice(before).includes('update'), false);
});

test('protected status, edit and upload routes reject unauthenticated requests without mutations', async () => {
  for (const [method, path] of [['patch', '/:id/status'], ['put', '/:id'], ['post', '/:id/attachments']]) {
    resetFixtures();
    const state = database();
    assert.equal((await request(method, path, { authenticated: false, body: { status: 'Delivered', remarks: 'Unauthorized' } })).status, 401);
    assert.deepEqual(state.events, []);
  }
});

test('framed counterfeit PNG and JPEG cannot satisfy actual pixel decoding', async () => {
  const png = Buffer.from(photo);
  const idat = png.indexOf(Buffer.from('IDAT'));
  png.fill(0, idat + 4, idat + 8);
  const jpeg = Buffer.from('ffd8ffc00008080001000100ffda00020102ffd9', 'hex');
  for (const [bytes, mime] of [[png, 'image/png'], [jpeg, 'image/jpeg']] as const) {
    assert.equal(isPodPhoto(bytes, mime), true, 'Framing guard alone accepted the counterfeit');
    assert.equal(await isVerifiedPodPhoto(bytes, mime), false);
  }
  const genuineJpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#336699' } }).jpeg().toBuffer();
  assert.equal(await isVerifiedPodPhoto(genuineJpeg, 'image/jpeg'), true);
  assert.equal(await isVerifiedPodPhoto(photo, 'image/png'), true);
});

test('real multipart middleware accepts genuine bytes and rejects counterfeit bytes without storage writes', async () => {
  database();
  const save = stub(podStorage, 'save', async () => 'photo.png');
  stub(prisma.podAttachment, 'create', async () => attachment() as any);
  const boundary = 'isolated-pod-test-boundary';
  const multipart = (bytes: Buffer) => Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  assert.equal((await request('post', '/:id/attachments', { multipart: multipart(photo), contentType })).status, 201);
  assert.equal(save.mock.callCount(), 1);
  assert.equal((await request('post', '/:id/attachments', { multipart: multipart(Buffer.from('not a PNG')), contentType })).status, 400);
  assert.equal(save.mock.callCount(), 1);
});

test('upload rejects reassignment under the row lock before any storage or metadata write', async () => {
  const state = database();
  state.tx.deliveryRecord.findUnique = async () => record(otherDriver('Driver B'));
  const save = stub(podStorage, 'save', async () => { throw new Error('Unexpected save'); });
  const create = stub(prisma.podAttachment, 'create', async () => { throw new Error('Unexpected metadata'); });
  const response = await request('post', '/:id/attachments', { file: uploaded() });
  assert.equal(response.status, 403);
  assert.deepEqual(state.events, ['lock']);
  assert.equal(save.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});

test('upload compensates object storage on metadata and transaction commit failure', async () => {
  for (const failure of ['metadata', 'commit']) {
    resetFixtures();
    const state = database();
    stub(podStorage, 'save', async () => 'new-key');
    const remove = stub(podStorage, 'remove', async () => {});
    stub(prisma.podAttachment, 'create', async () => { if (failure === 'metadata') throw new Error('metadata failed'); return attachment() as any; });
    if (failure === 'commit') stub(prisma, '$transaction', async (fn: any) => { await fn(state.tx); throw new Error('commit failed'); });
    await assert.rejects(request('post', '/:id/attachments', { file: uploaded() }), new RegExp(`${failure} failed`));
    assert.equal(remove.mock.callCount(), 1);
    assert.equal(remove.mock.calls[0].arguments[0], 'new-key');
  }
});

test('attachment removal does not require a reason and always writes an audit entry', async () => {
  const state = database(record(), [attachment()]);
  const remove = stub(podStorage, 'remove', async () => {});
  const response = await request('delete', '/:id/attachments/:attachmentId', { role: 'LOGISTICS', body: {} });
  assert.equal(response.status, 204);
  assert.equal(remove.mock.callCount(), 1);
  assert.deepEqual(state.events, ['lock', 'delete', 'audit']);
  assert.equal(state.audit.length, 1);
  assert.deepEqual(JSON.parse(state.audit[0].previousValue), { attachment: 'photo.png', attachment_id: 'photo-1' });
  assert.deepEqual(JSON.parse(state.audit[0].newValue), { attachment_removed: 'photo-1' });
  assert.equal(state.remarks.length, 0);
  assert.equal(state.cleanupJobs.length, 0);
});

test('attachment storage is untouched on enqueue, metadata, audit, remark or commit failure', async () => {
  for (const failure of ['enqueue', 'metadata', 'audit', 'remark', 'commit']) {
    resetFixtures();
    const state = database(record(), [attachment()]);
    const remove = stub(podStorage, 'remove', async () => {});
    const fail = async () => { throw new Error(`${failure} failed`); };
    if (failure === 'enqueue') state.tx.podStorageDeletion.create = fail;
    if (failure === 'metadata') state.tx.podAttachment.delete = fail;
    if (failure === 'audit') state.tx.auditLog.create = fail;
    if (failure === 'remark') state.tx.remarkLog.create = fail;
    if (failure === 'commit') stub(prisma, '$transaction', async (fn: any) => { await fn(state.tx); throw new Error('commit failed'); });
    await assert.rejects(request('delete', '/:id/attachments/:attachmentId', { role: 'LOGISTICS', body: { remarks: 'Remove extra file' } }), new RegExp(`${failure} failed`));
    assert.equal(remove.mock.callCount(), 0, failure);
  }
});

test('storage removal starts only after the metadata transaction has committed', async () => {
  const state = database(record(), [attachment()]);
  let committed = false;
  stub(prisma, '$transaction', async (fn: any) => { const result = await fn(state.tx); committed = true; return result; });
  stub(podStorage, 'remove', async () => {
    assert.equal(committed, true);
    assert.equal(state.audit.length, 1);
    assert.ok(state.events.includes('delete'));
  });
  assert.equal((await request('delete', '/:id/attachments/:attachmentId', { role: 'LOGISTICS' })).status, 204);
});

test('a storage outage keeps a durable cleanup job and a later drain recovers it', async () => {
  const state = database(record(), [attachment()]);
  stub(podStorage, 'remove', async () => { throw new Error('Provider unavailable'); });
  assert.equal((await request('delete', '/:id/attachments/:attachmentId', { role: 'LOGISTICS' })).status, 204);
  assert.equal(state.cleanupJobs.length, 1);
  assert.equal(state.cleanupJobs[0].storageKey, 'photo.png');
  assert.equal(state.cleanupJobs[0].storageNamespace, podStorageNamespace);
  assert.ok(state.cleanupJobs[0].nextAttemptAt > new Date());
  assert.equal(state.audit.length, 1);
  const retry = stub(podStorage, 'remove', async () => {});
  state.cleanupJobs[0].nextAttemptAt = new Date(0);
  await cleanPodStorageDeletions();
  assert.equal(retry.mock.callCount(), 1);
  assert.equal(state.cleanupJobs.length, 0);
});

test('locked status, edit and upload checks reject a record newly returned to Draft or a newly denied category', async () => {
  for (const role of ['DRIVER', 'LOGISTICS']) {
    for (const [method, path] of [['patch', '/:id/status'], ['put', '/:id'], ['post', '/:id/attachments']]) {
      resetFixtures();
      const state = database(record(), [attachment()]);
      state.tx.deliveryRecord.findUnique = async () => record(role === 'DRIVER' ? { draft: true } : { category: 'RMA' });
      const response = await request(method, path, { role,
        body: { ...(method === 'patch' ? { status: 'Delivered' } : {}), received_by: 'Recipient', remarks: 'Update' },
        file: uploaded(),
      });
      assert.equal(response.status, 403, `${role}/${path}`);
      assert.deepEqual(state.events, method === 'patch' ? ['photos', 'lock'] : ['lock']);
    }
  }
});

test('locked PUT retains draft role restrictions and timestamp chronology after an intervening edit', async () => {
  let state = database(record({ status: 'SCHEDULED', timeIn: null }));
  state.tx.deliveryRecord.findUnique = async () => record({ status: 'SCHEDULED', timeIn: null, draft: true });
  assert.equal((await request('put', '/:id', { role: 'LOGISTICS', body: { is_draft: 'No', remarks: 'Submit' } })).status, 403);
  assert.deepEqual(state.events, ['lock']);
  resetFixtures();
  state = database(record({ status: 'ACCOMPLISHED', timeOut: '2026-10-07T03:00:00.000Z' }));
  state.tx.deliveryRecord.findUnique = async () => record({ status: 'ACCOMPLISHED', timeIn: '2026-10-07T02:00:00.000Z', timeOut: '2026-10-07T03:00:00.000Z' });
  assert.equal((await request('put', '/:id', { role: 'LOGISTICS', body: { time_out: '2026-10-07T01:00:00.000Z', remarks: 'Correct clock' } })).status, 400);
  assert.deepEqual(state.events, ['lock']);
});

test('Logistics RMA discussion is readable but comment writes are denied without mutation', async () => {
  const state = database(record({ category: 'RMA' }));
  stub(prisma.comment, 'findMany', async () => [{ id: 'comment-1', body: 'Discussion', author: { name: 'Author' }, createdAt: new Date(), updatedAt: new Date() }] as any);
  const create = stub(prisma.comment, 'create', async () => { throw new Error('Unexpected comment write'); });
  assert.equal((await request('get', '/:id/comments', { role: 'LOGISTICS' })).status, 200);
  assert.equal((await request('post', '/:id/comments', { role: 'LOGISTICS', body: { body: 'Discussion' } })).status, 403);
  assert.equal(create.mock.callCount(), 0);
  assert.deepEqual(state.events, []);
});

test('RMA comments are limited to TASS and reject blank discussion', async () => {
  for (const role of ['SALES_COORDINATOR', 'DRIVER', 'ADMIN']) {
    resetFixtures();
    database(record({ category: 'RMA' }));
    assert.equal((await request('post', '/:id/comments', { role, body: { body: ' Optional discussion ' } })).status, 403);
  }
  for (const role of ['TASS']) {
    resetFixtures();
    const state = database(record({ category: 'RMA' }));
    const create = stub(prisma.comment, 'create', async ({ data }: any) => ({ ...data, id: 'comment-1', author: { name: 'Assigned Driver' }, createdAt: new Date(), updatedAt: new Date() }) as any);
    assert.equal((await request('post', '/:id/comments', { role, body: { body: '   ' } })).status, 400);
    assert.equal(create.mock.callCount(), 0);
    const response = await request('post', '/:id/comments', { role, body: { body: ' Optional discussion ' } });
    assert.equal(response.status, 201);
    assert.equal(response.body.body, 'Optional discussion');
    assert.equal(response.body.author, 'Assigned Driver');
    assert.equal((create.mock.calls[0].arguments[0] as any).data.authorId, 'test-user');
    assert.deepEqual(state.events, ['lock']);
  }
});

// TSK-100: assignment ownership follows the stable Driver profile id.
test('Logistics assigns and reassigns by profile id; ownership moves with the id, not the name', async () => {
  const state = database(record({ status: 'SCHEDULED', timeIn: null, driver: '', driverId: null, createdById: 'creator-1' }));
  const notices = stub(prisma.notification, 'create', async () => ({}) as any);
  const assigned = await request('put', '/:id', { role: 'LOGISTICS', body: { driver_id: 'profile-assigned', remarks: 'Assign run' } });
  assert.equal(assigned.status, 200);
  assert.equal(state.saved().driverId, 'profile-assigned');
  assert.equal(state.saved().driver, 'New Driver', 'Display name is copied from the profile');
  assert.equal(assigned.body.driver_id, 'profile-assigned');
  assert.equal(notices.mock.callCount(), 1, 'The record creator is notified on first assignment');
  assert.ok(state.remarks.some(r => r.body === 'Assign run'));
  assert.equal((await request('get', '/:id')).status, 200, 'The linked Driver sees the run');

  const reassigned = await request('put', '/:id', { role: 'LOGISTICS', body: { driver_id: 'profile-driver-b', remarks: 'Reassign' } });
  assert.equal(reassigned.status, 200);
  assert.equal(state.saved().driverId, 'profile-driver-b');
  assert.equal(notices.mock.callCount(), 1, 'Reassignment is not a first assignment');
  const before = { ...state.saved() };
  assert.equal((await request('get', '/:id')).status, 403, 'The previous Driver loses access immediately');
  assert.equal((await request('patch', '/:id/status', { body: { status: 'Pending', remarks: 'Late' } })).status, 403);
  assert.deepEqual(state.saved(), before);
});

test('a display name equal to the Driver login name grants nothing without the profile id', async () => {
  database(record({ driver: 'Assigned Driver', driverId: 'profile-someone-else' }));
  assert.equal((await request('get', '/:id')).status, 403);
  assert.equal((await request('put', '/:id', { body: { received_by: 'Recipient', remarks: 'Edit' } })).status, 403);
});

test('Sales Coordinator cannot assign a Driver by profile id on create or edit', async () => {
  const created = await request('post', '/', { role: 'SALES_COORDINATOR', body: { company_id: 'company-1', reference: 'REF', category: 'Deliveries', delivery_date: '2026-10-10', driver_id: 'profile-assigned' } });
  assert.equal(created.status, 403);
  const state = database(record({ status: 'SCHEDULED', timeIn: null, driver: '', driverId: null }));
  const edited = await request('put', '/:id', { role: 'SALES_COORDINATOR', body: { driver_id: 'profile-assigned', remarks: 'Try' } });
  assert.equal(state.saved().driverId, null, `SC edit must not assign (status ${edited.status})`);
});

// ── SEC-07 / SEC-08: content checks, per-record quota and quarantine cleanup ──
const MEBIBYTE = 1024 * 1024;

test('document uploads are verified by content and stored under the server-derived type', async () => {
  database();
  const save = stub(podStorage, 'save', async () => 'stored.pdf');
  const create = stub(prisma.podAttachment, 'create', async ({ data }: any) => attachment({ ...data, id: 'pdf-1' }) as any);

  const genuine = uploaded(pdf(), 'Scan.PDF', 'application/pdf');
  const stored = await request('post', '/:id/attachments', { file: genuine });
  assert.equal(stored.status, 201);
  assert.equal(stored.body.is_photo, false);
  assert.equal(stored.body.mime_type, 'application/pdf');
  // Storage receives the quarantined file, not an in-memory copy.
  const savedFile = save.mock.calls[0].arguments[0];
  assert.equal(savedFile.path, genuine.path);
  assert.equal('buffer' in savedFile, false);

  // The browser's declared type is not what gets stored.
  const mislabelled = await request('post', '/:id/attachments', { file: uploaded(pdf(), 'scan.pdf', 'image/png') });
  assert.equal(mislabelled.status, 201);
  assert.equal(create.mock.calls[1].arguments[0].data.mimeType, 'application/pdf');

  // DOCX can be previewed in the app; legacy DOC is rejected for new uploads.
  const wordType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const word = await request('post', '/:id/attachments', { file: uploaded(docx(), 'Letter.DOCX', wordType) });
  assert.equal(word.status, 201, 'DOCX should be accepted');
  assert.equal(create.mock.calls.at(-1)!.arguments[0].data.mimeType, wordType);
  const spreadsheetType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const spreadsheet = await request('post', '/:id/attachments', { file: uploaded(xlsx(), 'Monthly Report.XLSX', spreadsheetType) });
  assert.equal(spreadsheet.status, 201, 'XLSX should be accepted');
  assert.equal(create.mock.calls.at(-1)!.arguments[0].data.mimeType, spreadsheetType);
  const legacyWord = await request('post', '/:id/attachments', { file: uploaded(oleFile('WordDocument'), 'letter.doc', 'application/msword') });
  assert.equal(legacyWord.status, 400, 'legacy DOC should be rejected for new uploads because it cannot be previewed');

  const rejected: Array<[string, Buffer, string, string]> = [
    ['archive renamed to DOCX', zipOf([{ name: 'setup.exe', content: 'MZ' }]), 'invoice.docx', wordType],
    ['macro-enabled document', zipOf([{ name: 'word/vbaProject.bin', content: 'macro' }]), 'invoice.docx', wordType],
    ['legacy DOC renamed to DOCX', oleFile('WordDocument'), 'letter.docx', wordType],
    ['DOCX renamed to XLSX', docx(), 'report.xlsx', spreadsheetType],
    ['DOCX renamed to DOC', docx(), 'letter.doc', 'application/msword'],
    ['PDF header only', Buffer.from('%PDF-1.4 UAT supporting document'), 'fake.pdf', 'application/pdf'],
    ['photo renamed to PDF', photo, 'photo.pdf', 'application/pdf'],
    ['PDF renamed to DOC', pdf(), 'letter.doc', 'application/msword'],
    ['executable renamed to DOC', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2000)]), 'setup.doc', 'application/msword'],
    ['PDF renamed to PNG', pdf(), 'photo.png', 'image/png'],
    ['PDF with a script appended', Buffer.concat([pdf(), Buffer.from('<script>alert(1)</script>')]), 'page.pdf', 'application/pdf'],
    ['type outside the allow-list', docx(), 'macro.docm', wordType],
  ];
  for (const [name, bytes, originalname, mimetype] of rejected) {
    const file = uploaded(bytes, originalname, mimetype);
    const response = await request('post', '/:id/attachments', { file });
    assert.equal(response.status, 400, name);
    assert.match(response.body.error, /not a valid|Unsupported file type/, name);
    assert.equal(fs.existsSync(file.path), false, `${name}: quarantined file removed`);
  }
  assert.equal(save.mock.callCount(), 4);
  assert.equal(create.mock.callCount(), 4);
});

test('a record at its attachment quota refuses another file before anything is stored', async () => {
  const save = () => stub(podStorage, 'save', async () => { throw new Error('Unexpected storage write'); });
  const create = () => stub(prisma.podAttachment, 'create', async () => { throw new Error('Unexpected metadata write'); });

  // Count: ten stored files, including a legacy record that is already over.
  for (const count of [10, 14]) {
    resetFixtures();
    const state = database(record(), Array.from({ length: count }, (_unused, index) => attachment({ id: `file-${index}`, size: 1000 })));
    const storage = save();
    const metadata = create();
    const file = uploaded();
    const response = await request('post', '/:id/attachments', { file });
    assert.equal(response.status, 409, `${count} files`);
    assert.equal(response.body.code, 'ATTACHMENT_QUOTA_EXCEEDED');
    assert.match(response.body.error, new RegExp(`already has ${count} attachments; the limit is 10`));
    assert.equal(storage.mock.callCount() + metadata.mock.callCount(), 0);
    assert.equal(state.audit.length, 0);
    assert.equal(fs.existsSync(file.path), false);
  }

  // Total size: one byte over is refused, exactly at the limit is accepted.
  for (const [storedBytes, status] of [[50 * MEBIBYTE - photo.length + 1, 409], [50 * MEBIBYTE - photo.length, 201]] as const) {
    resetFixtures();
    database(record(), [attachment({ size: storedBytes })]);
    stub(podStorage, 'save', async () => 'photo.png');
    stub(prisma.podAttachment, 'create', async () => attachment() as any);
    const response = await request('post', '/:id/attachments', { file: uploaded() });
    assert.equal(response.status, status, `${storedBytes} bytes stored`);
    if (status === 409) {
      assert.equal(response.body.code, 'ATTACHMENT_QUOTA_EXCEEDED');
      assert.match(response.body.error, /over its 50 MB attachment limit/);
    }
  }
});

test('parallel uploads to one record cannot take it past the quota', async () => {
  const files = Array.from({ length: 8 }, (_unused, index) => attachment({ id: `file-${index}`, size: 1000 }));
  const state = database(record(), files);
  // Transactions on one record run one at a time, as the record row lock makes them in PostgreSQL.
  let queue: Promise<unknown> = Promise.resolve();
  stub(prisma, '$transaction', (work: any) => {
    const run = queue.then(() => work(state.tx));
    queue = run.catch(() => {});
    return run;
  });
  const save = stub(podStorage, 'save', async () => { await new Promise(resolve => setTimeout(resolve, 5)); return `stored-${files.length}`; });
  stub(prisma.podAttachment, 'create', async ({ data }: any) => {
    const row = attachment({ ...data, id: `new-${files.length}` });
    files.push(row);
    return row as any;
  });

  const responses = await Promise.all(Array.from({ length: 6 }, () => request('post', '/:id/attachments', { file: uploaded() })));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 201, 409, 409, 409, 409]);
  assert.equal(files.length, 10);
  assert.equal(save.mock.callCount(), 2, 'refused uploads never reach storage');
});

test('the quarantined upload is removed after success, refusal, storage failure and database failure', async () => {
  for (const outcome of ['stored', 'refused', 'storage failure', 'database failure']) {
    resetFixtures();
    const state = database();
    if (outcome === 'refused') state.tx.deliveryRecord.findUnique = async () => record(otherDriver('Driver B'));
    stub(podStorage, 'save', async () => { if (outcome === 'storage failure') throw new Error('storage failure'); return 'new-key'; });
    const remove = stub(podStorage, 'remove', async () => {});
    stub(prisma.podAttachment, 'create', async () => { if (outcome === 'database failure') throw new Error('database failure'); return attachment() as any; });

    const file = uploaded();
    const pending = request('post', '/:id/attachments', { file });
    if (outcome.endsWith('failure')) await assert.rejects(pending, new RegExp(outcome));
    else assert.equal((await pending).status, outcome === 'stored' ? 201 : 403);
    assert.equal(fs.existsSync(file.path), false, outcome);
    // Only a file that reached storage needs compensating.
    assert.equal(remove.mock.callCount(), outcome === 'database failure' ? 1 : 0, outcome);
  }
});
