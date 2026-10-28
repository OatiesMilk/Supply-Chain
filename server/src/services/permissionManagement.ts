import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG, POLICY_ROLES, defaultRolePermissions, isPolicyRole, roleActionCeiling, type PolicyEffect } from './permissionCatalog';
import { actionPermissionInputError, evaluatePermissions, hasActionPermission, type ActionPermissionRow, type PermissionEvaluationInput } from './permissionEvaluator';
import { planPermissionConversion } from './permissionBackfill';
import { lockDriverDirectory } from './driverDirectory';

type Tx = Prisma.TransactionClient;
export class PolicyManagementError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) { super(message); }
}
const fail = (status: number, message: string): never => { throw new PolicyManagementError(status, message); };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const ownKeys = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).every(k => keys.includes(k));
const token = (value: unknown) => `v1:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const rows = (value: readonly ActionPermissionRow[]) => value.map(p => ({ permissionKey: p.permissionKey, effect: p.effect })).sort((a, b) => a.permissionKey.localeCompare(b.permissionKey));

/** Reserved coordinated rollout switch: keep LEGACY until #247/#248 are deployed. */
export function permissionMode(): 'LEGACY' | 'V1' {
  const mode = process.env.PERMISSION_MODE ?? 'LEGACY';
  if (mode !== 'LEGACY' && mode !== 'V1') return fail(503, 'Unsupported permission rollout mode');
  return mode;
}
export function requireV1Mutation() {
  if (permissionMode() !== 'V1') fail(503, 'V1 policy writes are unavailable before coordinated permission activation');
}
export function permissionSaveBody(value: unknown, reset = false) {
  if (!object(value) || !ownKeys(value, ['contractVersion', 'catalogVersion', 'expectedVersion', ...(reset ? [] : ['permissions'])])
    || value.contractVersion !== 1 || value.catalogVersion !== 1 || typeof value.expectedVersion !== 'string' || !/^v1:[a-f0-9]{64}$/.test(value.expectedVersion)) {
    return fail(400, 'Use the V1 contract with catalogVersion 1 and the editor expectedVersion');
  }
  if (reset) return { expectedVersion: value.expectedVersion, permissions: [] as Array<{ permissionKey: string; effect: PolicyEffect }> };
  if (!Array.isArray(value.permissions) || value.permissions.length > PERMISSION_CATALOG.length) return fail(400, 'permissions must be a bounded array');
  const seen = new Set<string>();
  const permissions = value.permissions.map(p => {
    if (!object(p) || !ownKeys(p, ['permissionKey', 'effect']) || typeof p.permissionKey !== 'string'
      || !PERMISSION_CATALOG.some(c => c.key === p.permissionKey) || !['ALLOW', 'DENY'].includes(p.effect as string)
      || seen.has(p.permissionKey)) return fail(400, 'Permissions must have unique known keys and ALLOW or DENY effects');
    seen.add(p.permissionKey);
    return { permissionKey: p.permissionKey, effect: p.effect as PolicyEffect };
  });
  return { expectedVersion: value.expectedVersion, permissions };
}

const accountInclude = {
  permissions: true, permissionOverrides: true, permissionConversion: true,
  driverProfile: { select: { id: true, type: true, isActive: true } },
} as const;
type Account = NonNullable<Awaited<ReturnType<typeof readAccount>>>;
async function readAccount(tx: Tx, id: string) {
  return tx.user.findUnique({ where: { id }, include: accountInclude });
}
async function readPolicy(tx: Tx, role: string) {
  const policy = await tx.rolePolicy.findUnique({ where: { role }, include: { permissions: true } });
  if (!policy) return fail(503, 'Permission foundation has not been initialized');
  return policy;
}
function input(user: Account, policy: Awaited<ReturnType<typeof readPolicy>>, overrides = user.permissionOverrides): PermissionEvaluationInput {
  return { userId: user.id, role: policy.role, isActive: user.isActive, authorizationRevision: user.authorizationRevision,
    driverProfile: user.driverProfile, rolePolicy: policy, overrides };
}
function accountVersion(user: Account, policy: Awaited<ReturnType<typeof readPolicy>>, proposed?: Awaited<ReturnType<typeof readPolicy>>) {
  return token({ userId: user.id, role: user.role, account: String(user.authorizationRevision), policy: String(policy.revision),
    catalogVersion: policy.catalogVersion, proposedRole: proposed?.role, proposedRevision: proposed && String(proposed.revision) });
}
function roleVersion(policy: Awaited<ReturnType<typeof readPolicy>>) {
  return token({ role: policy.role, revision: String(policy.revision), catalogVersion: policy.catalogVersion });
}
function state(user: Account, rolePolicyRevision?: bigint) {
  return { catalogVersion: 1, role: user.role, isActive: user.isActive, authorizationRevision: String(user.authorizationRevision),
    ...(rolePolicyRevision === undefined ? {} : { rolePolicyRevision: String(rolePolicyRevision) }),
    driverProfileId: user.driverProfile?.id ?? null, driverActive: user.driverProfile?.isActive ?? null,
    microsoftLinked: !!user.microsoftOid, permissions: rows(user.permissionOverrides) };
}
function validate(inputValue: PermissionEvaluationInput) {
  const error = actionPermissionInputError(inputValue);
  if (error) fail(400, error);
}
function assertConverted(user: Account) {
  if (!user.permissionConversion || user.permissionConversion.catalogVersion !== 1) fail(409, 'Account conversion must be verified before V1 mutation');
}
async function audit(tx: Tx, actorId: string, target: string, recordType: string, before: unknown, after: unknown) {
  await tx.auditLog.create({ data: { recordId: target, recordType, action: 'UPDATE', changedById: actorId,
    previousValue: JSON.stringify(before), newValue: JSON.stringify(after) } });
}

/** All admin/conversion writers serialize first. Directory precedes User locks:
 * Driver identity triggers update User, so reversing that order can deadlock. */
export async function administrativeTransaction<T>(db: PrismaClient, actorId: string, targetId: string | null,
  work: (tx: Tx, actor: Account, target: Account | null) => Promise<T>, action: 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' = 'UPDATE') {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(243, 1)`;
    await lockDriverDirectory(tx);
    await tx.$queryRaw`SELECT role FROM "RolePolicy" ORDER BY role FOR UPDATE`;
    for (const id of [...new Set([actorId, ...(targetId ? [targetId] : [])])].sort()) {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
    }
    const actor = await readAccount(tx, actorId);
    if (!actor || !actor.isActive || actor.role !== 'ADMIN') return fail(403, 'Current active ADMIN authority is required');
    if (permissionMode() === 'V1') {
      assertConverted(actor);
      const snapshot = evaluatePermissions(input(actor, await readPolicy(tx, actor.role)));
      if (!hasActionPermission(snapshot, 'RESOURCE', 'users', action)) return fail(403, 'Administrative action denied');
    }
    const target = targetId ? await readAccount(tx, targetId) : null;
    if (targetId && !target) return fail(404, 'User not found');
    return work(tx, actor, target);
  }, { timeout: 30000 });
}
async function assertV1Actor(tx: Tx, actor: Account, action: 'READ' | 'WRITE') {
  if (!hasActionPermission(evaluatePermissions(input(actor, await readPolicy(tx, actor.role))), 'RESOURCE', 'admin', action)) {
    fail(403, 'Administrative policy action denied');
  }
}
function assertRole(role: string) { if (!isPolicyRole(role)) fail(400, 'Unknown built-in role'); }

