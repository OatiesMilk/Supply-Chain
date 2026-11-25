import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../src/middleware/auth';

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
  const [db, backfill, visibility, dispatchService, dispatchPermissions] = await Promise.all([
    import('../src/db'),
    import('../src/services/permissionBackfill'),
    import('../src/services/notificationVisibility'),
    import('../src/services/rmaLogisticsDispatch'),
    import('../src/services/rmaDispatchPermissions'),
  ]);
  return { prisma: db.prisma, backfill, notificationVisibility: visibility.notificationVisibility, dispatchService, dispatchRolePermissions: dispatchPermissions.dispatchRolePermissions };
}
type AppModules = Awaited<ReturnType<typeof importAppModules>>;
let appModulesPromise: Promise<AppModules> | null = null;
const loadAppModules = () => (appModulesPromise ??= importAppModules());

let prisma: AppModules['prisma'];
let assertPermissionBackfillTarget: AppModules['backfill']['assertPermissionBackfillTarget'];
let initializePermissionFoundation: AppModules['backfill']['initializePermissionFoundation'];
let notificationVisibility: AppModules['notificationVisibility'];
let accountSession: AppModules['dispatchService']['accountSession'];
let canReadRma: AppModules['dispatchService']['canReadRma'];
let dispatchRolePermissions: AppModules['dispatchRolePermissions'];
before(async () => {
  if (!process.env.SEED_TEST_DATABASE_URL) return; // skipped file: never load the app against a configured DB
  const m = await loadAppModules();
  ({ prisma, notificationVisibility, dispatchRolePermissions } = m);
  ({ assertPermissionBackfillTarget, initializePermissionFoundation } = m.backfill);
  ({ accountSession, canReadRma } = m.dispatchService);
});

// Runs only against the disposable seeded test database (SEED_TEST_DATABASE_URL).
// Every row it creates uses an f5b- id and is removed afterwards.
const target = process.env.SEED_TEST_DATABASE_URL;
const options = { skip: !target, timeout: 60_000 };
const userIds = ['f5b-tass', 'f5b-tass-two', 'f5b-logistics'];
const recordIds = ['f5b-rma-one', 'f5b-rma-two', 'f5b-rma-three'];

