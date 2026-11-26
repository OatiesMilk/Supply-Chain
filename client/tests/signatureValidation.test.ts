import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePermissions } from '../../server/src/services/permissionEvaluator';
import { defaultRolePermissions, type PolicyRole } from '../../server/src/services/permissionCatalog';
import type { ApiUser } from '../src/api';
import { fetchProtectedSignature } from '../src/api';
import { assertPermissionRequest, ClientPermissionError, rememberPermissionRecord } from '../src/api/permissionRuntime';
import { useAuthStore } from '../src/store/authStore';
import { useUIStore } from '../src/store/uiStore';
import { getSignatureRejection, MAX_SIGNATURE_BYTES, SIGNATURE_ACCEPT } from '../src/utils/signatureValidation';

const file = (name: string, size: number, type: string) => ({ name, size, type });

test('only PNG/JPG signature images up to 2 MB pass the client pre-check', () => {
  assert.equal(SIGNATURE_ACCEPT, 'image/png,image/jpeg,.png,.jpg,.jpeg');
  for (const ok of [file('sig.png', 1024, 'image/png'), file('SIG.JPG', 1024, 'image/jpeg'), file('scan.jpeg', MAX_SIGNATURE_BYTES, 'image/jpeg'),
    file('s.jpg', 10, 'image/jpg'), file('s.png', 10, '')]) assert.equal(getSignatureRejection(ok), null, ok.name);
  for (const bad of [file('sig.svg', 10, 'image/svg+xml'), file('sig.pdf', 10, 'application/pdf'), file('sig.gif', 10, 'image/gif'),
    file('sig.webp', 10, 'image/webp'), file('sig.png', 10, 'image/svg+xml'), file('sig', 10, 'image/png'), file('sig.png', 0, 'image/png')]) {
    assert.match(getSignatureRejection(bad) ?? '', /PNG or JPG|empty/, bad.name);
  }
  assert.match(getSignatureRejection(file('big.png', MAX_SIGNATURE_BYTES + 1, 'image/png'))!, /2 MB/);
});

function account(role: PolicyRole): ApiUser {
  const snapshot = evaluatePermissions({
    userId: `v1-${role}`, role, isActive: true, authorizationRevision: '3',
    driverProfile: role === 'DRIVER' ? { id: 'driver-1', type: 'DRIVER', isActive: true } : null,
    rolePolicy: { role, revision: '9', catalogVersion: 1, permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) },
    overrides: [],
  });
  return { id: snapshot.userId, name: 'Signature Test', email: 'sig@example.test', role, permissions: [], effectiveScreens: snapshot.effectiveScreens,
    resources: snapshot.resources, permissionVersion: 'server-version', contractVersion: 1, activeMode: 'V1', snapshot };
}
function install(user: ApiUser, screen = 'rma') {
  useAuthStore.getState().setAuthUser(user);
  useUIStore.setState({ currentScreen: screen });
  rememberPermissionRecord({ id: 'rma-1', category: 'RMA', is_draft: 'No' });
}
afterEach(() => useAuthStore.getState().setAuthUser(null));

const allowed = (path: string, method = 'GET') => { try { assertPermissionRequest(path, { method }); return true; } catch (error) { assert.ok(error instanceof ClientPermissionError); return false; } };

test('V1 client rules mirror the signature endpoints', () => {
  install(account('ADMIN'), 'admin');
  assert.equal(allowed('/auth/me/signature', 'PUT'), true, 'self-service is under /auth');
  assert.equal(allowed('/users/u1/signature'), true);
  assert.equal(allowed('/users/u1/signature/image'), true);
  assert.equal(allowed('/users/u1/signature', 'PUT'), true);
  assert.equal(allowed('/users/u1/signature', 'DELETE'), true, 'removal checks users UPDATE, not DELETE');

  for (const role of ['TASS', 'LOGISTICS', 'SALES_COORDINATOR', 'DRIVER'] as PolicyRole[]) {
    install(account(role), 'rma');
    assert.equal(allowed('/auth/me/signature'), true, role);
    assert.equal(allowed('/auth/me/signature', 'DELETE'), true, role);
    assert.equal(allowed('/users/u1/signature', 'PUT'), false, role);
  }

  install(account('TASS'), 'rma');
  assert.equal(allowed('/records/rma-1/issuer-signature'), true);
  install(account('SALES_COORDINATOR'), 'rma');
  assert.equal(allowed('/records/rma-1/issuer-signature'), false, 'no RMA read, no issuer signature');
});

test('fetchProtectedSignature only reaches the three private signature image endpoints', async () => {
  install(account('TASS'), 'rma');
  for (const url of ['/api/v1/records/rma-1/attachments/a/download', '/api/v1/users/u1/signature', 'https://evil.example/api/v1/auth/me/signature/image/../x', '/uploads/signatures/sig.png']) {
    await assert.rejects(fetchProtectedSignature(url), /not available/, url);
  }
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response(null, { status: 204 }); }) as typeof fetch;
  try {
    assert.equal((await fetchProtectedSignature('/api/v1/records/rma-1/issuer-signature')).status, 204);
    assert.equal((await fetchProtectedSignature('/api/v1/auth/me/signature/image?v=1')).status, 204);
  } finally { globalThis.fetch = original; }
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/api\/v1\/records\/rma-1\/issuer-signature$/);
});
