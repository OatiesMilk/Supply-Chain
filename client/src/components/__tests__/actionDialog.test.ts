import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { ActionDialog } from '../ActionDialog';

async function withDialog(run: (dom: JSDOM, render: (props?: Partial<React.ComponentProps<typeof ActionDialog>>) => Promise<HTMLDialogElement>) => Promise<void>) {
  const dom = new JSDOM('<button id="outside">Outside</button><div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  // JSDOM has no layout/top layer. Browser tests cover native inertness and restoration.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const render = async (props: Partial<React.ComponentProps<typeof ActionDialog>> = {}) => {
    await act(async () => root.render(React.createElement(ActionDialog, {
      open: true, title: 'Confirm change', description: 'Example change', onConfirm: () => {}, onDismiss: () => {}, ...props,
    })));
    const dialog = dom.window.document.querySelector('dialog')!;
    // Only the visible controls get layout rectangles. Other nodes retain JSDOM's empty rectangles.
    for (const control of dialog.querySelectorAll<HTMLElement>('[data-visible], button')) {
      Object.defineProperty(control, 'getClientRects', { configurable: true, value: () => [{ width: 100, height: 44 }] });
    }
    return dialog;
  };
  try { await run(dom, render); } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const key of Object.keys(globals)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
  }
}

async function tab(dom: JSDOM, target: HTMLElement, shiftKey = false) {
  target.focus();
  const event = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  await act(async () => { target.dispatchEvent(event); });
  return event;
}

test('Tab and Shift+Tab wrap at visible enabled boundaries without changing interior navigation', async () => {
  await withDialog(async (dom, render) => {
    const dialog = await render({ children: React.createElement('textarea', { 'data-visible': true, 'aria-label': 'Remarks' }) });
    const input = dialog.querySelector('textarea')!;
    const [cancel, confirm] = dialog.querySelectorAll('button');
    const forward = await tab(dom, confirm);
    assert.equal(forward.defaultPrevented, true);
    assert.equal(dom.window.document.activeElement, input);
    const backward = await tab(dom, input, true);
    assert.equal(backward.defaultPrevented, true);
    assert.equal(dom.window.document.activeElement, confirm);
    assert.equal((await tab(dom, cancel)).defaultPrevented, false);
    assert.equal((await tab(dom, cancel, true)).defaultPrevented, false);
  });
});

test('disabled confirmation, hidden, inert, negative-tabindex and disabled-fieldset controls are skipped', async () => {
  await withDialog(async (dom, render) => {
    const children = React.createElement(React.Fragment, null,
      React.createElement('input', { 'data-visible': true, 'aria-label': 'First' }),
      React.createElement('input', { 'aria-label': 'No layout' }),
      React.createElement('input', { 'data-visible': true, hidden: true }),
      React.createElement('input', { 'data-visible': true, style: { visibility: 'hidden' } }),
      React.createElement('div', { inert: true }, React.createElement('input', { 'data-visible': true })),
      React.createElement('fieldset', { disabled: true }, React.createElement('input', { 'data-visible': true })),
      React.createElement('input', { 'data-visible': true, tabIndex: -1 }),
    );
    const dialog = await render({ confirmDisabled: true, children });
    const input = dialog.querySelector('input')!;
    const cancel = dialog.querySelector('button')!;
    await tab(dom, input, true);
    assert.equal(dom.window.document.activeElement, cancel);
    await tab(dom, cancel);
    assert.equal(dom.window.document.activeElement, input);
  });
});

test('pending controls fall back to the dialog in both directions and cannot dismiss until settled', async () => {
  await withDialog(async (dom, render) => {
    let dismissed = 0;
    const onDismiss = () => { dismissed++; };
    const dialog = await render({ dismissOnBackdrop: true, onDismiss });
    dialog.querySelectorAll('button')[1].focus();
    await render({ pending: true, dismissOnBackdrop: true, onDismiss });
    assert.equal(dom.window.document.activeElement, dialog, 'Disabling the focused action keeps keyboard events inside the modal');
    for (const shiftKey of [false, true]) {
      const event = await tab(dom, dialog, shiftKey);
      assert.equal(event.defaultPrevented, true);
      assert.equal(dom.window.document.activeElement, dialog);
    }
    await act(async () => {
      dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
      dialog.click();
    });
    assert.equal(dismissed, 0);
    await render({ pending: false, dismissOnBackdrop: true, onDismiss });
    await tab(dom, dialog);
    assert.equal(dom.window.document.activeElement, dialog.querySelector('button'));
    await act(async () => { dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true })); });
    assert.equal(dismissed, 1);
  });
});

test('single close-only dialog wraps both directions to its enabled action', async () => {
  await withDialog(async (dom, render) => {
    const dialog = await render({ onConfirm: undefined });
    const close = dialog.querySelector('button')!;
    assert.equal(close.textContent, 'Close');
    for (const shiftKey of [false, true]) {
      assert.equal((await tab(dom, close, shiftKey)).defaultPrevented, true);
      assert.equal(dom.window.document.activeElement, close);
    }
  });
});
