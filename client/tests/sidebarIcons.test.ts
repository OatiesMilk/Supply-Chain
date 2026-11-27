import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Sidebar } from '../src/layouts/Sidebar';

test('Sidebar renders distinct Layers icon for Main and LayoutDashboard for Dashboard (TSK-31)', () => {
  const props = {
    currentScreen: 'main',
    handleNavigate: () => {},
    isSidebarCollapsed: false,
    setIsSidebarCollapsed: () => {},
    isSidebarOpen: true,
    setIsSidebarOpen: () => {},
    canAccess: () => true,
    currentUserRole: 'Admin' as any,
    currentUser: { name: 'Test Admin', initials: 'TA' },
    deliveriesActiveCount: 0,
    rmaActiveCount: 0,
    salesOrdersActiveCount: 0,
    accountingActiveCount: 0,
    procurementActiveCount: 0,
  };
  const html = renderToString(React.createElement(Sidebar, props));

  // Verify Main uses Layers icon (lucide-layers)
  assert.match(html, /lucide-layers/);

  // Verify Dashboard uses LayoutDashboard icon (lucide-layout-dashboard)
  assert.match(html, /lucide-layout-dashboard/);

  // Verify repetitive LayoutGrid is eliminated from sidebar
  assert.doesNotMatch(html, /lucide-layout-grid/);

  // TSK-117 keeps familiar, distinct symbols in the collapsed icon rail.
  assert.match(html, /aria-label="Deliveries"[\s\S]{0,800}lucide-truck/);
  assert.match(html, /aria-label="Drivers"[\s\S]{0,800}lucide-contact-round/);
  assert.match(html, /aria-label="Customers"[\s\S]{0,800}lucide-users/);
  assert.match(html, /aria-label="Admin Panel"[\s\S]{0,800}lucide-shield-check/);
});

test('Sidebar keeps every module behind its existing canAccess check', () => {
  const props = {
    currentScreen: 'deliveries',
    handleNavigate: () => {},
    isSidebarCollapsed: true,
    setIsSidebarCollapsed: () => {},
    isSidebarOpen: true,
    setIsSidebarOpen: () => {},
    canAccess: (screen: string) => screen === 'deliveries',
    currentUserRole: 'Sales Coordinator' as any,
    currentUser: { name: 'Test User', initials: 'TU' },
    deliveriesActiveCount: 0,
    rmaActiveCount: 0,
    salesOrdersActiveCount: 0,
    accountingActiveCount: 0,
    procurementActiveCount: 0,
  };
  const html = renderToString(React.createElement(Sidebar, props));

  assert.match(html, />Deliveries</);
  for (const label of [
    'Main', 'Dashboard', 'RMA', 'Accounting Collection', 'Procurement Pick-up', 'Sales Orders',
    'Customers', 'Suppliers', 'Drivers', 'Admin Panel', 'Delivery Calendar',
    'Reports', 'AM Directory', 'Transaction Center', 'SKU Master', 'Data Sampler',
  ]) {
    assert.ok(!html.includes(`>${label}<`), `${label} remains hidden without access`);
  }
});

test('Sidebar groups the driver screens under one Drivers item', () => {
  const render = (currentScreen: string, canAccess: (screen: string) => boolean) => renderToString(React.createElement(Sidebar, {
    currentScreen,
    handleNavigate: () => {},
    isSidebarCollapsed: false,
    setIsSidebarCollapsed: () => {},
    isSidebarOpen: true,
    setIsSidebarOpen: () => {},
    canAccess,
    currentUserRole: 'Logistics' as any,
    currentUser: { name: 'Test User', initials: 'TU' },
    deliveriesActiveCount: 0,
    rmaActiveCount: 0,
    salesOrdersActiveCount: 0,
    accountingActiveCount: 0,
    procurementActiveCount: 0,
  }));
  const driversButton = (html: string) => html.match(/<button[^>]*aria-label="Drivers"[^>]*>/)?.[0] ?? '';

  // A single grant is enough to show the item, and no old labels remain.
  const boardOnly = render('dashboard', screen => screen === 'driver_board');
  assert.ok(driversButton(boardOnly), 'Drivers shows with only Driver Board granted');
  for (const label of ['Driver View', 'Driver Manager', 'Driver Board']) {
    assert.ok(!boardOnly.includes(`>${label}<`), `${label} is no longer a separate item`);
  }
  assert.doesNotMatch(driversButton(boardOnly), /font-semibold/);

  // The item stays highlighted on any driver screen, not only its landing tab.
  assert.match(driversButton(render('driver_manager', () => true)), /font-semibold/);
});

test('Sidebar hides empty nav groups and renders role-adaptive collapsed dividers', async () => {
  const baseProps = {
    currentScreen: 'deliveries',
    handleNavigate: () => {},
    isSidebarCollapsed: false,
    setIsSidebarCollapsed: () => {},
    isSidebarOpen: true,
    setIsSidebarOpen: () => {},
    currentUserRole: 'Sales Coordinator' as any,
    currentUser: { name: 'Test User', initials: 'TU' },
    deliveriesActiveCount: 0,
    rmaActiveCount: 0,
    salesOrdersActiveCount: 0,
    accountingActiveCount: 0,
    procurementActiveCount: 0,
  };

  // Single-screen user sees only Operations — no empty Fleet & Activity, Master Data, or Reports & Admin headings.
  const deliveriesOnly = renderToString(React.createElement(Sidebar, {
    ...baseProps,
    canAccess: (screen: string) => screen === 'deliveries',
  }));
  assert.match(deliveriesOnly, />Operations</);
  for (const hiddenGroup of ['Fleet &amp; Activity', 'Master Data', 'Reports &amp; Admin']) {
    assert.ok(!deliveriesOnly.includes(`>${hiddenGroup}<`), `${hiddenGroup} should be hidden when empty`);
  }

  // Collapsed desktop rail renders one <hr> per visible titled group (4 for Logistics, 1 for deliveries-only).
  const { JSDOM } = await import('jsdom');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as any;

  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    const logisticsScreens = new Set([
      'main', 'dashboard', 'deliveries', 'rma', 'accounting_collection',
      'procurement_pickup', 'sales_orders', 'customers', 'suppliers',
      'driver', 'driver_manager', 'calendar', 'driver_board',
      'transactions', 'statistical_reports',
    ]);
    await act(async () => {
      root.render(React.createElement(Sidebar, {
        ...baseProps,
        isSidebarCollapsed: true,
        canAccess: (screen: string) => logisticsScreens.has(screen),
      }));
    });
    assert.equal(dom.window.document.querySelectorAll('#sidebar-nav hr').length, 4);

    await act(async () => {
      root.render(React.createElement(Sidebar, {
        ...baseProps,
        isSidebarCollapsed: true,
        canAccess: (screen: string) => screen === 'deliveries',
      }));
    });
    assert.equal(dom.window.document.querySelectorAll('#sidebar-nav hr').length, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
