import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import skus from '../src/routes/skus';

const restorers: (() => void)[] = [];
function stub(target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  const replacement = mock.fn(implementation);
  target[key] = replacement;
  restorers.push(() => { target[key] = original; });
  return replacement;
}
afterEach(() => { while (restorers.length) restorers.pop()!(); mock.restoreAll(); });
const route = (skus as any).stack.find((layer: any) => layer.route?.path === '/' && layer.route.methods.post).route;
const valid = { sku_code: ' QA-1 ', name: ' Test SKU ', category: 'A', unit_cost: 0, unit_price: 5.25, reorder_point: 0 };
async function invoke(body: unknown, role = 'ADMIN') {
  let status = 200;
  let response: any;
  const req = { body, user: { id: 'admin', role } };
  const res = { status(value: number) { status = value; return this; }, json(value: unknown) { response = value; return this; } };
  await route.stack.at(-2).handle(req, res, () => {});
  if (status === 200) await route.stack.at(-1).handle(req, res, (error: unknown) => { if (error) throw error; });
  return { status, body: response };
}

test('SKU creation denies all non-Admin roles before any database writes', async () => {
  const transaction = stub(prisma, '$transaction', async () => { throw new Error('must not write'); });
  for (const role of ['LOGISTICS', 'SALES_COORDINATOR', 'DRIVER', 'TASS']) assert.equal((await invoke(valid, role)).status, 403);
  assert.equal(transaction.mock.callCount(), 0);
});

test('SKU creation rejects invalid fields without database writes', async () => {
  const transaction = stub(prisma, '$transaction', async () => { throw new Error('must not write'); });
  const cases = [
    { sku_code: ' ' }, { name: ' ' }, { category: 'D' }, { unit_cost: -1 }, { unit_price: 'abc' },
    { unit_cost: Infinity }, { unit_price: null }, { unit_cost: true }, { unit_price: ' ' },
    { reorder_point: -1 }, { reorder_point: 1.5 }, { reorder_point: 2147483648 }, { description: {} },
  ];
  for (const invalid of cases) assert.equal((await invoke({ ...valid, ...invalid })).status, 400, JSON.stringify(invalid));
  assert.equal(transaction.mock.callCount(), 0);
});

test('SKU creation commits product, empty inventory and audit within one transaction', async () => {
  let productData: any;
  let auditData: any;
  stub(prisma, '$transaction', async (callback: any) => callback({
    product: { create: async ({ data }: any) => {
      productData = data;
      return { id: 'sku', ...data, createdBy: { name: 'Admin' }, modifiedBy: { name: 'Admin' }, inventory: data.inventory.create };
    } },
    auditLog: { create: async ({ data }: any) => { auditData = data; } },
  }));
  const result = await invoke(valid);
  assert.equal(result.status, 201);
  assert.equal(productData.skuCode, 'QA-1');
  assert.equal(productData.name, 'Test SKU');
  assert.deepEqual(productData.inventory.create, { warehouseLocation: 'TBD', onHandQty: 0, allocatedQty: 0 });
  assert.equal(auditData.action, 'CREATE');
  assert.equal(auditData.recordId, 'sku');
  assert.equal(result.body.inventory.on_hand_qty, 0);
});

test('duplicate SKU produces a prompt conflict response', async () => {
  stub(prisma, '$transaction', async () => { throw Object.assign(new Error('duplicate'), { code: 'P2002' }); });
  const result = await invoke(valid);
  assert.equal(result.status, 409);
  assert.match(result.body.error, /already exists/);
});

test('audit failure aborts creation transaction and forwards the error', async () => {
  const error = new Error('audit unavailable');
  let committed = false;
  let stagedProduct = false;
  stub(prisma, '$transaction', async (callback: any) => {
    const result = await callback({
      product: { create: async ({ data }: any) => { stagedProduct = true; return { id: 'sku', ...data }; } },
      auditLog: { create: async () => { throw error; } },
    });
    committed = true;
    return result;
  });
  await assert.rejects(invoke(valid), error);
  assert.equal(stagedProduct, true);
  assert.equal(committed, false);
});
