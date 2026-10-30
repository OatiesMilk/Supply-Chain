import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import express from 'express';
import { api, ApiError } from '../src/api';
import { useAuthStore } from '../src/store/authStore';
import { useUIStore } from '../src/store/uiStore';
import { completePermissionSession, permissionsFor } from '../src/utils/permissions';
import { ClientPermissionError } from '../src/api/permissionRuntime';
import { assertPermissionBackfillTarget } from '../../server/src/services/permissionBackfill';

const target = process.env.PERMISSION_WORKFLOW_DATABASE_URL;

/** Actual HTTP routes, cookies, PostgreSQL saves and browser API/store together.
 * This optional test never connects to the application's DATABASE_URL fallback. */
test('integrated V1 policy saves, client refresh and same-cookie enforcement on isolated PostgreSQL', { skip: !target, timeout: 90000 }, async t => {
  const database = new URL(target!).pathname.slice(1);
  assertPermissionBackfillTarget({ DATABASE_URL: target!, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: database });
  const old = { url: process.env.DATABASE_URL, mode: process.env.PERMISSION_MODE };
  process.env.DATABASE_URL = target;
  process.env.PERMISSION_MODE = 'LEGACY';
  // Import only after the disposable target has passed the backfill guard.
  const { prisma } = await import('../../server/src/db');
  const cookieParser = createRequire(new URL('../../server/package.json', import.meta.url))('cookie-parser');
  const { signToken } = await import('../../server/src/middleware/auth');
  const { verifyRequestOrigin, verifyCsrfToken } = await import('../../server/src/middleware/csrf');
  const { default: authRoutes } = await import('../../server/src/routes/auth');
  const { default: adminRoutes } = await import('../../server/src/routes/admin');
  const { default: usersRoutes } = await import('../../server/src/routes/users');
  const { default: customersRoutes } = await import('../../server/src/routes/customers');
  const { initializePermissionFoundation, convertPermissionAccount } = await import('../../server/src/services/permissionBackfill');
  const prefix = `gh250-${randomUUID()}`;
  const ids = [`${prefix}-admin`, `${prefix}-admin2`, `${prefix}-logistics`];
  const [admin, admin2, logistics] = ids;
  const cookies = Object.fromEntries(ids.map(id => [id, `mg_session=${signToken({ id, name: id, email: `${id}@example.test`, role: id === logistics ? 'LOGISTICS' : 'ADMIN' })}`]));
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api', verifyRequestOrigin(), verifyCsrfToken);
  app.use('/api/auth', authRoutes); app.use('/api/admin', adminRoutes);
  app.use('/api/users', usersRoutes); app.use('/api/customers', customersRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const csrf = new Map<string, string>();
  let actor = admin;
  let networkCount = 0;
  const send = async (id: string, path: string, method = 'GET', body?: unknown) => {
    const response = await nativeFetch(`${origin}/api${path}`, { method, headers: {
      Cookie: cookies[id], 'Content-Type': 'application/json', ...(csrf.get(id) ? { 'X-CSRF-Token': csrf.get(id)! } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const token = response.headers.get('X-CSRF-Token'); if (token) csrf.set(id, token);
    return response;
  };
  const bridge = mock.method(globalThis, 'fetch', async (url, options: RequestInit = {}) => {
    networkCount++;
    const headers = new Headers(options.headers); headers.set('Cookie', cookies[actor]);
    return nativeFetch(`${origin}${url}`, { ...options, headers });
  });
  const install = async (id: string, screen: string) => {
    actor = id;
    const session = await api.me();
    assert.equal(completePermissionSession(session), true);
    useAuthStore.getState().setAuthUser(session);
    useUIStore.setState({ currentScreen: screen });
    return session;
  };
  let baseline: Awaited<ReturnType<typeof api.getRolePermissionEditor>> | undefined;
  try {
    for (const id of ids) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test`, password: 'unused-synthetic', role: id === logistics ? 'LOGISTICS' : 'ADMIN' } });
    await initializePermissionFoundation(prisma, admin);
    for (const id of ids) await convertPermissionAccount(prisma, id, admin);
    process.env.PERMISSION_MODE = 'V1';
    await install(admin, 'admin');
    baseline = await api.getRolePermissionEditor('LOGISTICS');
    const writes = ['RESOURCE:customers:WRITE', 'RESOURCE:customers:CREATE', 'RESOURCE:customers:UPDATE'];
    const payload = (version: string, permissions: any[]) => ({ contractVersion: 1 as const, catalogVersion: 1 as const, expectedVersion: version, permissions });

    await t.test('role defaults reach the actual browser contract and revoke direct writes using the same cookie', async () => {
      const before = await install(logistics, 'customers');
      assert.equal(permissionsFor(before).can('RESOURCE', 'customers', 'CREATE'), true);
      await install(admin, 'admin');
      await api.saveRolePermissionEditor('LOGISTICS', payload(baseline!.expectedVersion, baseline!.permissions.map(row => writes.includes(row.permissionKey) ? { ...row, effect: 'DENY' } : row)));
      await install(logistics, 'customers');
      const current = useAuthStore.getState().authUser!;
      assert.notEqual(current.permissionVersion, before.permissionVersion);
      assert.equal(permissionsFor(current).can('RESOURCE', 'customers', 'READ'), true);
      const count = networkCount;
      await assert.rejects(api.createCustomer({ name: prefix }), ClientPermissionError);
      assert.equal(networkCount, count, 'browser blocks before fetch');
      await send(logistics, '/auth/me');
      const denied = await send(logistics, '/customers', 'POST', { name: prefix });
      assert.equal(denied.status, 403, 'direct HTTP bypassing the UI also denies with the original cookie');
      assert.equal(await prisma.customer.count({ where: { name: prefix } }), 0);
    });

    await t.test('explicit user Allow survives equal defaults, Deny wins, reset restores inheritance and refresh closes stale workspaces', async () => {
      await install(admin, 'admin');
      const role = await api.getRolePermissionEditor('LOGISTICS');
      await api.saveRolePermissionEditor('LOGISTICS', payload(role.expectedVersion, baseline!.permissions));
      let editor = await api.getUserPermissionEditor(logistics);
      const explicit = [{ permissionKey: 'SCREEN:main:READ', effect: 'ALLOW' as const }, ...writes.map(permissionKey => ({ permissionKey, effect: 'DENY' as const }))];
      editor = await api.saveUserPermissionEditor(logistics, payload(editor.expectedVersion, explicit));
      assert.deepEqual(editor.permissions.map(row => `${row.permissionKey}:${row.effect}`).sort(), explicit.map(row => `${row.permissionKey}:${row.effect}`).sort());
      await install(logistics, 'customers');
      assert.equal(permissionsFor(useAuthStore.getState().authUser).can('RESOURCE', 'customers', 'CREATE'), false);
      await install(admin, 'admin');
      const reset = await api.resetUserPermissionEditor(logistics, editor.expectedVersion);
      assert.deepEqual(reset.permissions, []);
      await install(logistics, 'customers');
      assert.equal(permissionsFor(useAuthStore.getState().authUser).can('RESOURCE', 'customers', 'CREATE'), true);
      useUIStore.setState({ selectedRecordId: 'stale-record', searchOpen: true });
      await install(admin, 'admin');
      await api.saveUserPermissionEditor(logistics, payload(reset.expectedVersion, explicit));
      await install(logistics, 'customers');
      useUIStore.setState({ selectedRecordId: 'stale-record', searchOpen: true });
      // A further committed revision is observed through the real refresh API.
      await prisma.user.update({ where: { id: logistics }, data: { authorizationRevision: { increment: 1 } } });
      await useAuthStore.getState().refreshPermissions();
      assert.equal(useUIStore.getState().selectedRecordId, null);
      assert.equal(useUIStore.getState().searchOpen, false);
    });

    await t.test('two administrators receive one complete committed winner and a 409 stale editor with safe audit evidence', async () => {
      await install(admin, 'admin');
      const editor = await api.getUserPermissionEditor(logistics);
      await send(admin, '/auth/me'); await send(admin2, '/auth/me');
      const alternatives = [[], [{ permissionKey: 'SCREEN:main:READ', effect: 'DENY' }, { permissionKey: 'SCREEN:main:WRITE', effect: 'DENY' }]];
      const responses = await Promise.all([admin, admin2].map((id, index) => send(id, `/users/${logistics}/permissions`, 'PUT', payload(editor.expectedVersion, alternatives[index]))));
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      const winner = responses.findIndex(r => r.status === 200);
      const latest = await api.getUserPermissionEditor(logistics);
      assert.deepEqual(latest.permissions.map(row => `${row.permissionKey}:${row.effect}`).sort(), alternatives[winner].map(row => `${row.permissionKey}:${row.effect}`).sort());
      const audit = await api.getAuditLog({ userId: winner === 0 ? admin : admin2 });
      const entry = audit.entries.find(row => row.record_id === logistics && row.record_type === 'UserPermissionOverride');
      assert.ok(entry?.previous && entry?.next);
      assert.doesNotMatch(JSON.stringify(entry), /unused-synthetic|password|mg_session/);
      await assert.rejects(api.saveUserPermissionEditor(logistics, payload(editor.expectedVersion, [])), (error: unknown) => error instanceof ApiError && error.status === 409);
    });

    await t.test('protected Admin and Write-without-Read reject atomically; deactivation invalidates the original cookie', async () => {
      await install(admin, 'admin');
      const adminEditor = await api.getUserPermissionEditor(admin2);
      await assert.rejects(api.saveUserPermissionEditor(admin2, payload(adminEditor.expectedVersion, [{ permissionKey: 'SCREEN:admin:READ', effect: 'DENY' }])), (e: unknown) => e instanceof ApiError && e.status === 400);
      const current = await api.getUserPermissionEditor(logistics);
      await assert.rejects(api.saveUserPermissionEditor(logistics, payload(current.expectedVersion, [{ permissionKey: 'RESOURCE:customers:READ', effect: 'DENY' }])), (e: unknown) => e instanceof ApiError && e.status === 400);
      assert.equal((await api.getUserPermissionEditor(logistics)).expectedVersion, current.expectedVersion);
      await api.deactivateUser(logistics, { contractVersion: 1, expectedVersion: current.expectedVersion });
      assert.equal((await send(logistics, '/auth/me')).status, 401);
    });
  } finally {
    bridge.mock.restore(); useAuthStore.getState().setAuthUser(null);
    if (baseline) {
      // Restore shared defaults before deleting only UUID-owned synthetic rows.
      const { getRolePermissionEditor, saveRolePermissions } = await import('../../server/src/services/permissionManagement');
      await prisma.userPermissionOverride.deleteMany({ where: { userId: { in: ids } } });
      const role = await getRolePermissionEditor(prisma, admin, 'LOGISTICS');
      await saveRolePermissions(prisma, admin, 'LOGISTICS', { contractVersion: 1, catalogVersion: 1, expectedVersion: role.expectedVersion, permissions: baseline.permissions });
    }
    await prisma.auditLog.deleteMany({ where: { changedById: { in: ids } } });
    await prisma.permissionQuarantine.deleteMany({ where: { userId: { in: ids } } });
    await prisma.permissionConversion.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userPermissionOverride.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
    if (old.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old.url;
    if (old.mode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = old.mode;
  }
});
