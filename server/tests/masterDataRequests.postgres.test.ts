import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../src/middleware/auth';
import type { PolicyRole } from '../src/services/permissionCatalog';

// Feature 4b against a real disposable PostgreSQL database (SEED_TEST_DATABASE_URL):
// migration idempotency and rollback, RLS, CHECK constraints, the partial unique
// index, a concurrent double approval, transaction rollback and V1 visibility SQL.

// Provider isolation BEFORE any application module loads: src/db.ts runs
// dotenv.config(), which never overrides an already-defined key, so provider
// keys are blanked to '' (never deleted) and server/.env cannot rehydrate them.
const ISOLATED_PROVIDER_KEYS = [
  'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'AZURE_REDIRECT_URI',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET', 'SUPABASE_SIGNATURE_BUCKET',
  'NOTION_API_KEY', 'BILLING_NOTIFICATION_USER_EMAIL',
] as const;
function blankProviderEnv() {
  for (const key of Object.keys(process.env)) {
    if (/^(AZURE_|SMTP_|SUPABASE_|NOTION_|BILLING_NOTIFICATION_)/.test(key)) process.env[key] = '';
  }
  for (const key of ISOLATED_PROVIDER_KEYS) process.env[key] = '';
}
blankProviderEnv();

async function importAppModules() {
  blankProviderEnv();
  const [db, backfill, visibility, auditVisibility, service, catalog, evaluator, auth, suppliers] = await Promise.all([
    import('../src/db'),
    import('../src/services/permissionBackfill'),
    import('../src/services/notificationVisibility'),
    import('../src/services/auditVisibility'),
    import('../src/services/masterDataRequests'),
    import('../src/services/permissionCatalog'),
    import('../src/services/permissionEvaluator'),
    import('../src/middleware/auth'),
    import('../src/routes/suppliers'),
  ]);
  return { prisma: db.prisma, backfill, visibility, auditVisibility, service, catalog, evaluator, signToken: auth.signToken, suppliersRoutes: suppliers.default };
}
type AppModules = Awaited<ReturnType<typeof importAppModules>>;
let m: AppModules;
let prisma: AppModules['prisma'];
before(async () => {
  if (!process.env.SEED_TEST_DATABASE_URL) return; // skipped file: never load the app against a configured DB
  m = await importAppModules();
  prisma = m.prisma;
});

const target = process.env.SEED_TEST_DATABASE_URL;
const options = { skip: !target, timeout: 120_000 };
const MIGRATION = path.join(__dirname, '../prisma/migrations/20261125180000_master_data_addition_requests/migration.sql');
const userIds = ['f4b-tass', 'f4b-tass-two', 'f4b-admin', 'f4b-admin-two'];
const PREFIX = 'F4B PG';

