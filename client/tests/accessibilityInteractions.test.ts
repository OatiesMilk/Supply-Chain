import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import GlobalSearch from '../src/components/GlobalSearch';
import NotificationBell from '../src/components/NotificationBell';
import CommentComposer from '../src/components/CommentComposer';
import { api, type ApiNotification } from '../src/api';

afterEach(() => mock.restoreAll());

async function withDom(run: (dom: JSDOM, root: import('react-dom/client').Root) => Promise<void>) {
  const dom = new JSDOM('<button id="trigger">Search</button><div id="root"></div><button id="after">After popup</button>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  // jsdom lacks the browser top layer. E2E tests verify native focus containment.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try { await run(dom, root); } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('search opens a named native dialog and restores trigger focus after Escape', async () => {
  await withDom(async (dom, root) => {
    const trigger = dom.window.document.getElementById('trigger')!;
    trigger.focus();
    let dismissed = false;
    const render = (isOpen: boolean) => root.render(React.createElement(GlobalSearch, {
      isOpen, onClose: () => { dismissed = true; render(false); }, deliveryRecords: [], products: [], onNavigate: () => {},
    }));
    await act(async () => render(true));
    const dialog = dom.window.document.querySelector('dialog')!;
    assert.equal(dialog.open, true);
    assert.equal(dom.window.document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent, 'Search records and products');
    assert.equal(dom.window.document.activeElement?.id, 'global-search-input');
    const input = dom.window.document.getElementById('global-search-input')!;
    const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close search"]')!;
    close.focus();
    const forwardTab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    await act(async () => { close.dispatchEvent(forwardTab); });
    assert.equal(forwardTab.defaultPrevented, true);
    assert.equal(dom.window.document.activeElement, input);
    const backwardTab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => { input.dispatchEvent(backwardTab); });
    assert.equal(backwardTab.defaultPrevented, true);
    assert.equal(dom.window.document.activeElement, close);
    await act(async () => { dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true })); });
    assert.equal(dismissed, true);
    assert.equal(dom.window.document.querySelector('dialog'), null);
    assert.equal(dom.window.document.activeElement, trigger);
  });
});

test('notifications have native linked actions, nonmodal focus exit and Escape return', async () => {
  await withDom(async (dom, root) => {
    mock.method(api, 'getNotifications', async () => [{ id: 'notice', title: 'Run ready', message: 'Open your delivery', is_read: false, record_id: 'REC-1', record_type: 'DeliveryRecord', created_at: new Date().toISOString() } as ApiNotification]);
    await act(async () => root.render(React.createElement(NotificationBell, { deliveryRecords: [], onNavigate: () => {} })));
    const trigger = dom.window.document.getElementById('notification-bell-button') as HTMLButtonElement;
    trigger.focus();
    await act(async () => trigger.click());
    const panel = dom.window.document.querySelector('[role="region"]')!;
    assert.equal(panel.getAttribute('aria-label'), 'Notifications');
    assert.equal(panel.hasAttribute('aria-modal'), false);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(dom.window.document.activeElement, panel);
    assert.ok(panel.querySelector('button[aria-label*="Open linked record"]'));
    await act(async () => panel.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(dom.window.document.querySelector('[role="region"]'), null);
    assert.equal(dom.window.document.activeElement, trigger);
    await act(async () => trigger.click());
    await act(async () => dom.window.document.getElementById('after')!.focus());
    assert.equal(dom.window.document.querySelector('[role="region"]'), null);
    assert.equal(dom.window.document.activeElement?.id, 'after');
  });
});

test('comment errors describe their field and empty keyboard submissions are ignored', async () => {
  await withDom(async (dom, root) => {
    let submissions = 0;
    await act(async () => root.render(React.createElement(CommentComposer, { id: 'comment', value: '', onChange: () => {}, onSubmit: () => { submissions++; }, submitting: false, error: 'Could not send. Try again.' })));
    const textarea = dom.window.document.querySelector('textarea')!;
    assert.equal(textarea.getAttribute('aria-invalid'), 'true');
    assert.ok(textarea.getAttribute('aria-describedby')?.split(' ').includes('comment-error'));
    assert.equal(dom.window.document.getElementById('comment-error')?.getAttribute('role'), 'alert');
    await act(async () => textarea.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })));
    assert.equal(submissions, 0);
    assert.equal(dom.window.document.querySelector<HTMLButtonElement>('button[aria-label="Send comment"]')!.disabled, true);
  });
});
