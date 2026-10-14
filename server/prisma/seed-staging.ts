import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { assertStagingSeedTarget, StagingSeedError } from './staging-seed-safety';
import { lockDriverDirectory } from '../src/services/driverDirectory';

const routeRow = z.object({
  sheet: z.string().min(1), row: z.number().int().positive(),
  kind: z.enum(['driver-route', 'courier-route']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }),
  company: z.string().min(1), driver: z.string(), helper: z.string(), owner: z.string(),
  vehicle: z.string(), priority: z.string(), documents: z.string(), salesOrderNumber: z.string(),
  reference: z.string(), waybill: z.string(), remarks: z.string(), area: z.string(),
  timeIn: z.string(), timeOut: z.string(), signedByClient: z.string(), mode: z.string(),
  additionalRemarks: z.string(), sourceCells: z.record(z.string(), z.string()),
});
const sourceSchema = z.object({
  version: z.literal(1),
  source: z.object({ fileName: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    description: z.string(), sheetHeaders: z.record(z.string(), z.record(z.string(), z.string())) }),
  rows: z.array(routeRow).min(1),
});
export type StagingRouteSource = z.infer<typeof sourceSchema>;
type Row = StagingRouteSource['rows'][number];
const MARKER = 'excel-route-staging-v1';
const DEFAULTS = { draft: true, status: 'PENDING', priority: '1 - Low', category: 'DELIVERY', itemType: '' } as const;

// Canonical JSON makes fingerprints independent of object property order.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).sort().map(key => JSON.stringify(key) + ':' + canonical(object[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export function stagingEntityId(sourceHash: string, kind: string, key: string): string {
  if (kind === 'DeliveryRecord') {
    const [sheet, row] = JSON.parse(key) as [string, number];
    return `REC-STG-${sourceHash.slice(0, 12)}-${sheet.replace(/[^A-Za-z0-9_-]/g, '-')}-${row}`;
  }
  return 'STG-' + hash([MARKER, sourceHash, kind, key]);
}

export function validateStagingSource(value: unknown): StagingRouteSource {
  const source = sourceSchema.parse(value);
  const seen = new Set<string>();
  for (const row of source.rows) {
    const identity = JSON.stringify([row.sheet, row.row]);
    if (seen.has(identity)) throw new StagingSeedError('Staging source contains duplicate worksheet-row identities.');
    seen.add(identity);
    if (!source.source.sheetHeaders[row.sheet]) throw new StagingSeedError('Staging source row has no worksheet headers.');
    if (row.kind === 'driver-route' && !row.driver) throw new StagingSeedError('Staging source driver route must retain its source driver name.');
    if (row.kind === 'courier-route' && row.driver) throw new StagingSeedError('Staging source courier ownership cannot become a Driver assignment.');
    if (row.priority && !['1 - Low', '2 - Moderate', '3 - High'].includes(row.priority)) {
      throw new StagingSeedError('Staging source priority requires explicit review before import.');
    }
  }
  return source;
}

export function stagingRecordData(source: StagingRouteSource, row: Row, adminId: string) {
  const key = JSON.stringify([row.sheet, row.row]);
  const reference = row.reference || row.documents || row.salesOrderNumber;
  const context = [
    `[Staging Excel source: ${source.source.fileName}; sheet ${row.sheet}, row ${row.row}; defaults: draft/PENDING/${row.priority || DEFAULTS.priority}/DELIVERY]`,
    row.kind === 'courier-route' ? `Source owner: ${row.owner}; mode: ${row.mode}` : '',
    row.waybill ? `Source waybill: ${row.waybill}` : '',
    row.additionalRemarks ? `Source additional remarks: ${row.additionalRemarks}` : '',
  ].filter(Boolean).join('\n');
  const documents = [row.documents ? `Documents: ${row.documents}` : '', row.salesOrderNumber ? `S.O Number: ${row.salesOrderNumber}` : '', row.reference ? `Reference: ${row.reference}` : ''].filter(Boolean).join('\n');
  return {
    id: stagingEntityId(source.source.sha256, 'DeliveryRecord', key),
    companyId: stagingEntityId(source.source.sha256, 'Company', row.company),
    ...DEFAULTS, priority: row.priority || DEFAULTS.priority,
    reference, remarks: [row.remarks, context].filter(Boolean).join('\n'),
    vehicle: row.vehicle, area: row.area, deliveryDate: row.date,
    driver: row.kind === 'driver-route' ? row.driver : '',
    driverId: row.kind === 'driver-route' ? stagingEntityId(source.source.sha256, 'DRIVER', row.driver) : null,
    driverAssistants: JSON.stringify(row.kind === 'driver-route' && row.helper ? [row.helper] : []),
    timeIn: row.timeIn || null, timeOut: row.timeOut || null, receivedBy: null,
    accountManager: '', itemDescription: documents, address: '', collectionVerified: false,
    createdById: adminId, modifiedById: adminId,
  };
}

