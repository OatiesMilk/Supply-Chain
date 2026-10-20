import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { classifyDriverIdentity } from '../src/services/driverIdentity';
import { DriverLinkError, linkDriverLogin, unlinkDriverLogin } from '../src/services/driverLogin';

// TSK-100 backfill rules: exact names only; duplicates are never linked or assigned.
test('backfill links exact unique names and leaves duplicate or near-match names for Admin review', () => {
  const users = [
    { id: 'u-leo', name: 'Leo Driver', role: 'DRIVER' },
    { id: 'u-pat-1', name: 'Pat Cruz', role: 'DRIVER' },
    { id: 'u-pat-2', name: 'Pat Cruz', role: 'DRIVER' },
    { id: 'u-case', name: 'manny santos', role: 'DRIVER' },
    { id: 'u-staff', name: 'Lando Navarro', role: 'LOGISTICS' },
  ];
  const profiles = [
    { id: 'p-leo', name: 'Leo Driver', type: 'DRIVER' },
    { id: 'p-pat', name: 'Pat Cruz', type: 'DRIVER' },
    { id: 'p-manny', name: 'Manny Santos', type: 'DRIVER' },
    { id: 'p-lando', name: 'Lando Navarro', type: 'DRIVER' },
    { id: 'p-helper', name: 'Leo Driver', type: 'ASSISTANT' },
  ];
  const records = [
    { id: 'r-leo', driver: 'Leo Driver' },
    { id: 'r-pat', driver: 'Pat Cruz' },
    { id: 'r-manny', driver: 'Manny Santos' },
    { id: 'r-ghost', driver: 'Former Driver' },
    { id: 'r-done', driver: 'Leo Driver', driverId: 'p-leo' },
    { id: 'r-empty', driver: '' },
  ];
  const plan = classifyDriverIdentity(users, profiles, records);

  assert.deepEqual(plan.links, [{ profileId: 'p-leo', userId: 'u-leo' }]);
  assert.deepEqual(plan.duplicateUserNames, ['Pat Cruz']);
  // Two logins named "Pat Cruz" must not both own p-pat's runs: nothing is linked.
  assert.ok(!plan.links.some(l => l.profileId === 'p-pat'));
  // Case-only matches and non-DRIVER logins are never linked automatically.
  assert.ok(!plan.links.some(l => l.userId === 'u-case' || l.userId === 'u-staff'));
  // Runs point at the unique DRIVER profile by exact name, whether or not a login is linked.
  assert.deepEqual(plan.assignments, [
    { recordId: 'r-leo', profileId: 'p-leo' },
    { recordId: 'r-pat', profileId: 'p-pat' },
    { recordId: 'r-manny', profileId: 'p-manny' },
  ]);
  assert.deepEqual(plan.unresolvedRecords, [{ name: 'Former Driver', recordIds: ['r-ghost'] }]);
  assert.deepEqual(plan.unlinkedUsers.map(u => u.id), ['u-pat-1', 'u-pat-2', 'u-case']);
  assert.deepEqual(plan.unlinkedProfiles.map(p => p.id), ['p-pat', 'p-manny', 'p-lando']);
});

test('duplicate DRIVER profile names are neither linked nor assigned', () => {
  const plan = classifyDriverIdentity(
    [{ id: 'u-1', name: 'Pat Cruz', role: 'DRIVER' }],
    [{ id: 'p-1', name: 'Pat Cruz', type: 'DRIVER' }, { id: 'p-2', name: 'Pat Cruz', type: 'DRIVER' }],
    [{ id: 'r-1', driver: 'Pat Cruz' }],
  );
  assert.deepEqual(plan.links, []);
  assert.deepEqual(plan.assignments, []);
  assert.deepEqual(plan.duplicateProfileNames, ['Pat Cruz']);
  assert.deepEqual(plan.unresolvedRecords, [{ name: 'Pat Cruz', recordIds: ['r-1'] }]);
});

// In-memory directory for the Admin linking service.
function directory(profiles: any[] = []) {
  const audits: any[] = [];
  let locked = false;
  const requireLock = () => assert.equal(locked, true, 'Linking must take the directory lock first');
  const tx = {
    $executeRaw: async () => { locked = true; return 0; },
    driver: {
      findUnique: async ({ where }: any) => { requireLock(); return profiles.find(p => (where.userId ? p.userId === where.userId : p.id === where.id)) ?? null; },
      findFirst: async ({ where }: any) => { requireLock(); return profiles.find(p => p.name.toLowerCase() === where.name.equals.toLowerCase() && p.type === where.type) ?? null; },
      create: async ({ data }: any) => { requireLock(); const row = { id: `p-${profiles.length + 1}`, ...data }; profiles.push(row); return row; },
      update: async ({ where, data }: any) => { requireLock(); const row = profiles.find(p => p.id === where.id); Object.assign(row, data); return row; },
    },
    auditLog: { create: async ({ data }: any) => { audits.push(data); return {}; } },
  } as unknown as Prisma.TransactionClient;
  return { tx, profiles, audits };
}
const admin = { id: 'admin-1', name: 'Admin' };
const login = (id = 'u-new', name = 'New Driver', role = 'DRIVER') => ({ id, name, role });

