import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { api, type ApiDriver } from '../src/api';
import { createQueryClient } from '../src/api/queryClient';
import { driverQueryOptions, createDriver } from '../src/api/queries/useDriversQuery';
import { DRIVERS, DRIVER_ASSISTANTS, driverIdForName, setManagedDriverList, subscribeManagedDrivers, getManagedDriverVersion } from '../src/data';

afterEach(() => { mock.restoreAll(); setManagedDriverList([]); });

test('an empty directory stays empty and failed reads reject instead of returning demo drivers', async () => {
  const cache = createQueryClient();
  const get = mock.method(api, 'getDrivers', async () => []);
  assert.deepEqual(await cache.fetchQuery({ ...driverQueryOptions, retry: false }), []);
  cache.clear();
  get.mock.mockImplementation(async () => { throw new Error('Unavailable'); });
  await assert.rejects(cache.fetchQuery({ ...driverQueryOptions, retry: false }), /Unavailable/);
  assert.equal(cache.getQueryData(['drivers']), undefined);
  cache.clear();
});

test('failed creation propagates the error without fabricating a driver', async () => {
  mock.method(api, 'createDriver', async () => { throw new Error('Forbidden'); });
  await assert.rejects(createDriver({ name: 'New driver', type: 'DRIVER' }), /Forbidden/);
});

test('assignment options exclude inactive entries and accept an authoritative empty roster', () => {
  const before = getManagedDriverVersion();
  let updates = 0;
  const unsubscribe = subscribeManagedDrivers(() => { updates++; });
  setManagedDriverList([
    { id: 'profile-active', name: 'Active driver', type: 'DRIVER', is_active: true, coverage_areas: [] },
    { id: 'profile-inactive', name: 'Inactive driver', type: 'DRIVER', is_active: false, coverage_areas: [] },
    { id: 'profile-assistant', name: 'Inactive assistant', type: 'ASSISTANT', is_active: false, coverage_areas: [] },
  ]);
  assert.deepEqual([...DRIVERS], ['Active driver']);
  assert.deepEqual([...DRIVER_ASSISTANTS], []);
  // Assignments save the stable profile id for the chosen name (TSK-100).
  assert.equal(driverIdForName('Active driver'), 'profile-active');
  assert.equal(driverIdForName('Inactive driver'), null);
  assert.equal(driverIdForName('Inactive assistant'), null);
  setManagedDriverList([]);
  assert.deepEqual([...DRIVERS], []);
  assert.equal(driverIdForName('Active driver'), null);
  assert.equal(updates, 2);
  assert.equal(getManagedDriverVersion(), before + 2);
  unsubscribe();
});
