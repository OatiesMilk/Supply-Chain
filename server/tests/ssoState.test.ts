import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSsoState, validateSsoState, SSO_STATE_MAX_AGE_MS } from '../src/services/ssoState';

test('SSO state is unpredictable and passes only an exact browser-cookie match', () => {
  const first = createSsoState();
  const second = createSsoState();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(validateSsoState(first, first), true);
  for (const received of [undefined, null, '', second, first.slice(0, 32), 'z'.repeat(64), [first]]) {
    assert.equal(validateSsoState(received, first), false);
  }
  for (const cookie of [undefined, null, '', second, first.slice(0, 32), [first]]) {
    assert.equal(validateSsoState(first, cookie), false);
  }
  assert.equal(SSO_STATE_MAX_AGE_MS, 300000);
});
