import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionError, deliveryPhotoError, hasSavedPodPhoto, type PodReadiness } from '../podRequirement';
import { validatePodAttachments } from '../attachmentValidation';
import type { DeliveryCategory, DeliveryStatus } from '../../types';

const ready = (overrides: Partial<PodReadiness> = {}): PodReadiness => ({
  loading: false, uploading: false, hasPhoto: true, loadFailed: false, hasStagedFiles: false, ...overrides,
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

test('other run categories require a saved photo for completion, while side states do not', () => {
  for (const category of ['Accounting Collection', 'Procurement Pick-up', 'Sales Orders'] as DeliveryCategory[]) {
    assert.ok(deliveryPhotoError(category, 'Delivered'));
    assert.equal(deliveryPhotoError(category, 'Delivered', ready()), null);
  }
  for (const status of ['Draft', 'Scheduled', 'In Transit', 'Pending', 'Rescheduled', 'On-Hold'] as DeliveryStatus[]) {
    assert.equal(deliveryPhotoError('Deliveries', status), null);
  }
});

test('RMA completion requires a recipient but no Time In or attachment readiness', () => {
  const rma = { category: 'RMA' as DeliveryCategory, time_in: null };
  for (const recipient of [null, undefined, '', '  ']) {
    assert.match(completionError(rma, 'Delivered', recipient)!, /Recipient \/ Collector/);
  }
  assert.equal(completionError(rma, 'Delivered', 'Collector'), null);
  assert.equal(completionError(rma, 'Delivered', 'Collector', ready({ hasPhoto: false, loadFailed: true, loading: true, uploading: true })), null);
  assert.equal(deliveryPhotoError('RMA', 'Delivered'), null);
});

test('completion needs Time In and a nonblank receiver even with verified photos', () => {
  const record = { category: 'Deliveries' as DeliveryCategory, time_in: null as string | null };
  assert.match(completionError(record, 'Delivered', 'Receiver', ready())!, /Time In/);
  record.time_in = '2026-10-06T01:00:00.000Z';
  for (const receiver of [null, undefined, '', '   ', '\t']) {
    assert.match(completionError(record, 'Delivered', receiver, ready())!, /Received By/);
  }
  assert.match(completionError(record, 'Delivered', 'Receiver', ready({ hasPhoto: false }))!, /JPG or PNG/);
  assert.equal(completionError(record, 'Delivered', ' Receiver ', ready()), null);
  assert.equal(completionError(record, 'Pending', '', ready({ hasPhoto: false })), null);
});

test('previewable supporting documents remain valid while count, format and size limits apply', () => {
  assert.equal(validatePodAttachments([{ name: 'signed.pdf', size: 100 }, { name: 'Letter.DOCX', size: 100 }, { name: 'Totals.XLSX', size: 100 }, { name: 'photo.JPG', size: 100 }]), null);
  assert.match(validatePodAttachments([{ name: 'legacy.doc', size: 100 }])!, /Use JPG, PNG, PDF, DOCX or XLSX/);
  assert.match(validatePodAttachments([{ name: 'photo.jpg', size: 10 * 1024 * 1024 + 1 }])!, /^photo\.jpg is 10\.0 MB — maximum is 10 MB\.$/);
  assert.equal(
    validatePodAttachments([{ name: 'invoice.exe', size: 100 }]),
    'invoice.exe — file type not allowed. Use JPG, PNG, PDF, DOCX or XLSX.'
  );
  assert.equal(
    validatePodAttachments(Array.from({ length: 11 }, (_, index) => ({ name: `file-${index + 1}.pdf`, size: 100 }))),
    '11 files selected — maximum is 10 files at a time.'
  );
});
