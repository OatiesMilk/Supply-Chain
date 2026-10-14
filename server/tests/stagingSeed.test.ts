import { test } from 'node:test';
import assert from 'node:assert/strict';
import source from '../prisma/data/staging-route-source.json';
import { assertStagingSeedTarget } from '../prisma/staging-seed-safety';
import { runStagingSeed, stagingEntityId, stagingRecordData, validateStagingSource } from '../prisma/seed-staging';

const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', APP_ENV: 'staging',
  DATABASE_URL: 'postgresql://staging.example/db_staging', STAGING_SEED_DATABASE: 'db_staging',
  STAGING_SEED_HOST: 'staging.example', STAGING_SEED_DATA_APPROVED: 'true',
  STAGING_SEED_ADMIN_EMAIL: 'admin@example.com' };
const admin = { id: 'existing-admin', name: 'Existing Admin', email: 'admin@example.com', isActive: true, role: 'ADMIN' };

function fakeDb() {
  const extraModels = ['podAttachment', 'lineItem', 'remarkLog', 'comment', 'notification', 'notificationLog', 'dailyStatusSnapshot', 'inventoryTransaction', 'inventoryItem', 'product', 'customer', 'supplier'];
  const state = { companies: new Map<string, any>(), profiles: new Map<string, any>(), records: new Map<string, any>(), audits: new Map<string, any>(),
    users: new Map([[admin.id, admin]]), permissions: new Map([['grant', { id: 'grant', userId: admin.id, screen: 'admin', granted: true }]]),
    extra: Object.fromEntries(extraModels.map(name => [name, new Map<string, any>()])) };
  const calls = { reads: 0, writes: 0, locks: 0, transactions: 0 };
  let actor: any = admin;
  let auditFailureAt: number | null = null;
  let auditWrites = 0;
  let database = 'db_staging';
  const db = {
    $queryRaw: async () => { calls.reads++; return [{ database }]; },
    user: { findUnique: async () => { calls.reads++; return actor; }, count: async () => state.users.size },
    $transaction: async (work: any) => {
      calls.transactions++;
      const pending = { companies: new Map(state.companies), profiles: new Map(state.profiles), records: new Map(state.records), audits: new Map(state.audits),
        extra: Object.fromEntries(extraModels.map(name => [name, new Map(state.extra[name])])) };
      const matches = (row: any, where?: any) => !where || (where.userId === null ? row.userId == null : row.userId != null);
      const model = (rows: Map<string, any>, audit = false) => ({
        findUnique: async ({ where }: any) => { calls.reads++; return rows.get(where.id) ?? null; },
        count: async (args?: any) => { calls.reads++; return [...rows.values()].filter(row => matches(row, args?.where)).length; },
        deleteMany: async (args?: any) => {
          calls.writes++;
          let count = 0;
          for (const [id, row] of rows) if (matches(row, args?.where)) { rows.delete(id); count++; }
          return { count };
        },
        create: async ({ data }: any) => {
          calls.writes++;
          if (audit && auditFailureAt !== null && auditWrites++ >= auditFailureAt) throw new Error('Injected audit failure');
          assert.equal(rows.has(data.id), false);
          rows.set(data.id, { ...data });
          return rows.get(data.id);
        },
      });
      const result = await work({
        $executeRaw: async () => { calls.locks++; },
        user: db.user, userPermission: { count: async () => state.permissions.size },
        ...Object.fromEntries(extraModels.map(name => [name, model(pending.extra[name])])),
        company: model(pending.companies), driver: model(pending.profiles),
        deliveryRecord: model(pending.records), auditLog: model(pending.audits, true),
      });
      Object.assign(state, pending);
      return result;
    },
  };
  return { db: db as any, state, calls, setActor: (value: any) => { actor = value; },
    failAudit: (after = 0) => { auditFailureAt = after; auditWrites = 0; }, setDatabase: (value: string) => { database = value; } };
}

test('staging guard allows deployed production mode but requires exact explicit staging confirmation', () => {
  assert.deepEqual(assertStagingSeedTarget({ ...env, RENDER: 'true' }), { database: 'db_staging', adminEmail: 'admin@example.com' });
  for (const denied of [
    { ...env, APP_ENV: undefined }, { ...env, APP_ENV: 'production' },
    { ...env, STAGING_SEED_DATABASE: undefined }, { ...env, STAGING_SEED_DATABASE: 'other_staging' },
    { ...env, DATABASE_URL: 'postgresql://host/production' },
    { ...env, DATABASE_URL: 'mysql://host/db_staging' },
    { ...env, DATABASE_URL: 'invalid' }, { ...env, DATABASE_URL: 'postgresql://host/%ZZ_staging' },
    { ...env, STAGING_SEED_ADMIN_EMAIL: undefined },
    { ...env, STAGING_SEED_HOST: undefined }, { ...env, STAGING_SEED_HOST: 'other.example' },
  ]) assert.throws(() => assertStagingSeedTarget(denied), /Staging seed refused/);
});