export async function getRolePermissionEditor(db: PrismaClient, actorId: string, role: string) {
  assertRole(role);
  return administrativeTransaction(db, actorId, null, async (tx, actor) => {
    await assertV1Actor(tx, actor, 'READ');
    const policy = await readPolicy(tx, role);
    return roleEditor(policy);
  }, 'READ');
}
function roleEditor(policy: Awaited<ReturnType<typeof readPolicy>>) {
  return { contractVersion: 1, catalogVersion: 1, activeMode: permissionMode(), role: policy.role,
    revision: String(policy.revision), expectedVersion: roleVersion(policy), permissions: rows(policy.permissions),
    catalog: PERMISSION_CATALOG.map(p => ({ ...p, canAllow: isPolicyRole(policy.role) && roleActionCeiling(policy.role, p) })) };
}
export async function saveRolePermissions(db: PrismaClient, actorId: string, role: string, body: unknown) {
  assertRole(role);
  const request = permissionSaveBody(body);
  requireV1Mutation();
  return administrativeTransaction(db, actorId, null, async (tx, actor) => {
    await assertV1Actor(tx, actor, 'WRITE');
    const policy = await readPolicy(tx, role);
    if (request.expectedVersion !== roleVersion(policy)) return fail(409, 'Role policy changed; reload before saving');
    const proposed = { ...policy, permissions: request.permissions.map(p => ({ ...p, role })) };
    validate({ userId: 'role-policy-validation', role, isActive: true, authorizationRevision: '1', rolePolicy: proposed, overrides: [] });
    // A default change cannot silently leave existing exceptions with Write but no Read.
    const affected = await tx.user.findMany({ where: { role }, include: accountInclude });
    if (affected.some(user => !user.permissionConversion || user.permissionConversion.catalogVersion !== 1)) fail(409, 'Convert all accounts in this role before editing its defaults');
    const invalid = affected.filter(user => actionPermissionInputError(input(user, proposed)));
    if (invalid.length) throw new PolicyManagementError(409, 'Role defaults conflict with individual exceptions; resolve them first', { userIds: invalid.map(u => u.id) });
    const before = { catalogVersion: 1, role, revision: String(policy.revision), permissions: rows(policy.permissions) };
    const old = new Map(policy.permissions.map(p => [p.permissionKey, p.effect]));
    for (const row of request.permissions) if (old.get(row.permissionKey) !== row.effect) {
      await tx.rolePermission.update({ where: { role_permissionKey: { role, permissionKey: row.permissionKey } }, data: { effect: row.effect } });
    }
    const updated = await readPolicy(tx, role);
    if (String(updated.revision) !== String(policy.revision)) await audit(tx, actorId, role, 'RolePolicy', before,
      { catalogVersion: 1, role, revision: String(updated.revision), permissions: rows(updated.permissions) });
    return roleEditor(updated);
  });
}

