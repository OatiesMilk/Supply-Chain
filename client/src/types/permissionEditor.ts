import type { EffectivePermissionSnapshot, PermissionScope, PermissionAction } from './permissions';
export type PolicyEffect = 'ALLOW' | 'DENY';
export type PolicyRow = { permissionKey: string; effect: PolicyEffect };
export type PolicyCatalogEntry = { key: string; scope: PermissionScope; module: string; action: PermissionAction; canAllow?: boolean };
export interface RolePermissionEditor {
  contractVersion: 1; catalogVersion: 1; activeMode: 'LEGACY' | 'V1'; role: string;
  revision: string; expectedVersion: string; permissions: PolicyRow[]; catalog: PolicyCatalogEntry[];
}
export interface UserPermissionEditor extends Omit<RolePermissionEditor, 'revision'> {
  userId: string; conversionStatus: 'CONVERTED' | 'REQUIRED'; authorizationRevision: string;
  rolePolicyRevision: string; roleDefaults: PolicyRow[]; snapshot: EffectivePermissionSnapshot;
  roleChange?: { fromRole: string; toRole: string; rolePolicyRevision: string; permissions: PolicyRow[]; removedOverrides: PolicyRow[]; validationError: string | null; snapshot: EffectivePermissionSnapshot };
}
export type PolicySave = { contractVersion: 1; catalogVersion: 1; expectedVersion: string; permissions: PolicyRow[] };
export type PolicyAuditState = { role?: string; revision?: string; rolePolicyRevision?: string; authorizationRevision?: string;
  isActive?: boolean; driverActive?: boolean | null; microsoftLinked?: boolean; permissions?: PolicyRow[] };
