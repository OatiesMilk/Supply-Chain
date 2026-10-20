import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { prisma } from '../src/db';
import { signToken } from '../src/middleware/auth';
import driversRoutes from '../src/routes/drivers';

// TSK-119: Admin adds and renames Drivers; Logistics adds Assistants and keeps
// coverage/status edits. Exercised over HTTP against an in-memory roster.
const users: Record<string, any> = {
  ADMIN: { id: 'admin-1', name: 'System Admin', email: 'admin@example.com', role: 'ADMIN', isActive: true, permissions: [], driverProfile: null },
  LOGISTICS: { id: 'logistics-1', name: 'Juan Santos', email: 'logistics@example.com', role: 'LOGISTICS', isActive: true, permissions: [], driverProfile: null },
  SALES_COORDINATOR: { id: 'sc-1', name: 'Maria Reyes', email: 'sales@example.com', role: 'SALES_COORDINATOR', isActive: true, permissions: [], driverProfile: null },
};
let actor = users.LOGISTICS;
let rows: any[] = [];
let audits: any[] = [];
let writes = 0;
const restores: Array<() => void> = [];
let server: Server;
let url = '';

const tx = {
  $executeRaw: async () => 0,
  driver: {
    findUnique: async ({ where }: any) => rows.find(r => r.id === where.id) ?? null,
    findFirst: async ({ where }: any) => rows.find(r => r.name.toLowerCase() === where.name.equals.toLowerCase() && r.type === where.type && (!where.id || r.id !== where.id.not)) ?? null,
    create: async ({ data }: any) => { writes++; const row = { id: `profile-${rows.length + 1}`, isActive: true, userId: null, ...data }; rows.push(row); return row; },
    update: async ({ where, data }: any) => { writes++; const row = rows.find(r => r.id === where.id); Object.assign(row, data); return row; },
  },
  deliveryRecord: { count: async () => 0, updateMany: async () => ({ count: 0 }) },
  auditLog: { create: async ({ data }: any) => { audits.push(data); return {}; } },
};

before(async () => {
  const stub = (delegate: any, method: string, handler: (...args: any[]) => any) => {
    const original = delegate[method];
    delegate[method] = handler;
    restores.push(() => { delegate[method] = original; });
  };
  stub(prisma.user, 'findUnique', async () => actor);
  stub(prisma, '$transaction', async (work: any) => work(tx));
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/drivers', driversRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  restores.forEach(restore => restore());
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(() => {
  rows = [
    { id: 'driver-1', name: 'Lando Navarro', type: 'DRIVER', isActive: true, userId: null, coverageAreas: '["Makati CBD"]' },
    { id: 'assistant-1', name: 'Jayson Reyes', type: 'ASSISTANT', isActive: true, userId: null, coverageAreas: '[]' },
  ];
  audits = [];
  writes = 0;
  actor = users.LOGISTICS;
});

const send = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(url + path, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Cookie: `mg_session=${signToken(actor)}` },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

test('Logistics cannot add a Driver, explicitly or by omitting the type; nothing is written', async () => {
  for (const body of [{ name: 'Test Driver', type: 'DRIVER' }, { name: 'Test Driver' }]) {
    const res = await send('POST', '/drivers', body);
    assert.equal(res.status, 403);
    assert.match(res.body.error, /Only Admin can add drivers/);
  }
  assert.equal(writes, 0);
  assert.equal(audits.length, 0);
});

test('Logistics can add an Assistant; Admin can add a Driver; both are audited with the actor', async () => {
  const assistant = await send('POST', '/drivers', { name: 'New Helper', type: 'ASSISTANT' });
  assert.equal(assistant.status, 201);
  assert.equal(assistant.body.type, 'ASSISTANT');
  actor = users.ADMIN;
  const driver = await send('POST', '/drivers', { name: 'New Driver', type: 'DRIVER', coverage_areas: ['Ortigas Corridor'] });
  assert.equal(driver.status, 201);
  assert.equal(driver.body.type, 'DRIVER');
  assert.deepEqual(audits.map(a => [a.action, a.changedById]), [['CREATE', 'logistics-1'], ['CREATE', 'admin-1']]);
});

test('Logistics cannot change an entry type or rename a Driver; nothing is written', async () => {
  for (const [path, body] of [
    ['/drivers/assistant-1', { type: 'DRIVER' }],
    ['/drivers/driver-1', { type: 'ASSISTANT' }],
    ['/drivers/driver-1', { name: 'Someone Else' }],
    ['/drivers/driver-1', { name: 'Someone Else', coverage_areas: ['Makati CBD'] }],
  ] as const) {
    const res = await send('PUT', path, body);
    assert.equal(res.status, 403, JSON.stringify(body));
  }
  assert.equal(writes, 0);
  assert.deepEqual(rows.map(r => [r.name, r.type]), [['Lando Navarro', 'DRIVER'], ['Jayson Reyes', 'ASSISTANT']]);
});

test('Logistics keeps coverage and status edits, may resend the unchanged Driver name, and may rename Assistants', async () => {
  const coverage = await send('PUT', '/drivers/driver-1', { name: 'Lando Navarro', coverage_areas: ['Ortigas Corridor'] });
  assert.equal(coverage.status, 200);
  assert.deepEqual(coverage.body.coverage_areas, ['Ortigas Corridor']);
  assert.equal((await send('DELETE', '/drivers/driver-1')).status, 204);
  assert.equal(rows[0].isActive, false);
  const reactivated = await send('PUT', '/drivers/driver-1', { is_active: true });
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.is_active, true);
  assert.equal((await send('PUT', '/drivers/assistant-1', { name: 'Jayson R. Reyes' })).status, 200);
  assert.ok(audits.every(a => a.changedById === 'logistics-1' && a.action === 'UPDATE'));
});

test('Admin can rename a Driver and change an unassigned entry type', async () => {
  actor = users.ADMIN;
  assert.equal((await send('PUT', '/drivers/driver-1', { name: 'Lando P. Navarro' })).status, 200);
  assert.equal((await send('PUT', '/drivers/assistant-1', { type: 'DRIVER' })).status, 200);
  assert.deepEqual(rows.map(r => [r.name, r.type]), [['Lando P. Navarro', 'DRIVER'], ['Jayson Reyes', 'DRIVER']]);
});

test('Sales Coordinator still cannot write the roster', async () => {
  actor = users.SALES_COORDINATOR;
  assert.equal((await send('POST', '/drivers', { name: 'Helper', type: 'ASSISTANT' })).status, 403);
  assert.equal((await send('PUT', '/drivers/driver-1', { coverage_areas: [] })).status, 403);
  assert.equal(writes, 0);
});
