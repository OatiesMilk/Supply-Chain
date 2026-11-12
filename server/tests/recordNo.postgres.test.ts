import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { assertPermissionBackfillTarget } from '../src/services/permissionBackfill';
import { RECORD_NO_PATTERN, formatRecordNo, manilaYear } from '../src/services/recordIds';
import { BACKFILL_SQL, SEQUENCE_SYNC_SQL, previewSql } from '../src/services/recordNoBackfill';

// Runs only against the disposable seeded test database.
const target = process.env.SEED_TEST_DATABASE_URL;
class Rollback extends Error {}

async function fixtures() {
  assert.equal(process.env.DATABASE_URL, target);
  assertPermissionBackfillTarget({ DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: new URL(target!).pathname.slice(1) });
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@microgenesis.com' } });
  const company = await prisma.company.findFirstOrThrow();
  return { companyId: company.id, status: 'SCHEDULED', priority: '2 - Moderate', reference: 'RECNO-TEST', area: 'Test',
    accountManager: 'Test', deliveryDate: '2026-11-12', itemType: 'Small Item', createdById: actor.id, modifiedById: actor.id };
}

async function lastValue(category: string, year: number) {
  const row = await prisma.recordSequence.findUnique({ where: { category_year: { category, year } } });
  return row?.lastValue ?? 0;
}

test('every seeded record has a unique, well-formed record number', { skip: !target }, async () => {
  await fixtures();
  const rows = await prisma.deliveryRecord.findMany({ select: { recordNo: true, category: true, createdAt: true } });
  assert.ok(rows.length > 0);
  assert.equal(new Set(rows.map(row => row.recordNo)).size, rows.length);
  for (const row of rows) {
    assert.match(row.recordNo, RECORD_NO_PATTERN);
    assert.ok(row.recordNo.length <= 14);
    assert.ok(row.recordNo.startsWith(formatRecordNo(row.category, manilaYear(row.createdAt), 1).slice(0, -5)), row.recordNo);
  }
});

test('inserts get the next number per type, a new year restarts at 00001, and numbers cannot change', { skip: !target, timeout: 60_000 }, async () => {
  const base = await fixtures();
  const year = manilaYear(new Date());
  const before = await lastValue('PROCUREMENT_PICKUP', year);
  await assert.rejects(prisma.$transaction(async tx => {
    const first = await tx.deliveryRecord.create({ data: { ...base, id: 'recno-first', category: 'PROCUREMENT_PICKUP', draft: true } });
    const second = await tx.deliveryRecord.create({ data: { ...base, id: 'recno-second', category: 'PROCUREMENT_PICKUP' } });
    assert.equal(first.recordNo, formatRecordNo('PROCUREMENT_PICKUP', year, before + 1));
    assert.equal(second.recordNo, formatRecordNo('PROCUREMENT_PICKUP', year, before + 2));

    // 1 Jan 2031 00:30 Manila is still 31 Dec 2030 in UTC.
    const nextYear = await tx.deliveryRecord.create({ data: { ...base, id: 'recno-2031', category: 'SALES_ORDERS', createdAt: new Date('2030-12-31T16:30:00Z') } });
    assert.equal(nextYear.recordNo, 'SO-31-00001');

    // A draft keeps its number when submitted; the number itself is immutable.
    const submitted = await tx.deliveryRecord.update({ where: { id: first.id }, data: { draft: false, submittedAt: new Date() } });
    assert.equal(submitted.recordNo, first.recordNo);
    await tx.$executeRawUnsafe('SAVEPOINT change_attempt');
    await assert.rejects(tx.deliveryRecord.update({ where: { id: first.id }, data: { recordNo: 'PUP-26-99999' } }), /cannot be changed/);
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT change_attempt');
    throw new Rollback();
  }), Rollback);
});

