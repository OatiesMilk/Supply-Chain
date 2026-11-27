import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, type ApiNotification } from '../src/api';
import { installLegacySession } from './helpers/permissionSession';
import type { DeliveryRecord } from '../src/types';

async function withBrowserDom(run: (dom: JSDOM) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Document: dom.window.Document,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  try {
    await run(dom);
  } finally {
    mock.restoreAll();
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('Navbar screenTitleFor maps known keys to sentence-case titles and formats unknown keys', async () => {
  await withBrowserDom(async () => {
    const { screenTitleFor } = await import('../src/layouts/Navbar');
    assert.equal(screenTitleFor('dashboard'), 'Dashboard');
    assert.equal(screenTitleFor('am_directory'), 'Account Manager Directory');
    assert.equal(screenTitleFor('driver_board'), 'Drivers · Board');
    assert.equal(screenTitleFor('driver_manager'), 'Drivers · Manager');
    assert.equal(screenTitleFor('inventory'), 'SKU Master');
    assert.equal(screenTitleFor('statistical_reports'), 'Statistical Reports');
    assert.equal(screenTitleFor('custom_screen_key'), 'Custom Screen Key');
  });
});

test('DeliveryRecordsView removes duplicate status select, uses dynamic category print title, and renders keyboard-focusable row buttons', async () => {
  await withBrowserDom(async dom => {
    installLegacySession('LOGISTICS', 'deliveries');
    const sample: DeliveryRecord = {
      id: 'rec-1',
      record_no: 'DEL-001',
      category: 'Deliveries',
      company_id: 'co-1',
      company_name: 'Acme Logistics PH',
      reference: 'SAP-100',
      delivery_date: '2026-11-23',
      driver: 'Alex',
      driver_assistants: [],
      status: 'Scheduled',
      priority: '2 - Moderate',
      area: 'Makati CBD',
      account_manager: 'Casey',
      vehicle: 'Van',
      item_type: 'Small Item',
      remarks: '',
      is_draft: 'No',
    } as DeliveryRecord;

    mock.method(api, 'getRecordFilterOptions', async () => ({ accountManagers: ['Casey'], drivers: ['Alex'], areas: ['Makati CBD'] }));
    mock.method(api, 'getPagedRecords', async () => ({ rows: [sample], total: 1, page: 1, limit: 25, nextCursor: null, hasMore: false }));
    mock.method(api, 'getStatusHistoryCounts', async () => ({} as any));
    mock.method(api, 'getRecord', async () => sample);

    const { default: DeliveryRecordsView } = await import('../src/features/deliveries/DeliveryRecordsView');
    const { createRoot } = await import('react-dom/client');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const root = createRoot(dom.window.document.getElementById('root')!);
    try {
      await act(async () => {
        root.render(React.createElement(QueryClientProvider, { client }, React.createElement(DeliveryRecordsView, {
          category: 'Deliveries',
          records: [sample],
          companies: [],
          currentUserRole: 'Logistics',
          currentUserName: 'Marc',
          onCreateRecord: async () => sample,
          onUpdateRecord: async () => {},
          onVerifyCollection: async () => {},
          outputActionConfigs: {} as any,
          onUpdateOutputActionConfig: () => {},
          dashboardFilterId: null,
          clearDashboardFilter: () => {},
        })));
        await new Promise(resolve => setTimeout(resolve, 25));
      });

      const doc = dom.window.document;
      assert.equal(doc.getElementById('recordStatusFilter'), null, 'duplicate status <select> should be removed');
      const scheduledPill = [...doc.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Scheduled')!;
      assert.ok(scheduledPill);
      assert.equal(scheduledPill.getAttribute('aria-pressed'), 'false');

      const printHeading = doc.querySelector('.print\\:block h1');
      assert.ok(printHeading);
      assert.match(printHeading.textContent ?? '', /^Deliveries Records —/);
      assert.doesNotMatch(printHeading.textContent ?? '', /Accounting Collection Records/);

      const rowButton = doc.querySelector<HTMLButtonElement>('tbody tr button[aria-label*="DEL-001"]');
      assert.ok(rowButton, 'lead cell should render a keyboard-activatable button');
      assert.equal(rowButton.type, 'button');
    } finally {
      await act(async () => root.unmount());
      client.clear();
    }
  });
});

test('GlobalSearch uses native dialog semantics, wires aria-activedescendant, and dismisses on cancel', async () => {
  await withBrowserDom(async dom => {
    const { default: GlobalSearch } = await import('../src/components/GlobalSearch');
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(dom.window.document.getElementById('root')!);
    let closed = 0;
    const navigated: Array<[string, string | undefined]> = [];

    try {
      await act(async () => {
        root.render(React.createElement(GlobalSearch, {
          isOpen: true,
          onClose: () => { closed += 1; },
          deliveryRecords: [],
          customers: [],
          suppliers: [],
          drivers: [],
          products: [],
          accessibleScreens: new Set(['deliveries', 'dashboard']),
          onNavigate: (screen, id) => { navigated.push([screen, id]); },
        }));
        await new Promise(resolve => setTimeout(resolve, 20));
      });

      const doc = dom.window.document;
      const dialog = doc.querySelector<HTMLDialogElement>('dialog[aria-label="Global search"]')!;
      assert.ok(dialog);
      assert.equal(dialog.open, true);

      const input = doc.querySelector<HTMLInputElement>('input[placeholder*="Search records, companies, drivers, SKUs"]')!;
      assert.ok(input);
      assert.equal(input.getAttribute('role'), 'combobox');

      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => {
        setter.call(input, 'deliv');
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });

      const results = doc.querySelectorAll('[data-result-item]');
      assert.ok(results.length >= 1, 'matching accessible screen should appear');

      await act(async () => {
        input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      });
      const activeId = input.getAttribute('aria-activedescendant');
      assert.ok(activeId, 'ArrowDown should populate aria-activedescendant');
      assert.equal(doc.getElementById(activeId)?.getAttribute('aria-selected'), 'true');

      await act(async () => {
        dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
      });
      assert.equal(closed, 1);
    } finally {
      await act(async () => root.unmount());
    }
  });
});

test('NotificationBell uses Floating UI dialog ARIA, dismisses on Escape, and avoids nested buttons', async () => {
  await withBrowserDom(async dom => {
    const notification: ApiNotification = {
      id: 'n-1',
      title: 'Delivery assigned',
      message: 'DEL-101 assigned to Alex.',
      record_id: 'rec-101',
      record_type: 'DELIVERY',
      is_read: false,
      created_at: new Date().toISOString(),
    };
    mock.method(api, 'getNotifications', async () => [notification]);
    mock.method(api, 'markNotificationRead', async () => ({ ok: true }));

    const { default: NotificationBell } = await import('../src/components/NotificationBell');
    const { createRoot } = await import('react-dom/client');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    client.setQueryData(['notifications'], [notification]);
    const root = createRoot(dom.window.document.getElementById('root')!);

    try {
      await act(async () => {
        root.render(React.createElement(QueryClientProvider, { client }, React.createElement(NotificationBell, {
          onNavigate: () => {},
          deliveryRecords: [],
        })));
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const doc = dom.window.document;
      const trigger = doc.getElementById('notification-bell-button') as HTMLButtonElement;
      assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
      assert.equal(trigger.getAttribute('aria-expanded'), 'false');

      await act(async () => {
        trigger.click();
        await new Promise(resolve => setTimeout(resolve, 20));
      });

      assert.equal(trigger.getAttribute('aria-expanded'), 'true');
      const panel = doc.getElementById('notification-panel')!;
      assert.ok(panel);
      assert.equal(panel.getAttribute('role'), 'dialog');

      // Verify zero nested <button> elements inside the notification panel.
      const buttons = [...panel.querySelectorAll('button')];
      assert.ok(buttons.some(b => b.getAttribute('title') === 'Mark as read'));
      assert.ok(buttons.some(b => b.textContent?.includes('Delivery assigned')));
      for (const btn of buttons) {
        assert.equal(btn.querySelector('button'), null, 'notification controls must be sibling buttons, never nested');
      }

      await act(async () => {
        doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 20));
      });
      assert.equal(doc.getElementById('notification-panel'), null);
      assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    } finally {
      await act(async () => root.unmount());
      client.clear();
    }
  });
});
