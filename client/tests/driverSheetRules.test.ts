import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmDisabled, remarksRequired } from '../src/features/dashboard/driverSheetRules';

test('start needs no note but complete still needs remarks', () => {
  assert.equal(remarksRequired('start'), false);
  assert.equal(remarksRequired('complete'), true);
  assert.equal(confirmDisabled('start', '', false, null), false);
  assert.equal(confirmDisabled('start', '   ', false, null), false);
  assert.equal(confirmDisabled('complete', '', false, null), true);
  assert.equal(confirmDisabled('complete', '   ', false, null), true);
  assert.equal(confirmDisabled('complete', 'Delivered', false, null), false);
});

test('saving and photo errors still disable Confirm for both actions', () => {
  for (const action of ['start', 'complete'] as const) {
    assert.equal(confirmDisabled(action, 'note', true, null), true);
    assert.equal(confirmDisabled(action, 'note', false, 'Upload a photo'), true);
  }
});
