import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import recordsRouter from '../src/routes/records';
import rmaDispatchRouter from '../src/routes/rmaDispatch';
import { podStorage } from '../src/services/podStorage';
import { driversInTransitFilter } from '../src/services/dashboardFilters';
import { signToken } from '../src/middleware/auth';
import { manilaToday } from '../src/services/deliveryLifecycle';
import { manilaDateToMmddyy } from '../src/services/rmaReference';
import { safeBusinessAudit } from '../src/services/businessAudit';
import { recordMutationInputError } from '../src/services/recordOperations';
import { matchesRecordWhere, rmaTestPolicy } from './rmaTestPolicy';
import type { PolicyRole } from '../src/services/permissionCatalog';

// In-memory records router harness: every write runs through a rollback-aware
// $transaction double and the slip counter lives in the same rolled-back state.
const restorers: Array<() => void> = [];
function stub(target: any, key: string, fn: (...args: any[]) => any) {
  const previous = target[key]; target[key] = mock.fn(fn); restorers.push(() => { target[key] = previous; });
  return target[key];
}
afterEach(() => { while (restorers.length) restorers.pop()!(); mock.restoreAll(); });

const today = () => manilaDateToMmddyy(manilaToday());
const ref = (prefix: string, n: number) => `${prefix}${today()}-${String(n).padStart(2, '0')}`;
const createBody = (extra: Record<string, unknown> = {}) => ({
  company_id: 'company-1', category: 'RMA', priority: '2 - Moderate', area: 'Carmona', account_manager: 'Alex AM',
  rma_type: 'Pull Out Slip', rma_movement: 'INTERNAL_NO_DRIVER', ...extra,
});

function legacyRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'legacy-rma', recordNo: 'RMA-26-00001', category: 'RMA', draft: false, status: 'SCHEDULED', priority: '2 - Moderate',
    companyId: 'company-1', company: { name: 'Company' }, createdById: 'tass', modifiedById: 'tass', createdBy: { name: 'TASS' }, modifiedBy: { name: 'TASS' },
    reference: '', rmaReference: 'LEGACY-REF-1', rmaType: 'Others', isInternalTransfer: false, driverId: null, driver: '', driverAssistants: '[]', vehicle: '(None)',
    rmaMovement: 'INTERNAL_NO_DRIVER', rmaTransportStatus: null, rmaVersion: 0, deliveryDate: '', timeIn: null, timeOut: null, receivedBy: null,
    rmaReceivedAt: null, rmaTransportStartedAt: null, rmaTransportCompletedAt: null, rmaRecipient: null, rmaCompletedAt: null, deletedAt: null,
    createdAt: new Date('2026-01-05T00:00:00Z'), updatedAt: new Date('2026-01-05T00:00:00Z'), area: 'Carmona', address: '', accountManager: 'Alex AM',
    itemType: 'Small Item', itemDescription: '', lineItems: [], remarks: '', ...extra,
  };
}

/** Evaluates the Prisma where-input subset the dashboard filters use (incl. notIn), as in transportRequestFilters.test.ts. */
function evaluateWhere(row: Record<string, any>, where: any): boolean {
  return Object.entries(where).every(([key, condition]: [string, any]) => {
    if (key === 'AND') return (condition as any[]).every(part => evaluateWhere(row, part));
    if (key === 'OR') return (condition as any[]).some(part => evaluateWhere(row, part));
    if (key === 'NOT') return !evaluateWhere(row, condition);
    const value = row[key] ?? null;
    if (condition === null || typeof condition !== 'object') return value === condition;
    if ('in' in condition) return condition.in.includes(value);
    if ('notIn' in condition) return value !== null && !condition.notIn.includes(value);
    if ('not' in condition) return value !== null && value !== condition.not;
    throw new Error(`Unsupported condition on ${key}`);
  });
}

const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWMwTpsJAAICATMDms/iAAAAAElFTkSuQmCC', 'base64');
const DRIVER_PROFILE = { id: 'driver-1', name: 'Driver One', type: 'DRIVER', isActive: true };

