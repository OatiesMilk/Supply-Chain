import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/db';
import records from '../src/routes/records';
import { signToken } from '../src/middleware/auth';
import { serializeRecord } from '../src/mappings';
import { recordEditVersion } from '../src/services/recordEditVersion';
import { safeBusinessAudit } from '../src/services/businessAudit';
import { recordMutationInputError } from '../src/services/recordOperations';
import { manilaToday } from '../src/services/deliveryLifecycle';
import {
  NON_RMA_FIELD_ERRORS, RMA_PAIR_INCOMPLETE_ERROR, RMA_PAIR_SAME_ERROR, RMA_SERIAL_MODE_ERROR, RMA_SERVICE_SLIP_RTC_ONLY_ERROR,
  isReturnToCustomerCategory, nonRmaFieldError, normalizeRmaContacts, normalizeRmaLineItems, rmaFormWrite, rmaInputError,
  rmaServiceSlipError, storedLineItemsPairError, syncLegacyContactSnapshot,
} from '../src/services/rmaRules';
import { installRmaPolicyLookup, matchesRecordWhere, rmaTestAccount } from './rmaTestPolicy';

// ── Pure rules ──────────────────────────────────────────────────────────────

test('Service Slip (SS#) is accepted only on Return to Customer Slip records, including legacy aliases', () => {
  for (const value of ['Return to Customer Slip', 'Return to Customer', 'RTC']) assert.equal(isReturnToCustomerCategory(value), true, value);
  for (const value of ['Pull Out Slip', 'Return to Supplier Slip', 'Advance Replacement Slip', 'Receiving Slip', 'Transfer Out Slip', 'Others', null, undefined]) {
    assert.equal(isReturnToCustomerCategory(value), false, String(value));
    assert.equal(rmaServiceSlipError(value, 'SS#60142'), RMA_SERVICE_SLIP_RTC_ONLY_ERROR, String(value));
    assert.equal(rmaServiceSlipError(value, '  '), null, 'blank SS# is ignored');
  }
  assert.equal(rmaServiceSlipError('Return to Customer Slip', 'SS#60142'), null);
});

