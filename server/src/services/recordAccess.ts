import type { AuthUser } from '../middleware/auth';
import type { Prisma } from '@prisma/client';
import type { Screen } from './permissions';
import { hasActionPermission, type EffectivePermissionSnapshot } from './permissionEvaluator';
import { POLICY_CATEGORIES, type PolicyAction, type PolicyCategory } from './permissionCatalog';
import { driverDeliveryDateError, isoTimestamp, runState, timeInError, transitionError, type RunRecord, type RunState } from './deliveryLifecycle';

export const CATEGORY_SCREEN: Record<string, Screen> = {
  DELIVERY: 'deliveries', RMA: 'rma', ACCOUNTING_COLLECTION: 'accounting_collection',
  PROCUREMENT_PICKUP: 'procurement_pickup', SALES_ORDERS: 'sales_orders',
};

// Aggregate views need shared records, but an explicit category denial also
// removes those records from shared lists and direct detail/audit endpoints.
export function readableCategories(user: AuthUser): string[] {
  const aggregate: Screen[] = ['main', 'dashboard', 'calendar', 'driver', 'driver_board', 'driver_dashboard', 'statistical_reports'];
  const shared = aggregate.some(s => user.effectiveScreens.includes(s));
  return Object.keys(CATEGORY_SCREEN).filter(category => {
    const screen = CATEGORY_SCREEN[category];
    // Sales Coordinator must not discover RMA records through aggregate views.
    if (category === 'RMA' && !['TASS', 'LOGISTICS', 'ADMIN'].includes(user.role)) return false;
    if (user.role === 'TASS' && !['ACCOUNTING_COLLECTION', 'RMA'].includes(category)) return false;
    if (user.permissions.some(p => p.screen === screen && p.granted === false)) return false;
    return shared || user.effectiveScreens.includes(screen);
  });
}

// Drivers own runs through the Admin-linked Driver profile id. A Driver without
// a linked profile owns nothing (never `driverId: null`, which would match
// every unassigned record).
export function recordScope(user: AuthUser): Prisma.DeliveryRecordWhereInput {
  return {
    category: { in: readableCategories(user) },
    ...(user.role === 'DRIVER'
      ? (user.driverProfileId ? { driverId: user.driverProfileId, draft: false } : { id: { in: [] } })
      : {}),
  };
}

export function isAssignedDriver(user: AuthUser, record: { driverId?: string | null; draft: boolean }): boolean {
  return user.role === 'DRIVER' && !!user.driverProfileId && record.driverId === user.driverProfileId && !record.draft;
}

export function canReadRecord(
  user: AuthUser,
  record: { category?: string | null; driverId?: string | null; draft?: boolean }
): boolean {
  const category = record.category ?? 'ACCOUNTING_COLLECTION';
  if (!readableCategories(user).includes(category)) return false;
  if (user.role === 'DRIVER') {
    if (!user.driverProfileId) return false;
    if (record.driverId !== user.driverProfileId) return false;
    if (record.draft) return false;
  }
  return true;
}

export function canWriteCategory(user: AuthUser, category: string): boolean {
  const screen = CATEGORY_SCREEN[category];
  if (!screen || !readableCategories(user).includes(category)) return false;
  if (user.role === 'LOGISTICS' && category === 'RMA') return false;
  if (category === 'RMA' && !['TASS', 'ADMIN'].includes(user.role)) return false;
  // Scheduling views can edit their records, subject to the existing action
  // and field-level role restrictions in records.ts.
  const editors: Screen[] = [screen, 'driver_dashboard', 'driver', 'calendar', 'driver_board'];
  return editors.some(s => user.effectiveScreens.includes(s));
}

/** Creating a record can be narrower than managing an existing operational record. */
export function canCreateCategory(user: AuthUser, category: string): boolean {
  if (!canWriteCategory(user, category)) return false;
  // Logistics retains assignment and run management for saved Deliveries but
  // Sales Coordinator owns creation of new Delivery records.
  if (user.role === 'LOGISTICS' && category === 'DELIVERY') return false;
  return true;
}

