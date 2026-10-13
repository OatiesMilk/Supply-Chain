import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvedMicrosoftUser } from '../src/services/ssoIdentity';

const TENANT = '7411f7e0-fb01-415c-8136-f9c30b06393f';
const OID = 'ce7af71e-cdd0-4be6-93a9-ec280e1c10df';
const user = { id: 'existing-1', role: 'LOGISTICS', email: 'assigned@example.com', isActive: true, microsoftOid: OID };
const claims = { tid: TENANT, oid: OID, preferred_username: user.email };

test('only an active, Admin-prelinked Microsoft OID in the required tenant is accepted', async () => {
  const lookups: unknown[] = [];
  let linked: any = user;
  const db: any = { user: { findUnique: async (query: unknown) => { lookups.push(query); return linked; } } };
  assert.deepEqual(await approvedMicrosoftUser(db, claims, TENANT), { user });
  assert.deepEqual(lookups, [{ where: { microsoftOid: OID } }], 'never look up by email to adopt a password account');

  linked = null;
  assert.deepEqual(await approvedMicrosoftUser(db, claims, TENANT), { error: 'sso_not_approved' });
  linked = { ...user, isActive: false };
  assert.deepEqual(await approvedMicrosoftUser(db, claims, TENANT), { error: 'account_deactivated' });

  linked = user;
  let count = lookups.length;
  for (const bad of [
    { ...claims, tid: 'ca9385f9-71f5-4225-9105-4704be63c07b' },
    { ...claims, tid: 'common' },
    { ...claims, oid: undefined },
    { ...claims, oid: 'bad' },
    { ...claims, tid: undefined },
  ]) {
    assert.deepEqual(await approvedMicrosoftUser(db, bad, TENANT), { error: 'sso_invalid_identity' });
  }
  assert.equal(lookups.length, count, 'invalid claims must be rejected before database lookups');

  assert.deepEqual(await approvedMicrosoftUser(db, { ...claims, email: 'attacker@example.com' }, TENANT), { error: 'sso_identity_mismatch' });
  assert.deepEqual(await approvedMicrosoftUser(db, { ...claims, preferred_username: 'attacker@example.com', email: undefined }, TENANT), { error: 'sso_identity_mismatch' });
  assert.deepEqual(await approvedMicrosoftUser(db, { ...claims, email: undefined, preferred_username: undefined }, TENANT), { user });
});
