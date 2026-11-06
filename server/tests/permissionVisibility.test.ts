import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AuthUser } from '../src/middleware/auth';
import { defaultRolePermissions, type PolicyRole } from '../src/services/permissionCatalog';
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

test('mail identity resolution rejects ambiguous AM names and deduplicates exact identities', async () => {
  const oldMode = process.env.PERMISSION_MODE, original = prisma.user.findMany, originalFindUnique = prisma.user.findUnique;
  process.env.PERMISSION_MODE = 'LEGACY';
  const person = { id: 'am-1', name: 'Alex User', email: 'alex@example.test' };
  prisma.user.findUnique = mock.fn(async () => ({ ...person, role: 'ADMIN', isActive: true, permissions: [], driverProfile: null })) as any;
  let ambiguous = true;
  prisma.user.findMany = mock.fn(async ({ where }: any) => where.name ? (ambiguous ? [person, { ...person, id: 'am-2' }] : [person]) : [person]) as any;
  try {
    assert.deepEqual(await recordMailRecipients(['AM'], { category: 'DELIVERY', accountManager: 'Alex User' }), []);
    ambiguous = false;
    assert.deepEqual(await recordMailRecipients(['AM', 'LOGISTICS'], { category: 'DELIVERY', accountManager: 'Alex User' }), [person]);
  } finally { prisma.user.findMany = original; prisma.user.findUnique = originalFindUnique; if (oldMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = oldMode; }
});

test('record writes reject unknown fields while accepting known ignored create metadata', () => {
  assert.equal(recordMutationInputError({ company_name: 'Display only', output_actions_log: [], category: 'Deliveries' }, '/', 'POST'), null);
  assert.ok(recordMutationInputError({ role: 'ADMIN' }, '/:id', 'PUT'));
  assert.ok(recordMutationInputError({ status: 'Delivered', category: 'RMA' }, '/:id/status', 'PATCH'));
});
