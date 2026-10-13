import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedDriverDemo } from '../prisma/seed-driver-demo';
import type { PrismaClient } from '@prisma/client';

function fakePrisma(state: any, lockChecker?: () => void): PrismaClient {
  return {
    $executeRaw: async (query: TemplateStringsArray, ...values: any[]) => {
      if (query && query[0] && query[0].includes('pg_advisory_xact_lock')) {
        state.locked = true;
      }
    },
    $transaction: async (fn: any) => {
      const stateCopy = JSON.parse(JSON.stringify(state));
      try {
        state.locked = false; // Reset per transaction
        const tx = fakePrisma(state, () => {
          if (!state.locked) throw new Error('Directory locked was not called before read/write');
        });
        const result = await fn(tx);
        return result;
      } catch (e) {
        // rollback
        Object.assign(state, stateCopy);
        throw e;
      }
    },
    user: {
      findFirst: async ({ where }: any) => {
        const users = [state.sales, state.logistics, state.admin, state.driver].filter(Boolean);
        return users.find((u: any) =>
          u.email === where.email &&
          u.role === where.role &&
          u.isActive === where.isActive
        ) || null;
      }
    },
    company: {
      findFirst: async () => state.company
    },
    driver: {
      findFirst: async ({ where }: any) => {
        if (lockChecker) lockChecker();
        if (where.type === 'ASSISTANT') return state.assistant;
        if (where.name && where.name.equals) {
          const match = state.drivers.find((d: any) => d.name.toLowerCase() === where.name.equals.toLowerCase() && d.type === where.type);
          return (where.isActive === undefined || (match && match.isActive === where.isActive)) ? match : null;
        }
        return null;
      },
      findMany: async ({ where }: any) => {
        if (lockChecker) lockChecker();
        if (where.type === 'ASSISTANT') return state.assistant ? [state.assistant] : [];
        if (where.name && where.name.equals) {
          return state.drivers.filter((d: any) => d.name.toLowerCase() === where.name.equals.toLowerCase() && d.type === where.type);
        }
        return [];
      },
      create: async ({ data }: any) => {
        if (lockChecker) lockChecker();
        const newDriver = { id: 'new-id', ...data };
        state.drivers.push(newDriver);
        return newDriver;
      },
      findUnique: async ({ where }: any) => {
        if (lockChecker) lockChecker();
        return state.drivers.find((d: any) => (where.userId ? d.userId === where.userId : d.id === where.id)) || null;
      },
      update: async ({ where, data }: any) => {
        if (lockChecker) lockChecker();
        const driver = state.drivers.find((d: any) => d.id === where.id);
        Object.assign(driver, data);
        return driver;
      }
    },
    deliveryRecord: {
      findUnique: async ({ where }: any) => {
        return state.records.find((r: any) => r.id === where.id) || null;
      },
      create: async ({ data }: any) => {
        if (state.failOnSecondRecord && state.records.length === 1) {
          throw new Error('Simulated insert failure on second record');
        }
        state.records.push(data);
        return data;
      }
    }
  } as unknown as PrismaClient;
}

function getBaseState() {
  return {
    locked: false,
    sales: { id: 's1', email: 'sales@microgenesis.com', role: 'SALES_COORDINATOR', name: 'Sales', isActive: true },
    logistics: { id: 'l1', email: 'logistics@microgenesis.com', role: 'LOGISTICS', name: 'Logistics', isActive: true },
    admin: { id: 'a1', email: 'admin@microgenesis.com', role: 'ADMIN', name: 'Admin', isActive: true },
    company: { id: 'c1', name: 'Company' },
    driver: { id: 'd1', email: 'driver@microgenesis.com', role: 'DRIVER', name: 'Leo Driver', isActive: true },
    assistant: { id: 'as1', name: 'Test Assistant', type: 'ASSISTANT', isActive: true },
    drivers: [
      { id: '1', name: 'Lando Navarro', type: 'DRIVER', isActive: true }
    ],
    records: [],
    failOnSecondRecord: false
  };
}

test('successful run, exact login name match when case differs, rerun test, and renamed account', async () => {
  const state = getBaseState();
  // Renamed account: driver user is 'LeO DriVer'
  state.driver.name = 'LeO DriVer';
  state.drivers.push({ id: '2', name: 'leo DRIVER', type: 'DRIVER', isActive: true });

  const prisma = fakePrisma(state);
  const count = await seedDriverDemo(prisma, '2026-10-02');

  assert.equal(count, 10); // Lando + LeO DriVer

  // The run is owned by the profile id; the login is linked to that profile.
  const leoRuns = state.records.filter((r: any) => r.driverId === '2');
  assert.equal(leoRuns.length, 5);
  assert.equal(leoRuns[0].driver, 'leo DRIVER');
  assert.equal(state.drivers.find((d: any) => d.id === '2').userId, 'd1');

  // Actual rerun
  const count2 = await seedDriverDemo(prisma, '2026-10-02');
  assert.equal(count2, 0); // Both exist
});

