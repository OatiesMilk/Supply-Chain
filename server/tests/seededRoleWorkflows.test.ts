import assert from 'node:assert/strict';
import { test, mock, type TestContext } from 'node:test';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { USERS } from '../prisma/seeds/users';
import { prisma } from '../src/db';
import authRoutes from '../src/routes/auth';
import recordsRoutes from '../src/routes/records';
import usersRoutes from '../src/routes/users';
import { manilaToday } from '../src/services/deliveryLifecycle';
import { defaultRolePermissions, type PolicyRole } from '../src/services/permissionCatalog';
import { podStorage } from '../src/services/podStorage';
import { matchesRecordWhere } from './rmaTestPolicy';

const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWMwTpsJAAICATMDms/iAAAAAElFTkSuQmCC', 'base64');

/** Reuse the production seed identities without invoking seedUsers or connecting
 * to a database. Policies/conversion are explicit fixtures, not a live backfill.
 * Real routers, cookie authentication, image inspection and storage readback run;
 * the shared database/storage doubles cannot establish PostgreSQL locking. */
async function fixture(t: TestContext, mode: 'LEGACY' | 'V1') {
  const envKeys = ['PERMISSION_MODE', 'SMTP_HOST', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'BILLING_NOTIFICATION_USER_EMAIL'];
  const env = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  process.env.PERMISSION_MODE = mode;
  const accounts = USERS.map(seed => ({ ...seed, id: `seed-${seed.role}`, password: bcrypt.hashSync(seed.password, 4),
    authorizationRevision: 1n, permissions: [], permissionOverrides: [], permissionConversion: { catalogVersion: 1 },
    driverProfile: seed.role === 'DRIVER' ? { id: 'seed-driver-profile', name: seed.name, type: 'DRIVER', isActive: true } : null,
  }));
  const account = (role: PolicyRole) => accounts.find(user => user.id === `seed-${role}`)!;
  const driver = { ...account('DRIVER').driverProfile!, userId: account('DRIVER').id };
  const rows = new Map<string, any>();
  const files: any[] = [], audits: any[] = [], remarks: any[] = [], notices: any[] = [], mailLogs: any[] = [];
  const bytes = new Map<string, Buffer>();
  const restorers: Array<() => void> = [];
  const stub = (target: any, key: string, implementation: (...args: any[]) => any) => {
    const original = target[key]; target[key] = mock.fn(implementation); restorers.push(() => { target[key] = original; });
  };
  t.after(() => {
    while (restorers.length) restorers.pop()!();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  // Unexpected data/provider operations fail rather than reaching a developer DB.
  for (const model of [prisma.user, prisma.rolePolicy, prisma.company, prisma.deliveryRecord, prisma.driver,
    prisma.podAttachment, prisma.auditLog, prisma.remarkLog, prisma.notification, prisma.notificationLog, prisma.comment]) {
    for (const method of ['findFirst', 'findUnique', 'findUniqueOrThrow', 'findMany', 'count', 'aggregate', 'create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']) {
      stub(model, method, async () => { throw new Error(`Unconfigured isolated database operation: ${method}`); });
    }
  }
  for (const method of ['save', 'read', 'open', 'remove']) stub(podStorage, method, async () => { throw new Error(`Unconfigured storage operation: ${method}`); });
  stub(prisma, '$queryRaw', async () => []);
  stub(prisma, '$executeRaw', async () => 1);
  const hydrate = (row: any) => row ? structuredClone({ ...row, company: { id: 'seed-company', name: 'Seed Workflow Company' },
    createdBy: accounts.find(user => user.id === row.createdById), modifiedBy: accounts.find(user => user.id === row.modifiedById),
    podAttachments: files.filter(file => file.recordId === row.id), lineItems: [],
  }) : null;
  const matching = (where: any) => [...rows.values()].filter(row => matchesRecordWhere(row, where));
  stub(prisma.user, 'findUnique', async ({ where }: any) => structuredClone(accounts.find(user => where.id ? user.id === where.id : user.email === where.email) ?? null));
  stub(prisma.user, 'findMany', async ({ where = {} }: any = {}) => structuredClone(accounts.filter(user =>
    (where.role === undefined || user.role === where.role) && (where.isActive === undefined || user.isActive === where.isActive)
    && (!where.name || user.name.toLowerCase() === String(where.name.equals).toLowerCase()))));
  stub(prisma.rolePolicy, 'findUnique', async ({ where }: any) => ({ role: where.role, revision: 1n, catalogVersion: 1,
    permissions: [...defaultRolePermissions(where.role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) }));
  stub(prisma.company, 'findUnique', async ({ where }: any) => where.id === 'seed-company' ? { id: 'seed-company' } : null);
  stub(prisma.driver, 'findUnique', async ({ where }: any) => where.id === driver.id ? structuredClone(driver) : null);
  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => hydrate(matching(where)[0]));
  stub(prisma.deliveryRecord, 'findUnique', async ({ where }: any) => hydrate(rows.get(where.id)));
  stub(prisma.deliveryRecord, 'findUniqueOrThrow', async ({ where }: any) => { const row = hydrate(rows.get(where.id)); assert.ok(row); return row; });
  stub(prisma.deliveryRecord, 'create', async ({ data }: any) => {
    const row = { driverId: null, deletedAt: null, collectionVerified: false, rmaVersion: 0, createdAt: new Date(), updatedAt: new Date(), ...data };
    rows.set(row.id, row); return hydrate(row);
  });
  stub(prisma.deliveryRecord, 'update', async ({ where, data }: any) => {
    const previous = rows.get(where.id);
    const row = { ...previous, ...data, ...(data.rmaVersion?.increment ? { rmaVersion: previous.rmaVersion + data.rmaVersion.increment } : {}), updatedAt: new Date() };
    rows.set(row.id, row); return hydrate(row);
  });
  stub(prisma.deliveryRecord, 'updateMany', async ({ where, data }: any) => {
    const found = matching(where); for (const row of found) rows.set(row.id, { ...row, ...data }); return { count: found.length };
  });
  stub(prisma.podAttachment, 'findMany', async ({ where }: any) => structuredClone(files.filter(file => matchesRecordWhere(file, where))));
  stub(prisma.podAttachment, 'findFirst', async ({ where }: any) => structuredClone(files.find(file => matchesRecordWhere(file, where)) ?? null));
  stub(prisma.podAttachment, 'aggregate', async ({ where }: any) => {
    const found = files.filter(file => matchesRecordWhere(file, where)); return { _count: { _all: found.length }, _sum: { size: found.reduce((sum, file) => sum + file.size, 0) } };
  });
  stub(prisma.podAttachment, 'create', async ({ data }: any) => { const file = { id: `photo-${files.length + 1}`, createdAt: new Date(), ...data }; files.push(file); return structuredClone(file); });
  stub(prisma.auditLog, 'create', async ({ data }: any) => { audits.push(structuredClone(data)); return data; });
  stub(prisma.remarkLog, 'create', async ({ data }: any) => { remarks.push(structuredClone(data)); return data; });
  stub(prisma.notification, 'create', async ({ data }: any) => { notices.push(structuredClone(data)); return data; });
  stub(prisma.notification, 'createMany', async ({ data }: any) => { notices.push(...structuredClone(data)); return { count: data.length }; });
  stub(prisma.notificationLog, 'create', async ({ data }: any) => { mailLogs.push(structuredClone(data)); return data; });
  stub(prisma, '$transaction', async (work: any) => {
    const before = structuredClone([...rows]); const lengths = [files.length, audits.length, remarks.length, notices.length, mailLogs.length];
    try { return await work(prisma); } catch (error) {
      rows.clear(); for (const [id, row] of before) rows.set(id, row);
      [files, audits, remarks, notices, mailLogs].forEach((list, index) => { list.length = lengths[index]; }); throw error;
    }
  });
  stub(podStorage, 'save', async (file: any) => { const key = `stored-${bytes.size + 1}`; bytes.set(key, await fs.readFile(file.path)); return key; });
  stub(podStorage, 'read', async (key: string) => { const content = bytes.get(key); assert.ok(content, 'Stored proof bytes must exist'); return content; });
  stub(podStorage, 'open', async (key: string) => { const content = bytes.get(key); assert.ok(content); return Readable.from(content); });
  stub(podStorage, 'remove', async (key: string) => { bytes.delete(key); });
  const app = express(); app.use(express.json(), cookieParser());
  app.use('/auth', authRoutes); app.use('/records', recordsRoutes); app.use('/users', usersRoutes);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: error.message }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookies = new Map<PolicyRole, string>();
  const send = (role: PolicyRole, path: string, method = 'GET', body?: unknown) => fetch(origin + path, {
    method, headers: { Cookie: cookies.get(role) ?? '', ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(5000),
  });
  for (const seed of USERS) {
    const response = await fetch(origin + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: seed.email, password: seed.password }), signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, await response.clone().text());
    const payload = await response.json() as any;
    assert.equal(payload.role, seed.role); assert.equal(payload.password, undefined); assert.equal(payload.token, undefined);
    assert.match(response.headers.get('set-cookie')!, /HttpOnly/);
    cookies.set(seed.role, response.headers.get('set-cookie')!.split(';')[0]);
  }
  const expect = async (response: Promise<Response>, expected: number) => {
    const result = await response; const body = await result.json() as any; assert.equal(result.status, expected, JSON.stringify(body)); return body;
  };
  const upload = (id: string) => { const form = new FormData(); form.set('file', new Blob([photo], { type: 'image/png' }), 'handoff.png'); return send('DRIVER', `/records/${id}/attachments`, 'POST', form); };
  return { account, rows, files, audits, notices, mailLogs, send, expect, upload, origin };
}

