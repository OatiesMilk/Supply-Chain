import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { assertPermissionBackfillTarget } from '../src/services/permissionBackfill';
import { BACKFILL_COUNTS_SQL, BACKFILL_FROM_AUDIT_SQL, BACKFILL_FROM_CREATED_SQL } from '../src/services/submittedAtBackfill';

// Runs only against the disposable seeded test database, inside a transaction
// that is always rolled back.
const target = process.env.SEED_TEST_DATABASE_URL;
class Rollback extends Error {}

test('submittedAt backfill: latest audit submission wins, createdAt is the fallback, drafts stay null', { skip: !target, timeout: 60_000 }, async () => {
  assert.equal(process.env.DATABASE_URL, target);
  assertPermissionBackfillTarget({ DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: new URL(target!).pathname.slice(1) });
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@microgenesis.com' } });
  const company = await prisma.company.findFirstOrThrow();
  const created = new Date('2026-10-01T00:00:00Z');
  const first = new Date('2026-10-03T00:00:00Z');
  const second = new Date('2026-10-09T00:00:00Z');
  const base = { companyId: company.id, category: 'RMA' as const, status: 'SCHEDULED', priority: '2 - Moderate', reference: '',
    area: 'Test', accountManager: 'Test', deliveryDate: '2026-11-03', itemType: 'Small Item', createdById: actor.id, modifiedById: actor.id, createdAt: created };
  const audit = (recordId: string, timestamp: Date, from: 'Yes' | 'No', to: 'Yes' | 'No') => ({ recordId, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: actor.id, timestamp,
    previousValue: JSON.stringify({ is_draft: from }), newValue: JSON.stringify({ is_draft: to }) });
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.deliveryRecord.createMany({ data: [
      { ...base, id: 'sa-resubmitted', draft: false },
      { ...base, id: 'sa-created-submitted', draft: false },
      { ...base, id: 'sa-draft', draft: true },
    ] });
    await tx.auditLog.createMany({ data: [
      audit('sa-resubmitted', first, 'Yes', 'No'),
      audit('sa-resubmitted', new Date('2026-10-05T00:00:00Z'), 'No', 'Yes'),
      audit('sa-resubmitted', second, 'Yes', 'No'),
    ] });
    await tx.auditLog.create({ data: { ...audit('sa-created-submitted', first, 'No', 'No'), previousValue: 'not json {' } });
    const [counts] = await tx.$queryRawUnsafe<any[]>(BACKFILL_COUNTS_SQL);
    assert.ok(counts.from_audit >= 1 && counts.from_created_at >= 1 && counts.drafts_left_null >= 1);
    await tx.$executeRawUnsafe(BACKFILL_FROM_AUDIT_SQL);
    await tx.$executeRawUnsafe(BACKFILL_FROM_CREATED_SQL);
    const rows = await tx.deliveryRecord.findMany({ where: { id: { in: ['sa-resubmitted', 'sa-created-submitted', 'sa-draft'] } }, select: { id: true, submittedAt: true } });
    const byId = Object.fromEntries(rows.map(row => [row.id, row.submittedAt]));
    assert.deepEqual(byId['sa-resubmitted'], second);
    assert.deepEqual(byId['sa-created-submitted'], created);
    assert.equal(byId['sa-draft'], null);
    throw new Rollback();
  }), Rollback);
});
