import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDriverIdentity } from '../src/services/driverIdentityReport';

test('legacy Driver identity preview is count-only and covers inactive, ambiguous, and unresolved assigned names', () => {
  const summary = summarizeDriverIdentity(
    [
      { id: 'user-leo', name: 'Leo Driver', role: 'DRIVER', isActive: true },
      { id: 'user-pat-1', name: 'Pat Cruz', role: 'DRIVER', isActive: true },
      { id: 'user-pat-2', name: 'Pat Cruz', role: 'DRIVER', isActive: true },
      { id: 'user-inactive', name: 'Inactive Driver', role: 'DRIVER', isActive: false },
      { id: 'user-staff', name: 'Staff', role: 'LOGISTICS', isActive: true },
    ],
    [
      { id: 'profile-leo', name: 'Leo Driver', type: 'DRIVER', isActive: true },
      { id: 'profile-pat-1', name: 'Pat Cruz', type: 'DRIVER', isActive: true },
      { id: 'profile-pat-2', name: 'Pat Cruz', type: 'DRIVER', isActive: true },
      { id: 'profile-inactive', name: 'Inactive Driver', type: 'DRIVER', isActive: false },
      { id: 'profile-assistant', name: 'Assistant', type: 'ASSISTANT', isActive: false },
    ],
    [
      { id: 'record-leo', driver: 'Leo Driver' },
      { id: 'record-pat', driver: 'Pat Cruz' },
      { id: 'record-inactive', driver: 'Inactive Driver' },
      { id: 'record-former', driver: 'Former Driver' },
      { id: 'record-ambiguous-name', driver: 'Pat Cruz' },
      { id: 'record-unknown-name', driver: 'Former Driver' },
      { id: 'record-whitespace', driver: '   ' },
      { id: 'record-empty', driver: '' },
    ],
  );

  assert.deepEqual(summary, {
    driverUserCount: 4,
    inactiveDriverUserCount: 1,
    driverProfileCount: 4,
    inactiveDriverProfileCount: 1,
    exactUniqueNameMatchCount: 2,
    ambiguousDriverUserCount: 2,
    ambiguousDriverUserNameGroupCount: 1,
    ambiguousDriverProfileCount: 2,
    ambiguousDriverProfileNameGroupCount: 1,
    assignedDriverNameRecordCount: 6,
    assignedRecordsWithoutUniqueDriverLoginMatchCount: 4,
    assignedRecordsWithInactiveUniqueDriverMatchCount: 1,
    unresolvedAssignedDriverNameRecordCount: 4,
  });

  assert.ok(Object.values(summary).every(value => typeof value === 'number'));
  const serialized = JSON.stringify(summary);
  for (const privateValue of [
    'user-leo', 'profile-leo', 'record-leo', 'Leo Driver', 'Pat Cruz', 'Former Driver',
  ]) {
    assert.ok(!serialized.includes(privateValue), `summary exposed ${privateValue}`);
  }
});
