import { test, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/db';
import { recordEditVersion } from '../src/services/recordEditVersion';
import { signToken } from '../src/middleware/auth';
import authRoutes from '../src/routes/auth';
import recordsRoutes from '../src/routes/records';
import skusRoutes from '../src/routes/skus';
import customersRoutes from '../src/routes/customers';
import suppliersRoutes from '../src/routes/suppliers';
import driversRoutes from '../src/routes/drivers';
import companiesRoutes from '../src/routes/companies';
import notificationsRoutes from '../src/routes/notifications';
import adminRoutes from '../src/routes/admin';
import transactionsRoutes from '../src/routes/transactions';
import { podStorage } from '../src/services/podStorage';
import type { PolicyRole } from '../src/services/permissionCatalog';
import { dispatchRolePermissions } from '../src/services/rmaDispatchPermissions';
import { completePermissionSession } from '../../client/src/utils/permissions';

/** Deliberately interprets query predicates instead of returning a record for
 * every lookup: a missing authorization scope must make these tests fail. */
function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(condition => matches(row, condition));
    if (key === 'OR') return value.some((condition: any) => matches(row, condition));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(condition => matches(row, condition));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('notIn' in value) return !value.notIn.includes(row[key]);
      if ('not' in value) return row[key] !== value.not;
      if ('equals' in value) return row[key] === value.equals;
    }
    return row[key] === value;
  });
}

function savedRecord(id = 'record-one', category = 'DELIVERY', extra: Record<string, unknown> = {}) {
  return { id, category, deletedAt: null, status: 'SCHEDULED', draft: false,
    priority: '2 - Moderate', companyId: 'company-one', company: { id: 'company-one', name: 'Test Company' },
    reference: 'REF-247', rmaReference: category === 'RMA' ? 'RMA-247' : null,
    driver: 'Driver One', driverId: 'driver-one', driverAssistants: '[]', vehicle: 'Van',
    deliveryDate: '2020-01-01', timeIn: null, timeOut: null, receivedBy: null,
    area: 'Carmona', address: 'Test Address', accountManager: 'Account Manager',
    itemDescription: '', itemType: 'Small Item', remarks: '', collectionVerified: false,
    createdById: 'actor', modifiedById: 'actor', createdBy: { name: 'Actor' }, modifiedBy: { name: 'Actor' },
    createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-01T00:00:00Z'),
    lineItems: [], podAttachments: [], linkedCollectionId: null, linkedCollection: null,
    rmaMovement: category === 'RMA' ? 'LOGISTICS_TRANSPORT' : null,
    rmaTransportStatus: category === 'RMA' ? 'PENDING' : null, rmaVersion: 0,
    rmaTransportStartedAt: null, rmaTransportCompletedAt: null, rmaReceivedAt: null,
    rmaRecipient: null, rmaCompletedAt: null, ...extra };
}