function harness(initial: any[] = []) {
  let proof = false;
  let rows = new Map<string, any>(initial.map(row => [row.id, structuredClone(row)]));
  let sequences = new Map<string, number>();
  let audits: any[] = [];
  let notices: any[] = [];
  let failAudit = false;
  let nextId = 1;
  let actor: any;
  stub(prisma.user, 'findUnique', async () => actor);
  // One active Logistics account, so driver-needed handoffs have a recipient.
  stub(prisma.user, 'findMany', async ({ where }: any = {}) => (where?.role?.in ?? []).includes('LOGISTICS') ? [{ id: 'logistics-1', name: 'Logistics', email: 'l@example.test',
    role: 'LOGISTICS', isActive: true, authorizationRevision: 1n, permissions: [], permissionOverrides: [], driverProfile: null, permissionConversion: { catalogVersion: 1 } }] : []);
  // RMA dispatch policies, with Logistics transport (assignment) enabled as in rmaDispatch.test.ts.
  stub(prisma.rolePolicy, 'findUnique', async ({ where }: any) => rmaTestPolicy(where.role, true, true));
  stub(prisma.rolePolicy, 'findMany', async ({ where }: any = {}) => (where?.role?.in ?? []).map((role: PolicyRole) => rmaTestPolicy(role, true, true)));
  stub(prisma.driver, 'findUnique', async ({ where }: any) => where.id === DRIVER_PROFILE.id ? { ...DRIVER_PROFILE } : null);
  stub(prisma.driver, 'findFirst', async () => null);
  stub(prisma.company, 'findUnique', async () => ({ id: 'company-1', isActive: true }));
  stub(prisma.accountManager, 'findMany', async () => [{ name: 'Alex AM' }]);
  stub(prisma.deliveryRecord, 'create', async ({ data }: any) => {
    const row = { ...legacyRow(), rmaReceivedAt: null, ...data, recordNo: `RMA-26-${String(nextId).padStart(5, '0')}`, id: data.id ?? `new-${nextId}`,
      company: { name: 'Company' }, createdBy: { name: actor.name }, modifiedBy: { name: actor.name }, lineItems: [], createdAt: new Date(), updatedAt: new Date() };
    nextId++;
    rows.set(row.id, row);
    return structuredClone(row);
  });
  stub(prisma.deliveryRecord, 'findUnique', async ({ where }: any) => rows.has(where.id) ? structuredClone(rows.get(where.id)) : null);
  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => {
    const row = [...rows.values()].find(candidate => matchesRecordWhere(candidate, where));
    return row ? structuredClone(row) : null;
  });
  stub(prisma.deliveryRecord, 'findMany', async ({ where }: any) => [...rows.values()].filter(row => matchesRecordWhere(row, where)).map(row => structuredClone(row)));
  stub(prisma.deliveryRecord, 'update', async ({ where, data }: any) => {
    const current = rows.get(where.id);
    // Mirrors the DeliveryRecord_keep_rma_reference trigger.
    if (data.rmaReference !== undefined && current.rmaReference?.trim() && data.rmaReference !== current.rmaReference) throw new Error('RMA document reference cannot be changed once assigned');
    const row = { ...current, ...data, rmaVersion: data.rmaVersion?.increment ? current.rmaVersion + data.rmaVersion.increment : current.rmaVersion,
      modifiedBy: { name: actor.name }, updatedAt: new Date() };
    rows.set(where.id, row);
    return structuredClone(row);
  });
  stub(prisma.auditLog, 'create', async ({ data }: any) => { if (failAudit) throw new Error('audit unavailable'); audits.push(data); return data; });
  stub(prisma.remarkLog, 'create', async ({ data }: any) => data);
  stub(prisma.notification, 'createMany', async ({ data }: any) => { notices.push(...data); return { count: data.length }; });
  const attachment = () => ({ id: 'proof', recordId: [...rows.keys()].at(-1), storageKey: 'proof.png', originalName: 'proof.png', mimeType: 'image/png', size: photo.length, createdAt: new Date() });
  stub(prisma.podAttachment, 'findMany', async () => proof ? [attachment()] : []);
  stub(prisma.podAttachment, 'findFirst', async () => proof ? attachment() : null);
  stub(podStorage, 'read', async () => photo);
  stub(prisma, '$queryRaw', async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (!strings.join('').includes('"RmaReferenceSequence"')) return [];
    assert.match(strings.join(''), /ON CONFLICT \("prefix", "manilaDate"\)\s+DO UPDATE SET "lastValue" = "RmaReferenceSequence"\."lastValue" \+ 1\s+RETURNING "lastValue"/);
    const key = `${values[0]}|${values[1]}`;
    sequences.set(key, (sequences.get(key) ?? 0) + 1);
    return [{ lastValue: sequences.get(key) }];
  });
  stub(prisma, '$executeRaw', async () => 1);
  let transactions = 0;
  stub(prisma, '$transaction', async (work: any) => {
    transactions++;
    const before = { rows: structuredClone([...rows]), sequences: new Map(sequences), audits: [...audits], notices: [...notices] };
    try { return await work(prisma); } catch (error) {
      rows = new Map(before.rows); sequences = before.sequences; audits = before.audits; notices = before.notices;
      throw error;
    }
  });

  async function request(role: PolicyRole, method: string, path: string, body: any = {}, options: { id?: string; query?: Record<string, string> } = {}) {
    actor = { id: role.toLowerCase(), name: role, email: `${role}@example.test`, role, permissions: [], permissionOverrides: [],
      isActive: true, authorizationRevision: 1n, driverProfile: role === 'DRIVER' ? { ...DRIVER_PROFILE } : null, permissionConversion: { catalogVersion: 1 } };
    const route = [recordsRouter, rmaDispatchRouter].map(router => (router as any).stack
      .find((layer: any) => layer.route?.path === path && layer.route.methods[method])?.route).find(Boolean);
    const req: any = { method: method.toUpperCase(), headers: {}, route, query: options.query ?? {},
      cookies: { mg_session: signToken({ id: actor.id, name: actor.name, email: actor.email, role: actor.role }) },
      params: path.includes(':id') ? { id: options.id ?? 'legacy-rma' } : {}, body };
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
  const create = (extra: Record<string, unknown> = {}, role: PolicyRole = 'TASS') => request(role, 'post', '/', createBody(extra));
  return {
    request, create, row: (id: string) => structuredClone(rows.get(id)), sequences: () => new Map(sequences), audits: () => audits, notices: () => notices,
    failAudit: (value = true) => { failAudit = value; }, transactions: () => transactions, proof: () => { proof = true; },
  };
}

