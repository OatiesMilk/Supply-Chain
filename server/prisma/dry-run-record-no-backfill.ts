import 'dotenv/config';
import { prisma } from '../src/db';
import { formatRecordNo } from '../src/services/recordIds';
import { previewSql } from '../src/services/recordNoBackfill';

// Read-only dry run for the DeliveryRecord.recordNo backfill. It issues one
// SELECT inside a READ ONLY transaction, so it cannot write even by mistake.
// Run it before the migration to preview the numbers, and after it to confirm
// that nothing is left without a number.
type Row = { category: string; year: number; records: number; first_seq: number; last_seq: number; unknown_category: number };

async function main() {
  const [column] = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'DeliveryRecord' AND column_name = 'recordNo') AS present`;
  const rows = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return tx.$queryRawUnsafe<Row[]>(previewSql(column.present));
  });
  const label = (row: Row, seq: number) => row.unknown_category ? null : formatRecordNo(row.category, row.year, seq);
  const groups = rows.map(row => ({
    category: row.category,
    year: row.year,
    records: row.records,
    first_record_no: label(row, row.first_seq),
    last_record_no: label(row, row.last_seq),
    unknown_category: row.unknown_category,
  }));
  const unknown = groups.reduce((sum, group) => sum + group.unknown_category, 0);
  console.log(JSON.stringify({
    dry_run: true,
    writes_performed: 0,
    column_present: column.present,
    records_to_number: groups.reduce((sum, group) => sum + group.records, 0),
    unknown_category_records: unknown,
    migration_would_fail: unknown > 0,
    groups,
  }, null, 2));
}
main().catch(() => { console.error('Dry run failed; verify database availability and schema. Nothing was written.'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
