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
});
