import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { type ApiUser } from '../src/api';
import { AppRouter, type AppRouterProps } from '../src/routes/AppRouter';
import { isResourceQueryEnabled } from '../src/hooks/useAppData';
import { PERMISSION_SCREENS } from '../src/types/permissions';

const mockUser = (role = 'ADMIN'): ApiUser => ({
  id: 'usr-1',
  name: 'Test User',
  email: 'test@example.com',
  role: role as any,
  permissions: [],
  effectiveScreens: [...PERMISSION_SCREENS],
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
  assert.equal(isResourceQueryEnabled('records', user, 'customers'), false, 'Customers only needs lightweight counts, not all records');
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

test('record lists load for operational screens but not unrelated directories', () => {
  const user = mockUser('ADMIN');
  for (const screen of ['main','dashboard','deliveries','rma','accounting_collection','procurement_pickup','sales_orders','calendar','driver','driver_board','suppliers','am_directory']) {
    assert.equal(isResourceQueryEnabled('records', user, screen), true, screen);
  }
  for (const screen of ['customers','inventory','admin','data_sampler','transactions','statistical_reports','driver_manager']) {
    assert.equal(isResourceQueryEnabled('records', user, screen), false, screen);
  }
});

test('driver directory loads on every operational creation and assignment screen', () => {
  const user = mockUser('ADMIN');
  for (const screen of ['main','deliveries','rma','accounting_collection','procurement_pickup','sales_orders','calendar','dashboard','data_sampler','driver','driver_board','driver_manager']) {
    assert.equal(isResourceQueryEnabled('drivers', user, screen), true, screen);
  }
  assert.equal(isResourceQueryEnabled('drivers', user, 'customers'), false);
  assert.equal(isResourceQueryEnabled('drivers', { ...user, resources: ['records'] }, 'deliveries'), false);
  const driver: ApiUser = { ...user, role: 'DRIVER', effectiveScreens: ['driver_dashboard'] };
  assert.equal(isResourceQueryEnabled('records', driver, 'driver_dashboard'), true);
  assert.equal(isResourceQueryEnabled('records', driver, 'dashboard'), false, 'a denied route cannot initiate a query');
});