test('reset requires a separate acknowledgement before any database access and preview proposes replacement without writes', async () => {
  const fake = fakeDb();
  for (const STAGING_SEED_ALLOW_RESET of [undefined, 'false', 'TRUE']) {
    await assert.rejects(runStagingSeed(fake.db, source, { reset: true, apply: true }, { ...env, STAGING_SEED_ALLOW_RESET }), /STAGING_SEED_ALLOW_RESET/);
  }
  assert.equal(fake.calls.reads, 0); assert.equal(fake.calls.transactions, 0);
  await runStagingSeed(fake.db, source, { apply: true }, env);
  fake.state.records.set('demo', { id: 'demo', remarks: 'old demo seed' });
  fake.state.profiles.set('linked', { id: 'linked', userId: admin.id, name: 'Login profile', type: 'DRIVER' });
  fake.state.extra.product.set('demo-sku', { id: 'demo-sku' });
  const writes = fake.calls.writes, locks = fake.calls.locks;
  const plan = await runStagingSeed(fake.db, source, { reset: true }, { ...env, STAGING_SEED_DATA_APPROVED: undefined });
  assert.equal(plan.operation, 'reset-and-reseed');
  assert.equal(plan.reset!.deletions.records, 33); assert.equal(plan.reset!.deletions.products, 1);
  assert.equal(plan.reset!.deletions.unlinkedProfiles, 6);
  assert.deepEqual(plan.reset!.preserved, { users: 1, permissions: 1, linkedDriverProfiles: 1, audits: 59 });
  assert.deepEqual(plan.records, { create: 32, skip: 0 });
  assert.deepEqual(plan.companies, { create: 21, skip: 0 });
  assert.deepEqual(plan.profiles, { create: 6, skip: 0 });
  assert.equal(fake.calls.writes, writes); assert.equal(fake.calls.locks, locks);
  assert.equal(fake.state.records.size, 33);
});

test('staging reset replaces operational seeds while preserving accounts, permissions, linked profiles and prior audits', async () => {
  const fake = fakeDb();
  await runStagingSeed(fake.db, source, { apply: true }, env);
  const sourceRecord = fake.state.records.values().next().value;
  sourceRecord.remarks = 'edited seed to replace';
  fake.state.records.set('demo', { id: 'demo', remarks: 'old demo' });
  fake.state.companies.set('demo-company', { id: 'demo-company' });
  fake.state.profiles.set('linked', { id: 'linked', userId: admin.id, name: 'Login profile', type: 'DRIVER' });
  fake.state.profiles.set('demo-driver', { id: 'demo-driver', userId: null, name: 'Demo profile' });
  fake.state.audits.set('historic', { id: 'historic', recordId: 'demo', action: 'CREATE' });
  for (const rows of Object.values(fake.state.extra)) rows.set('demo', { id: 'demo' });
  const users = structuredClone([...fake.state.users.values()]);
  const permissions = structuredClone([...fake.state.permissions.values()]);
  const audits = structuredClone([...fake.state.audits.values()]);
  const result = await runStagingSeed(fake.db, source, { reset: true, apply: true }, { ...env, STAGING_SEED_ALLOW_RESET: 'true' });
  assert.equal(result.reset!.deletions.records, 33);
  assert.equal(result.reset!.deletions.unlinkedProfiles, 7);
  assert.equal(fake.state.records.size, 32); assert.equal(fake.state.companies.size, 21);
  assert.equal(fake.state.profiles.size, 7); assert.equal(fake.state.profiles.get('linked').userId, admin.id);
  assert.equal(fake.state.records.has('demo'), false); assert.equal(fake.state.profiles.has('demo-driver'), false);
  assert.notEqual(fake.state.records.get(sourceRecord.id).remarks, 'edited seed to replace');
  assert.deepEqual([...fake.state.users.values()], users); assert.deepEqual([...fake.state.permissions.values()], permissions);
  for (const audit of audits) assert.deepEqual(fake.state.audits.get(audit.id), audit);
  for (const rows of Object.values(fake.state.extra)) assert.equal(rows.size, 0);
  const resetAudit = [...fake.state.audits.values()].find(row => row.action === 'RESET');
  assert.equal(resetAudit.changedById, admin.id);
  assert.equal(JSON.parse(resetAudit.previousValue).deletions.records, 33);
  assert.equal(JSON.parse(resetAudit.newValue).externalStorageDeleted, false);
  assert.doesNotMatch(resetAudit.previousValue + resetAudit.newValue, /old demo|edited seed/);
  const again = await runStagingSeed(fake.db, source, { reset: true, apply: true }, { ...env, STAGING_SEED_ALLOW_RESET: 'true' });
  assert.equal(again.records.create, 32);
  const writes = fake.calls.writes;
  const additive = await runStagingSeed(fake.db, source, { apply: true }, env);
  assert.deepEqual(additive.records, { create: 0, skip: 32 });
  assert.equal(fake.calls.writes, writes);
});