test('structured line items normalize Unit/Item, single SN, replacement pairs and per-item purchase details', () => {
  const result = normalizeRmaLineItems([
    { sku: ' Lenovo E14 ', quantity: '1', unit_type: 'Unit', new_serial_number: 'NEW-1', defective_serial_number: 'DEF-1', purchase_date: '2025-08-14',
      sales_order_no: '12019325', accessories: 'Power Adaptor', problem_description: 'No Display Upon Startup', repair_note: 'Replacement unit', status_tag: 'UNIT REPAIRED/FOR DELIVERY' },
    { description: 'Power Adaptor', quantity: 1, unit_type: 'Item', serial_number: 'PA-9' },
    { sku: 'Legacy SKU', quantity: 3 },
  ], { requireCompletePairs: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.items.map(item => [item.position, item.sku, item.quantity, item.unitType]), [[0, 'Lenovo E14', 1, 'Unit'], [1, 'Power Adaptor', 1, 'Item'], [2, 'Legacy SKU', 3, null]]);
  assert.equal(result.items[0].newSerialNumber, 'NEW-1');
  assert.equal(result.items[0].defectiveSerialNumber, 'DEF-1');
  assert.equal(result.items[0].salesOrderNo, '12019325');
  assert.equal(result.items[0].statusTag, 'UNIT REPAIRED/FOR DELIVERY');
  assert.equal(result.items[1].serialNumber, 'PA-9');
  assert.equal(result.items[2].serialNumber, null);
});

test('line item validation rejects mixed serial modes, identical pairs, bad unit types, dates and quantities', () => {
  const error = (items: unknown[], requireCompletePairs = true) => { const result = normalizeRmaLineItems(items, { requireCompletePairs }); return result.ok ? null : result.error; };
  assert.equal(error([{ sku: 'A', serial_number: 'S1', new_serial_number: 'N1' }]), RMA_SERIAL_MODE_ERROR);
  assert.equal(error([{ sku: 'A', serial_number: 'S1', defective_serial_number: 'D1' }], false), RMA_SERIAL_MODE_ERROR);
  assert.equal(error([{ sku: 'A', new_serial_number: 'abc', defective_serial_number: 'ABC' }]), RMA_PAIR_SAME_ERROR);
  assert.equal(error([{ sku: 'A', new_serial_number: 'N1' }]), RMA_PAIR_INCOMPLETE_ERROR, 'a submitted record needs the full pair');
  assert.equal(error([{ sku: 'A', new_serial_number: 'N1' }], false), null, 'a draft may hold half a pair');
  assert.equal(error([{ sku: 'A', unit_type: 'Box' }]), 'Item unit type must be "Unit" or "Item".');
  assert.equal(error([{ sku: 'A', purchase_date: '2025-02-30' }]), 'Item Purchase Date must be a valid YYYY-MM-DD date.');
  assert.equal(error([{ sku: 'A', quantity: 0 }]), 'Item quantity must be a whole number of at least 1.');
  assert.equal(error([{ sku: 'A', quantity: 1.5 }]), 'Item quantity must be a whole number of at least 1.');
  assert.equal(error([{ sku: '  ' }]), 'Each item requires a unit description or model.');
  assert.equal(error([{ sku: 'A', status_tag: 'x'.repeat(101) }]), 'Status Tag must be 100 characters or fewer.');
  assert.equal(error(Array.from({ length: 51 }, () => ({ sku: 'A' }))), 'Enter at most 50 items.');
  assert.equal(storedLineItemsPairError([{ newSerialNumber: 'N1', defectiveSerialNumber: null }]), RMA_PAIR_INCOMPLETE_ERROR);
  assert.equal(storedLineItemsPairError([{ newSerialNumber: 'N1', defectiveSerialNumber: 'D1' }, { newSerialNumber: null, defectiveSerialNumber: null }]), null);
});

test('multiple contacts normalize and keep the legacy single-contact snapshot in step', () => {
  const result = normalizeRmaContacts([
    { name: ' Alvin Gatus ', phone: '+639989765266' }, { name: 'Raymond Oliva' }, { name: 'Jefferson Sualog', phone: '' }, { name: '', phone: '', email: '' },
    { name: 'Ops', email: 'ops@example.com', phone: '+639170000000' },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.contacts.length, 4, 'fully blank rows are dropped');
  assert.deepEqual(syncLegacyContactSnapshot(result.contacts), {
    customerContactName: 'Alvin Gatus / Raymond Oliva / Jefferson Sualog / Ops',
    customerContactPhone: '+639989765266 / +639170000000',
    customerContactEmail: 'ops@example.com',
  });
  assert.deepEqual(syncLegacyContactSnapshot([]), { customerContactName: null, customerContactPhone: null, customerContactEmail: null });
  const bad = normalizeRmaContacts([{ name: 'A', email: 'not-an-email' }]);
  assert.equal(bad.ok ? null : bad.error, 'Contact Email must be a valid email address.');
  const many = normalizeRmaContacts(Array.from({ length: 11 }, (_, i) => ({ name: `C${i}` })));
  assert.equal(many.ok ? null : many.error, 'Enter at most 10 contacts.');
  assert.equal(rmaInputError({ rma_contacts: 'Alvin' }), 'Contacts must be a list.');
  assert.equal(rmaInputError({ case_number: 42 }), 'Case Number must be text.');
  assert.equal(rmaInputError({ client_remarks: 'x'.repeat(2001) }), 'Client Slip Remarks must be 2000 characters or fewer.');
});

test('RMA-only fields are rejected on other record types only when non-empty', () => {
  assert.equal(nonRmaFieldError({ case_number: 'CAS-1' }), NON_RMA_FIELD_ERRORS.case_number);
  assert.equal(nonRmaFieldError({ service_slip_no: 'SS#1' }), NON_RMA_FIELD_ERRORS.service_slip_no);
  assert.equal(nonRmaFieldError({ client_remarks: 'SAP#1' }), NON_RMA_FIELD_ERRORS.remarks);
  assert.equal(nonRmaFieldError({ internal_logistics_remarks: 'call' }), NON_RMA_FIELD_ERRORS.remarks);
  assert.equal(nonRmaFieldError({ rma_contacts: [{ name: 'A' }] }), NON_RMA_FIELD_ERRORS.rma_contacts);
  assert.equal(nonRmaFieldError({ line_items: [{ sku: 'A', serial_number: 'S1' }] }), NON_RMA_FIELD_ERRORS.line_items);
  assert.equal(nonRmaFieldError({ case_number: '', service_slip_no: null, client_remarks: '  ', rma_contacts: [], line_items: [{ sku: 'A', quantity: 2 }] }), null);
});

test('rmaFormWrite clears a stale SS# when a legacy record leaves RTC and merges partial legacy contact edits', () => {
  const moved = rmaFormWrite({ case_number: ' CAS-31417-Y4Y6Z3 ' }, { rmaType: 'Pull Out Slip', submitted: true, existing: { serviceSlipNo: 'SS#60142' } });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.write.data.caseNumber, 'CAS-31417-Y4Y6Z3');
  assert.equal(moved.write.data.serviceSlipNo, null);
  assert.equal('clientRemarks' in moved.write.data, false, 'untouched remarks are not written');

  const legacy = rmaFormWrite({ customer_contact_phone: '+63 900' }, { rmaType: 'Return to Customer Slip', submitted: false,
    existing: { customerContactName: 'Casey', customerContactEmail: 'casey@example.com', customerContactPhone: null } });
  assert.equal(legacy.ok, true);
  if (!legacy.ok) return;
  assert.deepEqual(legacy.write.contacts, [{ name: 'Casey', phone: '+63 900', email: 'casey@example.com' }]);
  assert.equal(legacy.write.data.customerContactPhone, '+63 900');

  const cleared = rmaFormWrite({ customer_contact_name: '', customer_contact_email: '', customer_contact_phone: '' }, { rmaType: 'Pull Out Slip', submitted: false });
  assert.equal(cleared.ok && cleared.write.contacts?.length, 0);
  const slip = rmaFormWrite({ service_slip_no: 'SS#1' }, { rmaType: 'Receiving Slip', submitted: false });
  assert.equal(slip.ok ? null : slip.error, RMA_SERVICE_SLIP_RTC_ONLY_ERROR);
});

// ── Serialization, edit version, audit and V1 whitelist ────────────────────

const rmaRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'rma-1', category: 'RMA', rmaType: 'Return to Customer Slip', caseNumber: 'CAS-31417-Y4Y6Z3', serviceSlipNo: 'SS#60142',
  clientRemarks: 'SAP#12019325', internalLogisticsRemarks: 'Collect Php2,000.00 cash', remarks: 'Edit reason', status: 'SCHEDULED', draft: false,
  driverAssistants: '[]', deliveryDate: '2026-10-10', company: { name: 'BDO' }, rmaContacts: [{ id: 'c1', position: 0, name: 'Alvin Gatus', phone: '+639989765266', email: null }],
  lineItems: [{ id: 'l1', position: 0, sku: 'Laptop', quantity: 1, unitType: 'Unit', serialNumber: null, newSerialNumber: 'N1', defectiveSerialNumber: 'D1',
    purchaseDate: '2025-08-14', salesOrderNo: '12019325', accessories: null, problemDescription: null, repairNote: 'Replacement unit', statusTag: 'For Return' }],
  ...overrides,
});

