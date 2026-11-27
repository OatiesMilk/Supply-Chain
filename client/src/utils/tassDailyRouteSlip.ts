import type { DeliveryRecord, RecordLineItem, RmaMovement } from '../types';
import { canonicalRmaCategory, formatLogisticsRouteRemarks, isReturnToCustomerCategory } from './rma';
import { formatRmaItemQty, formatRmaPurchaseAndSo, formatSlipDate, isStructuredRmaItem, rmaItemBlocks } from './rmaItems';
import { sanitizeRichTextRuns, sanitizeSpreadsheetCell, type SpreadsheetRun } from './spreadsheetSafety';
import { formatRmaMovementBadge } from './rmaTableDisplay';

/**
 * Clean TASS Daily Route Slip (DRRMMDDYY.xlsx), Feature 5b / Section 4C.
 * Exactly 11 columns, RMA rows only, no banner rows and a standalone
 * "FOR INTERNAL USE ONLY" footer outside the AutoFilter range — no manual cleanup.
 */
export const TASS_DAILY_ROUTE_SLIP_HEADERS = [
  'DeliveryDate',
  'AccountManager',
  'Reference',
  'Status',
  'Category',
  'Company Name',
  'ItemDescription',
  'Document Attachments',
  'Area',
  'Remarks',
  'Created By',
] as const;
export type TassDailyRouteSlipHeader = typeof TASS_DAILY_ROUTE_SLIP_HEADERS[number];
export const TASS_DAILY_ROUTE_SLIP_FOOTER = 'FOR INTERNAL USE ONLY';
export const TASS_DAILY_ROUTE_SLIP_SHEET = 'Daily Route Slip';
export const MAX_ROUTE_SLIP_RECORDS = 250;
export const TASS_ROUTE_SLIP_COLUMN_WIDTHS = [13, 20, 18, 14, 24, 28, 44, 20, 18, 40, 20] as const;

export type RouteSlipRecord = Pick<DeliveryRecord,
  'id' | 'category' | 'status' | 'rma_type' | 'rma_reference' | 'reference' | 'company_name' | 'delivery_date' | 'account_manager'
  | 'area' | 'created_by' | 'item_description' | 'service_slip_no' | 'internal_logistics_remarks' | 'remarks'
  | 'rma_contacts' | 'customer_contact_name' | 'customer_contact_phone'
> & Partial<Pick<DeliveryRecord, 'rma_movement' | 'record_no' | 'line_items' | 'purchase_date' | 'client_remarks'>>;

export type RouteSlipMovementFilter = 'ALL' | RmaMovement;

const text = (value: string | null | undefined) => (value ?? '').trim();
const MOVEMENT_ORDER: Record<string, number> = { LOGISTICS_TRANSPORT: 0, SUPPLIER_COLLECTION: 1, INTERNAL_NO_DRIVER: 2 };
export const movementBucket = (movement: string | null | undefined) => MOVEMENT_ORDER[movement ?? ''] ?? 2;
const referenceKey = (r: RouteSlipRecord) => text(r.rma_reference) || text(r.reference) || text(r.record_no) || r.id;

/** RMA rows only: anything else passed in by mistake is dropped. */
export function rmaRouteSlipRecords<T extends RouteSlipRecord>(records: readonly T[]): T[] {
  return records.filter(record => record.category === 'RMA');
}

/**
 * Movement Method grouping: Logistics Route → Supplier Collection → Internal
 * Printing (incl. unset), then delivery date, then reference.
 */
export function sortTassRouteSlipRecords<T extends RouteSlipRecord>(records: readonly T[], options: { groupByMovement?: boolean; movementFilter?: RouteSlipMovementFilter } = {}): T[] {
  const { groupByMovement = true, movementFilter = 'ALL' } = options;
  const scoped = rmaRouteSlipRecords(records).filter(record => movementFilter === 'ALL' || record.rma_movement === movementFilter);
  const date = (r: T) => text(r.delivery_date) || '9999-99-99';
  return [...scoped].sort((a, b) => (groupByMovement ? movementBucket(a.rma_movement) - movementBucket(b.rma_movement) : 0)
    || date(a).localeCompare(date(b))
    || referenceKey(a).localeCompare(referenceKey(b), 'en', { numeric: true }));
}

export function routeSlipMovementCounts(records: readonly RouteSlipRecord[]) {
  const counts = { logistics: 0, supplier: 0, internal: 0 };
  for (const record of records) {
    const bucket = movementBucket(record.rma_movement);
    if (bucket === 0) counts.logistics++; else if (bucket === 1) counts.supplier++; else counts.internal++;
  }
  return counts;
}

export interface RouteSlipRun extends SpreadsheetRun { text: string; bold?: boolean }

