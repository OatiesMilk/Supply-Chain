import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { assertPermissionBackfillTarget } from '../src/services/permissionBackfill';
import { allocateRmaReference } from '../src/services/rmaReference';

// Runs only against the disposable seeded test database. Every counter it
// touches is dated in 2099 and removed afterwards, so real daily numbering is untouched.
const target = process.env.SEED_TEST_DATABASE_URL;
class Rollback extends Error {}
const FAR_DAY = new Date('2099-03-04T04:00:00Z'); // 2099-03-04 12:00 Manila
const FAR_DATES = ['2099-03-04', '2099-12-31', '2100-01-01'];

async function fixtures() {
  assert.equal(process.env.DATABASE_URL, target);
  assertPermissionBackfillTarget({ DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: new URL(target!).pathname.slice(1) });
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@microgenesis.com' } });
  const company = await prisma.company.findFirstOrThrow();
  return { companyId: company.id, status: 'SCHEDULED', priority: '2 - Moderate', reference: '', area: 'Test', category: 'RMA',
    accountManager: 'Test', deliveryDate: '2099-03-04', itemType: 'Small Item', createdById: actor.id, modifiedById: actor.id };
}
async function cleanup(ids: string[]) {
  await prisma.deliveryRecord.deleteMany({ where: { id: { in: ids } } });
  await prisma.rmaReferenceSequence.deleteMany({ where: { manilaDate: { in: FAR_DATES } } });
}

test('20 parallel saves across movement methods get distinct consecutive slip references', { skip: !target, timeout: 60_000 }, async () => {
  const base = await fixtures();
  const ids = Array.from({ length: 20 }, (_, i) => `rmaref-parallel-${i}`);
  try {
    await cleanup(ids);
    const created = await Promise.all(ids.map((id, i) => prisma.$transaction(async tx => {
      const rmaReference = await allocateRmaReference(tx, 'Pull Out Slip', FAR_DAY);
      return tx.deliveryRecord.create({ data: { ...base, id, rmaType: 'Pull Out Slip', rmaReference, draft: i % 3 === 0,
        rmaMovement: i % 2 ? 'LOGISTICS_TRANSPORT' : 'INTERNAL_NO_DRIVER' } });
    })));
    const references = created.map(row => row.rmaReference).sort();
    assert.deepEqual(references, Array.from({ length: 20 }, (_, i) => `POS030499-${String(i + 1).padStart(2, '0')}`));
    const counter = await prisma.rmaReferenceSequence.findUnique({ where: { prefix_manilaDate: { prefix: 'POS', manilaDate: '2099-03-04' } } });
    assert.equal(counter?.lastValue, 20);
  } finally {
    await cleanup(ids);
  }
});

test('the counter resets at Manila midnight and rolls back with a failed save', { skip: !target, timeout: 60_000 }, async () => {
  await fixtures();
  try {
    await cleanup([]);
    // 2099-12-31 23:59:59 Manila vs 2100-01-01 00:00:00 Manila.
    assert.equal(await prisma.$transaction(tx => allocateRmaReference(tx, 'Return to Customer Slip', new Date('2099-12-31T15:59:59Z'))), 'RTC123199-01');
    assert.equal(await prisma.$transaction(tx => allocateRmaReference(tx, 'Return to Customer Slip', new Date('2099-12-31T16:00:00Z'))), 'RTC010100-01');
    await assert.rejects(prisma.$transaction(async tx => {
      assert.equal(await allocateRmaReference(tx, 'Return to Customer Slip', new Date('2099-12-31T16:00:00Z')), 'RTC010100-02');
      throw new Rollback();
    }), Rollback);
    assert.equal(await prisma.$transaction(tx => allocateRmaReference(tx, 'Return to Customer Slip', new Date('2099-12-31T16:00:00Z'))), 'RTC010100-02',
      'a rolled-back save never consumes a number');
  } finally {
    await cleanup([]);
  }
});

test('the immutability trigger and partial unique index protect allocated references', { skip: !target, timeout: 60_000 }, async () => {
  const base = await fixtures();
  await assert.rejects(prisma.$transaction(async tx => {
    const reference = await allocateRmaReference(tx, 'Transfer Out Slip', FAR_DAY);
    const row = await tx.deliveryRecord.create({ data: { ...base, id: 'rmaref-trigger', rmaType: 'Transfer Out Slip', rmaReference: reference, isInternalTransfer: true } });
    assert.equal(row.isInternalTransfer, true);
    for (const value of ['TXO030499-99', null, '']) {
      await tx.$executeRawUnsafe('SAVEPOINT change_attempt');
      await assert.rejects(tx.deliveryRecord.update({ where: { id: row.id }, data: { rmaReference: value } }), /cannot be changed once assigned/);
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT change_attempt');
    }
    // Other fields stay editable.
    assert.equal((await tx.deliveryRecord.update({ where: { id: row.id }, data: { area: 'Makati' } })).rmaReference, reference);
    // A legacy row without a reference may still receive one.
    const legacy = await tx.deliveryRecord.create({ data: { ...base, id: 'rmaref-legacy', rmaReference: null } });
    const assigned = await allocateRmaReference(tx, 'Transfer Out Slip', FAR_DAY);
    assert.equal((await tx.deliveryRecord.update({ where: { id: legacy.id }, data: { rmaReference: assigned } })).rmaReference, assigned);
    // Duplicate canonical references are rejected; NULLs and legacy free text may repeat.
    await tx.$executeRawUnsafe('SAVEPOINT duplicate_attempt');
    await assert.rejects(tx.deliveryRecord.create({ data: { ...base, id: 'rmaref-duplicate', rmaReference: reference } }), /Unique constraint|P2002/);
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT duplicate_attempt');
    for (const [id, rmaReference] of [['rmaref-null-a', null], ['rmaref-null-b', null], ['rmaref-free-a', 'LEGACY-DUP'], ['rmaref-free-b', 'LEGACY-DUP']] as const) {
      await tx.deliveryRecord.create({ data: { ...base, id, rmaReference } });
    }
    const [index] = await tx.$queryRawUnsafe<any[]>(`SELECT indexdef FROM pg_indexes WHERE indexname = 'DeliveryRecord_rmaReference_auto_key'`);
    assert.match(index.indexdef, /UNIQUE INDEX/);
    const [rls] = await tx.$queryRawUnsafe<any[]>(`SELECT relrowsecurity FROM pg_class WHERE relname = 'RmaReferenceSequence'`);
    assert.equal(rls.relrowsecurity, true);
    throw new Rollback();
  }), Rollback);
  await cleanup([]);
});
