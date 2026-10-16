import assert from 'node:assert/strict';
import { apiRequest, getSession } from './auth';
import { manilaToday, uniqueRef } from './runtime';

export async function companyFixture() {
  const sales = await getSession('sales@microgenesis.com');
  const response = await apiRequest('GET', '/companies', sales);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.data) && response.data.length > 0, 'Blocked: seed must provide a company');
  return response.data[0];
}
export async function deliveryFixture(overrides: Record<string, unknown> = {}) {
  const company = await companyFixture();
  return { category: 'Deliveries', company_id: company.id, reference: uniqueRef(), delivery_date: manilaToday(),
    priority: '2 - Moderate', status: 'Scheduled', ...overrides };
}
export async function linkedDriverFixture() {
  const admin = await getSession('admin@microgenesis.com');
  const driver = await getSession('driver@microgenesis.com');
  const response = await apiRequest('GET', '/drivers', admin);
  assert.equal(response.status, 200);
  const profile = response.data.find((entry: any) => entry.is_active && entry.linked_user?.email === driver.email);
  assert.ok(profile, 'Blocked: configured driver login must have an active linked profile');
  return { profile, driver };
}
export async function customerFixture() {
  const sales = await getSession('sales@microgenesis.com');
  const response = await apiRequest('POST', '/customers', sales, { name: uniqueRef('QA-Customer') });
  assert.equal(response.status, 201, 'Blocked: cannot create isolated customer fixture');
  return response.data;
}
export async function skuFixture() {
  const admin = await getSession('admin@microgenesis.com');
  const response = await apiRequest('POST', '/skus', admin, {
    sku_code: uniqueRef('QA-SKU'), name: 'QA isolated SKU', category: 'Hardware', unit_cost: 100, unit_price: 150, reorder_point: 5,
  });
  assert.equal(response.status, 201, 'Blocked: cannot create isolated SKU fixture');
  return response.data;
}