test('serializeRecord exposes the RMA form fields, hides SS# off RTC and keeps non-RMA line items unchanged', () => {
  const rtc = serializeRecord(rmaRow());
  assert.equal(rtc.case_number, 'CAS-31417-Y4Y6Z3');
  assert.equal(rtc.service_slip_no, 'SS#60142');
  assert.equal(rtc.client_remarks, 'SAP#12019325');
  assert.equal(rtc.internal_logistics_remarks, 'Collect Php2,000.00 cash');
  assert.deepEqual(rtc.rma_contacts, [{ id: 'c1', name: 'Alvin Gatus', phone: '+639989765266', email: null }]);
  assert.equal(rtc.line_items[0].new_serial_number, 'N1');
  assert.equal(rtc.line_items[0].unit_type, 'Unit');
  assert.equal(serializeRecord(rmaRow({ rmaType: 'Pull Out Slip' })).service_slip_no, null);
  const legacy = serializeRecord(rmaRow({ rmaContacts: [], customerContactName: 'Casey', customerContactPhone: '+63 900', customerContactEmail: null }));
  assert.deepEqual(legacy.rma_contacts, [{ name: 'Casey', phone: '+63 900', email: null }]);
  const delivery = serializeRecord(rmaRow({ category: 'DELIVERY', caseNumber: null, serviceSlipNo: null, clientRemarks: null, internalLogisticsRemarks: null,
    lineItems: [{ id: 'l2', sku: 'SKU', quantity: 2 }] }));
  assert.deepEqual(delivery.line_items, [{ id: 'l2', sku: 'SKU', quantity: 2 }]);
  assert.deepEqual(delivery.rma_contacts, []);
  assert.equal(delivery.case_number, null);
});

