import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiRecord } from '../src/api/queries/useRecordsQuery';

test('accomplished status and configuration never imply successful email delivery', () => {
  for (const value of [undefined, false, 'true', 1]) {
    const record = normalizeApiRecord({ id: 'record', status: 'Delivered', email_notification_sent: value });
    assert.equal(record.email_notification_sent, false);
  }
  assert.equal(normalizeApiRecord({ id: 'record', status: 'Delivered', email_notification_sent: true }).email_notification_sent, true);
});
