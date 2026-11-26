import type { AuthUser } from '../middleware/auth';
import { hasActionPermission } from './permissionEvaluator';
import { canWriteCategory } from './recordAccess';

// Pure authorization rules for addition requests. Kept free of database imports so
// notification and audit visibility can use them without loading db.ts.
export const REQUEST_RECORD_TYPE = 'MasterDataAdditionRequest';
export const ENTITY_TYPES = ['COMPANY', 'SUPPLIER'] as const;
export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type EntityType = typeof ENTITY_TYPES[number];
export type RequestStatus = typeof REQUEST_STATUSES[number];
export const MAX_SUPPLIER_SAP_NUMBERS = 10;
export const MAX_SUPPLIER_CATEGORIES = 100;
export const MAX_REQUEST_NOTES = 1000;

export const entityLabel = (type: EntityType) => type === 'COMPANY' ? 'Company' : 'Supplier';
export const isEntityType = (value: unknown): value is EntityType => typeof value === 'string' && (ENTITY_TYPES as readonly string[]).includes(value);

// ── Authorization (LEGACY + V1, no change to the frozen permission baselines) ──
const v1 = (user: AuthUser, scope: 'RESOURCE' | 'SCREEN' | 'CATEGORY', module: string, action: 'READ' | 'WRITE' | 'CREATE') =>
  !!user.snapshot && hasActionPermission(user.snapshot, scope, module, action);
const resource = (user: AuthUser, name: 'admin' | 'companies' | 'suppliers', action: 'READ' | 'WRITE' | 'CREATE' = 'READ') =>
  user.activeMode === 'V1' ? v1(user, 'RESOURCE', name, action) : user.resources.includes(name);

/** Entity types this account may see requests for (TASS: own requests only). */
export function readableEntityTypes(user: AuthUser): EntityType[] {
  if (user.role === 'ADMIN') return resource(user, 'admin') ? [...ENTITY_TYPES] : [];
  if (user.role !== 'TASS') return [];
  return ENTITY_TYPES.filter(type => resource(user, type === 'COMPANY' ? 'companies' : 'suppliers'));
}
export const canReadMasterDataRequests = (user: AuthUser) => readableEntityTypes(user).length > 0;

export function canSubmitMasterDataRequest(user: AuthUser, entityType: EntityType): boolean {
  if (user.role !== 'TASS') return false;
  const rmaWrite = user.activeMode === 'V1' ? v1(user, 'CATEGORY', 'RMA', 'WRITE') : canWriteCategory(user, 'RMA');
  return rmaWrite && resource(user, entityType === 'COMPANY' ? 'companies' : 'suppliers');
}

export function canRejectMasterDataRequest(user: AuthUser): boolean {
  if (user.role !== 'ADMIN') return false;
  return user.activeMode === 'V1' ? v1(user, 'RESOURCE', 'admin', 'WRITE') && v1(user, 'SCREEN', 'admin', 'WRITE') : user.resources.includes('admin');
}

/** Same authority as direct creation: POST /companies or POST /suppliers. */
export function canApproveMasterDataRequest(user: AuthUser, entityType: EntityType): boolean {
  if (!canRejectMasterDataRequest(user)) return false;
  if (user.activeMode === 'V1') {
    return entityType === 'COMPANY' ? v1(user, 'RESOURCE', 'companies', 'CREATE')
      : v1(user, 'RESOURCE', 'suppliers', 'CREATE') && v1(user, 'SCREEN', 'suppliers', 'READ') && v1(user, 'SCREEN', 'suppliers', 'WRITE');
  }
  return entityType === 'COMPANY' ? user.resources.includes('companies')
    : user.resources.includes('suppliers') && user.effectiveScreens.includes('suppliers');
}