function proposedOverrides(user: Account, policy: Awaited<ReturnType<typeof readPolicy>>) {
  const retained = user.permissionOverrides.filter(row => {
    const entry = PERMISSION_CATALOG.find(p => p.key === row.permissionKey);
    if (!entry || !isPolicyRole(policy.role)) return false;
    if (row.effect === 'ALLOW' && !roleActionCeiling(policy.role, entry)) return false;
    const locked = policy.role === 'ADMIN' && (entry.scope === 'SCREEN' && entry.module === 'admin' || entry.scope === 'RESOURCE' && ['users', 'admin'].includes(entry.module));
    return !locked || row.effect === 'ALLOW';
  });
  return { retained, removed: user.permissionOverrides.filter(p => !retained.includes(p)) };
}
export async function getUserPermissionEditor(db: PrismaClient, actorId: string, userId: string, proposedRole?: string) {
  if (proposedRole !== undefined) assertRole(proposedRole);
  return administrativeTransaction(db, actorId, userId, async (tx, actor, target) => {
    await assertV1Actor(tx, actor, 'READ');
    return userEditor(tx, target!, proposedRole);
  }, 'READ');
}
async function userEditor(tx: Tx, user: Account, proposedRole?: string) {
  const policy = await readPolicy(tx, user.role);
  const proposed = proposedRole && proposedRole !== user.role ? await readPolicy(tx, proposedRole) : undefined;
  const change = proposed ? proposedOverrides(user, proposed) : null;
  return { contractVersion: 1, catalogVersion: 1, activeMode: permissionMode(), userId: user.id, role: user.role,
    conversionStatus: user.permissionConversion?.catalogVersion === 1 ? 'CONVERTED' : 'REQUIRED',
    authorizationRevision: String(user.authorizationRevision), rolePolicyRevision: String(policy.revision),
    expectedVersion: accountVersion(user, policy, proposed), permissions: rows(user.permissionOverrides),
    roleDefaults: rows(policy.permissions), catalog: PERMISSION_CATALOG,
    snapshot: evaluatePermissions(input(user, policy)),
    ...(proposed && change ? { roleChange: { fromRole: user.role, toRole: proposed.role, rolePolicyRevision: String(proposed.revision),
      permissions: rows(change.retained), removedOverrides: rows(change.removed), validationError: actionPermissionInputError(input(user, proposed, change.retained)),
      snapshot: evaluatePermissions(input(user, proposed, change.retained)) } } : {}) };
}
export async function saveUserPermissions(db: PrismaClient, actorId: string, userId: string, body: unknown, reset = false) {
  const request = permissionSaveBody(body, reset);
  requireV1Mutation();
  return administrativeTransaction(db, actorId, userId, async (tx, actor, target) => {
    await assertV1Actor(tx, actor, 'WRITE');
    const user = target!, policy = await readPolicy(tx, user.role);
    assertConverted(user);
    if (request.expectedVersion !== accountVersion(user, policy)) return fail(409, 'Account or role policy changed; reload before saving');
    validate({ ...input(user, policy), overrides: request.permissions });
    const before = state(user, policy.revision);
    await replaceOverrides(tx, user, request.permissions);
    const updated = (await readAccount(tx, userId))!;
    if (String(updated.authorizationRevision) !== String(user.authorizationRevision)) await audit(tx, actorId, userId, 'UserPermissionOverride', before, state(updated, policy.revision));
    return userEditor(tx, updated);
  });
}
async function replaceOverrides(tx: Tx, user: Account, next: readonly ActionPermissionRow[]) {
  const old = new Map(user.permissionOverrides.map(p => [p.permissionKey, p]));
  const keys = new Set(next.map(p => p.permissionKey));
  for (const p of user.permissionOverrides) if (!keys.has(p.permissionKey)) await tx.userPermissionOverride.delete({ where: { userId_permissionKey: { userId: user.id, permissionKey: p.permissionKey } } });
  for (const p of next) if (old.get(p.permissionKey)?.effect !== p.effect) {
    await tx.userPermissionOverride.upsert({ where: { userId_permissionKey: { userId: user.id, permissionKey: p.permissionKey } },
      create: { userId: user.id, permissionKey: p.permissionKey, effect: p.effect as PolicyEffect, source: 'MANUAL' },
      update: { effect: p.effect as PolicyEffect, source: 'MANUAL', sourceLegacyIds: [] } });
  }
}