function itemLines(item: RecordLineItem): RouteSlipRun[] {
  const lines: string[] = [];
  const qty = formatRmaItemQty(item);
  if (qty) lines.push(qty);
  if (text(item.sku)) lines.push(text(item.sku));
  if (text(item.serial_number)) lines.push(`SN: ${text(item.serial_number)}`);
  if (text(item.new_serial_number)) lines.push(`New SN: ${text(item.new_serial_number)}`);
  if (text(item.defective_serial_number)) lines.push(`Defective SN: ${text(item.defective_serial_number)}`);
  const purchase = formatRmaPurchaseAndSo(item.purchase_date, item.sales_order_no);
  if (purchase) lines.push(purchase);
  if (text(item.accessories)) lines.push(`Accessories: ${text(item.accessories)}`);
  if (text(item.problem_description)) lines.push(`Problem: ${text(item.problem_description)}`);
  if (text(item.repair_note)) lines.push(`Note: ${text(item.repair_note)}`);
  const runs: RouteSlipRun[] = lines.map(line => ({ text: line }));
  if (text(item.status_tag)) runs.push({ text: `"${text(item.status_tag).toUpperCase()}"`, bold: true });
  return runs;
}

/** Lines per item; separators are added when the runs are joined. */
function itemBlocks(record: RouteSlipRecord): RouteSlipRun[][] {
  const items = (record.line_items ?? []).filter(item => text(item.sku) || isStructuredRmaItem(item));
  if (items.length) return items.map(itemLines);
  return rmaItemBlocks(record).map(block => [
    ...(block.qty ? [{ text: block.qty }] : []),
    ...block.lines.map(line => ({ text: line.text, ...(line.bold ? { bold: true } : {}) })),
  ]);
}

/**
 * ItemDescription as rich-text runs: lines joined by newlines, items separated
 * by a blank line, the uppercased quoted status tag in its own bold run.
 */
export function formatDailyRouteSlipItemRuns(record: RouteSlipRecord): RouteSlipRun[] {
  const runs: RouteSlipRun[] = [];
  const push = (run: RouteSlipRun) => {
    const last = runs[runs.length - 1];
    if (last && !!last.bold === !!run.bold) last.text += run.text; else runs.push({ ...run });
  };
  itemBlocks(record).forEach((lines, blockIndex) => {
    if (blockIndex > 0) push({ text: '\n\n' });
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) push({ text: '\n' });
      push(line);
    });
  });
  return sanitizeRichTextRuns(runs.filter(run => run.text));
}

export function formatDailyRouteSlipItemText(record: RouteSlipRecord): string {
  return formatDailyRouteSlipItemRuns(record).map(run => run.text).join('');
}

/** Contacts + internal Logistics notes; client-facing slip remarks are never mixed in. */
export function formatDailyRouteSlipRemarks(record: RouteSlipRecord): string {
  return sanitizeSpreadsheetCell(formatLogisticsRouteRemarks(record));
}

export interface TassRouteSlipRow {
  values: Record<TassDailyRouteSlipHeader, string>;
  itemRuns: RouteSlipRun[];
  movement: string;
}

export function buildTassDailyRouteSlipRows(records: readonly RouteSlipRecord[], options: { groupByMovement?: boolean; movementFilter?: RouteSlipMovementFilter } = {}): TassRouteSlipRow[] {
  return sortTassRouteSlipRecords(records, options).map(r => {
    const itemRuns = formatDailyRouteSlipItemRuns(r);
    return {
      itemRuns,
      movement: formatRmaMovementBadge(r.rma_movement).label,
      values: {
        DeliveryDate: formatSlipDate(r.delivery_date),
        AccountManager: sanitizeSpreadsheetCell(r.account_manager),
        Reference: sanitizeSpreadsheetCell(text(r.rma_reference) || text(r.reference)),
        Status: sanitizeSpreadsheetCell(r.status),
        Category: sanitizeSpreadsheetCell(canonicalRmaCategory(r.rma_type) || r.rma_type || ''),
        'Company Name': sanitizeSpreadsheetCell(r.company_name),
        ItemDescription: itemRuns.map(run => run.text).join(''),
        'Document Attachments': isReturnToCustomerCategory(r.rma_type) ? sanitizeSpreadsheetCell(text(r.service_slip_no)) : '',
        Area: sanitizeSpreadsheetCell(r.area),
        Remarks: formatDailyRouteSlipRemarks(r),
        'Created By': sanitizeSpreadsheetCell(r.created_by),
      },
    };
  });
}

/** YYYY-MM-DD -> MMDDYY. */
export function routeSlipDateStamp(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(date));
  if (!match) throw new Error('A valid YYYY-MM-DD date is required.');
  return `${match[2]}${match[3]}${match[1].slice(2)}`;
}

export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * The day the slip covers: an explicit single day, else the one delivery date all
 * rows share, else today in Manila. A multi-day explicit range keeps both ends.
 */
export function routeSlipPeriodDates(options: { dateFrom?: string; dateTo?: string; records?: readonly Pick<RouteSlipRecord, 'delivery_date'>[]; now?: Date }): { from: string; to: string } {
  const { dateFrom, dateTo, records = [], now } = options;
  if (dateFrom && dateTo && dateFrom !== dateTo) {
    const dates = [...new Set(records.map(r => text(r.delivery_date)).filter(Boolean))];
    if (dates.length === 1) return { from: dates[0], to: dates[0] };
    return { from: dateFrom, to: dateTo };
  }
  if (dateFrom || dateTo) { const day = (dateFrom || dateTo)!; return { from: day, to: day }; }
  const dates = [...new Set(records.map(r => text(r.delivery_date)).filter(Boolean))];
  const day = dates.length === 1 ? dates[0] : manilaToday(now);
  return { from: day, to: day };
}

