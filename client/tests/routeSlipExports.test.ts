import { beforeEach } from 'node:test';
import { installLegacySession } from './helpers/permissionSession';
beforeEach(() => { installLegacySession('LOGISTICS', 'driver_board'); });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { computeRouteSlipTimes, downloadRouteSlipForPeriod, routeSlipRowValues, type RouteSlipFormat } from '../src/utils/routeSlip';
import type { DeliveryRecord } from '../src/types';

function zipEntry(buffer: Buffer, name: string): string {
  for (let offset = 0; offset < buffer.length - 46; offset++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(offset + 28);
    if (buffer.subarray(offset + 46, offset + 46 + nameLength).toString() !== name) continue;
    const method = buffer.readUInt16LE(offset + 10);
    const length = buffer.readUInt32LE(offset + 20);
    const local = buffer.readUInt32LE(offset + 42);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const bytes = buffer.subarray(start, start + length);
    return (method === 8 ? inflateRawSync(bytes) : bytes).toString();
  }
  throw new Error(`Missing archive entry: ${name}`);
}

function record(id: string, day: string, driver = 'Alex One'): DeliveryRecord {
  return { id, company_name: id, company_id: 'company-1', reference: id, delivery_date: day,
    driver, driver_assistants: [], status: 'Scheduled', priority: '2 - Moderate', area: 'Makati', category: 'Deliveries',
    vehicle: 'Van', item_type: 'Unit', account_manager: 'Casey', remarks: '', received_by: '', time_in: null, time_out: null } as DeliveryRecord;
}

