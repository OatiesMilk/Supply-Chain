import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/db';
import { assertPermissionBackfillTarget } from '../src/services/permissionBackfill';

// Runs only against the disposable seeded test database (SEED_TEST_DATABASE_URL).
// Every row it creates uses an rmaff- id and is removed afterwards.
const target = process.env.SEED_TEST_DATABASE_URL;
const options = { skip: !target, timeout: 60_000 };
const ids = ['rmaff-rtc', 'rmaff-pos', 'rmaff-delivery', 'rmaff-legacy'];

async function base() {
  assert.equal(process.env.DATABASE_URL, target);
  assertPermissionBackfillTarget({ DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: new URL(target!).pathname.slice(1) });
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@microgenesis.com' } });
  const company = await prisma.company.findFirstOrThrow();
  return { companyId: company.id, status: 'SCHEDULED', priority: '2 - Moderate', reference: '', area: 'Test', category: 'RMA',
    accountManager: 'Test', deliveryDate: '2099-03-04', itemType: 'Unit', createdById: actor.id, modifiedById: actor.id };
}
const cleanup = () => prisma.deliveryRecord.deleteMany({ where: { id: { in: ids } } });
const rejects = async (work: Promise<unknown>, constraint: string) => {
  await assert.rejects(work, (error: any) => String(error?.message ?? '').includes(constraint) || String(error?.meta?.message ?? '').includes(constraint)
    || JSON.stringify(error?.meta ?? {}).includes(constraint) || error?.code === 'P2004' || /check constraint/i.test(String(error?.message)), constraint);
};

