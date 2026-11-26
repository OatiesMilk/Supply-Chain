import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertStagingRmaDemoTarget, runStagingRmaDemoSeed, TARGET_OVERRIDE_QUERY_PARAMS } from '../prisma/seed-staging-rma-demo';
import { driverDemoRecordId } from '../prisma/seed-driver-demo';
import { StagingSeedError } from '../prisma/staging-seed-safety';
import { manilaToday } from '../src/services/deliveryLifecycle';
import { manilaDateToMmddyy } from '../src/services/rmaReference';

// In-memory transactional database double (no PostgreSQL). Real PostgreSQL
// coverage lives in stagingRmaDemoSeed.postgres.test.ts.

const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', APP_ENV: 'staging',
  DATABASE_URL: 'postgresql://staging.example/db_staging', STAGING_SEED_DATABASE: 'db_staging',
  STAGING_SEED_HOST: 'staging.example', STAGING_SEED_ADMIN_EMAIL: 'admin@example.com' };
const applyEnv = { ...env, STAGING_RMA_DEMO_APPROVED: 'true', STAGING_RMA_DEMO_ALLOW_RESET: 'true' };
const NOW = new Date();
const TODAY = manilaToday(NOW);
const created = new Date('2026-01-01T00:00:00Z');

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

function matches(row: Row, where?: Row): boolean {
  if (!where) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'OR') { if (!(condition as Row[]).some(w => matches(row, w))) return false; continue; }
    if (key === 'AND') { if (!(condition as Row[]).every(w => matches(row, w))) return false; continue; }
    if (key === 'NOT') { if (matches(row, condition)) return false; continue; }
    const value = row[key] ?? null;
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition && !condition.in.includes(value)) return false;
      if ('notIn' in condition && condition.notIn.includes(value)) return false;
      if ('not' in condition && (condition.not === null ? value === null : value === condition.not)) return false;
    } else if (value !== condition) return false;
  }
  return true;
}
function sorted(rows: Row[], orderBy?: Row | Row[]) {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).map(o => Object.entries(o)[0] as [string, string]);
  return [...rows].sort((a, b) => {
    for (const [key, dir] of keys) {
      const x = a[key] instanceof Date ? a[key].getTime() : a[key], y = b[key] instanceof Date ? b[key].getTime() : b[key];
      if (x < y) return dir === 'asc' ? -1 : 1;
      if (x > y) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
}
const pick = (row: Row | undefined, select?: Row) => !row ? null : select ? Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) : row;

function baseTables(): Tables {
  const rec = (id: string, category: string, extra: Row = {}) => ({ id, category, status: 'SCHEDULED', draft: false, linkedCollectionId: null, ...extra });
  return {
    users: [
      { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', isActive: true, name: 'Staging Admin', createdAt: created },
      { id: 'tass-1', email: 'tass.lead@example.com', role: 'TASS', isActive: true, name: 'TASS Lead', createdAt: created },
      { id: 'tass-0', email: 'old.tass@example.com', role: 'TASS', isActive: false, name: 'Old TASS', createdAt: new Date('2025-01-01T00:00:00Z') },
      { id: 'log-1', email: 'logistics@example.com', role: 'LOGISTICS', isActive: true, name: 'Logistics', createdAt: created },
      { id: 'drv-user', email: 'driver@example.com', role: 'DRIVER', isActive: true, name: 'Manny Santos', createdAt: created },
    ],
    permissions: [{ id: 'perm-1', userId: 'tass-1', screen: 'rma', granted: true }],
    drivers: [
      { id: 'drv-manny', name: 'manny santos', type: 'DRIVER', isActive: true, userId: 'drv-user', coverageAreas: '[]' },
      { id: 'drv-kuya', name: 'Kuya Benjie', type: 'DRIVER', isActive: true, userId: null, coverageAreas: '[]' },
      { id: 'drv-off', name: 'Lando Navarro', type: 'DRIVER', isActive: false, userId: null, coverageAreas: '[]' },
      { id: 'helper-1', name: 'Ricky Mendoza', type: 'ASSISTANT', isActive: true, userId: null, coverageAreas: '[]' },
    ],
    companies: [
      { id: 'co-jollibee', name: 'Jollibee Foods Corp. - Quezon City Cluster', normalizedName: 'jollibee foods corp. - quezon city cluster', isActive: true, createdAt: created },
      { id: 'co-first', name: 'Excel Route Client', normalizedName: 'excel route client', isActive: true, createdAt: new Date('2025-06-01T00:00:00Z') },
      { id: 'co-off', name: 'Closed Client', normalizedName: 'closed client', isActive: false, createdAt: new Date('2024-01-01T00:00:00Z') },
    ],
    records: [
      rec('REC-DEL-1', 'DELIVERY', { linkedCollectionId: 'REC-RMA-OLD-1' }),
      rec('REC-COL-1', 'ACCOUNTING_COLLECTION'), rec('REC-PU-1', 'PROCUREMENT_PICKUP'), rec('REC-SO-1', 'SALES_ORDERS'),
      rec('REC-RMA-OLD-1', 'RMA', { rmaType: null, rmaReference: null }),
      rec('REC-RMA-OLD-2', 'RMA', { rmaType: 'Pull-Out Slip', rmaReference: null, rmaMovement: null }),
    ],
    podAttachments: [{ id: 'pod-rma', recordId: 'REC-RMA-OLD-1' }, { id: 'pod-del', recordId: 'REC-DEL-1' }],
    lineItems: [{ id: 'li-rma', deliveryRecordId: 'REC-RMA-OLD-2' }, { id: 'li-del', deliveryRecordId: 'REC-DEL-1' }],
    rmaContacts: [{ id: 'rc-rma', deliveryRecordId: 'REC-RMA-OLD-1' }],
    remarkLogs: [{ id: 'rl-rma', recordId: 'REC-RMA-OLD-1' }, { id: 'rl-col', recordId: 'REC-COL-1' }],
    comments: [{ id: 'cm-rma', recordId: 'REC-RMA-OLD-2', recordType: 'DeliveryRecord' }, { id: 'cm-other', recordId: 'REC-RMA-OLD-2', recordType: 'Company' },
      { id: 'cm-so', recordId: 'REC-SO-1', recordType: 'DeliveryRecord' }],
    notifications: [{ id: 'n-rma', recordId: 'REC-RMA-OLD-1', recordType: 'DeliveryRecord' }, { id: 'n-rma-null', recordId: 'REC-RMA-OLD-2', recordType: null },
      { id: 'n-dispatch', recordId: null, recordType: null }, { id: 'n-del', recordId: 'REC-DEL-1', recordType: 'DeliveryRecord' },
      { id: 'n-general', recordId: null, recordType: null }],
    dispatches: [{ id: 'dsp-1', inAppNotificationId: 'n-dispatch', recordIds: ['REC-RMA-OLD-1'] }],
    // High-water marks: an existing counter above the seeded number must never drop.
    sequences: [{ prefix: 'POS', manilaDate: '2026-04-18', lastValue: 9 }, { prefix: 'POS', manilaDate: TODAY, lastValue: 3 },
      { prefix: 'RTS', manilaDate: '2026-01-05', lastValue: 2 }],
    audits: [{ id: 'audit-old', recordId: 'REC-RMA-OLD-1', recordType: 'DeliveryRecord', action: 'CREATE', changedById: 'admin-1' }],
  };
}

function fakeDb(tables = baseTables()) {
  const state = { tables, database: 'db_staging', failAuditWrite: false };
  const calls = { reads: 0, writes: 0, locks: 0, transactions: 0, allocations: 0 };
  function model(t: Tables, name: string, children: Record<string, [string, string]> = {}) {
    const rows = () => t[name];
    return {
      findUnique: async ({ where, select }: Row) => { calls.reads++; return pick(rows().find(r => matches(r, where)), select); },
      findFirst: async ({ where, orderBy, select }: Row = {}) => { calls.reads++; return pick(sorted(rows().filter(r => matches(r, where)), orderBy)[0], select); },
      findMany: async ({ where, orderBy, select }: Row = {}) => { calls.reads++; return sorted(rows().filter(r => matches(r, where)), orderBy).map(r => pick(r, select)); },
      count: async ({ where }: Row = {}) => { calls.reads++; return rows().filter(r => matches(r, where)).length; },
      deleteMany: async ({ where }: Row = {}) => {
        calls.writes++;
        const before = rows().length;
        t[name] = rows().filter(r => !matches(r, where));
        return { count: before - t[name].length };
      },
      updateMany: async ({ where, data }: Row) => {
        calls.writes++;
        const hit = rows().filter(r => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
      create: async ({ data }: Row) => {
        calls.writes++;
        if (name === 'audits' && state.failAuditWrite) throw new Error('Injected audit failure');
        const row: Row = { id: data.id ?? `${name}-${rows().length + 1}`, ...data };
        assert.equal(rows().some(r => r.id === row.id), false, `duplicate ${name} ${row.id}`);
        for (const [field, [table, foreignKey]] of Object.entries(children)) {
          for (const child of row[field]?.create ?? []) t[table].push({ ...child, [foreignKey]: row.id });
          delete row[field];
        }
        rows().push(row);
        return row;
      },
    };
  }
  const db = {
    $queryRaw: async () => { calls.reads++; return [{ database: state.database }]; },
    user: { findUnique: async ({ where }: Row) => { calls.reads++; return state.tables.users.find(u => u.email === where.email) ?? null; } },
    $transaction: async (work: (tx: any) => Promise<unknown>) => {
      calls.transactions++;
      const pending: Tables = structuredClone(state.tables);
      const sequence = (prefix: string, manilaDate: string) => {
        let row = pending.sequences.find(s => s.prefix === prefix && s.manilaDate === manilaDate);
        if (!row) pending.sequences.push(row = { prefix, manilaDate, lastValue: 0 });
        return row;
      };
      const tx = {
        $executeRaw: async (query: TemplateStringsArray, ...values: any[]) => {
          const sql = query.join('?');
          if (/LOCK TABLE|pg_advisory_xact_lock/.test(sql)) { calls.locks++; return 0; }
          assert.match(sql, /INSERT INTO "RmaReferenceSequence"[\s\S]*GREATEST/);
          calls.writes++;
          const row = sequence(values[0], values[1]);
          row.lastValue = Math.max(row.lastValue, values[2]);
          return 1;
        },
        $queryRaw: async (query: TemplateStringsArray, ...values: any[]) => {
          assert.match(query.join('?'), /INSERT INTO "RmaReferenceSequence"/);
          calls.allocations++; calls.writes++;
          const row = sequence(values[0], values[1]);
          row.lastValue += 1;
          return [{ lastValue: row.lastValue }];
        },
        user: model(pending, 'users'), userPermission: model(pending, 'permissions'), driver: model(pending, 'drivers'),
        company: model(pending, 'companies'),
        deliveryRecord: model(pending, 'records', { rmaContacts: ['rmaContacts', 'deliveryRecordId'], lineItems: ['lineItems', 'deliveryRecordId'] }),
        podAttachment: model(pending, 'podAttachments'), lineItem: model(pending, 'lineItems'), rmaContact: model(pending, 'rmaContacts'),
        remarkLog: model(pending, 'remarkLogs'), comment: model(pending, 'comments'), notification: model(pending, 'notifications'),
        rmaLogisticsDispatch: model(pending, 'dispatches'), rmaReferenceSequence: model(pending, 'sequences'), auditLog: model(pending, 'audits'),
      };
      const result = await work(tx);
      state.tables = pending; // commit only on success
      return result;
    },
  };
  return { db: db as any, state, calls };
}

const ids = (rows: Row[]) => rows.map(r => r.id).sort();
const seq = (tables: Tables, prefix: string, date: string) => tables.sequences.find(s => s.prefix === prefix && s.manilaDate === date)?.lastValue;

test('target guard and apply acknowledgements refuse before any database access', async () => {
  const fake = fakeDb();
  const refused: Array<[NodeJS.ProcessEnv, RegExp]> = [
    [{ ...applyEnv, APP_ENV: 'production' }, /APP_ENV must explicitly be staging/],
    [{ ...applyEnv, DATABASE_URL: 'not a url' }, /invalid DATABASE_URL/],
    [{ ...applyEnv, STAGING_SEED_DATABASE: 'other_staging' }, /STAGING_SEED_DATABASE/],
    [{ ...applyEnv, STAGING_SEED_HOST: 'other.example' }, /exact database hostname/],
    [{ ...applyEnv, STAGING_SEED_ADMIN_EMAIL: undefined }, /STAGING_SEED_ADMIN_EMAIL/],
    [{ ...applyEnv, DATABASE_URL: 'postgresql://db.abcdefghijklmnopqrst.supabase.co:5432/postgres', STAGING_SEED_DATABASE: 'postgres',
      STAGING_SEED_HOST: 'db.abcdefghijklmnopqrst.supabase.co' }, /STAGING_SEED_SUPABASE_PROJECT_REF/],
    [{ ...applyEnv, DATABASE_URL: 'postgresql://aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres', STAGING_SEED_DATABASE: 'postgres',
      STAGING_SEED_HOST: 'aws-0-ap-southeast-1.pooler.supabase.com', STAGING_SEED_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
      SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }, /pooler username/],
  ];
  for (const [target, message] of refused) await assert.rejects(runStagingRmaDemoSeed(fake.db, { apply: true }, target), message);
  for (const STAGING_RMA_DEMO_APPROVED of [undefined, 'false', 'TRUE']) {
    await assert.rejects(runStagingRmaDemoSeed(fake.db, { apply: true }, { ...applyEnv, STAGING_RMA_DEMO_APPROVED }), /STAGING_RMA_DEMO_APPROVED=true/);
  }
  for (const STAGING_RMA_DEMO_ALLOW_RESET of [undefined, 'yes']) {
    await assert.rejects(runStagingRmaDemoSeed(fake.db, { apply: true }, { ...applyEnv, STAGING_RMA_DEMO_ALLOW_RESET }), /STAGING_RMA_DEMO_ALLOW_RESET=true/);
  }
  // Target-altering query parameters are refused on dedicated *_staging URLs too,
  // including percent-encoded and upper-case names, in preview and apply.
  assert.deepEqual([...TARGET_OVERRIDE_QUERY_PARAMS], ['host', 'hostaddr', 'user', 'username', 'database', 'dbname', 'db', 'port', 'service']);
  const overrides = ['host=other.example', '%68ost=other.example', 'HOST=other.example', 'hostaddr=10.0.0.9', 'user=other', 'username=other',
    'database=other_staging', 'dbname=other_staging', 'db=other_staging', 'port=5433', 'service=prod', 'schema=public&Host=other.example'];
  for (const query of overrides) {
    const target = { ...applyEnv, DATABASE_URL: `postgresql://staging.example/db_staging?${query}` };
    for (const options of [{}, { apply: true }]) {
      await assert.rejects(runStagingRmaDemoSeed(fake.db, options, target), /query parameters must not override/, query);
    }
    assert.throws(() => assertStagingRmaDemoTarget(target), /query parameters must not override/, query);
  }
  assert.deepEqual(assertStagingRmaDemoTarget({ ...applyEnv, DATABASE_URL: 'postgresql://staging.example/db_staging?schema=public&sslmode=require' }, { apply: true }),
    { database: 'db_staging', adminEmail: 'admin@example.com' }, 'benign query parameters are still accepted');
  assert.throws(() => assertStagingRmaDemoTarget(env, { apply: true }), StagingSeedError);
  assert.deepEqual(assertStagingRmaDemoTarget(env), { database: 'db_staging', adminEmail: 'admin@example.com' });
  assert.deepEqual(fake.calls, { reads: 0, writes: 0, locks: 0, transactions: 0, allocations: 0 });
});

test('wrong connected database and missing, inactive or non-Admin actors cannot refresh', async () => {
  const wrong = fakeDb();
  wrong.state.database = 'postgres';
  await assert.rejects(runStagingRmaDemoSeed(wrong.db, { apply: true }, applyEnv), /connected database does not match/);
  assert.equal(wrong.calls.transactions, 0);
  for (const change of [{ isActive: false }, { role: 'TASS' }, { email: 'someone@example.com' }]) {
    const fake = fakeDb();
    Object.assign(fake.state.tables.users[0], change);
    await assert.rejects(runStagingRmaDemoSeed(fake.db, { apply: true }, applyEnv), /existing active Admin/);
    assert.equal(fake.calls.writes, 0);
    assert.equal(fake.calls.transactions, 0);
  }
});

test('preview is read-only: exact plan, no writes, locks or slip allocations', async () => {
  const fake = fakeDb();
  const before = structuredClone(fake.state.tables);
  const plan = await runStagingRmaDemoSeed(fake.db, { now: NOW }, env); // no acknowledgements needed
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.operation, 'rma-demo-refresh');
  assert.deepEqual(plan.deletions, { rmaRecords: 2, podAttachments: 1, lineItems: 1, rmaContacts: 1, remarkLogs: 1, comments: 1,
    notifications: 3, rmaLogisticsDispatches: 1, unlinkedCollectionReferences: 1 });
  assert.deepEqual(plan.preserved, { users: 5, permissions: 1, driverProfiles: 4, linkedDriverProfiles: 1, audits: 1, rmaReferenceSequences: 3,
    nonRmaRecords: { DELIVERY: 1, ACCOUNTING_COLLECTION: 1, PROCUREMENT_PICKUP: 1, SALES_ORDERS: 1, total: 4 } });
  assert.equal(plan.create.curatedRmaRecords, 15);
  assert.equal(plan.create.driverDemoRmaRecords, 2, 'one per existing active Driver profile');
  assert.equal(plan.create.driverDemoDate, TODAY);
  assert.equal(plan.externalStorageDeleted, false);
  assert.deepEqual(plan.driverDemoReferences, []);
  assert.equal(fake.calls.writes, 0);
  assert.equal(fake.calls.locks, 0);
  assert.equal(fake.calls.allocations, 0);
  assert.deepEqual(fake.state.tables, before);
});

test('apply replaces only RMA demo data and preserves everything else', async () => {
  const fake = fakeDb();
  const before = structuredClone(fake.state.tables);
  const result = await runStagingRmaDemoSeed(fake.db, { apply: true, now: NOW }, applyEnv);
  const after = fake.state.tables;
  assert.equal(result.mode, 'applied');
  assert.equal(fake.calls.locks, 2, 'driver directory advisory lock + RMA table locks');

  // Accounts, permissions, every Driver profile (incl. login links), companies and prior audits are untouched.
  for (const table of ['users', 'permissions', 'drivers', 'companies'] as const) assert.deepEqual(after[table], before[table], table);
  assert.deepEqual(after.audits.slice(0, 1), before.audits);
  // Non-RMA records and their children are untouched, except the defensive unlink of a deleted RMA.
  const nonRma = after.records.filter(r => r.category !== 'RMA');
  assert.deepEqual(nonRma, before.records.filter(r => r.category !== 'RMA').map(r => ({ ...r, linkedCollectionId: null })));
  assert.deepEqual(ids(after.podAttachments), ['pod-del']);
  assert.deepEqual(ids(after.lineItems.filter(l => !l.deliveryRecordId.startsWith('REC-4') && !l.deliveryRecordId.startsWith('REC-DEMO'))), ['li-del']);
  assert.deepEqual(ids(after.remarkLogs), ['rl-col']);
  assert.deepEqual(ids(after.comments), ['cm-other', 'cm-so']);
  assert.deepEqual(ids(after.notifications), ['n-del', 'n-general']);
  assert.deepEqual(after.dispatches, []);

  // RMAs are exactly the curated set plus one run per active Driver profile.
  const rmas = after.records.filter(r => r.category === 'RMA');
  const demoIds = rmas.filter(r => r.id.startsWith('REC-DEMO-')).map(r => r.id);
  assert.deepEqual(rmas.filter(r => !r.id.startsWith('REC-DEMO-')).map(r => r.id), Array.from({ length: 15 }, (_, i) => `REC-${4101 + i}`));
  assert.equal(demoIds.length, 2);
  assert.ok(demoIds.every(id => id.startsWith(`REC-DEMO-${TODAY.replace(/-/g, '')}-`) && id.endsWith('-RMA')));
  assert.ok(rmas.every(r => r.rmaType && r.rmaReference && r.rmaMovement), 'no RMA is left without category/reference/movement');
  const activeDriverIds = new Set(['drv-manny', 'drv-kuya']);
  for (const r of rmas) {
    if (r.driverId) assert.ok(activeDriverIds.has(r.driverId), `${r.id} uses an existing active Driver profile`);
    assert.ok(['tass-1', 'admin-1'].includes(r.createdById));
    if (r.rmaReceivedBy) assert.equal(r.rmaReceivedBy, 'tass-1', 'receipt stores the active TASS user id');
  }
  const byId = new Map(rmas.map(r => [r.id, r]));
  assert.equal(byId.get('REC-4101')!.driverId, 'drv-manny', 'seeded name matched case-insensitively');
  assert.equal(byId.get('REC-4102')!.driverAssistants, JSON.stringify(['Ricky Mendoza']));
  assert.equal(byId.get('REC-4104')!.driverAssistants, '[]', 'missing helper names are not invented');
  assert.equal(byId.get('REC-4101')!.companyId, 'co-jollibee');
  assert.equal(byId.get('REC-4102')!.companyId, 'co-first', 'falls back to the first active company');
  assert.equal(after.rmaContacts.length, 18 + 2, '18 curated contacts (REC-4102 has 3, REC-4107 has 2) + 1 per driver-demo run');
  assert.ok(after.rmaContacts.every(c => byId.has(c.deliveryRecordId)));

  // Slip counters: seeded maxima raised, existing high-water marks never lowered, today allocated after them.
  assert.equal(seq(after, 'POS', '2026-04-18'), 9);
  assert.equal(seq(after, 'RTS', '2026-01-05'), 2);
  assert.equal(seq(after, 'RTC', '2026-07-18'), 2);
  assert.equal(seq(after, 'POS', TODAY), 5);
  assert.deepEqual(result.driverDemoReferences, [`POS${manilaDateToMmddyy(TODAY)}-04`, `POS${manilaDateToMmddyy(TODAY)}-05`]);
  assert.equal(byId.get('REC-4101')!.rmaReference, 'POS041826-01');

  const reset = after.audits.at(-1)!;
  assert.equal(after.audits.length, 2);
  assert.deepEqual([reset.recordId, reset.recordType, reset.action, reset.changedById], ['db_staging', 'StagingRmaDemoSeed', 'RESET', 'admin-1']);
  assert.equal(JSON.parse(reset.newValue).externalStorageDeleted, false);
  assert.equal(JSON.parse(reset.previousValue).deletions.rmaRecords, 2);
  assert.doesNotMatch(reset.previousValue + reset.newValue, /REC-RMA-OLD|Pull-Out Slip/, 'no copied business rows');

  // Repeatable: a second apply replaces the demo set again without lowering any counter.
  const again = await runStagingRmaDemoSeed(fake.db, { apply: true, now: NOW }, applyEnv);
  assert.equal(again.deletions.rmaRecords, 17);
  assert.equal(fake.state.tables.records.filter(r => r.category === 'RMA').length, 17);
  assert.equal(seq(fake.state.tables, 'POS', '2026-04-18'), 9);
  assert.equal(seq(fake.state.tables, 'POS', TODAY), 7);
  assert.equal(fake.state.tables.lineItems.filter(l => l.deliveryRecordId.startsWith('REC-4')).length, 16);
  assert.deepEqual(fake.state.tables.users, before.users);
  assert.deepEqual(fake.state.tables.drivers, before.drivers);
});

test('a late failure rolls back deletions, inserts and slip counter upserts together', async () => {
  const fake = fakeDb();
  const before = structuredClone(fake.state.tables);
  fake.state.failAuditWrite = true; // the RESET audit is the final write
  await assert.rejects(runStagingRmaDemoSeed(fake.db, { apply: true, now: NOW }, applyEnv), /Injected audit failure/);
  assert.ok(fake.calls.allocations > 0 && fake.calls.writes > 20, 'failure happened after deletes, inserts and counter writes');
  assert.deepEqual(fake.state.tables, before);
});

test('staging actors fall back to the confirmed Admin; no Driver, User or Company is ever created', async () => {
  const fake = fakeDb();
  fake.state.tables.users = fake.state.tables.users.filter(u => !['TASS', 'LOGISTICS'].includes(u.role) || !u.isActive);
  await runStagingRmaDemoSeed(fake.db, { apply: true, now: NOW }, applyEnv);
  const rmas = fake.state.tables.records.filter(r => r.category === 'RMA');
  assert.ok(rmas.every(r => r.createdById === 'admin-1' && r.modifiedById === 'admin-1'));
  assert.ok(rmas.filter(r => r.rmaReceivedBy).every(r => r.rmaReceivedBy === 'admin-1'));

  const noDrivers = fakeDb();
  noDrivers.state.tables.drivers = noDrivers.state.tables.drivers.map(d => d.type === 'DRIVER' ? { ...d, isActive: false } : d);
  const snapshot = structuredClone(noDrivers.state.tables);
  await assert.rejects(runStagingRmaDemoSeed(noDrivers.db, { apply: true, now: NOW }, applyEnv), /at least one active Driver profile/);
  assert.deepEqual(noDrivers.state.tables, snapshot);

  const noCompanies = fakeDb();
  noCompanies.state.tables.companies = noCompanies.state.tables.companies.map(c => ({ ...c, isActive: false }));
  await assert.rejects(runStagingRmaDemoSeed(noCompanies.db, { now: NOW }, env), /at least one active Company/);
});

test('two active Driver profiles with the same case-insensitive name succeed in preview and apply with distinct IDs', async () => {
  const tables = baseTables();
  tables.drivers = [
    { id: 'drv-dup-1', name: 'Same Name', type: 'DRIVER', isActive: true, userId: null, coverageAreas: '[]' },
    { id: 'drv-dup-2', name: 'same name', type: 'DRIVER', isActive: true, userId: null, coverageAreas: '[]' },
    { id: 'drv-manny', name: 'Manny Santos', type: 'DRIVER', isActive: true, userId: 'drv-user', coverageAreas: '[]' },
    { id: 'helper-1', name: 'Ricky Mendoza', type: 'ASSISTANT', isActive: true, userId: null, coverageAreas: '[]' },
  ];
  const fake = fakeDb(tables);
  const plan = await runStagingRmaDemoSeed(fake.db, { now: NOW }, env);
  assert.equal(plan.create.driverDemoRmaRecords, 3);
  assert.equal(fake.calls.writes, 0);
  assert.equal(fake.calls.locks, 0);
  assert.equal(fake.calls.allocations, 0);

  const result = await runStagingRmaDemoSeed(fake.db, { apply: true, now: NOW }, applyEnv);
  assert.equal(result.mode, 'applied');
  const demo = fake.state.tables.records.filter(r => r.id.startsWith('REC-DEMO-'));
  assert.equal(demo.length, 3);
  assert.equal(new Set(demo.map(r => r.id)).size, 3);
  assert.equal(new Set(demo.map(r => r.rmaReference)).size, 3);
  assert.deepEqual(demo.map(r => r.driverId).sort(), ['drv-dup-1', 'drv-dup-2', 'drv-manny']);
  assert.equal(demo.find(r => r.driverId === 'drv-manny')!.id, driverDemoRecordId(TODAY, 'Manny Santos', 'RMA'), 'unique names keep the standard id');
  const [first, second] = ['drv-dup-1', 'drv-dup-2'].map(id => demo.find(r => r.driverId === id)!);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.caseNumber, second.caseNumber);
  const serial = (record: Row) => fake.state.tables.lineItems.find(l => l.deliveryRecordId === record.id)!.serialNumber;
  assert.notEqual(serial(first), serial(second));
  // Curated rows that prefer a missing name resolve to the first duplicate in [name asc, id asc] order.
  assert.ok(fake.state.tables.records.filter(r => r.driverId && !r.id.startsWith('REC-DEMO-')).every(r => ['drv-dup-1', 'drv-dup-2', 'drv-manny'].includes(r.driverId)));
});
