import 'dotenv/config';
import { prisma } from '../src/db';

// Read-only pre/post migration report. Does not infer multiple categories from
// punctuation or create invented labels for blank legacy values.
async function main() {
  const rows = await prisma.$queryRaw<Array<{ id: string; category: string; key: string }>>`
    SELECT "id", "category", lower(btrim("category")) AS key FROM "Supplier" ORDER BY "id"`;
  const groups = new Map<string, typeof rows>();
  for (const row of rows) groups.set(row.key, [...(groups.get(row.key) ?? []), row]);
  const catalog = await prisma.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass('"SupplierCategoryAssignment"') IS NOT NULL AS present`;
  const unassigned = catalog[0].present ? await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT s."id" FROM "Supplier" s WHERE NOT EXISTS (SELECT 1 FROM "SupplierCategoryAssignment" a WHERE a."supplierId" = s."id") ORDER BY s."id"` : null;
  console.log(JSON.stringify({ supplier_count: rows.length,
    blank_supplier_ids: groups.get('')?.map(row => row.id) ?? [],
    normalized_variants: [...groups].filter(([key, group]) => key && new Set(group.map(row => row.category)).size > 1)
      .map(([key, group]) => ({ normalized_label: key, labels: [...new Set(group.map(row => row.category))], supplier_ids: group.map(row => row.id) })),
    unassigned_supplier_ids: unassigned?.map(row => row.id) ?? null,
    note: 'Legacy text is retained. Each nonblank value maps as one label; review blanks and case/space variants.' }, null, 2));
}
main().catch(() => { console.error('Supplier category report failed; verify database availability and schema.'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