/** Synchronize only a verified untouched baseline conversion. Never overwrite
 * manual V1 edits or silently accept a drifted checkpoint. */
async function syncLegacyConversion(tx: Tx, before: Account, after: Account) {
  if (!before.permissionConversion) return;
  const previousPlan = planPermissionConversion(before);
  if (before.permissionConversion.sourceHash !== previousPlan.sourceHash
    || JSON.stringify(rows(previousPlan.overrides)) !== JSON.stringify(rows(before.permissionOverrides))) return fail(409, 'Converted legacy source drifted; operator review is required');
  const policies = await tx.rolePolicy.findMany({ include: { permissions: true } });
  if (policies.length !== POLICY_ROLES.length || policies.some(p => !isPolicyRole(p.role) || p.catalogVersion !== 1
    || p.permissions.length !== PERMISSION_CATALOG.length || p.permissions.some(row => row.effect !== defaultRolePermissions(p.role as typeof POLICY_ROLES[number]).get(row.permissionKey)))
    || before.permissionOverrides.some(p => p.source !== 'LEGACY_V1')) return fail(409, 'V1 policies were customized; legacy writes cannot replace them');
  const plan = planPermissionConversion(after);
  if (plan.sourceHash === previousPlan.sourceHash) return;
  await tx.userPermissionOverride.deleteMany({ where: { userId: after.id } });
  if (plan.overrides.length) await tx.userPermissionOverride.createMany({ data: plan.overrides.map(p => ({ ...p, userId: after.id, source: 'LEGACY_V1' })) });
  if (plan.quarantine.length) await tx.permissionQuarantine.createMany({ data: plan.quarantine, skipDuplicates: true });
  await tx.permissionConversion.update({ where: { userId: after.id }, data: { sourceHash: plan.sourceHash, report: plan.report } });
}

/** Shared account lifecycle transaction. Existing legacy clients remain usable;
 * V1 callers must hold a current editor (or role-change preview) token. */
