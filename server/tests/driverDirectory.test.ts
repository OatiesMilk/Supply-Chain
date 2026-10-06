import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { assignmentError, createDriverDirectory, DriverConflictError, driverInputError, parseCoverageAreas, readDriverDirectory, updateDriverDirectory, withDriverDirectoryLock } from '../src/services/driverDirectory';
import { asyncRoute } from '../src/middleware/asyncRoute';
import { planHistoricalDrivers } from '../src/services/historicalDrivers';

test('directory reads stay empty without writes and exclude inactive rows by default', async () => {
  const filters: unknown[] = [];
  const db = { driver: { findMany: async ({ where }: any) => { filters.push(where); return []; } } } as unknown as PrismaClient;
  assert.deepEqual(await readDriverDirectory(db, false), []);
  assert.deepEqual(await readDriverDirectory(db, true), []);
  assert.deepEqual(filters, [{ isActive: true }, {}]);
});

test('missing directory entries return not found without updating or auditing', async () => {
  const db = { $transaction: async (fn: any) => fn({ $executeRaw: async () => 0, driver: { findUnique: async () => null } }) } as unknown as PrismaClient;
  assert.equal(await updateDriverDirectory(db, 'missing', { isActive: false }, { id: 'admin', name: 'Admin' }, true), null);
});

test('deactivation retains IDs, audits the change, and is idempotent with or without delivery history', async () => {
  let row = { id: 'driver-1', name: 'Pat', type: 'DRIVER', isActive: true, modifiedBy: 'Original' };
  const audits: unknown[] = [];
  const tx = {
    $executeRaw: async () => 0,
    driver: { findUnique: async () => row, update: async ({ data }: any) => (row = { ...row, ...data }) },
    auditLog: { create: async ({ data }: any) => { audits.push(data); } },
  };
  const db = { $transaction: async (fn: any) => fn(tx) } as unknown as PrismaClient;
  const actor = { id: 'admin-1', name: 'Admin' };
  await updateDriverDirectory(db, row.id, { isActive: false }, actor, true);
  assert.equal(row.id, 'driver-1');
  assert.equal(row.isActive, false);
  assert.equal(row.modifiedBy, 'Admin');
  assert.equal(audits.length, 1);
  await updateDriverDirectory(db, row.id, { isActive: false }, actor, true);
  assert.equal(audits.length, 1);
  await updateDriverDirectory(db, row.id, { isActive: true }, actor);
  assert.equal(row.id, 'driver-1');
  assert.equal(row.isActive, true);
  assert.equal(audits.length, 2);
});

test('new assignments require an active matching directory entry; historical assignments can remain', async () => {
  const lookups: any[] = [];
  const db = { driver: { findFirst: async ({ where }: any) => {
    lookups.push(where);
    return where.name.equals === 'Active' && where.type === 'DRIVER' ? { id: 'active' } : null;
  } } } as unknown as PrismaClient;
  const history = { driver: 'Inactive', driverAssistants: '["Old assistant"]' };
  assert.equal(await assignmentError(db, history, {}), null);
  assert.equal(await assignmentError(db, history, { driver: 'Inactive', driverAssistants: '["Old assistant"]' }), null);
  assert.equal(lookups.length, 0);
  assert.equal(await assignmentError(db, history, { driver: 'Active' }), null);
  assert.match((await assignmentError(db, history, { driver: 'Other inactive' }))!, /inactive/);
  assert.match((await assignmentError(db, history, { driverAssistants: '["Old assistant", "Inactive assistant"]' }))!, /inactive/);
  assert.equal(await assignmentError(db, history, { driver: '', driverAssistants: '[]' }), null);
  assert.ok(lookups.every(where => where.isActive === true));
});

test('historical imports skip existing inactive identities, deduplicate, and never activate new entries', () => {
  const planned = planHistoricalDrivers([{ name: 'Pat', type: 'DRIVER' }], [
    { driver: ' PAT ', driverAssistants: '["Helper", null, 42]' },
    { driver: 'New driver', driverAssistants: '["helper"]' },
    { driver: 'new driver', driverAssistants: 'malformed' },
  ]);
  assert.deepEqual(planned.map(d => d.name), ['Helper', 'New driver']);
  assert.ok(planned.every(d => d.isActive === false));
});