// Action-aware helpers are opt-in for the downstream route activation. Do not
// mix a V1 snapshot with the legacy boolean helpers above.

export type PolicyRecordPath = Screen | 'records' | 'transactions';
export interface RmaTransportContext {
  /** Trusted domain facts, not request body flags. Missing facts deny transport. */
  requiresLogistics: boolean;
  requiresInternalDriver: boolean;
  eligible: boolean;
  /** Domain validation of the separate transport action, date and current state. */
  actionAllowed: boolean;
}
export interface PolicyRecord extends RunRecord {
  id?: string;
  category?: string;
  driverId?: string | null;
  deletedAt?: Date | string | null;
  collectionVerified?: boolean;
}
export interface PolicyRecordOptions {
  path?: PolicyRecordPath;
  rmaTransport?: RmaTransportContext;
  now?: Date;
  targetStatus?: RunState;
}
// Shared with transactionAccess so list predicates and instance checks cannot
// disagree about a role's transaction-category ceiling.
export function transactionCategories(role: string): string[] {
  switch (role) {
    case 'ADMIN':
    case 'DRIVER': return Object.keys(CATEGORY_SCREEN);
    case 'SALES_COORDINATOR': return ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'];
    case 'LOGISTICS': return ['DELIVERY', 'RMA', 'PROCUREMENT_PICKUP'];
    case 'TASS': return ['RMA', 'ACCOUNTING_COLLECTION'];
    default: return [];
  }
}
const recordPaths: readonly Screen[] = ['main', 'dashboard', ...Object.values(CATEGORY_SCREEN), 'driver', 'calendar', 'driver_board', 'statistical_reports', 'driver_dashboard'];
function policyPathAllowed(snapshot: EffectivePermissionSnapshot, path: PolicyRecordPath, write = false): boolean {
  if (!hasActionPermission(snapshot, 'RESOURCE', 'records', 'READ')) return false;
  if (path === 'records') return true;
  if (path === 'transactions') return !write && hasActionPermission(snapshot, 'RESOURCE', 'transactions', 'READ');
  return recordPaths.includes(path) && hasActionPermission(snapshot, 'SCREEN', path, write ? 'WRITE' : 'READ');
}

export function readablePolicyCategories(snapshot: EffectivePermissionSnapshot, path: PolicyRecordPath = 'records'): PolicyCategory[] {
  if (!policyPathAllowed(snapshot, path)) return [];
  return POLICY_CATEGORIES.filter(category => hasActionPermission(snapshot, 'CATEGORY', category, 'READ')
    && (path !== 'transactions' || transactionCategories(snapshot.role ?? '').includes(category)));
}

/** Every list/detail/report query must intersect this scope. An RMA driver list
 * additionally needs IDs resolved by a trusted movement adapter: the current
 * schema has no authoritative logistics/driver-required flag. Omission denies
 * driver RMA rows; never infer eligibility from an assigned driver alone. */
export function policyRecordScope(
  snapshot: EffectivePermissionSnapshot,
  path: PolicyRecordPath = 'records',
  eligibleRmaTransportIds: readonly string[] = [],
): Prisma.DeliveryRecordWhereInput {
  const categories = readablePolicyCategories(snapshot, path);
  const base: Prisma.DeliveryRecordWhereInput = { deletedAt: null, category: { in: categories } };
  if (snapshot.role !== 'DRIVER') return base;
  if (!snapshot.driverProfileId) return { ...base, id: { in: [] } };
  return {
    ...base, driverId: snapshot.driverProfileId, draft: false,
    OR: [
      { category: { in: categories.filter(category => category !== 'RMA') } },
      { category: 'RMA', id: { in: eligibleRmaTransportIds.filter(id => typeof id === 'string' && !!id.trim()) } },
    ],
  };
}

