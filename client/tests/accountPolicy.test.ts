import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { accountPolicyVersion, roleChangeVersion } from '../src/features/admin/accountPolicy';
import type { UserPermissionEditor } from '../src/types/permissionEditor';
import { api } from '../src/api';
import { installLegacySession } from './helpers/permissionSession';
import { useAuthStore } from '../src/store/authStore';

function editor(mode: 'LEGACY' | 'V1', roleChange?: UserPermissionEditor['roleChange']) {
  return { activeMode: mode, expectedVersion: 'v1:reviewed-token', roleChange } as UserPermissionEditor;
}
test('legacy lifecycle calls retain the compatibility contract', () => {
  assert.deepEqual(accountPolicyVersion(editor('LEGACY')), {});
  assert.deepEqual(roleChangeVersion(editor('LEGACY')), {});
});
test('V1 lifecycle uses the server version, including for an unchanged role', () => {
  assert.deepEqual(accountPolicyVersion(editor('V1')), { contractVersion: 1, expectedVersion: 'v1:reviewed-token' });
  assert.deepEqual(roleChangeVersion(editor('V1')), { contractVersion: 1, expectedVersion: 'v1:reviewed-token', removedOverrideKeys: [] });
});
test('role change acknowledges exactly the server-preview removals and rejects invalid previews', () => {
  const change = { removedOverrides: [{ permissionKey: 'SCREEN:admin:READ', effect: 'DENY' }], validationError: null } as NonNullable<UserPermissionEditor['roleChange']>;
  assert.deepEqual(roleChangeVersion(editor('V1', change)), {
    contractVersion: 1, expectedVersion: 'v1:reviewed-token', removedOverrideKeys: ['SCREEN:admin:READ'],
  });
  assert.throws(() => roleChangeVersion(editor('V1', { ...change, validationError: 'Write requires Read' })), /Write requires Read/);
});

test('lifecycle API sends reviewed versions and encodes destination role previews', async () => {
  installLegacySession('ADMIN', 'admin');
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  try {
    const version = accountPolicyVersion(editor('V1'));
    await api.deactivateUser('target', version);
    await api.activateUser('target', version);
    await api.deleteUser('target', version);
    await api.setUserDriverProfile('target', null, version);
    await api.getUserPermissionEditor('target', 'DRIVER');
    for (const call of calls.slice(0, 3)) assert.deepEqual(call.body, version);
    assert.deepEqual(calls[3].body, { driver_profile_id: null, ...version });
    assert.match(calls[4].url, /contractVersion=1&role=DRIVER$/);
  } finally { fetchMock.mock.restore(); useAuthStore.getState().setAuthUser(null); }
});
