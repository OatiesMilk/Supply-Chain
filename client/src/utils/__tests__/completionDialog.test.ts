import test from 'node:test';
import assert from 'node:assert/strict';
import { RECEIVED_BY_MAX, completionLabels, completionNeeds, nextStepForRun, recordingForLine, stillNeededLine, UNSAVED_HINT } from '../completionDialog';

const ready = { hasPhoto: true, loading: false, uploading: false, loadFailed: false, receivedBy: 'Guard', remarks: 'Done' };

test('button and message wording differs only for Accounting Collection', () => {
  assert.equal(completionLabels('Deliveries').button, 'Mark as delivered');
  for (const category of ['Sales Orders', 'Procurement Pick-up', 'RMA']) assert.equal(completionLabels(category).success, 'Marked as delivered');
  assert.equal(completionLabels('Accounting Collection').button, 'Mark as collected');
  assert.equal(completionLabels('Accounting Collection').success, 'Marked as collected');
});

test('Still needed lists every missing item and is empty when ready', () => {
  assert.deepEqual(completionNeeds(ready), []);
  assert.equal(stillNeededLine([]), 'Everything is ready.');
  const missing = completionNeeds({ ...ready, hasPhoto: false, receivedBy: ' ', remarks: '' });
  assert.deepEqual(missing, ['proof photo', 'Received by', 'remarks']);
  assert.equal(stillNeededLine(missing), 'Still needed: proof photo, Received by, remarks');
});

test('Received by is limited to 120 characters and photo states are explained', () => {
  assert.deepEqual(completionNeeds({ ...ready, receivedBy: 'x'.repeat(RECEIVED_BY_MAX) }), []);
  assert.match(completionNeeds({ ...ready, receivedBy: 'x'.repeat(RECEIVED_BY_MAX + 1) })[0], /120/);
  assert.deepEqual(completionNeeds({ ...ready, uploading: true, hasPhoto: false }), ['upload in progress']);
  assert.match(completionNeeds({ ...ready, loadFailed: true, hasPhoto: false })[0], /retry/);
  assert.deepEqual(completionNeeds({ ...ready, loading: true, hasPhoto: false }), ['photo check']);
});

test('recording-for line names the driver, with a fallback', () => {
  assert.equal(recordingForLine('Juan Driver'), 'Recording for Juan Driver. This is saved under your name.');
  assert.equal(recordingForLine(' '), 'Recording for the assigned driver. This is saved under your name.');
});

const run = (overrides: Record<string, unknown> = {}) => ({ status: 'In Transit', is_draft: 'No', driver: 'Juan Driver', time_in: '2026-11-13T01:42:00.000Z', time_out: null, received_by: null, allowed_statuses: ['Pending', 'On-Hold', 'Delivered'], ...overrides }) as any;
const can = { canStart: true, canComplete: true, dirty: false };

test('next step follows the run: assign, start, complete, done', () => {
  assert.equal(nextStepForRun(run({ status: 'Draft' }), can), null);
  assert.equal(nextStepForRun(run({ is_draft: 'Yes' }), can), null);
  const assign = nextStepForRun(run({ status: 'Scheduled', time_in: null, driver: '' }), can)!;
  assert.equal(assign.kind, 'assign'); assert.equal(assign.action, undefined);
  assert.match(assign.text, /Assign a driver below/);
  const start = nextStepForRun(run({ status: 'Scheduled', time_in: null }), can)!;
  assert.equal(start.action, 'start'); assert.equal(start.disabled, undefined);
  for (const status of ['In Transit', 'Pending', 'On-Hold']) assert.equal(nextStepForRun(run({ status }), can)!.action, 'complete', status);
  const done = nextStepForRun(run({ status: 'Delivered', received_by: 'Guard', time_out: '2026-11-13T03:00:00.000Z' }), can)!;
  assert.equal(done.kind, 'done'); assert.equal(done.action, undefined); assert.match(done.text, /Received by Guard\./);
});

test('a finished collection reads Collected', () => {
  const done = nextStepForRun(run({ status: 'Delivered', received_by: 'Guard', time_out: '2026-11-13T03:00:00.000Z' }), { ...can, collection: true })!;
  assert.match(done.text, /^Collected .*Received by Guard\./);
});

test('next step respects permissions, Delivered eligibility and unsaved edits', () => {
  assert.equal(nextStepForRun(run({ status: 'Scheduled', time_in: null }), { ...can, canStart: false }), null);
  assert.equal(nextStepForRun(run(), { ...can, canComplete: false }), null);
  assert.equal(nextStepForRun(run({ allowed_statuses: ['Pending'] }), can), null, 'Delivered not allowed');
  assert.equal(nextStepForRun(run({ status: 'Scheduled', time_in: null }), { ...can, canComplete: false })!.action, 'start');
  for (const record of [run(), run({ status: 'Scheduled', time_in: null })]) {
    const blocked = nextStepForRun(record, { ...can, dirty: true })!;
    assert.equal(blocked.disabled, true); assert.equal(blocked.hint, UNSAVED_HINT);
  }
});
