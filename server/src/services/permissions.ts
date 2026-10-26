import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export const SCREEN_LABELS = {
  main: 'Main', dashboard: 'Dashboard', deliveries: 'Deliveries', rma: 'RMA',
  accounting_collection: 'Accounting Collection', procurement_pickup: 'Procurement Pick-up',
  sales_orders: 'Sales Orders', customers: 'Customers', suppliers: 'Suppliers',
  driver: 'Driver View', driver_manager: 'Driver Manager', calendar: 'Delivery Calendar',
  driver_board: 'Driver Board', am_directory: 'AM Directory', transactions: 'Transaction Center',
  inventory: 'SKU Master', statistical_reports: 'Statistical Reports',
  driver_dashboard: 'Driver Dashboard', data_sampler: 'Data Sampler', admin: 'Admin Panel',
} as const;
export type Screen = keyof typeof SCREEN_LABELS;
export type Permission = { screen: string; granted: boolean };
export const RECORD_SCREENS = ['deliveries', 'rma', 'accounting_collection', 'procurement_pickup', 'sales_orders'] as const;
const AGGREGATE_SCREENS = ['main', 'dashboard', 'driver', 'calendar', 'driver_board', 'statistical_reports', 'driver_dashboard'] as const;
// SKU Master ('inventory') is an Admin default only (TSK-118); Admin can grant it per user.
export const ROLE_DEFAULTS: Record<string, readonly Screen[]> = {
  SALES_COORDINATOR: ['main', 'dashboard', ...RECORD_SCREENS.filter(s => s !== 'rma'), 'customers', 'suppliers', 'am_directory', 'transactions'],
  LOGISTICS: ['main', 'dashboard', ...RECORD_SCREENS, 'customers', 'suppliers', 'driver', 'driver_manager', 'calendar', 'driver_board', 'transactions', 'statistical_reports'],
  TASS: ['main', 'dashboard', 'rma', 'procurement_pickup', 'accounting_collection', 'transactions', 'suppliers'],
  ADMIN: (Object.keys(SCREEN_LABELS) as Screen[]).filter(s => s !== 'driver_dashboard'),
  DRIVER: ['driver_dashboard'],
};

// Screen grants never confer privileged administrative actions. Driver accounts
// use a standalone application; other screen grants cannot be rendered there.
export function editableScreens(role: string): Screen[] {
  if (role === 'DRIVER') return ['driver_dashboard'];
  return (Object.keys(SCREEN_LABELS) as Screen[]).filter(s =>
    s !== 'driver_dashboard' && s !== 'admin' && (s !== 'data_sampler' || role === 'ADMIN') &&
    (s !== 'rma' || ['TASS', 'LOGISTICS', 'ADMIN'].includes(role)));
}

export function effectiveScreens(role: string, overrides: readonly Permission[]): Screen[] {
  if (!ROLE_DEFAULTS[role]) return [];
  const screens = new Set(ROLE_DEFAULTS[role]);
  const editable = new Set(editableScreens(role));
  for (const p of overrides) {
    if (!editable.has(p.screen as Screen)) continue;
    if (p.granted === true) screens.add(p.screen as Screen);
    else if (p.granted === false) screens.delete(p.screen as Screen);
  }
  return (Object.keys(SCREEN_LABELS) as Screen[]).filter(s => screens.has(s) &&
    (s !== 'rma' || ['TASS', 'LOGISTICS', 'ADMIN'].includes(role)));
}

// Shared lookup access is distinct from management of the corresponding module.
export const RESOURCE_SCREENS = {
  records: [...RECORD_SCREENS, ...AGGREGATE_SCREENS],
  companies: [...RECORD_SCREENS, ...AGGREGATE_SCREENS, 'am_directory'],
  customers: ['customers'], suppliers: ['suppliers', 'procurement_pickup'],
  drivers: ['driver_manager', ...RECORD_SCREENS, ...AGGREGATE_SCREENS],
  // Read-only SKU lookup also comes with Transaction Center; SKU writes stay role-guarded.
  skus: ['inventory', 'transactions'], dashboard: ['dashboard'], transactions: ['transactions'],
  users: ['admin'], admin: ['admin'], dataSampler: ['data_sampler'],
} satisfies Record<string, readonly Screen[]>;
export type Resource = keyof typeof RESOURCE_SCREENS;
export function resourcesFor(screens: readonly string[]): Resource[] {
  return (Object.keys(RESOURCE_SCREENS) as Resource[]).filter(resource =>
    RESOURCE_SCREENS[resource].some(screen => screens.includes(screen)));
}

export function permissionSnapshot(role: string, permissions: readonly Permission[]) {
  const overrides = permissions.map(({ screen, granted }) => ({ screen, granted })).sort((a, b) => a.screen.localeCompare(b.screen));
  const screens = effectiveScreens(role, overrides);
  const version = createHash('sha256').update(JSON.stringify({ role, overrides, screens })).digest('hex');
  return { permissions: overrides, effectiveScreens: screens, resources: resourcesFor(screens), permissionVersion: version };
}

export function sessionUser(user: { id: string; name: string; email: string; role: string; permissions: Permission[] }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, ...permissionSnapshot(user.role, user.permissions) };
}

export function permissionEditor(user: { id: string; role: string; permissions: Permission[] }) {
  return {
    userId: user.id, ...permissionSnapshot(user.role, user.permissions),
    roleDefaults: ROLE_DEFAULTS[user.role] ?? [],
    catalog: Object.entries(SCREEN_LABELS).map(([screen, label]) => ({ screen, label })),
    editableScreens: editableScreens(user.role),
  };
}

export function permissionInputError(value: unknown): string | null {
  if (!Array.isArray(value)) return 'permissions must be an array';
  const seen = new Set<string>();
  for (const p of value) {
    if (!p || typeof p !== 'object' || typeof p.screen !== 'string' || !Object.prototype.hasOwnProperty.call(SCREEN_LABELS, p.screen) || typeof p.granted !== 'boolean' || Object.keys(p).some(key => !['screen', 'granted'].includes(key))) {
      return 'Each permission must contain a known screen and a boolean granted value';
    }
    if (seen.has(p.screen)) return `Duplicate screen: ${p.screen}`;
    seen.add(p.screen);
  }
  return null;
}

export class PermissionSaveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function replacePermissions(db: PrismaClient, userId: string, actorId: string, permissions: Permission[], expectedVersion: string) {
  return db.$transaction(async tx => {
    // Serialize changes for this account, including competing full replacements.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, include: { permissions: true } });
    if (!user) throw new PermissionSaveError(404, 'User not found');
    const previous = permissionSnapshot(user.role, user.permissions);
    if (expectedVersion !== previous.permissionVersion) throw new PermissionSaveError(409, 'Permissions or role changed. Reload module access before saving.');
    const editable = new Set<string>(editableScreens(user.role));
    if (permissions.some(p => !editable.has(p.screen))) throw new PermissionSaveError(400, 'This account cannot customize one or more submitted modules');
    await tx.userPermission.deleteMany({ where: { userId } });
    if (permissions.length) await tx.userPermission.createMany({ data: permissions.map(p => ({ userId, screen: p.screen, granted: p.granted })) });
    await tx.auditLog.create({ data: {
      recordId: userId, recordType: 'UserPermission', action: 'UPDATE', changedById: actorId,
      previousValue: JSON.stringify(previous.permissions), newValue: JSON.stringify(permissions),
    } });
    return permissionEditor({ ...user, permissions });
  });
}
