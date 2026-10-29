import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { useServerAvailability } from '../src/hooks/useServerAvailability';
import { onlineManager } from '@tanstack/react-query';

test('reconnecting while an old failed health check is pending immediately probes the current connection', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const originals = Object.getOwnPropertyDescriptors(globalThis);
  const wasOnline = onlineManager.isOnline();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  let resolveOld: (response: Response) => void = () => {};
  let probes = 0;
  mock.method(globalThis, 'fetch', async () => {
    probes++;
    if (probes === 1) return new Promise<Response>(resolve => { resolveOld = resolve; });
    return Response.json({ ok: true });
  });
  function Probe() {
    return React.createElement('output', null, useServerAvailability().status);
  }
  let root: import('react-dom/client').Root | undefined;
  try {
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => { root!.render(React.createElement(Probe)); });
    assert.equal(probes, 1);
    onlineManager.setOnline(false);
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.Event('online'));
      resolveOld(Response.json({ ok: false }, { status: 503 }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(probes, 2, 'the online event must not be discarded by the older in-flight check');
    assert.equal(dom.window.document.querySelector('output')!.textContent, 'available');
    assert.equal(onlineManager.isOnline(), true, 'verified health resumes queries even when their provider missed the online event');
  } finally {
    await act(async () => root?.unmount());
    mock.restoreAll(); dom.window.close();
    onlineManager.setOnline(wasOnline);
    for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