function eligibleRmaTransport(context: RmaTransportContext | undefined): boolean {
  return context?.requiresLogistics === true && context.requiresInternalDriver === true && context.eligible === true;
}
export function canReadPolicyRecord(snapshot: EffectivePermissionSnapshot, record: PolicyRecord, options: PolicyRecordOptions = {}): boolean {
  if (record.deletedAt || !record.category || !readablePolicyCategories(snapshot, options.path).includes(record.category as PolicyCategory)) return false;
  if (snapshot.role === 'DRIVER') {
    if (!snapshot.driverProfileId || record.driverId !== snapshot.driverProfileId || record.draft !== false) return false;
    if (record.category === 'RMA' && !eligibleRmaTransport(options.rmaTransport)) return false;
  }
  return true;
}
export function canWritePolicyCategory(snapshot: EffectivePermissionSnapshot, category: string, path: PolicyRecordPath = 'records'): boolean {
  return policyPathAllowed(snapshot, path, true) && hasActionPermission(snapshot, 'CATEGORY', category, 'WRITE');
}
export function canCreatePolicyCategory(snapshot: EffectivePermissionSnapshot, category: string, path: PolicyRecordPath = 'records'): boolean {
  return canWritePolicyCategory(snapshot, category, path) && hasActionPermission(snapshot, 'CATEGORY', category, 'CREATE');
}
export type PolicyRecordOperation = Exclude<PolicyAction, 'READ' | 'WRITE' | 'CREATE' | 'ADJUST'>;

/** Authorization prerequisite for a specific operation. Callers must still
 * enforce per-field validation, transition inputs, POD evidence and business
 * invariants in the write transaction. Never treat category WRITE as UPDATE. */
export function canPerformPolicyRecordAction(
  snapshot: EffectivePermissionSnapshot, record: PolicyRecord, action: PolicyRecordOperation, options: PolicyRecordOptions = {},
): boolean {
  if (!canReadPolicyRecord(snapshot, record, options) || !canWritePolicyCategory(snapshot, record.category!, options.path)
    || !hasActionPermission(snapshot, 'CATEGORY', record.category!, action)) return false;
  const role = snapshot.role!;
  if (action === 'VERIFY_COLLECTION') return role === 'TASS' && record.category === 'ACCOUNTING_COLLECTION'
    && record.status === 'ACCOMPLISHED' && record.draft === false && record.collectionVerified === false;
  if (record.category === 'RMA') {
    // Assignment/transport may not manufacture driver clocks for internal or
    // non-Logistics movements. Physical receipt/final completion belong to TASS.
    if (action === 'ASSIGN' && !eligibleRmaTransport(options.rmaTransport)) return false;
    if (role === 'DRIVER') return eligibleRmaTransport(options.rmaTransport) && options.rmaTransport?.actionAllowed === true
      && options.targetStatus !== 'Delivered';
  }
  if (role === 'DRIVER' && driverDeliveryDateError(record, role, options.now)) return false;
  if (action === 'TIME_IN') return timeInError(record) === null;
  if (action === 'STATUS' || action === 'SUBMIT' || action === 'COMPLETE') {
    const target = action === 'COMPLETE' ? 'Delivered' : action === 'SUBMIT' ? 'Scheduled' : options.targetStatus;
    if (!target) return false;
    if (target === 'Delivered' && !hasActionPermission(snapshot, 'CATEGORY', record.category!, 'COMPLETE')) return false;
    if (role === 'SALES_COORDINATOR' && !(target === 'Draft' || record.draft && target === 'Scheduled')) return false;
    if (action === 'SUBMIT' && record.draft !== true) return false;
    if ((target === 'Draft' || record.draft && target === 'Scheduled')
      && !hasActionPermission(snapshot, 'CATEGORY', record.category!, 'SUBMIT')) return false;
    if (target === 'Delivered' && record.category !== 'RMA' && !isoTimestamp(record.timeIn)) return false;
    return transitionError(record, target, role) === null;
  }
  // Unknown stored states must not grant operational writes. COMMENT/POD remain
  // available on completed runs, as in the current routes.
  return ['Draft', 'Scheduled', 'In Transit', 'Delivered', 'Pending', 'On-Hold', 'Rescheduled'].includes(runState(record));
}
