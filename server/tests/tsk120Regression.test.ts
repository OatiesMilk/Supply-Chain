import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';
import authRoutes from '../src/routes/auth';
import recordsRoutes from '../src/routes/records';
import { recordEditVersion } from '../src/services/recordEditVersion';

afterEach(() => mock.restoreAll());

const setupApp = async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRoutes);
  app.use('/records', recordsRoutes);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
};

const account = {
  id: 'sc-120',
  name: 'Maria Reyes',
  email: 'sales-120@example.com',
  role: 'SALES_COORDINATOR',
  permissions: [],
  isActive: true,
  password: bcrypt.hashSync('test-password', 4),
};

const draftRecord = (id: string, category: string, reference: string) => ({
  id,
  companyId: 'company-120',
  priority: '2 - Moderate',
  reference,
  remarks: '',
  status: 'SCHEDULED',
  vehicle: '(None)',
  area: 'Makati',
  driver: '',
  driverAssistants: '[]',
  timeIn: null,
  timeOut: null,
  receivedBy: null,
  accountManager: '',
  deliveryDate: '2026-10-08',
  category,
  itemType: 'Small Item',
  draft: true,
  itemDescription: 'TSK-120 regression fixture',
  lineItems: [],
  address: '',
  documentAttachment: null,
  amount: null,
  linkedCollectionId: null,
  collectionVerified: false,
  collectionVerifiedBy: null,
  collectionVerifiedAt: null,
  createdById: account.id,
  modifiedById: account.id,
  createdBy: { name: account.name },
  modifiedBy: { name: account.name },
  company: { name: 'TSK-120 Test Company' },
  linkedCollection: null,
  podAttachments: [],
  deletedAt: null,
  createdAt: new Date('2026-10-08T00:00:00.000Z'),
  updatedAt: new Date('2026-10-08T00:00:00.000Z'),
});

test('submitting an unassigned Delivery Draft notifies Logistics once for each ordinary category', async () => {
  const { url, close } = await setupApp();
  const original = {
    userFindUnique: prisma.user.findUnique,
    userFindMany: prisma.user.findMany,
    notificationCreateMany: prisma.notification.createMany,
    recordFindFirst: prisma.deliveryRecord.findFirst,
    transaction: prisma.$transaction,
  };
  const records = new Map([
    ['REC-TSK120-DRAFT', draftRecord('REC-TSK120-DRAFT', 'DELIVERY', 'SAP-TSK120-DELIVERY')],
    ['REC-TSK120-SALES-ORDER', draftRecord('REC-TSK120-SALES-ORDER', 'SALES_ORDERS', 'SO-TSK120')],
  ]);
  const logisticsUser = { id: 'logistics-120' };
  const notifications = mock.fn(async () => ({ count: 1 }));
  const tx = {
    user: { findMany: async (query: any) => prisma.user.findMany(query) },
    notification: { createMany: async (query: any) => prisma.notification.createMany(query) },
    $queryRaw: mock.fn(async () => []),
    deliveryRecord: {
      findUnique: mock.fn(async ({ where }: any) => records.get(where.id) ?? null),
      update: mock.fn(async ({ where, data }: any) => {
        const updated = { ...records.get(where.id)!, ...data, updatedAt: new Date() };
        records.set(where.id, updated);
        return updated;
      }),
    },
    auditLog: { create: mock.fn(async () => ({})) },
    remarkLog: { create: mock.fn(async () => ({})) },
  };

  prisma.user.findUnique = mock.fn(async () => account) as any;
  prisma.user.findMany = mock.fn(async ({ where }: any) => where.role === 'LOGISTICS' ? [logisticsUser] : []) as any;
  prisma.notification.createMany = notifications as any;
  prisma.deliveryRecord.findFirst = mock.fn(async ({ where }: any) => records.get(where.id) ?? null) as any;
  prisma.$transaction = mock.fn(async (work: any) => work(tx)) as any;

  try {
    const login = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: 'test-password' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];

    const submit = async (id: string) => fetch(`${url}/records/${id}/status`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Scheduled', remarks: 'Submitting the order for dispatch.' }),
    });

    const deliveryResponse = await submit('REC-TSK120-DRAFT');
    assert.equal(deliveryResponse.status, 200);
    const submittedDelivery = await deliveryResponse.json() as any;
    assert.equal(submittedDelivery.status, 'Scheduled');
    assert.equal(submittedDelivery.is_draft, 'No');
    assert.equal(submittedDelivery.driver, '');
    assert.equal(notifications.mock.callCount(), 1);
    const notificationData = (notifications.mock.calls[0].arguments[0] as any).data;
    assert.deepEqual(notificationData, [{
      userId: logisticsUser.id,
      title: 'New DELIVERY record — driver needed',
      message: 'TSK-120 Test Company · SAP-TSK120-DELIVERY on 2026-10-08 requires driver assignment.',
      recordId: 'REC-TSK120-DRAFT',
      recordType: 'DeliveryRecord',
    }]);

    const salesOrderResponse = await submit('REC-TSK120-SALES-ORDER');
    assert.equal(salesOrderResponse.status, 200);
    assert.equal(notifications.mock.callCount(), 2, 'Sales Order submission emits the same Logistics handoff event.');
  } finally {
    prisma.user.findUnique = original.userFindUnique;
    prisma.user.findMany = original.userFindMany;
    prisma.notification.createMany = original.notificationCreateMany;
    prisma.deliveryRecord.findFirst = original.recordFindFirst;
    prisma.$transaction = original.transaction;
    await close();
  }
});

