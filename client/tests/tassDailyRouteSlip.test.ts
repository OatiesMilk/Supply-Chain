import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import type { DeliveryRecord } from '../src/types';
import {
  buildTassDailyRouteSlipRows, formatDailyRouteSlipItemText, generateTassDailyRouteSlipBlob, generateTassDailyRouteSlipWorkbook, routeSlipPeriodDates,
  sortTassRouteSlipRecords, TASS_DAILY_ROUTE_SLIP_FOOTER, TASS_DAILY_ROUTE_SLIP_HEADERS, tassDailyRouteSlipFileName, tassRouteClientSlipsFileName,
} from '../src/utils/tassDailyRouteSlip';
import { sanitizeRichTextRuns, sanitizeSpreadsheetCell } from '../src/utils/spreadsheetSafety';

// Feature 5b: real ExcelJS workbooks written and read back in Node.

const CLIENT_ONLY = 'SAP#12019325_CLIENT_ONLY';

function rma(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    id: 'rma-1', record_no: 'RMA-26-00001', company_name: 'BDO Unibank Inc.', company_id: 'c1', priority: '2 - Moderate', reference: '',
    rma_reference: 'RTC111926-01', remarks: 'workflow note', status: 'Scheduled', vehicle: '(None)', area: 'Caloocan', driver: '', driver_assistants: [],
    account_manager: 'Leanne Pavoreal', delivery_date: '2026-11-19', category: 'RMA', item_type: 'Unit', is_draft: 'No', rma_type: 'Return to Customer Slip',
    rma_movement: 'LOGISTICS_TRANSPORT', case_number: 'CAS-31417-Y4Y6Z3', service_slip_no: 'SS#60167', client_remarks: CLIENT_ONLY,
    internal_logistics_remarks: 'Note: with collection of Php2,000.00 cash. Please bring CR.',
    rma_contacts: [{ name: 'Dennis', phone: '09174535954' }, { name: 'Mae', phone: '09170000000' }],
    item_description: '', attachments: [], email_notification_sent: false, output_actions_log: [], created_by: 'Roselyn Arguelles', created_at: '', modified_by: '', modified_at: '',
    line_items: [
      { sku: 'AOC 21.5" Monitor', quantity: 1, unit_type: 'Unit', new_serial_number: 'NEW-7781', defective_serial_number: 'DEF-5512', purchase_date: '2025-08-14',
        sales_order_no: '12019325', accessories: 'Power cord', problem_description: 'No display', repair_note: 'Replaced panel', status_tag: 'For Return' },
      { sku: 'Power Adaptor', quantity: 2, unit_type: 'Item', serial_number: 'PA-0001', status_tag: 'UNIT REPAIRED/FOR DELIVERY' },
    ],
    ...overrides,
  } as DeliveryRecord;
}

async function readBack(records: DeliveryRecord[], options = {}) {
  const { blob, rows } = await generateTassDailyRouteSlipBlob(records, options);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return { ws: workbook.getWorksheet('Daily Route Slip')!, rows, workbook };
}
const cellText = (value: ExcelJS.CellValue): string => {
  if (value && typeof value === 'object' && 'richText' in value) return value.richText.map(run => run.text).join('');
  return value == null ? '' : String(value);
};

test('row 1 is exactly the 11 headers with no banner rows, and only RMA rows are exported', async () => {
  const delivery = rma({ id: 'del-1', category: 'Deliveries', rma_reference: 'DEL-SHOULD-NOT-APPEAR' });
  const { ws, workbook } = await readBack([rma(), delivery]);
  assert.equal(workbook.worksheets.length, 1);
  const headers = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1);
  assert.deepEqual(headers, [...TASS_DAILY_ROUTE_SLIP_HEADERS]);
  assert.deepEqual([...TASS_DAILY_ROUTE_SLIP_HEADERS], ['DeliveryDate', 'AccountManager', 'Reference', 'Status', 'Category', 'Company Name', 'ItemDescription',
    'Document Attachments', 'Area', 'Remarks', 'Created By']);
  assert.equal(ws.columnCount, 11, 'no Item Type, Path, Record No., Vehicle or Driver columns');
  const all = JSON.stringify(ws.getSheetValues());
  for (const absent of ['DEL-SHOULD-NOT-APPEAR', 'Item Type', 'Path', 'Record No.', 'Microgenesis']) assert.equal(all.includes(absent), false, absent);
  assert.deepEqual((ws.getRow(2).values as ExcelJS.CellValue[]).slice(1, 7).map(cellText),
    ['11/19/2026', 'Leanne Pavoreal', 'RTC111926-01', 'Scheduled', 'Return to Customer Slip', 'BDO Unibank Inc.']);
  await assert.rejects(generateTassDailyRouteSlipWorkbook([delivery]), /No RMA records/);
});