async function resetOperationalData(tx: Prisma.TransactionClient, apply: boolean) {
  if (apply) await tx.$executeRaw`LOCK TABLE "PodAttachment", "LineItem", "RemarkLog", "Comment", "Notification", "NotificationLog", "DailyStatusSnapshot", "InventoryTransaction", "InventoryItem", "Product", "DeliveryRecord", "Company", "Customer", "Supplier", "Driver" IN EXCLUSIVE MODE`;
  // Children precede parents. User/UserPermission/AuditLog/OAuthLoginState are
  // deliberately excluded; linked Driver profiles preserve account ownership.
  const operations = [
    { name: 'podAttachments', count: () => tx.podAttachment.count(), remove: () => tx.podAttachment.deleteMany() },
    { name: 'lineItems', count: () => tx.lineItem.count(), remove: () => tx.lineItem.deleteMany() },
    { name: 'remarks', count: () => tx.remarkLog.count(), remove: () => tx.remarkLog.deleteMany() },
    { name: 'comments', count: () => tx.comment.count(), remove: () => tx.comment.deleteMany() },
    { name: 'notifications', count: () => tx.notification.count(), remove: () => tx.notification.deleteMany() },
    { name: 'notificationLogs', count: () => tx.notificationLog.count(), remove: () => tx.notificationLog.deleteMany() },
    { name: 'statusSnapshots', count: () => tx.dailyStatusSnapshot.count(), remove: () => tx.dailyStatusSnapshot.deleteMany() },
    { name: 'inventoryTransactions', count: () => tx.inventoryTransaction.count(), remove: () => tx.inventoryTransaction.deleteMany() },
    { name: 'inventoryItems', count: () => tx.inventoryItem.count(), remove: () => tx.inventoryItem.deleteMany() },
    { name: 'products', count: () => tx.product.count(), remove: () => tx.product.deleteMany() },
    { name: 'records', count: () => tx.deliveryRecord.count(), remove: () => tx.deliveryRecord.deleteMany() },
    { name: 'companies', count: () => tx.company.count(), remove: () => tx.company.deleteMany() },
    { name: 'customers', count: () => tx.customer.count(), remove: () => tx.customer.deleteMany() },
    { name: 'suppliers', count: () => tx.supplier.count(), remove: () => tx.supplier.deleteMany() },
    { name: 'unlinkedProfiles', count: () => tx.driver.count({ where: { userId: null } }), remove: () => tx.driver.deleteMany({ where: { userId: null } }) },
  ];
  const preserved = { users: await tx.user.count(), permissions: await tx.userPermission.count(),
    linkedDriverProfiles: await tx.driver.count({ where: { userId: { not: null } } }), audits: await tx.auditLog.count() };
  const deletions: Record<string, number> = {};
  for (const operation of operations) {
    deletions[operation.name] = apply ? (await operation.remove()).count : await operation.count();
  }
  return { deletions, preserved };
}

