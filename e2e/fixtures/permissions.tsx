import React from 'react';
import { createRoot } from 'react-dom/client';
import { api, ApiError } from '../../client/src/api';
import { PolicyEditor } from '../../client/src/features/admin/PolicyEditor';
import { defaultRolePermissions, PERMISSION_CATALOG, roleActionCeiling, type PolicyRole } from '../../server/src/services/permissionCatalog';
import { evaluatePermissions } from '../../server/src/services/permissionEvaluator';
import type { PolicyRow, UserPermissionEditor } from '../../client/src/types/permissionEditor';

/** Browser fixture uses the real editor and evaluator, with synthetic API responses. */
(window as any).mountPermissions = (role: PolicyRole = 'SALES_COORDINATOR', conflictOnce = false) => {
  let revision = 1;
  let rows: PolicyRow[] = [];
  let writes = 0;
  const defaults = [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect }));
  const roleEditor = () => ({ contractVersion: 1 as const, catalogVersion: 1 as const, activeMode: 'V1' as const, role,
    revision: String(revision), expectedVersion: `v1:${String(revision).padStart(64, '0')}`, permissions: defaults,
    catalog: PERMISSION_CATALOG.map(row => ({ ...row, canAllow: roleActionCeiling(role, row) })) });
  const userEditor = (): UserPermissionEditor => ({ ...roleEditor(), userId: 'browser-fixture', conversionStatus: 'CONVERTED',
    authorizationRevision: String(revision), rolePolicyRevision: '1', permissions: rows, roleDefaults: defaults,
    snapshot: evaluatePermissions({ userId: 'browser-fixture', role, isActive: true, authorizationRevision: String(revision),
      rolePolicy: { role, catalogVersion: 1, revision: '1', permissions: defaults }, overrides: rows }) });
  api.getRolePermissionEditor = async () => roleEditor();
  api.getUserPermissionEditor = async () => userEditor();
  api.saveUserPermissionEditor = async (_id, body) => {
    if (conflictOnce) { conflictOnce = false; revision++; throw new ApiError('Another administrator saved first', 409); }
    if (body.expectedVersion !== userEditor().expectedVersion) throw new ApiError('Stale editor', 409);
    rows = body.permissions; writes++; revision++; return userEditor();
  };
  api.resetUserPermissionEditor = async () => { rows = []; writes++; revision++; return userEditor(); };
  (window as any).permissionFixtureWrites = () => writes;
  const root = createRoot(document.getElementById('root')!);
  root.render(<PolicyEditor role={role} user={{ id: 'browser-fixture', name: 'Synthetic Admin Target', email: 'fixture@example.test', role, is_active: true, microsoft_linked: false, created_at: '' }} onClose={() => root.unmount()} />);
};
