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
    'All Records', 'Dashboard', 'RMA', 'Accounting Collection', 'Procurement Pick-up', 'Sales Orders',
    'Customers', 'Suppliers', 'Drivers', 'Admin Panel', 'Delivery Calendar',
    'Reports', 'Account Managers', 'Transaction Center', 'Products / SKU Master', 'Data Sampler',
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