for (const mode of ['LEGACY', 'V1'] as const) {
  test(`${mode}: seeded roles hand off submitted work, persisted proof and TASS collection verification`, async t => {
    const f = await fixture(t, mode);
    const create = (category: string, reference: string) => f.send('SALES_COORDINATOR', '/records', 'POST', {
      category, reference, company_id: 'seed-company', delivery_date: manilaToday(), remarks: 'Seeded workflow request',
    });
    const delivery = await f.expect(create('Deliveries', 'SEED-DELIVERY'), 201);
    const id = delivery.id;
    assert.ok(f.notices.some(notice => notice.userId === f.account('LOGISTICS').id && notice.recordId === id));
    const beforeDeniedAssignment = structuredClone([...f.rows]);
    await f.expect(f.send('SALES_COORDINATOR', '/records', 'POST', { category: 'Deliveries', company_id: 'seed-company',
      reference: 'SEED-DENIED-ASSIGNMENT', delivery_date: manilaToday(), driver_id: 'seed-driver-profile' }), 403);
    assert.deepEqual([...f.rows], beforeDeniedAssignment);
    await f.expect(f.send('DRIVER', `/records/${id}`), 403);
    assert.match(delivery.edit_version, /^record:[a-f0-9]{64}$/);
    const dispatched = await f.expect(f.send('LOGISTICS', `/records/${id}`, 'PUT', { driver_id: 'seed-driver-profile', vehicle: 'Seed Van',
      remarks: 'Dispatch to linked driver', expected_edit_version: delivery.edit_version }), 200);
    const afterDispatch = structuredClone(f.rows.get(id));
    const auditCount = f.audits.length;
    await f.expect(f.send('LOGISTICS', `/records/${id}`, 'PUT', { vehicle: 'Stale van', remarks: 'Stale dispatch retry', expected_edit_version: delivery.edit_version }), 409);
    assert.notEqual(dispatched.edit_version, delivery.edit_version);
    assert.deepEqual(f.rows.get(id), afterDispatch);
    assert.equal(f.audits.length, auditCount, 'A stale dispatch edit cannot create a success audit');
    assert.ok(f.notices.some(notice => notice.userId === f.account('SALES_COORDINATOR').id && notice.title === 'Driver assigned'));
    assert.equal((await f.expect(f.send('DRIVER', `/records/${id}`), 200)).driver_id, 'seed-driver-profile');
    await f.expect(f.send('TASS', `/records/${id}`), 403);
    await f.expect(f.send('DRIVER', `/records/${id}/time-in`, 'POST', { remarks: 'Arrived at merchant' }), 200);
    const inTransit = structuredClone(f.rows.get(id));
    const completion = { status: 'Delivered', remarks: 'Handed to recipient', received_by: 'Seed Recipient' };
    await f.expect(f.send('DRIVER', `/records/${id}/status`, 'PATCH', completion), 400);
    assert.deepEqual(f.rows.get(id), inTransit, 'A rejected completion must preserve in-transit state');
    const proof = await f.expect(f.upload(id), 201);
    assert.equal(f.files.find(file => file.id === proof.id).uploadedById, f.account('DRIVER').id);
    const download = await f.send('DRIVER', `/records/${id}/attachments/${proof.id}/download`);
    assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), photo);
    const completed = await f.expect(f.send('DRIVER', `/records/${id}/status`, 'PATCH', completion), 200);
    assert.equal(completed.status, 'Delivered'); assert.ok(completed.time_in); assert.ok(completed.time_out);
    assert.equal((await f.expect(f.send('SALES_COORDINATOR', `/records/${id}`), 200)).received_by, 'Seed Recipient');
    assert.equal(f.mailLogs.at(-1).status, 'SKIPPED', 'No recipient mapping is not email delivery');
    assert.deepEqual(new Set(f.audits.filter(audit => audit.recordId === id).map(audit => audit.changedById)),
      new Set(['SALES_COORDINATOR', 'LOGISTICS', 'DRIVER'].map(role => f.account(role as PolicyRole).id)));

    const collection = await f.expect(create('Accounting Collection', 'SEED-COLLECTION'), 201);
    await f.expect(f.send('TASS', `/records/${collection.id}/verify-collection`, 'PATCH', {}), 400);
    await f.expect(f.send('LOGISTICS', `/records/${collection.id}`, 'PUT', { driver_id: 'seed-driver-profile', remarks: 'Dispatch collection', expected_edit_version: collection.edit_version }), 200);
    await f.expect(f.send('DRIVER', `/records/${collection.id}/time-in`, 'POST', { remarks: 'Arrived for collection' }), 200);
    await f.expect(f.upload(collection.id), 201);
    await f.expect(f.send('DRIVER', `/records/${collection.id}/status`, 'PATCH', completion), 200);
    assert.ok(f.notices.some(notice => notice.userId === f.account('TASS').id && notice.recordId === collection.id && notice.title === 'Collection ready for verification'));
    const beforeVerification = structuredClone(f.rows.get(collection.id));
    await f.expect(f.send('ADMIN', `/records/${collection.id}/verify-collection`, 'PATCH', {}), 403);
    assert.deepEqual(f.rows.get(collection.id), beforeVerification, 'Admin cannot replace TASS verification');
    const verified = await f.expect(f.send('TASS', `/records/${collection.id}/verify-collection`, 'PATCH', {}), 200);
    assert.equal(verified.collection_verified, true); assert.equal(verified.collection_verified_by, f.account('TASS').name);
    await f.expect(f.send('TASS', `/records/${collection.id}/verify-collection`, 'PATCH', {}), 409);
    assert.equal((await f.expect(f.send('SALES_COORDINATOR', `/records/${collection.id}`), 200)).collection_verified, true);
    assert.equal(f.notices.filter(notice => notice.recordId === collection.id && notice.title === 'Collection verified').length, 1);
  });

  test(`${mode}: seeded TASS RMA edits require the current numeric version and reject stale retries`, async t => {
    const f = await fixture(t, mode);
    const created = await f.expect(f.send('TASS', '/records', 'POST', { category: 'RMA', company_id: 'seed-company',
      priority: '2 - Moderate', area: 'Carmona', account_manager: 'Seed AM', rma_reference: 'SEED-RMA-VERSION',
      rma_movement: 'INTERNAL_NO_DRIVER', remarks: 'Seeded internal RMA request' }), 201);
    const change = { area: 'Makati', remarks: 'Correct RMA destination' };
    const before = structuredClone(f.rows.get(created.id));
    await f.expect(f.send('TASS', `/records/${created.id}`, 'PUT', change), 400);
    assert.deepEqual(f.rows.get(created.id), before);
    const updated = await f.expect(f.send('TASS', `/records/${created.id}`, 'PUT', { ...change, expected_version: created.rma_version }), 200);
    assert.equal(updated.rma_version, created.rma_version + 1);
    const after = structuredClone(f.rows.get(created.id));
    const auditCount = f.audits.length;
    await f.expect(f.send('TASS', `/records/${created.id}`, 'PUT', { ...change, area: 'Stale destination', expected_version: created.rma_version }), 409);
    assert.deepEqual(f.rows.get(created.id), after);
    assert.equal(f.audits.length, auditCount);
  });

  test(`${mode}: seeded password sessions obey current account roles, deactivation and linked Driver ownership`, async t => {
    const f = await fixture(t, mode);
    for (const role of ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER'] as const) await f.expect(f.send(role, '/users'), 403);
    assert.equal((await f.expect(f.send('ADMIN', '/users'), 200)).length, USERS.length);
    const invalid = await fetch(f.origin + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USERS[0].email, password: 'invalid-seed-password' }), signal: AbortSignal.timeout(5000) });
    assert.equal(invalid.status, 401); assert.equal(invalid.headers.get('set-cookie'), null);
    const admin = f.account('ADMIN'); admin.role = 'LOGISTICS';
    await f.expect(f.send('ADMIN', '/users'), 403);
    assert.equal((await f.expect(f.send('ADMIN', '/auth/me'), 200)).role, 'LOGISTICS', 'Existing cookie claims do not retain Admin authority');
    f.account('SALES_COORDINATOR').isActive = false;
    await f.expect(f.send('SALES_COORDINATOR', '/auth/me'), 401);

    const delivery = await f.expect(f.send('LOGISTICS', '/records', 'POST', { category: 'Sales Orders', company_id: 'seed-company',
      reference: 'SEED-OWNERSHIP', delivery_date: manilaToday() }), 201);
    await f.expect(f.send('LOGISTICS', `/records/${delivery.id}`, 'PUT', { driver_id: 'seed-driver-profile', remarks: 'Assign original linked profile', expected_edit_version: delivery.edit_version }), 200);
    await f.expect(f.send('DRIVER', `/records/${delivery.id}`), 200);
    f.account('DRIVER').driverProfile!.id = 'new-admin-linked-profile';
    await f.expect(f.send('DRIVER', `/records/${delivery.id}`), 403);
    assert.equal(f.rows.get(delivery.id).driverId, 'seed-driver-profile');
  });
}
