import 'dotenv/config';
import { prisma } from '../src/db';
import { BACKFILL_COUNTS_SQL } from '../src/services/submittedAtBackfill';

// Read-only dry run for the DeliveryRecord.submittedAt backfill. It issues one
// SELECT inside a READ ONLY transaction, so it cannot write even by mistake.
// Run it before the migration, and again after to confirm nothing is left.
async function main() {
  const column = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'DeliveryRecord' AND column_name = 'submittedAt') AS present`;
  if (!column[0].present) {
    console.log(JSON.stringify({ column_present: false, note: 'submittedAt does not exist yet. Counts assume every non-draft record is unset.' }));
  }
  const rows = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    if (column[0].present) return tx.$queryRawUnsafe<Array<Record<string, number>>>(BACKFILL_COUNTS_SQL);
    return tx.$queryRawUnsafe<Array<Record<string, number>>>(BACKFILL_COUNTS_SQL.replace(/r\."submittedAt" IS NULL/g, 'true').replace(/r\."submittedAt" IS NOT NULL/g, 'false'));
  });
  const counts = rows[0];
  console.log(JSON.stringify({
    dry_run: true,
    writes_performed: 0,
    column_present: column[0].present,
    rule_1_latest_audit_submission: counts.from_audit,
    rule_2_created_at_fallback: counts.from_created_at,
    rule_3_drafts_left_null: counts.drafts_left_null,
    already_set: counts.already_set,
    total_records: counts.total,
  }, null, 2));
}
main().catch(() => { console.error('Dry run failed; verify database availability and schema. Nothing was written.'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
