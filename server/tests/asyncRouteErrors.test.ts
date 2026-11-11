import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import skus from '../src/routes/skus';
import notifications from '../src/routes/notifications';

function handler(router: any, path: string, method: 'get' | 'patch' = 'get') {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} was not registered.`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

test('SKU listing and details forward database errors to Express', async () => {
  const failure = new Error('Database connection failed');
  const originalFindMany = prisma.product.findMany;
  const originalFindFirst = prisma.product.findFirst;

  (prisma.product as any).findMany = async () => { throw failure; };
  (prisma.product as any).findFirst = async () => { throw failure; };

  try {
    let forwardedListError: unknown;
    await handler(skus, '/')({} as any, {} as any, (err: unknown) => { forwardedListError = err; });
    assert.equal(forwardedListError, failure);

    let forwardedDetailError: unknown;
    await handler(skus, '/:id')({ params: { id: 'test' } } as any, {} as any, (err: unknown) => { forwardedDetailError = err; });
    assert.equal(forwardedDetailError, failure);
  } finally {
    prisma.product.findMany = originalFindMany;
    prisma.product.findFirst = originalFindFirst;
  }
});

test('Notification listing and unread count forward database errors to Express', async () => {
  const failure = new Error('Notification database query error');
  const originalQueryRaw = prisma.$queryRaw;

  (prisma as any).$queryRaw = async () => { throw failure; };

  const testUser = { id: 'u1', role: 'LOGISTICS', effectiveScreens: ['main'], permissions: [] };

  try {
    let forwardedNotifError: unknown;
    await handler(notifications, '/')({ user: testUser } as any, {} as any, (err: unknown) => { forwardedNotifError = err; });
    assert.equal(forwardedNotifError, failure);

    let forwardedCountError: unknown;
    await handler(notifications, '/unread-count')({ user: testUser } as any, {} as any, (err: unknown) => { forwardedCountError = err; });
    assert.equal(forwardedCountError, failure);
  } finally {
    prisma.$queryRaw = originalQueryRaw;
  }
});
