// TSK-115: converts legacy free-text Driver coverage to canonical Area /
// Subregion names. Dry run by default; pass --apply to write. Idempotent:
// already-canonical coverage is left untouched. Unmapped keywords are listed for
// review and dropped only on --apply. Each change is audited through the
// directory service, attributed to the first active Admin.
//
//   npm run drivers:migrate-coverage --workspace=mg-portal-server             (dry run)
//   npm run drivers:migrate-coverage --workspace=mg-portal-server -- --apply  (write)
import { prisma } from '../src/db';
import { parseCoverageAreas, updateDriverDirectory } from '../src/services/driverDirectory';
import { planCoverageMigration } from '../src/services/driverCoverage';
import { canonicalCoverage } from '../src/areaHierarchy';

async function main() {
  const apply = process.argv.includes('--apply');
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } });
  if (apply && !admin) throw new Error('An active Admin account is required to attribute the audited changes.');

  const drivers = await prisma.driver.findMany({ orderBy: { name: 'asc' } });
  let changed = 0;
  for (const driver of drivers) {
    const current = parseCoverageAreas(driver.coverageAreas);
    const plan = planCoverageMigration(current);
    if (!plan.changed) continue;
    changed++;
    console.log(`\n${driver.name} (${driver.type}${driver.isActive ? '' : ', inactive'})`);
    console.log(`  before: ${current.join(', ') || '(none)'}`);
    console.log(`  after:  ${plan.coverage.join(', ') || '(none)'}`);
    if (plan.unmapped.length) console.log(`  REVIEW — not mapped, will be dropped: ${plan.unmapped.join(', ')}`);
    if (apply) await updateDriverDirectory(prisma, driver.id, { coverageAreas: JSON.stringify(plan.coverage) }, admin!);
  }

  // Record areas are business data and are not rewritten; list legacy values for review.
  const areas = await prisma.deliveryRecord.groupBy({ by: ['area'], where: { deletedAt: null }, _count: true });
  const legacyAreas = areas.filter(a => a.area && canonicalCoverage(a.area) === null);
  if (legacyAreas.length) {
    console.log('\nRecords whose area is not in the area list (no Driver is suggested for them):');
    for (const a of legacyAreas) console.log(`  - "${a.area}": ${a._count} record(s)`);
  }

  console.log(`\n${changed} of ${drivers.length} directory entries ${apply ? 'updated' : 'would change'}.${apply || !changed ? '' : ' Re-run with --apply to write.'}`);
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
