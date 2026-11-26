import type { PrismaClient, Prisma } from '@prisma/client';
import { assertStagingSeedTarget, StagingSeedError } from './staging-seed-safety';
import { lockDriverDirectory } from '../src/services/driverDirectory';
import { localDirectoryKey } from '../src/services/accountDirectory';
import { manilaToday } from '../src/services/deliveryLifecycle';
import { allocateRmaReference } from '../src/services/rmaReference';
import { RMA_DEMO_COMPANY_NAMES, buildRmaDemoRecords, syncRmaReferenceSequences, type RmaDemoProfile } from './seeds/rma-demo';
import { driverDemoRmaRecord } from './seed-driver-demo';

/**
 * Targeted RMA-only staging demo refresh (`npm run seed:staging:rma-demo`).
 *
 * Replaces every category = 'RMA' DeliveryRecord (and only RMA-scoped children)
 * with the curated demo set from seeds/rma-demo.ts plus one driver-demo RMA run
 * per existing active Driver profile. Non-RMA records, accounts, permissions,
 * every Driver profile, master data, RecordSequence and prior AuditLog rows are
 * never touched. Slip counters (RmaReferenceSequence) are only ever raised.
 *
 * Default is a read-only preview (no writes, no locks, no counter allocation).
 * --apply also needs STAGING_RMA_DEMO_APPROVED=true and STAGING_RMA_DEMO_ALLOW_RESET=true.
 */
export const RMA_DEMO_OPERATION = 'rma-demo-refresh';
const NON_RMA_CATEGORIES = ['DELIVERY', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'] as const;

/**
 * pg-connection-string lets these query parameters override the host, user,
 * database, port or service shown in the URL. They are refused on every
 * database URL (dedicated *_staging and Supabase alike) before any access.
 */
export const TARGET_OVERRIDE_QUERY_PARAMS = [
  'host', 'hostaddr', 'user', 'username', 'database', 'dbname', 'db', 'port', 'service',
] as const;

export function assertStagingRmaDemoTarget(env: NodeJS.ProcessEnv = process.env, options: { apply?: boolean } = {}) {
  let url: URL | null = null;
  try { url = new URL(env.DATABASE_URL || ''); } catch { /* assertStagingSeedTarget reports the invalid URL */ }
  // URLSearchParams decodes names, so %68ost and HOST are caught as well.
  const forbidden = new Set<string>(TARGET_OVERRIDE_QUERY_PARAMS);
  if (url && [...url.searchParams.keys()].some(key => forbidden.has(key.toLowerCase()))) {
    throw new StagingSeedError('Staging RMA demo refused: database URL query parameters must not override the confirmed target.');
  }
  // Same target confirmation as the staging seed; its own acknowledgements for apply.
  const target = assertStagingSeedTarget(env);
  if (options.apply === true && env.STAGING_RMA_DEMO_APPROVED !== 'true') {
    throw new StagingSeedError('Staging RMA demo refused: --apply requires STAGING_RMA_DEMO_APPROVED=true after review of the preview.');
  }
  if (options.apply === true && env.STAGING_RMA_DEMO_ALLOW_RESET !== 'true') {
    throw new StagingSeedError('Staging RMA demo refused: replacing RMA records requires STAGING_RMA_DEMO_ALLOW_RESET=true.');
  }
  return target;
}

type Tx = Prisma.TransactionClient;

/** Existing active profiles, preferring the seeded name and otherwise cycling deterministically. */
function profileResolver(drivers: RmaDemoProfile[]) {
  // Drivers arrive in [name asc, id asc] order; the first profile of a duplicated name wins.
  const byName = new Map<string, RmaDemoProfile>();
  for (const d of drivers) {
    const key = d.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, d);
  }
  let next = 0;
  const assigned = new Map<string, RmaDemoProfile>();
  return (preferredName: string): RmaDemoProfile => {
    const key = preferredName.trim().toLowerCase();
    const known = byName.get(key) ?? assigned.get(key);
    if (known) return known;
    const fallback = drivers[next++ % drivers.length];
    assigned.set(key, fallback);
    return fallback;
  };
}

