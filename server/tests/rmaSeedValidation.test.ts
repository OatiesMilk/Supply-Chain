import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RMA_AUTO_REFERENCE_PATTERN, RMA_SLIP_PREFIX_BY_CATEGORY, manilaDateToMmddyy, formatRmaReference,
} from '../src/services/rmaReference';
import {
  RMA_CATEGORIES, RMA_ITEM_TYPES, canonicalRmaCategory, rmaInputError, rmaServiceSlipError, rmaInternalTransferError,
  normalizeRmaContacts, normalizeRmaLineItems, storedLineItemsPairError, lineItemInputFromRow, syncLegacyContactSnapshot,
  parseRmaEventDate,
} from '../src/services/rmaRules';
import { RMA_MOVEMENTS, rmaMovementInputError, rmaTransportContext, needsLogisticsHandoff } from '../src/services/rmaMovement';
import { manilaToday } from '../src/services/deliveryLifecycle';
import { OPEN_RMA_STATUSES, RMA_AGING_DAYS } from '../src/services/dashboardFilters';
import { buildRmaDemoRecords, RMA_DEMO_SPECS, RMA_DEMO_COMPANY_NAMES } from '../prisma/seeds/rma-demo';
import { buildDriverDemoRmaFields, driverDemoRmaRecord, driverDemoHash } from '../prisma/seed-driver-demo';

// Runs every seeded RMA (seed.ts / staging RMA demo refresh via seeds/rma-demo.ts,
// and seed-driver-demo.ts) through the real server validators, so seeds cannot
// drift from the current RMA rules again. No database is used.

const NOW = new Date();
const context = {
  companyIdFor: (key: string) => `company-${key}`,
  driverFor: (name: string) => ({ id: `driver-${name}`, name }),
  assistantFor: (name: string) => name,
  tassUserId: 'user-tass', logisticsUserId: 'user-logistics',
};
// Structural view shared by the curated builder (RmaDemoCreateData) and driverDemoRmaRecord().
type SeededRma = Record<string, any> & { rmaContacts: { create: Array<Record<string, any>> }; lineItems: { create: Array<Record<string, any>> } };
const time = (value: unknown) => value instanceof Date ? value.getTime() : value == null ? null : new Date(String(value)).getTime();

/** The API body a TASS user would submit for this record. */
function apiBody(record: SeededRma) {
  return {
    priority: record.priority, area: record.area, account_manager: record.accountManager,
    rma_type: record.rmaType, is_internal_transfer: record.isInternalTransfer, rma_movement: record.rmaMovement,
    delivery_date: record.deliveryDate, case_number: record.caseNumber, service_slip_no: record.serviceSlipNo,
    client_remarks: record.clientRemarks, internal_logistics_remarks: record.internalLogisticsRemarks,
    rma_contacts: record.rmaContacts.create.map(c => ({ name: c.name, phone: c.phone, email: c.email })),
    line_items: record.lineItems.create.map(row => lineItemInputFromRow(row)),
  };
}

