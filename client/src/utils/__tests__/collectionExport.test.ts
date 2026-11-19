import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import type { DeliveryRecord } from '../../types';
import { collectionRecordExportRow } from '../collectionExport';
import { AC_EXTRA_COLUMNS, DELIVERY_COLUMNS, downloadCSV, downloadExcel, type ExportColumn } from '../export';
import { downloadDocx } from '../exportDocx';

const COLUMNS: ExportColumn[] = [...DELIVERY_COLUMNS, ...AC_EXTRA_COLUMNS];
const META = { reportName: 'Accounting Collection Record', generatedByName: 'Tess', generatedByRole: 'TASS' };

const record = (overrides: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  id: 'col-1', record_no: 'COL-26-00019', company_id: 'company-1', company_name: 'Acme Corp',
  category: 'Accounting Collection', reference: 'INV-1', priority: '2 - Moderate', area: 'Makati',
  delivery_date: '2026-11-12', driver: 'Alex One', driver_assistants: ['Ben Two', 'Cara Three'],
  account_manager: 'Casey', vehicle: 'Van', item_type: 'Cheque', status: 'Delivered', remarks: '',
  created_by: 'Julius Caesar Mendoza', created_at: '2026-11-12T09:34:00.000Z', amount: 1,
  collection_verified: true, collection_verified_by: 'Marc Dagode', collection_verified_at: '2026-11-12T09:49:00.000Z',
  line_items: [], ...overrides,
} as DeliveryRecord);

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

function csvCells(line: string): string[] {
  return line.slice(1, -1).split('","').map(cell => cell.replace(/""/g, '"'));
}

test('record export row has a value for every Accounting Collection column', () => {
  const row = collectionRecordExportRow(record());
  const missing = AC_EXTRA_COLUMNS.filter(c => !(c.key in row)).map(c => c.key);
  assert.deepEqual(missing, []);
});

test('amount is formatted like the record page and empty when absent', () => {
  const amount = (value: number | null | undefined) => collectionRecordExportRow(record({ amount: value })).amount_fmt;
  assert.equal(amount(1), '₱1.00');
  assert.equal(amount(1234.5), '₱1,234.50');
  assert.equal(amount(150000), '₱150,000.00');
  assert.equal(amount(1234567.891), '₱1,234,567.89');
  assert.equal(amount(0), '₱0.00');
  assert.equal(amount(null), '');
  assert.equal(amount(undefined), '');
});

test('record CSV carries the amount and keeps the verification columns', async () => {
  const blob = downloadCSV([collectionRecordExportRow(record())], COLUMNS, 'ac-record', META, undefined, true) as Blob;
  const lines = (await blob.text()).replace(/^﻿/, '').split('\r\n');
  const headerIndex = lines.findIndex(l => l.startsWith('"Record No."'));
  const header = csvCells(lines[headerIndex]);
  const cells = csvCells(lines[headerIndex + 1]);
  const cell = (name: string) => cells[header.indexOf(name)];
  assert.equal(cell('Amount (₱)'), '₱1.00');
  assert.equal(cell('Created By'), 'Julius Caesar Mendoza');
  assert.ok(cell('Created At'));
  assert.equal(cell('Collection Verified'), 'Verified');
  assert.equal(cell('Verified By'), 'Marc Dagode');
  assert.ok(cell('Verified At'));
});

test('record CSV leaves the amount empty when the record has none', async () => {
  const blob = downloadCSV([collectionRecordExportRow(record({ amount: null }))], COLUMNS, 'ac-record', META, undefined, true) as Blob;
  const lines = (await blob.text()).split('\r\n');
  const headerIndex = lines.findIndex(l => l.startsWith('"Record No."'));
  const header = csvCells(lines[headerIndex]);
  assert.equal(csvCells(lines[headerIndex + 1])[header.indexOf('Amount (₱)')], '');
});

test('record Excel and Word outputs carry the amount', async () => {
  const rows = [collectionRecordExportRow(record({ amount: 1234.5 }))];
  const excel = await downloadExcel(rows, COLUMNS, 'Accounting Collection', 'ac-record', META, undefined, undefined, true) as Blob;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await excel.arrayBuffer()) as any);
  const values: string[] = [];
  workbook.worksheets[0].eachRow(row => row.eachCell(c => values.push(String(c.value))));
  assert.ok(values.includes('₱1,234.50'));

  const docx = await downloadDocx(rows, COLUMNS, 'Accounting Collection Record', 'ac-record', META,
    undefined, undefined, undefined, undefined, true) as Blob;
  assert.match(zipEntry(Buffer.from(await docx.arrayBuffer()), 'word/document.xml'), /₱1,234\.50/);
});