async function guard() {
  assert.equal(process.env.DATABASE_URL, target);
  assertPermissionBackfillTarget({ DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: new URL(target!).pathname.slice(1) });
}
const cleanup = async () => {
  await prisma.auditLog.deleteMany({ where: { recordType: 'RmaLogisticsDispatch', changedById: { in: userIds } } });
  await prisma.notificationLog.deleteMany({ where: { triggerEvent: 'TASS_LOGISTICS_DISPATCH', recipientName: 'F5B Alpha Printer' } });
  await prisma.rmaLogisticsDispatch.deleteMany({ where: { OR: [{ dispatchedById: { in: userIds } }, { recipientUserId: { in: userIds } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userPermission.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.deliveryRecord.deleteMany({ where: { id: { in: recordIds } } });
  await prisma.company.deleteMany({ where: { id: 'f5b-company' } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};
async function fixtures() {
  await cleanup();
  await prisma.user.create({ data: { id: 'f5b-tass', name: 'F5B Roselyn Arguelles', email: 'f5b-tass@example.test', password: 'x', role: 'TASS' } });
  await prisma.user.create({ data: { id: 'f5b-tass-two', name: 'F5B Abigail Celada', email: 'f5b-tass-two@example.test', password: 'x', role: 'TASS' } });
  await prisma.user.create({ data: { id: 'f5b-logistics', name: 'F5B Alpha Printer', email: 'f5b-logistics@example.test', password: 'x', role: 'LOGISTICS' } });
  await prisma.company.create({ data: { id: 'f5b-company', name: 'F5B BDO Unibank Inc.', normalizedName: 'f5b bdo unibank inc.', address: 'Makati', contactPerson: 'Dennis' } });
  const base = { category: 'RMA', companyId: 'f5b-company', reference: '', area: 'Caloocan', deliveryDate: '2026-11-19', accountManager: 'Leanne Pavoreal',
    itemType: 'Unit', itemDescription: 'Unit', priority: '2 - Moderate', status: 'SCHEDULED', draft: false, modifiedById: 'f5b-tass' };
  await prisma.deliveryRecord.create({ data: { ...base, id: 'f5b-rma-one', recordNo: 'F5B-RMA-1', createdById: 'f5b-tass', rmaMovement: 'LOGISTICS_TRANSPORT' } as Prisma.DeliveryRecordUncheckedCreateInput });
  await prisma.deliveryRecord.create({ data: { ...base, id: 'f5b-rma-two', recordNo: 'F5B-RMA-2', createdById: 'f5b-tass-two', rmaMovement: 'INTERNAL_NO_DRIVER' } as Prisma.DeliveryRecordUncheckedCreateInput });
  await prisma.deliveryRecord.create({ data: { ...base, id: 'f5b-rma-three', recordNo: 'F5B-RMA-3', createdById: 'f5b-tass', rmaMovement: 'SUPPLIER_COLLECTION' } as Prisma.DeliveryRecordUncheckedCreateInput });
}
const rejects = async (work: Promise<unknown>, constraint: string) => {
  await assert.rejects(work, (error: any) => String(error?.message ?? '').includes(constraint)
    || JSON.stringify(error?.meta ?? {}).includes(constraint) || /check constraint/i.test(String(error?.message)), constraint);
};
const dispatchRow = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: `f5b-key-${Math.random().toString(36).slice(2)}`, dispatchDate: '2026-11-19', dispatchedById: 'f5b-tass', recipientUserId: 'f5b-logistics',
  recipientName: 'F5B Alpha Printer', recipientEmail: 'f5b-logistics@example.test', recordIds: ['f5b-rma-one', 'f5b-rma-two'], recordCount: 2,
  logisticsCount: 1, supplierCount: 0, internalCount: 1, routeSlipFileName: 'DRR111926.xlsx', clientSlipsFileName: 'Tass_Route_111926.pdf',
  emailStatus: 'MOCKED', emailMethod: 'mock', ...overrides,
});

test('migration adds the creator index and RmaLogisticsDispatch with constraints, foreign keys and RLS', options, async () => {
  await guard();
  const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'DeliveryRecord_category_createdById_idx'`;
  assert.match(index.indexdef, /\(category, "createdById"\)/);
  const columns = (await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'RmaLogisticsDispatch'`).map(row => row.column_name).sort();
  assert.deepEqual(columns, ['clientSlipsFileName', 'createdAt', 'dispatchDate', 'dispatchedById', 'emailError', 'emailMethod', 'emailStatus', 'id', 'idempotencyKey',
    'inAppNotificationId', 'internalCount', 'logisticsCount', 'note', 'recipientEmail', 'recipientName', 'recipientUserId', 'recordCount', 'recordIds',
    'routeSlipFileName', 'supplierCount'].sort());
  const constraints = (await prisma.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint WHERE conrelid = '"RmaLogisticsDispatch"'::regclass`).map(row => row.conname).sort();
  assert.deepEqual(constraints, ['RmaLogisticsDispatch_dispatchDate_check', 'RmaLogisticsDispatch_dispatchedById_fkey', 'RmaLogisticsDispatch_emailMethod_check',
    'RmaLogisticsDispatch_emailStatus_check', 'RmaLogisticsDispatch_movementCounts_check', 'RmaLogisticsDispatch_pkey', 'RmaLogisticsDispatch_recipientUserId_fkey',
    'RmaLogisticsDispatch_recordCount_check']);
  const indexes = (await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'RmaLogisticsDispatch'`).map(row => row.indexname);
  for (const name of ['RmaLogisticsDispatch_idempotencyKey_key', 'RmaLogisticsDispatch_dispatchDate_createdAt_idx', 'RmaLogisticsDispatch_dispatchedById_createdAt_idx',
    'RmaLogisticsDispatch_recipientUserId_createdAt_idx']) assert.ok(indexes.includes(name), name);
  const [rls] = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'RmaLogisticsDispatch' AND relkind = 'r'`;
  assert.equal(rls.relrowsecurity, true);
});

test('CHECK constraints reject invalid status, method, counts, record arrays and dates; the idempotency key is unique', options, async () => {
  await guard();
  await fixtures();
  try {
    await rejects(prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ emailStatus: 'DELIVERED' }) }), 'RmaLogisticsDispatch_emailStatus_check');
    await rejects(prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ emailMethod: 'sendgrid' }) }), 'RmaLogisticsDispatch_emailMethod_check');
    await rejects(prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ recordIds: [], recordCount: 0, logisticsCount: 0, internalCount: 0 }) }), 'RmaLogisticsDispatch_recordCount_check');
    // An empty array has a NULL array_length; COALESCE keeps the CHECK from passing.
    await rejects(prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ recordIds: [], recordCount: 1, logisticsCount: 1, internalCount: 0 }) }), 'RmaLogisticsDispatch_recordCount_check');
    await rejects(prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ recordCount: 3, internalCount: 2 }) }), 'RmaLogisticsDispatch_recordCount_check');
    const many = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    await rejects(prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ recordIds: many, recordCount: 101, logisticsCount: 101, internalCount: 0 }) }), 'RmaLogisticsDispatch_recordCount_check');
    await rejects(prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ logisticsCount: -1, internalCount: 3 }) }), 'RmaLogisticsDispatch_movementCounts_check');
    await rejects(prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ logisticsCount: 2 }) }), 'RmaLogisticsDispatch_movementCounts_check');
    for (const dispatchDate of ['11/19/2026', '2026-1-19', '']) {
      await rejects(prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ dispatchDate }) }), 'RmaLogisticsDispatch_dispatchDate_check');
    }
    await assert.rejects(prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ recipientUserId: 'f5b-missing-user' }) }), /Foreign key|foreign key/);

    const key = 'f5b-key-concurrent';
    const results = await Promise.allSettled([
      prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ idempotencyKey: key }) }),
      prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ idempotencyKey: key }) }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejected.reason?.code, 'P2002');
    for (const emailStatus of ['SENT', 'MOCKED', 'SKIPPED', 'FAILED']) {
      await prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ emailStatus, emailMethod: emailStatus === 'SKIPPED' ? null : 'smtp' }) });
    }
    // A User with dispatch history cannot be deleted (ON DELETE RESTRICT keeps the audit trail).
    await assert.rejects(prisma.user.delete({ where: { id: 'f5b-logistics' } }));
  } finally { await cleanup(); }
});

test('the migration is idempotent: re-applying it keeps existing dispatch rows and constraints', options, async () => {
  await guard();
  await fixtures();
  try {
    const row = await prisma.rmaLogisticsDispatch.create({ data: dispatchRow({ idempotencyKey: 'f5b-key-preserved' }) });
    const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261125120000_rma_logistics_dispatch_and_creator_index/migration.sql'), 'utf8');
    const statements = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
      .split(';').map(statement => statement.trim()).filter(statement => statement && !/^(BEGIN|COMMIT)$/i.test(statement));
    for (let pass = 0; pass < 2; pass++) for (const statement of statements) await prisma.$executeRawUnsafe(statement);
    const kept = await prisma.rmaLogisticsDispatch.findUniqueOrThrow({ where: { idempotencyKey: 'f5b-key-preserved' } });
    assert.equal(kept.id, row.id); assert.deepEqual(kept.recordIds, ['f5b-rma-one', 'f5b-rma-two']);
    const [count] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_constraint WHERE conrelid = '"RmaLogisticsDispatch"'::regclass`;
    assert.equal(Number(count.n), 8);
    const [indexes] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_indexes WHERE indexname = 'DeliveryRecord_category_createdById_idx'`;
    assert.equal(Number(indexes.n), 1);
  } finally { await cleanup(); }
});

test('live Created By filtering and creator names match the RMA list query shapes', options, async () => {
  await guard();
  await fixtures();
  try {
    const where: Prisma.DeliveryRecordWhereInput = { deletedAt: null, category: 'RMA', id: { in: recordIds } };
    const byCreator = await prisma.deliveryRecord.findMany({ where: { AND: [where, { createdBy: { name: { contains: 'roselyn', mode: 'insensitive' } } }] }, orderBy: { id: 'asc' } });
    assert.deepEqual(byCreator.map(row => row.id), ['f5b-rma-one', 'f5b-rma-three']);
    const groups = await prisma.deliveryRecord.groupBy({ by: ['createdById'], where });
    const names = (await prisma.user.findMany({ where: { id: { in: groups.map(group => group.createdById) } }, select: { name: true } })).map(user => user.name).sort();
    assert.deepEqual(names, ['F5B Abigail Celada', 'F5B Roselyn Arguelles']);
    const plan = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(`EXPLAIN SELECT id FROM "DeliveryRecord" WHERE "category" = 'RMA' AND "createdById" = 'f5b-tass'`);
    assert.ok(plan.length > 0);
  } finally { await cleanup(); }
});

test('the dispatch notification is hidden as soon as the Logistics recipient loses RMA access', options, async () => {
  await guard();
  await fixtures();
  try {
    // Locks taken by the dispatch reservation are valid SQL in a live transaction.
    await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(['f5b-logistics', 'f5b-tass'])}) ORDER BY "id" FOR UPDATE`;
      assert.deepEqual(rows.map(row => row.id), ['f5b-logistics', 'f5b-tass']);
    });
    await prisma.notification.create({ data: { userId: 'f5b-logistics', title: 'TASS Daily Slips & Route Slip (11/19/2026)', message: 'x', recordId: 'f5b-rma-one', recordType: 'DeliveryRecord' } });
    const policy = { role: 'LOGISTICS', revision: 1n, catalogVersion: 1, createdAt: new Date(), updatedAt: new Date(),
      permissions: [...dispatchRolePermissions('LOGISTICS')].map(([permissionKey, effect]) => ({ role: 'LOGISTICS', permissionKey, effect })) } as any;
    const session = async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: 'f5b-logistics' }, include: {
        permissions: { select: { screen: true, granted: true } }, permissionOverrides: { select: { userId: true, permissionKey: true, effect: true } },
        permissionConversion: { select: { catalogVersion: true } }, driverProfile: { select: { id: true, type: true, isActive: true } },
      } });
      return accountSession(user, policy) as AuthUser;
    };
    const visible = async (user: AuthUser) => (await prisma.$queryRaw<{ id: string }[]>`
      SELECT n."id" FROM "Notification" n
      LEFT JOIN "DeliveryRecord" r ON n."recordType" = 'DeliveryRecord' AND r."id" = n."recordId"
      WHERE n."userId" = ${user.id} AND ${notificationVisibility(user)}`).length;
    const previousMode = process.env.PERMISSION_MODE;
    process.env.PERMISSION_MODE = 'LEGACY';
    try {
      const before = await session();
      assert.equal(canReadRma(before), true);
      assert.equal(await visible(before), 1);
      await prisma.userPermission.create({ data: { userId: 'f5b-logistics', screen: 'rma', granted: false } });
      const after = await session();
      assert.equal(canReadRma(after), false, 'revoked recipients are no longer offered');
      assert.equal(await visible(after), 0, 'the existing notification is hidden immediately');
    } finally { if (previousMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = previousMode; }
  } finally { await cleanup(); }
});

