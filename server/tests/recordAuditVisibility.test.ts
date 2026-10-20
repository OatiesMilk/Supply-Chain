import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import recordsRoutes from '../src/routes/records';
import transactionsRoutes from '../src/routes/transactions';
import { signToken } from '../src/middleware/auth';

const restores: Array<() => void> = [];
function stub(target: any, key: string, handler: (...args: any[]) => any) {
  const original = target[key];
  const replacement = mock.fn(handler);
  target[key] = replacement;
  restores.push(() => { target[key] = original; });
  return replacement;
}
afterEach(() => { while (restores.length) restores.pop()!(); });

// Evaluate the actual Prisma predicates so omitted scoping makes the tests fail.
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(part => matches(row, part));
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
    return row[key] === value;
  });
}

// Invoke all real route middleware, including cookie auth, without a dev server.
async function read(router: any, path: string, account: any) {
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods.get).route;
  const req: any = { method: 'GET', params: { id: 'delivery', source: 'delivery' }, query: {}, cookies: { mg_session: signToken(account) } };
  let status = 200;
  let body: any;
  const res: any = { setHeader() {}, clearCookie() {}, status(value: number) { status = value; return this; }, json(value: any) { body = value; return this; } };
  for (const layer of route.stack) {
    let advance = false;
    await layer.handle(req, res, (error?: Error) => { if (error) throw error; advance = true; });
    if (!advance) break;
  }
  return { status, body };
}

for (const [name, router, path] of [
  ['records audit', recordsRoutes, '/:id/audit'],
  ['transaction timeline', transactionsRoutes, '/:source/:id'],
] as const) {
  test(`${name} redacts both snapshots using current scope and preserves immutable evidence`, async () => {
    let account: any = {
      id: 'login', name: 'Driver One', email: 'one@example.com', role: 'DRIVER', isActive: true,
      permissions: [], driverProfile: { id: 'profile-one', type: 'DRIVER' },
    };
    const row = (id: string, driverId = 'profile-one', extra = {}) => ({
      id, category: 'ACCOUNTING_COLLECTION', driverId, draft: false, deletedAt: null, ...extra,
    });
    const parent = row('delivery', 'profile-one', { category: 'DELIVERY', company: { name: 'Delivery customer' } });
    const targets = [row('own'), row('other', 'profile-two'), row('unassigned', null as any), row('deleted', 'profile-one', { deletedAt: new Date() }), row('draft', 'profile-one', { draft: true })];
    const snapshot = (id: string) => ({ reference: 'DELIVERY-REF', linked_collection_id: id, linked_collection: { id, reference: `SECRET-${id}`, company_name: 'Collection customer' } });
    const pairs = [
      [snapshot('other'), snapshot('own')],
      [snapshot('deleted'), snapshot('missing')],
      [snapshot('unassigned'), snapshot('draft')],
      [{ linked_collection: { reference: 'NO-ID-SECRET' } }, { linked_collection_id: 'own', linked_collection: { id: 'other', reference: 'CONFLICT-SECRET' } }],
      [{ linkedCollectionId: 'other', linkedCollection: { id: 'other', reference: 'LEGACY-SECRET', driverId: 'profile-one' } }, { linkedCollectionId: 'own', linkedCollection: { id: 'own', reference: 'LEGACY-OWN' } }],
      [{ attachment_uploaded: null }, { attachment_removed: 'attachment-1' }],
    ];
    const entries = pairs.map(([previous, next], index) => Object.freeze({
      id: `audit-${index}`, recordId: 'delivery', action: 'UPDATE', changedBy: { name: 'Editor' }, timestamp: new Date(),
      previousValue: JSON.stringify(previous), newValue: JSON.stringify(next),
    }));
    const storedEvidence = JSON.stringify(entries);
    stub(prisma.user, 'findUnique', async () => account);
    stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => matches(parent, where) ? parent : null);
    const reads = stub(prisma.deliveryRecord, 'findMany', async ({ where }: any) => targets.filter(target => matches(target, where)));
    stub(prisma.auditLog, 'findMany', async () => entries);
    const history = (body: any) => path === '/:id/audit' ? body : body.timeline;
    const initial = await read(router, path, account);
    assert.equal(initial.status, 200);
    const result = history(initial.body);
    assert.equal(result[0].previous_value.linked_collection_id, null);
    assert.equal(result[0].previous_value.linked_collection, null);
    assert.deepEqual(result[0].new_value, pairs[0][1], 'Readable historical detail is preserved');
    for (const index of [1, 2, 3]) for (const key of ['previous_value', 'new_value']) {
      assert.equal(result[index][key].linked_collection, null);
      if ('linked_collection_id' in result[index][key]) assert.equal(result[index][key].linked_collection_id, null);
    }
    assert.equal(result[4].previous_value.linkedCollection, null);
    assert.equal(result[4].previous_value.linkedCollectionId, null);
    assert.deepEqual(result[4].new_value, pairs[4][1]);
    assert.deepEqual(result[5].previous_value, pairs[5][0]);
    assert.deepEqual(result[5].new_value, pairs[5][1]);
    assert.equal(reads.mock.callCount(), 1, 'All links in both snapshots use one batched query');
    assert.equal(JSON.stringify(entries), storedEvidence, 'Stored audit snapshots are never rewritten');

    // Reassignment revokes historical access, despite the old embedded owner.
    targets[0].driverId = 'profile-two';
    const reassigned = history((await read(router, path, account)).body);
    assert.equal(reassigned[0].new_value.linked_collection_id, null);
    assert.equal(reassigned[4].new_value.linkedCollection, null);
    targets[0].driverId = 'profile-one';

    // Current permissions are reloaded for the same signed cookie on every read.
    account.permissions = [{ screen: 'accounting_collection', granted: false }];
    const revoked = history((await read(router, path, account)).body);
    assert.equal(revoked[0].new_value.linked_collection, null);
    assert.equal(revoked[0].new_value.linked_collection_id, null);
    assert.equal(revoked[4].new_value.linkedCollection, null);

    account = { ...account, role: 'SALES_COORDINATOR', driverProfile: null, permissions: [{ screen: 'accounting_collection', granted: false }] };
    const deniedCategory = await read(router, path, account);
    assert.equal(deniedCategory.status, 200);
    assert.equal(history(deniedCategory.body)[0].new_value.linked_collection, null);

    // No linked Driver profile means the parent and its audit history are denied.
    account = { ...account, role: 'DRIVER', driverProfile: null, permissions: [] };
    assert.equal((await read(router, path, account)).status, 403);
    assert.equal(JSON.stringify(entries), storedEvidence);
  });
}