test('Save and Save as Draft both allocate <PREFIX><MMDDYY>-<NN> inside the save transaction', async () => {
  const h = harness();
  const saved = await h.create();
  assert.equal(saved.status, 201);
  assert.equal(saved.body.rma_reference, ref('POS', 1));
  assert.equal(saved.body.reference, ref('POS', 1));
  const draft = await h.create({ is_draft: 'Yes', rma_movement: null });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.is_draft, 'Yes');
  assert.equal(draft.body.rma_reference, ref('POS', 2));
  assert.equal(JSON.parse(h.audits().at(-1).newValue).rma_reference, ref('POS', 2), 'the audit records the allocated reference');
  assert.equal(h.sequences().get(`POS|${manilaToday()}`), 2);
});

test('one daily counter per prefix is shared across movement methods; prefixes count independently', async () => {
  const h = harness();
  const references: string[] = [];
  for (const rma_movement of ['LOGISTICS_TRANSPORT', 'SUPPLIER_COLLECTION', 'INTERNAL_NO_DRIVER']) {
    const created = await h.create({ rma_movement, delivery_date: manilaToday() });
    assert.equal(created.status, 201, rma_movement);
    references.push(created.body.rma_reference);
  }
  assert.deepEqual(references, [ref('POS', 1), ref('POS', 2), ref('POS', 3)]);
  assert.equal((await h.create({ rma_type: 'Return to Customer Slip' })).body.rma_reference, ref('RTC', 1));
  assert.equal((await h.create({ rma_type: 'Receiving Slip' })).body.rma_reference, ref('RR', 1));
  assert.equal((await h.create({ rma_type: 'Transfer Out Slip', is_internal_transfer: true })).body.rma_reference, ref('TXO', 1));
  assert.equal((await h.create({ rma_type: 'Return to Customer' })).body.rma_reference, ref('RTC', 2), 'legacy aliases use the canonical prefix');
  assert.equal((await h.create()).body.rma_reference, ref('POS', 4));
});

