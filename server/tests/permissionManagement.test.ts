import { installRmaPolicyLookup, rmaTestAccount } from './rmaTestPolicy';
import { beforeEach, afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/db';
import adminRoutes from '../src/routes/admin';
import usersRoutes from '../src/routes/users';
import { signToken } from '../src/middleware/auth';
import { defaultRolePermissions, type PolicyRole } from '../src/services/permissionCatalog';
import { actionPermissionInputError } from '../src/services/permissionEvaluator';
import { permissionMode, permissionSaveBody, PolicyManagementError, safePolicyAudit } from '../src/services/permissionManagement';

let restoreRmaPolicy: (() => void) | undefined;
beforeEach(() => { restoreRmaPolicy = installRmaPolicyLookup(); });
afterEach(() => { restoreRmaPolicy?.(); mock.restoreAll(); });
const version = `v1:${'a'.repeat(64)}`;
const body = (permissions: unknown) => ({ contractVersion: 1, catalogVersion: 1, expectedVersion: version, permissions });
const status = (n: number) => (error: unknown) => error instanceof PolicyManagementError && error.status === n;

test('V1 body parser rejects unversioned, unknown, duplicate, inherited and cross-account fields', () => {
  const row = { permissionKey: 'SCREEN:dashboard:READ', effect: 'ALLOW' };
  for (const value of [null, [], { permissions: [] }, { ...body([]), extra: true }, { ...body([]), catalogVersion: 2 },
    { ...body([]), expectedVersion: 'old' }, body([row, row]), body([{ ...row, userId: 'other' }]),
    body([{ ...row, permissionKey: 'RESOURCE:records:WRITE' }]), body([{ ...row, effect: 'INHERIT' }]),
    body([{ screen: 'dashboard', granted: true }])]) assert.throws(() => permissionSaveBody(value), status(400));
  assert.deepEqual(permissionSaveBody(body([row])).permissions, [row]);
  assert.deepEqual(permissionSaveBody({ contractVersion: 1, catalogVersion: 1, expectedVersion: version }, true).permissions, []);
  assert.throws(() => permissionSaveBody(body([]), true), status(400));
});

test('complete-state validation rejects Write without Read, shared lookup writes, protected admin denials and role escalation', () => {
  const proposed = (role: PolicyRole, overrides: Array<{ permissionKey: string; effect: string }>) => ({
    userId: 'target', role, isActive: true, authorizationRevision: '1', overrides,
    rolePolicy: { role, revision: '1', catalogVersion: 1, permissions: [...defaultRolePermissions(role)].map(([permissionKey, effect]) => ({ permissionKey, effect })) },
  });
  assert.match(actionPermissionInputError(proposed('SALES_COORDINATOR', [{ permissionKey: 'SCREEN:deliveries:READ', effect: 'DENY' }]))!, /Read/);
  assert.match(actionPermissionInputError(proposed('LOGISTICS', [{ permissionKey: 'RESOURCE:skus:WRITE', effect: 'ALLOW' }]))!, /Module Write/);
  assert.match(actionPermissionInputError(proposed('ADMIN', [{ permissionKey: 'SCREEN:admin:READ', effect: 'DENY' }]))!, /protected/);
  assert.match(actionPermissionInputError(proposed('SALES_COORDINATOR', [{ permissionKey: 'RESOURCE:users:WRITE', effect: 'ALLOW' }]))!, /Role cannot/);
  assert.equal(actionPermissionInputError(proposed('SALES_COORDINATOR', [{ permissionKey: 'SCREEN:main:READ', effect: 'ALLOW' }])), null, 'explicit equal-to-default Allow remains valid');
});

test('safe permission audit projection never emits arbitrary JSON, secrets or unsupported rows', () => {
  const unsafe = JSON.stringify({ role: 'ADMIN', revision: '42', authorizationRevision: '11', catalogVersion: 1,
    password: 'must-not-leak', microsoftOid: 'must-not-leak', token: 'must-not-leak',
    permissions: [{ permissionKey: 'SCREEN:main:READ', effect: 'DENY', password: 'must-not-leak' }, { permissionKey: 'unknown', effect: 'ALLOW' }],
  });
  assert.deepEqual(safePolicyAudit('RolePolicy', unsafe), { role: 'ADMIN', revision: '42', authorizationRevision: '11', catalogVersion: 1, permissions: [{ permissionKey: 'SCREEN:main:READ', effect: 'DENY' }] });
  assert.equal(safePolicyAudit('Driver', unsafe), null);
  assert.equal(safePolicyAudit('UserAuthorization', '{broken'), null);
  assert.equal(safePolicyAudit('RolePolicy', '[]'), null);
});

test('permission management routes enforce cookies, ADMIN, version negotiation and the activation gate', async () => {
  const previousMode = process.env.PERMISSION_MODE;
  const originalLookup = prisma.user.findUnique;
  const originalTransaction = prisma.$transaction;
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/admin', adminRoutes); app.use('/api/users', usersRoutes);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: error.message }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let transactions = 0;
  let currentRole = 'ADMIN';
  const account = (id: string, role: string) => ({ id, name: id, email: `${id}@example.test`, role, isActive: true, authorizationRevision: 1n,
    password: 'never serialize', microsoftOid: 'never serialize', permissions: [], permissionOverrides: [], driverProfile: null, permissionConversion: null });
  prisma.user.findUnique = mock.fn(async ({ where }: any) => account(where.id, where.id === 'sales' ? 'SALES_COORDINATOR' : currentRole)) as any;
  prisma.$transaction = mock.fn(async (work: any) => {
    transactions++;
    return work({ $executeRaw: async () => 1, $queryRaw: async () => [], user: { findUnique: async ({ where }: any) => account(where.id, currentRole) },
      rolePolicy: { findUnique: async ({ where }: any) => ({ role: where.role, revision: 1n, catalogVersion: 1,
        permissions: [...defaultRolePermissions(where.role)].map(([permissionKey, effect]) => ({ permissionKey, effect, role: where.role })) }) } });
  }) as any;
  const cookie = (id: string) => `mg_session=${signToken({ id, name: id, email: `${id}@example.test`, role: id === 'sales' ? 'SALES_COORDINATOR' : 'ADMIN' })}`;
  const send = (path: string, method = 'GET', payload?: unknown, actor: string | null = 'admin') => fetch(url + path, {
    method, headers: { 'Content-Type': 'application/json', ...(actor ? { Cookie: cookie(actor) } : {}) }, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
  try {
    delete process.env.PERMISSION_MODE;
    assert.equal(permissionMode(), 'LEGACY');
    for (const path of ['/api/admin/roles/LOGISTICS/permissions', '/api/users/target/permissions?contractVersion=1']) {
      assert.equal((await send(path, 'GET', undefined, null)).status, 401);
      assert.equal((await send(path, 'GET', undefined, 'sales')).status, 403);
      const result = await send(path);
      assert.equal(result.status, 200);
      const payload = await result.json() as any;
      assert.equal(payload.activeMode, 'LEGACY');
      assert.match(payload.expectedVersion, /^v1:/);
      assert.doesNotMatch(JSON.stringify(payload), /never serialize/);
    }
    assert.equal((await send('/api/admin/roles/unknown/permissions')).status, 400);
    assert.equal((await send('/api/users/target/permissions?contractVersion=2')).status, 400);
    assert.equal((await send('/api/admin/roles/LOGISTICS/permissions', 'PUT', body([]))).status, 503);
    assert.equal((await send('/api/users/target/permissions', 'PUT', body([]))).status, 503);
    assert.equal((await send('/api/users/target/permissions/reset', 'POST', { contractVersion: 1, catalogVersion: 1, expectedVersion: version })).status, 503);
    assert.equal((await send('/api/users/target', 'PATCH', { name: 'Changed', contractVersion: 1, expectedVersion: version })).status, 503);
    const beforeInvalid = transactions;
    assert.equal((await send('/api/users', 'POST', { name: {}, email: 'bad', password: 42, role: 'DRIVER' })).status, 400);
    assert.equal(transactions, beforeInvalid, 'malformed create never enters a transaction');
    process.env.PERMISSION_MODE = 'V1';
    assert.equal((await send('/api/users/target/permissions', 'PUT', { permissions: [], expectedVersion: 'legacy' })).status, 400);
    currentRole = 'LOGISTICS';
    assert.equal((await send('/api/admin/roles/LOGISTICS/permissions')).status, 403);
    process.env.PERMISSION_MODE = 'typo';
    assert.throws(() => permissionMode(), status(503));
  } finally {
    if (previousMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = previousMode;
    prisma.user.findUnique = originalLookup; prisma.$transaction = originalTransaction;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