async function activeUser(tx: Tx, role: 'TASS' | 'LOGISTICS') {
  return tx.user.findFirst({ where: { role, isActive: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
}

export async function runStagingRmaDemoSeed(db: PrismaClient, options: { apply?: boolean; now?: Date } = {}, env: NodeJS.ProcessEnv = process.env) {
  const apply = options.apply === true;
  const now = options.now ?? new Date();
  const target = assertStagingRmaDemoTarget(env, { apply }); // Before any read.
  const identity = await db.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (identity[0]?.database !== target.database) throw new StagingSeedError('Staging RMA demo refused: connected database does not match confirmation.');
  const admin = await db.user.findUnique({ where: { email: target.adminEmail } });
  if (!admin || admin.role !== 'ADMIN' || !admin.isActive) throw new StagingSeedError('Staging RMA demo requires an existing active Admin.');

  return db.$transaction(async tx => {
    if (apply) {
      await lockDriverDirectory(tx);
      await tx.$executeRaw`LOCK TABLE "PodAttachment", "LineItem", "RmaContact", "RemarkLog", "Comment", "Notification", "RmaLogisticsDispatch", "RmaReferenceSequence", "DeliveryRecord" IN EXCLUSIVE MODE`;
    }
    const actor = await tx.user.findUnique({ where: { id: admin.id } });
    if (!actor || actor.role !== 'ADMIN' || !actor.isActive) throw new StagingSeedError('Staging RMA demo Admin is no longer active.');

    // Staging accounts are never assumed: TASS / Logistics fall back to the confirmed Admin.
    const tassUserId = (await activeUser(tx, 'TASS'))?.id ?? actor.id;
    const logisticsUserId = (await activeUser(tx, 'LOGISTICS'))?.id ?? actor.id;
    const drivers = await tx.driver.findMany({ where: { type: 'DRIVER', isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true } });
    if (drivers.length === 0) throw new StagingSeedError('Staging RMA demo requires at least one active Driver profile; none was created or activated.');
    const assistants = await tx.driver.findMany({ where: { type: 'ASSISTANT', isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { name: true } });
    const companyKeys = new Map(Object.entries(RMA_DEMO_COMPANY_NAMES).map(([key, name]) => [localDirectoryKey(name), key]));
    const matched = await tx.company.findMany({ where: { isActive: true, normalizedName: { in: [...companyKeys.keys()] } }, select: { id: true, normalizedName: true } });
    const companyByKey = new Map(matched.map(c => [companyKeys.get(c.normalizedName)!, c.id]));
    const fallbackCompany = await tx.company.findFirst({ where: { isActive: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
    if (!fallbackCompany) throw new StagingSeedError('Staging RMA demo requires at least one active Company.');

    const assistantByName = new Map(assistants.map(a => [a.name.trim().toLowerCase(), a.name]));
    const { records, sequences } = buildRmaDemoRecords({
      companyIdFor: key => companyByKey.get(key) ?? fallbackCompany.id,
      driverFor: profileResolver(drivers),
      assistantFor: name => assistantByName.get(name.trim().toLowerCase()) ?? null,
      tassUserId, logisticsUserId,
    }, now);
    const dateStr = manilaToday(now);
    const assistantName = assistants[0]?.name ?? null;

    // RMA-scoped cleanup scope (exact column names per model).
    const existingRmaIds = (await tx.deliveryRecord.findMany({ where: { category: 'RMA' }, select: { id: true } })).map(r => r.id);
    const dispatches = await tx.rmaLogisticsDispatch.findMany({ select: { inAppNotificationId: true } });
    const dispatchNotificationIds = dispatches.map(d => d.inAppNotificationId).filter((id): id is string => !!id);
    const byRecord = { recordId: { in: existingRmaIds } };
    const byParent = { deliveryRecordId: { in: existingRmaIds } };
    const notificationWhere: Prisma.NotificationWhereInput = { OR: [
      { ...byRecord, OR: [{ recordType: 'DeliveryRecord' }, { recordType: null }] },
      { id: { in: dispatchNotificationIds } },
    ] };
    const commentWhere: Prisma.CommentWhereInput = { ...byRecord, recordType: 'DeliveryRecord' };
    const nonRmaRecords: Record<string, number> = {};
    for (const category of NON_RMA_CATEGORIES) nonRmaRecords[category] = await tx.deliveryRecord.count({ where: { category } });
    nonRmaRecords.total = await tx.deliveryRecord.count({ where: { category: { not: 'RMA' } } });
    const deletions = {
      rmaRecords: existingRmaIds.length,
      podAttachments: await tx.podAttachment.count({ where: byRecord }),
      lineItems: await tx.lineItem.count({ where: byParent }),
      rmaContacts: await tx.rmaContact.count({ where: byParent }),
      remarkLogs: await tx.remarkLog.count({ where: byRecord }),
      comments: await tx.comment.count({ where: commentWhere }),
      notifications: await tx.notification.count({ where: notificationWhere }),
      rmaLogisticsDispatches: dispatches.length,
      unlinkedCollectionReferences: await tx.deliveryRecord.count({ where: { linkedCollectionId: { in: existingRmaIds } } }),
    };
    const preserved = {
      users: await tx.user.count(), permissions: await tx.userPermission.count(),
      driverProfiles: await tx.driver.count(), linkedDriverProfiles: await tx.driver.count({ where: { userId: { not: null } } }),
      audits: await tx.auditLog.count(), rmaReferenceSequences: await tx.rmaReferenceSequence.count(), nonRmaRecords,
    };
    const create = {
      curatedRmaRecords: records.length,
      driverDemoRmaRecords: drivers.length,
      rmaContacts: records.reduce((sum, r) => sum + r.rmaContacts.create.length, 0) + drivers.length,
      lineItems: records.reduce((sum, r) => sum + r.lineItems.create.length, 0) + drivers.length,
      rmaReferenceSequenceKeys: sequences.length + 1,
      driverDemoDate: dateStr,
    };
    const result = { mode: apply ? 'applied' : 'dry-run', operation: RMA_DEMO_OPERATION, targetDatabase: target.database,
      deletions, preserved, create, externalStorageDeleted: false, driverDemoReferences: [] as string[] };
    if (!apply) return result;

    await tx.deliveryRecord.updateMany({ where: { linkedCollectionId: { in: existingRmaIds } }, data: { linkedCollectionId: null } });
    // Children first; LineItem / RmaContact / PodAttachment would also cascade.
    await tx.podAttachment.deleteMany({ where: byRecord });
    await tx.lineItem.deleteMany({ where: byParent });
    await tx.rmaContact.deleteMany({ where: byParent });
    await tx.remarkLog.deleteMany({ where: byRecord });
    await tx.comment.deleteMany({ where: commentWhere });
    await tx.notification.deleteMany({ where: notificationWhere });
    await tx.rmaLogisticsDispatch.deleteMany({});
    await tx.deliveryRecord.deleteMany({ where: { id: { in: existingRmaIds }, category: 'RMA' } });

    for (const data of records) await tx.deliveryRecord.create({ data });
    await syncRmaReferenceSequences(tx, sequences); // Raise high-water marks only.
    // Record ids hash the display name; profiles sharing a case-insensitive name
    // also hash their profile id so each gets its own deterministic run id.
    const driverNameCounts = new Map<string, number>();
    for (const d of drivers) {
      const key = d.name.trim().toLowerCase();
      driverNameCounts.set(key, (driverNameCounts.get(key) ?? 0) + 1);
    }
    for (const driver of drivers) {
      const normalized = driver.name.trim().toLowerCase();
      const idKey = (driverNameCounts.get(normalized) ?? 0) > 1 ? `${normalized}#${driver.id}` : undefined;
      const rmaReference = await allocateRmaReference(tx, 'Pull Out Slip', new Date(`${dateStr}T12:00:00+08:00`));
      result.driverDemoReferences.push(rmaReference);
      await tx.deliveryRecord.create({ data: driverDemoRmaRecord({
        dateStr, driver, rmaReference, companyId: fallbackCompany.id, assistantName,
        createdById: tassUserId, modifiedById: logisticsUserId, idKey,
      }) });
    }
    await tx.auditLog.create({ data: {
      recordId: target.database, recordType: 'StagingRmaDemoSeed', action: 'RESET', changedById: actor.id,
      previousValue: JSON.stringify({ deletions, preserved }),
      newValue: JSON.stringify({ operation: RMA_DEMO_OPERATION, created: create, preserved, externalStorageDeleted: false }),
    } });
    return result;
  }, { maxWait: 10_000, timeout: 60_000 });
}

if (require.main === module) {
  // The DB singleton is imported only after the target guard succeeds.
  void (async () => {
    const dotenv = await import('dotenv'); dotenv.config();
    if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new StagingSeedError('Usage: seed:staging:rma-demo [--apply]; default is read-only preview.');
    const apply = process.argv.includes('--apply');
    assertStagingRmaDemoTarget(process.env, { apply });
    const { prisma } = await import('../src/db.js');
    try {
      console.log(JSON.stringify(await runStagingRmaDemoSeed(prisma, { apply }), null, 2));
    } finally { await prisma.$disconnect(); }
  })().catch((error: unknown) => {
    // Never print raw DB errors or connection strings.
    const code = typeof error === 'object' && error !== null && 'code' in error &&
      typeof error.code === 'string' && /^P[0-9]{4}$/.test(error.code) ? ` (${error.code})` : '';
    console.error(error instanceof StagingSeedError ? error.message
      : `Staging RMA demo refresh stopped${code}. The transaction was rolled back; check staging counts before retrying.`);
    process.exitCode = 1;
  });
}
