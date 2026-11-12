import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { AuthUser } from '../src/middleware/auth';
import { localPermissionProvisioningTarget } from '../src/services/localPermissionProvisioning';
import { assertPermissionBackfillTarget, planPermissionConversion } from '../src/services/permissionBackfill';
import { defaultRolePermissions } from '../src/services/permissionCatalog';
import { evaluatePermissions } from '../src/services/permissionEvaluator';
import { sessionUser } from '../src/services/permissions';
import { canCreateCategory } from '../src/services/recordAccess';

const target = {
  NODE_ENV: 'development', DATABASE_URL: 'postgresql://operator@127.0.0.1:5433/mg_portal?schema=public',
  PERMISSION_PROVISION_DATABASE: 'mg_portal', PERMISSION_PROVISION_ACTOR_ID: 'local-admin',
};

test('existing development database requires explicit target and actor without relaxing disposable backfill', () => {
  assert.deepEqual(localPermissionProvisioningTarget(target), { connectionString: target.DATABASE_URL, actorId: 'local-admin' });
  assert.throws(() => assertPermissionBackfillTarget({ ...target, PERMISSION_BACKFILL_DATABASE: 'mg_portal' }));
  for (const change of [
    { DATABASE_URL: '' }, { PERMISSION_PROVISION_DATABASE: '' }, { PERMISSION_PROVISION_DATABASE: 'other' },
    { PERMISSION_PROVISION_ACTOR_ID: ' ' }, { NODE_ENV: '' }, { NODE_ENV: 'production' }, { NODE_ENV: 'test' },
    { APP_ENV: 'staging' }, { APP_ENV: 'production' },
    ...['CI', 'RENDER', 'RENDER_SERVICE_ID', 'RAILWAY_ENVIRONMENT', 'VERCEL', 'FLY_APP_NAME', 'K_SERVICE', 'HEROKU_APP_NAME'].map(key => ({ [key]: 'true' })),
    { DATABASE_URL: 'postgresql://operator@prod.example.com/mg_portal' },
    { DATABASE_URL: 'postgresql://operator@127.0.0.1/mg_portal#other' },
    { DATABASE_URL: 'postgresql://operator@127.0.0.1/mg_portal%2Fother' },
    ...['host', 'hostaddr', 'user', 'username', 'database', 'dbname', 'db', 'port', 'options', 'schema'].map(key => ({ DATABASE_URL: `postgresql://operator@127.0.0.1/mg_portal?${key}=unexpected` })),
  ]) assert.throws(() => localPermissionProvisioningTarget({ ...target, ...change }), JSON.stringify(change));
});

test('CLI with no explicit target exits before opening a database and does not load .env', () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.PERMISSION_PROVISION_DATABASE;
  delete env.PERMISSION_PROVISION_ACTOR_ID;
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve(__dirname, '../prisma/provision-local-permissions.ts')], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Local permission provisioning stopped/);
  assert.doesNotMatch(result.stderr, /postgresql?:\/\//);
});

test('provisioned baseline restores TASS RMA creation while converted explicit Deny remains denied', () => {
  for (const denied of [false, true]) {
    const account = { id: 'tass', name: 'TASS', email: 'tass@example.test', role: 'TASS', authorizationRevision: 1n,
      permissions: denied ? [{ id: 'rma-denial', screen: 'rma', granted: false }] : [],
    };
    const user = sessionUser(account) as AuthUser;
    user.rmaPermissions = evaluatePermissions({ ...account, userId: account.id, isActive: true, rolePolicy: null, overrides: [] });
    assert.equal(canCreateCategory(user, 'RMA'), false, 'missing foundation must still fail closed');
    const plan = planPermissionConversion(account);
    const rolePolicy = { role: 'TASS', revision: 1n, catalogVersion: 1,
      permissions: [...defaultRolePermissions('TASS')].map(([permissionKey, effect]) => ({ permissionKey, effect })),
    };
    user.rmaPermissions = evaluatePermissions({ ...account, userId: account.id, isActive: true, rolePolicy, overrides: plan.overrides });
    assert.equal(user.rmaPermissions.valid, true);
    assert.equal(canCreateCategory(user, 'RMA'), !denied);
    assert.deepEqual(planPermissionConversion(account), plan, 'conversion plan is stable on rerun');
    if (denied) assert.equal(plan.overrides.find(row => row.permissionKey === 'CATEGORY:RMA:CREATE')?.effect, 'DENY');
  }
});