test('actual PDF, Excel and Word outputs agree on period, boundaries, drivers and lifetime trail', async t => {
  const saved = { fetch: globalThis.fetch, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, save: (jsPDF.API as any).save };
  let download: Blob | undefined;
  let pdf: Buffer | undefined;
  let auditCalls: string[] = [];
  globalThis.document = { createElement: () => ({ href: '', download: '', click() {} }) } as unknown as Document;
  URL.createObjectURL = blob => { download = blob as Blob; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  (jsPDF.API as any).save = function(this: jsPDF) { pdf = Buffer.from(this.output('arraybuffer')); return this; } as any;
  globalThis.fetch = async input => {
    const path = String(input);
    if (!path.endsWith('/audit')) return new Response('', { status: 404 });
    auditCalls.push(path);
    return new Response(JSON.stringify([{ previous_value: { status: 'On-Hold' }, new_value: { status: 'Scheduled' } }]), { status: 200 });
  };
  try {
    for (const mode of ['day', 'from', 'range'] as const) for (const multi of [false, true]) {
      for (const variant of ['current', 'trail'] as const) for (const format of ['excel', 'pdf', 'docx'] as RouteSlipFormat[]) {
        await t.test(`${mode}, ${multi ? 'multiple drivers' : 'single driver'}, ${format}, ${variant}`, async () => {
          download = undefined; pdf = undefined; auditCalls = [];
          const rows = [record('RECBEFORE', '2026-10-26'), record('RECFIRST', '2026-10-27'),
            record('RECLAST', '2026-10-29', multi ? 'Alex Two' : 'Alex One'), record('RECAFTER', '2026-10-30'), record('RECUNDATED', '')];
          await downloadRouteSlipForPeriod(format, { records: rows, dateFrom: '2026-10-27',
            dateTo: mode === 'day' ? '2026-10-27' : mode === 'range' ? '2026-10-29' : '', filename: 'route-slip-test', preparedBy: 'Marc', variant });
          let text: string;
          if (format === 'pdf') {
            assert.ok(pdf, 'a PDF was produced');
            text = pdf!.toString('latin1');
          } else {
            assert.ok(download, 'a download was produced');
            const bytes = Buffer.from(await download!.arrayBuffer());
            if (format === 'excel') {
              const workbook = new ExcelJS.Workbook();
              await workbook.xlsx.load(bytes as any);
              text = workbook.worksheets.flatMap(sheet => {
                const values: string[] = [];
                sheet.eachRow(row => row.eachCell(cell => values.push(String(cell.value))));
                return values;
              }).join('\n');
              assert.equal(workbook.worksheets.length, multi && mode !== 'day' ? 2 : 1);
            } else text = zipEntry(bytes, 'word/document.xml');
          }
          assert.match(text, /Period:/);
          assert.match(text, /27 Oct 2026/);
          assert.equal(text.includes('29 Oct 2026'), mode === 'range');
          assert.equal(text.includes('onward'), mode === 'from');
          assert.match(text, /RECFIRST/);
          assert.equal(text.includes('RECLAST'), mode !== 'day');
          assert.equal(text.includes('RECAFTER'), mode === 'from');
          assert.equal(text.includes('RECBEFORE'), false);
          assert.equal(text.includes('RECUNDATED'), false);
          assert.match(text, /Alex One/);
          assert.equal(text.includes('Alex Two'), multi && mode !== 'day');
          assert.equal(text.includes('Status Trail counts'), variant === 'trail');
          assert.equal(auditCalls.length, variant === 'trail' ? (mode === 'day' ? 1 : mode === 'range' ? 2 : 3) : 0);
        });
      }
    }
    await assert.rejects(downloadRouteSlipForPeriod('excel', { records: [], dateFrom: '', preparedBy: 'Marc', filename: 'invalid' }), /Choose/);
    await assert.rejects(downloadRouteSlipForPeriod('excel', { records: [record('NONE', '2026-10-27', '')], dateFrom: '2026-10-27', preparedBy: 'Marc', filename: 'none' }), /No assigned-driver/);
  } finally {
    globalThis.fetch = saved.fetch; globalThis.document = saved.document;
    URL.createObjectURL = saved.create; URL.revokeObjectURL = saved.revoke; (jsPDF.API as any).save = saved.save;
  }
});

test('route slips populate Departure, Arrival, TIME-IN, TIME-OUT and Signed by Client for completed Deliveries and RMAs while keeping unstarted runs blank', async () => {
  const unstarted = record('REC-UNSTARTED', '2026-10-27');
  assert.deepEqual(computeRouteSlipTimes([unstarted]), { departure: '___________', arrival: '___________' });
  const unstartedRow = routeSlipRowValues(unstarted);
  assert.equal(unstartedRow[8], '');
  assert.equal(unstartedRow[9], '');
  assert.equal(unstartedRow[10], '');

  // Single-day multi-stop Delivery run (UTC -> Asia/Manila +8h: 08:15 AM .. 03:45 PM)
  const stop1: DeliveryRecord = {
    ...record('DEL-1', '2026-10-27', 'Alex One'),
    status: 'Delivered',
    time_in: '2026-10-27T00:15:00Z',   // 08:15 AM Manila
    time_out: '2026-10-27T02:30:00Z',  // 10:30 AM Manila
    received_by: 'Maria Santos',
  };
  const stop2: DeliveryRecord = {
    ...record('DEL-2', '2026-10-27', 'Alex One'),
    status: 'Delivered',
    time_in: '2026-10-27T05:00:00Z',   // 01:00 PM Manila
    time_out: '2026-10-27T07:45:00Z',  // 03:45 PM Manila
    received_by: 'Jose Reyes',
  };
  const deliveryTimes = computeRouteSlipTimes([stop2, stop1]);
  assert.match(deliveryTimes.departure, /0?8:15\s*AM/i);
  assert.match(deliveryTimes.arrival, /0?3:45\s*PM/i);
  const stop1Row = routeSlipRowValues(stop1);
  assert.match(stop1Row[8], /0?8:15\s*AM/i);
  assert.match(stop1Row[9], /10:30\s*AM/i);
  assert.equal(stop1Row[10], 'Maria Santos');

  // RMA Logistics Transport uses rma_transport_started_at / rma_transport_completed_at / rma_transport_received_by
  // (never TASS's separate rma_completed_at timestamp)
  const rmaStop: DeliveryRecord = {
    ...record('RMA-1', '2026-10-27', 'Alex Two'),
    category: 'RMA',
    status: 'Delivered',
    rma_movement: 'LOGISTICS_TRANSPORT',
    rma_transport_status: 'COMPLETED',
    rma_transport_started_at: '2026-10-27T01:20:00Z',   // 09:20 AM Manila
    rma_transport_completed_at: '2026-10-27T04:10:00Z', // 12:10 PM Manila
    rma_transport_received_by: 'Warehouse Desk',
    rma_completed_at: '2026-10-28T09:00:00Z',           // Next-day TASS sign-off — must NOT be used as Arrival
  };
  const rmaTimes = computeRouteSlipTimes([rmaStop]);
  assert.match(rmaTimes.departure, /0?9:20\s*AM/i);
  assert.match(rmaTimes.arrival, /12:10\s*PM/i);
  const rmaRow = routeSlipRowValues(rmaStop);
  assert.match(rmaRow[8], /0?9:20\s*AM/i);
  assert.match(rmaRow[9], /12:10\s*PM/i);
  assert.equal(rmaRow[10], 'Warehouse Desk');

  // Verify actual Excel, PDF, and DOCX outputs carry populated Departure, Arrival, TIME-IN, TIME-OUT, and Signed by Client
  const saved = { fetch: globalThis.fetch, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, save: (jsPDF.API as any).save };
  let download: Blob | undefined;
  let pdf: Buffer | undefined;
  globalThis.document = { createElement: () => ({ href: '', download: '', click() {} }) } as unknown as Document;
  URL.createObjectURL = blob => { download = blob as Blob; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  (jsPDF.API as any).save = function(this: jsPDF) { pdf = Buffer.from(this.output('arraybuffer')); return this; } as any;
  globalThis.fetch = async () => new Response('', { status: 404 });
  try {
    for (const multi of [false, true]) {
      for (const format of ['excel', 'pdf', 'docx'] as RouteSlipFormat[]) {
        download = undefined; pdf = undefined;
        const rows = multi ? [stop1, stop2, rmaStop] : [stop1, stop2];
        await downloadRouteSlipForPeriod(format, {
          records: rows, dateFrom: '2026-10-27', dateTo: '2026-10-27',
          filename: 'route-slip-times', preparedBy: 'Marc', variant: 'current',
        });
        let text: string;
        if (format === 'pdf') {
          text = pdf!.toString('latin1');
        } else {
          const bytes = Buffer.from(await download!.arrayBuffer());
          if (format === 'excel') {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(bytes as any);
            text = workbook.worksheets.flatMap(sheet => {
              const values: string[] = [];
              sheet.eachRow(row => row.eachCell(cell => values.push(String(cell.value))));
              return values;
            }).join('\n');
          } else {
            text = zipEntry(bytes, 'word/document.xml');
          }
        }
        assert.match(text, /Time of Departure:\s*0?8:15\s*AM/i, `${format} multi=${multi} Departure`);
        assert.match(text, /Time of Arrival:\s*0?3:45\s*PM/i, `${format} multi=${multi} Arrival`);
        assert.match(text, /Maria Santos/, `${format} multi=${multi} Signed by Client`);
        assert.match(text, /10:30\s*AM/i, `${format} multi=${multi} per-row TIME-OUT`);
        if (multi) {
          assert.match(text, /Time of Departure:\s*0?9:20\s*AM/i, `${format} RMA driver Departure`);
          assert.match(text, /Time of Arrival:\s*12:10\s*PM/i, `${format} RMA driver Arrival`);
          assert.match(text, /Warehouse Desk/, `${format} RMA Signed by Client`);
        }
      }
    }
  } finally {
    globalThis.fetch = saved.fetch; globalThis.document = saved.document;
    URL.createObjectURL = saved.create; URL.revokeObjectURL = saved.revoke; (jsPDF.API as any).save = saved.save;
  }
});