test('failed validation and rolled-back saves never consume a number', async () => {
  const h = harness();
  assert.equal((await h.create({ rma_reference: 'POS000000-01' })).status, 400);
  assert.equal((await h.create({ rma_type: 'Others' })).status, 400);
  assert.equal((await h.create({ rma_type: undefined })).status, 400);
  assert.equal((await h.create({ rma_movement: 'LOGISTICS_TRANSPORT' })).status, 400, 'Logistics transport needs a planned date');
  assert.equal(h.sequences().size, 0);
  h.failAudit();
  await assert.rejects(h.create(), /audit unavailable/);
  assert.equal(h.sequences().size, 0, 'the counter rolls back with the record');
  h.failAudit(false);
  assert.equal((await h.create()).body.rma_reference, ref('POS', 1));
});

test('a submitted draft keeps its reference, and references and allocated categories are locked', async () => {
  const h = harness();
  const draft = await h.create({ is_draft: 'Yes' });
  const id = draft.body.id;
  const submitted = await h.request('TASS', 'put', '/:id', { is_draft: 'No', remarks: 'Submit', expected_version: 0 }, { id });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.rma_reference, draft.body.rma_reference);
  assert.equal(h.sequences().get(`POS|${manilaToday()}`), 1, 'never re-allocated');
  for (const [body, message] of [
    [{ rma_reference: 'POS010126-99' }, 'RMA Document Reference is auto-generated and cannot be edited.'],
    [{ rma_reference: '' }, 'RMA Document Reference is auto-generated and cannot be edited.'],
    [{ rma_reference: null }, 'RMA Document Reference is auto-generated and cannot be edited.'],
    [{ rma_type: 'Return to Customer Slip' }, 'Category cannot be changed after a slip reference number has been assigned.'],
  ] as const) {
    const before = h.row(id);
    for (const role of ['TASS'] as const) {
      const rejected = await h.request(role, 'put', '/:id', { ...body, remarks: 'Change slip', expected_version: before.rmaVersion }, { id });
      assert.equal(rejected.status, 400, `${role} ${JSON.stringify(body)}`);
      assert.equal(rejected.body.error, message);
    }
    assert.deepEqual(h.row(id), before);
  }
  // Admin is view-only on RMA (moduleAccessRules), so it can never touch the slip reference either.
  const before = h.row(id);
  const admin = await h.request('ADMIN', 'put', '/:id', { rma_reference: 'POS010126-99', remarks: 'Admin edit', expected_version: before.rmaVersion }, { id });
  assert.equal(admin.status, 403);
  assert.match(admin.body.error, /view-only|denied/i);
  assert.deepEqual(h.row(id), before);
  const echoed = await h.request('TASS', 'put', '/:id', { rma_reference: draft.body.rma_reference, rma_type: 'Pull-Out Slip', area: 'Makati', remarks: 'Echo', expected_version: 1 }, { id });
  assert.equal(echoed.status, 200, 'echoing the stored reference and category is not a change');
  assert.equal(echoed.body.rma_reference, draft.body.rma_reference);
});

test('legacy RMAs keep editing unrelated fields; a legacy row without a reference allocates once it has a slip category', async () => {
  const h = harness([legacyRow(), legacyRow({ id: 'legacy-draft', rmaReference: null, rmaType: null, draft: true })]);
  const edited = await h.request('TASS', 'put', '/:id', { area: 'Makati', rma_type: 'Others', rma_reference: 'LEGACY-REF-1', remarks: 'Fix area', expected_version: 0 });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.rma_type, 'Others');
  assert.equal(edited.body.rma_reference, 'LEGACY-REF-1');
  assert.equal(h.sequences().size, 0);
  assert.equal((await h.request('TASS', 'put', '/:id', { rma_type: 'Sales Orders', remarks: 'Pick retired', expected_version: 1 })).status, 400);
  // A legacy free-text reference never blocks moving onto a canonical slip category.
  const recategorized = await h.request('TASS', 'put', '/:id', { rma_type: 'Return to Supplier Slip', remarks: 'Pick slip', expected_version: 1 });
  assert.equal(recategorized.status, 200);
  assert.equal(recategorized.body.rma_reference, 'LEGACY-REF-1');

  const blocked = await h.request('TASS', 'patch', '/:id/status', { status: 'Scheduled', remarks: 'Submit', expected_version: 0 }, { id: 'legacy-draft' });
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error, /^Category is required/);
  assert.equal((await h.request('TASS', 'put', '/:id', { rma_type: 'Pull Out Slip', remarks: 'Pick slip', expected_version: 0 }, { id: 'legacy-draft' })).body.rma_reference, ref('POS', 1));
  const submitted = await h.request('TASS', 'patch', '/:id/status', { status: 'Scheduled', remarks: 'Submit', expected_version: 1 }, { id: 'legacy-draft' });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.rma_reference, ref('POS', 1));
  assert.equal(h.sequences().get(`POS|${manilaToday()}`), 1);
});