function assertValidSeededRma(record: SeededRma, now = NOW) {
  const label = String(record.id);
  const body = apiBody(record);
  assert.equal(record.category, 'RMA', label);
  assert.equal(record.draft, false, label);
  assert.equal(record.reference, '', `${label}: RMA reference column stays blank`);
  assert.equal(rmaInputError(body, true, { requireCategory: true, allowManualReference: true }), null, label);
  assert.equal(canonicalRmaCategory(record.rmaType), record.rmaType, `${label}: strictly canonical category`);
  assert.ok((RMA_ITEM_TYPES as readonly string[]).includes(String(record.itemType)), `${label}: RMA item type`);

  const reference = String(record.rmaReference);
  assert.match(reference, RMA_AUTO_REFERENCE_PATTERN, label);
  const prefix = RMA_SLIP_PREFIX_BY_CATEGORY[canonicalRmaCategory(record.rmaType)!];
  assert.ok(reference.startsWith(`${prefix}${manilaDateToMmddyy(String(record.deliveryDate))}-`), `${label}: prefix and date of ${reference}`);

  assert.equal(rmaServiceSlipError(record.rmaType, record.serviceSlipNo), null, label);
  if (record.rmaType === 'Return to Customer Slip') assert.ok(record.serviceSlipNo, `${label}: RTC carries an SS#`);
  else assert.equal(record.serviceSlipNo, null, `${label}: SS# only on RTC (DB check)`);
  assert.equal(rmaInternalTransferError({ rmaType: record.rmaType, isInternalTransfer: record.isInternalTransfer === true, rmaMovement: record.rmaMovement }), null, label);
  assert.equal(rmaMovementInputError(body, true), null, label);
  assert.ok(record.caseNumber, `${label}: case number`);
  assert.ok(record.clientRemarks, `${label}: client slip remarks`);
  assert.notEqual(record.clientRemarks, record.remarks, `${label}: client remarks are separate from workflow remarks`);

  const contacts = normalizeRmaContacts(body.rma_contacts);
  assert.ok(contacts.ok, label);
  assert.ok(contacts.ok && contacts.contacts.length >= 1, `${label}: at least one contact`);
  if (contacts.ok) {
    const legacy = syncLegacyContactSnapshot(contacts.contacts);
    assert.equal(record.customerContactName, legacy.customerContactName, `${label}: legacy contact snapshot`);
    assert.equal(record.customerContactPhone, legacy.customerContactPhone, label);
    assert.equal(record.customerContactEmail, legacy.customerContactEmail, label);
  }
  const items = normalizeRmaLineItems(body.line_items, { requireCompletePairs: true });
  assert.ok(items.ok, `${label}: ${items.ok ? '' : items.error}`);
  assert.ok(items.ok && items.items.length >= 1, `${label}: at least one structured item`);
  assert.equal(storedLineItemsPairError(record.lineItems.create as never), null, label);

  // Transport, driver and timestamp consistency.
  const started = time(record.rmaTransportStartedAt), transported = time(record.rmaTransportCompletedAt);
  const received = time(record.rmaReceivedAt), completed = time(record.rmaCompletedAt), submitted = time(record.submittedAt);
  assert.ok(submitted !== null && submitted <= now.getTime(), `${label}: submitted in the past`);
  if (record.rmaMovement === 'LOGISTICS_TRANSPORT') {
    assert.ok(['PENDING', 'IN_TRANSIT', 'COMPLETED'].includes(String(record.rmaTransportStatus)), label);
    if (record.rmaTransportStatus === 'PENDING') assert.equal(started, null, label);
    if (record.rmaTransportStatus !== 'PENDING') {
      assert.ok(record.driverId && record.driver, `${label}: active transport has a Driver`);
      assert.ok(started !== null && started >= submitted! && started <= now.getTime(), `${label}: transport start`);
    }
    if (record.rmaTransportStatus === 'IN_TRANSIT') assert.equal(transported, null, label);
    if (record.rmaTransportStatus === 'COMPLETED') {
      assert.ok(transported !== null && transported >= started! && transported <= now.getTime(), `${label}: transport completion`);
      assert.ok(record.rmaTransportReceivedBy, `${label}: transport received-by name`);
    } else {
      assert.equal(record.rmaTransportReceivedBy ?? null, null, label);
    }
    if (received !== null) assert.equal(record.rmaTransportStatus, 'COMPLETED', `${label}: receipt only after transport`);
  } else {
    assert.equal(record.rmaTransportStatus, null, label);
    assert.equal(record.driver, '', label);
    assert.equal(record.driverId, null, label);
    assert.equal(record.vehicle, '(None)', label);
    assert.equal(record.driverAssistants, '[]', label);
    assert.equal(started, null, label);
    assert.equal(transported, null, label);
  }
  if (!record.driverId) assert.equal(record.driverAssistants, '[]', `${label}: helpers only with a Driver`);
  if (received !== null) {
    assert.ok(record.rmaReceivedBy, `${label}: receipt records the receiving user id`);
    assert.ok(received >= (transported ?? submitted!), `${label}: receipt after transport/submission`);
    const parsed = parseRmaEventDate(new Date(received).toISOString(), { label: 'Receipt date', now,
      minDate: transported !== null ? manilaToday(new Date(transported)) : null });
    assert.ok(parsed.ok, `${label}: ${parsed.ok ? '' : parsed.error}`);
  } else {
    assert.equal(record.rmaReceivedBy ?? null, null, label);
    assert.equal(record.rmaRecipient ?? null, null, label);
  }
  if (record.status === 'ACCOMPLISHED') {
    assert.ok(received !== null && completed !== null && received <= completed, `${label}: receipt <= completion`);
    if (record.rmaMovement === 'LOGISTICS_TRANSPORT') assert.equal(record.rmaTransportStatus, 'COMPLETED', label);
    const parsed = parseRmaEventDate(new Date(completed!).toISOString(), { label: 'Completion date', now, minDate: manilaToday(new Date(received!)) });
    assert.ok(parsed.ok, `${label}: ${parsed.ok ? '' : parsed.error}`);
  } else {
    assert.equal(completed, null, `${label}: only ACCOMPLISHED rows are completed`);
  }
}