test('recordEditVersion changes with every new field, structured item attribute, order and contact', () => {
  const base = recordEditVersion(rmaRow());
  for (const change of [{ caseNumber: 'CAS-2' }, { serviceSlipNo: 'SS#2' }, { clientRemarks: 'SAP#2' }, { internalLogisticsRemarks: 'call first' },
    { lineItems: [{ ...rmaRow().lineItems[0], statusTag: 'For Pull Out' }] }, { lineItems: [{ ...rmaRow().lineItems[0], defectiveSerialNumber: 'D2' }] },
    { lineItems: [{ ...rmaRow().lineItems[0], position: 3 }] }, { rmaContacts: [{ position: 0, name: 'Raymond Oliva', phone: '+639989765266', email: null }] },
    { rmaContacts: [] }]) {
    assert.notEqual(recordEditVersion(rmaRow(change)), base, JSON.stringify(change));
  }
  assert.equal(recordEditVersion(rmaRow()), base);
});

test('business audit projects the new fields and structured items without unknown keys; legacy items project unchanged', () => {
  const projected = safeBusinessAudit('DeliveryRecord', JSON.stringify({
    case_number: 'CAS-1', service_slip_no: 'SS#1', client_remarks: 'SAP#1', internal_logistics_remarks: 'call',
    rma_contacts: [{ name: 'A', phone: '1', token: 'secret' }],
    line_items: [{ sku: 'SKU', quantity: 2, token: 'secret' }, { sku: 'Laptop', quantity: 1, serial_number: 'S1', status_tag: 'For Return', secret: 'x' }],
  }))!;
  assert.equal(projected.case_number, 'CAS-1');
  assert.equal(projected.service_slip_no, 'SS#1');
  assert.equal(projected.client_remarks, 'SAP#1');
  assert.equal(projected.internal_logistics_remarks, 'call');
  assert.deepEqual(projected.rma_contacts, [{ name: 'A', phone: '1' }]);
  assert.deepEqual(projected.line_items, [{ sku: 'SKU', quantity: 2 }, { sku: 'Laptop', quantity: 1, serial_number: 'S1', status_tag: 'For Return' }]);
});

test('V1 mutation whitelist accepts the five new record fields and still rejects unknown ones', () => {
  const body = { case_number: 'CAS-1', service_slip_no: 'SS#1', client_remarks: 'a', internal_logistics_remarks: 'b', rma_contacts: [], remarks: 'why' };
  assert.equal(recordMutationInputError(body, '/:id', 'PUT'), null);
  assert.equal(recordMutationInputError({ ...body, category: 'RMA', company_id: 'c' }, '/', 'POST'), null);
  assert.equal(recordMutationInputError({ ...body, secret_field: 1 }, '/:id', 'PUT'), 'Unsupported record mutation fields');
  assert.equal(recordMutationInputError({ status: 'Scheduled', remarks: 'x', client_remarks: 'y' }, '/:id/status', 'PATCH'), 'Unsupported record mutation fields',
    'status changes never carry slip remarks');
});

