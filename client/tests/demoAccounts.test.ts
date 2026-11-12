import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoAccountsEnabled } from '../src/utils/demoAccounts';

test('demo login requires explicit opt-in during development', () => {
  for (const showDemoAccounts of [undefined, '', 'false', 'TRUE']) {
    assert.equal(demoAccountsEnabled({ dev: true, mode: 'development', showDemoAccounts }), false);
  }
  assert.equal(demoAccountsEnabled({ dev: true, mode: 'development', showDemoAccounts: 'true' }), true);
});

test('staging and production cannot enable demo login even with flag true', () => {
  for (const mode of ['staging', 'production']) {
    for (const dev of [false, true]) assert.equal(demoAccountsEnabled({ dev, mode, showDemoAccounts: 'true' }), false);
  }
  assert.equal(demoAccountsEnabled({ dev: false, mode: 'development', showDemoAccounts: 'true' }), false);
});