/** DRR111926.xlsx, or DRR111926-112026.xlsx for a multi-day range. */
export function tassDailyRouteSlipFileName(options: Parameters<typeof routeSlipPeriodDates>[0] = {}): string {
  const { from, to } = routeSlipPeriodDates(options);
  return from === to ? `DRR${routeSlipDateStamp(from)}.xlsx` : `DRR${routeSlipDateStamp(from)}-${routeSlipDateStamp(to)}.xlsx`;
}

/** Client Slips PDF paired with the Daily Route Slip in a Logistics dispatch. */
export function tassRouteClientSlipsFileName(date: string): string {
  return `Tass_Route_${routeSlipDateStamp(date)}.pdf`;
}

const HEADER_FILL = 'FF1B5E7A';
const TINT_FILL = 'FFE6F4F8';
const FOOTER_COLOR = 'FF1F3864';
const FONT = { name: 'Calibri', size: 10 } as const;

function lineCount(value: string, width: number): number {
  const perLine = Math.max(8, Math.floor(width * 1.1));
  return value.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
}
export function routeSlipRowHeight(row: TassRouteSlipRow): number {
  const lines = Math.max(lineCount(row.values.ItemDescription, TASS_ROUTE_SLIP_COLUMN_WIDTHS[6]), lineCount(row.values.Remarks, TASS_ROUTE_SLIP_COLUMN_WIDTHS[9]));
  return Math.min(240, Math.max(22, lines * 13 + 6));
}

export interface TassRouteSlipOptions {
  groupByMovement?: boolean;
  movementFilter?: RouteSlipMovementFilter;
}

export async function generateTassDailyRouteSlipWorkbook(records: readonly RouteSlipRecord[], options: TassRouteSlipOptions = {}) {
  const rows = buildTassDailyRouteSlipRows(records, options);
  if (!rows.length) throw new Error('No RMA records match this Daily Route Slip.');
  if (rows.length > MAX_ROUTE_SLIP_RECORDS) throw new Error(`${rows.length} records match. Export at most ${MAX_ROUTE_SLIP_RECORDS} at a time — narrow the date range or filters.`);
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Microgenesis Supply Chain Portal';
  workbook.created = new Date();
  const ws = workbook.addWorksheet(TASS_DAILY_ROUTE_SLIP_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  });
  ws.columns = TASS_DAILY_ROUTE_SLIP_HEADERS.map((header, index) => ({ key: header, width: TASS_ROUTE_SLIP_COLUMN_WIDTHS[index] }));
  const thin = { style: 'thin' as const, color: { argb: 'FFB6CED8' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  const header = ws.getRow(1);
  TASS_DAILY_ROUTE_SLIP_HEADERS.forEach((title, index) => {
    const cell = header.getCell(index + 1);
    cell.value = title;
    cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  header.height = 24;

  rows.forEach((row, index) => {
    const excelRow = ws.getRow(index + 2);
    TASS_DAILY_ROUTE_SLIP_HEADERS.forEach((title, column) => {
      const cell = excelRow.getCell(column + 1);
      if (title === 'ItemDescription' && row.itemRuns.some(run => run.bold)) {
        cell.value = { richText: row.itemRuns.map(run => ({ text: run.text, font: { ...FONT, ...(run.bold ? { bold: true } : {}) } })) };
      } else {
        cell.value = row.values[title];
      }
      cell.font = { ...FONT };
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: title === 'DeliveryDate' ? 'center' : 'left' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? TINT_FILL : 'FFFFFFFF' } };
      cell.border = border;
    });
    excelRow.height = routeSlipRowHeight(row);
  });

  const lastDataRow = rows.length + 1;
  // AutoFilter covers the headers and data only, so sorting never absorbs the footer.
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastDataRow, column: TASS_DAILY_ROUTE_SLIP_HEADERS.length } };
  ws.getRow(lastDataRow + 1).height = 12;
  const footerRowNumber = lastDataRow + 2;
  ws.mergeCells(footerRowNumber, 1, footerRowNumber, TASS_DAILY_ROUTE_SLIP_HEADERS.length);
  const footer = ws.getCell(footerRowNumber, 1);
  footer.value = TASS_DAILY_ROUTE_SLIP_FOOTER;
  footer.font = { ...FONT, bold: true, color: { argb: FOOTER_COLOR } };
  footer.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(footerRowNumber).height = 18;
  return { workbook, rows, footerRowNumber };
}

export async function generateTassDailyRouteSlipBlob(records: readonly RouteSlipRecord[], options: TassRouteSlipOptions = {}) {
  const { workbook, rows } = await generateTassDailyRouteSlipWorkbook(records, options);
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    blob: new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    rows,
  };
}
