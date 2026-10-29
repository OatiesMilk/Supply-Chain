import React from 'react';
import { PERMISSION_SCREENS, RESOURCE_ACTIONS, PERMISSION_CATEGORIES, CATEGORY_ACTIONS } from '@/types/permissions';
import type { PolicyAuditState, PolicyRow } from '@/types/permissionEditor';
import { policyChanges } from './PolicyEditor';
const validKeys = new Set([
  ...PERMISSION_SCREENS.flatMap(s => ['READ', 'WRITE'].map(a => `SCREEN:${s}:${a}`)),
  ...Object.entries(RESOURCE_ACTIONS).flatMap(([r, actions]) => actions.map(a => `RESOURCE:${r}:${a}`)),
  ...PERMISSION_CATEGORIES.flatMap(c => CATEGORY_ACTIONS.map(a => `CATEGORY:${c}:${a}`)),
]);
function safeRows(value: unknown): PolicyRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(p => p && typeof p.permissionKey === 'string' && validKeys.has(p.permissionKey) && ['ALLOW', 'DENY'].includes(p.effect));
}
export function auditChanges(previous: PolicyAuditState | null | undefined, next: PolicyAuditState | null | undefined) {
  const changes = policyChanges(safeRows(previous?.permissions), safeRows(next?.permissions)).map(c => `${c.key}: ${c.before} → ${c.after}`);
  for (const key of ['role', 'revision', 'rolePolicyRevision', 'authorizationRevision', 'isActive', 'driverActive', 'microsoftLinked'] as const) {
    const a = previous?.[key], b = next?.[key];
    if (a !== b && [a, b].every(v => v === undefined || v === null || typeof v === 'string' || typeof v === 'boolean')) changes.push(`${key}: ${a ?? 'none'} → ${b ?? 'none'}`);
  }
  return changes;
}
export default function PolicyAuditDiff({ recordType, previous, next }: { recordType: string; previous?: PolicyAuditState | null; next?: PolicyAuditState | null }) {
  if (!['RolePolicy', 'UserPermissionOverride', 'UserAuthorization'].includes(recordType) || !previous && !next) return null;
  const changes = auditChanges(previous, next);
  return <details className="text-xs mt-2"><summary className="cursor-pointer">Permission changes ({changes.length})</summary><ul className="space-y-1 mt-2">{changes.map((c, i) => <li className="break-words" key={i}>{c}</li>)}</ul></details>;
}