test('a legacy draft without a reference allocates when submitted through the status action', async () => {
  const h = harness([legacyRow({ rmaReference: null, rmaType: 'Pull-Out Slip', draft: true })]);
  const submitted = await h.request('TASS', 'patch', '/:id/status', { status: 'Scheduled', remarks: 'Submit', expected_version: 0 });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.rma_reference, ref('POS', 1));
});

test('TXO non-RMA internal transfers: valid movements, rejected combinations and locked after completion', async () => {
  const h = harness();
  const routed = await h.create({ rma_type: 'Transfer Out Slip', is_internal_transfer: true, rma_movement: 'LOGISTICS_TRANSPORT', delivery_date: manilaToday() });
  assert.equal(routed.status, 201);
  assert.equal(routed.body.is_internal_transfer, true);
  assert.equal(h.row(routed.body.id).isInternalTransfer, true);
  assert.equal(h.notices().at(-1)?.title, 'New internal transfer — driver needed');
  const internal = await h.create({ rma_type: 'TXO', is_internal_transfer: true, rma_movement: 'INTERNAL_NO_DRIVER' });
  assert.equal(internal.status, 201);
  assert.equal((await h.create({ rma_type: 'Transfer Out Slip', is_internal_transfer: true, is_draft: 'Yes', rma_movement: null })).status, 201);
  for (const [extra, message] of [
    [{ rma_type: 'Transfer Out Slip', is_internal_transfer: true, rma_movement: 'SUPPLIER_COLLECTION' }, 'Non-RMA internal transfers must use Logistics transport or Internal / no driver.'],
    [{ rma_type: 'Receiving Slip', is_internal_transfer: true }, 'Non-RMA internal transfer is only supported for Transfer Out Slip (TXO) records.'],
    [{ rma_type: 'Transfer Out Slip', is_internal_transfer: 1 }, 'is_internal_transfer must be true or false.'],
    [{ category: 'Deliveries', reference: 'SAP-1', delivery_date: manilaToday(), is_internal_transfer: true }, 'Non-RMA internal transfer flag only applies to Transfer Out Slip (TXO) records.'],
  ] as const) {
    const rejected = await h.request(extra.category ? 'SALES_COORDINATOR' : 'TASS', 'post', '/', createBody(extra));
    assert.equal(rejected.status, 400, JSON.stringify(extra));
    assert.equal(rejected.body.error, message);
  }
  // Editing: switching the movement to supplier collection or the category away from TXO is rejected under the lock.
  const id = internal.body.id;
  assert.equal((await h.request('TASS', 'put', '/:id', { rma_movement: 'SUPPLIER_COLLECTION', remarks: 'Move', expected_version: 0 }, { id })).status, 400);
  const cleared = await h.request('TASS', 'put', '/:id', { is_internal_transfer: false, remarks: 'Regular RMA after all', expected_version: 0 }, { id });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.is_internal_transfer, false);
  // Completed transfers keep their classification.
  const done = harness([legacyRow({ id: 'done', rmaType: 'Transfer Out Slip', rmaReference: ref('TXO', 9), status: 'ACCOMPLISHED', isInternalTransfer: true })]);
  const locked = await done.request('TASS', 'put', '/:id', { is_internal_transfer: false, remarks: 'Reclassify', expected_version: 0 }, { id: 'done' });
  assert.equal(locked.status, 400);
  assert.equal(locked.body.error, 'Internal transfer classification cannot be changed after completion.');
});

test('is_internal_transfer is an allowed V1 mutation field and a projected business audit field', async () => {
  assert.equal(recordMutationInputError({ is_internal_transfer: true, remarks: 'x' }, '/:id', 'PUT'), null);
  assert.equal(recordMutationInputError({ ...createBody({ is_internal_transfer: true }) }, '/', 'POST'), null);
  const audit = safeBusinessAudit('DeliveryRecord', JSON.stringify({ is_internal_transfer: true, rma_type: 'Transfer Out Slip', secret: 'x' }));
  assert.equal(audit?.is_internal_transfer, true);
  assert.equal(audit && 'secret' in audit, false);
});

