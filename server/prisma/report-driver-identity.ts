// TSK-100: read-only report of Driver identity links for Admin review.
// Lists DRIVER logins and profiles that are not linked, duplicate names that the
// migration refused to link, and assignments that do not reference a profile.
// It never changes data. Resolve findings in Admin Panel → Users (link a login
// to a profile) or by reassigning the run in Deliveries.
//
//   npm run drivers:identity-report --workspace=mg-portal-server
import { prisma } from '../src/db';
import { classifyDriverIdentity } from '../src/services/driverIdentity';

async function main() {
  const [users, profiles, records] = await Promise.all([
    prisma.user.findMany({ where: { role: 'DRIVER' }, select: { id: true, name: true, role: true, isActive: true } }),
    prisma.driver.findMany({ where: { type: 'DRIVER' }, select: { id: true, name: true, type: true, userId: true, isActive: true } }),
    prisma.deliveryRecord.findMany({ where: { deletedAt: null, NOT: { driver: '' } }, select: { id: true, driver: true, driverId: true } }),
  ]);
  const linkedUserIds = new Set(profiles.map(p => p.userId).filter(Boolean));
  // The plan applies the migration's exact-name rules to the current data.
  const plan = classifyDriverIdentity(users, profiles, records);

  const section = (title: string, rows: string[]) => {
    console.log(`\n${title} (${rows.length})`);
    for (const row of rows) console.log(`  - ${row}`);
  };
  section('DRIVER logins without a linked profile — they see no runs',
    users.filter(u => !linkedUserIds.has(u.id)).map(u => `${u.name} <${u.id}>${u.isActive ? '' : ' (inactive)'}`));
  section('DRIVER profiles without a login — their runs are visible to no Driver',
    profiles.filter(p => !p.userId).map(p => `${p.name} <${p.id}>${p.isActive ? '' : ' (inactive)'}`));
  section('Duplicate DRIVER login names — never auto-linked', plan.duplicateUserNames);
  section('Duplicate DRIVER profile names — never auto-linked or auto-assigned', plan.duplicateProfileNames);
  section('Assignments without a Driver profile — reassign in Deliveries',
    plan.unresolvedRecords.map(r => `"${r.name}": ${r.recordIds.join(', ')}`));
  section('Exact unique matches not yet applied — review before linking/reassigning',
    [...plan.links.filter(l => !profiles.some(p => p.id === l.profileId && p.userId)).map(l => `link profile ${l.profileId} → login ${l.userId}`),
     ...plan.assignments.map(a => `record ${a.recordId} → profile ${a.profileId}`)]);
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