test('Admin creating a DRIVER login creates and links a new profile, audited', async () => {
  const { tx, profiles, audits } = directory();
  const profile = await linkDriverLogin(tx, login(), undefined, admin);
  assert.equal(profile!.userId, 'u-new');
  assert.equal(profiles.length, 1);
  assert.deepEqual(audits.map(a => a.action), ['CREATE', 'LINK_LOGIN']);
  assert.ok(audits.every(a => a.changedById === 'admin-1' && a.recordType === 'Driver'));
});

test('an existing profile with the same name is never linked silently; it must be chosen explicitly', async () => {
  const { tx, profiles } = directory([{ id: 'p-1', name: 'New Driver', type: 'DRIVER', userId: null }]);
  await assert.rejects(linkDriverLogin(tx, login(), undefined, admin), (error: any) => error instanceof DriverLinkError && error.status === 409);
  assert.equal(profiles[0].userId, null);
  const linked = await linkDriverLogin(tx, login(), 'p-1', admin);
  assert.equal(linked!.userId, 'u-new');
  assert.equal(profiles.length, 1);
});

test('linking rejects assistants, profiles owned by another login and non-DRIVER logins', async () => {
  const { tx, profiles } = directory([
    { id: 'p-helper', name: 'Helper', type: 'ASSISTANT', userId: null },
    { id: 'p-taken', name: 'Taken', type: 'DRIVER', userId: 'u-other' },
    { id: 'p-free', name: 'Free', type: 'DRIVER', userId: null },
  ]);
  await assert.rejects(linkDriverLogin(tx, login(), 'p-helper', admin), DriverLinkError);
  await assert.rejects(linkDriverLogin(tx, login(), 'p-taken', admin), (error: any) => error.status === 409);
  await assert.rejects(linkDriverLogin(tx, login('u-staff', 'Staff', 'LOGISTICS'), 'p-free', admin), DriverLinkError);
  assert.equal(profiles.find(p => p.id === 'p-taken')!.userId, 'u-other');
  assert.equal(profiles.find(p => p.id === 'p-free')!.userId, null);
});

test('relinking moves the login to the new profile and unlinking removes ownership, both audited', async () => {
  const { tx, profiles, audits } = directory([
    { id: 'p-old', name: 'Old', type: 'DRIVER', userId: 'u-new' },
    { id: 'p-next', name: 'Next', type: 'DRIVER', userId: null },
  ]);
  await linkDriverLogin(tx, login(), 'p-next', admin);
  assert.equal(profiles[0].userId, null);
  assert.equal(profiles[1].userId, 'u-new');
  await unlinkDriverLogin(tx, 'u-new', admin);
  assert.ok(profiles.every(p => p.userId === null));
  assert.deepEqual(audits.map(a => a.action), ['UNLINK_LOGIN', 'LINK_LOGIN', 'UNLINK_LOGIN']);
});

test('HTTP: Logistics cannot link Driver logins through the roster or the users API; no data is touched', async () => {
  const express = (await import('express')).default;
  const cookieParser = (await import('cookie-parser')).default;
  const { prisma } = await import('../src/db');
  const { signToken } = await import('../src/middleware/auth');
  const driversRoutes = (await import('../src/routes/drivers')).default;
  const usersRoutes = (await import('../src/routes/users')).default;

  let actor: any = { id: 'logistics-1', name: 'Juan', email: 'l@example.com', role: 'LOGISTICS', isActive: true, permissions: [], driverProfile: null };
  const restores: Array<() => void> = [];
  const stub = (delegate: any, method: string, handler: (...args: any[]) => any) => {
    const original = delegate[method];
    delegate[method] = handler;
    restores.push(() => { delegate[method] = original; });
  };
  stub(prisma.user, 'findUnique', async () => actor);
  stub(prisma, '$transaction', async () => { throw new Error('Unexpected write'); });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/drivers', driversRoutes);
  app.use('/users', usersRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const send = (method: string, path: string, body: unknown) => fetch(url + path, {
    method, body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Cookie: `mg_session=${signToken(actor)}` },
  });
  try {
    assert.equal((await send('POST', '/drivers', { name: 'New Driver', type: 'DRIVER', user_id: 'driver-login' })).status, 403);
    assert.equal((await send('PUT', '/drivers/profile-1', { user_id: 'driver-login' })).status, 403);
    assert.equal((await send('PUT', '/users/driver-login/driver-profile', { driver_profile_id: 'profile-1' })).status, 403);
    assert.equal((await send('POST', '/users', { name: 'D', email: 'd@example.com', password: 'x', role: 'DRIVER' })).status, 403);

    actor = { ...actor, id: 'admin-1', role: 'ADMIN' };
    // Admin links through Admin Panel → Users, not the roster; inputs are validated before writes.
    assert.equal((await send('POST', '/drivers', { name: 'New Driver', type: 'DRIVER', user_id: 'driver-login' })).status, 400);
    assert.equal((await send('PUT', '/users/driver-login/driver-profile', { driver_profile_id: 42 })).status, 400);
    assert.equal((await send('POST', '/users', { name: 'S', email: 's@example.com', password: 'x', role: 'LOGISTICS', driver_profile_id: 'profile-1' })).status, 400);
  } finally {
    restores.forEach(restore => restore());
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
