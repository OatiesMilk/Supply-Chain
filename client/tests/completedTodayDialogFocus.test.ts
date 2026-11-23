import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

test('closing the Completed today dialog returns focus to the tile that opened it', async () => {
  const descriptors = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const globals: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const { default: CompletedTodayDialog } = await import('../src/features/dashboard/CompletedTodayDialog');
    const root = createRoot(dom.window.document.getElementById('root')!);
    let setOpen: (open: boolean) => void = () => {};
    function Host() {
      const [open, set] = React.useState(false);
      setOpen = set;
      return React.createElement(QueryClientProvider, { client },
        React.createElement('button', { id: 'tile', type: 'button' }, 'Completed today'),
        open && React.createElement(CompletedTodayDialog, { canAccess: () => true, onClose: () => set(false), onOpenRecord: () => {} }));
    }
    await act(async () => { root.render(React.createElement(Host)); });
    const tile = dom.window.document.getElementById('tile') as HTMLButtonElement;
    tile.focus();
    assert.equal(dom.window.document.activeElement, tile);
    await act(async () => { setOpen(true); });
    assert.ok(dom.window.document.querySelector('dialog')?.open, 'dialog is open');
    // A modal moves focus away from the tile; simulate that before closing.
    (dom.window.document.querySelector('dialog button') as HTMLButtonElement).focus();
    assert.notEqual(dom.window.document.activeElement, tile);
    await act(async () => { setOpen(false); });
    assert.equal(dom.window.document.querySelector('dialog'), null);
    assert.equal(dom.window.document.activeElement, tile, 'focus returns to the opener');
    await act(async () => { root.unmount(); });
  } finally {
    client.clear();
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (descriptors[key]) Object.defineProperty(globalThis, key, descriptors[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