test('RMA dispatch actions only ever write the workflow remarks column', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/rmaDispatch.ts'), 'utf8');
  assert.equal(/clientRemarks|internalLogisticsRemarks|client_remarks|internal_logistics_remarks/.test(source), false);
});

// ── Route harness (in-memory Prisma doubles) ───────────────────────────────

const restorers: (() => void)[] = [];
function stub(target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  target[key] = mock.fn(implementation);
  restorers.push(() => { target[key] = original; });
}
let restorePolicy: (() => void) | undefined;
beforeEach(() => { restorePolicy = installRmaPolicyLookup(); });
afterEach(() => { while (restorers.length) restorers.pop()!(); mock.restoreAll(); restorePolicy?.(); });

const actor = (role: string) => rmaTestAccount({ id: 'test-user', name: 'Test User', email: 'test@example.com', role, isActive: true, permissions: [], driverProfile: null, driverProfileId: null });
const baseRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'delivery-1', recordNo: 'RMA-26-00001', category: 'RMA', status: 'SCHEDULED', draft: true, rmaVersion: 0, rmaType: 'Return to Customer Slip',
  rmaReference: 'RTC112426-01', rmaMovement: 'INTERNAL_NO_DRIVER', rmaTransportStatus: null, reference: '', priority: '2 - Moderate', area: 'BGC',
  accountManager: 'Alex AM', deliveryDate: manilaToday(), driver: '', driverId: null, driverAssistants: '[]', vehicle: '(None)', remarks: '',
  company: { name: 'Test Company' }, companyId: 'company-1', createdById: 'test-user', deletedAt: null, timeIn: null, timeOut: null,
  rmaReceivedAt: null, rmaTransportStartedAt: null, isInternalTransfer: false, lineItems: [], rmaContacts: [], ...overrides,
});

/** Applies Prisma-style nested child writes to the in-memory row. */
function applyNested(row: any, data: any) {
  const next = { ...row, ...data };
  for (const relation of ['lineItems', 'rmaContacts']) {
    const nested = data[relation];
    if (!nested) continue;
    const created = (nested.create ?? []).map((child: any, index: number) => ({ id: `${relation}-${index}`, createdAt: new Date(), position: index, ...child }));
    next[relation] = nested.deleteMany ? created : [...(row[relation] ?? []), ...created];
  }
  if (data.rmaVersion?.increment) next.rmaVersion = (row.rmaVersion ?? 0) + data.rmaVersion.increment;
  return next;
}

function database(row: any = baseRecord()) {
  let saved = row;
  const audit: any[] = []; const remarks: any[] = [];
  const tx: any = {
    $executeRaw: async () => {},
    $queryRaw: async (strings: TemplateStringsArray) => strings.join('').includes('"RmaReferenceSequence"') ? [{ lastValue: 1 }] : [{ id: saved.id }],
    user: { findUnique: async (query: any) => prisma.user.findUnique(query), findMany: async () => [] },
    rolePolicy: { findUnique: async (query: any) => prisma.rolePolicy.findUnique(query), findMany: async () => [] },
    notification: { createMany: async ({ data }: any) => ({ count: data.length }) },
    accountManager: { findUnique: async () => null, findMany: async () => [{ name: 'Alex AM' }] },
    deliveryRecord: {
      create: async ({ data }: any) => { saved = applyNested({ ...baseRecord(), lineItems: [], rmaContacts: [], createdBy: { name: 'Test User' }, modifiedBy: { name: 'Test User' } }, data); return saved; },
      findFirst: async () => saved,
      findUnique: async () => saved,
      update: async ({ data }: any) => { saved = applyNested(saved, data); return saved; },
    },
    auditLog: { create: async ({ data }: any) => { audit.push(data); return {}; } },
    remarkLog: { create: async ({ data }: any) => { remarks.push(data); return {}; } },
  };
  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => matchesRecordWhere(saved, where.AND?.[0]) ? saved : null);
  stub(prisma.company, 'findUnique', async () => ({ id: 'company-1', isActive: true }));
  stub(prisma.accountManager, 'findUnique', async () => null);
  stub(prisma.accountManager, 'findMany', async () => [{ name: 'Alex AM' }]);
  stub(prisma.user, 'findMany', async () => []);
  stub(prisma.notification, 'createMany', async () => ({ count: 0 }));
  stub(prisma, '$transaction', async (fn: any) => fn(tx));
  return { audit, remarks, saved: () => saved };
}

