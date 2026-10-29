import { CATEGORY_ACTIONS, PERMISSION_CATEGORIES, PERMISSION_SCREENS, RESOURCE_ACTIONS, type PermissionAction, type PermissionCategory, type PermissionScope, type PermissionSession } from '../types/permissions';

const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(entry => typeof entry === 'string') && new Set(value).size === value.length;
const revision = (value: unknown) => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const groups = { SCREEN: 'screens', RESOURCE: 'resources', CATEGORY: 'categories' } as const;
const categoryAliases: Record<string, PermissionCategory> = { Deliveries: 'DELIVERY', RMA: 'RMA', 'Accounting Collection': 'ACCOUNTING_COLLECTION', 'Procurement Pick-up': 'PROCUREMENT_PICKUP', 'Sales Orders': 'SALES_ORDERS' };
export const permissionCategory = (value: string): PermissionCategory | undefined => categoryAliases[value] ?? (PERMISSION_CATEGORIES.includes(value as PermissionCategory) ? value as PermissionCategory : undefined);

/** Reject explicit new/unknown contracts instead of falling back to wider legacy access. */
export function completePermissionSession(user: unknown): user is PermissionSession {
  if (!object(user) || typeof user.id !== 'string' || !user.id || !['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'ADMIN', 'DRIVER'].includes(user.role)
    || !strings(user.effectiveScreens) || !strings(user.resources) || typeof user.permissionVersion !== 'string' || !user.permissionVersion) return false;
  if (user.activeMode !== undefined && !['LEGACY', 'V1'].includes(user.activeMode)) return false;
  if (user.contractVersion !== undefined && user.contractVersion !== 1) return false;
  if (user.activeMode !== 'V1') return user.snapshot === undefined && user.contractVersion === undefined;
  const snapshot = user.snapshot;
  if (user.contractVersion !== 1 || !object(snapshot) || snapshot.valid !== true || snapshot.catalogVersion !== 1 || snapshot.userId !== user.id || snapshot.role !== user.role
    || !revision(snapshot.rolePolicyRevision) || !revision(snapshot.authorizationRevision) || !Array.isArray(snapshot.errors) || snapshot.errors.length
    || !(snapshot.driverProfileId === null || typeof snapshot.driverProfileId === 'string' && snapshot.driverProfileId.length > 0)
    || !strings(snapshot.effectiveScreens) || !strings(snapshot.resources) || !strings(snapshot.readableCategories)
    || !object(snapshot.capabilities) || !object(snapshot.decisions)) return false;
  const catalog: Array<[PermissionScope, string, readonly PermissionAction[]]> = [
    ...PERMISSION_SCREENS.map(module => ['SCREEN', module, ['READ', 'WRITE']] as [PermissionScope, string, readonly PermissionAction[]]),
    ...Object.entries(RESOURCE_ACTIONS).map(([module, actions]) => ['RESOURCE', module, actions] as [PermissionScope, string, readonly PermissionAction[]]),
    ...PERMISSION_CATEGORIES.map(module => ['CATEGORY', module, CATEGORY_ACTIONS] as [PermissionScope, string, readonly PermissionAction[]]),
  ];
  const expectedKeys = catalog.flatMap(([scope, module, actions]) => actions.map(action => `${scope}:${module}:${action}`));
  if (Object.keys(snapshot.decisions).length !== expectedKeys.length || Object.keys(snapshot.decisions).some(key => !expectedKeys.includes(key))) return false;
  for (const [scope, group] of Object.entries(groups)) {
    const modules = catalog.filter(row => row[0] === scope).map(row => row[1]);
    if (!object(snapshot.capabilities[group]) || Object.keys(snapshot.capabilities[group]).length !== modules.length || Object.keys(snapshot.capabilities[group]).some(key => !modules.includes(key))) return false;
  }
  for (const [scope, module, actions] of catalog) {
    const caps = snapshot.capabilities[groups[scope]]?.[module];
    if (!object(caps) || typeof caps.read !== 'boolean' || typeof caps.write !== 'boolean' || !object(caps.actions)) return false;
    if (Object.keys(caps.actions).length !== actions.length || Object.keys(caps.actions).some(action => !actions.includes(action as PermissionAction))) return false;
    for (const action of actions) {
      const key = `${scope}:${module}:${action}`;
      const decision = snapshot.decisions[key];
      if (typeof caps.actions[action] !== 'boolean' || !object(decision) || decision.key !== key || decision.scope !== scope || decision.module !== module || decision.action !== action
        || decision.allowed !== caps.actions[action]) return false;
    }
    if (caps.read !== caps.actions.READ || caps.write !== (caps.actions.WRITE ?? false)) return false;
    if (caps.write && !caps.read || actions.some(action => !['READ', 'WRITE'].includes(action) && caps.actions[action] && !caps.write)) return false;
  }
  const equalSet = (actual: string[], expected: string[]) => actual.length === expected.length && actual.every(value => expected.includes(value));
  const screens = PERMISSION_SCREENS.filter(key => snapshot.capabilities.screens[key].read);
  const resources = Object.keys(RESOURCE_ACTIONS).filter(key => snapshot.capabilities.resources[key].read);
  const categories = PERMISSION_CATEGORIES.filter(key => snapshot.capabilities.categories[key].read);
  return equalSet(user.effectiveScreens, screens) && equalSet(snapshot.effectiveScreens, screens)
    && equalSet(user.resources, resources) && equalSet(snapshot.resources, resources) && equalSet(snapshot.readableCategories, categories);
}

export function permissionSessionKey(user: PermissionSession): string {
  const snapshot = user.activeMode === 'V1' ? user.snapshot : undefined;
  return JSON.stringify([user.id, user.role, user.activeMode ?? 'LEGACY', user.permissionVersion, snapshot?.catalogVersion, snapshot?.rolePolicyRevision, snapshot?.authorizationRevision]);
}

export function permissionsFor(user: PermissionSession | null | undefined) {
  const valid = completePermissionSession(user);
  const v1 = valid && user.activeMode === 'V1';
  const can = (scope: PermissionScope, module: string, action: PermissionAction = 'READ'): boolean => {
    if (!valid) return false;
    if (!v1) {
      // Legacy sessions keep their existing server-supplied visibility and existing UI role guards.
      if (scope === 'SCREEN') return user.effectiveScreens.includes(module);
      if (scope === 'RESOURCE') return user.resources.includes(module);
      const category = permissionCategory(module);
      return !!category && user.resources.includes('records');
    }
    const caps = user.snapshot!.capabilities[groups[scope]]?.[module];
    return !!caps && caps.read === true && (action === 'READ' || caps.write === true) && caps.actions[action] === true;
  };
  const canAccess = (screen: string) => can('SCREEN', screen);
  const canResource = (resource: string, action: PermissionAction = 'READ') => can('RESOURCE', resource, action);
  const canCategory = (category: string, action: PermissionAction = 'READ') => {
    const module = permissionCategory(category);
    return !!module && canResource('records') && can('CATEGORY', module, action);
  };
  const canRecord = (category: string, action: PermissionAction = 'READ', screen?: string) => canCategory(category, action)
    && (!screen || can('SCREEN', screen, action === 'READ' ? 'READ' : 'WRITE'));
  return { valid, v1, can, canAccess, canResource, canCategory, canRecord,
    canWrite: (screen: string) => can('SCREEN', screen, 'WRITE'),
    effectiveScreens: new Set(valid ? user.effectiveScreens.filter(canAccess) : []),
  };
}