test('one fixture when account matches a seeded driver', async () => {
  const state = getBaseState();
  state.driver.name = 'Lando Navarro';

  const prisma = fakePrisma(state);
  const count = await seedDriverDemo(prisma, '2026-10-02');

  assert.equal(count, 5);
  assert.equal(state.records[0].driverId, '1');
  assert.equal(state.drivers[0].userId, 'd1');
});

test('never moves a profile link that belongs to another login', async () => {
  const state = getBaseState();
  state.drivers.push({ id: '2', name: 'Leo Driver', type: 'DRIVER', isActive: true, userId: 'other-login' } as any);

  const count = await seedDriverDemo(fakePrisma(state), '2026-10-02');

  assert.equal(count, 10);
  assert.equal((state.drivers[1] as any).userId, 'other-login');
});

test('handles identical long name prefixes without ID collisions', async () => {
  const state = getBaseState();
  state.driver.name = 'Lando Navarro Jr.';
  state.drivers.push({ id: '2', name: 'Lando Navarro Jr.', type: 'DRIVER', isActive: true });

  const prisma = fakePrisma(state);
  const count = await seedDriverDemo(prisma, '2026-10-02');

  assert.equal(count, 10);
  const ids = new Set(state.records.map((r: any) => r.id));
  assert.equal(ids.size, 10);
});

test('missing prerequisite / incorrect role actor users', async () => {
  const state1 = getBaseState();
  state1.sales.role = 'ADMIN';
  await assert.rejects(seedDriverDemo(fakePrisma(state1), '2026-10-02'), /Prerequisite users/);

  const state2 = getBaseState();
  state2.logistics.isActive = false;
  await assert.rejects(seedDriverDemo(fakePrisma(state2), '2026-10-02'), /Prerequisite users/);
});

test('missing driver account and company', async () => {
  const state1 = getBaseState();
  state1.driver = null as any;
  await assert.rejects(seedDriverDemo(fakePrisma(state1), '2026-10-02'), /Prerequisite driver account/);

  const state2 = getBaseState();
  state2.company = null as any;
  await assert.rejects(seedDriverDemo(fakePrisma(state2), '2026-10-02'), /Prerequisite company/);
});

test('invalid calendar dates', async () => {
  const prisma = fakePrisma(getBaseState());
  await assert.rejects(seedDriverDemo(prisma, '2026-02-30'), /Invalid target date/);
  await assert.rejects(seedDriverDemo(prisma, '2026-13-01'), /Invalid target date/);
  await assert.rejects(seedDriverDemo(prisma, 'not-a-date'), /Invalid target date/);
  await assert.rejects(seedDriverDemo(prisma, ''), /Invalid target date/);
});

test('preserves all fields of edited/completed fixtures and unrelated records', async () => {
  const state = getBaseState();
  state.records.push({
    id: 'unrelated', driver: 'Someone Else', status: 'DRAFT', remarks: 'Should not change'
  });

  const p1 = fakePrisma(state);
  await seedDriverDemo(p1, '2026-10-02');

  const landoRec = state.records.find((r: any) => r.driver === 'Lando Navarro');
  landoRec.status = 'ACCOMPLISHED';
  landoRec.remarks = 'Completed by Lando';
  landoRec.priority = '1 - Low';

  const snapshotRecords = JSON.parse(JSON.stringify(state.records));
  const snapshotDrivers = JSON.parse(JSON.stringify(state.drivers));

  const p2 = fakePrisma(state);
  const count = await seedDriverDemo(p2, '2026-10-02');

  assert.equal(count, 0);

  assert.deepEqual(state.records, snapshotRecords);
  assert.deepEqual(state.drivers, snapshotDrivers);
});

test('unchanged inactive directory identities (takes precedence over active)', async () => {
  const state = getBaseState();
  // Include both active and inactive for Leo Driver
  state.drivers.push({ id: '2', name: 'Leo Driver', type: 'DRIVER', isActive: false });
  state.drivers.push({ id: '3', name: 'Leo Driver', type: 'DRIVER', isActive: true });

  const snapshotDrivers = JSON.parse(JSON.stringify(state.drivers));
  const prisma = fakePrisma(state);
  const count = await seedDriverDemo(prisma, '2026-10-02');

  assert.equal(count, 5); // Only Lando
  assert.deepEqual(state.drivers, snapshotDrivers); // directory unchanged
});

test('rollback when a later record creation fails', async () => {
  const state = getBaseState();
  state.failOnSecondRecord = true;

  const prisma = fakePrisma(state);
  await assert.rejects(seedDriverDemo(prisma, '2026-10-02'), /Simulated insert failure/);

  // Lando is processed first or Leo first, second fails. Rollback should reset records to 0
  assert.equal(state.records.length, 0);
  // Any created directory entries should also be rolled back
  assert.equal(state.drivers.length, 1);
});
