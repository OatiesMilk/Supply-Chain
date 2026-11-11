import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DriverQueueSwitch from '../src/features/dashboard/DriverQueueSwitch';

const render = (props: Partial<React.ComponentProps<typeof DriverQueueSwitch>>) =>
  renderToStaticMarkup(React.createElement(DriverQueueSwitch, { queue: 'active', onChange() {}, ...props }));

test('both queues sit side by side at every width', () => {
  const html = render({});
  assert.match(html, /class="grid grid-cols-2 /);
  assert.doesNotMatch(html, /grid-cols-1/);
  assert.equal((html.match(/min-h-11/g) ?? []).length, 2);
});

test('short labels with counts when the overview has loaded', () => {
  const html = render({ counts: { active: 7, done: 2 }, controls: 'driver-run-list' });
  assert.match(html, /Active<span[^>]*>\(7\)<\/span>/);
  assert.match(html, /Done today<span[^>]*>\(2\)<\/span>/);
  assert.match(html, /aria-controls="driver-run-list"/);
  assert.doesNotMatch(html, /Completed today \/ RMA awaiting receipt/);
});

test('no numbers while counts load', () => {
  assert.doesNotMatch(render({}).replace(/<[^>]+>/g, ''), /\d/);
});

test('selected queue is pressed and the Done tab explains RMA items', () => {
  const active = render({ queue: 'active' });
  assert.match(active, /aria-pressed="true"[^>]*>Active/);
  assert.doesNotMatch(active, /data-queue-hint/);
  const done = render({ queue: 'completed' });
  assert.match(done, /aria-pressed="true"[^>]*>Done today/);
  assert.match(done, /Includes RMA items waiting for TASS receipt\./);
});
