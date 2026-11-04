import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { apiUrl, fetchProtectedAttachment } from '../src/api';
import { installLegacySession } from './helpers/permissionSession';
import { useAuthStore } from '../src/store/authStore';

afterEach(() => { mock.restoreAll(); useAuthStore.getState().setAuthUser(null); });

test('API URLs use v1 and protected attachment URLs retain their record path and query', async () => {
  assert.equal(apiUrl('/auth/me'), '/api/v1/auth/me');
  installLegacySession('ADMIN', 'deliveries');
  const fetch = mock.method(globalThis, 'fetch', async () => new Response('preview'));
  const response = await fetchProtectedAttachment('/api/v1/records/record-1/attachments/file-1/preview?inline=1');
  assert.equal(await response.text(), 'preview');
  assert.equal(fetch.mock.calls[0].arguments[0], '/api/v1/records/record-1/attachments/file-1/preview?inline=1');
  await assert.rejects(fetchProtectedAttachment('/api/records/record-1/attachments/file-1/preview'), /not available/);
  await assert.rejects(fetchProtectedAttachment('/api/v10/records/record-1/attachments/file-1/preview'), /not available/);
  assert.equal(fetch.mock.callCount(), 1);
});
