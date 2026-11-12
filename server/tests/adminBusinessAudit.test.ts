import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { prisma } from '../src/db';
import { safeBusinessAudit, visibleBusinessAuditSnapshots } from '../src/services/businessAudit';
import { accountMetadataVersion, getUserPermissionEditor, mutateAdminAccount, PolicyManagementError, safePolicyAudit } from '../src/services/permissionManagement';
import { evaluatePermissions } from '../src/services/permissionEvaluator';
import { permissionSession } from '../src/services/sessionPermissions';
import { sessionUser } from '../src/services/permissions';
import { defaultRolePermissions, POLICY_ROLES } from '../src/services/permissionCatalog';
import { planPermissionConversion } from '../src/services/permissionBackfill';
import type { AuthUser } from '../src/middleware/auth';
import adminRoutes from '../src/routes/admin';
import userRoutes from '../src/routes/users';
const actor = () => ({ id: 'admin', role: 'ADMIN', name: 'Admin', email: 'admin@example.test', isActive: true, permissions: [],
  permissionOverrides: [], authorizationRevision: 1n, driverProfile: null, permissionConversion: { catalogVersion: 1 } });
const user = () => sessionUser(actor()) as AuthUser;

test('business projections preserve useful values and omit relations, storage and identity secrets', () => {
  assert.deepEqual(safeBusinessAudit('DeliveryRecord', JSON.stringify({ reference: 'REF', company_name: 'Client', status: 'Delivered', password: 'secret',
    linked_collection: { reference: 'private' }, linked_collection_id: 'private', storageKey: 'private', line_items: [{ sku: 'SKU', quantity: 2, token: 'secret' }] })),
    { company_name: 'Client', reference: 'REF', status: 'Delivered', line_items: [{ sku: 'SKU', quantity: 2 }] });
  assert.deepEqual(safeBusinessAudit('Customer', '{"name":"Client","contact_person":"Contact","token":"secret"}'), { name: 'Client', contact_person: 'Contact' });
  assert.deepEqual(safeBusinessAudit('SKU', '{"sku_code":"SKU","unit_price":50,"inventory":{"on_hand_qty":12,"productId":"private"}}'), { sku_code: 'SKU', unit_price: 50, inventory_on_hand_qty: 12 });
  assert.equal(safeBusinessAudit('Unknown', '{}'), null); assert.equal(safeBusinessAudit('Driver', '{broken'), null); assert.equal(safeBusinessAudit('Driver', '[]'), null);
});

test('historic business values require current record and resource access', async t => {
  const old = prisma.deliveryRecord.findMany; let query: any;
  prisma.deliveryRecord.findMany = mock.fn(async args => { query = args; return [{ id: 'visible' }]; }) as any;
  t.after(() => { prisma.deliveryRecord.findMany = old; });
  const entries = ['visible', 'denied'].map(recordId => ({ recordId, recordType: 'DeliveryRecord', previousValue: '{"reference":"Before"}', newValue: '{"reference":"After","linked_collection":{"reference":"secret"}}' }));
  const result = await visibleBusinessAuditSnapshots(entries, user());
  assert.deepEqual(query.where.id.in, ['visible', 'denied']); assert.equal(query.where.deletedAt, null); assert.ok(query.where.AND[0].category.in.includes('DELIVERY'));
  assert.deepEqual(result, [{ previous: { reference: 'Before' }, next: { reference: 'After' } }, { previous: null, next: null }]);
  assert.deepEqual(await visibleBusinessAuditSnapshots([{ recordId: 'customer', recordType: 'Customer', previousValue: null, newValue: '{"name":"secret"}' }], { ...user(), resources: [] }), [{ previous: null, next: null }]);
  const source = actor();
  const snapshot = evaluatePermissions({ userId: source.id, role: 'ADMIN', isActive: true, authorizationRevision: 1n,
    rolePolicy: { role: 'ADMIN', revision: 1n, catalogVersion: 1, permissions: [...defaultRolePermissions('ADMIN')].map(([permissionKey, effect]) => ({ permissionKey, effect })) },
    overrides: [{ permissionKey: 'RESOURCE:customers:READ', effect: 'DENY' }], driverProfile: null });
  const current = permissionSession(source, snapshot) as AuthUser;
  assert.deepEqual(await visibleBusinessAuditSnapshots([{ recordId: 'customer', recordType: 'Customer', previousValue: null, newValue: '{"name":"secret"}' }], current), [{ previous: null, next: null }]);
});