async function request(method: string, routePath: string, role: string, body: Record<string, unknown> = {}, query: Record<string, string> = {}) {
  const account = actor(role);
  stub(prisma.user, 'findUnique', async () => account);
  const route = (records as any).stack.find((layer: any) => layer.route?.path === routePath && layer.route.methods[method]).route;
  const req: any = { method: method.toUpperCase(), headers: {}, query, cookies: { mg_session: signToken({ id: account.id, name: account.name, email: account.email, role } as any) },
    params: routePath === '/' ? {} : { id: 'delivery-1' }, body };
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('In-memory request timed out')), 3000);
    const res: any = { statusCode: 200, headersSent: false, setHeader() {}, getHeader() {}, clearCookie() {},
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) { clearTimeout(timer); resolve({ status: this.statusCode, body: payload }); return this; },
      send(payload: unknown) { clearTimeout(timer); resolve({ status: this.statusCode, body: payload }); return this; } };
    let index = 0;
    const next = (error?: unknown) => {
      if (error) { clearTimeout(timer); return reject(error); }
      const handler = route.stack[index++]?.handle;
      if (!handler) return reject(new Error('Route did not return a response'));
      try { Promise.resolve(handler(req, res, next)).catch(reject); } catch (caught) { reject(caught); }
    };
    next();
  });
}

const rtcCreate = {
  company_id: 'company-1', category: 'RMA', rma_type: 'Return to Customer Slip', rma_movement: 'INTERNAL_NO_DRIVER', priority: '2 - Moderate', area: 'BGC',
  account_manager: 'Alex AM', delivery_date: manilaToday(), item_type: 'Unit', is_draft: 'No',
  case_number: 'CAS-31417-Y4Y6Z3', service_slip_no: 'SS#60142', client_remarks: 'SAP#12019325',
  internal_logistics_remarks: 'Note: with collection of Php2,000.00 cash. Please bring CR.',
  rma_contacts: [{ name: 'Alvin Gatus', phone: '+639989765266' }, { name: 'Raymond Oliva' }, { name: 'Jefferson Sualog' }],
  line_items: [
    { sku: 'Lenovo E14', quantity: 1, unit_type: 'Unit', new_serial_number: 'NEW-7781', defective_serial_number: 'DEF-5512', status_tag: 'UNIT REPAIRED/FOR DELIVERY' },
    { sku: 'Power Adaptor', quantity: 1, unit_type: 'Item' },
  ],
};

test('TASS creates an RTC slip with case number, SS#, contacts, structured items and separated remarks', async () => {
  const state = database();
  const created = await request('post', '/', 'TASS', rtcCreate);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.case_number, 'CAS-31417-Y4Y6Z3');
  assert.equal(created.body.service_slip_no, 'SS#60142');
  assert.equal(created.body.client_remarks, 'SAP#12019325');
  assert.match(created.body.internal_logistics_remarks, /Php2,000\.00/);
  assert.equal(created.body.remarks, '', 'workflow remarks stay separate');
  assert.deepEqual(created.body.rma_contacts.map((c: any) => c.name), ['Alvin Gatus', 'Raymond Oliva', 'Jefferson Sualog']);
  assert.equal(state.saved().customerContactName, 'Alvin Gatus / Raymond Oliva / Jefferson Sualog');
  assert.equal(state.saved().customerContactPhone, '+639989765266');
  assert.deepEqual(created.body.line_items.map((li: any) => [li.sku, li.unit_type, li.new_serial_number, li.defective_serial_number]),
    [['Lenovo E14', 'Unit', 'NEW-7781', 'DEF-5512'], ['Power Adaptor', 'Item', null, null]]);
  assert.deepEqual(state.saved().lineItems.map((li: any) => li.position), [0, 1]);
  const snapshot = JSON.parse(state.audit[0].newValue);
  assert.equal(snapshot.case_number, 'CAS-31417-Y4Y6Z3');
  assert.equal(snapshot.rma_contacts.length, 3);
});

