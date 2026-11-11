import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { invalidateOperationalQueries, operationalSyncOptions } from '../src/api/queries/operationalSync';
import { RECORD_ACTIVE_COUNTS_KEY } from '../src/api/queries/useRecordsQuery';
import { DASHBOARD_QUERY_KEY } from '../src/api/queries/useDashboardQuery';

test('one refresh invalidates dashboard stats, dashboard overview and the sidebar badge counts together', async () => {
  const client = new QueryClient();
  const keys: unknown[] = [];
  client.invalidateQueries = (async (filters: any) => { keys.push(filters.queryKey); }) as any;
  await invalidateOperationalQueries(client);
  const covers = (queryKey: readonly unknown[]) => keys.some(key => Array.isArray(key) && key.every((part, index) => part === queryKey[index]));
  assert.ok(covers(DASHBOARD_QUERY_KEY), 'dashboard stats');
  assert.ok(covers(['dashboard-overview']), 'dashboard overview');
  assert.ok(covers(RECORD_ACTIVE_COUNTS_KEY), 'sidebar active counts live under records');
  client.clear();
});

test('dashboards stay fresh between refreshes by polling while visible and refetching on focus', () => {
  assert.equal(operationalSyncOptions.refetchInterval, 30_000);
  assert.equal(operationalSyncOptions.refetchIntervalInBackground, false);
  assert.equal(operationalSyncOptions.refetchOnWindowFocus, true);
});