test('Logistics cannot create a Delivery; Sales Coordinator owns creation', async () => {
  const { url, close } = await setupApp();
  const logisticsAccount = {
    ...account,
    id: 'logistics-120-create',
    name: 'Juan Santos',
    email: 'logistics-120-create@example.com',
    role: 'LOGISTICS',
  };
  const original = {
    userFindUnique: prisma.user.findUnique,
    userFindMany: prisma.user.findMany,
    notificationCreateMany: prisma.notification.createMany,
    transaction: prisma.$transaction,
    companyFindUnique: prisma.company.findUnique,
  };
  const created = {
    ...draftRecord('REC-TSK120-LOGISTICS-CREATED', 'DELIVERY', 'SAP-TSK120-LOGISTICS'),
    draft: false,
    company: { name: 'TSK-120 Test Company' },
  };
  const create = mock.fn(async () => created);
  const notificationCreateMany = mock.fn(async () => ({ count: 1 }));
  const tx = {
    deliveryRecord: { create },
    auditLog: { create: mock.fn(async () => ({})) },
    remarkLog: { create: mock.fn(async () => ({})) },
  };

  prisma.company.findUnique = mock.fn(async () => ({ id: 'company-120' })) as any;
  prisma.user.findUnique = mock.fn(async () => logisticsAccount) as any;
  prisma.user.findMany = mock.fn(async ({ where }: any) => where.role === 'LOGISTICS' ? [{ id: logisticsAccount.id }] : []) as any;
  prisma.notification.createMany = notificationCreateMany as any;
  prisma.$transaction = mock.fn(async (work: any) => work(tx)) as any;

  try {
    const login = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: logisticsAccount.email, password: 'test-password' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];

    const response = await fetch(`${url}/records`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: 'company-120',
        reference: 'SAP-TSK120-LOGISTICS',
        category: 'Deliveries',
        delivery_date: '2026-10-08',
      }),
    });

    assert.equal(response.status, 403);
    assert.match((await response.json() as any).error, /Only Sales Coordinator or Admin may create Deliveries/);
    assert.equal(create.mock.callCount(), 0, 'the denied role must not create a record');
    assert.equal(notificationCreateMany.mock.callCount(), 0, 'denied creation must not notify');
  } finally {
    prisma.user.findUnique = original.userFindUnique;
    prisma.user.findMany = original.userFindMany;
    prisma.notification.createMany = original.notificationCreateMany;
    prisma.$transaction = original.transaction;
    prisma.company.findUnique = original.companyFindUnique;
    await close();
  }
});

