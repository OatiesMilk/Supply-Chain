import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient, QueryObserver, focusManager, onlineManager } from '@tanstack/react-query';
import { ApiError } from '../src/api';
import { createQueryClient } from '../src/api/queryClient';
import type { DeliveryRecord } from '../src/types';
import { invalidateOperationalQueries, newerRecord, operationalSyncOptions, OPERATIONAL_POLL_INTERVAL_MS, OPERATIONAL_STALE_TIME_MS, recordDetailKey, saveRecordToCache, shareOperationalRecords } from '../src/api/queries/operationalSync';

const record = (version: number, fields: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  id: 'rma', category: 'RMA', rma_version: version, modified_at: `2026-10-28T01:00:0${version}.000Z`,
  driver: 'Driver A', status: 'Scheduled', ...fields,
} as DeliveryRecord);

test('a delayed RMA response cannot overwrite a newer assignment in detail, lists or paged data', () => {
  const saved = record(3, { driver: 'Driver B' });
  const delayed = record(2, { driver: 'Driver A' });
  assert.equal(newerRecord(saved, delayed), saved);
  assert.deepEqual(shareOperationalRecords([saved], [delayed]), [saved]);
  assert.deepEqual(shareOperationalRecords({ rows: [saved], total: 1 }, { rows: [delayed], total: 1 }), { rows: [saved], total: 1 });
  assert.equal(newerRecord(saved, record(3, { modified_at: '2026-10-28T00:00:00.000Z' })), saved, 'server timestamps break equal-version ties');
  assert.deepEqual(shareOperationalRecords([saved], []), [], 'reassignment removes records no longer returned by the server scope');
  assert.deepEqual(shareOperationalRecords({ rows: [saved], total: 1 }, { rows: [], total: 0 }), { rows: [], total: 0 });
});

test('saving a server result updates matching cached views and discards a stale in-flight read', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const old = record(1);
  const saved = record(2, { driver: 'Driver B' });
  const key = ['records'] as const;
  client.setQueryData(key, [old]);
  client.setQueryData(['records', 'paged', { category: 'RMA' }], { rows: [old], total: 1 });
  client.setQueryData(['records', 'paged', { category: 'Deliveries' }], { rows: [], total: 0 });
  let finish: ((records: DeliveryRecord[]) => void) | undefined;
  const read = client.fetchQuery({ queryKey: key, queryFn: () => new Promise<DeliveryRecord[]>(resolve => { finish = resolve; }) }).catch(() => undefined);
  await saveRecordToCache(client, saved);
  finish!([old]);
  await read;
  assert.deepEqual(client.getQueryData(key), [saved]);
  assert.deepEqual(client.getQueryData(['records', 'paged', { category: 'RMA' }]), { rows: [saved], total: 1 });
  assert.deepEqual(client.getQueryData(['records', 'paged', { category: 'Deliveries' }]), { rows: [], total: 0 }, 'saving does not insert an RMA into unrelated pages');
  assert.equal(client.getQueryData(recordDetailKey('rma')), saved);
  await saveRecordToCache(client, old);
  assert.equal(client.getQueryData(recordDetailKey('rma')), saved, 'an earlier save result cannot roll the cache back');
  client.clear();
});

