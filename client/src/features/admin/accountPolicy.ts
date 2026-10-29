import type { AccountPolicyVersion } from '../../api';
import type { UserPermissionEditor } from '../../types/permissionEditor';

/** Lifecycle tokens come from the reviewed server editor, never from local policy. */
export function accountPolicyVersion(editor: UserPermissionEditor): AccountPolicyVersion {
  return editor.activeMode === 'V1' ? { contractVersion: 1, expectedVersion: editor.expectedVersion } : {};
}

export function roleChangeVersion(editor: UserPermissionEditor): AccountPolicyVersion {
  if (editor.activeMode !== 'V1') return {};
  if (editor.roleChange?.validationError) throw new Error(editor.roleChange.validationError);
  return { ...accountPolicyVersion(editor), removedOverrideKeys: editor.roleChange?.removedOverrides.map(row => row.permissionKey) ?? [] };
}
