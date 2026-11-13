import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { signToken, type AuthUser } from '../src/middleware/auth';
import notifications from '../src/routes/notifications';
import type { PolicyRole } from '../src/services/permissionCatalog';
import { defaultRolePermissions } from '../src/services/permissionCatalog';
import { evaluatePermissions } from '../src/services/permissionEvaluator';
import { permissionSession } from '../src/services/sessionPermissions';
import { sessionUser } from '../src/services/permissions';
import { auditVisibilitySql, visibleAuditCount, visibleAuditEntries } from '../src/services/auditVisibility';
import { notificationVisibility } from '../src/services/notificationVisibility';
import { mailInputError, recordMailRecipients } from '../src/services/mailPermissions';
import { notifyScopedSummary } from '../src/services/scopedSummaries';
import { recordMutationInputError } from '../src/services/recordOperations';
import { prisma } from '../src/db';
import { Prisma } from '@prisma/client';

afterEach(() => mock.restoreAll());
const policy = (role: PolicyRole) => ({ role, revision: 1n, catalogVersion: 1,
  permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) });
const account = (role: PolicyRole = 'ADMIN') => ({ id: 'visibility-user', role, name: 'Test Person', email: 'test@example.test', isActive: true,
  authorizationRevision: 1n, permissions: [], permissionOverrides: [], permissionConversion: { catalogVersion: 1 }, driverProfile: null });
function user(role: PolicyRole = 'ADMIN', overrides: Array<{ permissionKey: string; effect: string }> = []) {
  const source = account(role);
  const snapshot = evaluatePermissions({ userId: source.id, role, isActive: true, authorizationRevision: source.authorizationRevision,
    rolePolicy: policy(role), overrides, driverProfile: role === 'DRIVER' ? { id: 'profile-1', type: 'DRIVER', isActive: true } : null });
  return permissionSession(source, snapshot) as AuthUser;
}