test('failed staging reset rolls deletions and replacement inserts back together', async () => {
  const fake = fakeDb();
  fake.state.records.set('demo', { id: 'demo', remarks: 'retain on failure' });
  fake.state.companies.set('company', { id: 'company' });
  fake.state.profiles.set('demo-driver', { id: 'demo-driver', userId: null });
  fake.state.extra.podAttachment.set('pod', { id: 'pod' });
  // Fail on the final RESET audit, after all 59 replacement entities and their
  // CREATE audits have been staged, to exercise complete transaction rollback.
  fake.failAudit(59);
  await assert.rejects(runStagingSeed(fake.db, source, { reset: true, apply: true }, { ...env, STAGING_SEED_ALLOW_RESET: 'true' }), /Injected audit failure/);
  assert.equal(fake.state.records.get('demo').remarks, 'retain on failure');
  assert.equal(fake.state.companies.has('company'), true); assert.equal(fake.state.profiles.has('demo-driver'), true);
  assert.equal(fake.state.extra.podAttachment.has('pod'), true); assert.equal(fake.state.audits.size, 0);
  assert.ok(fake.calls.writes > 100);
});

test('target guard failure occurs before any database access; dry-run performs no writes', async () => {
  const fake = fakeDb();
  await assert.rejects(runStagingSeed(fake.db, source, { apply: true }, { ...env, APP_ENV: 'production' }), /Staging seed refused/);
  assert.equal(fake.calls.reads, 0);
  assert.equal(fake.calls.transactions, 0);
  for (const STAGING_SEED_DATA_APPROVED of [undefined, 'false', 'TRUE']) {
    await assert.rejects(runStagingSeed(fake.db, source, { apply: true }, { ...env, STAGING_SEED_DATA_APPROVED }), /data-owner approval/);
  }
  await assert.rejects(runStagingSeed(fake.db, source, { apply: true }, { ...env, STAGING_SEED_HOST: 'other.example' }), /exact database hostname/);
  // The inspected Supabase model uses the database name postgres. Relabelling
  // APP_ENV and confirming that host/name must not make this target eligible.
  await assert.rejects(runStagingSeed(fake.db, source, { apply: true }, {
    ...env, DATABASE_URL: 'postgresql://db.reviewed-project.supabase.co:5432/postgres',
    STAGING_SEED_HOST: 'db.reviewed-project.supabase.co', STAGING_SEED_DATABASE: 'postgres',
  }), /PostgreSQL \*_staging database/);
  assert.equal(fake.calls.reads, 0);
  assert.equal(fake.calls.transactions, 0);
  const plan = await runStagingSeed(fake.db, source, {}, { ...env, STAGING_SEED_DATA_APPROVED: undefined });
  assert.equal(plan.mode, 'dry-run');
  assert.deepEqual(plan.records, { create: 32, skip: 0 });
  assert.deepEqual(plan.companies, { create: 21, skip: 0 });
  assert.deepEqual(plan.profiles, { create: 6, skip: 0 });
  assert.equal(fake.calls.writes, 0);
  assert.equal(fake.calls.locks, 0);
  assert.equal(fake.state.records.size, 0);
});

