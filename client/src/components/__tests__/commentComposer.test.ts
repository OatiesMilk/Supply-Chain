import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composerTextareaSize } from '../CommentComposer';

// One text line (24px + 12px padding) matches the 36px Send button, so they line up.
test('a single line is as tall as the Send button', () => {
  assert.deepEqual(composerTextareaSize(0), { height: 36, overflowY: 'hidden' });
  assert.deepEqual(composerTextareaSize(36), { height: 36, overflowY: 'hidden' });
});

test('the textarea grows with its text up to six lines, then scrolls', () => {
  assert.deepEqual(composerTextareaSize(84), { height: 84, overflowY: 'hidden' });
  assert.deepEqual(composerTextareaSize(156), { height: 156, overflowY: 'hidden' });
  assert.deepEqual(composerTextareaSize(400), { height: 156, overflowY: 'auto' });
});
