import type { PrismaClient } from '@prisma/client';
import {
  PERMISSION_CATALOG, POLICY_CATEGORIES, POLICY_SCREENS, isPolicyRole, policyKey, roleActionCeiling,
  type PolicyAction, type PolicyCategory, type PolicyEffect, type PolicyRole, type PolicyScope,
} from './permissionCatalog';
import type { Resource, Screen } from './permissions';
import { policyEntryRestricted } from './moduleAccessRules';

export const PERMISSION_CATALOG_VERSION = 1;
export type PermissionRevision = bigint | string;
export type ActionPermissionRow = { permissionKey: string; effect: string; role?: string; userId?: string };
export interface PermissionEvaluationInput {
  userId: string;
  role: string;
  isActive: boolean;
  authorizationRevision: PermissionRevision;
  driverProfile?: { id: string; type: string; isActive: boolean } | null;
  rolePolicy: {
    role: string;
    revision: PermissionRevision;
    catalogVersion: number;
    permissions: readonly ActionPermissionRow[];
  } | null;
  overrides: readonly ActionPermissionRow[];
}
export type PermissionReason = 'INVALID_POLICY' | 'ROLE_RESTRICTION' | 'PROTECTED_ADMIN'
  | 'USER_DENY' | 'USER_ALLOW' | 'ROLE_ALLOW' | 'ROLE_DENY' | 'READ_REQUIRED' | 'WRITE_REQUIRED' | 'MODULE_WRITE_REQUIRED' | 'DRIVER_LINK_REQUIRED';
export interface ActionPermissionDecision {
  key: string;
  scope: PolicyScope;
  module: string;
  action: PolicyAction;
  allowed: boolean;
  roleEffect: PolicyEffect | null;
  overrideEffect: PolicyEffect | null;
  source: 'ROLE_DEFAULT' | 'USER_OVERRIDE' | 'PROTECTED_ADMIN' | 'INVALID_POLICY';
  reasons: PermissionReason[];
}
export interface ModuleCapabilities {
  read: boolean;
  write: boolean;
  /** Complete for the actions present in the frozen catalog; absent actions deny. */
  actions: Partial<Record<PolicyAction, boolean>>;
}
export interface EffectivePermissionSnapshot {
  catalogVersion: typeof PERMISSION_CATALOG_VERSION;
  userId: string;
  role: PolicyRole | null;
  valid: boolean;
  errors: string[];
  rolePolicyRevision: string | null;
  authorizationRevision: string | null;
  driverProfileId: string | null;
  effectiveScreens: Screen[];
  resources: Resource[];
  readableCategories: PolicyCategory[];
  capabilities: {
    screens: Record<Screen, ModuleCapabilities>;
    resources: Record<Resource, ModuleCapabilities>;
    categories: Record<PolicyCategory, ModuleCapabilities>;
  };
  decisions: Record<string, ActionPermissionDecision>;
}

const managementScreens: Partial<Record<Resource, Screen>> = { customers: 'customers', suppliers: 'suppliers', drivers: 'driver_manager', skus: 'inventory', users: 'admin', admin: 'admin', dataSampler: 'data_sampler' };
const catalog = new Map(PERMISSION_CATALOG.map(entry => [entry.key, entry]));
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function revision(value: unknown): string | null {
  const maximum = 9223372036854775807n;
  if (typeof value === 'bigint') return value > 0n && value <= maximum ? value.toString() : null;
  return typeof value === 'string' && value.length <= 19 && /^[1-9]\d*$/.test(value) && BigInt(value) <= maximum ? value : null;
}
function protectedAdmin(role: string, key: string): boolean {
  if (role !== 'ADMIN') return false;
  const entry = catalog.get(key);
  return !!entry && (entry.scope === 'SCREEN' && entry.module === 'admin'
    || entry.scope === 'RESOURCE' && ['admin', 'users'].includes(entry.module));
}
function rowError(rows: unknown, ownerField: 'role' | 'userId', owner: string, complete: boolean): string | null {
  if (!Array.isArray(rows)) return 'Permission rows must be an array';
  const seen = new Set<string>();
  for (const row of rows) {
    if (!object(row) || typeof row.permissionKey !== 'string' || !catalog.has(row.permissionKey)
      || !['ALLOW', 'DENY'].includes(row.effect as string)) return 'Unknown or malformed permission row';
    if (owns(row, ownerField) && row[ownerField] !== owner) return 'Permission row belongs to another account or role';
    if (seen.has(row.permissionKey)) return `Duplicate permission key: ${row.permissionKey}`;
    seen.add(row.permissionKey);
  }
  if (complete && seen.size !== catalog.size) return 'Role policy must contain the complete permission catalog';
  return null;
}
function structuralError(input: PermissionEvaluationInput): string | null {
  if (!object(input) || typeof input.userId !== 'string' || !input.userId.trim()
    || typeof input.role !== 'string' || !isPolicyRole(input.role) || typeof input.isActive !== 'boolean') return 'Unknown or malformed permission account';
  if (!revision(input.authorizationRevision)) return 'Invalid account authorization revision';
  const policy = input.rolePolicy;
  if (!object(policy) || policy.role !== input.role || policy.catalogVersion !== PERMISSION_CATALOG_VERSION
    || !revision(policy.revision)) return 'Missing, mismatched or unsupported role policy';
  return rowError(policy.permissions, 'role', input.role, true) ?? rowError(input.overrides, 'userId', input.userId, false);
}

