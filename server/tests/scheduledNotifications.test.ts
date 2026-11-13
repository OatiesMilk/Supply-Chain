import assert from 'node:assert/strict';
import { mock, test, type TestContext } from 'node:test';
import nodemailer from 'nodemailer';
import { prisma } from '../src/db';
import type * as mailer from '../src/services/mailer';
import { notify4PM, notifyWeeklyReport } from '../src/services/scheduledNotifications';
import { notificationVisibility } from '../src/services/notificationVisibility';
import { sessionUser } from '../src/services/permissions';
import type { AuthUser } from '../src/middleware/auth';

function stubEnv(t: TestContext, mode = 'LEGACY') {
  const saved = {
    PERMISSION_MODE: process.env.PERMISSION_MODE,
    SMTP_HOST: process.env.SMTP_HOST,
    AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
    AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
    AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
  };
  delete process.env.AZURE_CLIENT_ID;
  delete process.env.AZURE_CLIENT_SECRET;
  delete process.env.AZURE_TENANT_ID;
  process.env.PERMISSION_MODE = mode;
  process.env.SMTP_HOST = 'isolated-scheduler.test';
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  t.after(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });
}

function installStubs(t: TestContext) {
  const restorers: Array<() => void> = [];
  const stub = (obj: any, key: string, fn: (...args: any[]) => any) => {
    const prev = obj[key];
    obj[key] = mock.fn(fn);
    restorers.push(() => { obj[key] = prev; });
  };
  t.after(() => {
    while (restorers.length) restorers.pop()!();
  });
  return stub;
}

test('4 PM summary resolves AM via directory rules, filters by record access, and stores ScopedSummary linkage', async (t) => {
  stubEnv(t, 'LEGACY');
  const stub = installStubs(t);

  const activeAmUser = {
    id: 'user-am-active',
    name: 'Alice Mercado',
    email: 'alice@example.test',
    role: 'SALES_COORDINATOR',
    isActive: true,
    permissions: [],
    authorizationRevision: 1n,
    driverProfile: null,
  };
  const deactivatedAmUser = {
    id: 'user-am-deactivated',
    name: 'Bob Inactive',
    email: 'bob@example.test',
    role: 'SALES_COORDINATOR',
    isActive: true,
    permissions: [],
    authorizationRevision: 1n,
    driverProfile: null,
  };
  const duplicateUsers = [
    { id: 'user-dup-1', name: 'Carlos Duplicate', email: 'carlos1@example.test', role: 'SALES_COORDINATOR', isActive: true, permissions: [], driverProfile: null },
    { id: 'user-dup-2', name: 'Carlos Duplicate', email: 'carlos2@example.test', role: 'SALES_COORDINATOR', isActive: true, permissions: [], driverProfile: null },
  ];
  const allUsers = [activeAmUser, deactivatedAmUser, ...duplicateUsers];

  const directoryEntries = [
    { name: 'Alice Mercado', normalizedName: 'alice mercado', isActive: true, user: activeAmUser },
    { name: 'Bob Inactive', normalizedName: 'bob inactive', isActive: false, user: deactivatedAmUser },
    { name: 'Linked Inactive', normalizedName: 'linked inactive', isActive: true, user: { ...activeAmUser, id: 'user-inactive', name: 'Linked Inactive', isActive: false } },
  ];

  const createdNotifications: any[] = [];
  const createdLogs: any[] = [];
  const sentEmails: mailer.MailMessage[] = [];

  stub(prisma.deliveryRecord, 'findMany', async ({ where }: any) => {
    if (where?.status === 'SCHEDULED') return [];
    return [
      { id: 'rec-del-1', recordNo: 'DEL-26-00001', reference: 'REF-1', category: 'DELIVERY', status: 'SCHEDULED', draft: false, driverId: null, accountManager: 'Alice Mercado', company: { name: 'Acme Corp' } },
      { id: 'rec-rma-1', recordNo: 'RMA-26-00001', reference: 'RMA-1', category: 'RMA', status: 'SCHEDULED', draft: false, driverId: null, accountManager: 'Alice Mercado', company: { name: 'Acme Corp' } },
      { id: 'rec-deact', recordNo: 'DEL-26-00002', reference: 'REF-2', category: 'DELIVERY', status: 'SCHEDULED', draft: false, driverId: null, accountManager: 'Bob Inactive', company: { name: 'Beta Corp' } },
      { id: 'rec-linked-off', recordNo: 'DEL-26-00003', reference: 'REF-3', category: 'DELIVERY', status: 'SCHEDULED', draft: false, driverId: null, accountManager: 'Linked Inactive', company: { name: 'Gamma Corp' } },
      { id: 'rec-dup', recordNo: 'DEL-26-00004', reference: 'REF-4', category: 'DELIVERY', status: 'SCHEDULED', draft: false, driverId: null, accountManager: 'Carlos Duplicate', company: { name: 'Delta Corp' } },
    ];
  });
  stub(prisma.notificationLog, 'findFirst', async () => null);
  stub(prisma.accountManager, 'findUnique', async ({ where }: any) => {
    const found = directoryEntries.find(entry => entry.normalizedName === where.normalizedName);
    return found ? { isActive: found.isActive, user: found.user } : null;
  });
  stub(prisma.user, 'findMany', async ({ where }: any) => {
    if (where?.name?.equals) {
      return allUsers.filter(u => u.isActive && u.name.toLowerCase() === where.name.equals.toLowerCase());
    }
    return [];
  });
  stub(prisma.user, 'findUnique', async ({ where }: any) => allUsers.find(u => u.id === where.id) ?? null);
  stub(prisma.notification, 'create', async ({ data }: any) => { createdNotifications.push(data); return data; });
  stub(prisma.notificationLog, 'create', async ({ data }: any) => { createdLogs.push(data); return data; });
  stub(nodemailer, 'createTransport', () => ({
    sendMail: async (message: mailer.MailMessage) => { sentEmails.push(message); return {}; },
  }));

  await notify4PM(new Date('2026-11-13T08:00:00.000Z'));

  // Only Alice Mercado qualifies; deactivated AM, inactive linked login, and duplicate names are skipped.
  assert.equal(createdNotifications.length, 1);
  assert.equal(sentEmails.length, 1);
  assert.equal(createdLogs.length, 1);

  const notif = createdNotifications[0];
  const expectedSession = { ...sessionUser(activeAmUser), driverProfileId: null } as AuthUser;
  assert.equal(notif.userId, activeAmUser.id);
  assert.equal(notif.recordType, 'ScopedSummary');
  assert.equal(notif.recordId, expectedSession.permissionVersion);
  assert.notEqual(notif.recordType, 'DeliveryRecord');
  assert.ok(notif.title.includes('1 open record'), 'Sales Coordinator count excludes unauthorized RMA');
  assert.ok(notif.message.includes('DEL-26-00001'));
  assert.ok(!notif.message.includes('RMA-26-00001'));

  // Confirm ScopedSummary is not blocked by DeliveryRecord visibility in LEGACY mode.
  const visibilitySql = notificationVisibility(expectedSession);
  assert.ok(visibilitySql.sql.includes("IS DISTINCT FROM 'DeliveryRecord'"));

  assert.equal(sentEmails[0].to, 'alice@example.test');
  assert.equal(createdLogs[0].recipientName, 'Alice Mercado');
  assert.equal(createdLogs[0].status, 'SENT');
});

