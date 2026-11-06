/** Wire contract shared with the V1 evaluator. These are catalog keys, never role defaults. */
export const PERMISSION_SCREENS = ['main', 'dashboard', 'deliveries', 'rma', 'accounting_collection', 'procurement_pickup', 'sales_orders', 'customers', 'suppliers', 'driver', 'driver_manager', 'calendar', 'driver_board', 'am_directory', 'transactions', 'inventory', 'statistical_reports', 'driver_dashboard', 'data_sampler', 'admin'] as const;
export const PERMISSION_CATEGORIES = ['DELIVERY', 'RMA', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'] as const;
export const RESOURCE_ACTIONS = {
  records: ['READ'], companies: ['READ', 'WRITE', 'CREATE'], customers: ['READ', 'WRITE', 'CREATE', 'UPDATE'],
  suppliers: ['READ', 'WRITE', 'CREATE'], drivers: ['READ', 'WRITE', 'CREATE', 'UPDATE', 'DELETE'],
  skus: ['READ', 'WRITE', 'CREATE', 'UPDATE', 'ADJUST'], dashboard: ['READ'], transactions: ['READ'],
  users: ['READ', 'WRITE', 'CREATE', 'UPDATE', 'DELETE'], admin: ['READ', 'WRITE'], dataSampler: ['READ', 'WRITE'],
} as const;
export const CATEGORY_ACTIONS = ['READ', 'WRITE', 'CREATE', 'UPDATE', 'ASSIGN', 'STATUS', 'TIME_IN', 'POD', 'COMMENT', 'SUBMIT', 'RECEIVE', 'COMPLETE', 'VERIFY_COLLECTION', 'DELETE'] as const;
export type PermissionCategory = typeof PERMISSION_CATEGORIES[number];
export type PermissionScope = 'SCREEN' | 'RESOURCE' | 'CATEGORY';
export type PermissionAction = typeof CATEGORY_ACTIONS[number] | 'ADJUST';
export interface ModuleCapabilities { read: boolean; write: boolean; actions: Partial<Record<PermissionAction, boolean>>; }
export interface PermissionDecision {
  key: string; scope: PermissionScope; module: string; action: PermissionAction; allowed: boolean;
  roleEffect: 'ALLOW' | 'DENY' | null; overrideEffect: 'ALLOW' | 'DENY' | null;
  source: 'ROLE_DEFAULT' | 'USER_OVERRIDE' | 'PROTECTED_ADMIN' | 'INVALID_POLICY'; reasons: string[];
}
export interface EffectivePermissionSnapshot {
  catalogVersion: 1; userId: string; role: string | null; valid: boolean; errors: string[];
  rolePolicyRevision: string | null; authorizationRevision: string | null; driverProfileId: string | null;
  effectiveScreens: string[]; resources: string[]; readableCategories: PermissionCategory[];
  capabilities: { screens: Record<string, ModuleCapabilities>; resources: Record<string, ModuleCapabilities>; categories: Record<string, ModuleCapabilities> };
  decisions: Record<string, PermissionDecision>;
}
export interface PermissionSession {
  id: string; role: string; effectiveScreens: string[]; resources: string[]; permissionVersion: string;
  contractVersion?: 1; activeMode?: 'LEGACY' | 'V1'; snapshot?: EffectivePermissionSnapshot;
}