test('missing/inactive/non-Admin actor and wrong connected database cannot seed', async () => {
  for (const actor of [null, { ...admin, isActive: false }, { ...admin, role: 'LOGISTICS' }]) {
    const fake = fakeDb(); fake.setActor(actor);
    await assert.rejects(runStagingSeed(fake.db, source, { apply: true }, env), /existing active Admin/);
    assert.equal(fake.calls.writes, 0);
  }
  const fake = fakeDb(); fake.setDatabase('production');
  await assert.rejects(runStagingSeed(fake.db, source, { apply: true }, env), /connected database/);
  assert.equal(fake.calls.transactions, 0);
});

test('source identities preserve all 32 real rows and duplicate SO numbers without inventing deliveries', () => {
  const validated = validateStagingSource(source);
  const rows = validated.rows.map(row => stagingRecordData(validated, row, admin.id));
  assert.equal(rows.length, 32);
  assert.equal(new Set(rows.map(row => row.id)).size, 32);
  const duplicate = rows.filter(row => row.reference === '11000583');
  assert.equal(duplicate.length, 2);
  assert.notEqual(duplicate[0].id, duplicate[1].id);
  for (const row of rows) {
    assert.equal(row.deliveryDate, '2026-06-16');
    assert.equal(row.draft, true);
    assert.equal(row.status, 'PENDING');
    assert.equal(row.priority, '1 - Low');
    assert.equal(row.category, 'DELIVERY');
    assert.equal(row.accountManager, '');
    assert.equal(row.timeIn, null);
    assert.match(row.remarks, /Staging Excel source/);
  }
  for (const row of rows.filter(row => row.remarks.includes('Source owner:'))) {
    assert.equal(row.driverId, null);
    assert.equal(row.driver, '');
    assert.match(row.remarks, /Kimberly/);
  }
  assert.equal(rows.filter(row => row.driverId === null).length, 6);
  assert.throws(() => validateStagingSource({ ...source, rows: [source.rows[0], source.rows[0]] }), /duplicate worksheet-row/);
});

test('apply is atomic, audited, leaves profiles unlinked, and rerun preserves edits', async () => {
  const fake = fakeDb();
  const first = await runStagingSeed(fake.db, source, { apply: true }, env);
  assert.equal(first.records.create, 32);
  assert.equal(fake.state.audits.size, 59);
  assert.deepEqual([...fake.state.profiles.values()].map(p => p.name).sort(), ['Albert', 'Francis', 'Jayson', 'Joel', 'Karl', 'Noli']);
  for (const profile of fake.state.profiles.values()) {
    assert.equal(profile.userId, null); assert.equal(profile.isActive, false);
  }
  for (const company of fake.state.companies.values()) {
    assert.equal(company.sapNumber, ''); assert.equal(company.contactPerson, '');
  }
  const firstRow = fake.state.records.values().next().value;
  firstRow.remarks = 'Admin edited this record';
  const writes = fake.calls.writes;
  const second = await runStagingSeed(fake.db, source, { apply: true }, env);
  assert.deepEqual(second.records, { create: 0, skip: 32 });
  assert.deepEqual(second.companies, { create: 0, skip: 21 });
  assert.deepEqual(second.profiles, { create: 0, skip: 6 });
  assert.equal(fake.calls.writes, writes);
  assert.equal(fake.state.records.get(firstRow.id).remarks, 'Admin edited this record');
});

test('identity/content collisions abort rather than overwrite, and audit failure rolls everything back', async () => {
  const collision = fakeDb();
  const row = source.rows[0];
  const id = stagingEntityId(source.source.sha256, 'DeliveryRecord', JSON.stringify([row.sheet, row.row]));
  collision.state.records.set(id, { id, remarks: 'Existing unrelated record' });
  await assert.rejects(runStagingSeed(collision.db, source, { apply: true }, env), /identity\/content collision/);
  assert.equal(collision.state.companies.size, 0);
  assert.equal(collision.state.records.get(id).remarks, 'Existing unrelated record');

  const editedSource = fakeDb();
  await runStagingSeed(editedSource.db, source, { apply: true }, env);
  const changed = structuredClone(source); changed.rows[0].remarks = 'changed source under same workbook identity';
  await assert.rejects(runStagingSeed(editedSource.db, changed, { apply: true }, env), /identity\/content collision/);
  assert.equal(editedSource.state.records.size, 32);

  const failure = fakeDb(); failure.failAudit();
  await assert.rejects(runStagingSeed(failure.db, source, { apply: true }, env), /Injected audit failure/);
  assert.equal(failure.state.companies.size, 0); assert.equal(failure.state.profiles.size, 0);
  assert.equal(failure.state.records.size, 0); assert.equal(failure.state.audits.size, 0);
});