test('standalone FOR INTERNAL USE ONLY footer sits outside the AutoFilter range', async () => {
  const { ws } = await readBack([rma(), rma({ id: 'rma-2', rma_reference: 'POS111926-01', rma_type: 'Pull Out Slip' })]);
  assert.equal(ws.autoFilter, 'A1:K3', 'headers + data rows only');
  assert.equal(cellText(ws.getRow(4).getCell(1).value), '', 'blank spacer row');
  const footer = ws.getRow(5).getCell(1);
  assert.equal(footer.value, TASS_DAILY_ROUTE_SLIP_FOOTER);
  assert.equal(footer.font?.bold, true);
  assert.ok(ws.model.merges.includes('A5:K5'));
  assert.equal(ws.views[0].state, 'frozen');
  assert.equal(ws.getRow(1).getCell(1).fill && (ws.getRow(1).getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb, 'FF1B5E7A');
});

test('ItemDescription lists structured units with a bold, uppercased, quoted status tag', async () => {
  const { ws } = await readBack([rma()]);
  const cell = ws.getRow(2).getCell(7).value as ExcelJS.CellRichTextValue;
  assert.ok('richText' in cell);
  const text = cell.richText.map(run => run.text).join('');
  assert.equal(text, [
    '1Unit', 'AOC 21.5" Monitor', 'New SN: NEW-7781', 'Defective SN: DEF-5512', 'Date of Purchase: 08/14/2025 - SO: 12019325',
    'Accessories: Power cord', 'Problem: No display', 'Note: Replaced panel', '"FOR RETURN"',
  ].join('\n') + '\n\n' + ['2Item', 'Power Adaptor', 'SN: PA-0001', '"UNIT REPAIRED/FOR DELIVERY"'].join('\n'));
  const bold = cell.richText.filter(run => run.font?.bold).map(run => run.text);
  assert.deepEqual(bold, ['"FOR RETURN"', '"UNIT REPAIRED/FOR DELIVERY"']);
  assert.ok(cell.richText.filter(run => !run.font?.bold).every(run => !run.text.includes('"FOR')));
  assert.equal(formatDailyRouteSlipItemText(rma({ line_items: [], item_description: 'Legacy unit description' })), 'Legacy unit description');
});

test('Document Attachments shows SS# only on Return to Customer Slip, and Remarks never carry client remarks', async () => {
  const categories = ['Pull Out Slip', 'Return to Supplier Slip', 'Advance Replacement Slip', 'Receiving Slip', 'Transfer Out Slip'] as const;
  const records = [rma(), ...categories.map((rma_type, index) => rma({ id: `rma-${index + 2}`, rma_type, rma_reference: `X${index}`, service_slip_no: 'SS#STALE' }))];
  const rows = buildTassDailyRouteSlipRows(records, { groupByMovement: false });
  assert.equal(rows.find(row => row.values.Reference === 'RTC111926-01')!.values['Document Attachments'], 'SS#60167');
  for (const row of rows.filter(row => row.values.Reference !== 'RTC111926-01')) assert.equal(row.values['Document Attachments'], '', row.values.Category);
  const { ws } = await readBack([rma()]);
  assert.equal(cellText(ws.getRow(2).getCell(10).value), 'Dennis - 09174535954 / Mae - 09170000000\nNote: with collection of Php2,000.00 cash. Please bring CR.');
  assert.equal(JSON.stringify(ws.getSheetValues()).includes(CLIENT_ONLY), false);
  assert.equal(cellText(ws.getRow(2).getCell(9).value), 'Caloocan');
  assert.equal(cellText(ws.getRow(2).getCell(11).value), 'Roselyn Arguelles');
});

test('Movement Method grouping is Logistics Route, Supplier Collection, then Internal Printing with deterministic ties', () => {
  const records = [
    rma({ id: 'internal', rma_movement: 'INTERNAL_NO_DRIVER', rma_reference: 'POS111926-01' }),
    rma({ id: 'none', rma_movement: null, rma_reference: 'RR111826-01', delivery_date: '2026-11-18' }),
    rma({ id: 'supplier', rma_movement: 'SUPPLIER_COLLECTION', rma_reference: 'RTS111926-01' }),
    rma({ id: 'route-10', rma_reference: 'RTC111926-10' }),
    rma({ id: 'route-9', rma_reference: 'RTC111926-9' }),
    rma({ id: 'route-late', rma_reference: 'RTC112026-01', delivery_date: '2026-11-20' }),
  ];
  assert.deepEqual(sortTassRouteSlipRecords(records).map(r => r.id), ['route-9', 'route-10', 'route-late', 'supplier', 'none', 'internal']);
  assert.deepEqual(sortTassRouteSlipRecords(records, { movementFilter: 'LOGISTICS_TRANSPORT' }).map(r => r.id), ['route-9', 'route-10', 'route-late']);
  assert.deepEqual(sortTassRouteSlipRecords(records, { groupByMovement: false }).map(r => r.id), ['none', 'internal', 'route-9', 'route-10', 'supplier', 'route-late']);
});

test('DRRMMDDYY file names use the covered Manila day', () => {
  assert.equal(tassDailyRouteSlipFileName({ dateFrom: '2026-11-19', dateTo: '2026-11-19' }), 'DRR111926.xlsx');
  assert.equal(tassDailyRouteSlipFileName({ records: [{ delivery_date: '2026-11-19' }, { delivery_date: '2026-11-19' }] }), 'DRR111926.xlsx');
  assert.equal(tassDailyRouteSlipFileName({ dateFrom: '2026-11-19', dateTo: '2026-11-21', records: [{ delivery_date: '2026-11-19' }, { delivery_date: '2026-11-21' }] }), 'DRR111926-112126.xlsx');
  assert.equal(tassDailyRouteSlipFileName({ now: new Date('2026-11-19T17:30:00Z') }), 'DRR112026.xlsx', 'Asia/Manila is UTC+8');
  assert.deepEqual(routeSlipPeriodDates({ dateFrom: '2026-11-19', dateTo: '2026-11-21', records: [{ delivery_date: '2026-11-20' }] }), { from: '2026-11-20', to: '2026-11-20' });
  assert.equal(tassRouteClientSlipsFileName('2026-11-19'), 'Tass_Route_111926.pdf');
});

test('formula-injection prefixes are neutralized in plain and rich-text cells', async () => {
  for (const [input, expected] of [['=CMD|"/c calc"!A1', "'=CMD|\"/c calc\"!A1"], ['+1+1', "'+1+1"], ['-2+3', "'-2+3"], ['@SUM(A1)', "'@SUM(A1)"],
    ['\t=1', "'\t=1"], ['\r=1', "'\r=1"], ['  =1', "'  =1"], ['Normal', 'Normal'], ['a\r\nb', 'a\nb']] as const) {
    assert.equal(sanitizeSpreadsheetCell(input), expected, JSON.stringify(input));
  }
  assert.equal(sanitizeSpreadsheetCell(null), '');
  assert.deepEqual(sanitizeRichTextRuns([{ text: '' }, { text: '=HYPERLINK("x")' }, { text: 'tail', bold: true }]).map(run => run.text), ['', "'=HYPERLINK(\"x\")", 'tail']);
  assert.deepEqual(sanitizeRichTextRuns([{ text: '  ' }, { text: '=1', bold: true }]).map(run => run.text), ["'  ", '=1'], 'checks the concatenated cell text');

  const evil = rma({ company_name: '=CMD|"/c calc"!A1', account_manager: '+1+1', area: '-2+3', created_by: '@SUM(A1)', status: 'Scheduled',
    rma_contacts: [{ name: '\t=1', phone: '' }], internal_logistics_remarks: '',
    line_items: [{ sku: '=EVIL()', quantity: 1, unit_type: null as unknown as undefined, status_tag: '=TAG' }] });
  const legacy = rma({ id: 'rma-legacy', rma_reference: '-LEGACY', line_items: [], item_description: '=EVIL()' });
  const { ws } = await readBack([evil, legacy], { groupByMovement: false });
  const row = ws.getRow(3); // the legacy reference sorts first
  for (const column of [2, 6, 9, 10, 11]) assert.match(cellText(row.getCell(column).value), /^'/, `column ${column}`);
  assert.ok('richText' in (row.getCell(7).value as object), 'structured items keep their bold status tag run');
  assert.equal(cellText(ws.getRow(2).getCell(7).value), "'=EVIL()");
  assert.equal(cellText(ws.getRow(2).getCell(3).value), "'-LEGACY");
  for (let r = 1; r <= ws.rowCount; r++) {
    ws.getRow(r).eachCell(cell => {
      const text = cellText(cell.value);
      assert.equal(/^[\t\r ]*[=+\-@]/.test(text), false, `cell ${cell.address} is not formula-like: ${JSON.stringify(text)}`);
      assert.equal(typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value, false);
    });
  }
});