test('sales, Logistics and Driver status updates stay current in lists, pages, calendars and open details', async () => {
  for (const category of ['Deliveries', 'Sales Orders', 'Accounting Collection', 'Procurement Pick-up'] as const) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scheduled = record(0, { category, status: 'Scheduled', modified_at: '2026-10-30T02:00:00.000Z' });
    const started = { ...scheduled, status: 'In Transit' as const, time_in: '2026-10-30T03:00:00.000Z', modified_at: '2026-10-30T03:00:00.000Z' };
    const delivered = { ...started, status: 'Delivered' as const, time_out: '2026-10-30T04:00:00.000Z', modified_at: '2026-10-30T04:00:00.000Z' };
    const pageKey = ['records', 'paged', { category }];
    const calendarKey = ['records', 'calendar-summary', '2026-10-30'];
    client.setQueryData(['records'], [scheduled]);
    client.setQueryData(pageKey, { rows: [scheduled], total: 1 });
    client.setQueryData(calendarKey, [scheduled]);
    client.setQueryData(recordDetailKey(scheduled.id), scheduled);
    try {
      for (const saved of [started, delivered]) {
        await saveRecordToCache(client, saved);
        assert.equal(client.getQueryData<DeliveryRecord[]>(['records'])![0].status, saved.status, category);
        assert.equal(client.getQueryData<{ rows: DeliveryRecord[] }>(pageKey)!.rows[0].status, saved.status, category);
        assert.equal(client.getQueryData<DeliveryRecord[]>(calendarKey)![0].status, saved.status, category);
        assert.equal(client.getQueryData<DeliveryRecord>(recordDetailKey(saved.id))!.status, saved.status, category);
        assert.equal(newerRecord(saved, scheduled), saved, 'an old Scheduled response must not roll back progress');
        assert.deepEqual(shareOperationalRecords([saved], [scheduled]), [saved]);
        assert.deepEqual(shareOperationalRecords({ rows: [saved], total: 1 }, { rows: [scheduled], total: 1 }), { rows: [saved], total: 1 });
      }
      await saveRecordToCache(client, started);
      assert.equal(client.getQueryData<DeliveryRecord>(recordDetailKey(scheduled.id))!.status, 'Delivered', 'a delayed start response cannot undo delivery');
      assert.deepEqual(shareOperationalRecords([delivered], []), [], 'server removals still revoke visibility');
    } finally { client.clear(); }
  }
});

test('operational invalidation includes counts, capabilities, history, POD and notifications without unrelated lookups', async () => {
  const client = new QueryClient();
  const keys = [
    ['records'], ['records', 'active-counts'], ['records', 'rma-capabilities', 'rma'],
    ['dashboard-stats'], ['notifications'], ['pod-attachments', 'rma'],
    ['record-audit', 'rma'], ['record-remarks', 'rma'], ['record-comments', 'rma'],
  ];
  for (const key of [...keys, ['drivers'], ['companies']]) client.setQueryData(key, []);
  await invalidateOperationalQueries(client);
  for (const key of keys) assert.equal(client.getQueryState(key)?.isInvalidated, true, key.join('/'));
  for (const key of [['drivers'], ['companies']]) assert.equal(client.getQueryState(key)?.isInvalidated, false);
  client.clear();
});

test('operational views poll within the API budget and refresh on focus/reconnect', async () => {
  assert.equal(OPERATIONAL_POLL_INTERVAL_MS, 30_000);
  assert.equal(OPERATIONAL_STALE_TIME_MS, 0);
  assert.equal(operationalSyncOptions.refetchInterval, 30_000);
  assert.equal(operationalSyncOptions.refetchIntervalInBackground, false);
  assert.equal(operationalSyncOptions.staleTime, 0);
  assert.equal(operationalSyncOptions.refetchOnWindowFocus, true);
  assert.equal(operationalSyncOptions.refetchOnReconnect, true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.mount();
  let reads = 0;
  const observer = new QueryObserver(client, { ...operationalSyncOptions, staleTime: 0, queryKey: ['records', 'recovery'], queryFn: async () => ++reads });
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  const initial = reads;
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(reads > initial, 'focus refreshes immediately');
  const afterFocus = reads;
  onlineManager.setOnline(false);
  onlineManager.setOnline(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(reads > afterFocus, 'reconnect refreshes immediately');
  unsubscribe(); client.unmount(); client.clear(); focusManager.setFocused(undefined);
});

test('query client does not retry 4xx rate limits but still retries a transient server error once', async () => {
  const client = createQueryClient();
  let limitedAttempts = 0;
  try {
    await assert.rejects(client.fetchQuery({
      queryKey: ['rate-limited'],
      queryFn: async () => { limitedAttempts++; throw new ApiError('Too many requests', 429); },
    }), /Too many requests/);
    assert.equal(limitedAttempts, 1);

    let serverAttempts = 0;
    const recovered = await client.fetchQuery({
      queryKey: ['transient-server-error'],
      queryFn: async () => {
        if (++serverAttempts === 1) throw new ApiError('Temporary failure', 503);
        return 'recovered';
      },
    });
    assert.equal(recovered, 'recovered');
    assert.equal(serverAttempts, 2);
  } finally {
    client.clear();
  }
});
