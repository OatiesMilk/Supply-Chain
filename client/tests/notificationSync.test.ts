import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, type ApiNotification } from '../src/api';

test('notification sync failures retain saved entries and a failed read acknowledgment is rolled back', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true });
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let root: import('react-dom/client').Root | undefined;
  const notification: ApiNotification = {
    id: 'notice', title: 'RMA ready for assignment', message: 'RMA-255 requires a driver.',
    record_id: null, record_type: null, is_read: false, created_at: '2026-10-28T01:00:00Z',
  };
  client.setQueryData(['notifications'], [notification]);
  const read = mock.method(api, 'getNotifications', async (): Promise<ApiNotification[]> => { throw new Error('Offline'); });
  mock.method(api, 'markNotificationRead', async () => { throw new Error('Save refused'); });
  try {
    // Floating UI inspects globals on import, so load NotificationBell after JSDOM is installed.
    const { default: NotificationBell } = await import('../src/components/NotificationBell');
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => {
      root!.render(React.createElement(QueryClientProvider, { client }, React.createElement(NotificationBell, { onNavigate: () => {}, deliveryRecords: [] })));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => {
      dom.window.document.getElementById('notification-bell-button')!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.match(dom.window.document.body.textContent!, /RMA ready for assignment/);
    assert.match(dom.window.document.body.textContent!, /Notifications could not sync/);
    assert.equal(client.getQueryData<ApiNotification[]>(['notifications'])![0].is_read, false);
    read.mock.mockImplementation(async () => [notification]);
    const retry = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === 'Retry notifications')!;
    await act(async () => { retry.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => {
      dom.window.document.querySelector<HTMLButtonElement>('button[title="Mark as read"]')!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(client.getQueryData<ApiNotification[]>(['notifications'])![0].is_read, false, 'refused save cannot pretend the notification was read');
    assert.match(dom.window.document.body.textContent!, /Could not mark the notification as read/);
    assert.match(dom.window.document.body.textContent!, /Showing 1 notification/);
  } finally {
    await act(async () => { root?.unmount(); });
    client.clear(); mock.restoreAll(); dom.window.close();
    for (const name of Object.keys(globals)) {
      if (original[name]) Object.defineProperty(globalThis, name, original[name]);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('notification dropdown displays a scroll cue when notifications overflow the visible list and clears it at the bottom', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => { callback(); return 0; },
    cancelAnimationFrame: () => {},
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true });
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let root: import('react-dom/client').Root | undefined;
  const items: ApiNotification[] = Array.from({ length: 10 }, (_, idx) => ({
    id: `n-${idx}`,
    title: `Notification ${idx + 1}`,
    message: `Message body ${idx + 1}`,
    record_id: null,
    record_type: null,
    is_read: true,
    created_at: '2026-11-23T01:00:00Z',
  }));
  client.setQueryData(['notifications'], items);
  mock.method(api, 'getNotifications', async () => items);
  try {
    const { default: NotificationBell } = await import('../src/components/NotificationBell');
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => {
      root!.render(React.createElement(QueryClientProvider, { client }, React.createElement(NotificationBell, { onNavigate: () => {}, deliveryRecords: [] })));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => {
      dom.window.document.getElementById('notification-bell-button')!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const list = dom.window.document.querySelector<HTMLElement>('.notification-scroll')!;
    assert.ok(list);
    Object.defineProperty(list, 'scrollHeight', { value: 950, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 380, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 0, writable: true, configurable: true });

    await act(async () => {
      list.dispatchEvent(new dom.window.Event('scroll'));
    });
    assert.match(dom.window.document.body.textContent!, /Showing last 10 notifications · Scroll for more/);

    list.scrollTop = 570;
    await act(async () => {
      list.dispatchEvent(new dom.window.Event('scroll'));
    });
    assert.match(dom.window.document.body.textContent!, /Showing last 10 notifications/);
    assert.doesNotMatch(dom.window.document.body.textContent!, /Scroll for more/);
  } finally {
    await act(async () => { root?.unmount(); });
    client.clear(); mock.restoreAll(); dom.window.close();
    for (const name of Object.keys(globals)) {
      if (original[name]) Object.defineProperty(globalThis, name, original[name]);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