/** Validation for complete proposed policy state, after merging a role/default or
 * override edit. It does not discard explicit overrides equal to role defaults.
 * Runtime evaluation below also denies inconsistent stored combinations. */
export function actionPermissionInputError(input: PermissionEvaluationInput): string | null {
  const error = structuralError(input);
  if (error) return error;
  const role = input.role as PolicyRole;
  const defaults = new Map(input.rolePolicy!.permissions.map(row => [row.permissionKey, row.effect]));
  const overrides = new Map(input.overrides.map(row => [row.permissionKey, row.effect]));
  for (const rows of [input.rolePolicy!.permissions, input.overrides]) for (const row of rows) {
    const entry = catalog.get(row.permissionKey)!;
    if (protectedAdmin(role, row.permissionKey) && row.effect !== 'ALLOW') return 'Admin management access is protected';
    if (row.effect === 'ALLOW' && !roleActionCeiling(role, entry)) return `Role cannot allow ${row.permissionKey}`;
  }
  const effective = (key: string) => protectedAdmin(role, key) || (overrides.get(key) ?? defaults.get(key)) === 'ALLOW';
  for (const entry of PERMISSION_CATALOG) {
    if (entry.action === 'READ' || !effective(entry.key)) continue;
    if (!effective(policyKey(entry.scope, entry.module, 'READ'))) return `Read is required for ${entry.key}`;
    if (entry.action !== 'WRITE' && !effective(policyKey(entry.scope, entry.module, 'WRITE'))) return `Write is required for ${entry.key}`;
    const screen = entry.scope === 'RESOURCE' ? managementScreens[entry.module as Resource] : undefined;
    if (screen && !effective(policyKey('SCREEN', screen, 'WRITE'))) return `Module Write is required for ${entry.key}`;
  }
  return null;
}

/** Pure V1 evaluator. No legacy screen/lookup path synthesizes category grants.
 * A valid snapshot is a prerequisite, not a replacement for record ownership,
 * field/state validation, transactional authority checks or route role guards. */