test('Weekly report logs per-recipient outcomes instead of collapsing mixed failures into SENT', async (t) => {
  stubEnv(t, 'LEGACY');
  const stub = installStubs(t);

  const recipients = [
    { id: 'u-log', email: 'log@example.test', name: 'Logistics User', role: 'LOGISTICS' },
    { id: 'u-adm', email: 'fail@example.test', name: 'Admin User', role: 'ADMIN' },
  ];
  const createdNotifications: any[] = [];
  const createdLogs: any[] = [];

  stub(prisma.deliveryRecord, 'findMany', async () => [
    { status: 'ACCOMPLISHED', category: 'DELIVERY' },
    { status: 'ON_HOLD', category: 'DELIVERY' },
  ]);
  stub(prisma.user, 'findMany', async () => recipients);
  stub(prisma.notification, 'create', async ({ data }: any) => { createdNotifications.push(data); return data; });
  stub(prisma.notificationLog, 'create', async ({ data }: any) => { createdLogs.push(data); return data; });
  stub(nodemailer, 'createTransport', () => ({
    sendMail: async (message: mailer.MailMessage) => {
      if (message.to === 'fail@example.test') throw new Error('Simulated recipient rejection');
      return {};
    },
  }));

  await notifyWeeklyReport(new Date('2026-11-13T08:00:00.000Z'));

  assert.equal(createdNotifications.length, 2);
  assert.equal(createdLogs.length, 2);
  assert.deepEqual(
    createdLogs.map(entry => ({ role: entry.recipientRole, name: entry.recipientName, status: entry.status })),
    [
      { role: 'LOGISTICS', name: 'Logistics User', status: 'SENT' },
      { role: 'ADMIN', name: 'Admin User', status: 'FAILED' },
    ],
  );
});

test('Weekly report logs SKIPPED when there are no active Logistics or Admin recipients', async (t) => {
  stubEnv(t, 'LEGACY');
  const stub = installStubs(t);
  const createdLogs: any[] = [];

  stub(prisma.deliveryRecord, 'findMany', async () => []);
  stub(prisma.user, 'findMany', async () => []);
  stub(prisma.notificationLog, 'create', async ({ data }: any) => { createdLogs.push(data); return data; });

  await notifyWeeklyReport(new Date('2026-11-13T08:00:00.000Z'));

  assert.equal(createdLogs.length, 1);
  assert.equal(createdLogs[0].triggerEvent, 'WEEKLY_REPORT');
  assert.equal(createdLogs[0].status, 'SKIPPED');
});