test('audit visibility uses a bounded SQL EXISTS predicate and excludes denied categories', async () => {
  const actor = user('ADMIN', [{ permissionKey: 'CATEGORY:RMA:READ', effect: 'DENY' }]);
  const scope = auditVisibilitySql(actor);
  assert.match(scope.sql, /EXISTS \(SELECT 1 FROM "DeliveryRecord"/);
  assert.ok(scope.values.includes('DELIVERY'));
  assert.ok(!scope.values.includes('RMA'));
  assert.ok(scope.values.includes('RolePolicy'), 'protected management history remains visible');
  const calls: any[] = [];
  const db = { $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
    const query = Prisma.sql(strings, ...values); calls.push(query); return query.sql.includes('COUNT(*)') ? [{ count: 3 }] : [];
  } } as any;
  assert.equal(await visibleAuditCount(db, actor), 3);
  assert.deepEqual(await visibleAuditEntries(db, actor, 10, 20), []);
  assert.match(calls[1].sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(calls[1].values.slice(-2), [10, 20]);
});

test('notification SQL covers every category, Driver assignment, deletion and version-tagged summaries', () => {
  const actor = user('ADMIN', [{ permissionKey: 'CATEGORY:RMA:READ', effect: 'DENY' }]);
  const scope = notificationVisibility(actor);
  assert.ok(scope.values.includes('DELIVERY'));
  assert.ok(!scope.values.includes('RMA'));
  assert.ok(scope.values.includes(actor.permissionVersion));
  assert.match(scope.sql, /ScopedSummary/);
  assert.match(scope.sql, /r\."deletedAt" IS NULL/);
  assert.doesNotMatch(scope.sql, /n\."recordId" IS NULL AND n\."recordType" IS NULL/);
  const driver = notificationVisibility(user('DRIVER'));
  assert.match(driver.sql, /r\."driverId" = \?/);
  assert.ok(driver.values.includes('profile-1'));
  assert.match(driver.sql, /r\."draft" = false/);
});

test('LEGACY notifications respect category denials even for users with aggregate screens', () => {
  const actor = {
    ...sessionUser({ ...account('SALES_COORDINATOR'), permissions: [{ screen: 'sales_orders', granted: false }] }),
    role: 'SALES_COORDINATOR',
  } as const;
  assert.ok(actor.effectiveScreens.includes('main'));
  const scope = notificationVisibility(actor);
  assert.ok(scope.values.includes('DELIVERY'), 'an allowed category still has visible alerts');
  assert.ok(!scope.values.includes('SALES_ORDERS'), 'a category denial overrides aggregate access');
  assert.match(scope.sql, /r\."id" IS NOT NULL AND r\."deletedAt" IS NULL/);
  assert.match(scope.sql, /n\."recordType" IS DISTINCT FROM 'DeliveryRecord'/);
});

test('LEGACY Driver notifications are limited to the current linked profile and non-draft runs', () => {
  const actor = { ...sessionUser(account('DRIVER')), role: 'DRIVER' } as const;
  const linked = notificationVisibility({ ...actor, driverProfileId: 'profile-1' });
  assert.ok(linked.values.includes('DELIVERY'));
  assert.ok(linked.values.includes('profile-1'));
  assert.match(linked.sql, /r\."driverId" = \? AND r\."draft" = false/);

  const unlinked = notificationVisibility({ ...actor, driverProfileId: null });
  assert.match(unlinked.sql, /AND FALSE/);
  assert.ok(!unlinked.values.includes(''), 'an unlinked login never matches a stored driver ID');
});

test('historical summaries never become newly visible after policy changes or Driver reassignment', async () => {
  const originalTransaction = prisma.$transaction, originalCreate = prisma.notification.create;
  let source = account();
  let created = 0;
  prisma.$transaction = mock.fn(async (work: any) => work({ user: { findUnique: async () => source }, rolePolicy: { findUnique: async () => policy('ADMIN') } })) as any;
  prisma.notification.create = mock.fn(async () => { created++; return {}; }) as any;
  try {
    const actor = user();
    await notifyScopedSummary(actor, 'Visible summary', 'Only authorized content');
    assert.equal(created, 1);
    source = { ...source, authorizationRevision: 2n };
    await notifyScopedSummary(actor, 'Stale summary', 'Prepared before revocation');
    assert.equal(created, 1);
    await notifyScopedSummary(user('DRIVER'), 'Driver summary', 'A dispatch assignment may change without policy changes');
    assert.equal(created, 1, 'Drivers receive record-linked messages only');
  } finally { prisma.$transaction = originalTransaction; prisma.notification.create = originalCreate; }
});

test('mail requests reject unknown triggers, ambiguous recipient selectors and extra fields', () => {
  const input = { recordId: 'rec-1', trigger: 'Record Created', recipients: ['AM'] };
  assert.equal(mailInputError(input), null);
  for (const malformed of [{ ...input, trigger: 'custom untrusted subject' }, { ...input, recipients: ['AM', 'AM'] },
    { ...input, recipients: ['someone@example.test'] }, { ...input, role: 'ADMIN' }, { ...input, recordId: {} }]) assert.ok(mailInputError(malformed));
});

test('LEGACY mail recipient lookup honors RMA permission overrides', async t => {
  const savedMode = process.env.PERMISSION_MODE;
  process.env.PERMISSION_MODE = 'LEGACY';
  const origFindMany = prisma.user.findMany;
  const origFindUnique = prisma.user.findUnique;
  const origFindDir = prisma.accountManager.findUnique;
  const origFindPolicy = prisma.rolePolicy.findUnique;
  t.after(() => {
    prisma.user.findMany = origFindMany;
    prisma.user.findUnique = origFindUnique;
    prisma.accountManager.findUnique = origFindDir;
    prisma.rolePolicy.findUnique = origFindPolicy;
    if (savedMode === undefined) delete process.env.PERMISSION_MODE;
    else process.env.PERMISSION_MODE = savedMode;
  });

  const recipient = { id: 'am-rma', name: 'Alex RMA', email: 'alex-rma@example.test' };
  let denied = true;
  prisma.accountManager.findUnique = mock.fn(async () => null) as any;
  prisma.user.findMany = mock.fn(async () => [recipient]) as any;
  prisma.rolePolicy.findUnique = mock.fn(async ({ where }: any) => policy(where.role)) as any;
  prisma.user.findUnique = mock.fn(async () => ({
    ...recipient, role: 'TASS', isActive: true, authorizationRevision: 1n, permissions: [], driverProfile: null,
    permissionOverrides: denied ? [{ userId: recipient.id, permissionKey: 'CATEGORY:RMA:READ', effect: 'DENY' }] : [],
  })) as any;

  assert.deepEqual(await recordMailRecipients(['AM'], { category: 'RMA', accountManager: 'Alex RMA' }), []);
  denied = false;
  assert.deepEqual(await recordMailRecipients(['AM'], { category: 'RMA', accountManager: 'Alex RMA' }), [recipient]);
});

test('mail identity resolution rejects ambiguous AM names and deduplicates exact identities', async () => {
  const oldMode = process.env.PERMISSION_MODE, original = prisma.user.findMany, originalFindUnique = prisma.user.findUnique;
  const originalDirectory = prisma.accountManager.findUnique;
  prisma.accountManager.findUnique = mock.fn(async () => null) as any;
  process.env.PERMISSION_MODE = 'LEGACY';
  const person = { id: 'am-1', name: 'Alex User', email: 'alex@example.test' };
  prisma.user.findUnique = mock.fn(async () => ({ ...person, role: 'ADMIN', isActive: true, permissions: [], driverProfile: null })) as any;
  let ambiguous = true;
  prisma.user.findMany = mock.fn(async ({ where }: any) => where.name ? (ambiguous ? [person, { ...person, id: 'am-2' }] : [person]) : [person]) as any;
  try {
    assert.deepEqual(await recordMailRecipients(['AM'], { category: 'DELIVERY', accountManager: 'Alex User' }), []);
    ambiguous = false;
    assert.deepEqual(await recordMailRecipients(['AM', 'LOGISTICS'], { category: 'DELIVERY', accountManager: 'Alex User' }), [person]);
  } finally { prisma.user.findMany = original; prisma.user.findUnique = originalFindUnique; prisma.accountManager.findUnique = originalDirectory; if (oldMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = oldMode; }
});

test('record writes reject unknown fields while accepting known ignored create metadata', () => {
  assert.equal(recordMutationInputError({ company_name: 'Display only', output_actions_log: [], category: 'Deliveries' }, '/', 'POST'), null);
  assert.ok(recordMutationInputError({ role: 'ADMIN' }, '/:id', 'PUT'));
  assert.ok(recordMutationInputError({ status: 'Delivered', category: 'RMA' }, '/:id/status', 'PATCH'));
});

test('LEGACY notifications hide saved ScopedSummary rows once access is revoked while keeping generic alerts', async t => {
  const savedMode = process.env.PERMISSION_MODE;
  process.env.PERMISSION_MODE = 'LEGACY';
  t.after(() => {
    if (savedMode === undefined) delete process.env.PERMISSION_MODE;
    else process.env.PERMISSION_MODE = savedMode;
  });

  const beforeAccount = account('TASS');
  const beforeSession = sessionUser(beforeAccount) as AuthUser;
  const beforeScope = notificationVisibility(beforeSession);
  assert.match(beforeScope.sql, /n\."recordType" = 'ScopedSummary' AND n\."recordId" = \?/);
  assert.match(beforeScope.sql, /n\."recordType" IS DISTINCT FROM 'DeliveryRecord' AND n\."recordType" IS DISTINCT FROM 'ScopedSummary'/);
  assert.ok(beforeScope.values.includes(beforeSession.permissionVersion));

  const storedSummary = {
    id: 'notif-summary-1',
    userId: beforeAccount.id,
    title: '4 PM: 1 open record assigned to you',
    message: 'RMA-26-00001 (RMA) — Secret RMA Co',
    recordType: 'ScopedSummary',
    recordId: beforeSession.permissionVersion,
    isRead: false,
    createdAt: new Date('2026-11-13T08:00:00.000Z'),
  };
  const genericAlert = {
    id: 'notif-weekly-1',
    userId: beforeAccount.id,
    title: 'Weekly Report',
    message: 'Summary',
    recordType: null,
    recordId: null,
    isRead: false,
    createdAt: new Date('2026-11-13T08:00:00.000Z'),
  };
  const rows = [storedSummary, genericAlert];

  let currentAccount: any = beforeAccount;
  const queries: Prisma.Sql[] = [];
  const origFindUser = prisma.user.findUnique;
  const origFindPolicy = prisma.rolePolicy.findUnique;
  const origQueryRaw = prisma.$queryRaw;
  prisma.user.findUnique = mock.fn(async () => currentAccount) as any;
  prisma.rolePolicy.findUnique = mock.fn(async ({ where }: any) => policy(where.role)) as any;
  prisma.$queryRaw = mock.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
    const query = Prisma.sql(strings, ...values);
    queries.push(query);
    const [boundUserId, boundSummaryVersion] = query.values;
    const summaryGated = /n\."recordType" = 'ScopedSummary' AND n\."recordId" = \?/.test(query.sql);
    const visible = rows.filter(row => {
      if (row.userId !== boundUserId) return false;
      if (row.recordType === 'ScopedSummary') return summaryGated && row.recordId === boundSummaryVersion;
      if (row.recordType === 'DeliveryRecord') return false;
      return true;
    });
    return query.sql.includes('COUNT(*)') ? [{ count: visible.filter(row => !row.isRead).length }] : visible;
  }) as any;
  t.after(() => {
    prisma.user.findUnique = origFindUser;
    prisma.rolePolicy.findUnique = origFindPolicy;
    prisma.$queryRaw = origQueryRaw;
  });

  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/notifications', notifications);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}/notifications`;
  const headers = { Cookie: `mg_session=${signToken({ id: beforeAccount.id, name: beforeAccount.name, email: beforeAccount.email, role: 'TASS' })}` };

  // Before revocation: bound permissionVersion matches the saved ScopedSummary.
  const beforeList = await (await fetch(baseUrl, { headers })).json() as any[];
  const beforeUnread = await (await fetch(`${baseUrl}/unread-count`, { headers })).json() as { count: number };
  assert.equal(beforeList.length, 2);
  assert.equal(beforeUnread.count, 2);
  assert.ok(queries[0].values.includes(beforeSession.permissionVersion));
  assert.ok(queries[0].values.includes('RMA'));

  // After revoking RMA access via foundation override (revision bump) or legacy screen denial:
  currentAccount = {
    ...beforeAccount,
    authorizationRevision: 2n,
    permissionOverrides: [{ userId: beforeAccount.id, permissionKey: 'CATEGORY:RMA:READ', effect: 'DENY' }],
  };
  const revokedList = await (await fetch(baseUrl, { headers })).json() as any[];
  const revokedUnread = await (await fetch(`${baseUrl}/unread-count`, { headers })).json() as { count: number };
  assert.equal(revokedList.some(n => n.id === storedSummary.id), false);
  assert.equal(revokedList.some(n => n.id === genericAlert.id), true);
  assert.equal(revokedUnread.count, 1);
  assert.ok(!queries[2].values.includes(beforeSession.permissionVersion), 'stale summary version is no longer bound in LEGACY SQL');
  assert.ok(!queries[2].values.includes('RMA'), 'revoked RMA category is excluded by loadLegacySession');

  // Legacy boolean permission revocation also invalidates the saved ScopedSummary.
  currentAccount = { ...beforeAccount, permissions: [{ screen: 'rma', granted: false }], permissionOverrides: [] };
  const boolRevokedScope = notificationVisibility(sessionUser(currentAccount) as AuthUser);
  assert.ok(!boolRevokedScope.values.includes(beforeSession.permissionVersion));
});