test('Logistics assignment persists and notifies the creator while SC dispatch edits leave the Driver unchanged', async () => {
  const { url, close } = await setupApp();
  const logistics = {
    ...account,
    id: 'logistics-120-assign',
    name: 'Juan Santos',
    email: 'logistics-120-assign@example.com',
    role: 'LOGISTICS',
  };
  const driver = {
    id: 'driver-120-assign',
    name: 'Leo Driver',
    email: 'driver-120-assign@example.com',
    role: 'DRIVER',
    permissions: [],
    isActive: true,
    password: bcrypt.hashSync('test-password', 4),
    driverProfile: { id: 'profile-driver-120-assign', type: 'DRIVER' },
  };
  const scheduled = {
    ...draftRecord('REC-TSK120-ASSIGN', 'DELIVERY', 'SAP-TSK120-ASSIGN'),
    draft: false,
    status: 'SCHEDULED',
    createdById: account.id,
    createdBy: { name: account.name },
  };
  const records = new Map([[scheduled.id, scheduled]]);
  const original = {
    userFindUnique: prisma.user.findUnique,
    recordFindFirst: prisma.deliveryRecord.findFirst,
    transaction: prisma.$transaction,
    notificationCreate: prisma.notification.create,
  };
  const updates = mock.fn(async ({ where, data }: any) => {
    const updated = { ...records.get(where.id)!, ...data, updatedAt: new Date() };
    records.set(where.id, updated);
    return updated;
  });
  const creatorNotification = mock.fn(async () => ({}));
  const remarkCreate = mock.fn(async () => ({}));
  const tx = {
    $queryRaw: mock.fn(async () => []),
    $executeRaw: mock.fn(async () => []),
    deliveryRecord: {
      findUnique: mock.fn(async ({ where }: any) => records.get(where.id) ?? null),
      update: updates,
    },
    driver: { findFirst: mock.fn(async () => ({
      id: driver.driverProfile.id,
      name: driver.name,
      type: 'DRIVER',
      isActive: true,
    })) },
    auditLog: { create: mock.fn(async () => ({})) },
    remarkLog: { create: remarkCreate },
  };
  const users = [account, logistics, driver];

  prisma.user.findUnique = mock.fn(async ({ where }: any) => users.find(user =>
    where.id ? user.id === where.id : user.email === where.email
  ) ?? null) as any;
  prisma.deliveryRecord.findFirst = mock.fn(async ({ where }: any) => records.get(where.id) ?? null) as any;
  prisma.$transaction = mock.fn(async (work: any) => work(tx)) as any;
  prisma.notification.create = creatorNotification as any;

  const loginAs = async (user: typeof account) => {
    const response = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'test-password' }),
    });
    assert.equal(response.status, 200);
    return { Cookie: response.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
  };

  try {
    const logisticsHeaders = await loginAs(logistics);
    const assignment = await fetch(`${url}/records/${scheduled.id}`, {
      method: 'PUT',
      headers: logisticsHeaders,
      body: JSON.stringify({ expected_edit_version: recordEditVersion(records.get(scheduled.id)!), driver: driver.name, remarks: 'Assigning the submitted Delivery to Leo Driver.' }),
    });
    assert.equal(assignment.status, 200);
    const assigned = await assignment.json() as any;
    assert.equal(assigned.status, 'Scheduled');
    assert.equal(assigned.driver, driver.name);
    assert.equal(assigned.driver_id, driver.driverProfile.id);
    assert.equal(records.get(scheduled.id)!.driver, driver.name);
    assert.equal(records.get(scheduled.id)!.driverId, driver.driverProfile.id);
    assert.equal(updates.mock.callCount(), 1);
    assert.ok(remarkCreate.mock.calls.some(call =>
      (call.arguments[0] as any).data.body === 'Assigning the submitted Delivery to Leo Driver.'
    ));
    assert.deepEqual((creatorNotification.mock.calls[0].arguments[0] as any).data, {
      userId: account.id,
      title: 'Driver assigned',
      message: 'Leo Driver has been assigned to TSK-120 Test Company · SAP-TSK120-ASSIGN.',
      recordId: scheduled.id,
      recordType: 'DeliveryRecord',
    });

    const salesHeaders = await loginAs(account);
    const salesAssignmentAttempt = await fetch(`${url}/records/${scheduled.id}`, {
      method: 'PUT',
      headers: salesHeaders,
      body: JSON.stringify({ expected_edit_version: recordEditVersion(records.get(scheduled.id)!), driver: 'Another Driver', remarks: 'Sales Coordinator assignment denial check.' }),
    });
    assert.equal(salesAssignmentAttempt.status, 200);
    const afterSalesAttempt = await salesAssignmentAttempt.json() as any;
    assert.equal(afterSalesAttempt.driver, driver.name);
    assert.equal(afterSalesAttempt.driver_id, driver.driverProfile.id);
    assert.equal(records.get(scheduled.id)!.driver, driver.name);
    assert.equal(records.get(scheduled.id)!.driverId, driver.driverProfile.id);
    assert.equal(creatorNotification.mock.callCount(), 1, 'SC dispatch edits do not create assignment notifications.');
  } finally {
    prisma.user.findUnique = original.userFindUnique;
    prisma.deliveryRecord.findFirst = original.recordFindFirst;
    prisma.$transaction = original.transaction;
    prisma.notification.create = original.notificationCreate;
    await close();
  }
});