test('invalid types and coverage payloads are rejected; malformed legacy coverage is safe to display', () => {
  assert.ok(driverInputError({ name: 'Pat', type: 'TYPO' }, true));
  assert.ok(driverInputError({ coverage_areas: 'Makati' }));
  assert.ok(driverInputError({ coverage_areas: [42] }));
  assert.ok(driverInputError({ is_active: 'false' }));
  assert.equal(driverInputError({ coverage_areas: ['Makati'], is_active: false }), null);
  assert.deepEqual(parseCoverageAreas('malformed'), []);
  assert.deepEqual(parseCoverageAreas('null'), []);
  assert.deepEqual(parseCoverageAreas('["Makati", null, 42]'), ['Makati']);
});

test('rejected async routes reach the Express error handler', async () => {
  const failure = new Error('Database unavailable');
  let forwarded: unknown;
  const handler = asyncRoute(async () => { throw failure; });
  await handler({} as any, {} as any, error => { forwarded = error; });
  assert.equal(forwarded, failure);
});

// Model transaction lock ordering, not PostgreSQL internals. Every directory read
// inside a write transaction must wait for the shared lock before observing state.
function lockedDirectory() {
  let queue = Promise.resolve();
  const rows: any[] = [];
  const audits: any[] = [];
  const db = { $transaction: async (work: any) => {
    const turn = queue;
    let release!: () => void;
    queue = turn.then(() => new Promise<void>(resolve => { release = resolve; }));
    let locked = false;
    const requireLock = () => assert.equal(locked, true, 'Directory access must wait for the lock');
    const tx = {
      $executeRaw: async () => { await turn; locked = true; return 0; },
      driver: {
        findUnique: async ({ where }: any) => { requireLock(); return rows.find(row => row.id === where.id) ?? null; },
        findFirst: async ({ where }: any) => {
          requireLock();
          return rows.find(row => row.name.toLowerCase() === where.name.equals.toLowerCase() && row.type === where.type && (where.isActive === undefined || row.isActive === where.isActive) && (!where.id || row.id !== where.id.not)) ?? null;
        },
        create: async ({ data }: any) => { requireLock(); const row = { id: String(rows.length + 1), isActive: true, ...data }; rows.push(row); return row; },
        update: async ({ where, data }: any) => { requireLock(); const row = rows.find(row => row.id === where.id); Object.assign(row, data); return row; },
      },
      auditLog: { create: async ({ data }: any) => { audits.push(data); } },
    };
    try { return await work(tx); } finally { await turn; await Promise.resolve(); release(); }
  } } as unknown as PrismaClient;
  return { db, rows, audits };
}

test('simultaneous creates cannot duplicate an identity; inactive entries cannot be recreated', async () => {
  const { db, rows } = lockedDirectory();
  const actor = { id: 'admin', name: 'Admin' };
  const input = { name: 'Pat', type: 'DRIVER', createdBy: actor.name, modifiedBy: actor.name };
  const outcomes = await Promise.allSettled([createDriverDirectory(db, input, actor), createDriverDirectory(db, input, actor)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(rows.length, 1);
  await updateDriverDirectory(db, rows[0].id, { isActive: false }, actor, true);
  await assert.rejects(createDriverDirectory(db, input, actor), DriverConflictError);
  assert.equal(rows[0].isActive, false);
});

test('assignment validation waits for a concurrent deactivation and sees the committed inactive state', async () => {
  const { db, rows } = lockedDirectory();
  rows.push({ id: 'driver-1', name: 'Pat', type: 'DRIVER', isActive: true });
  const deactivate = updateDriverDirectory(db, 'driver-1', { isActive: false }, { id: 'admin', name: 'Admin' }, true);
  const assignment = withDriverDirectoryLock(db, tx => assignmentError(tx, { driver: '', driverAssistants: '[]' }, { driver: 'Pat' }));
  await deactivate;
  assert.match((await assignment)!, /inactive/);
});