// ── Minimal stored ZIP (valid OOXML shape) and PDF fixtures ─────────────────
function zip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, 'utf8'), data = Buffer.from(content, 'utf8'), crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data); centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cd = Buffer.concat(centrals), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(entries).length, 8); eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
const validXlsx = zip({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook/>' });
const validPdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\nstartxref\n9\n%%EOF\n');

test('end to end on real PostgreSQL: recipients, three-phase dispatch with a stubbed SMTP transport, recent list and same-key retries', options, async () => {
  await guard();
  await fixtures();
  const previousMode = process.env.PERMISSION_MODE;
  process.env.PERMISSION_MODE = 'LEGACY';
  let createdAdmin = false;
  const sent: any[] = [];
  const originalTransport = nodemailer.createTransport;
  try {
    // A migrate-only (seed.ts) database has no role policies yet; provision the
    // baseline foundation on this disposable target only (guard() above).
    if ((await prisma.rolePolicy.count()) === 0) {
      await prisma.user.create({ data: { id: 'f5b-admin', name: 'F5B Admin', email: 'f5b-admin@example.test', password: 'x', role: 'ADMIN' } });
      createdAdmin = true;
      await initializePermissionFoundation(prisma, 'f5b-admin');
    }
    const { dispatchService } = await loadAppModules();
    const { listActiveLogisticsRecipients, dispatchRmaToLogistics, listRecentRmaDispatches, parseDispatchInput } = dispatchService;
    const loadSession = async (id: string) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: {
        permissions: { select: { screen: true, granted: true } }, permissionOverrides: { select: { userId: true, permissionKey: true, effect: true } },
        permissionConversion: { select: { catalogVersion: true } }, driverProfile: { select: { id: true, type: true, isActive: true } },
      } });
      return accountSession(user, await prisma.rolePolicy.findUnique({ where: { role: user.role }, include: { permissions: true } })) as AuthUser;
    };

    const recipients = await listActiveLogisticsRecipients(prisma);
    assert.ok(recipients.some(r => r.id === 'f5b-logistics' && r.name === 'F5B Alpha Printer' && r.email === 'f5b-logistics@example.test'));
    await prisma.userPermission.create({ data: { userId: 'f5b-logistics', screen: 'rma', granted: false } });
    assert.equal((await listActiveLogisticsRecipients(prisma)).some(r => r.id === 'f5b-logistics'), false, 'RMA-revoked Logistics is not offered');
    await prisma.userPermission.deleteMany({ where: { userId: 'f5b-logistics' } });

    // Only the transport is stubbed; everything else is real PostgreSQL.
    process.env.SMTP_HOST = 'smtp.test.invalid';
    (nodemailer as any).createTransport = () => ({ sendMail: async (message: any) => { sent.push(message); return { messageId: 'stub' }; } });
    const actor = await loadSession('f5b-tass');
    const input = parseDispatchInput({ recipient_user_id: 'f5b-logistics', dispatch_date: '2026-11-19', record_ids: JSON.stringify(recordIds),
      note: 'Please print today.', idempotency_key: 'f5b-live-dispatch-key-1' });
    const result = await dispatchRmaToLogistics(prisma, actor, input, { clientSlips: validPdf, routeSlip: validXlsx });
    assert.equal(result.deduplicated, false);
    assert.deepEqual([result.dispatch.email_status, result.dispatch.email_method, result.dispatch.in_app_notified], ['SENT', 'smtp', true]);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].attachments.map((a: any) => a.filename), ['Tass_Route_111926.pdf', 'DRR111926.xlsx']);
    assert.equal(sent[0].to, 'f5b-logistics@example.test');

    const stored = await prisma.rmaLogisticsDispatch.findUniqueOrThrow({ where: { idempotencyKey: 'f5b-live-dispatch-key-1' } });
    assert.deepEqual([stored.emailStatus, stored.emailMethod, stored.emailError], ['SENT', 'smtp', null]);
    assert.deepEqual(stored.recordIds, ['f5b-rma-one', 'f5b-rma-three', 'f5b-rma-two'], 'Logistics Route -> Supplier Collection -> Internal Printing');
    assert.deepEqual([stored.logisticsCount, stored.supplierCount, stored.internalCount], [1, 1, 1]);
    const notifications = await prisma.notification.findMany({ where: { userId: 'f5b-logistics' } });
    assert.equal(notifications.length, 1);
    assert.deepEqual([notifications[0].id, notifications[0].recordId, notifications[0].recordType], [stored.inAppNotificationId, 'f5b-rma-one', 'DeliveryRecord']);
    const logs = await prisma.notificationLog.findMany({ where: { triggerEvent: 'TASS_LOGISTICS_DISPATCH', recipientName: 'F5B Alpha Printer' } });
    assert.deepEqual(logs.map(log => log.status), ['SENT']);
    const audits = await prisma.auditLog.findMany({ where: { recordType: 'RmaLogisticsDispatch', recordId: stored.id } });
    assert.equal(audits.length, 1);
    assert.deepEqual([audits[0].action, audits[0].changedById, audits[0].previousValue], ['CREATE', 'f5b-tass', null]);
    assert.equal(audits[0].newValue!.includes('f5b-logistics@example.test'), false, 'the audit never stores the recipient email');

    const recent = await listRecentRmaDispatches(prisma, await loadSession('f5b-logistics'), { date: '2026-11-19', limit: 10 });
    assert.deepEqual(recent.map(row => [row.id, row.email_status, row.dispatched_by]), [[stored.id, 'SENT', 'F5B Roselyn Arguelles']]);

    // Same key: a sequential retry and two concurrent retries all deduplicate.
    const retries = [await dispatchRmaToLogistics(prisma, actor, input, { clientSlips: validPdf, routeSlip: validXlsx }),
      ...await Promise.all([1, 2].map(() => dispatchRmaToLogistics(prisma, actor, input, { clientSlips: validPdf, routeSlip: validXlsx })))];
    for (const retry of retries) {
      assert.equal(retry.deduplicated, true); assert.equal(retry.dispatch.id, stored.id); assert.equal(retry.outcome_unconfirmed, undefined);
    }
    assert.equal(sent.length, 1, 'zero duplicate email');
    assert.equal(await prisma.notification.count({ where: { userId: 'f5b-logistics' } }), 1);
    assert.equal(await prisma.rmaLogisticsDispatch.count({ where: { dispatchedById: 'f5b-tass' } }), 1);
    assert.equal(await prisma.notificationLog.count({ where: { triggerEvent: 'TASS_LOGISTICS_DISPATCH', recipientName: 'F5B Alpha Printer' } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { recordType: 'RmaLogisticsDispatch', recordId: stored.id } }), 1);
  } finally {
    (nodemailer as any).createTransport = originalTransport;
    process.env.SMTP_HOST = '';
    if (previousMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = previousMode;
    await cleanup();
    if (createdAdmin) {
      // Baseline role policies stay on the disposable database; only the helper account and its audit rows go.
      await prisma.auditLog.deleteMany({ where: { changedById: 'f5b-admin' } });
      await prisma.user.deleteMany({ where: { id: 'f5b-admin' } });
    }
  }
});
