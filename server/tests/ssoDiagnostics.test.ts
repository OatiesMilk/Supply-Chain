import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ssoFailureDetails } from '../src/services/ssoDiagnostics';
import { safeAccessLogUrl } from '../src/middleware/accessLog';

test('SSO diagnostics retain actionable machine codes without provider secrets', () => {
  const details = ssoFailureDetails('token_exchange', {
    errorCode: 'invalid_client',
    subError: 'consent_required',
    errorMessage: 'invalid_client: AADSTS7000215: secret=PRIVATE_SECRET code=PRIVATE_CODE email=private@example.com',
    stack: 'PRIVATE_STACK',
    accessToken: 'PRIVATE_TOKEN',
    claims: { email: 'private@example.com' },
  });
  assert.deepEqual(details, {
    stage: 'token_exchange', errorCode: 'invalid_client',
    subError: 'consent_required', aadstsCodes: ['AADSTS7000215'],
  });
  assert.doesNotMatch(JSON.stringify(details), /PRIVATE|private@example/);
});

test('unrecognized and malformed diagnostic fields are omitted', () => {
  for (const error of [null, undefined, 'PRIVATE_SECRET', new Error('PRIVATE_SECRET'), {
    errorCode: 'PRIVATE_SECRET', subError: 'PRIVATE_SECRET', code: 'P2002 PRIVATE_SECRET',
    errorMessage: 'AADSTS123 AADSTS123456789 AADSTS7000215PRIVATE_SECRET',
  }]) {
    assert.deepEqual(ssoFailureDetails('session', error), { stage: 'session' });
  }
  assert.deepEqual(ssoFailureDetails('account_lookup', { code: 'P2022', meta: { private: 'PRIVATE' } }), {
    stage: 'account_lookup', prismaCode: 'P2022',
  });
});

test('AADSTS extraction deduplicates and bounds the number of codes', () => {
  const details = ssoFailureDetails('token_exchange', {
    message: 'AADSTS7000215 AADSTS7000215 AADSTS10000 AADSTS10001 AADSTS10002 AADSTS10003 AADSTS10004',
  });
  assert.deepEqual(details.aadstsCodes, ['AADSTS7000215', 'AADSTS10000', 'AADSTS10001', 'AADSTS10002', 'AADSTS10003']);
});

test('access logger strips every callback query parameter including case and trailing slash variants', () => {
  for (const path of ['/api/v1/auth/microsoft/callback', '/API/AUTH/MICROSOFT/CALLBACK', '/api/v1/auth/microsoft/callback/']) {
    assert.equal(safeAccessLogUrl(path + '?code=PRIVATE_CODE&state=PRIVATE_STATE&client_info=PRIVATE_ACCOUNT&error_description=PRIVATE', false), path);
    assert.equal(safeAccessLogUrl(path, false), path);
  }
  assert.equal(safeAccessLogUrl('/api/v1/records?page=2', false), '/api/v1/records?page=2');
  assert.equal(safeAccessLogUrl('/api/v1/auth/microsoft/status', false), '/api/v1/auth/microsoft/status');
});

test('production access logging removes queries from all endpoints', () => {
  for (const path of ['/api/v1/records', '/api/v1/auth/microsoft/callback', '/api/v1/customers']) {
    assert.equal(safeAccessLogUrl(path + '?search=PRIVATE&code=PRIVATE_CODE&state=PRIVATE_STATE', true), path);
    assert.equal(safeAccessLogUrl(path, true), path);
  }
});
