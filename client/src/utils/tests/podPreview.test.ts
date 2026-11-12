import test from 'node:test';
import assert from 'node:assert/strict';
import { nextLightboxIndex, splitPodAttachments } from '../podPreview';

test('splitPodAttachments trusts the server is_photo flag instead of the file name or MIME type', () => {
  const verifiedPhoto = { id: 'photo', name: 'proof.pdf', mime_type: 'application/pdf', is_photo: true };
  const rejectedImage = { id: 'document', name: 'renamed.jpg', mime_type: 'image/jpeg', is_photo: false };

  assert.deepEqual(splitPodAttachments([verifiedPhoto, rejectedImage]), {
    photos: [verifiedPhoto],
    documents: [rejectedImage],
  });
});

test('nextLightboxIndex moves in either direction and wraps at both ends', () => {
  assert.equal(nextLightboxIndex(0, 1, 3), 1);
  assert.equal(nextLightboxIndex(2, 1, 3), 0);
  assert.equal(nextLightboxIndex(0, -1, 3), 2);
  assert.equal(nextLightboxIndex(2, -1, 3), 1);
  assert.equal(nextLightboxIndex(0, 1, 0), 0);
});
