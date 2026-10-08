// Stable Driver identity (TSK-100). The rules here mirror the backfill in
// prisma/migrations/20261008020000_link_driver_identity: exact names only, and
// any name shared by more than one login or profile is left for Admin review.

export interface IdentityUser { id: string; name: string; role: string }
export interface IdentityProfile { id: string; name: string; type: string; userId?: string | null }
export interface IdentityRecord { id: string; driver: string; driverId?: string | null }

export interface DriverIdentityPlan {
  links: { profileId: string; userId: string }[];
  assignments: { recordId: string; profileId: string }[];
  duplicateUserNames: string[];
  duplicateProfileNames: string[];
  unlinkedUsers: IdentityUser[];
  unlinkedProfiles: IdentityProfile[];
  unresolvedRecords: { name: string; recordIds: string[] }[];
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

export function classifyDriverIdentity(
  users: IdentityUser[], profiles: IdentityProfile[], records: IdentityRecord[],
): DriverIdentityPlan {
  const driverUsers = users.filter(u => u.role === 'DRIVER');
  const driverProfiles = profiles.filter(p => p.type === 'DRIVER');
  const userCounts = countBy(driverUsers, u => u.name);
  const profileCounts = countBy(driverProfiles, p => p.name);

  const links: DriverIdentityPlan['links'] = [];
  for (const profile of driverProfiles) {
    if (profileCounts.get(profile.name) !== 1 || userCounts.get(profile.name) !== 1) continue;
    const user = driverUsers.find(u => u.name === profile.name)!;
    links.push({ profileId: profile.id, userId: user.id });
  }

  const assignments: DriverIdentityPlan['assignments'] = [];
  const unresolved = new Map<string, string[]>();
  for (const record of records) {
    if (!record.driver || record.driverId) continue;
    const matches = driverProfiles.filter(p => p.name === record.driver);
    if (matches.length === 1) assignments.push({ recordId: record.id, profileId: matches[0].id });
    else unresolved.set(record.driver, [...(unresolved.get(record.driver) ?? []), record.id]);
  }

  const linkedUsers = new Set(links.map(l => l.userId));
  const linkedProfiles = new Set(links.map(l => l.profileId));
  return {
    links,
    assignments,
    duplicateUserNames: [...userCounts].filter(([, n]) => n > 1).map(([name]) => name),
    duplicateProfileNames: [...profileCounts].filter(([, n]) => n > 1).map(([name]) => name),
    unlinkedUsers: driverUsers.filter(u => !linkedUsers.has(u.id)),
    unlinkedProfiles: driverProfiles.filter(p => !linkedProfiles.has(p.id)),
    unresolvedRecords: [...unresolved].map(([name, recordIds]) => ({ name, recordIds })),
  };
}
