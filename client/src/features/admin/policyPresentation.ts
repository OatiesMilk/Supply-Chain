import type { ApiUserAdmin } from '@/api';
import type { PolicyCatalogEntry, PolicyRow } from '@/types/permissionEditor';
import type { PermissionScope } from '@/types/permissions';

export const ROLE_LABELS: Record<string, string> = {
  SALES_COORDINATOR: 'Sales Coordinator', LOGISTICS: 'Logistics', TASS: 'TASS', ADMIN: 'Admin', DRIVER: 'Driver',
};
export const SCOPE_LABELS: Record<PermissionScope, string> = {
  SCREEN: 'Screens & navigation', RESOURCE: 'Shared resources', CATEGORY: 'Record categories',
};
const MODULE_LABELS: Record<string, string> = {
  main: 'All Operations', accounting_collection: 'Accounting Collection', procurement_pickup: 'Procurement Pick-up',
  sales_orders: 'Sales Orders', driver: 'Driver View', driver_manager: 'Driver Manager', driver_board: 'Driver Board',
  driver_dashboard: 'Driver Dashboard', calendar: 'Delivery Calendar', am_directory: 'AM Directory',
  inventory: 'SKU Master', skus: 'SKU lookup & inventory', statistical_reports: 'Statistical Reports',
  data_sampler: 'Data Sampler', dataSampler: 'Data Sampler', admin: 'Admin Panel', users: 'User Management',
  records: 'Records', transactions: 'Transaction Center', DELIVERY: 'Deliveries', RMA: 'RMA',
  ACCOUNTING_COLLECTION: 'Accounting Collection', PROCUREMENT_PICKUP: 'Procurement Pick-up', SALES_ORDERS: 'Sales Orders',
};
export function policyLabel(value: string) {
  return ROLE_LABELS[value] ?? MODULE_LABELS[value] ?? value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}
export function actionLabel(action: string) {
  return ({ READ: 'Read', WRITE: 'Write', TIME_IN: 'Time In', POD: 'POD', VERIFY_COLLECTION: 'Verify collection' } as Record<string, string>)[action]
    ?? action.toLowerCase().replaceAll('_', ' ').replace(/^\w/, character => character.toUpperCase());
}
const PERMISSION_SCOPE_LABELS: Record<string, string> = {
  SCREEN: 'Screen access', RESOURCE: 'Shared resource', CATEGORY: 'Record category',
};
export function permissionLabel(key: string) {
  const [scope, module, action] = key.split(':');
  return module && action ? `${policyLabel(module)} → ${PERMISSION_SCOPE_LABELS[scope] ?? policyLabel(scope)} → ${actionLabel(action)}` : 'Unknown permission';
}
export function permissionEffectLabel(effect: string) {
  return ({ ALLOW: 'Allow', DENY: 'Deny', INHERIT: 'Inherit' } as Record<string, string>)[effect] ?? effect;
}
export function permissionMessage(message: string, catalog: PolicyCatalogEntry[]) {
  const keys = new Set(catalog.map(entry => entry.key));
  return message.replace(/\b(?:SCREEN|RESOURCE|CATEGORY):[A-Za-z0-9_]+:[A-Z_]+\b/g, key => keys.has(key) ? permissionLabel(key) : key);
}
export type ScopeFilter = 'ALL' | PermissionScope;
export type AssignmentFilter = 'ALL' | 'ASSIGNED' | 'UNASSIGNED';
export const DRIVER_SCREEN_MODULES = new Set(['driver', 'driver_manager', 'driver_board', 'driver_dashboard']);
export function assignedAccountCount(users: ApiUserAdmin[], role: string, available = true): number | null {
  return available ? users.filter(user => user.role === role).length : null;
}
export function filterRoles(roles: readonly string[], search: string, assignment: AssignmentFilter, count: (role: string) => number | null) {
  const query = search.trim().toLowerCase();
  return roles.filter(role => `${policyLabel(role)} ${role}`.toLowerCase().includes(query)
    && (assignment === 'ALL' || count(role) !== null && (assignment === 'ASSIGNED' ? count(role)! > 0 : count(role) === 0)));
}
export function selectedPermissionCount(rows: PolicyRow[], catalog: PolicyCatalogEntry[]) {
  const known = new Set(catalog.map(entry => entry.key));
  return new Set(rows.filter(row => row.effect === 'ALLOW' && known.has(row.permissionKey)).map(row => row.permissionKey)).size;
}
export interface PolicyModuleGroup { scope: PermissionScope; module: string; entries: PolicyCatalogEntry[]; }
export function groupPolicyCatalog(catalog: PolicyCatalogEntry[], search: string, scope: ScopeFilter): PolicyModuleGroup[] {
  const query = search.trim().toLowerCase();
  const groups = new Map<string, PolicyModuleGroup>();
  for (const entry of catalog) {
    if (scope !== 'ALL' && entry.scope !== scope) continue;
    if (query && !`${policyLabel(entry.module)} ${entry.module} ${SCOPE_LABELS[entry.scope]}`.toLowerCase().includes(query)) continue;
    const key = `${entry.scope}:${entry.module}`;
    const group = groups.get(key) ?? { scope: entry.scope, module: entry.module, entries: [] };
    group.entries.push(entry); groups.set(key, group);
  }
  return (['SCREEN', 'RESOURCE', 'CATEGORY'] as const).flatMap(currentScope => {
    const matching = [...groups.values()].filter(group => group.scope === currentScope);
    return currentScope === 'SCREEN' ? [...matching.filter(group => !DRIVER_SCREEN_MODULES.has(group.module)), ...matching.filter(group => DRIVER_SCREEN_MODULES.has(group.module))] : matching;
  });
}
export function missingPermissionFoundation(error: unknown): boolean {
  // The server's exact setup failure is distinct from transient network/503 errors.
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /permission foundation has not been initialized|permission foundation is unavailable|missing permission foundation/i.test(message);
}
