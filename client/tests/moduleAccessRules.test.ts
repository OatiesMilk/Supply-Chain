import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permissionsFor } from '../src/utils/permissions';
import { categoryActionRestricted, isViewOnlyCategory } from '../src/utils/moduleAccessRules';
import { PERMISSION_SCREENS, RESOURCE_ACTIONS } from '../src/types/permissions';

const legacy = (role: string) => permissionsFor({ id: `u-${role}`, role, permissions: [], effectiveScreens: [...PERMISSION_SCREENS],
  resources: Object.keys(RESOURCE_ACTIONS), permissionVersion: 'v1' } as any);

test('Admin can read but not change Deliveries, RMA, Procurement Pick-up and Sales Orders', () => {
  const admin = legacy('ADMIN');
  for (const category of ['Deliveries', 'RMA', 'Procurement Pick-up', 'Sales Orders']) {
    assert.equal(admin.canRecord(category), true, `${category} read`);
    for (const action of ['WRITE', 'CREATE', 'UPDATE', 'ASSIGN', 'STATUS', 'TIME_IN', 'POD', 'COMMENT', 'SUBMIT', 'COMPLETE'] as const) {
      assert.equal(admin.canRecord(category, action), false, `${category} ${action}`);
    }
  }
  assert.equal(admin.canRecord('Accounting Collection', 'CREATE'), true, 'Accounting Collection is unchanged');
});

test('only Sales Coordinator creates Deliveries, Procurement Pick-up and Sales Orders; Logistics keeps assignment', () => {
  const logistics = legacy('LOGISTICS'), sales = legacy('SALES_COORDINATOR');
  for (const category of ['Deliveries', 'Procurement Pick-up', 'Sales Orders']) {
    assert.equal(logistics.canRecord(category, 'CREATE'), false, category);
    assert.equal(logistics.canRecord(category, 'ASSIGN'), true, category);
    assert.equal(sales.canRecord(category, 'CREATE'), true, category);
  }
});

test('rule helpers match the server rules', () => {
  assert.equal(categoryActionRestricted('ADMIN', 'DELIVERY', 'READ'), false);
  assert.equal(categoryActionRestricted('TASS', 'RMA', 'CREATE'), false);
  assert.equal(categoryActionRestricted('LOGISTICS', 'ACCOUNTING_COLLECTION', 'CREATE'), false);
  assert.equal(isViewOnlyCategory('ADMIN', 'SALES_ORDERS'), true);
  assert.equal(isViewOnlyCategory('ADMIN', 'ACCOUNTING_COLLECTION'), false);
  assert.equal(isViewOnlyCategory('LOGISTICS', 'DELIVERY'), false);
});
