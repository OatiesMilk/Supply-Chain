import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, getSession } from '../helpers/auth';
import { deliveryFixture, linkedDriverFixture } from '../helpers/fixtures';

test('TC-ACC-007: driver list and detail enforce linked profile ownership', async () => {
  const { profile, driver } = await linkedDriverFixture();
  const sales = await getSession('sales@microgenesis.com');
  const logistics = await getSession('logistics@microgenesis.com');
  const own = await apiRequest('POST', '/records', sales, await deliveryFixture());
  const foreign = await apiRequest('POST', '/records', sales, await deliveryFixture());
  assert.equal(own.status, 201);
  assert.equal(foreign.status, 201);
  const assigned = await apiRequest('PUT', `/records/${own.data.id}`, logistics, {
    driver_id: profile.id, driver: profile.name, remarks: 'QA isolated ownership fixture',
  });
  assert.equal(assigned.status, 200);
  const list = await apiRequest('GET', '/records', driver);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data));
  assert.ok(list.data.some((record: any) => record.id === own.data.id), 'Assigned fixture must be visible');
  assert.ok(!list.data.some((record: any) => record.id === foreign.data.id), 'Foreign fixture must not be listed');
  for (const record of list.data) {
    assert.equal(record.driver_id, profile.id, 'Every listed record belongs to the linked profile');
    assert.equal(record.is_draft, 'No');
  }
  const detail = await apiRequest('GET', `/records/${foreign.data.id}`, driver);
  assert.ok([403, 404].includes(detail.status), 'Foreign record must be denied by ID');
  const write = await apiRequest('POST', `/records/${foreign.data.id}/time-in`, driver, { remarks: 'QA forbidden ownership probe' });
  assert.ok([403, 404].includes(write.status), 'Foreign record must be denied for writes');
});