export async function runStagingSeed(db: PrismaClient, rawSource: unknown, options: { apply?: boolean; reset?: boolean } = {}, env: NodeJS.ProcessEnv = process.env) {
  const target = assertStagingSeedTarget(env, options); // Before even a read or transaction.
  const source = validateStagingSource(rawSource);
  const apply = options.apply === true;
  const reset = options.reset === true;
  const identity = await db.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (identity[0]?.database !== target.database) throw new StagingSeedError('Staging seed refused: connected database does not match confirmation.');
  const admin = await db.user.findUnique({ where: { email: target.adminEmail } });
  if (!admin || admin.role !== 'ADMIN' || !admin.isActive) throw new StagingSeedError('Staging seed requires an existing active Admin; provision one through the approved account process first.');

  return db.$transaction(async tx => {
    if (apply) await lockDriverDirectory(tx);
    const actor = await tx.user.findUnique({ where: { id: admin.id } });
    if (!actor || actor.role !== 'ADMIN' || !actor.isActive) throw new StagingSeedError('Staging seed Admin is no longer active.');
    const actorId = actor.id;
    const resetPlan = reset ? await resetOperationalData(tx, apply) : null;
    const resetRunId = reset ? randomUUID() : null;
    const counts = { mode: apply ? 'applied' : 'dry-run', operation: reset ? 'reset-and-reseed' : 'additive', sourceRows: source.rows.length,
      ...(resetPlan ? { reset: resetPlan } : {}),
      companies: { create: 0, skip: 0 }, profiles: { create: 0, skip: 0 }, records: { create: 0, skip: 0 } };

    async function entity(kind: 'Company' | 'DRIVER' | 'ASSISTANT' | 'DeliveryRecord', key: string, content: unknown,
      existing: unknown, create: () => Promise<unknown>, bucket: { create: number; skip: number }) {
      const id = stagingEntityId(source.source.sha256, kind, key);
      const auditId = 'STG-AUDIT-' + hash(id);
      const provenance = { seed: MARKER, version: source.version, fileName: source.source.fileName,
        workbookSha256: source.source.sha256, kind, key, contentSha256: hash(content) };
      const audit = await tx.auditLog.findUnique({ where: { id: auditId } });
      if (existing || audit) {
        let saved: unknown;
        try { saved = JSON.parse(audit?.newValue || 'null')?.provenance; } catch { saved = null; }
        if ((!existing && !reset) || !audit || canonical(saved) !== canonical(provenance) || audit.recordId !== id) {
          throw new StagingSeedError(`Staging source identity/content collision for ${kind} ${id}; transaction changes will not be committed.`);
        }
        if (existing) { bucket.skip++; return; }
      }
      bucket.create++;
      if (!apply) return;
      await create();
      await tx.auditLog.create({ data: {
        id: audit ? `${auditId}-RESET-${resetRunId}` : auditId, recordId: id, recordType: kind === 'DRIVER' || kind === 'ASSISTANT' ? 'Driver' : kind,
        action: 'CREATE', changedById: actorId, previousValue: null,
        newValue: JSON.stringify({ provenance, source: content, ...(reset ? { resetRunId } : {}),
          ...(kind === 'DeliveryRecord' ? { stagingDefaults: DEFAULTS, referenceMapping: 'Reference (D), otherwise Documents or S.O Number (C); original fields retained separately' } : {}) }),
      } });
    }

    const companies = [...new Set(source.rows.map(row => row.company))];
    for (const name of companies) {
      const id = stagingEntityId(source.source.sha256, 'Company', name);
      await entity('Company', name, { name }, reset ? null : await tx.company.findUnique({ where: { id } }),
        () => tx.company.create({ data: { id, name, sapNumber: '', address: '', contactPerson: '' } }), counts.companies);
    }
    const profiles = new Map<string, { name: string; type: 'DRIVER' | 'ASSISTANT' }>();
    for (const row of source.rows.filter(row => row.kind === 'driver-route')) {
      profiles.set('DRIVER:' + row.driver, { name: row.driver, type: 'DRIVER' });
      if (row.helper) profiles.set('ASSISTANT:' + row.helper, { name: row.helper, type: 'ASSISTANT' });
    }
    for (const profile of profiles.values()) {
      const id = stagingEntityId(source.source.sha256, profile.type, profile.name);
      const existing = await tx.driver.findUnique({ where: { id } });
      await entity(profile.type, profile.name, profile, reset && !existing?.userId ? null : existing,
        () => tx.driver.create({ data: { id, ...profile, isActive: false, userId: null, coverageAreas: '[]', createdBy: actor.name, modifiedBy: actor.name } }), counts.profiles);
    }
    for (const row of source.rows) {
      const data = stagingRecordData(source, row, actor.id);
      await entity('DeliveryRecord', JSON.stringify([row.sheet, row.row]), row,
        reset ? null : await tx.deliveryRecord.findUnique({ where: { id: data.id } }), () => tx.deliveryRecord.create({ data }), counts.records);
    }
    if (reset && apply) await tx.auditLog.create({ data: {
      id: `STG-RESET-${resetRunId}`, recordId: target.database, recordType: 'StagingSeed', action: 'RESET', changedById: actorId,
      previousValue: JSON.stringify(resetPlan), newValue: JSON.stringify({ workbookSha256: source.source.sha256,
        created: { companies: counts.companies.create, profiles: counts.profiles.create, records: counts.records.create },
        preserved: resetPlan!.preserved, externalStorageDeleted: false }),
    } });
    return counts;
  }, { maxWait: 10_000, timeout: 60_000 });
}

if (require.main === module) {
  // Importing the DB singleton is deferred until the CLI guard succeeds.
  void (async () => {
    const dotenv = await import('dotenv'); dotenv.config();
    if (process.argv.slice(2).some(arg => !['--apply', '--reset'].includes(arg))) throw new StagingSeedError('Usage: seed:staging [--reset] [--apply]; default is read-only preview.');
    const apply = process.argv.includes('--apply');
    const reset = process.argv.includes('--reset');
    assertStagingSeedTarget(process.env, { apply, reset });
    const { prisma } = await import('../src/db.js');
    try {
      const source = require('./data/staging-route-source.json');
      console.log(JSON.stringify(await runStagingSeed(prisma, source, { apply, reset }), null, 2));
    } finally { await prisma.$disconnect(); }
  })().catch((error: unknown) => {
    // Only our controlled diagnostics are printed; never raw DB errors or URLs.
    const message = error instanceof StagingSeedError
      ? error.message : 'Staging seed failed: database or source validation failed; transactional changes were not committed.';
    console.error(message); process.exitCode = 1;
  });
}
