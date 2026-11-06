import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DATA_SAMPLER_ENABLED } from '../src/utils/developmentTools';
import { Sidebar } from '../src/layouts/Sidebar';
import { AppRouter, type AppRouterProps } from '../src/routes/AppRouter';
import { findGlobalSearchScreens } from '../src/components/GlobalSearch';
import DeliveryRecordsView from '../src/features/deliveries/DeliveryRecordsView';
import { installLegacySession } from './helpers/permissionSession';
import { useAuthStore } from '../src/store/authStore';

test('without an explicit Vite development runtime, Data Sampler is hidden even with all screen grants', () => {
  assert.equal(DATA_SAMPLER_ENABLED, false);
  const sidebar = renderToString(React.createElement(Sidebar, {
    currentScreen: 'dashboard', handleNavigate() {}, isSidebarCollapsed: false, setIsSidebarCollapsed() {},
    isSidebarOpen: false, setIsSidebarOpen() {}, canAccess: () => true,
    currentUserRole: 'Admin', currentUser: { name: 'Admin', initials: 'A' },
    deliveriesActiveCount: 0, rmaActiveCount: 0, salesOrdersActiveCount: 0, accountingActiveCount: 0, procurementActiveCount: 0,
  }));
  assert.doesNotMatch(sidebar, /Data Sampler/);
  assert.match(sidebar, /Admin Panel/);
  assert.deepEqual(findGlobalSearchScreens('sampler', new Set(['data_sampler'])), []);
  const route = renderToString(React.createElement(AppRouter, {
    currentScreen: 'data_sampler', canAccess: () => true,
  } as unknown as AppRouterProps));
  assert.match(route, /not available/);
  assert.doesNotMatch(route, /Generate Sample/);
});

test('Admin record toolbar omits Generate Sample outside Vite development', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  installLegacySession('ADMIN', 'deliveries');
  try {
    const html = renderToString(React.createElement(QueryClientProvider, { client }, React.createElement(DeliveryRecordsView, {
      category: 'Deliveries', records: [], companies: [], currentUserRole: 'Admin', currentUserName: 'Admin',
      onCreateRecord: async () => { throw new Error('not called'); }, onUpdateRecord: async () => {}, onVerifyCollection: async () => {},
      outputActionConfigs: {} as React.ComponentProps<typeof DeliveryRecordsView>['outputActionConfigs'],
      onUpdateOutputActionConfig() {}, dashboardFilterId: null, clearDashboardFilter() {},
    })));
    assert.doesNotMatch(html, /Generate Sample/);
    assert.match(html, /Monthly Driver Report/);
  } finally { client.clear(); useAuthStore.getState().setAuthUser(null); }
});