test('Admin audit endpoint returns authorized business before/after values', async t => {
  const oldMany = prisma.auditLog.findMany, oldCount = prisma.auditLog.count, oldRecords = prisma.deliveryRecord.findMany;
  t.after(() => { prisma.auditLog.findMany = oldMany; prisma.auditLog.count = oldCount; prisma.deliveryRecord.findMany = oldRecords; });
  prisma.auditLog.findMany = mock.fn(async () => [{ id: 'audit', recordId: 'delivery', recordType: 'DeliveryRecord', action: 'UPDATE', changedBy: { name: 'Editor' }, changedById: 'editor', timestamp: new Date(), previousValue: '{"reference":"Before"}', newValue: '{"reference":"After","password":"secret"}' }]) as any;
  prisma.auditLog.count = mock.fn(async () => 1) as any; prisma.deliveryRecord.findMany = mock.fn(async () => [{ id: 'delivery' }]) as any;
  const route = (adminRoutes as any).stack.find((layer: any) => layer.route?.path === '/audit-log').route; let output: any;
  await route.stack.at(-1).handle({ user: user(), query: {} }, { json(value: any) { output = value; } });
  assert.deepEqual(output.entries[0].previous, { reference: 'Before' }); assert.deepEqual(output.entries[0].next, { reference: 'After' }); assert.doesNotMatch(JSON.stringify(output), /secret/);
});

