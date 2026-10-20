import { classifyDriverIdentity, type IdentityRecord, type IdentityUser, type IdentityProfile } from './driverIdentity';

export interface DriverIdentityReportUser extends IdentityUser {
  isActive: boolean;
}

export interface DriverIdentityReportProfile extends IdentityProfile {
  isActive: boolean;
}

export interface DriverIdentityReportSummary {
  driverUserCount: number;
  inactiveDriverUserCount: number;
  driverProfileCount: number;
  inactiveDriverProfileCount: number;
  exactUniqueNameMatchCount: number;
  ambiguousDriverUserCount: number;
  ambiguousDriverUserNameGroupCount: number;
  ambiguousDriverProfileCount: number;
  ambiguousDriverProfileNameGroupCount: number;
  assignedDriverNameRecordCount: number;
  assignedRecordsWithoutUniqueDriverLoginMatchCount: number;
  assignedRecordsWithInactiveUniqueDriverMatchCount: number;
  unresolvedAssignedDriverNameRecordCount: number;
}

/**
 * Summarize the legacy Driver directory without returning names, IDs, or record
 * details. This is a read-only exact-name preview; it never links users or
 * reassigns records. The legacy schema has no persisted identity or assignment
 * foreign keys, so unique name matches are candidates, not evidence of a link.
 */
export function summarizeDriverIdentity(
  users: DriverIdentityReportUser[],
  profiles: DriverIdentityReportProfile[],
  records: IdentityRecord[],
): DriverIdentityReportSummary {
  const driverUsers = users.filter(user => user.role === 'DRIVER');
  const driverProfiles = profiles.filter(profile => profile.type === 'DRIVER');
  const plan = classifyDriverIdentity(driverUsers, driverProfiles, records);
  const ambiguousUserNames = new Set(plan.duplicateUserNames);
  const ambiguousProfileNames = new Set(plan.duplicateProfileNames);
  const profilesById = new Map(driverProfiles.map(profile => [profile.id, profile]));
  const profilesByName = new Map(driverProfiles.map(profile => [profile.name, profile]));
  const usersByName = new Map(driverUsers.map(user => [user.name, user]));
  const exactMatchNames = new Set(plan.links.flatMap(link => {
    const profile = profilesById.get(link.profileId);
    return profile ? [profile.name] : [];
  }));
  const assignedRecords = records.filter(record => record.driver.trim().length > 0);
  const unresolvedRecordIds = new Set(plan.unresolvedRecords.flatMap(finding => finding.recordIds));

  return {
    driverUserCount: driverUsers.length,
    inactiveDriverUserCount: driverUsers.filter(user => !user.isActive).length,
    driverProfileCount: driverProfiles.length,
    inactiveDriverProfileCount: driverProfiles.filter(profile => !profile.isActive).length,
    exactUniqueNameMatchCount: plan.links.length,
    ambiguousDriverUserCount: driverUsers.filter(user => ambiguousUserNames.has(user.name)).length,
    ambiguousDriverUserNameGroupCount: ambiguousUserNames.size,
    ambiguousDriverProfileCount: driverProfiles.filter(profile => ambiguousProfileNames.has(profile.name)).length,
    ambiguousDriverProfileNameGroupCount: ambiguousProfileNames.size,
    assignedDriverNameRecordCount: assignedRecords.length,
    assignedRecordsWithoutUniqueDriverLoginMatchCount: assignedRecords.filter(record => !exactMatchNames.has(record.driver)).length,
    assignedRecordsWithInactiveUniqueDriverMatchCount: assignedRecords.filter(record => {
      const profile = profilesByName.get(record.driver);
      const user = usersByName.get(record.driver);
      return exactMatchNames.has(record.driver) && !!profile && !!user && (!profile.isActive || !user.isActive);
    }).length,
    unresolvedAssignedDriverNameRecordCount: assignedRecords.filter(record => unresolvedRecordIds.has(record.id)).length,
  };
}