test('GET /records filters by rma_scope, rma_type (with legacy aliases) and rma_movement, rejecting invalid values', async () => {
  const h = harness([
    legacyRow({ id: 'pos-legacy', rmaType: 'Pull-Out Slip', rmaMovement: 'LOGISTICS_TRANSPORT' }),
    legacyRow({ id: 'pos', rmaType: 'Pull Out Slip', rmaMovement: 'INTERNAL_NO_DRIVER' }),
    legacyRow({ id: 'txo', rmaType: 'Transfer Out Slip', isInternalTransfer: true, rmaMovement: 'LOGISTICS_TRANSPORT' }),
    legacyRow({ id: 'rtc', rmaType: 'Return to Customer Slip', rmaMovement: 'SUPPLIER_COLLECTION' }),
  ]);
  const ids = async (query: Record<string, string>) => {
    const response = await h.request('TASS', 'get', '/', undefined, { query: { category: 'RMA', ...query } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.map((row: any) => row.id).sort();
  };
  assert.deepEqual(await ids({}), ['pos', 'pos-legacy', 'rtc', 'txo']);
  assert.deepEqual(await ids({ rma_scope: 'all' }), ['pos', 'pos-legacy', 'rtc', 'txo']);
  assert.deepEqual(await ids({ rma_scope: 'rma' }), ['pos', 'pos-legacy', 'rtc']);
  assert.deepEqual(await ids({ rma_scope: 'internal_transfer' }), ['txo']);
  assert.deepEqual(await ids({ rma_type: 'Pull Out Slip' }), ['pos', 'pos-legacy']);
  assert.deepEqual(await ids({ rma_type: 'POS' }), ['pos', 'pos-legacy']);
  assert.deepEqual(await ids({ rma_movement: 'LOGISTICS_TRANSPORT' }), ['pos-legacy', 'txo']);
  assert.deepEqual(await ids({ rma_scope: 'rma', rma_movement: 'LOGISTICS_TRANSPORT' }), ['pos-legacy']);
  for (const query of [{ rma_scope: 'rmas' }, { rma_type: 'Others' }, { rma_type: 'RESCH' }, { rma_movement: 'TELEPORT' }]) {
    const response = await h.request('TASS', 'get', '/', undefined, { query: { category: 'RMA', ...query } });
    assert.equal(response.status, 400, JSON.stringify(query));
  }
});

test('the sidebar active-counts query leaves non-RMA internal transfers out of the RMA badge', async () => {
  const h = harness();
  let where: any;
  stub(prisma.deliveryRecord, 'groupBy', async (query: any) => { where = query.where; return []; });
  const response = await h.request('TASS', 'get', '/active-counts');
  assert.equal(response.status, 200);
  assert.deepEqual(where.NOT, { category: 'RMA', isInternalTransfer: true });
  assert.equal(matchesRecordWhere({ category: 'RMA', isInternalTransfer: true }, { NOT: where.NOT }), false);
  assert.equal(matchesRecordWhere({ category: 'RMA', isInternalTransfer: false }, { NOT: where.NOT }), true);
});

for (const mode of ['LEGACY', 'V1'] as const) {
  test(`${mode}: a TXO non-RMA internal transfer runs the full Logistics → Driver → TASS lifecycle outside RMA KPIs`, async t => {
    const previousMode = process.env.PERMISSION_MODE;
    process.env.PERMISSION_MODE = mode;
    t.after(() => { if (previousMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = previousMode; });
    const h = harness();
    const today = manilaToday();
    const listIds = async (role: PolicyRole, dashboard_filter: string) => {
      const response = await h.request(role, 'get', '/', undefined, { query: { category: 'RMA', dashboard_filter } });
      assert.equal(response.status, 200, `${role} ${dashboard_filter}: ${JSON.stringify(response.body)}`);
      return response.body.map((row: any) => row.id);
    };

    // The session really runs in the requested mode: only V1 applies the record mutation whitelist.
    const probe = await h.create({ rma_type: 'Pull Out Slip', unknown_probe_field: 'x' });
    if (mode === 'V1') assert.deepEqual([probe.status, probe.body.error], [400, 'Unsupported record mutation fields']);
    else assert.equal(probe.status, 201);

    // 1. TASS creates a routed Transfer Out Slip internal transfer.
    const created = await h.create({ rma_type: 'Transfer Out Slip', is_internal_transfer: true, rma_movement: 'LOGISTICS_TRANSPORT', delivery_date: today, remarks: 'BDO unit to Paragon' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.id;
    const reference = created.body.rma_reference;
    assert.match(reference, /^TXO\d{6}-01$/);
    assert.equal(created.body.is_internal_transfer, true);
    assert.equal(created.body.rma_transport_status, 'PENDING');
    assert.equal(h.notices().at(-1)?.title, 'New internal transfer — driver needed');

    // 2. Logistics sees the transport request; TASS Open RMA leaves it out.
    assert.ok((await listIds('LOGISTICS', 'log-transport-requests')).includes(id));
    assert.equal((await listIds('TASS', 'tass-open-rma')).includes(id), false);

    // 3. Logistics assigns the linked Driver profile.
    const assigned = await h.request('LOGISTICS', 'patch', '/:id/rma-assignment', { driver_id: 'driver-1', vehicle: 'Van-01 (L300)', expected_version: 0, remarks: 'Route to Paragon' }, { id });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
    assert.equal(assigned.body.driver_id, 'driver-1');
    assert.equal(assigned.body.rma_version, 1);

    // 4. The Driver starts transport: on the road for Logistics, still not TASS RMA in-transit.
    const started = await h.request('DRIVER', 'patch', '/:id/rma-transport', { transport_status: 'IN_TRANSIT', expected_version: 1, remarks: 'Leaving warehouse' }, { id });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(started.body.rma_transport_status, 'IN_TRANSIT');
    assert.equal(started.body.rma_version, 2);
    assert.equal((await listIds('TASS', 'tass-rma-in-transit')).includes(id), false);
    assert.equal(evaluateWhere(h.row(id), driversInTransitFilter(today)), true, 'drivers in transit includes the transfer');

    // 5. The Driver completes transport with verified proof and the receiver's name.
    h.proof();
    const delivered = await h.request('DRIVER', 'patch', '/:id/rma-transport', { transport_status: 'COMPLETED', expected_version: 2, received_by: 'Paragon Guard', remarks: 'Handed over' }, { id });
    assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
    assert.equal(delivered.body.rma_transport_status, 'COMPLETED');
    assert.equal(delivered.body.rma_transport_received_by, 'Paragon Guard');
    assert.equal(delivered.body.status, 'Scheduled');
    assert.equal(delivered.body.rma_version, 3);

    // 6. TASS confirms physical receipt without a recipient, with an editable date.
    const received = await h.request('TASS', 'post', '/:id/rma-receipt', { received_at: today, expected_version: 3, remarks: 'Signed slip returned' }, { id });
    assert.equal(received.status, 200, JSON.stringify(received.body));
    assert.ok(received.body.rma_received_at);
    assert.equal(received.body.rma_recipient, null);
    assert.equal(received.body.rma_version, 4);

    // 7. TASS records final completion.
    const completed = await h.request('TASS', 'patch', '/:id/status', { status: 'Delivered', completed_at: today, expected_version: 4, remarks: 'Transfer complete' }, { id });
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    assert.equal(completed.body.status, 'Delivered');
    assert.ok(completed.body.rma_completed_at);
    assert.equal(completed.body.is_internal_transfer, true);
    assert.equal(completed.body.rma_reference, reference);
    assert.equal(completed.body.rma_version, 5);

    // 8. Classification and reference stay locked after completion.
    const reclassify = await h.request('TASS', 'put', '/:id', { is_internal_transfer: false, expected_version: 5, remarks: 'Reclassify' }, { id });
    assert.equal(reclassify.status, 400);
    assert.equal(reclassify.body.error, 'Internal transfer classification cannot be changed after completion.');
    const rename = await h.request('TASS', 'put', '/:id', { rma_reference: 'TXO010126-99', expected_version: 5, remarks: 'Rename' }, { id });
    assert.equal(rename.status, 400);
    assert.equal(rename.body.error, 'RMA Document Reference is auto-generated and cannot be edited.');
    assert.equal(h.row(id).rmaReference, reference);
    assert.equal(h.row(id).isInternalTransfer, true);
  });
}
