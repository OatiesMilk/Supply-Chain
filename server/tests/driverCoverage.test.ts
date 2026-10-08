import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA_HIERARCHY } from '../src/areaHierarchy';
import { AREA_HIERARCHY as CLIENT_AREA_HIERARCHY } from '../../client/src/data';
import { planCoverageMigration } from '../src/services/driverCoverage';
import { canonicalCoverageList } from '../src/services/driverDirectory';

test('the server area list stays identical to the client AREA_HIERARCHY', () => {
  assert.deepEqual(AREA_HIERARCHY, CLIENT_AREA_HIERARCHY);
});

test('legacy keywords map to exact canonical Areas, never by substring', () => {
  assert.deepEqual(planCoverageMigration(['Makati', 'BGC', 'Taguig']).coverage, ['Makati CBD', 'BGC (Taguig)']);
  assert.deepEqual(planCoverageMigration(['Manila']).coverage, ['Manila - Binondo', 'Manila - Ermita', 'Manila - Malate']);
  // Quezon City maps to its own Areas, not to "Central QC / Manila", which would also cover Manila.
  assert.ok(!planCoverageMigration(['Quezon City']).coverage.includes('Central QC / Manila'));
  assert.deepEqual(planCoverageMigration(['Metro Manila', 'Makatii', 'Mandaluyong']), {
    coverage: ['Mandaluyong'], unmapped: ['Metro Manila', 'Makatii'], changed: true,
  });
});

test('an explicit Subregion keeps its name and makes its own Areas redundant', () => {
  const plan = planCoverageMigration(['Mandaluyong', 'San Juan', 'Pasig', 'Ortigas Corridor', 'Makati']);
  assert.deepEqual(plan.coverage, ['Ortigas Corridor', 'Makati CBD']);
});

test('migration is idempotent: canonical coverage is unchanged on a second run', () => {
  const first = planCoverageMigration(['Quezon City', 'Bulacan', 'Cainta', 'antipolo']);
  assert.equal(first.changed, true);
  const second = planCoverageMigration(first.coverage);
  assert.deepEqual(second, { coverage: first.coverage, unmapped: [], changed: false });
  assert.equal(planCoverageMigration([]).changed, false);
});

test('stored coverage uses canonical spelling without duplicates', () => {
  assert.deepEqual(canonicalCoverageList(['makati cbd', 'Makati CBD', ' ortigas corridor ']), ['Makati CBD', 'Ortigas Corridor']);
});

test('HTTP: POST and PUT /drivers reject coverage outside the area list before any write', async () => {
  const express = (await import('express')).default;
  const cookieParser = (await import('cookie-parser')).default;
  const { prisma } = await import('../src/db');
  const { signToken } = await import('../src/middleware/auth');
  const driversRoutes = (await import('../src/routes/drivers')).default;

  const actor: any = { id: 'logistics-1', name: 'Juan', email: 'l@example.com', role: 'LOGISTICS', isActive: true, permissions: [], driverProfile: null };
  const restores: Array<() => void> = [];
  const stub = (delegate: any, method: string, handler: (...args: any[]) => any) => {
    const original = delegate[method];
    delegate[method] = handler;
    restores.push(() => { delegate[method] = original; });
  };
  const writes: string[] = [];
  stub(prisma.user, 'findUnique', async () => actor);
  stub(prisma, '$transaction', async () => { writes.push('transaction'); throw new Error('Unexpected write'); });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/drivers', driversRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const send = (method: string, path: string, body: unknown) => fetch(url + path, {
    method, body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Cookie: `mg_session=${signToken(actor)}` },
  });
  try {
    const created = await send('POST', '/drivers', { name: 'New Driver', type: 'DRIVER', coverage_areas: ['Makati CBD', 'Makatii'] });
    assert.equal(created.status, 400);
    assert.match((await created.json() as any).error, /Makatii/);
    assert.equal((await send('PUT', '/drivers/profile-1', { coverage_areas: ['Metro Manila'] })).status, 400);
    assert.deepEqual(writes, []);
  } finally {
    restores.forEach(restore => restore());
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
