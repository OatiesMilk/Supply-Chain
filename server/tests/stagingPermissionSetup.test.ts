import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { assertStagingPermissionTarget, runStagingPermissionSetup } from '../prisma/provision-staging-permissions';
import { PERMISSION_CATALOG, POLICY_ROLES } from '../src/services/permissionCatalog';

const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', APP_ENV: 'staging',
  DATABASE_URL: 'postgresql://staging.example/db_staging', STAGING_SEED_DATABASE: 'db_staging',
  STAGING_SEED_HOST: 'staging.example', STAGING_SEED_ADMIN_EMAIL: 'admin@example.com' };

function fakeDb() {
  const writes: string[] = [];
  const write = (name: string) => () => { writes.push(name); throw new Error('unexpected write'); };
  const admin = { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', isActive: true };
  const users = [
    { ...admin, permissions: [], driverProfile: null, permissionConversion: null },
    { id: 'tass-1', role: 'TASS', isActive: true, permissions: [], driverProfile: null, permissionConversion: null },
  ];
  const db = {
    $queryRaw: async () => [{ database: 'db_staging' }],
    $transaction: write('$transaction'), $executeRaw: write('$executeRaw'),
    user: { findUnique: async () => admin, findMany: async () => users },
    permissionDefinition: { findMany: async () => [], createMany: write('permissionDefinition.createMany') },
    rolePolicy: { findMany: async () => [], create: write('rolePolicy.create') },
  };
  return { db: db as unknown as PrismaClient, writes };
}

test('target guard reuses staging confirmation and requires explicit approval to apply', () => {
  assert.equal(assertStagingPermissionTarget(env).database, 'db_staging');
  for (const change of [{ APP_ENV: undefined }, { APP_ENV: 'production' }, { STAGING_SEED_HOST: 'other.example' },
    { STAGING_SEED_DATABASE: 'other_staging' }, { STAGING_SEED_ADMIN_EMAIL: undefined }]) {
    assert.throws(() => assertStagingPermissionTarget({ ...env, ...change }), JSON.stringify(change));
  }
  for (const STAGING_PERMISSIONS_APPROVED of [undefined, 'false', 'TRUE']) {
    assert.throws(() => assertStagingPermissionTarget({ ...env, STAGING_PERMISSIONS_APPROVED }, { apply: true }), /STAGING_PERMISSIONS_APPROVED/);
  }
  assert.doesNotThrow(() => assertStagingPermissionTarget({ ...env, STAGING_PERMISSIONS_APPROVED: 'true' }, { apply: true }));
});

test('preview reports the missing baseline without writing', async () => {
  const { db, writes } = fakeDb();
  const result = await runStagingPermissionSetup(db, {}, env);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.permissionDefinitionsToAdd, PERMISSION_CATALOG.length);
  assert.deepEqual(result.rolePoliciesToAdd, [...POLICY_ROLES]);
  assert.deepEqual(result.accountsToConvert.map(a => a.role), ['ADMIN', 'TASS']);
  assert.deepEqual(writes, []);
});

test('preview refuses a connection to a different database', async () => {
  const { db } = fakeDb();
  (db as unknown as { $queryRaw: () => Promise<unknown> }).$queryRaw = async () => [{ database: 'other' }];
  await assert.rejects(runStagingPermissionSetup(db, {}, env), /does not match confirmation/);
});

test('CLI with no confirmed target exits before opening a database', () => {
  const clean = { ...process.env };
  for (const key of ['APP_ENV', 'DATABASE_URL', 'STAGING_SEED_DATABASE', 'STAGING_SEED_HOST', 'STAGING_SEED_ADMIN_EMAIL']) delete clean[key];
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve(__dirname, '../prisma/provision-staging-permissions.ts')], { env: clean, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Staging seed refused/);
});