test('parallel creates of one type get distinct consecutive numbers', { skip: !target, timeout: 60_000 }, async () => {
  const base = await fixtures();
  const year = manilaYear(new Date());
  const before = await lastValue('RMA', year);
  const ids = Array.from({ length: 20 }, (_, i) => `recno-parallel-${i}`);
  try {
    const created = await Promise.all(ids.map(id => prisma.deliveryRecord.create({ data: { ...base, id, category: 'RMA', reference: '' } })));
    const numbers = created.map(row => row.recordNo).sort();
    assert.deepEqual(numbers, Array.from({ length: 20 }, (_, i) => formatRecordNo('RMA', year, before + i + 1)));
  } finally {
    await prisma.deliveryRecord.deleteMany({ where: { id: { in: ids } } });
  }
  // Deleted numbers are never reused.
  const next = await prisma.deliveryRecord.create({ data: { ...base, id: 'recno-after-delete', category: 'RMA', reference: '' } });
  try {
    assert.equal(next.recordNo, formatRecordNo('RMA', year, before + 21));
  } finally {
    await prisma.deliveryRecord.delete({ where: { id: next.id } });
  }
});

test('backfill numbers legacy rows oldest first, includes deleted rows, matches the dry run and moves the counters', { skip: !target, timeout: 60_000 }, async () => {
  const base = await fixtures();
  await assert.rejects(prisma.$transaction(async tx => {
    // Recreate the pre-migration shape for a few legacy rows, then roll it all back.
    await tx.$executeRawUnsafe('ALTER TABLE "DeliveryRecord" DISABLE TRIGGER "DeliveryRecord_assign_record_no"');
    await tx.$executeRawUnsafe('ALTER TABLE "DeliveryRecord" ALTER COLUMN "recordNo" DROP NOT NULL');
    await tx.$executeRawUnsafe(`INSERT INTO "DeliveryRecord" (id, "recordNo", "companyId", category, status, priority, reference, area, "accountManager", "deliveryDate", "itemType", "createdById", "modifiedById", "createdAt", "updatedAt", "deletedAt")
      SELECT v.id, NULL, $1, v.category, 'SCHEDULED', '2 - Moderate', '', 'Test', 'Test', '2026-01-01', 'Small Item', $2, $2, v.created::timestamp, now(), v.deleted::timestamp
      FROM (VALUES
        ('legacy-col-b', 'ACCOUNTING_COLLECTION', '2020-03-02 00:00:00', NULL),
        ('legacy-col-a', 'ACCOUNTING_COLLECTION', '2020-03-01 00:00:00', '2020-04-01 00:00:00'),
        ('legacy-col-next-year', 'ACCOUNTING_COLLECTION', '2020-12-31 16:30:00', NULL)
      ) v(id, category, created, deleted)`, base.companyId, base.createdById);
    const preview = await tx.$queryRawUnsafe<any[]>(previewSql());
    const groups = preview.filter(row => row.category === 'ACCOUNTING_COLLECTION' && [2020, 2021].includes(row.year));
    assert.deepEqual(groups.map(row => [row.year, row.records, row.first_seq, row.last_seq]), [[2020, 2, 1, 2], [2021, 1, 1, 1]]);

    await tx.$executeRawUnsafe(BACKFILL_SQL);
    await tx.$executeRawUnsafe(SEQUENCE_SYNC_SQL);
    const rows = await tx.deliveryRecord.findMany({ where: { id: { startsWith: 'legacy-col-' } }, select: { id: true, recordNo: true }, orderBy: { id: 'asc' } });
    assert.deepEqual(Object.fromEntries(rows.map(row => [row.id, row.recordNo])), {
      'legacy-col-a': 'COL-20-00001',
      'legacy-col-b': 'COL-20-00002',
      'legacy-col-next-year': 'COL-21-00001',
    });
    const [left] = await tx.$queryRawUnsafe<any[]>('SELECT count(*)::int AS n FROM "DeliveryRecord" WHERE "recordNo" IS NULL');
    assert.equal(left.n, 0);
    const counter = await tx.recordSequence.findUnique({ where: { category_year: { category: 'ACCOUNTING_COLLECTION', year: 2020 } } });
    assert.equal(counter?.lastValue, 2);

    await tx.$executeRawUnsafe('ALTER TABLE "DeliveryRecord" ENABLE TRIGGER "DeliveryRecord_assign_record_no"');
    const next = await tx.deliveryRecord.create({ data: { ...base, id: 'legacy-col-new', category: 'ACCOUNTING_COLLECTION', createdAt: new Date('2020-06-01T00:00:00Z') } });
    assert.equal(next.recordNo, 'COL-20-00003');
    throw new Rollback();
  }), Rollback);
});