test('POST rejects SS# on non-RTC categories, RMA fields on non-RMA records and half pairs on submission', async () => {
  for (const rma_type of ['Pull Out Slip', 'Return to Supplier Slip', 'Advance Replacement Slip', 'Receiving Slip', 'Transfer Out Slip']) {
    database();
    const rejected = await request('post', '/', 'TASS', { ...rtcCreate, rma_type });
    assert.equal(rejected.status, 400, rma_type);
    assert.equal(rejected.body.error, RMA_SERVICE_SLIP_RTC_ONLY_ERROR);
  }
  database(baseRecord({ category: 'DELIVERY' }));
  const delivery = await request('post', '/', 'SALES_COORDINATOR', { company_id: 'company-1', category: 'Deliveries', reference: 'SAP-1', delivery_date: manilaToday(), case_number: 'CAS-1' });
  assert.equal(delivery.status, 400);
  assert.equal(delivery.body.error, NON_RMA_FIELD_ERRORS.case_number);

  database();
  const half = { ...rtcCreate, line_items: [{ sku: 'Laptop', new_serial_number: 'N1' }] };
  const submitted = await request('post', '/', 'TASS', half);
  assert.equal(submitted.status, 400);
  assert.equal(submitted.body.error, RMA_PAIR_INCOMPLETE_ERROR);
  database();
  const draft = await request('post', '/', 'TASS', { ...half, is_draft: 'Yes' });
  assert.equal(draft.status, 201, 'drafts may keep half a replacement pair');
  const mixed = await request('post', '/', 'TASS', { ...rtcCreate, line_items: [{ sku: 'Laptop', serial_number: 'S', new_serial_number: 'N1', defective_serial_number: 'D1' }] });
  assert.equal(mixed.status, 400);
  assert.equal(mixed.body.error, RMA_SERIAL_MODE_ERROR);
});

test('workflow reason-for-change edits and status changes never overwrite slip remarks or Logistics notes', async () => {
  const state = database(baseRecord({ draft: false, clientRemarks: 'SAP#12019325', internalLogisticsRemarks: 'Call before going.', caseNumber: 'CAS-1' }));
  const edited = await request('put', '/:id', 'TASS', { priority: '3 - High', remarks: 'Client asked for priority', expected_version: 0 });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(state.saved().remarks, 'Client asked for priority');
  assert.equal(state.saved().clientRemarks, 'SAP#12019325');
  assert.equal(state.saved().internalLogisticsRemarks, 'Call before going.');
  const status = await request('patch', '/:id/status', 'TASS', { status: 'On-Hold', remarks: 'Waiting for supplier', expected_version: state.saved().rmaVersion });
  assert.equal(status.status, 200, JSON.stringify(status.body));
  assert.equal(state.saved().remarks, 'Waiting for supplier');
  assert.equal(state.saved().clientRemarks, 'SAP#12019325');
  assert.equal(state.saved().internalLogisticsRemarks, 'Call before going.');
  assert.equal(state.remarks.length, 2);
});