const { records, sequences } = buildRmaDemoRecords(context, NOW);
const byId = new Map(records.map(r => [r.id, r]));

test('every curated demo RMA passes the current server RMA rules', () => {
  assert.equal(records.length, 15);
  assert.deepEqual(records.map(r => r.id), Array.from({ length: 15 }, (_, i) => `REC-${4101 + i}`));
  for (const record of records) assertValidSeededRma(record);
  for (const spec of RMA_DEMO_SPECS) assert.ok(RMA_DEMO_COMPANY_NAMES[spec.companyKey], `${spec.id}: known demo company`);
});

test('curated slip references are unique and the synced counters match them exactly', () => {
  const references = records.map(r => r.rmaReference);
  assert.equal(new Set(references).size, references.length);
  const counted = new Map<string, number>();
  for (const record of records) {
    const prefix = RMA_SLIP_PREFIX_BY_CATEGORY[canonicalRmaCategory(record.rmaType)!];
    const key = `${prefix}|${record.deliveryDate}`;
    counted.set(key, (counted.get(key) ?? 0) + 1);
    assert.equal(record.rmaReference, formatRmaReference(prefix, String(record.deliveryDate), counted.get(key)!));
  }
  assert.deepEqual(new Map(sequences.map(s => [`${s.prefix}|${s.manilaDate}`, s.lastValue])), counted);
  assert.ok(sequences.some(s => s.lastValue > 1), 'a shared (prefix, date) counter is exercised');
});

test('curated set covers every category, movement and TASS dashboard queue', () => {
  assert.deepEqual(new Set(records.map(r => r.rmaType)), new Set(RMA_CATEGORIES));
  assert.deepEqual(new Set(records.map(r => r.rmaMovement)), new Set(RMA_MOVEMENTS));
  assert.ok(records.some(r => r.rmaType === 'Transfer Out Slip' && r.isInternalTransfer === true));
  assert.ok(records.some(r => r.rmaType === 'Receiving Slip' && r.rmaMovement === 'INTERNAL_NO_DRIVER'));
  const done = records.filter(r => r.status === 'ACCOMPLISHED');
  assert.ok(done.some(r => r.rmaRecipient === null) && done.some(r => r.rmaRecipient), 'recipient is optional');

  const cutoff = NOW.getTime() - RMA_AGING_DAYS * 86_400_000;
  const open = records.filter(r => !r.isInternalTransfer && OPEN_RMA_STATUSES.includes(String(r.status)));
  const queues: Record<string, SeededRma[]> = {
    open,
    on_hold: open.filter(r => r.status === 'ON_HOLD'),
    rescheduled: open.filter(r => r.status === 'RESCHEDULED'),
    in_transit: open.filter(r => r.rmaMovement === 'LOGISTICS_TRANSPORT' && r.rmaTransportStatus === 'IN_TRANSIT' && r.driverId
      && !['ON_HOLD', 'RESCHEDULED'].includes(String(r.status))),
    awaiting_receipt: open.filter(r => (r.rmaMovement !== 'LOGISTICS_TRANSPORT' || r.rmaTransportStatus === 'COMPLETED') && !r.rmaReceivedAt),
    awaiting_completion: open.filter(r => r.rmaReceivedAt && !r.rmaCompletedAt),
    aging: open.filter(r => time(r.submittedAt)! < cutoff),
    logistics_unassigned: records.filter(r => needsLogisticsHandoff({ ...r, category: 'RMA', draft: false, status: String(r.status),
      rmaMovement: r.rmaMovement as string, rmaTransportStatus: r.rmaTransportStatus as string | null, driverId: r.driverId ?? null })),
    internal_transfer: records.filter(r => r.isInternalTransfer),
  };
  for (const [queue, rows] of Object.entries(queues)) assert.ok(rows.length > 0, `queue ${queue} has demo data`);
  assert.deepEqual(queues.aging.map(r => r.id).sort(), ['REC-4113', 'REC-4115']);
  // The in-transit run can be completed by its Driver today (planned date in the past).
  for (const row of queues.in_transit) {
    assert.equal(rmaTransportContext({ ...row, category: 'RMA', draft: false, status: String(row.status), rmaMovement: String(row.rmaMovement),
      rmaTransportStatus: String(row.rmaTransportStatus), deliveryDate: String(row.deliveryDate), driverId: row.driverId ?? null }, NOW).actionAllowed, true);
  }
});

