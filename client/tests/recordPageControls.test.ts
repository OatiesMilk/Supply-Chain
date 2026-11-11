import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RecordPageControls from '../src/components/RecordPageControls';

const render = (props: Partial<React.ComponentProps<typeof RecordPageControls>>) =>
  renderToStaticMarkup(React.createElement(RecordPageControls, { page: 1, total: 7, onPageChange() {}, ...props }));

test('collapsed single page shows only the record count', () => {
  const html = render({ collapseSinglePage: true });
  assert.match(html, /Showing/);
  assert.match(html, /1–7/);
  assert.doesNotMatch(html, /Previous page|Pagination Navigation/);
});

test('collapsed controls still show page buttons when there is more than one page', () => {
  const html = render({ total: 60, collapseSinglePage: true });
  assert.match(html, /Pagination Navigation/);
  assert.match(html, /Previous page/);
});

test('collapsed controls render nothing for an empty queue', () => {
  assert.equal(render({ total: 0, collapseSinglePage: true }), '');
});

test('default controls are unchanged for other screens', () => {
  const html = render({});
  assert.match(html, /Pagination Navigation/);
});