export async function mutateAdminAccount<T>(db: PrismaClient, actorId: string, userId: string, body: unknown,
  work: (tx: Tx, actor: Account, user: Account) => Promise<T>, options: { role?: string; action?: 'UPDATE' | 'DELETE'; identity?: boolean; removedOverrideKeys?: string[]; finish?: (tx: Tx, result: T) => Promise<T> } = {}) {
  if (object(body) && body.contractVersion === 1) requireV1Mutation();
  return administrativeTransaction(db, actorId, userId, async (tx, actor, target) => {
    const user = target!, active = permissionMode() === 'V1';
    if (active) assertConverted(user);
    const policy = active ? await readPolicy(tx, user.role) : undefined;
    const proposed = active && options.role && options.role !== user.role ? await readPolicy(tx, options.role) : undefined;
    if (active && (!object(body) || body.contractVersion !== 1 || body.expectedVersion !== accountVersion(user, policy!, proposed))) {
      return fail(409, 'A current V1 account editor or role-change preview is required');
    }
    const before = state(user, policy?.revision);
    if (proposed) {
      const change = proposedOverrides(user, proposed);
      const acknowledged = [...(options.removedOverrideKeys ?? [])].sort();
      if (JSON.stringify(acknowledged) !== JSON.stringify(change.removed.map(p => p.permissionKey).sort())) {
        throw new PolicyManagementError(400, 'Acknowledge the exact exceptions removed by the role-change preview', { removedOverrideKeys: change.removed.map(p => p.permissionKey) });
      }
      validate(input(user, proposed, change.retained));
      await replaceOverrides(tx, user, change.retained);
    }
    const result = await work(tx, actor, user);
    let after = await readAccount(tx, userId);
    if (after && !active) { await syncLegacyConversion(tx, user, after); after = await readAccount(tx, userId); }
    if (after && options.identity && (after.microsoftOid !== user.microsoftOid || String(after.microsoftApprovedAt) !== String(user.microsoftApprovedAt))) {
      // Microsoft linking is not covered by the foundation role/Driver triggers.
      await tx.user.update({ where: { id: userId }, data: { authorizationRevision: { increment: 1 } } });
      after = await readAccount(tx, userId);
    }
    await audit(tx, actorId, userId, 'UserAuthorization', before, after ? state(after, (proposed ?? policy)?.revision) : null);
    return options.finish ? options.finish(tx, result) : result;
  }, options.action);
}

export async function assertAdminSurvives(tx: Tx, actorId: string, user: Account, role: string, isActive: boolean) {
  if (user.id === actorId && (role !== 'ADMIN' || !isActive)) return fail(400, 'You cannot remove your own active admin access');
  if (user.role === 'ADMIN' && user.isActive && (role !== 'ADMIN' || !isActive)) {
    if (await tx.user.count({ where: { role: 'ADMIN', isActive: true } }) <= 1) return fail(409, 'The last active administrator must be retained');
  }
}

/** Allowlisted audit projection: never return arbitrary stored JSON. */
export function safePolicyAudit(recordType: string, value: string | null) {
  if (!['RolePolicy', 'UserPermissionOverride', 'UserAuthorization'].includes(recordType) || !value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!object(parsed)) return null;
    const safe: Record<string, unknown> = {};
    for (const key of ['role', 'revision', 'rolePolicyRevision', 'authorizationRevision', 'driverProfileId']) if (typeof parsed[key] === 'string' || parsed[key] === null) safe[key] = parsed[key];
    if (parsed.catalogVersion === 1) safe.catalogVersion = 1;
    for (const key of ['isActive', 'driverActive', 'microsoftLinked']) if (typeof parsed[key] === 'boolean' || parsed[key] === null) safe[key] = parsed[key];
    if (Array.isArray(parsed.permissions)) safe.permissions = parsed.permissions.filter(p => object(p) && PERMISSION_CATALOG.some(c => c.key === p.permissionKey) && ['ALLOW', 'DENY'].includes(p.effect as string)).map(p => ({ permissionKey: p.permissionKey, effect: p.effect }));
    return safe;
  } catch { return null; }
}
