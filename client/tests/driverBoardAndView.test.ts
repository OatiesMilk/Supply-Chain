import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../src/api';
import DriverBoard from '../src/features/drivers/DriverBoard';
import DriverView from '../src/features/drivers/DriverView';
import { installLegacySession } from './helpers/permissionSession';
import type { DeliveryRecord } from '../src/types';

async function withDom(run: (dom: JSDOM) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const values = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  try {
    await run(dom);
  } finally {
    mock.restoreAll();
    dom.window.close();
    for (const key of Object.keys(values)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

const makeRecord = (id: string, overrides: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  id,
  category: 'Deliveries',
  status: 'Scheduled',
  is_draft: 'No',
  priority: '2 - Moderate',
  reference: `REF-${id}`,
  company_name: `Company ${id}`,
  delivery_date: '2026-11-23',
  driver: '',
  driver_id: null,
  driver_assistants: [],
  area: 'Makati',
  account_manager: 'AM One',
  vehicle: 'Van',
  item_type: 'Small Item',
  remarks: '',
  edit_version: `v-${id}`,
  created_at: '2026-11-23T01:00:00Z',
  modified_at: '2026-11-23T01:00:00Z',
  ...overrides,
} as DeliveryRecord);

test('DriverBoard reports full server unassigned count (28) instead of page-local count (10) and filters unassigned via server', async () => {
  await withDom(async dom => {
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(dom.window.document.getElementById('root')!);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    installLegacySession('LOGISTICS', 'driver_board');

    // Page 1 has 10 unassigned + 15 assigned, while server total has 28 unassigned across all pages.
    const page1Rows = [
      ...Array.from({ length: 10 }, (_, i) => makeRecord(`UN-${i + 1}`, { driver: '', driver_id: null })),
      ...Array.from({ length: 15 }, (_, i) => makeRecord(`AS-${i + 1}`, { driver: 'Driver One', driver_id: 'drv-1' })),
    ];

    const pagedMock = mock.method(api, 'getPagedRecords', async filters => {
      if (filters.assignment === 'unassigned') {
        return {
          rows: Array.from({ length: 25 }, (_, i) => makeRecord(`UN-${i + 1}`, { driver: '', driver_id: null })),
          total: 28,
          page: filters.page ?? 1,
          limit: 25,
          nextCursor: null,
          hasMore: true,
        };
      }
      return {
        rows: page1Rows,
        total: 43,
        page: filters.page ?? 1,
        limit: 25,
        nextCursor: null,
        hasMore: true,
      };
    });

    mock.method(api, 'getDriverOverview', async () => ({
      drivers: [{ name: 'Driver One', active: 15, completed: 0 }],
      unassigned: 28,
      dispatch_total: 43,
      areas: ['Makati', 'Ortigas'],
      dashboard: { today: 0, remaining: 43, completed: 0, rma_active: 0, rma_completed: 0 },
    }));

    const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    try {
      await act(async () => {
        root.render(React.createElement(QueryClientProvider, { client }, React.createElement(DriverBoard, {
          serverPaging: true,
          records: [],
          onNavigate() {},
          onUpdateRecord: async () => {},
          currentUserName: 'Logistics',
        })));
      });
      await flush();

      const text = dom.window.document.body.textContent ?? '';
      assert.match(text, /28 need driver/, 'shows true server-wide count of 28 instead of page-local 10');
      assert.doesNotMatch(text, /10 need driver/, 'never displays misleading page-local count');

      // Clicking "View all 28 unassigned" switches to server-filtered unassigned queue.
      const unassignedShortcut = [...dom.window.document.querySelectorAll('button')]
        .find(b => b.textContent?.includes('View all 28 unassigned'));
      assert.ok(unassignedShortcut, 'shortcut to view all 28 unassigned records is visible');
      await act(async () => unassignedShortcut.click());
      await flush();

      assert.equal(pagedMock.mock.calls.at(-1)?.arguments[0].assignment, 'unassigned');
      assert.equal(pagedMock.mock.calls.at(-1)?.arguments[0].view, 'dispatch');

      // Switch to List view cleanly.
      const listButton = [...dom.window.document.querySelectorAll('button')]
        .find(b => b.textContent?.trim() === 'List');
      assert.ok(listButton);
      await act(async () => listButton.click());
      assert.ok(dom.window.document.querySelector('table'), 'List mode renders dispatch table');
    } finally {
      await client.cancelQueries();
      await act(async () => root.unmount());
      client.clear();
    }
  });
});

test('DriverView switches drivers without flashing empty state or top layout-shifting loading banner', async () => {
  await withDom(async dom => {
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(dom.window.document.getElementById('root')!);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    installLegacySession('LOGISTICS', 'driver');

    let resolveDriverB: ((value: any) => void) | null = null;
    mock.method(api, 'getDriverOverview', async () => ({
      drivers: [
        { name: 'Driver A', active: 1, completed: 0 },
        { name: 'Driver B', active: 1, completed: 0 },
      ],
      unassigned: 0,
      dispatch_total: 2,
      areas: ['Makati'],
      dashboard: { today: 0, remaining: 2, completed: 0, rma_active: 0, rma_completed: 0 },
    }));

    mock.method(api, 'getPagedRecords', async filters => {
      if (filters.driver_exact === 'Driver A') {
        return {
          rows: [makeRecord('A1', { driver: 'Driver A', driver_id: 'drv-a', company_name: 'Alpha Corp' })],
          total: 1,
          page: 1,
          limit: 25,
          nextCursor: null,
          hasMore: false,
        };
      }
      if (filters.driver_exact === 'Driver B') {
        return await new Promise(resolve => {
          resolveDriverB = resolve;
        });
      }
      return { rows: [], total: 0, page: 1, limit: 25, nextCursor: null, hasMore: false };
    });

    const waitFor = async (predicate: () => boolean, timeoutMs = 1000) => {
      const deadline = Date.now() + timeoutMs;
      while (!predicate()) {
        if (Date.now() > deadline) break;
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      }
    };
    try {
      await act(async () => {
        root.render(React.createElement(QueryClientProvider, { client }, React.createElement(DriverView, {
          serverPaging: true,
          records: [],
          onUpdateRecord: async () => {},
          currentUserName: 'Logistics',
          outputActionConfigs: {} as any,
          onNavigate() {},
        })));
      });
      await waitFor(() => (dom.window.document.body.textContent ?? '').includes('Alpha Corp'));

      assert.match(dom.window.document.body.textContent ?? '', /Alpha Corp/);

      // Click Driver B while its network request is still pending.
      const driverBButton = [...dom.window.document.querySelectorAll<HTMLButtonElement>('aside button')]
        .find(b => b.textContent?.includes('Driver B'));
      assert.ok(driverBButton);

      await act(async () => driverBButton.click());

      // While Driver B is in flight: NO "No active runs" flash and NO top "Loading records…" banner!
      const inFlightText = dom.window.document.body.textContent ?? '';
      assert.doesNotMatch(inFlightText, /No active runs for this driver/, 'must not flash empty state while switching drivers');
      assert.doesNotMatch(inFlightText, /Loading records/, 'must not render layout-shifting top loading banner');
      assert.ok(dom.window.document.querySelector('[aria-label="Loading runs"]'), 'renders stable-height skeleton rows while fetching new driver');

      // Resolve Driver B's runs.
      await act(async () => {
        resolveDriverB?.({
          rows: [makeRecord('B1', { driver: 'Driver B', driver_id: 'drv-b', company_name: 'Beta Corp' })],
          total: 1,
          page: 1,
          limit: 25,
          nextCursor: null,
          hasMore: false,
        });
      });
      await waitFor(() => (dom.window.document.body.textContent ?? '').includes('Beta Corp'));
      assert.match(dom.window.document.body.textContent ?? '', /Beta Corp/);

      // Click back to cached Driver A: should render Alpha Corp immediately without skeleton or empty state!
      const driverAButton = [...dom.window.document.querySelectorAll<HTMLButtonElement>('aside button')]
        .find(b => b.textContent?.includes('Driver A'));
      assert.ok(driverAButton);
      await act(async () => driverAButton.click());
      const cachedText = dom.window.document.body.textContent ?? '';
      assert.match(cachedText, /Alpha Corp/, 'cached driver renders immediately with zero flicker');
      assert.doesNotMatch(cachedText, /No active runs for this driver/);
    } finally {
      await client.cancelQueries();
      await act(async () => root.unmount());
      client.clear();
    }
  });
});
