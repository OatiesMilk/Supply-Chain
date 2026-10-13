import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSsoState, validateSsoState, stateDigest, isMicrosoftGuid,
  getMsalConfig, registerSsoState, consumeSsoState, SSO_STATE_MAX_AGE_MS
} from '../src/services/ssoState';

const TENANT = '7411f7e0-fb01-415c-8136-f9c30b06393f';

test('SSO state is unpredictable and matches only the initiating browser cookie', () => {
  const a = createSsoState(), b = createSsoState();
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, b);
  assert.equal(validateSsoState(a, a), true);
  for (const bad of [undefined, null, '', b, a.slice(0, 30), 'z'.repeat(64), [a]]) {
    assert.equal(validateSsoState(bad, a), false);
    assert.equal(validateSsoState(a, bad), false);
  }
  assert.equal(stateDigest(a).length, 64);
  assert.notEqual(stateDigest(a), a);
  assert.equal(SSO_STATE_MAX_AGE_MS, 5 * 60 * 1000);
});

test('SSO requires a specific tenant GUID, configured credentials, and a safe origin', () => {
  const valid: NodeJS.ProcessEnv = {
    AZURE_CLIENT_ID: 'client', AZURE_CLIENT_SECRET: 'secret', AZURE_TENANT_ID: TENANT,
    APP_URL: 'https://portal.example.com', NODE_ENV: 'production'
  };
  assert.deepEqual(getMsalConfig(valid), { clientId: 'client', clientSecret: 'secret', tenantId: TENANT, appUrl: 'https://portal.example.com' });
  for (const tid of [undefined, '', 'common', 'organizations', 'consumers', 'fake/tenant', 'example.com']) {
    assert.equal(getMsalConfig({ ...valid, AZURE_TENANT_ID: tid }), null);
  }
  for (const url of ['http://portal.example.com', 'https://user:pass@portal.example.com', 'https://portal.example.com/path', 'https://portal.example.com?foo=1']) {
    assert.equal(getMsalConfig({ ...valid, APP_URL: url }), null);
  }
  assert.equal(getMsalConfig({ ...valid, AZURE_CLIENT_SECRET: '' }), null);
  assert.ok(getMsalConfig({ ...valid, NODE_ENV: 'development', APP_URL: 'http://localhost:3000' }));
  assert.equal(isMicrosoftGuid('invalid'), false);
  assert.equal(isMicrosoftGuid(TENANT), true);
});

test('state registration stores only a digest and consume is atomic, single-use and expiring', async () => {
  const records = new Map<string, Date>();
  const db: any = {
    oAuthLoginState: {
      create: async ({ data }: any) => { records.set(data.id, data.expiresAt); return data; },
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (const [id, expiresAt] of records) {
          const byId = where.id === undefined || where.id === id;
          const byExpiry = (where.expiresAt.lte && expiresAt <= where.expiresAt.lte) ||
            (where.expiresAt.gt && expiresAt > where.expiresAt.gt);
          if (byId && byExpiry) { records.delete(id); count++; }
        }
        return { count };
      }
    }
  };
  const now = new Date('2026-10-13T04:00:00.000Z');
  const state = createSsoState();
  await registerSsoState(db, state, now);
  assert.equal(records.has(state), false, 'store only hashed random state');
  assert.equal(records.has(stateDigest(state)), true);
  assert.equal(await consumeSsoState(db, state, new Date(now.getTime() + 1000)), true);
  assert.equal(await consumeSsoState(db, state, new Date(now.getTime() + 1001)), false, 'replay must fail');
  await registerSsoState(db, state, now);
  assert.equal(await consumeSsoState(db, state, new Date(now.getTime() + SSO_STATE_MAX_AGE_MS)), false, 'expired state must fail');
  assert.equal(await consumeSsoState(db, createSsoState(), now), false, 'unknown state must fail');
  assert.equal(await consumeSsoState(db, 'invalid', now), false);
});