export function evaluatePermissions(input: PermissionEvaluationInput): EffectivePermissionSnapshot {
  const error = structuralError(input);
  const valid = !error && input.isActive;
  const role = typeof input?.role === 'string' && isPolicyRole(input.role) ? input.role : null;
  const defaults = valid ? new Map(input.rolePolicy!.permissions.map(row => [row.permissionKey, row.effect as PolicyEffect])) : new Map<string, PolicyEffect>();
  const overrides = valid ? new Map(input.overrides.map(row => [row.permissionKey, row.effect as PolicyEffect])) : new Map<string, PolicyEffect>();
  const profile = input?.driverProfile;
  const driverProfileId = valid && role === 'DRIVER' && object(profile) && typeof profile.id === 'string'
    && profile.id.trim() && profile.type === 'DRIVER' && profile.isActive === true ? profile.id : null;
  const decisions: Record<string, ActionPermissionDecision> = Object.create(null);
  for (const entry of PERMISSION_CATALOG) {
    const roleEffect = defaults.get(entry.key) ?? null;
    const overrideEffect = overrides.get(entry.key) ?? null;
    const locked = !!role && protectedAdmin(role, entry.key);
    const allowed = valid && !!role && roleActionCeiling(role, entry) && (locked || (overrideEffect ?? roleEffect) === 'ALLOW');
    const reason: PermissionReason = !valid ? 'INVALID_POLICY' : !roleActionCeiling(role!, entry) ? 'ROLE_RESTRICTION'
      : locked ? 'PROTECTED_ADMIN' : overrideEffect ? overrideEffect === 'ALLOW' ? 'USER_ALLOW' : 'USER_DENY'
        : roleEffect === 'ALLOW' ? 'ROLE_ALLOW' : 'ROLE_DENY';
    decisions[entry.key] = { ...entry, allowed, roleEffect, overrideEffect,
      source: !valid ? 'INVALID_POLICY' : locked ? 'PROTECTED_ADMIN' : overrideEffect ? 'USER_OVERRIDE' : 'ROLE_DEFAULT', reasons: [reason] };
  }
  const deny = (entry: typeof PERMISSION_CATALOG[number], reason: PermissionReason) => {
    const decision = decisions[entry.key];
    if (decision.allowed) { decision.allowed = false; decision.reasons.push(reason); }
  };
  // Module business rules narrow any stored Allow (see moduleAccessRules.ts).
  if (role) for (const entry of PERMISSION_CATALOG) if (policyEntryRestricted(role, entry)) deny(entry, 'ROLE_RESTRICTION');
  // Resolve READ first, then WRITE, then specific operations: a missing/denied
  // parent capability can never be bypassed by an explicit operation Allow.
  for (const entry of PERMISSION_CATALOG) if (entry.action !== 'READ'
    && !decisions[policyKey(entry.scope, entry.module, 'READ')]?.allowed) deny(entry, 'READ_REQUIRED');
  for (const entry of PERMISSION_CATALOG) if (entry.scope === 'RESOURCE' && entry.action === 'WRITE') {
    const screen = managementScreens[entry.module as Resource];
    if (screen && !decisions[policyKey('SCREEN', screen, 'WRITE')]?.allowed) deny(entry, 'MODULE_WRITE_REQUIRED');
  }
  for (const entry of PERMISSION_CATALOG) if (!['READ', 'WRITE'].includes(entry.action)
    && !decisions[policyKey(entry.scope, entry.module, 'WRITE')]?.allowed) deny(entry, 'WRITE_REQUIRED');
  if (role === 'DRIVER' && !driverProfileId) for (const entry of PERMISSION_CATALOG) {
    if (entry.scope === 'CATEGORY' || entry.scope === 'RESOURCE') deny(entry, 'DRIVER_LINK_REQUIRED');
  }
  const moduleCapabilities = (scope: PolicyScope, module: string): ModuleCapabilities => ({
    read: decisions[policyKey(scope, module, 'READ')]?.allowed ?? false,
    write: decisions[policyKey(scope, module, 'WRITE')]?.allowed ?? false,
    actions: Object.fromEntries(PERMISSION_CATALOG.filter(entry => entry.scope === scope && entry.module === module)
      .map(entry => [entry.action, decisions[entry.key].allowed])),
  });
  const resourceNames = PERMISSION_CATALOG.filter(entry => entry.scope === 'RESOURCE' && entry.action === 'READ').map(entry => entry.module as Resource);
  return {
    catalogVersion: PERMISSION_CATALOG_VERSION, userId: typeof input?.userId === 'string' ? input.userId : '', role, valid,
    errors: error ? [error] : input.isActive ? [] : ['Account is inactive'],
    rolePolicyRevision: revision(input?.rolePolicy?.revision), authorizationRevision: revision(input?.authorizationRevision), driverProfileId,
    effectiveScreens: POLICY_SCREENS.filter(module => decisions[policyKey('SCREEN', module, 'READ')].allowed),
    resources: resourceNames.filter(module => decisions[policyKey('RESOURCE', module, 'READ')].allowed),
    readableCategories: POLICY_CATEGORIES.filter(module => decisions[policyKey('CATEGORY', module, 'READ')].allowed),
    capabilities: {
      screens: Object.fromEntries(POLICY_SCREENS.map(module => [module, moduleCapabilities('SCREEN', module)])) as Record<Screen, ModuleCapabilities>,
      resources: Object.fromEntries(resourceNames.map(module => [module, moduleCapabilities('RESOURCE', module)])) as Record<Resource, ModuleCapabilities>,
      categories: Object.fromEntries(POLICY_CATEGORIES.map(module => [module, moduleCapabilities('CATEGORY', module)])) as Record<PolicyCategory, ModuleCapabilities>,
    }, decisions,
  };
}

export function hasActionPermission(snapshot: EffectivePermissionSnapshot, scope: PolicyScope, module: string, action: PolicyAction): boolean {
  const key = policyKey(scope, module, action);
  return snapshot.valid && owns(snapshot.decisions, key) && snapshot.decisions[key].allowed === true;
}

/** Read a coherent committed account/policy version. Never cache this result in
 * a JWT or reuse it for later requests; mutation transactions must recheck it. */
export async function loadEffectivePermissions(db: PrismaClient, userId: string): Promise<EffectivePermissionSnapshot | null> {
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: {
      id: true, role: true, isActive: true, authorizationRevision: true,
      permissionOverrides: { select: { userId: true, permissionKey: true, effect: true } },
      driverProfile: { select: { id: true, type: true, isActive: true } },
    } });
    if (!user) return null;
    const rolePolicy = await tx.rolePolicy.findUnique({ where: { role: user.role }, include: { permissions: true } });
    return evaluatePermissions({ userId: user.id, role: user.role, isActive: user.isActive,
      authorizationRevision: user.authorizationRevision, driverProfile: user.driverProfile, rolePolicy, overrides: user.permissionOverrides });
  }, { isolationLevel: 'RepeatableRead' });
}
