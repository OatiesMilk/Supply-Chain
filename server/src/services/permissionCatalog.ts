/**
 * V1 migration catalog. Frozen legacy semantics from permissions.ts,
 * recordAccess.ts, transactionAccess.ts and route guards at GH-243.
 * These rows are data, not a replacement for role/ownership/field/state guards.
 */
export const POLICY_ROLES = ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'ADMIN', 'DRIVER'] as const;
export type PolicyRole = typeof POLICY_ROLES[number];
export const POLICY_SCREENS = ['main', 'dashboard', 'deliveries', 'rma', 'accounting_collection', 'procurement_pickup', 'sales_orders', 'customers', 'suppliers', 'driver', 'driver_manager', 'calendar', 'driver_board', 'am_directory', 'transactions', 'inventory', 'statistical_reports', 'driver_dashboard', 'data_sampler', 'admin'] as const;
export const POLICY_CATEGORIES = ['DELIVERY', 'RMA', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'] as const;
export type PolicyCategory = typeof POLICY_CATEGORIES[number];
export type PolicyEffect = 'ALLOW' | 'DENY';
export type PolicyScope = 'SCREEN' | 'RESOURCE' | 'CATEGORY';
export type PolicyAction = 'READ' | 'WRITE' | 'CREATE' | 'UPDATE' | 'ASSIGN' | 'STATUS' | 'TIME_IN' | 'POD' | 'COMMENT' | 'SUBMIT' | 'RECEIVE' | 'COMPLETE' | 'VERIFY_COLLECTION' | 'DELETE' | 'ADJUST';
export type CatalogEntry = { key: string; scope: PolicyScope; module: string; action: PolicyAction };
export const policyKey = (scope: PolicyScope, module: string, action: PolicyAction) => `${scope}:${module}:${action}`;
const categoryScreen: Record<PolicyCategory, string> = { DELIVERY: 'deliveries', RMA: 'rma', ACCOUNTING_COLLECTION: 'accounting_collection', PROCUREMENT_PICKUP: 'procurement_pickup', SALES_ORDERS: 'sales_orders' };
const aggregate = ['main', 'dashboard', 'driver', 'calendar', 'driver_board', 'statistical_reports', 'driver_dashboard'];
const editors = ['driver_dashboard', 'driver', 'calendar', 'driver_board'];
const recordScreens = Object.values(categoryScreen);
const resourceScreens: Record<string, readonly string[]> = {
  records: [...recordScreens, ...aggregate], companies: [...recordScreens, ...aggregate, 'am_directory'],
  customers: ['customers'], suppliers: ['suppliers', 'procurement_pickup'], drivers: ['driver_manager', ...recordScreens, ...aggregate],
  skus: ['inventory', 'transactions'], dashboard: ['dashboard'], transactions: ['transactions'],
  users: ['admin'], admin: ['admin'], dataSampler: ['data_sampler'],
};
export const LEGACY_POLICY_DEFAULT_SCREENS: Record<PolicyRole, readonly string[]> = {
  SALES_COORDINATOR: ['main', 'dashboard', ...recordScreens.filter(s => s !== 'rma'), 'customers', 'suppliers', 'am_directory', 'transactions'],
  LOGISTICS: ['main', 'dashboard', ...recordScreens, 'customers', 'suppliers', 'driver', 'driver_manager', 'calendar', 'driver_board', 'transactions', 'statistical_reports'],
  TASS: ['main', 'dashboard', 'rma', 'procurement_pickup', 'accounting_collection', 'transactions', 'suppliers'],
  ADMIN: POLICY_SCREENS.filter(s => s !== 'driver_dashboard'), DRIVER: ['driver_dashboard'],
};
const resourceWrites: Record<string, readonly PolicyAction[]> = {
  companies: ['WRITE', 'CREATE'], customers: ['WRITE', 'CREATE', 'UPDATE'], suppliers: ['WRITE', 'CREATE'],
  drivers: ['WRITE', 'CREATE', 'UPDATE', 'DELETE'], skus: ['WRITE', 'CREATE', 'UPDATE', 'ADJUST'],
  users: ['WRITE', 'CREATE', 'UPDATE', 'DELETE'], admin: ['WRITE'], dataSampler: ['WRITE'],
};
const categoryActions: readonly PolicyAction[] = ['READ', 'WRITE', 'CREATE', 'UPDATE', 'ASSIGN', 'STATUS', 'TIME_IN', 'POD', 'COMMENT', 'SUBMIT', 'RECEIVE', 'COMPLETE', 'VERIFY_COLLECTION', 'DELETE'];
export const PERMISSION_CATALOG: readonly CatalogEntry[] = [
  ...POLICY_SCREENS.flatMap(module => (['READ', 'WRITE'] as const).map(action => ({ key: policyKey('SCREEN', module, action), scope: 'SCREEN' as const, module, action }))),
  ...Object.keys(resourceScreens).flatMap(module => (['READ', ...(resourceWrites[module] ?? [])] as PolicyAction[]).map(action => ({ key: policyKey('RESOURCE', module, action), scope: 'RESOURCE' as const, module, action }))),
  ...POLICY_CATEGORIES.flatMap(module => categoryActions.map(action => ({ key: policyKey('CATEGORY', module, action), scope: 'CATEGORY' as const, module, action }))),
];
export const CATALOG_KEYS = new Set(PERMISSION_CATALOG.map(p => p.key));
export function isPolicyRole(role: string): role is PolicyRole { return (POLICY_ROLES as readonly string[]).includes(role); }
export function legacyEditableScreen(role: PolicyRole, screen: string): boolean {
  if (!(POLICY_SCREENS as readonly string[]).includes(screen)) return false;
  if (role === 'DRIVER') return screen === 'driver_dashboard';
  return screen !== 'driver_dashboard' && screen !== 'admin' && (screen !== 'data_sampler' || role === 'ADMIN') && (screen !== 'rma' || ['TASS', 'LOGISTICS', 'ADMIN'].includes(role));
}
export type LegacyGrant = { id: string; screen: string; granted: boolean };
export function legacyPolicyScreens(role: PolicyRole, grants: readonly LegacyGrant[]): string[] {
  const screens = new Set(LEGACY_POLICY_DEFAULT_SCREENS[role]);
  for (const p of grants) if (legacyEditableScreen(role, p.screen)) {
    if (p.granted) screens.add(p.screen); else screens.delete(p.screen);
  }
  return POLICY_SCREENS.filter(s => screens.has(s));
}
/** Immutable ceilings include approved Step 00 RMA transport boundaries. They
 * do not grant new baseline operations during the no-expansion conversion. */
export function roleActionCeiling(role: PolicyRole, p: CatalogEntry): boolean {
  if (p.scope === 'SCREEN') {
    if (p.module === 'admin') return role === 'ADMIN';
    if (p.module === 'driver_dashboard') return role === 'DRIVER';
    if (role === 'DRIVER') return false;
    if (p.module === 'data_sampler') return role === 'ADMIN';
    if (p.module === 'rma' && role === 'SALES_COORDINATOR') return false;
    if (p.action === 'READ') return true;
    if (p.module === 'rma' && role === 'LOGISTICS') return true; // approved bounded assignment only; baseline remains denied
    // Maximum legacy module write authority, independent of current visibility.
    return legacyCapabilities(role, POLICY_SCREENS.filter(s => s !== 'driver_dashboard'), [], true).get(p.key) === 'ALLOW';
  }
  if (p.scope === 'CATEGORY') {
    const c = p.module as PolicyCategory;
    if (c === 'RMA' && role === 'SALES_COORDINATOR') return false;
    if (role === 'TASS' && !['RMA', 'ACCOUNTING_COLLECTION'].includes(c)) return false;
    if (p.action === 'DELETE') return false;
    if (p.action === 'READ') return true;
    if (p.action === 'VERIFY_COLLECTION') return role === 'TASS' && c === 'ACCOUNTING_COLLECTION';
    if (role === 'TASS' && c === 'ACCOUNTING_COLLECTION') return ['WRITE', 'CREATE', 'COMMENT'].includes(p.action);
    if (c === 'RMA') {
      if (p.action === 'RECEIVE' || p.action === 'COMPLETE') return role === 'TASS';
      if (role === 'LOGISTICS') return ['WRITE', 'ASSIGN'].includes(p.action);
      if (role === 'DRIVER') return ['WRITE', 'STATUS', 'TIME_IN', 'POD', 'COMMENT'].includes(p.action);
      if (p.action === 'ASSIGN') return role === 'ADMIN';
      return ['TASS', 'ADMIN'].includes(role) && p.action !== 'TIME_IN';
    }
    if (p.action === 'RECEIVE') return false;
    if (p.action === 'CREATE') return role !== 'DRIVER' && role !== 'TASS' && !(role === 'LOGISTICS' && c === 'DELIVERY');
    if (p.action === 'ASSIGN' || p.action === 'TIME_IN') return ['ADMIN', 'LOGISTICS', ...(p.action === 'TIME_IN' ? ['DRIVER'] : [])].includes(role);
    if (p.action === 'SUBMIT') return ['ADMIN', 'SALES_COORDINATOR'].includes(role);
    if (p.action === 'COMPLETE' || p.action === 'STATUS') return ['ADMIN', 'LOGISTICS', 'DRIVER'].includes(role) || p.action === 'STATUS' && role === 'SALES_COORDINATOR';
    if (p.action === 'UPDATE' && role === 'DRIVER') return false;
    return role !== 'TASS';
  }
  if (p.action === 'READ') {
    if (['users', 'admin', 'dataSampler'].includes(p.module)) return role === 'ADMIN';
    return role !== 'DRIVER' || ['records', 'companies', 'drivers', 'transactions'].includes(p.module);
  }
  if (p.module === 'companies') return ['ADMIN', 'SALES_COORDINATOR'].includes(role);
  if (p.module === 'customers' || p.module === 'suppliers') return ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS'].includes(role) || role === 'DRIVER' && p.action === 'CREATE';
  if (p.module === 'drivers') return ['ADMIN', 'LOGISTICS'].includes(role);
  if (p.module === 'skus') return role === 'ADMIN' || role === 'LOGISTICS' && ['WRITE', 'ADJUST'].includes(p.action);
  return role === 'ADMIN';
}
/** Snapshot of existing route-permitted operations. Driver rows are always
 * conditional on linked profile, matching assignment, non-draft and state. */
export function legacyCapabilities(role: PolicyRole, screens: readonly string[], grants: readonly LegacyGrant[], ceilingProbe = false): Map<string, PolicyEffect> {
  const allowed = new Set<string>();
  const add = (scope: PolicyScope, module: string, action: PolicyAction) => allowed.add(policyKey(scope, module, action));
  const has = (...choices: string[]) => choices.some(s => screens.includes(s));
  for (const screen of screens) add('SCREEN', screen, 'READ');
  for (const [resource, deps] of Object.entries(resourceScreens)) if (has(...deps)) add('RESOURCE', resource, 'READ');
  if (role === 'DRIVER' && has('driver_dashboard')) add('RESOURCE', 'transactions', 'READ');
  for (const c of POLICY_CATEGORIES) {
    const screen = categoryScreen[c];
    const readable = !(c === 'RMA' && !['TASS', 'LOGISTICS', 'ADMIN'].includes(role)) && !(role === 'TASS' && !['RMA', 'ACCOUNTING_COLLECTION'].includes(c)) && !grants.some(p => p.screen === screen && !p.granted) && has(screen, ...aggregate);
    if (!readable) continue;
    add('CATEGORY', c, 'READ');
    const edit = has(screen, ...editors) && !(role === 'LOGISTICS' && c === 'RMA');
    if (!edit) continue;
    add('CATEGORY', c, 'COMMENT');
    if (c === 'ACCOUNTING_COLLECTION' && role === 'TASS') add('CATEGORY', c, 'VERIFY_COLLECTION');
    // Route guards are narrower than the old general canWriteCategory helper.
    if (role !== 'DRIVER' && !(role === 'LOGISTICS' && c === 'DELIVERY')) add('CATEGORY', c, 'CREATE');
    if (role !== 'DRIVER' && (role !== 'TASS' || c === 'RMA')) add('CATEGORY', c, 'UPDATE');
    if (role === 'ADMIN' || role === 'LOGISTICS' && c !== 'RMA') add('CATEGORY', c, 'ASSIGN');
    if (['LOGISTICS', 'ADMIN', 'DRIVER'].includes(role) && c !== 'RMA') add('CATEGORY', c, 'TIME_IN');
    if (role !== 'TASS' || c === 'RMA') {
      add('CATEGORY', c, 'POD'); add('CATEGORY', c, 'COMMENT'); add('CATEGORY', c, 'STATUS');
    }
    if (['SALES_COORDINATOR', 'ADMIN'].includes(role) || role === 'TASS' && c === 'RMA') add('CATEGORY', c, 'SUBMIT');
    // Step 00 reserves physical receipt and final RMA completion for TASS.
    if (c === 'RMA' && role === 'TASS') { add('CATEGORY', c, 'RECEIVE'); add('CATEGORY', c, 'COMPLETE'); }
    if (c !== 'RMA' && ['LOGISTICS', 'ADMIN', 'DRIVER'].includes(role)) add('CATEGORY', c, 'COMPLETE');
  }
  for (const [resource, actions] of Object.entries(resourceWrites)) for (const action of actions) {
    if (action === 'WRITE') continue;
    const entry = { scope: 'RESOURCE' as const, module: resource, action, key: policyKey('RESOURCE', resource, action) };
    const read = allowed.has(policyKey('RESOURCE', resource, 'READ'));
    const requiresModule = resource === 'skus' && action === 'ADJUST' ? has('inventory') : resource === 'drivers' ? has('driver_manager') : resource === 'suppliers' ? has('suppliers') : true;
    if (read && requiresModule && roleActionCeiling(role, entry)) add('RESOURCE', resource, action);
  }
  // Admin management and data sampler are server guarded business modules.
  if (role === 'ADMIN') for (const resource of ['admin', 'dataSampler']) if (allowed.has(policyKey('RESOURCE', resource, 'READ'))) add('RESOURCE', resource, 'WRITE');
  for (const c of POLICY_CATEGORIES) if (categoryActions.some(a => a !== 'READ' && a !== 'WRITE' && allowed.has(policyKey('CATEGORY', c, a)))) add('CATEGORY', c, 'WRITE');
  for (const resource of Object.keys(resourceWrites)) if ((resourceWrites[resource] ?? []).some(a => a !== 'WRITE' && allowed.has(policyKey('RESOURCE', resource, a)))) add('RESOURCE', resource, 'WRITE');
  const screenResource: Record<string, string> = { customers: 'customers', suppliers: 'suppliers', driver_manager: 'drivers', inventory: 'skus', admin: 'admin', data_sampler: 'dataSampler' };
  for (const screen of screens) {
    const c = POLICY_CATEGORIES.find(c => categoryScreen[c] === screen);
    const write = c ? allowed.has(policyKey('CATEGORY', c, 'WRITE')) : screenResource[screen] ? allowed.has(policyKey('RESOURCE', screenResource[screen], 'WRITE')) : editors.includes(screen) && POLICY_CATEGORIES.some(c => allowed.has(policyKey('CATEGORY', c, 'WRITE')));
    if (write) add('SCREEN', screen, 'WRITE');
  }
  // No immutable ceiling recursion for SCREEN:WRITE; all legacy route checks
  // above already bound these writes. The probe permits testing all screens.
  void ceilingProbe;
  return new Map(PERMISSION_CATALOG.map(p => [p.key, allowed.has(p.key) ? 'ALLOW' : 'DENY']));
}
export function defaultRolePermissions(role: PolicyRole) {
  return legacyCapabilities(role, LEGACY_POLICY_DEFAULT_SCREENS[role], []);
}