async function guard() {
  assert.equal(process.env.DATABASE_URL, target);
  m.backfill.assertPermissionBackfillTarget({ DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: new URL(target!).pathname.slice(1) });
}
function migrationStatements() {
  return fs.readFileSync(MIGRATION, 'utf8').split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
    .split(';').map(statement => statement.trim()).filter(statement => statement && !/^(BEGIN|COMMIT)$/i.test(statement));
}
const tableExists = async () => (await prisma.$queryRaw<{ exists: boolean }[]>`SELECT to_regclass('public."MasterDataAdditionRequest"') IS NOT NULL AS exists`)[0].exists;
async function cleanup() {
  if (await tableExists()) {
    await prisma.masterDataAdditionRequest.deleteMany({ where: { requestedById: { in: userIds } } });
  }
  await prisma.auditLog.deleteMany({ where: { changedById: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.companySapNumber.deleteMany({ where: { company: { name: { startsWith: PREFIX } } } });
  await prisma.companyAccountManager.deleteMany({ where: { company: { name: { startsWith: PREFIX } } } });
  await prisma.company.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.supplierCategoryAssignment.deleteMany({ where: { supplier: { name: { startsWith: PREFIX } } } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.accountManager.deleteMany({ where: { id: 'f4b-am' } });
  await prisma.userPermission.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
async function fixtures() {
  await cleanup();
  for (const [id, role, name] of [['f4b-tass', 'TASS', 'F4B Roselyn'], ['f4b-tass-two', 'TASS', 'F4B Abigail'], ['f4b-admin', 'ADMIN', 'F4B Admin'], ['f4b-admin-two', 'ADMIN', 'F4B Admin Two']]) {
    await prisma.user.create({ data: { id, name, email: `${id}@example.test`, password: 'x', role } });
  }
  // LEGACY RMA writes need the role policy; initialization is idempotent and keeps existing policies.
  await m.backfill.initializePermissionFoundation(prisma, 'f4b-admin');
  await prisma.accountManager.create({ data: { id: 'f4b-am', name: 'F4B Leanne Pavoreal', normalizedName: 'f4b leanne pavoreal' } });
}
const row = (overrides: Record<string, unknown> = {}) => ({
  entityType: 'COMPANY', name: `${PREFIX} Check`, normalizedName: `${PREFIX.toLowerCase()} check ${Math.random().toString(36).slice(2)}`, requestedById: 'f4b-tass', ...overrides,
}) as Prisma.MasterDataAdditionRequestUncheckedCreateInput;
/** Rejected by one of the named constraints (PostgreSQL reports the first failing CHECK in name order). */
const rejects = async (work: Promise<unknown>, ...constraints: string[]) => {
  await assert.rejects(work, (error: any) => constraints.some(constraint => String(error?.message ?? '').includes(constraint)
    || JSON.stringify(error?.meta ?? {}).includes(constraint)), constraints.join(' | '));
};
const withMode = async <T>(mode: 'LEGACY' | 'V1', work: () => Promise<T>) => {
  const previous = process.env.PERMISSION_MODE;
  process.env.PERMISSION_MODE = mode;
  try { return await work(); } finally { if (previous === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = previous; }
};
/** A V1 session from the shipped role defaults plus DENY overrides (no stored conversion needed). */
function v1Session(id: string, role: PolicyRole, deny: string[] = []): AuthUser {
  const snapshot = m.evaluator.evaluatePermissions({ userId: id, role, isActive: true, authorizationRevision: 1n, driverProfile: null,
    rolePolicy: { role, revision: 1n, catalogVersion: 1, permissions: [...m.catalog.defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ role, permissionKey, effect })) } as any,
    overrides: deny.map(permissionKey => ({ userId: id, permissionKey, effect: 'DENY' })) as any });
  return { id, name: id, email: `${id}@example.test`, role, permissions: [], effectiveScreens: snapshot.effectiveScreens, resources: snapshot.resources,
    permissionVersion: 'test', activeMode: 'V1', snapshot } as unknown as AuthUser;
}

test('migration creates MasterDataAdditionRequest with constraints, indexes, foreign keys and RLS', options, async () => {
  await guard();
  const constraints = (await prisma.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint WHERE conrelid = '"MasterDataAdditionRequest"'::regclass`).map(r => r.conname).sort();
  assert.deepEqual(constraints, ['MasterDataAdditionRequest_createdCompanyId_fkey', 'MasterDataAdditionRequest_createdSupplierId_fkey',
    'MasterDataAdditionRequest_entityType_check', 'MasterDataAdditionRequest_entity_arrays_check', 'MasterDataAdditionRequest_entity_link_check',
    'MasterDataAdditionRequest_lifecycle_check', 'MasterDataAdditionRequest_name_nonblank_check', 'MasterDataAdditionRequest_pkey',
    'MasterDataAdditionRequest_requestedById_fkey', 'MasterDataAdditionRequest_reviewedById_fkey', 'MasterDataAdditionRequest_status_check',
    'MasterDataAdditionRequest_version_check']);
  const indexes = (await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'MasterDataAdditionRequest'`);
  for (const name of ['MasterDataAdditionRequest_status_createdAt_idx', 'MasterDataAdditionRequest_requestedById_createdAt_idx',
    'MasterDataAdditionRequest_entityType_status_createdAt_idx', 'MasterDataAdditionRequest_reviewedById_idx',
    'MasterDataAdditionRequest_createdCompanyId_idx', 'MasterDataAdditionRequest_createdSupplierId_idx']) assert.ok(indexes.some(i => i.indexname === name), name);
  const partial = indexes.find(i => i.indexname === 'MasterDataAdditionRequest_pending_entity_name_key');
  assert.match(partial!.indexdef, /UNIQUE INDEX .*\("entityType", "normalizedName"\) WHERE \(status = 'PENDING'::text\)/);
  const [rls] = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'MasterDataAdditionRequest' AND relkind = 'r'`;
  assert.equal(rls.relrowsecurity, true);
  const deletes = await prisma.$queryRaw<{ conname: string; confdeltype: string }[]>`
    SELECT conname, confdeltype::text AS confdeltype FROM pg_constraint WHERE conrelid = '"MasterDataAdditionRequest"'::regclass AND contype = 'f' ORDER BY conname`;
  assert.deepEqual(deletes.map(d => [d.conname.replace('MasterDataAdditionRequest_', ''), d.confdeltype]),
    [['createdCompanyId_fkey', 'n'], ['createdSupplierId_fkey', 'n'], ['requestedById_fkey', 'r'], ['reviewedById_fkey', 'n']]);
});

test('CHECK constraints and the pending partial unique index reject invalid rows', options, async () => {
  await guard();
  await fixtures();
  try {
    const supplier = await prisma.supplier.create({ data: { name: `${PREFIX} Vendor`, contactPerson: '', email: '', phone: '', address: '', city: '', category: '', createdById: 'f4b-admin', modifiedById: 'f4b-admin' } });
    const company = await prisma.company.create({ data: { name: `${PREFIX} Co`, normalizedName: `${PREFIX.toLowerCase()} co`, address: '', contactPerson: '' } });
    const reviewed = { reviewedById: 'f4b-admin', reviewedAt: new Date() };
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ entityType: 'PERSON' }) }), 'MasterDataAdditionRequest_entityType_check');
    // An unknown status can never satisfy the lifecycle CHECK either.
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ status: 'DONE' }) }), 'MasterDataAdditionRequest_status_check', 'MasterDataAdditionRequest_lifecycle_check');
    await rejects(prisma.$executeRaw`INSERT INTO "MasterDataAdditionRequest" ("id", "entityType", "status", "name", "normalizedName", "requestedById")
      VALUES ('f4b-bad-status', 'COMPANY', 'done', 'x', 'x', 'f4b-tass')`, 'MasterDataAdditionRequest_status_check', 'MasterDataAdditionRequest_lifecycle_check');
    const [statusCheck] = await prisma.$queryRaw<{ def: string }[]>`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'MasterDataAdditionRequest_status_check'`;
    assert.match(statusCheck.def, /'PENDING'.*'APPROVED'.*'REJECTED'/);
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ version: 0 }) }), 'MasterDataAdditionRequest_version_check');
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ name: '   ' }) }), 'MasterDataAdditionRequest_name_nonblank_check');
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ supplierCategoryIds: ['cat'] }) }), 'MasterDataAdditionRequest_entity_arrays_check');
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ entityType: 'SUPPLIER', accountManagerIds: ['am'] }) }), 'MasterDataAdditionRequest_entity_arrays_check');
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ status: 'APPROVED', ...reviewed, createdEntityName: 'x', createdSupplierId: supplier.id }) }), 'MasterDataAdditionRequest_entity_link_check');
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ status: 'APPROVED', ...reviewed, createdEntityName: 'x', createdCompanyId: company.id, createdSupplierId: supplier.id }) }), 'MasterDataAdditionRequest_entity_link_check');
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ status: 'APPROVED', createdEntityName: 'x' }) }), 'MasterDataAdditionRequest_lifecycle_check');
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ status: 'APPROVED', ...reviewed, createdEntityName: '  ' }) }), 'MasterDataAdditionRequest_lifecycle_check');
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ status: 'REJECTED', ...reviewed }) }), 'MasterDataAdditionRequest_lifecycle_check');
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ status: 'REJECTED', ...reviewed, rejectionReason: 'no', createdEntityName: 'x' }) }), 'MasterDataAdditionRequest_lifecycle_check');
    await rejects(prisma.masterDataAdditionRequest.create({ data: row({ reviewedAt: new Date() }) }), 'MasterDataAdditionRequest_lifecycle_check');
    await assert.rejects(prisma.masterDataAdditionRequest.create({ data: row({ requestedById: 'f4b-missing' }) }), /Foreign key|foreign key/);
    // An approved row keeps its outcome when the created entity is later removed (ON DELETE SET NULL).
    const approved = await prisma.masterDataAdditionRequest.create({ data: row({ status: 'APPROVED', ...reviewed, createdEntityName: company.name, createdCompanyId: company.id }) });
    await prisma.company.delete({ where: { id: company.id } });
    const kept = await prisma.masterDataAdditionRequest.findUniqueOrThrow({ where: { id: approved.id } });
    assert.deepEqual([kept.status, kept.createdCompanyId, kept.createdEntityName], ['APPROVED', null, `${PREFIX} Co`]);

    // Concurrent duplicate PENDING inserts: exactly one wins.
    const normalizedName = `${PREFIX.toLowerCase()} pending`;
    const results = await Promise.allSettled([0, 1].map(() => prisma.masterDataAdditionRequest.create({ data: row({ normalizedName }) })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason?.code, 'P2002');
    const pending = (results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: string }>).value;
    assert.ok(await prisma.masterDataAdditionRequest.create({ data: row({ entityType: 'SUPPLIER', normalizedName }) }), 'the other entity type is independent');
    await prisma.masterDataAdditionRequest.update({ where: { id: pending.id }, data: { status: 'REJECTED', ...reviewed, rejectionReason: 'Duplicate' } });
    assert.ok(await prisma.masterDataAdditionRequest.create({ data: row({ normalizedName }) }), 'a new pending request after rejection');
    // Requester provenance is kept: the user cannot be deleted while requests exist.
    await assert.rejects(prisma.user.delete({ where: { id: 'f4b-tass' } }));
  } finally { await cleanup(); }
});

test('submit, approve and reject work end to end on PostgreSQL with notifications and audit entries', options, async () => {
  await guard();
  await fixtures();
  try {
    await withMode('LEGACY', async () => {
      const company = await m.service.submitMasterDataRequest(prisma, 'f4b-tass', m.service.parseSubmitInput({ entity_type: 'COMPANY',
        name: `${PREFIX}   Walk-in Client`, sap_numbers: ['F4B-SAP-1', 'F4B-SAP-2'], account_manager_ids: ['f4b-am'], contact_person: 'Juan', contact_phone: '0917' }));
      assert.equal(company.status, 'PENDING');
      const adminNotes = await prisma.notification.findMany({ where: { recordId: company.id, userId: { in: ['f4b-admin', 'f4b-admin-two'] } } });
      assert.equal(adminNotes.length, 2, 'every active Admin is notified in the same transaction');
      await assert.rejects(m.service.submitMasterDataRequest(prisma, 'f4b-tass-two', m.service.parseSubmitInput({ entity_type: 'COMPANY', name: `${PREFIX} walk-in   CLIENT` })),
        (error: any) => error.status === 409 && /pending addition request/.test(error.message));
      const supplier = await m.service.submitMasterDataRequest(prisma, 'f4b-tass', m.service.parseSubmitInput({ entity_type: 'SUPPLIER', name: `${PREFIX} Vendor Two` }));
      await prisma.supplier.create({ data: { name: `${PREFIX}  vendor   THREE `, contactPerson: '', email: '', phone: '', address: '', city: '', category: '', createdById: 'f4b-admin', modifiedById: 'f4b-admin' } });
      await assert.rejects(m.service.submitMasterDataRequest(prisma, 'f4b-tass', m.service.parseSubmitInput({ entity_type: 'SUPPLIER', name: `${PREFIX} Vendor Three` })),
        (error: any) => error.status === 409 && /supplier named/.test(error.message), 'whitespace and case are normalized in PostgreSQL');

      const approved = await m.service.approveMasterDataRequest(prisma, 'f4b-admin', company.id, m.service.parseApproveInput({ expected_version: 1 }));
      assert.equal(approved.request.status, 'APPROVED');
      const created = await prisma.company.findUniqueOrThrow({ where: { id: approved.created_company!.id }, include: { sapNumbers: { orderBy: { position: 'asc' } }, accountManagers: true } });
      assert.deepEqual([created.name, created.sapNumber, created.sapNumbers.map(s => s.sapNumber), created.accountManagers.map(a => a.accountManagerId), created.defaultAccountManagerId, created.contactPerson],
        [`${PREFIX} Walk-in Client`, 'F4B-SAP-1', ['F4B-SAP-1', 'F4B-SAP-2'], ['f4b-am'], 'f4b-am', 'Juan (0917)']);
      const audits = await prisma.auditLog.findMany({ where: { OR: [{ recordId: company.id }, { recordId: created.id }] }, orderBy: { timestamp: 'asc' } });
      assert.deepEqual(audits.map(a => [a.recordType, a.action]).sort(), [['Company', 'CREATE'], ['MasterDataAdditionRequest', 'CREATE'], ['MasterDataAdditionRequest', 'UPDATE']].sort());
      assert.equal(await prisma.notification.count({ where: { recordId: company.id, userId: 'f4b-tass', title: 'Company addition request approved' } }), 1);

      const rejected = await m.service.rejectMasterDataRequest(prisma, 'f4b-admin', supplier.id, m.service.parseRejectInput({ expected_version: 1, rejection_reason: 'Use the existing vendor' }));
      assert.equal(rejected.request.status, 'REJECTED');
      assert.equal(await prisma.supplier.count({ where: { name: `${PREFIX} Vendor Two` } }), 0);
      assert.equal(await prisma.notification.count({ where: { recordId: supplier.id, userId: 'f4b-tass' } }), 1);
    });
  } finally { await cleanup(); }
});

test('a concurrent double approval creates exactly one company, one notification and one approval audit', options, async () => {
  await guard();
  await fixtures();
  try {
    await withMode('LEGACY', async () => {
      const request = await prisma.masterDataAdditionRequest.create({ data: row({ name: `${PREFIX} Race Co`, normalizedName: `${PREFIX.toLowerCase()} race co` }) });
      const input = m.service.parseApproveInput({ expected_version: 1, entity_type: 'COMPANY' });
      const results = await Promise.allSettled([
        m.service.approveMasterDataRequest(prisma, 'f4b-admin', request.id, input),
        m.service.approveMasterDataRequest(prisma, 'f4b-admin-two', request.id, input),
      ]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, 'exactly one approval succeeds');
      const failure = (results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason;
      assert.equal(failure.status, 409); assert.match(failure.message, /already been approved/);
      assert.equal(await prisma.company.count({ where: { name: `${PREFIX} Race Co` } }), 1);
      assert.equal(await prisma.notification.count({ where: { recordId: request.id, title: 'Company addition request approved' } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { recordId: request.id, recordType: 'MasterDataAdditionRequest', action: 'UPDATE' } }), 1);
      const final = await prisma.masterDataAdditionRequest.findUniqueOrThrow({ where: { id: request.id } });
      assert.deepEqual([final.status, final.version], ['APPROVED', 2]);
    });
  } finally { await cleanup(); }
});

test('an audit failure rolls back the created entity, the status change and the notification', options, async () => {
  await guard();
  await fixtures();
  const fn = 'f4b_reject_request_audit';
  try {
    await withMode('LEGACY', async () => {
      const request = await prisma.masterDataAdditionRequest.create({ data: row({ entityType: 'SUPPLIER', name: `${PREFIX} Rollback Vendor`, normalizedName: `${PREFIX.toLowerCase()} rollback vendor` }) });
      await prisma.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."recordType" = 'MasterDataAdditionRequest' AND NEW."recordId" = '${request.id}' THEN RAISE EXCEPTION 'Injected request audit failure'; END IF; RETURN NEW; END $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
      try {
        await assert.rejects(m.service.approveMasterDataRequest(prisma, 'f4b-admin', request.id, m.service.parseApproveInput({ expected_version: 1 })), /Injected request audit failure/);
        await assert.rejects(m.service.rejectMasterDataRequest(prisma, 'f4b-admin', request.id, m.service.parseRejectInput({ expected_version: 1, rejection_reason: 'Rollback check' })), /Injected request audit failure/);
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON "AuditLog"`); await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
      }
      assert.equal(await prisma.supplier.count({ where: { name: `${PREFIX} Rollback Vendor` } }), 0, 'no supplier survives');
      assert.equal(await prisma.auditLog.count({ where: { changedById: 'f4b-admin', recordType: 'Supplier' } }), 0, 'no supplier audit survives');
      assert.equal(await prisma.notification.count({ where: { recordId: request.id } }), 0, 'no notification survives');
      const unchanged = await prisma.masterDataAdditionRequest.findUniqueOrThrow({ where: { id: request.id } });
      assert.deepEqual([unchanged.status, unchanged.version, unchanged.reviewedById, unchanged.createdSupplierId], ['PENDING', 1, null, null]);
    });
  } finally { await cleanup(); }
});

