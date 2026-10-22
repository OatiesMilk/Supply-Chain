import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from '../src/layouts/Sidebar';
import { usePermissions } from '../src/hooks/usePermissions';
import { useRecordsQuery, createUpdateRecordMutationOptions } from '../src/api/queries/useRecordsQuery';
import { useCustomersQuery } from '../src/api/queries/useCompaniesQuery';
import { useSuppliersQuery } from '../src/api/queries/useSuppliersQuery';
import { createQueryClient } from '../src/api/queryClient';
import { api, ApiError } from '../src/api';

afterEach(() => mock.restoreAll());

test('all sidebar links follow access checks, including the formerly unconditional modules', () => {
  const props = {
    currentScreen: 'deliveries', handleNavigate: () => {}, isSidebarCollapsed: false,
    setIsSidebarCollapsed: () => {}, isSidebarOpen: true, setIsSidebarOpen: () => {},
    canAccess: (screen: string) => screen === 'deliveries', currentUserRole: 'Sales Coordinator',
    currentUser: { name: 'Test User', initials: 'TU' }, deliveriesActiveCount: 0,
    rmaActiveCount: 0, salesOrdersActiveCount: 0, accountingActiveCount: 0, procurementActiveCount: 0,
    onRequestAccess: () => {},
  } as React.ComponentProps<typeof Sidebar>;
  const html = renderToString(React.createElement(Sidebar, props));
  assert.match(html, />Deliveries</);
  for (const label of ['All Records', 'Dashboard', 'Customers', 'Suppliers', 'Products / SKU Master', 'Transaction Center']) {
    assert.ok(!html.includes(`>${label}<`), label);
  }
});

test('an incomplete session renders no role-default permissions', () => {
  function Probe() {
    const { effectiveScreens } = usePermissions({ role: 'ADMIN' } as any);
    return React.createElement('span', null, String(effectiveScreens.size));
  }
  assert.equal(renderToString(React.createElement(Probe)), '<span>0</span>');
});

test('denied queries never restore unscoped browser data', () => {
  const client = createQueryClient();
  function Probe() {
    const records = useRecordsQuery(false);
    const customers = useCustomersQuery(false);
    const suppliers = useSuppliersQuery(false);
    assert.equal(records.data, undefined);
    assert.equal(customers.data, undefined);
    assert.equal(suppliers.data, undefined);
    return null;
  }
  renderToString(React.createElement(QueryClientProvider, { client }, React.createElement(Probe)));
  client.clear();
});

test('a forbidden record update remains an error instead of a simulated successful save', async () => {
  const client = createQueryClient();
  const error = new ApiError('Module access denied', 403);
  mock.method(api, 'updateRecord', async () => { throw error; });
  await assert.rejects(createUpdateRecordMutationOptions(client).mutationFn({ id: 'record-1', updates: { remarks: 'Denied edit' } }), error);
  client.clear();
});
