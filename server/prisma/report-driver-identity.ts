// TSK-100: read-only, count-only legacy Driver identity preview for Admin review.
// Names, IDs, record details, and proposed changes are intentionally omitted.
// This command never links logins or reassigns records; Admin resolves findings
// through the existing Users and Deliveries flows.
// It selects only pre-link columns and previews exact-name candidates in memory.
//
//   npm run drivers:identity-report --workspace=mg-portal-server
import { prisma } from '../src/db';
import { summarizeDriverIdentity } from '../src/services/driverIdentityReport';

async function main() {
  const [users, profiles, records] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'DRIVER' },
      select: { id: true, name: true, role: true, isActive: true },
    }),
    prisma.driver.findMany({
      where: { type: 'DRIVER' },
      select: { id: true, name: true, type: true, isActive: true },
    }),
    prisma.deliveryRecord.findMany({
      where: { deletedAt: null, NOT: { driver: '' } },
      select: { id: true, driver: true },
    }),
  ]);

  const summary = summarizeDriverIdentity(users, profiles, records);
  console.log('Driver identity reconciliation summary (counts only)');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch(() => {
    // Avoid leaking database errors or record data into the sanitized report output.
    console.error('Driver identity report failed. No changes were made.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