test('migration adds the columns, indexes, CHECK constraints and RLS', options, async () => {
  await base();
  const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('DeliveryRecord', 'LineItem', 'RmaContact')`;
  const has = (table: string, column: string) => columns.some(row => row.table_name === table && row.column_name === column);
  for (const column of ['caseNumber', 'serviceSlipNo', 'clientRemarks', 'internalLogisticsRemarks']) assert.ok(has('DeliveryRecord', column), column);
  for (const column of ['position', 'unitType', 'serialNumber', 'newSerialNumber', 'defectiveSerialNumber', 'purchaseDate', 'salesOrderNo', 'accessories',
    'problemDescription', 'repairNote', 'statusTag']) assert.ok(has('LineItem', column), column);
  for (const column of ['id', 'deliveryRecordId', 'position', 'name', 'phone', 'email', 'createdAt']) assert.ok(has('RmaContact', column), column);

  const constraints = (await prisma.$queryRaw<{ conname: string }[]>`SELECT conname FROM pg_constraint`).map(row => row.conname);
  for (const name of ['DeliveryRecord_serviceSlipNo_rtc_check', 'DeliveryRecord_rma_only_fields_check', 'LineItem_unitType_check', 'LineItem_serial_mode_check',
    'LineItem_quantity_check', 'RmaContact_nonempty_check', 'RmaContact_deliveryRecordId_fkey']) assert.ok(constraints.includes(name), name);
  const indexes = (await prisma.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`).map(row => row.indexname);
  for (const name of ['DeliveryRecord_category_caseNumber_idx', 'DeliveryRecord_category_serviceSlipNo_idx', 'LineItem_deliveryRecordId_position_idx',
    'LineItem_serialNumber_idx', 'LineItem_newSerialNumber_idx', 'LineItem_defectiveSerialNumber_idx', 'RmaContact_deliveryRecordId_position_idx']) assert.ok(indexes.includes(name), name);
  const rls = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('LineItem', 'RmaContact') AND relkind = 'r'`;
  assert.deepEqual(rls.map(row => [row.relname, row.relrowsecurity]).sort(), [['LineItem', true], ['RmaContact', true]]);
});

test('CHECK constraints enforce RTC-only SS#, RMA-only fields, unit type, serial mode, quantity and non-empty contacts', options, async () => {
  const fixture = await base();
  try {
    await cleanup();
    await rejects(prisma.deliveryRecord.create({ data: { ...fixture, id: 'rmaff-pos', rmaType: 'Pull Out Slip', serviceSlipNo: 'SS#1' } }), 'DeliveryRecord_serviceSlipNo_rtc_check');
    await rejects(prisma.deliveryRecord.create({ data: { ...fixture, id: 'rmaff-delivery', category: 'DELIVERY', caseNumber: 'CAS-1' } }), 'DeliveryRecord_rma_only_fields_check');
    await prisma.deliveryRecord.create({ data: { ...fixture, id: 'rmaff-rtc', rmaType: 'Return to Customer Slip', serviceSlipNo: 'SS#60142', caseNumber: 'CAS-31417-RMAFF',
      clientRemarks: 'SAP#12019325', internalLogisticsRemarks: 'Call before going.' } });
    await rejects(prisma.deliveryRecord.update({ where: { id: 'rmaff-rtc' }, data: { rmaType: 'Receiving Slip' } }), 'DeliveryRecord_serviceSlipNo_rtc_check');
    await rejects(prisma.lineItem.create({ data: { deliveryRecordId: 'rmaff-rtc', sku: 'A', unitType: 'Box' } }), 'LineItem_unitType_check');
    await rejects(prisma.lineItem.create({ data: { deliveryRecordId: 'rmaff-rtc', sku: 'A', serialNumber: 'S', newSerialNumber: 'N' } }), 'LineItem_serial_mode_check');
    await rejects(prisma.lineItem.create({ data: { deliveryRecordId: 'rmaff-rtc', sku: 'A', quantity: 0 } }), 'LineItem_quantity_check');
    await rejects(prisma.rmaContact.create({ data: { deliveryRecordId: 'rmaff-rtc', name: '  ' } }), 'RmaContact_nonempty_check');

    await prisma.lineItem.create({ data: { deliveryRecordId: 'rmaff-rtc', position: 0, sku: 'Laptop', unitType: 'Unit', newSerialNumber: 'RMAFF-NEW-1', defectiveSerialNumber: 'RMAFF-DEF-1', salesOrderNo: 'RMAFF-SO-9' } });
    await prisma.rmaContact.create({ data: { deliveryRecordId: 'rmaff-rtc', position: 0, name: 'Alvin Gatus', phone: '+639989765266' } });
    // Case-insensitive search across the record and its items (the list route's OR clause).
    for (const s of ['cas-31417-rmaff', 'ss#60142', 'rmaff-new-1', 'RMAFF-def-1', 'rmaff-so-9']) {
      const found = await prisma.deliveryRecord.findMany({ where: { id: { in: ids }, OR: [
        { caseNumber: { contains: s, mode: 'insensitive' } }, { serviceSlipNo: { contains: s, mode: 'insensitive' } },
        { lineItems: { some: { OR: [{ serialNumber: { contains: s, mode: 'insensitive' } }, { newSerialNumber: { contains: s, mode: 'insensitive' } },
          { defectiveSerialNumber: { contains: s, mode: 'insensitive' } }, { salesOrderNo: { contains: s, mode: 'insensitive' } }] } } },
      ] }, select: { id: true } });
      assert.deepEqual(found.map(row => row.id), ['rmaff-rtc'], s);
    }
    // Children cascade with their record.
    await prisma.deliveryRecord.delete({ where: { id: 'rmaff-rtc' } });
    assert.equal(await prisma.lineItem.count({ where: { deliveryRecordId: 'rmaff-rtc' } }), 0);
    assert.equal(await prisma.rmaContact.count({ where: { deliveryRecordId: 'rmaff-rtc' } }), 0);
  } finally {
    await cleanup();
  }
});

test('the legacy contact backfill statement is idempotent and copies customerContact* without loss', options, async () => {
  const fixture = await base();
  const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261124180000_tass_rma_form_fields_items_and_remarks/migration.sql'), 'utf8');
  const backfill = sql.slice(sql.indexOf('INSERT INTO "RmaContact"'), sql.indexOf('ON CONFLICT ("id") DO NOTHING;') + 'ON CONFLICT ("id") DO NOTHING;'.length);
  assert.ok(backfill.startsWith('INSERT INTO "RmaContact"'));
  try {
    await cleanup();
    await prisma.deliveryRecord.create({ data: { ...fixture, id: 'rmaff-legacy', rmaType: 'Pull Out Slip', customerContactName: ' Casey ',
      customerContactPhone: '+63 900', customerContactEmail: 'casey@example.com' } });
    await prisma.$executeRawUnsafe(backfill);
    await prisma.$executeRawUnsafe(backfill);
    const contacts = await prisma.rmaContact.findMany({ where: { deliveryRecordId: 'rmaff-legacy' } });
    assert.deepEqual(contacts.map(c => [c.name, c.phone, c.email, c.position]), [['Casey', '+63 900', 'casey@example.com', 0]]);
    const row = await prisma.deliveryRecord.findUniqueOrThrow({ where: { id: 'rmaff-legacy' } });
    assert.equal(row.customerContactName, ' Casey ', 'legacy columns are preserved');
  } finally {
    await cleanup();
  }
});
