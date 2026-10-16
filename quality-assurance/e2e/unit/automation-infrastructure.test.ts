import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localUrl, disposableDatabase, redact } from '../helpers/runtime';
import { apiRequest } from '../helpers/auth';
const { parseResult, overall, discover } = require('../../automated-tests/runner-core.cjs');
import { QA_ROOT } from '../helpers/runtime';

function result(overrides: Record<string, unknown> = {}) {
  return { status: 0, signal: null, stdout: '# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n', ...overrides };
}
test('runner never reports startup failures or missing TAP summaries as success', () => {
  for (const processResult of [result({ status: 1, stdout: '' }), result({ error: new Error('spawn failure') }), result({ signal: 'SIGTERM' }), result({ stdout: '# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n' })]) {
    assert.equal(parseResult(processResult).status, 'ERROR');
  }
  assert.equal(overall([]), 'ERROR');
});
test('runner propagates real assertion failures, cancellations and incomplete execution', () => {
  assert.equal(parseResult(result()).status, 'PASS');
  assert.equal(parseResult(result({ status: 1, stdout: '# tests 2\n# pass 1\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n' })).status, 'FAIL');
  assert.equal(parseResult(result({ stdout: '# tests 2\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n' })).status, 'INCOMPLETE');
  assert.equal(overall([{ status: 'PASS' }, { status: 'BLOCKED' }]), 'BLOCKED');
  assert.equal(overall([{ status: 'PASS' }, { status: 'FAIL' }]), 'FAIL');
});
test('runner discovers canonical regression and browser files, excluding interactive SSO by default', () => {
  assert.ok(discover(QA_ROOT, 'api').some((file: string) => file.endsWith('major-defects-regression.test.ts')));
  assert.ok(discover(QA_ROOT, 'browser').some((file: string) => file.endsWith('delivery-workflow.test.ts')));
  assert.ok(!discover(QA_ROOT, 'browser').some((file: string) => file.endsWith('sso-session.test.ts')));
});
test('target guard rejects external hosts, credentials and wrong ports or prefixes', () => {
  assert.equal(localUrl('http://localhost:4000/api', '4000', '/api').hostname, 'localhost');
  for (const url of ['https://example.com/api', 'http://localhost:3000/api', 'http://user@localhost:4000/api', 'http://localhost:4000/other', 'http://localhost:4000/api?token=x']) {
    assert.throws(() => localUrl(url, '4000', '/api'));
  }
});
test('write guard rejects production names and remote databases', () => {
  assert.equal(disposableDatabase('postgresql://localhost:5433/qa_test'), 'qa_test');
  assert.throws(() => disposableDatabase('postgresql://localhost:5433/production'));
  assert.throws(() => disposableDatabase('postgresql://remote.example/qa_test'));
});
test('API path guard rejects cross-origin and traversal targets before fetching', async () => {
  for (const route of ['https://example.com/api', '//example.com/api', '/../outside', '/\\example.com']) {
    await assert.rejects(() => apiRequest('GET', route));
  }
});
test('retained evidence removes credential and session fields', () => {
  const output = redact({ cookie: 'sensitive-fixture', csrfToken: 'sensitive-fixture', password: 'sensitive-fixture', role: 'ADMIN' });
  assert.ok(!output.includes('sensitive-fixture'));
  assert.ok(output.includes('ADMIN'));
  assert.equal(JSON.parse(output).cookie, '[redacted]', 'Sanitized JSON must remain valid evidence');
  assert.ok(!redact('https://login.example/authorize?state=sensitive-fixture&code=sensitive-fixture').includes('sensitive-fixture'));
  assert.ok(!JSON.parse(redact({ url: 'https://login.example/authorize?state=sensitive-fixture' })).url.includes('sensitive-fixture'));
});
