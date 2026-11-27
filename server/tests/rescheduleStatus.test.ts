import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { prisma } from '../src/db';
import records from '../src/routes/records';
import { signToken } from '../src/middleware/auth';
import { manilaToday } from '../src/services/deliveryLifecycle';
import { recordEditVersion } from '../src/services/recordEditVersion';
import { installRmaPolicyLookup, rmaTestAccount } from './rmaTestPolicy';

const restorers: Array<() => void> = [];
function stub(target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  const replacement = mock.fn(implementation);
  target[key] = replacement;
  restorers.push(() => { target[key] = original; });
  return replacement;
}

const shiftDate = (date: string, days: number) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

let restoreRmaPolicy: (() => void) | undefined;
const savedPermMode = process.env.PERMISSION_MODE;

beforeEach(() => {
  process.env.PERMISSION_MODE = 'LEGACY';
  restoreRmaPolicy = installRmaPolicyLookup();
});

afterEach(() => {
  while (restorers.length) restorers.pop()!();
  mock.restoreAll();
  restoreRmaPolicy?.();
  if (savedPermMode === undefined) delete process.env.PERMISSION_MODE;
  else process.env.PERMISSION_MODE = savedPermMode;
});

async function patchStatus(currentRecord: any, body: Record<string, unknown>, role = 'LOGISTICS') {
  const actor = rmaTestAccount({
    id: 'user-log-1',
    name: 'Logistics Officer',
    email: 'log@example.test',
    role,
    isActive: true,
    permissions: [],
    driverProfile: null,
  });

  let updatedData: any = null;
  stub(prisma.user, 'findUnique', async () => actor as any);
  stub(prisma.deliveryRecord, 'findFirst', async () => currentRecord);
  stub(prisma, '$transaction', async (work: any) => {
    const tx = {
      $queryRaw: async () => [{ id: currentRecord.id }],
      deliveryRecord: {
        findFirst: async () => currentRecord,
        findUnique: async () => currentRecord,
        update: async ({ data }: any) => {
          updatedData = data;
          return { ...currentRecord, ...data };
        },
      },
      auditLog: { create: async () => ({}) },
      remarkLog: { create: async () => ({}) },
      notification: { createMany: async () => ({ count: 0 }) },
    };
    return work(tx);
  });

  const route = records.stack.find((layer: any) => layer.route?.path === '/:id/status' && layer.route.methods.patch)!.route!;
  const req: any = {
    method: 'PATCH',
    headers: {},
    cookies: { mg_session: signToken({ id: actor.id, name: actor.name, email: actor.email, role: actor.role } as any) },
    params: { id: currentRecord.id },
    body: body.delivery_date !== undefined
      ? { expected_edit_version: recordEditVersion(currentRecord), ...body }
      : body,
  };

  return new Promise<{ status: number; body: any; updatedData: any }>((resolve, reject) => {
    const headers: Record<string, string> = {};
    const res: any = {
      statusCode: 200,
      setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; },
      getHeader(k: string) { return headers[k.toLowerCase()]; },
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) { resolve({ status: this.statusCode, body: payload, updatedData }); return this; },
    };
    let index = 0;
    const next = (err?: unknown) => {
      if (err) return reject(err);
      const layer = route.stack[index++];
      if (!layer) return reject(new Error('No response sent'));
      try {
        const result = layer.handle(req, res, next);
        if (result && typeof result.then === 'function') result.catch(reject);
      } catch (error) {
        reject(error);
      }
    };
    next();
  });
}

const baseRecord = (category: string) => ({
  id: `rec-${category.toLowerCase()}`,
  recordNo: `TST-26-00001`,
  category,
  status: 'IN_TRANSIT',
  draft: false,
  reference: 'REF-100',
  rmaReference: null,
  priority: '2 - Moderate',
  driver: 'Assigned Driver',
  driverId: 'driver-1',
  driverAssistants: '[]',
  companyId: 'comp-1',
  company: { id: 'comp-1', name: 'Test Company' },
  accountManager: 'Test AM',
  deliveryDate: manilaToday(),
  timeIn: '2026-11-13T01:00:00.000Z',
  timeOut: null,
  receivedBy: null,
  deletedAt: null,
  area: 'Makati',
  address: '123 Street',
  remarks: 'Init',
  collectionAmount: null,
  collectionVerified: false,
  collectionVerifiedAt: null,
  collectionVerifiedBy: null,
  rmaMovement: null,
  rmaTransportStatus: null,
  rmaTransportStartedAt: null,
  rmaReceivedAt: null,
  rmaReceivedBy: null,
  rmaRecipient: null,
  rmaVersion: 0,
  createdAt: new Date('2026-11-12T00:00:00Z'),
  updatedAt: new Date('2026-11-13T01:00:00Z'),
});

test('PATCH /records/:id/status Rescheduled accepts non-Delivery categories without delivery_date and rejects delivery_date on them', async () => {
  const nextDate = shiftDate(manilaToday(), 2);

  for (const category of ['PROCUREMENT_PICKUP', 'SALES_ORDERS', 'ACCOUNTING_COLLECTION']) {
    const rec = baseRecord(category);
    const ok = await patchStatus(rec, { status: 'Rescheduled', remarks: 'Client asked to move' });
    assert.equal(ok.status, 200, `${category} should reschedule without delivery_date`);
    assert.equal(ok.updatedData.status, 'RESCHEDULED');
    assert.equal(ok.updatedData.timeIn, null);
    assert.equal(ok.updatedData.timeOut, null);
    assert.equal(ok.updatedData.receivedBy, null);

    const rejected = await patchStatus(rec, { status: 'Rescheduled', remarks: 'Client asked to move', delivery_date: nextDate });
    assert.equal(rejected.status, 400, `${category} should reject delivery_date in status action`);
  }

  const deliveryRec = baseRecord('DELIVERY');
  const missingDate = await patchStatus(deliveryRec, { status: 'Rescheduled', remarks: 'Client asked to move' });
  assert.equal(missingDate.status, 400);

  const deliveryOk = await patchStatus(deliveryRec, { status: 'Rescheduled', remarks: 'Client asked to move', delivery_date: nextDate });
  assert.equal(deliveryOk.status, 200);
  assert.equal(deliveryOk.updatedData.deliveryDate, nextDate);
});
