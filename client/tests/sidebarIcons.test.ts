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
  assert.match(html, /aria-label="Driver View"[\s\S]{0,800}lucide-route/);
  assert.match(html, /aria-label="Driver Manager"[\s\S]{0,800}lucide-contact-round/);
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
    'Customers', 'Suppliers', 'Driver View', 'Driver Manager', 'Admin Panel', 'Delivery Calendar',
    'Driver Board', 'Reports', 'AM Directory', 'Transaction Center', 'SKU Master', 'Data Sampler',
  ]) {
    assert.ok(!html.includes(`>${label}<`), `${label} remains hidden without access`);
  }
});