for (const mode of ['LEGACY', 'V1']) test(`${mode}: identity edits are audited and stale metadata forms conflict`, async t => {
  const oldMode = process.env.PERMISSION_MODE; process.env.PERMISSION_MODE = mode;
  t.after(() => { if (oldMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = oldMode; });
  const users = new Map<string, any>([['admin', actor()], ['target', { ...actor(), id: 'target', role: 'SALES_COORDINATOR', name: 'Before', email: 'before@example.test', permissionConversion: mode === 'V1' ? { catalogVersion: 1 } : null }]]);
  const logs: any[] = [];
  const tx: any = { $executeRaw: async () => 0, $queryRaw: async () => [], user: { findUnique: async ({ where }: any) => structuredClone(users.get(where.id)), update: async ({ where, data }: any) => { const value = users.get(where.id); Object.assign(value, data); return structuredClone(value); } },
    rolePolicy: { findUnique: async ({ where }: any) => ({ role: where.role, revision: 1n, catalogVersion: 1, permissions: [...defaultRolePermissions(where.role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) }) },
    auditLog: { create: async ({ data }: any) => { logs.push(data); return data; } } };
  const db: any = { $transaction: async (work: any) => work(tx) }; const editor = await getUserPermissionEditor(db, 'admin', 'target');
  const body = { ...(mode === 'V1' ? { contractVersion: 1, expectedVersion: editor.expectedVersion } : {}), expectedMetadataVersion: accountMetadataVersion(users.get('target')) };
  let writes = 0;
  await mutateAdminAccount(db, 'admin', 'target', body, async client => { writes++; return client.user.update({ where: { id: 'target' }, data: { name: 'After', email: 'after@example.test' } }); }, { metadata: true });
  const before = JSON.parse(logs[0].previousValue), after = JSON.parse(logs[0].newValue);
  assert.equal(before.name, 'Before'); assert.equal(before.email, 'before@example.test'); assert.equal(after.name, 'After'); assert.equal(after.email, 'after@example.test');
  assert.deepEqual(safePolicyAudit('UserAuthorization', logs[0].newValue), after);
  const current = await getUserPermissionEditor(db, 'admin', 'target'); assert.notEqual(current.expectedVersion, editor.expectedVersion);
  const stale = { ...body, ...(mode === 'V1' ? { expectedVersion: current.expectedVersion } : {}) };
  const write = async () => { writes++; return {}; }; const conflict = (error: unknown) => error instanceof PolicyManagementError && error.status === 409;
  await assert.rejects(mutateAdminAccount(db, 'admin', 'target', stale, write, { metadata: true }), conflict);
  await assert.rejects(mutateAdminAccount(db, 'admin', 'target', { ...stale, expectedMetadataVersion: undefined }, write, { metadata: true }), conflict);
  assert.equal(writes, 1); assert.equal(logs.length, 1); assert.equal(users.get('target').email, 'after@example.test');
});

test('account metadata response uses the final revision after legacy conversion rewrites overrides', async t => {
  const oldMode = process.env.PERMISSION_MODE; process.env.PERMISSION_MODE = 'LEGACY';
  t.after(() => { if (oldMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = oldMode; });
  let target: any = { ...actor(), id: 'target', role: 'SALES_COORDINATOR',
    permissions: [{ id: 'deny-deliveries', screen: 'deliveries', granted: false }] };
  const plan = planPermissionConversion(target);
  target.permissionConversion = { catalogVersion: 1, sourceHash: plan.sourceHash };
  target.permissionOverrides = plan.overrides.map(row => ({ ...row, source: 'LEGACY_V1' }));
  const policies = POLICY_ROLES.map(role => ({ role, revision: 1n, catalogVersion: 1,
    permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) }));
  let immediateToken = '';
  const tx: any = {
    $executeRaw: async () => 0, $queryRaw: async () => [],
    user: {
      findUnique: async ({ where }: any) => structuredClone(where.id === 'admin' ? actor() : target),
      update: async ({ data }: any) => {
        target = { ...target, ...data, authorizationRevision: target.authorizationRevision + (data.role !== target.role ? 1n : 0n) };
        immediateToken = accountMetadataVersion(target); return structuredClone(target);
      },
    },
    rolePolicy: { findMany: async () => policies },
    userPermissionOverride: {
      deleteMany: async () => { target.permissionOverrides = []; target.authorizationRevision++; },
      createMany: async ({ data }: any) => { target.permissionOverrides = data; target.authorizationRevision++; },
    },
    permissionConversion: { update: async ({ data }: any) => { target.permissionConversion = { ...target.permissionConversion, ...data }; } },
    auditLog: { create: async () => ({}) },
  };
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = mock.fn(async (work: any) => work(tx)) as any;
  t.after(() => { prisma.$transaction = originalTransaction; });
  const route = (userRoutes as any).stack.find((layer: any) => layer.route?.path === '/:id' && layer.route.methods.patch).route;
  let output: any;
  const response: any = { status(code: number) { assert.equal(code, 200); return response; }, json(value: any) { output = value; return response; } };
  await route.stack.at(-1).handle({ user: user(), params: { id: 'target' }, body: { role: 'LOGISTICS', expectedMetadataVersion: accountMetadataVersion(target) } }, response);
  assert.equal(output.role, 'LOGISTICS');
  assert.notEqual(output.metadata_version, immediateToken, 'conversion triggers advanced the revision after the initial account update');
  assert.equal(output.metadata_version, accountMetadataVersion(target));
  await route.stack.at(-1).handle({ user: user(), params: { id: 'target' }, body: { name: 'Second edit', expectedMetadataVersion: output.metadata_version } }, response);
  assert.equal(output.name, 'Second edit', 'the returned version can be used immediately for the next edit');
});
