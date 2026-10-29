import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient, QueryObserver, focusManager, onlineManager } from '@tanstack/react-query';
import type { DeliveryRecord } from '../src/types';
import { invalidateOperationalQueries, newerRecord, operationalSyncOptions, recordDetailKey, saveRecordToCache, shareOperationalRecords } from '../src/api/queries/operationalSync';

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

test('operational views poll within the agreed budget and recover immediately on focus and reconnect', async () => {
  assert.equal(operationalSyncOptions.refetchInterval, 2_000);
  assert.equal(operationalSyncOptions.refetchIntervalInBackground, false);
  assert.equal(operationalSyncOptions.staleTime, 0);
  assert.equal(operationalSyncOptions.refetchOnWindowFocus, 'always');
  assert.equal(operationalSyncOptions.refetchOnReconnect, 'always');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.mount();
  let reads = 0;
  const observer = new QueryObserver(client, { ...operationalSyncOptions, queryKey: ['records', 'recovery'], queryFn: async () => ++reads });
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
