import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import WorkspaceTabs, { tabFocusTarget } from '../src/features/deliveries/WorkspaceTabs';

test('manual tabs wrap arrow navigation and support Home/End without activating on unrelated keys', () => {
  assert.equal(tabFocusTarget('ArrowLeft', 0, 6), 5);
  assert.equal(tabFocusTarget('ArrowRight', 5, 6), 0);
  assert.equal(tabFocusTarget('ArrowRight', 1, 6), 2);
  assert.equal(tabFocusTarget('Home', 4, 6), 0);
  assert.equal(tabFocusTarget('End', 2, 6), 5);
  for (const key of ['Enter', ' ', 'Tab', 'ArrowDown']) {
    assert.equal(tabFocusTarget(key, 2, 6), null);
  }
  assert.equal(tabFocusTarget('Home', 0, 0), null);
});

test('tabs expose linked accessible panels, one keyboard entry, and lazy initial contents', () => {
  const rendered: string[] = [];
  const html = renderToString(React.createElement(WorkspaceTabs, {
    id: 'record-45',
    tabs: [
      { id: 'general', label: 'Overview', icon: null },
      { id: 'actions', label: 'Dispatch & Logistics', icon: null },
      { id: 'audit', label: 'Audit Trail', icon: null },
    ],
    renderPanel: id => { rendered.push(id); return React.createElement('p', null, `Content: ${id}`); },
  }));
  assert.deepEqual(rendered, ['general']);
  assert.match(html, /role="tablist" aria-label="Delivery record sections"/);
  assert.match(html, /id="record-45-tab-general"[^>]*role="tab"[^>]*aria-selected="true"[^>]*aria-controls="record-45-panel-general"[^>]*tabindex="0"/);
  for (const id of ['actions', 'audit']) {
    assert.match(html, new RegExp(`id="record-45-tab-${id}"[^>]*aria-selected="false"[^>]*tabindex="-1"`));
    assert.match(html, new RegExp(`id="record-45-panel-${id}"[^>]*role="tabpanel"[^>]*aria-labelledby="record-45-tab-${id}"[^>]*hidden=""`));
  }
  assert.match(html, /id="record-45-panel-general"[^>]*role="tabpanel"[^>]*aria-labelledby="record-45-tab-general"[^>]*tabindex="0"/);
});
