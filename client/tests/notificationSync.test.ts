import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, type ApiNotification } from '../src/api';
import NotificationBell from '../src/components/NotificationBell';

test('notification sync failures retain saved entries and a failed read acknowledgment is rolled back', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
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
  } finally {
    await act(async () => { root?.unmount(); });
    client.clear(); mock.restoreAll(); dom.window.close();
    for (const name of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (original[name]) Object.defineProperty(globalThis, name, original[name]);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
