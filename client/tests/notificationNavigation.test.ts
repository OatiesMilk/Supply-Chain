import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificationScreen } from '../src/utils/notificationNavigation';

test('notification resolves correct category without fetching the entire records list', async () => {
  let calls = 0;
  const fetchOne = async (id: string) => { calls++; assert.equal(id,'record-1'); return { category: 'RMA' }; };
  const n = { record_id: 'record-1', record_type: 'DeliveryRecord' };
  assert.equal(await notificationScreen(n, [], fetchOne), 'rma');
  assert.equal(calls, 1);
  assert.equal(await notificationScreen(n, [{ id: 'record-1', category: 'Sales Orders' }], fetchOne), 'sales_orders');
  assert.equal(calls, 1, 'cached records avoid the network lookup');
  assert.equal(await notificationScreen(n, [], async () => { throw Error('forbidden'); }), 'dashboard');
  assert.equal(await notificationScreen({record_id:'sku',record_type:'Sku'}, [], fetchOne),'inventory');
  assert.equal(await notificationScreen({record_id:null,record_type:null}, [], fetchOne),'dashboard');
});
