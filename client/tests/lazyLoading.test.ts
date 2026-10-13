import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { type ApiUser } from '../src/api';
import { AppRouter, type AppRouterProps } from '../src/routes/AppRouter';
import { isResourceQueryEnabled } from '../src/hooks/useAppData';

const mockUser = (role = 'ADMIN'): ApiUser => ({
  id: 'usr-1',
  name: 'Test User',
  email: 'test@example.com',
  role: role as any,
  permissions: [],
  effectiveScreens: ['dashboard', 'customers', 'suppliers', 'inventory'],
  resources: ['records', 'companies', 'customers', 'suppliers', 'skus', 'drivers', 'dashboard'],
  permissionVersion: 'v1',
});

test('AppRouter wraps accessible views in a Suspense boundary without throwing', () => {
  const props = {
    currentScreen: 'customers',
    canAccess: () => true,
    deliveryRecords: [],
    companies: [],
    customers: [],
    suppliers: [],
    products: [],
    managedDrivers: [],
    dashboardStats: null,
    currentUserRole: 'ADMIN',
    currentUserName: 'Test User',
    effectiveScreens: new Set(['customers']),
    handleNavigate: () => {},
    handleCreateRecord: async () => {},
    handleUpdateRecord: async () => {},
    handleVerifyCollection: async () => {},
    outputActionConfigs: {} as any,
    handleUpdateOutputActionConfig: () => {},
    selectedRecordId: null,
    setSelectedRecordId: () => {},
    dashboardFilterId: null,
    clearDashboardFilter: () => {},
    selectedProductId: null,
    setSelectedProductId: () => {},
    handleCreateCustomer: async () => {},
    handleCreateSupplier: async () => {},
    handleCreateDriver: async () => {},
    handleUpdateDriver: async () => {},
    handleDeleteDriver: async () => {},
    refreshData: async () => {},
  } as unknown as AppRouterProps;

  assert.doesNotThrow(() => {
    renderToString(React.createElement(AppRouter, props));
  });
});

test('isResourceQueryEnabled scopes queries to active screens while keeping global data available', () => {
  const user = mockUser('ADMIN');

  // When on "customers" screen:
  assert.equal(isResourceQueryEnabled('records', user, 'customers'), true, 'records stay enabled for badge counters');
  assert.equal(isResourceQueryEnabled('companies', user, 'customers'), true, 'companies stay enabled');
  assert.equal(isResourceQueryEnabled('customers', user, 'customers'), true, 'customers enabled');
  assert.equal(isResourceQueryEnabled('suppliers', user, 'customers'), false, 'suppliers disabled');
  assert.equal(isResourceQueryEnabled('dashboard', user, 'customers'), false, 'dashboard stats disabled');

  // When on "suppliers" screen:
  assert.equal(isResourceQueryEnabled('suppliers', user, 'suppliers'), true);
  assert.equal(isResourceQueryEnabled('customers', user, 'suppliers'), false);
  assert.equal(isResourceQueryEnabled('dashboard', user, 'suppliers'), false);

  // When on "dashboard" screen:
  assert.equal(isResourceQueryEnabled('dashboard', user, 'dashboard'), true);
  assert.equal(isResourceQueryEnabled('skus', user, 'dashboard'), true);
  assert.equal(isResourceQueryEnabled('customers', user, 'dashboard'), false);
  assert.equal(isResourceQueryEnabled('suppliers', user, 'dashboard'), false);

  // When screen is omitted (fallback / tests), all allowed queries remain enabled:
  assert.equal(isResourceQueryEnabled('customers', user, undefined), true);
  assert.equal(isResourceQueryEnabled('suppliers', user, undefined), true);
  assert.equal(isResourceQueryEnabled('dashboard', user, undefined), true);

  // When user lacks resource, always disabled:
  const restrictedUser: ApiUser = { ...user, resources: ['records'] };
  assert.equal(isResourceQueryEnabled('customers', restrictedUser, 'customers'), false);
});