test('REC-4102 keeps the seeded RTC E2E contract', () => {
  const rtc = byId.get('REC-4102')!;
  assert.equal(rtc.rmaType, 'Return to Customer Slip');
  assert.equal(rtc.caseNumber, 'CAS-31417-Y4Y6Z3');
  assert.equal(rtc.serviceSlipNo, 'SS#60142');
  assert.equal(rtc.clientRemarks, 'SAP#12019325');
  assert.equal(rtc.internalLogisticsRemarks, 'Note: with collection of Php2,000.00 cash. Please bring CR.');
  assert.deepEqual(rtc.rmaContacts.create.map(c => ({ name: c.name, phone: c.phone })),
    [{ name: 'Alvin Gatus', phone: '+639989765266' }, { name: 'Raymond Oliva', phone: null }, { name: 'Jefferson Sualog', phone: null }]);
  const [unit, adaptor] = rtc.lineItems.create;
  assert.ok(unit.newSerialNumber && unit.defectiveSerialNumber && unit.newSerialNumber !== unit.defectiveSerialNumber);
  assert.equal(unit.statusTag, 'UNIT REPAIRED/FOR DELIVERY');
  assert.deepEqual([adaptor.sku, adaptor.unitType, adaptor.statusTag], ['Power Adaptor', 'Item', 'For Return']);
});

test('open-stage timestamps follow the injected clock; completed history stays fixed', () => {
  const later = new Date(NOW.getTime() + 30 * 86_400_000);
  const shifted = buildRmaDemoRecords(context, later).records;
  for (const [index, record] of shifted.entries()) {
    assertValidSeededRma(record, later);
    const original = records[index];
    if (record.status === 'ACCOMPLISHED') assert.equal(time(record.rmaCompletedAt), time(original.rmaCompletedAt));
    else assert.equal(time(record.submittedAt)! - time(original.submittedAt)!, 30 * 86_400_000);
    assert.equal(record.rmaReference, original.rmaReference, 'references depend only on fixed delivery dates');
  }
});

test('driver-demo RMA runs pass the current server RMA rules', () => {
  const dateStr = manilaToday(NOW);
  const fields = buildDriverDemoRmaFields({ dateStr, hashName: driverDemoHash('Lando Navarro'), rmaReference: formatRmaReference('POS', dateStr, 7) });
  assert.equal(fields.rmaType, 'Pull Out Slip');
  for (const [driver, assistantName] of [[{ id: 'p1', name: 'Lando Navarro' }, 'Jayson Reyes'], [{ id: 'p2', name: 'John Doe' }, null]] as const) {
    const record = driverDemoRmaRecord({ dateStr, driver, rmaReference: formatRmaReference('POS', dateStr, 1), companyId: 'c1',
      assistantName, createdById: 'tass', modifiedById: 'logistics' });
    assertValidSeededRma(record);
    assert.equal(record.id, `REC-DEMO-${dateStr.replace(/-/g, '')}-${driverDemoHash(driver.name)}-RMA`);
    assert.equal(record.rmaMovement, 'LOGISTICS_TRANSPORT');
    assert.equal(record.rmaTransportStatus, 'PENDING');
    assert.equal(record.driverId, driver.id);
    assert.equal(record.deliveryDate, dateStr);
    assert.equal(rmaTransportContext({ ...record, deliveryDate: dateStr }, NOW).actionAllowed, true, 'Driver can start today');
  }
});