test('V1 notification and audit visibility follow current access on live SQL', options, async () => {
  await guard();
  await fixtures();
  try {
    const own = await prisma.masterDataAdditionRequest.create({ data: row({ name: `${PREFIX} Visible`, normalizedName: `${PREFIX.toLowerCase()} visible` }) });
    const other = await prisma.masterDataAdditionRequest.create({ data: row({ name: `${PREFIX} Other`, normalizedName: `${PREFIX.toLowerCase()} other`, requestedById: 'f4b-tass-two' }) });
    const supplier = await prisma.masterDataAdditionRequest.create({ data: row({ entityType: 'SUPPLIER', name: `${PREFIX} Supplier Visible`, normalizedName: `${PREFIX.toLowerCase()} supplier visible` }) });
    for (const request of [own, other, supplier]) {
      await prisma.notification.create({ data: { userId: 'f4b-tass', title: 'Company addition request approved', message: 'x', recordId: request.id, recordType: 'MasterDataAdditionRequest' } });
      await prisma.notification.create({ data: { userId: 'f4b-admin', title: 'New Company addition request', message: 'x', recordId: request.id, recordType: 'MasterDataAdditionRequest' } });
      await prisma.auditLog.create({ data: { recordId: request.id, recordType: 'MasterDataAdditionRequest', action: 'CREATE', changedById: 'f4b-tass', newValue: '{}' } });
    }
    const visible = async (user: AuthUser) => (await prisma.$queryRaw<{ recordId: string }[]>`
      SELECT n."recordId" FROM "Notification" n LEFT JOIN "DeliveryRecord" r ON n."recordType" = 'DeliveryRecord' AND r."id" = n."recordId"
      WHERE n."userId" = ${user.id} AND ${m.visibility.notificationVisibility(user)} ORDER BY n."recordId"`).map(r => r.recordId);
    const sorted = (ids: string[]) => [...ids].sort();
    assert.deepEqual(await visible(v1Session('f4b-tass', 'TASS')), sorted([own.id, supplier.id]), 'TASS sees only its own requests');
    assert.deepEqual(await visible(v1Session('f4b-tass', 'TASS', ['RESOURCE:suppliers:READ'])), [own.id], 'revoking supplier READ hides supplier requests');
    assert.deepEqual(await visible(v1Session('f4b-tass', 'LOGISTICS')), [], 'a demoted requester loses every request notification');
    assert.deepEqual(await visible(v1Session('f4b-admin', 'ADMIN')), sorted([own.id, other.id, supplier.id]));
    assert.deepEqual(await visible(v1Session('f4b-admin', 'SALES_COORDINATOR')), [], 'a demoted Admin loses the queue notifications');
    await withMode('LEGACY', async () => {
      const legacyTass = (await (await import('../src/services/sessionPermissions')).loadLegacySession(prisma, 'f4b-tass'))!.session;
      assert.deepEqual(await visible(legacyTass), sorted([own.id, supplier.id]), 'LEGACY applies the same requester rule');
    });
    const audit = async (user: AuthUser) => (await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::integer AS n FROM "AuditLog" a WHERE a."recordType" = 'MasterDataAdditionRequest' AND a."changedById" = 'f4b-tass' AND ${m.auditVisibility.auditVisibilitySql(user)}`)[0].n;
    assert.equal(await audit(v1Session('f4b-admin', 'ADMIN')), 3, 'V1 Admin audit log shows request entries');
    assert.equal(await audit(v1Session('f4b-admin', 'SALES_COORDINATOR')), 0);
  } finally { await cleanup(); }
});

/** A raw connection that can hold advisory locks while the app's transactions wait on them. */
async function rawClient() { const client = new Client({ connectionString: target }); await client.connect(); return client; }
async function waiters(classid: number, mode?: 'ShareLock' | 'ExclusiveLock') {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::integer AS n FROM pg_locks WHERE locktype = 'advisory' AND classid = ${classid} AND objid = 1 AND NOT granted
      AND (${mode ?? null}::text IS NULL OR mode = ${mode ?? null}::text)`;
  return rows[0].n;
}
async function until(check: () => Promise<boolean>, label: string) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail(`Timed out waiting for: ${label}`);
}
async function suppliersApi(actorId: string) {
  const app = express();
  app.use(express.json(), cookieParser()); app.use('/suppliers', m.suppliersRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: String(error?.message ?? error) }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId } });
  const cookie = `mg_session=${m.signToken({ id: actor.id, name: actor.name, email: actor.email, role: actor.role as 'ADMIN' })}`;
  const category = await prisma.supplierCategory.findFirstOrThrow({ where: { isActive: true } });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/suppliers`;
  return {
    create: (name: string) => fetch(base, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, category_ids: [category.id] }) }),
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
const supplierCount = async (name: string) => (await prisma.$queryRaw<{ n: number }[]>`
  SELECT COUNT(*)::integer AS n FROM "Supplier" WHERE lower(btrim(regexp_replace("name", '\\s+', ' ', 'g'))) = lower(${name})`)[0].n;

test('direct supplier creation and request approval cannot duplicate a supplier in either order', options, async () => {
  await guard();
  await fixtures();
  const api = await withMode('LEGACY', () => suppliersApi('f4b-admin'));
  const lock = await rawClient();
  try {
    await withMode('LEGACY', async () => {
      // 1. Direct create first, then approval of a case/whitespace variant: 409, request stays pending.
      assert.equal((await api.create(`${PREFIX} Race Vendor One`)).status, 201);
      const one = await prisma.masterDataAdditionRequest.create({ data: row({ entityType: 'SUPPLIER', name: `  ${PREFIX.toLowerCase()} race   VENDOR one `, normalizedName: `${PREFIX.toLowerCase()} race vendor one` }) });
      await assert.rejects(m.service.approveMasterDataRequest(prisma, 'f4b-admin', one.id, m.service.parseApproveInput({ expected_version: 1 })),
        (error: any) => error.status === 409 && /supplier named "F4B PG Race Vendor One" already exists/.test(error.message));
      const stillPending = await prisma.masterDataAdditionRequest.findUniqueOrThrow({ where: { id: one.id } });
      assert.deepEqual([stillPending.status, stillPending.version], ['PENDING', 1]);
      assert.equal(await supplierCount(`${PREFIX} Race Vendor One`), 1);

      // 2. Approval first, with a direct create of a variant queued behind it on the supplier catalog lock.
      const two = await prisma.masterDataAdditionRequest.create({ data: row({ entityType: 'SUPPLIER', name: `${PREFIX} Race Vendor Two`, normalizedName: `${PREFIX.toLowerCase()} race vendor two` }) });
      await lock.query('BEGIN'); await lock.query('SELECT pg_advisory_xact_lock(731105, 1)');
      const approval = m.service.approveMasterDataRequest(prisma, 'f4b-admin', two.id, m.service.parseApproveInput({ expected_version: 1 }));
      await until(async () => await waiters(731105) === 1, 'approval waits on the supplier catalog lock');
      const direct = api.create(`  ${PREFIX.toUpperCase()}   race vendor TWO `);
      await until(async () => await waiters(731105) === 2, 'direct create queues behind the approval');
      await lock.query('COMMIT');
      const [approved, response] = await Promise.all([approval, direct]);
      assert.equal(approved.request.status, 'APPROVED');
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /supplier named "F4B PG Race Vendor Two" already exists/);
      assert.equal(await supplierCount(`${PREFIX} Race Vendor Two`), 1, 'exactly one supplier');
      assert.equal(await prisma.auditLog.count({ where: { recordType: 'Supplier', action: 'CREATE', recordId: approved.created_supplier!.id } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { recordType: 'Supplier', action: 'CREATE', changedById: 'f4b-admin' } }), 2, 'one per created supplier, none for the refused create');
    });
  } finally {
    await lock.query('ROLLBACK').catch(() => {}); await lock.end();
    await api.close(); await cleanup();
  }
});

test('a committed account revocation blocks a waiting approval; concurrent approvals share the authorization lock', options, async () => {
  await guard();
  await fixtures();
  const admin = await rawClient(), directory = await rawClient();
  try {
    await withMode('LEGACY', async () => {
      // 1. A revocation holding exclusive (243, 1): the approval waits, then reads the revoked account and is refused.
      const request = await prisma.masterDataAdditionRequest.create({ data: row({ name: `${PREFIX} Revoked Approval`, normalizedName: `${PREFIX.toLowerCase()} revoked approval` }) });
      await admin.query('BEGIN'); await admin.query('SELECT pg_advisory_xact_lock(243, 1)');
      const approval = m.service.approveMasterDataRequest(prisma, 'f4b-admin-two', request.id, m.service.parseApproveInput({ expected_version: 1 }));
      const outcome = approval.then(() => 'approved', (error: any) => error);
      await until(async () => await waiters(243, 'ShareLock') === 1, 'approval waits for the revocation');
      await admin.query(`UPDATE "User" SET "isActive" = false WHERE "id" = 'f4b-admin-two'`);
      await admin.query('COMMIT');
      const error = await outcome;
      assert.equal(error.status, 403, 'the fresh authorization read sees the committed revocation');
      const unchanged = await prisma.masterDataAdditionRequest.findUniqueOrThrow({ where: { id: request.id } });
      assert.deepEqual([unchanged.status, unchanged.version], ['PENDING', 1]);
      assert.equal(await prisma.company.count({ where: { name: `${PREFIX} Revoked Approval` } }), 0);
      assert.equal(await prisma.notification.count({ where: { recordId: request.id } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { recordId: request.id } }), 0);

      // 2. Two approvals hold shared (243, 1) together; an exclusive revocation waits until both finish.
      const race = await prisma.masterDataAdditionRequest.create({ data: row({ name: `${PREFIX} Shared Lock Co`, normalizedName: `${PREFIX.toLowerCase()} shared lock co` }) });
      await directory.query('BEGIN'); await directory.query('SELECT pg_advisory_xact_lock(731110, 1)');
      const input = m.service.parseApproveInput({ expected_version: 1 });
      const both = Promise.allSettled([
        m.service.approveMasterDataRequest(prisma, 'f4b-admin', race.id, input),
        m.service.approveMasterDataRequest(prisma, 'f4b-admin', race.id, input),
      ]);
      await until(async () => (await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::integer AS n FROM pg_locks WHERE locktype = 'advisory' AND classid = 243 AND objid = 1 AND granted AND mode = 'ShareLock'`)[0].n === 2,
      'both approvals hold the shared authorization lock at once');
      await admin.query('BEGIN');
      // What the revocation sees the moment it gets the exclusive lock: both approvals already committed.
      const exclusive = admin.query('SELECT pg_advisory_xact_lock(243, 1)').then(() => admin.query(
        'SELECT status, version FROM "MasterDataAdditionRequest" WHERE id = $1', [race.id]));
      await until(async () => await waiters(243, 'ExclusiveLock') === 1, 'the revocation waits for the request writes');
      await directory.query('COMMIT');
      const results = await both;
      const seen = (await exclusive).rows[0];
      await admin.query('COMMIT');
      assert.deepEqual([seen.status, seen.version], ['APPROVED', 2], 'the revocation never interleaves with an approval');
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      assert.equal(rejected.reason.status, 409, 'the loser is a conflict, never a deadlock');
      assert.equal(await prisma.company.count({ where: { name: `${PREFIX} Shared Lock Co` } }), 1);
    });
  } finally {
    for (const client of [admin, directory]) { await client.query('ROLLBACK').catch(() => {}); await client.end(); }
    await cleanup();
  }
});

