import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { assertStagingMasterDataTarget, MASTER_COMPANIES, MASTER_PROFILES, runStagingMasterDataSeed } from '../prisma/seed-staging-master-data';

const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', APP_ENV: 'staging',
  DATABASE_URL: 'postgresql://staging.example/db_staging', STAGING_SEED_DATABASE: 'db_staging',
  STAGING_SEED_HOST: 'staging.example', STAGING_SEED_ADMIN_EMAIL: 'admin@example.com' };

function fakeDb(state: { companies?: Array<{ id: string; name: string }>; drivers?: Array<{ id: string; name: string }> } = {}) {
  const companies = [...(state.companies ?? [])];
  const drivers = [...(state.drivers ?? [])];
  const audits: unknown[] = [];
  const admin = { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', isActive: true };
  const pick = (rows: Array<{ id: string; name: string }>) => async (args?: { where?: { id?: { in: string[] } } }) =>
    rows.filter(r => !args?.where?.id || args.where.id.in.includes(r.id));
  const tx = {
    $executeRaw: async () => 0,
    user: { findUnique: async () => admin },
    company: { findMany: pick(companies), create: async ({ data }: { data: { id: string; name: string } }) => { companies.push(data); return data; } },
    driver: { findMany: pick(drivers), create: async ({ data }: { data: { id: string; name: string } }) => { drivers.push(data); return data; } },
    auditLog: { create: async ({ data }: { data: unknown }) => { audits.push(data); return data; } },
  };
  const db = { $queryRaw: async () => [{ database: 'db_staging' }], $transaction: async (work: (t: typeof tx) => unknown) => work(tx) };
  return { db: db as unknown as PrismaClient, companies, drivers, audits };
}

test('apply requires explicit approval and the confirmed staging target', () => {
  assert.throws(() => assertStagingMasterDataTarget({ ...env, APP_ENV: 'production' }));
  for (const STAGING_MASTER_DATA_APPROVED of [undefined, 'false', 'TRUE']) {
    assert.throws(() => assertStagingMasterDataTarget({ ...env, STAGING_MASTER_DATA_APPROVED }, { apply: true }), /STAGING_MASTER_DATA_APPROVED/);
  }
});

test('preview writes nothing', async () => {
  const fake = fakeDb();
  const result = await runStagingMasterDataSeed(fake.db, {}, env);
  assert.equal(result.companies.create.length, MASTER_COMPANIES.length);
  assert.equal(result.profiles.create.length, MASTER_PROFILES.length);
  assert.equal(fake.companies.length + fake.drivers.length + fake.audits.length, 0);
});

test('apply adds each row once with an audit entry, skips hand-made name clashes and is safe to rerun', async () => {
  const fake = fakeDb({ companies: [{ id: 'manual-1', name: 'Puregold Price Club Inc.' }], drivers: [{ id: 'manual-2', name: 'Manny Santos' }] });
  const approved = { ...env, STAGING_MASTER_DATA_APPROVED: 'true' };
  const first = await runStagingMasterDataSeed(fake.db, { apply: true }, approved);
  assert.equal(first.companies.skip, 1);
  assert.equal(first.profiles.skip, 1);
  assert.equal(fake.companies.length, MASTER_COMPANIES.length);
  assert.equal(fake.drivers.length, MASTER_PROFILES.length);
  assert.equal(fake.audits.length, MASTER_COMPANIES.length + MASTER_PROFILES.length - 2);
  const again = await runStagingMasterDataSeed(fake.db, { apply: true }, approved);
  assert.deepEqual([again.companies.create.length, again.profiles.create.length], [0, 0]);
  assert.equal(fake.companies.length, MASTER_COMPANIES.length);
});