async function fixture(t: TestContext, role: PolicyRole = 'LOGISTICS') {
  const previousMode = process.env.PERMISSION_MODE;
  process.env.PERMISSION_MODE = 'V1';
  let actor: any = { id: 'actor', name: 'Actor', email: 'actor@example.test', role,
    isActive: true, authorizationRevision: 1n, permissions: [], permissionOverrides: [],
    permissionConversion: { catalogVersion: 1 },
    driverProfile: role === 'DRIVER' ? { id: 'driver-one', type: 'DRIVER', isActive: true } : null };
  const policies = new Map<string, any>();
  for (const currentRole of ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER'] as PolicyRole[]) {
    policies.set(currentRole, { role: currentRole, revision: 1n, catalogVersion: 1,
      permissions: [...dispatchRolePermissions(currentRole)].map(([permissionKey, effect]) => ({ role: currentRole, permissionKey, effect })) });
  }
  let records: any[] = [savedRecord()];
  const effects: string[] = [];
  const reads: any[] = [];
  const restorers: Array<() => void> = [];
  function stub(target: any, key: string, fn: (...args: any[]) => any) {
    const original = target[key];
    target[key] = mock.fn(fn);
    restorers.push(() => { target[key] = original; });
    return target[key];
  }
  stub(prisma, '$transaction', async (work: any) => typeof work === 'function' ? work(prisma) : Promise.all(work));
  stub(prisma, '$executeRaw', async () => 1);
  stub(prisma, '$queryRaw', async () => []);
  stub(prisma.user, 'findUnique', async ({ where }: any) => where.id === actor?.id ? structuredClone(actor) : null);
  stub(prisma.user, 'findMany', async () => { reads.push('mail-recipients'); return []; });
  stub(prisma.rolePolicy, 'findUnique', async ({ where }: any) => structuredClone(policies.get(where.role) ?? null));
  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => { reads.push(where); return structuredClone(records.find(row => matches(row, where)) ?? null); });
  stub(prisma.deliveryRecord, 'findUnique', async ({ where }: any) => structuredClone(records.find(row => row.id === where.id) ?? null));
  stub(prisma.deliveryRecord, 'findMany', async ({ where }: any = {}) => { reads.push(where); return structuredClone(records.filter(row => matches(row, where))); });
  stub(prisma.deliveryRecord, 'count', async ({ where }: any = {}) => records.filter(row => matches(row, where)).length);
  stub(prisma.deliveryRecord, 'groupBy', async () => []);
  for (const [model, methods] of Object.entries({
    deliveryRecord: ['create', 'update', 'delete'], product: ['create', 'update'],
    inventoryItem: ['create', 'update'], inventoryTransaction: ['create'],
    customer: ['create', 'update'], supplier: ['create'], company: ['create'],
    driver: ['create', 'update', 'delete'], podAttachment: ['create', 'delete'],
    auditLog: ['create'], remarkLog: ['create'], notificationLog: ['create'],
  })) for (const method of methods) stub((prisma as any)[model], method, async () => { effects.push(`${model}.${method}`); throw new Error('Unexpected mutation'); });
  stub(prisma.comment, 'create', async ({ data }: any) => {
    effects.push('comment.create'); return { id: 'comment-one', ...data, author: { name: actor.name }, createdAt: new Date(), updatedAt: new Date() };
  });
  stub(prisma.product, 'findMany', async () => []);
  stub(prisma.inventoryTransaction, 'findMany', async () => []);
  stub(prisma.customer, 'findMany', async () => []);
  stub(prisma.podAttachment, 'findMany', async () => []);
  for (const method of ['save', 'read', 'open', 'remove']) stub(podStorage, method, async () => { effects.push(`storage.${method}`); throw new Error('Unexpected file access'); });
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/auth', authRoutes); app.use('/api/v1/records', recordsRoutes);
  app.use('/api/v1/skus', skusRoutes); app.use('/api/v1/customers', customersRoutes);
  app.use('/api/v1/suppliers', suppliersRoutes); app.use('/api/v1/drivers', driversRoutes);
  app.use('/api/v1/companies', companiesRoutes); app.use('/api/v1/notifications', notificationsRoutes);
  app.use('/api/v1/admin', adminRoutes); app.use('/api/v1/transactions', transactionsRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  // The stale JWT deliberately claims ADMIN. Only fresh database authority counts.
  const cookie = `mg_session=${signToken({ id: actor.id, name: actor.name, email: actor.email, role: 'ADMIN' })}`;
  async function request(path: string, method = 'GET', body?: unknown, authenticated = true, headers: Record<string, string> = {}) {
    return fetch(origin + path, { method, headers: { ...(authenticated ? { Cookie: cookie } : {}), 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' && headers['Content-Type'] ? body : JSON.stringify(body) }) });
  }
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    while (restorers.length) restorers.pop()!();
    if (previousMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = previousMode;
  });
  const deny = (...keys: string[]) => { actor.permissionOverrides = keys.map(permissionKey => ({ userId: actor.id, permissionKey, effect: 'DENY' })); actor.authorizationRevision++; };
  return { request, cookie, effects, reads, deny, policies, stub,
    actor: () => actor, setActor: (value: any) => { actor = value; },
    records: () => records, setRecords: (value: any[]) => { records = value; },
    setDefault(key: string, effect: string) { const policy = policies.get(actor.role); policy.permissions.find((row: any) => row.permissionKey === key).effect = effect; policy.revision++; },
  };
}

test('V1 supplier category writes honor Admin ceilings and screen/resource Write denials', async t => {
  const state = await fixture(t, 'ADMIN');
  const paths = [
    ['/api/v1/suppliers/categories', 'POST', { name: 'Category' }],
    ['/api/v1/suppliers/categories/category-one', 'PATCH', { name: 'Rename', expected_version: 1 }],
    ['/api/v1/suppliers/supplier-one/categories', 'PUT', { category_ids: ['category-one'], expected_version: 1 }],
  ] as const;
  for (const denied of ['SCREEN:suppliers:WRITE', 'RESOURCE:suppliers:WRITE', 'RESOURCE:suppliers:READ']) {
    state.deny(denied);
    for (const [path, method, body] of paths) assert.equal((await state.request(path, method, body)).status, 403, denied);
  }
  state.deny();
  const actor = state.actor();
  state.setActor({ ...actor, role: 'LOGISTICS' });
  for (const [path, method, body] of paths) assert.equal((await state.request(path, method, body)).status, 403, 'role ceiling');
  assert.deepEqual(state.effects, []);
});

test('V1 restored sessions satisfy the frontend contract and never trust the JWT role or leak credentials', async t => {
  const state = await fixture(t);
  state.actor().password = 'must-not-serialize'; state.actor().microsoftOid = 'must-not-serialize';
  const response = await state.request('/api/v1/auth/me');
  assert.equal(response.status, 200);
  const session: any = await response.json();
  assert.equal(session.role, 'LOGISTICS');
  assert.equal(completePermissionSession(session), true);
  assert.equal(session.contractVersion, 1); assert.equal(session.activeMode, 'V1');
  assert.doesNotMatch(JSON.stringify(session), /must-not-serialize/);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal((await state.request('/api/v1/admin/audit-log')).status, 403, 'a stale ADMIN claim cannot grant administrative access');
  assert.equal((await state.request('/api/v1/records/record-one', 'GET', undefined, false)).status, 401);
});

test('read-only users can read records but every record write rejects before database or upload effects', async t => {
  const state = await fixture(t, 'ADMIN');
  state.deny('CATEGORY:DELIVERY:WRITE');
  assert.equal((await state.request('/api/v1/records/record-one')).status, 200);
  const mutations: Array<[string, string, unknown]> = [
    ['/api/v1/records', 'POST', { category: 'Deliveries', company_id: 'company-one' }],
    ['/api/v1/records/record-one', 'PUT', { priority: '3 - High', remarks: 'Edit' }],
    ['/api/v1/records/record-one/status', 'PATCH', { status: 'On-Hold', remarks: 'Hold' }],
    ['/api/v1/records/record-one/time-in', 'POST', { remarks: 'Start' }],
    ['/api/v1/records/record-one/comments', 'POST', { body: 'Comment' }],
    ['/api/v1/records/record-one/attachments/attachment-one', 'DELETE', { remarks: 'Delete' }],
  ];
  for (const [path, method, payload] of mutations) assert.equal((await state.request(path, method, payload)).status, 403, `${method} ${path}`);
  const upload = await state.request('/api/v1/records/record-one/attachments', 'POST', 'invalid multipart', true, { 'Content-Type': 'multipart/form-data; boundary=not-a-real-upload' });
  assert.equal(upload.status, 403, 'authorization must reject before the multipart parser runs');
  assert.deepEqual(state.effects, []);
});

test('lookup Read and directory visibility never authorize direct SKU or directory writes', async t => {
  const state = await fixture(t, 'ADMIN');
  state.deny(...['skus', 'customers', 'suppliers', 'drivers', 'companies'].map(name => `RESOURCE:${name}:WRITE`));
  assert.equal((await state.request('/api/v1/skus')).status, 200);
  assert.equal((await state.request('/api/v1/customers')).status, 200);
  for (const [path, method] of [
    ['/api/v1/skus', 'POST'], ['/api/v1/skus/product-one', 'PUT'], ['/api/v1/skus/product-one/adjust', 'POST'],
    ['/api/v1/customers', 'POST'], ['/api/v1/customers/customer-one', 'PUT'], ['/api/v1/suppliers', 'POST'],
    ['/api/v1/drivers', 'POST'], ['/api/v1/drivers/driver-one', 'PUT'], ['/api/v1/drivers/driver-one', 'DELETE'], ['/api/v1/companies', 'POST'],
  ]) assert.equal((await state.request(path, method, {})).status, 403, `${method} ${path}`);
  assert.deepEqual(state.effects, []);
});

test('the same cookie observes role defaults, individual Deny/reset, role changes and deactivation', async t => {
  const state = await fixture(t);
  const postComment = () => state.request('/api/v1/records/record-one/comments', 'POST', { body: 'Operational note' });
  assert.equal((await postComment()).status, 201);
  const before: any = await (await state.request('/api/v1/auth/me')).json();
  state.deny('CATEGORY:DELIVERY:COMMENT');
  assert.equal((await postComment()).status, 403);
  const denied: any = await (await state.request('/api/v1/auth/me')).json();
  assert.notEqual(denied.permissionVersion, before.permissionVersion);
  state.actor().permissionOverrides = []; state.actor().authorizationRevision++;
  assert.equal((await postComment()).status, 201, 'reset must inherit current defaults without logging in again');
  state.setDefault('CATEGORY:DELIVERY:COMMENT', 'DENY');
  assert.equal((await postComment()).status, 403, 'committed role-default changes revoke the same cookie');
  state.actor().permissionOverrides = [{ userId: 'actor', permissionKey: 'CATEGORY:DELIVERY:COMMENT', effect: 'ALLOW' }];
  state.actor().authorizationRevision++;
  assert.equal((await postComment()).status, 201, 'an individual Allow overrides a role default within its ceiling');
  state.actor().permissionOverrides = []; state.actor().authorizationRevision++;
  assert.equal((await postComment()).status, 403, 'reset now inherits the changed role default');
  state.actor().role = 'TASS'; state.actor().authorizationRevision++;
  assert.equal((await state.request('/api/v1/records/record-one')).status, 403, 'role changes must revoke old category access');
  state.actor().isActive = false; state.actor().authorizationRevision++;
  const inactive = await state.request('/api/v1/auth/me');
  assert.equal(inactive.status, 401); assert.match(inactive.headers.get('set-cookie') ?? '', /mg_session=;/);
  assert.equal(state.effects.filter(value => value === 'comment.create').length, 3);
});

test('category Write and resource membership cannot bypass denial on every editing screen', async t => {
  const state = await fixture(t, 'ADMIN');
  state.deny(...['deliveries', 'driver', 'calendar', 'driver_board'].map(screen => `SCREEN:${screen}:WRITE`));
  assert.equal((await state.request('/api/v1/records/record-one')).status, 200);
  assert.equal((await state.request('/api/v1/records/record-one?screen=driver_dashboard', 'PUT', { priority: '3 - High', remarks: 'Forged entry path' })).status, 403);
  assert.equal((await state.request('/api/v1/records/record-one/comments', 'POST', { body: 'Forged action' })).status, 403);
  assert.deepEqual(state.effects, []);
});

test('existing Logistics creation stays distinct from submission of an existing draft', async t => {
  const state = await fixture(t);
  state.stub(prisma.company, 'findUnique', async () => ({ id: 'company-one' }));
  state.stub(prisma.deliveryRecord, 'create', async ({ data }: any) => {
    state.effects.push('deliveryRecord.create'); return savedRecord(data.id, data.category, data);
  });
  state.stub(prisma.auditLog, 'create', async ({ data }: any) => { state.effects.push('auditLog.create'); return data; });
  const created = await state.request('/api/v1/records', 'POST', { company_id: 'company-one', category: 'Procurement Pick-up', reference: 'PICKUP-247', delivery_date: '2026-10-29' });
  assert.equal(created.status, 201, 'the frozen Logistics baseline permits new non-Delivery creation without draft SUBMIT');
  assert.deepEqual(state.effects, ['deliveryRecord.create', 'auditLog.create']);
  state.actor().role = 'SALES_COORDINATOR'; state.actor().authorizationRevision++;
  state.setRecords([savedRecord('record-one', 'DELIVERY', { draft: true, driverId: null })]);
  state.deny('CATEGORY:DELIVERY:SUBMIT');
  assert.equal((await state.request('/api/v1/records/record-one/status', 'PATCH', { status: 'Scheduled', remarks: 'Submit existing draft' })).status, 403);
  assert.deepEqual(state.effects, ['deliveryRecord.create', 'auditLog.create']);
});

test('mixed metadata/assignment and completion-correction fields cannot bypass individual operation denials', async t => {
  const state = await fixture(t, 'ADMIN');
  const cases = [
    { deny: 'ASSIGN', body: { priority: '3 - High', driver_id: 'driver-two' } },
    { deny: 'COMPLETE', body: { time_out: '2026-10-02T01:00:00Z' } },
    { deny: 'COMPLETE', body: { received_by: 'Changed Recipient' } },
    { deny: 'POD', body: { attachments: ['pretend-proof.png'] } },
    { deny: 'SUBMIT', body: { is_draft: 'Yes' } },
  ];
  for (const entry of cases) {
    state.deny(`CATEGORY:DELIVERY:${entry.deny}`);
    const response = await state.request('/api/v1/records/record-one', 'PUT', { ...entry.body, remarks: 'Mixed edit' });
    assert.equal(response.status, 403, entry.deny);
  }
  state.deny('CATEGORY:DELIVERY:COMPLETE');
  const response = await state.request('/api/v1/records/record-one/status', 'PATCH', { status: 'Scheduled', priority: '3 - High', received_by: 'Changed Recipient', remarks: 'Keep status' });
  assert.equal(response.status, 403, 'a same-status priority edit must not smuggle a recipient change');
  assert.deepEqual(state.effects, []);
});

test('explicit category denial dominates direct reads, aggregate lists, transactions and category relocation', async t => {
  const state = await fixture(t, 'ADMIN');
  state.setRecords([savedRecord(), savedRecord('collection-one', 'ACCOUNTING_COLLECTION')]);
  state.deny('CATEGORY:ACCOUNTING_COLLECTION:READ');
  const listed: any[] = await (await state.request('/api/v1/records')).json();
  assert.deepEqual(listed.map(row => row.id), ['record-one']);
  assert.equal((await state.request('/api/v1/records/collection-one')).status, 403);
  const transactions: any = await (await state.request('/api/v1/transactions?source=delivery')).json();
  assert.deepEqual(transactions.transactions.map((row: any) => row.id), ['record-one']);
  assert.equal((await state.request('/api/v1/transactions/delivery/collection-one')).status, 404);
  assert.equal((await state.request('/api/v1/records/record-one', 'PUT', { category: 'Accounting Collection', remarks: 'Move into denied category' })).status, 403);
  state.deny('CATEGORY:DELIVERY:UPDATE');
  assert.equal((await state.request('/api/v1/records/record-one', 'PUT', { category: 'Accounting Collection', remarks: 'Move from denied source' })).status, 403);
  assert.deepEqual(state.effects, []);
});

test('Driver lists and direct reads use linked profile, non-draft and explicit RMA transport eligibility', async t => {
  const state = await fixture(t, 'DRIVER');
  state.setRecords([savedRecord(), savedRecord('other-driver', 'DELIVERY', { driverId: 'driver-two' }),
    savedRecord('draft', 'DELIVERY', { draft: true }), savedRecord('rma-eligible', 'RMA'),
    savedRecord('rma-supplier', 'RMA', { rmaMovement: 'SUPPLIER_COLLECTION' })]);
  const listed: any[] = await (await state.request('/api/v1/records')).json();
  assert.deepEqual(listed.map(row => row.id).sort(), ['record-one', 'rma-eligible']);
  for (const id of ['other-driver', 'draft', 'rma-supplier']) assert.equal((await state.request(`/api/v1/records/${id}`)).status, 403, id);
  state.actor().driverProfile.isActive = false; state.actor().authorizationRevision++;
  assert.equal((await state.request('/api/v1/records')).status, 403);
  assert.equal((await state.request('/api/v1/records/record-one')).status, 403);
});

test('read-only email dispatch and forged trigger/recipient payloads reject before resolving recipients or sending mail', async t => {
  const state = await fixture(t, 'ADMIN');
  state.deny('CATEGORY:DELIVERY:WRITE');
  const body = { recordId: 'record-one', trigger: 'Record Created', recipients: ['LOGISTICS'] };
  assert.equal((await state.request('/api/v1/notifications/send-email', 'POST', body)).status, 403);
  state.deny();
  for (const malformed of [
    { ...body, trigger: 'arbitrary subject' }, { ...body, recipients: ['outside@example.test'] },
    { ...body, recipients: ['AM', 'AM'] }, { ...body, to: 'outside@example.test' },
  ]) assert.equal((await state.request('/api/v1/notifications/send-email', 'POST', malformed)).status, 400);
  assert.equal(state.reads.includes('mail-recipients'), false);
  assert.deepEqual(state.effects, []);
});

test('ADMIN cannot bypass TASS-only verification and disabled record deletion; missing conversion fails closed', async t => {
  const state = await fixture(t, 'ADMIN');
  state.setRecords([savedRecord('collection-one', 'ACCOUNTING_COLLECTION', { status: 'ACCOMPLISHED', collectionVerified: false })]);
  assert.equal((await state.request('/api/v1/records/collection-one/verify-collection', 'PATCH', {})).status, 403);
  assert.equal((await state.request('/api/v1/records/collection-one', 'DELETE', {})).status, 403);
  state.actor().permissionConversion = null;
  assert.equal((await state.request('/api/v1/records')).status, 503);
  assert.deepEqual(state.effects, []);
});

test('V1 collection verification reports repeats as conflicts while explicit action Deny remains authoritative', async t => {
  const state = await fixture(t, 'TASS');
  state.setRecords([savedRecord('collection-one', 'ACCOUNTING_COLLECTION', { status: 'ACCOMPLISHED', collectionVerified: true })]);
  const duplicate = await state.request('/api/v1/records/collection-one/verify-collection', 'PATCH', {});
  assert.equal(duplicate.status, 409, await duplicate.text());
  state.deny('CATEGORY:ACCOUNTING_COLLECTION:VERIFY_COLLECTION');
  assert.equal((await state.request('/api/v1/records/collection-one/verify-collection', 'PATCH', {})).status, 403);
  state.setRecords([savedRecord('collection-one', 'ACCOUNTING_COLLECTION', { status: 'ACCOMPLISHED', collectionVerified: false })]);
  assert.equal((await state.request('/api/v1/records/collection-one/verify-collection', 'PATCH', {})).status, 403);
  assert.deepEqual(state.effects, [], 'neither duplicate nor denied requests write anything');
});


test('V1 metadata writes reject stale editors and enforce the Sales post-dispatch lock', async t => {
 const state=await fixture(t,'SALES_COORDINATOR');
 const old=savedRecord('record-one','DELIVERY',{reference:'REF-original'});
 state.setRecords([{...old,reference:'REF-new'}]);
 const stale=await state.request('/api/v1/records/record-one','PUT',{expected_edit_version:recordEditVersion(old),address:'New address',remarks:'Stale edit'});
 assert.equal(stale.status,409);assert.deepEqual(state.effects,[]);
 const missing=await state.request('/api/v1/records/record-one','PUT',{address:'New address',remarks:'Missing version'});
 assert.equal(missing.status,428);assert.deepEqual(state.effects,[]);
 state.setRecords([{...old,status:'ACCOMPLISHED'}]);
 const locked=await state.request('/api/v1/records/record-one','PUT',{expected_edit_version:recordEditVersion(state.records()[0]),reference:'After completion',remarks:'Disallowed edit'});
 assert.equal(locked.status,403);assert.deepEqual(state.effects,[]);
 state.deny('CATEGORY:DELIVERY:UPDATE');
 assert.equal((await state.request('/api/v1/records/record-one','PUT',{expected_edit_version:recordEditVersion(state.records()[0]),address:'Denied',remarks:'Denied edit'})).status,403);
 assert.deepEqual(state.effects,[]);
});