test('PUT edits the RMA form fields, revalidates SS# against the category and requires remarks', async () => {
  const state = database(baseRecord({ draft: false, serviceSlipNo: 'SS#1' }));
  const missingReason = await request('put', '/:id', 'TASS', { case_number: 'CAS-2', expected_version: 0 });
  assert.equal(missingReason.status, 400);
  assert.equal(missingReason.body.error, 'Remarks are required when editing a record.');
  const edited = await request('put', '/:id', 'TASS', {
    case_number: 'CAS-2', client_remarks: 'SAP#2', internal_logistics_remarks: 'Bring CR', rma_contacts: [{ name: 'Mia', phone: '1' }, { name: 'Lee', phone: '2' }],
    line_items: [{ sku: 'Monitor', quantity: 2, unit_type: 'Unit', serial_number: 'MON-1', purchase_date: '2025-01-02', sales_order_no: 'SO-9' }],
    remarks: 'Updated slip details', expected_version: 0,
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.case_number, 'CAS-2');
  assert.equal(edited.body.service_slip_no, 'SS#1');
  assert.equal(state.saved().customerContactPhone, '1 / 2');
  assert.equal(edited.body.line_items[0].sales_order_no, 'SO-9');
  const previous = JSON.parse(state.audit[0].previousValue);
  assert.equal(previous.case_number, null);

  database(baseRecord({ draft: false, rmaType: 'Pull Out Slip', rmaReference: 'POS112426-01' }));
  const wrongCategory = await request('put', '/:id', 'TASS', { service_slip_no: 'SS#9', remarks: 'Add SS', expected_version: 0 });
  assert.equal(wrongCategory.status, 400);
  assert.equal(wrongCategory.body.error, RMA_SERVICE_SLIP_RTC_ONLY_ERROR);

  // A legacy record without a slip reference may still change category; its SS# is dropped when it leaves RTC.
  const legacy = database(baseRecord({ draft: true, rmaReference: null, rmaType: 'Return to Customer', serviceSlipNo: 'SS#7' }));
  const moved = await request('put', '/:id', 'TASS', { rma_type: 'Pull Out Slip', remarks: 'Recategorize', expected_version: 0 });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(legacy.saved().serviceSlipNo, null);
  assert.equal(legacy.saved().rmaType, 'Pull Out Slip');
});

test('Logistics stays view-only for RMA form fields and legacy single-contact payloads stay compatible', async () => {
  database(baseRecord({ draft: false }));
  const denied = await request('put', '/:id', 'LOGISTICS', { case_number: 'CAS-9', remarks: 'try' });
  assert.equal(denied.status, 403);

  const state = database(baseRecord({ draft: true }));
  const legacy = await request('put', '/:id', 'TASS', { customer_contact_name: 'Casey', customer_contact_phone: '+63 900', remarks: 'Contact', expected_version: 0 });
  assert.equal(legacy.status, 200, JSON.stringify(legacy.body));
  assert.equal(legacy.body.customer_contact_name, 'Casey');
  assert.deepEqual(state.saved().rmaContacts.map((c: any) => [c.name, c.phone]), [['Casey', '+63 900']]);
});

test('submitting a draft via the status action requires complete replacement pairs', async () => {
  const state = database(baseRecord({ draft: true, status: 'SCHEDULED', lineItems: [{ id: 'l1', position: 0, sku: 'Laptop', quantity: 1, newSerialNumber: 'N1', defectiveSerialNumber: null }] }));
  const rejected = await request('patch', '/:id/status', 'TASS', { status: 'Scheduled', remarks: 'Submit', expected_version: 0 });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error, RMA_PAIR_INCOMPLETE_ERROR);
  assert.equal(state.saved().draft, true);
});

test('list search matches case number, SS#, serial numbers and SO# inside the caller scope', async () => {
  let captured: any;
  stub(prisma.deliveryRecord, 'findMany', async (args: any) => { captured = args; return []; });
  const response = await request('get', '/', 'TASS', {}, { search: 'CAS-31417' });
  assert.equal(response.status, 200);
  const where = JSON.stringify(captured.where);
  for (const field of ['caseNumber', 'serviceSlipNo', 'serialNumber', 'newSerialNumber', 'defectiveSerialNumber', 'salesOrderNo']) assert.ok(where.includes(field), field);
  assert.ok(Array.isArray(captured.where.AND) && captured.where.AND.length >= 2, 'role scope stays the first AND condition');
});