test('the migration re-runs idempotently, and its rollback SQL drops only the request table', options, async () => {
  await guard();
  await fixtures();
  try {
    const kept = await prisma.masterDataAdditionRequest.create({ data: row({ name: `${PREFIX} Preserved`, normalizedName: `${PREFIX.toLowerCase()} preserved` }) });
    for (let pass = 0; pass < 2; pass++) for (const statement of migrationStatements()) await prisma.$executeRawUnsafe(statement);
    const after = await prisma.masterDataAdditionRequest.findUniqueOrThrow({ where: { id: kept.id } });
    assert.equal(after.name, `${PREFIX} Preserved`);
    const [constraints] = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::integer AS n FROM pg_constraint WHERE conrelid = '"MasterDataAdditionRequest"'::regclass`;
    assert.equal(constraints.n, 12);
    const [indexes] = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::integer AS n FROM pg_indexes WHERE tablename = 'MasterDataAdditionRequest'`;
    assert.equal(indexes.n, 8, 'primary key, partial unique and six indexes, never duplicated');

    // Rollback and re-apply inside one transaction so a failure leaves the database migrated.
    await prisma.$transaction(async tx => {
      const counts = async () => (await tx.$queryRaw<{ companies: number; suppliers: number; users: number }[]>`
        SELECT (SELECT COUNT(*)::integer FROM "Company") AS companies, (SELECT COUNT(*)::integer FROM "Supplier") AS suppliers, (SELECT COUNT(*)::integer FROM "User") AS users`)[0];
      const before = await counts();
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "MasterDataAdditionRequest"');
      assert.equal((await tx.$queryRaw<{ exists: boolean }[]>`SELECT to_regclass('public."MasterDataAdditionRequest"') IS NOT NULL AS exists`)[0].exists, false);
      assert.deepEqual(await counts(), before, 'Company, Supplier and User rows are untouched by the rollback');
      for (const statement of migrationStatements()) await tx.$executeRawUnsafe(statement);
      const [rls] = await tx.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'MasterDataAdditionRequest' AND relkind = 'r'`;
      assert.equal(rls.relrowsecurity, true, 're-applied with RLS');
    }, { timeout: 60_000 });
  } finally { await cleanup(); }
});