test('Logistics cannot assign a Draft and Driver B cannot read or mutate Driver A records', async () => {
  const { url, close } = await setupApp();
  const original = {
    userFindUnique: prisma.user.findUnique,
    recordFindFirst: prisma.deliveryRecord.findFirst,
    recordFindMany: prisma.deliveryRecord.findMany,
    transaction: prisma.$transaction,
  };
  const makeUser = (id: string, name: string, email: string, role: string) => ({
    id, name, email, role, permissions: [], isActive: true, password: bcrypt.hashSync('test-password', 4),
  });
  const logistics = makeUser('logistics-121', 'Juan Santos', 'logistics-121@example.com', 'LOGISTICS');
  const driverA = { ...makeUser('driver-a-121', 'Leo Driver', 'driver-a-121@example.com', 'DRIVER'), driverProfile: { id: 'profile-driver-a-121', type: 'DRIVER' } };
  const driverB = { ...makeUser('driver-b-121', 'Manny Driver', 'driver-b-121@example.com', 'DRIVER'), driverProfile: { id: 'profile-driver-b-121', type: 'DRIVER' } };
  const users = [logistics, driverA, driverB];
  const records = new Map([
    ['REC-TSK120-DRAFT-ASSIGN', draftRecord('REC-TSK120-DRAFT-ASSIGN', 'DELIVERY', 'SAP-TSK120-DRAFT-ASSIGN')],
    ['REC-TSK120-DRIVER-A', {
      ...draftRecord('REC-TSK120-DRIVER-A', 'DELIVERY', 'SAP-TSK120-DRIVER-A'),
      draft: false,
      driver: driverA.name,
      driverId: 'profile-driver-a-121',
    }],
  ]);
  const matchesRecordScope = (record: any, args: any) => {
    const scope = args.where?.AND?.[0];
    return !scope || (scope.driverId === undefined || record.driverId === scope.driverId) &&
      (scope.draft === undefined || record.draft === scope.draft);
  };
  const updates = mock.fn(async ({ where, data }: any) => {
    const updated = { ...records.get(where.id)!, ...data, updatedAt: new Date() };
    records.set(where.id, updated);
    return updated;
  });
  const tx = {
    $queryRaw: mock.fn(async () => []),
    $executeRaw: mock.fn(async () => []),
    deliveryRecord: {
      findUnique: mock.fn(async ({ where }: any) => records.get(where.id) ?? null),
      update: updates,
    },
    driver: { findFirst: mock.fn(async () => ({ id: 'profile-driver-a-121', name: driverA.name, type: 'DRIVER', isActive: true })) },
    auditLog: { create: mock.fn(async () => ({})) },
    remarkLog: { create: mock.fn(async () => ({})) },
  };

  prisma.user.findUnique = mock.fn(async ({ where }: any) => users.find(user =>
    where.id ? user.id === where.id : user.email === where.email
  ) ?? null) as any;
  prisma.deliveryRecord.findFirst = mock.fn(async ({ where }: any) => {
    const record = records.get(where.id);
    return record && matchesRecordScope(record, { where }) ? record : null;
  }) as any;
  prisma.deliveryRecord.findMany = mock.fn(async (args: any) => [...records.values()].filter(record => matchesRecordScope(record, args))) as any;
  prisma.$transaction = mock.fn(async (work: any) => work(tx)) as any;

  const loginAs = async (user: typeof logistics) => {
    const response = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'test-password' }),
    });
    assert.equal(response.status, 200);
    return { Cookie: response.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
  };

  try {
    const logisticsHeaders = await loginAs(logistics);
    const assignDraft = await fetch(`${url}/records/REC-TSK120-DRAFT-ASSIGN`, {
      method: 'PUT',
      headers: logisticsHeaders,
      body: JSON.stringify({ expected_edit_version: recordEditVersion(records.get('REC-TSK120-DRAFT-ASSIGN')!), driver: driverA.name, remarks: 'Drafts must be submitted before assignment.' }),
    });
    assert.equal(assignDraft.status, 400);
    assert.match((await assignDraft.json() as any).error, /New assignments to drafts are not allowed/);
    assert.equal(updates.mock.callCount(), 0);

    const driverAHeaders = await loginAs(driverA);
    const driverAList = await fetch(`${url}/records`, { headers: driverAHeaders });
    assert.equal(driverAList.status, 200);
    assert.deepEqual((await driverAList.json() as any[]).map(record => record.id), ['REC-TSK120-DRIVER-A']);

    const driverBHeaders = await loginAs(driverB);
    const driverBList = await fetch(`${url}/records`, { headers: driverBHeaders });
    assert.equal(driverBList.status, 200);
    assert.deepEqual(await driverBList.json(), []);

    const deniedRead = await fetch(`${url}/records/REC-TSK120-DRIVER-A`, { headers: driverBHeaders });
    assert.equal(deniedRead.status, 403);
    const deniedMutation = await fetch(`${url}/records/REC-TSK120-DRIVER-A/status`, {
      method: 'PATCH',
      headers: driverBHeaders,
      body: JSON.stringify({ status: 'Pending', remarks: 'Cross-driver mutation attempt.' }),
    });
    assert.equal(deniedMutation.status, 403);
    assert.equal(updates.mock.callCount(), 0, 'Denied Driver B requests do not write records.');
  } finally {
    prisma.user.findUnique = original.userFindUnique;
    prisma.deliveryRecord.findFirst = original.recordFindFirst;
    prisma.deliveryRecord.findMany = original.recordFindMany;
    prisma.$transaction = original.transaction;
    await close();
  }
});
