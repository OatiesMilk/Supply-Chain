import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveryPhotoError, hasSavedPodPhoto, type PodReadiness } from '../podRequirement';
import { validatePodAttachments } from '../attachmentValidation';
import type { DeliveryCategory, DeliveryStatus } from '../../types';

const ready = (overrides: Partial<PodReadiness> = {}): PodReadiness => ({
  loading: false, uploading: false, hasPhoto: true, loadFailed: false, ...overrides,
});

test('delivery completion requires a server-validated saved photo, not a name or MIME claim', () => {
  const documents = [
    { id: 'pdf', name: 'signed.pdf', is_photo: false },
    { id: 'doc', name: 'signed.doc', is_photo: false },
    { id: 'fake', name: 'delivery.jpg', mime_type: 'image/jpeg', is_photo: false },
    { id: 'legacy', name: 'delivery.png', mime_type: 'image/png' },
  ];
  assert.equal(hasSavedPodPhoto(documents), false);
  assert.match(deliveryPhotoError('Deliveries', 'Delivered', ready({ hasPhoto: hasSavedPodPhoto(documents) }))!, /JPG or PNG/);
  assert.equal(hasSavedPodPhoto([{ id: '', is_photo: true }]), false);
  assert.equal(hasSavedPodPhoto([...documents, { id: 'saved-jpeg', is_photo: true }]), true);
  assert.equal(deliveryPhotoError('Deliveries', 'Delivered', ready()), null);
});

test('loading, failed reads and pending uploads block completion even with a cached photo', () => {
  assert.match(deliveryPhotoError('Deliveries', 'Delivered')!, /Checking/);
  assert.match(deliveryPhotoError('Deliveries', 'Delivered', ready({ loading: true }))!, /Checking/);
  assert.match(deliveryPhotoError('Deliveries', 'Delivered', ready({ uploading: true }))!, /Wait/);
  assert.match(deliveryPhotoError('Deliveries', 'Delivered', ready({ loadFailed: true }))!, /Retry/);
});

test('an upload only unlocks completion after the saved attachment has been confirmed', () => {
  const state = ready({ hasPhoto: false });
  assert.ok(deliveryPhotoError('Deliveries', 'Delivered', state));
  state.uploading = true;
  assert.ok(deliveryPhotoError('Deliveries', 'Delivered', state));
  state.hasPhoto = hasSavedPodPhoto([{ id: 'photo', is_photo: true }]);
  assert.ok(deliveryPhotoError('Deliveries', 'Delivered', state), 'batch still uploading');
  state.uploading = false;
  state.loading = true;
  assert.ok(deliveryPhotoError('Deliveries', 'Delivered', state), 'refresh still loading');
  state.loading = false;
  assert.equal(deliveryPhotoError('Deliveries', 'Delivered', state), null);
  state.hasPhoto = false;
  assert.ok(deliveryPhotoError('Deliveries', 'Delivered', state), 'removing the photo blocks again');
});

test('failed upload with no saved photo stays blocked; retry can recover', () => {
  const state = ready({ hasPhoto: false, uploading: true });
  state.uploading = false;
  assert.match(deliveryPhotoError('Deliveries', 'Delivered', state)!, /Upload at least one/);
  state.hasPhoto = true;
  state.loadFailed = true;
  assert.ok(deliveryPhotoError('Deliveries', 'Delivered', state));
  state.loadFailed = false;
  assert.equal(deliveryPhotoError('Deliveries', 'Delivered', state), null);
});

test('other categories and noncompletion delivery statuses do not require a photo', () => {
  for (const category of ['RMA', 'Accounting Collection', 'Procurement Pick-up', 'Sales Orders'] as DeliveryCategory[]) {
    assert.equal(deliveryPhotoError(category, 'Delivered'), null);
  }
  for (const status of ['Scheduled', 'Pending', 'Rescheduled', 'On-Hold'] as DeliveryStatus[]) {
    assert.equal(deliveryPhotoError('Deliveries', status), null);
  }
});

test('supporting documents remain valid uploads while format and size limits still apply', () => {
  assert.equal(validatePodAttachments([{ name: 'signed.pdf', size: 100 }, { name: 'form.doc', size: 100 }, { name: 'photo.JPG', size: 100 }]), null);
  assert.match(validatePodAttachments([{ name: 'photo.jpg', size: 10 * 1024 * 1024 + 1 }])!, /too large/);
  assert.match(validatePodAttachments([{ name: 'photo.svg', size: 100 }])!, /not supported/);
});
