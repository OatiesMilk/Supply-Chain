/**
 * Courier/Daily Route Slip export — Excel and PDF.
 * Matches the Daily Route Slip template (Sheets 1/2/4/5 of DELIVERY ROUTE 2026).
 */

import { DeliveryRecord } from '../types';
import { fmtDate } from './export';

export interface RouteSlipParams {
  records: DeliveryRecord[];
  driverName: string;
  /** YYYY-MM-DD from the date filter, or today if not set */
  date: string;
  preparedBy: string;
  filename: string;
  /** When provided, counts are built from the full status history (Status Trail mode). */
  auditSets?: Map<string, Set<string>>;
}

const TITLE       = 'COURIER/DAILY ROUTE SLIP REPORT';
const NAVY_ARGB   = 'FF1F3864';
const WHITE_ARGB  = 'FFFFFFFF';
const RED_ARGB    = 'FFFF0000';
const YELLOW_ARGB = 'FFFFFF00';
const GRAY_ARGB   = 'FFF8F9FA';
const NAVY_RGB: [number, number, number]   = [31, 56, 100];

// Softened reminder-section colors (replace harsh red/yellow)
const SOFT_RED_ARGB    = 'FF991B1B';   // red-800
const SOFT_YELLOW_ARGB = 'FFFEFCE8';   // yellow-50
const AMBER_ARGB       = 'FF92400E';   // amber-800
const SOFT_RED_RGB:    [number, number, number] = [153,  27,  27];
const SOFT_YELLOW_RGB: [number, number, number] = [254, 252, 232];
const AMBER_RGB:       [number, number, number] = [146,  64,  14];

const MUST_READ_NOTE =
  'NOTE: DO NOT LEAVE ORIGINAL INVOICE & DR TO THE FOLLOWING SM, BDO, CENTURY PACIFIC, ' +
  'ASPEN, JG SUMMIT, URC, UNICORN, FIRST BALFOUR, CEBU AIR FOR COUNTER, INDRA, MONARK, ' +
  '2GO GRPO PURPOSE';

async function loadLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch('/microgenesis_logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function sortedRecords(records: DeliveryRecord[]): DeliveryRecord[] {
  return [...records].sort((a, b) => {
    const ca = (a.area || '').toLowerCase();
    const cb = (b.area || '').toLowerCase();
    if (ca !== cb) return ca.localeCompare(cb);
    return (a.priority || '').localeCompare(b.priority || '');
  });
}

function computeCounts(records: DeliveryRecord[]) {
  return {
    scheduled:    records.filter(r => r.status === 'Scheduled').length,
    pending:      records.filter(r => r.status === 'Pending').length,
    reschedHold:  records.filter(r => r.status === 'Rescheduled' || r.status === 'On-Hold').length,
    accomplished: records.filter(r => r.status === 'Delivered').length,
    total:        records.length,
  };
}

// Fetch the full set of statuses each record has ever held, using AuditLog entries.
// new_value / previous_value in audit entries are already serialized via serializeRecord,
// so status values are in display form ("Scheduled", "Delivered", etc.).
export async function fetchHistoricStatusSets(records: DeliveryRecord[]): Promise<Map<string, Set<string>>> {
  const sets = new Map<string, Set<string>>();
  for (const r of records) sets.set(r.id, new Set([r.status]));

  await Promise.all(records.map(async r => {
    try {
      const res = await fetch(`/api/records/${r.id}/audit`, { credentials: 'include' });
      if (!res.ok) return;
      const entries: { previous_value: unknown; new_value: unknown }[] = await res.json();
      const set = sets.get(r.id)!;
      for (const e of entries) {
        const nv = e.new_value  as Record<string, unknown> | null;
        const pv = e.previous_value as Record<string, unknown> | null;
        if (typeof nv?.status === 'string') set.add(nv.status);
        if (typeof pv?.status === 'string') set.add(pv.status);
      }
    } catch { /* ignore — falls back to current status */ }
  }));

  return sets;
}

// Build counts from pre-fetched historic status sets.
// total is always a simple record count regardless of history.
function computeHistoricCounts(records: DeliveryRecord[], auditSets: Map<string, Set<string>>) {
  let scheduled = 0, pending = 0, reschedHold = 0, accomplished = 0;
  for (const r of records) {
    const held = auditSets.get(r.id) ?? new Set([r.status]);
    if (held.has('Scheduled'))                            scheduled++;
    if (held.has('Pending'))                              pending++;
    if (held.has('Rescheduled') || held.has('On-Hold'))  reschedHold++;
    if (held.has('Delivered'))                            accomplished++;
  }
  return { scheduled, pending, reschedHold, accomplished, total: records.length };
}

const TRAIL_FOOTNOTE = '* Status Trail counts reflect all statuses each record has passed through. Status totals may exceed total record count.';

// ─── Excel ────────────────────────────────────────────────────────────────────

export async function downloadRouteSlipExcel({
  records, driverName, date, preparedBy, filename, auditSets,
}: RouteSlipParams): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Route Slip');

  const now  = new Date();
  const year = now.getFullYear();
  const dateDisplay = date
    ? fmtDate(`${date}T12:00:00`)
    : fmtDate(now.toISOString());

  const vehicle = records.find(r => r.vehicle)?.vehicle ?? '';
  const helper  = records.find(r => r.driver_assistants?.length)
    ?.driver_assistants.join(', ') ?? '';

  const sorted = sortedRecords(records);
  const counts = auditSets ? computeHistoricCounts(records, auditSets) : computeCounts(records);

  // 12 data columns: A–L
  const NCOLS = 12;
  ws.columns = [
    { width: 12 },  // A – Priority
    { width: 36 },  // B – Company Name
    { width: 18 },  // C – Documents
    { width: 18 },  // D – Reference
    { width: 14 },  // E – Waybill #
    { width: 52 },  // F – Remarks
    { width: 14 },  // G – Area
    { width: 13 },  // H – Type/Mode
    { width: 12 },  // I – TIME-IN
    { width: 12 },  // J – TIME-OUT
    { width: 16 },  // K – Signed by Client
    { width: 20 },  // L – Remarks
  ];

  const E = (n: number) => Array<null>(n).fill(null);
  let rn = 0;
  const next = (vals: (string | number | null | undefined)[]) => { rn++; return ws.addRow(vals); };

  const fillRowColor = (row: ReturnType<typeof ws.addRow>, argb: string) => {
    for (let c = 1; c <= NCOLS; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    }
  };

  // ── Row 1: Vehicle (left) | logo area (center) | CONFIDENTIAL (right) ───────
  const r1 = next(['Vehicle: ' + vehicle, ...E(3), '', ...E(3), 'CONFIDENTIAL', ...E(3)]);
  ws.mergeCells(rn, 1, rn, 4);
  ws.mergeCells(rn, 5, rn, 8);
  ws.mergeCells(rn, 9, rn, NCOLS);
  r1.getCell(1).font      = { bold: true, size: 10 };
  r1.getCell(1).alignment = { vertical: 'middle' };
  r1.getCell(9).font      = { bold: true, size: 9 };
  r1.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
  r1.height = 48;

  // ── Row 2: Date (left) | logo area (center) | YR-[year] in red (right) ─────
  const r2 = next(['Date: ' + dateDisplay, ...E(3), '', ...E(3), `YR-${year}`, ...E(3)]);
  ws.mergeCells(rn, 1, rn, 4);
  ws.mergeCells(rn, 5, rn, 8);
  ws.mergeCells(rn, 9, rn, NCOLS);
  r2.getCell(1).font      = { size: 10 };
  r2.getCell(1).alignment = { vertical: 'middle' };
  r2.getCell(9).font      = { bold: true, size: 12, color: { argb: RED_ARGB } };
  r2.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
  r2.height = 36;

  // ── Row 3: Driver (left) | Title (center) | Fleet Card (right) ──────────────
  const r3 = next(['Driver: ' + driverName, ...E(3), TITLE, ...E(3), 'Fleet Card Odometer: ___________', ...E(3)]);
  ws.mergeCells(rn, 1, rn, 4);
  ws.mergeCells(rn, 5, rn, 8);
  ws.mergeCells(rn, 9, rn, NCOLS);
  r3.getCell(1).font      = { bold: true, size: 10 };
  r3.getCell(1).alignment = { vertical: 'middle' };
  r3.getCell(5).font      = { bold: true, size: 12, color: { argb: NAVY_ARGB } };
  r3.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  r3.getCell(9).font      = { size: 9 };
  r3.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
  r3.height = 22;

  // ── Row 4: Helper (left) | empty (center) | Gas Price (right) ───────────────
  const r4 = next(['Helper: ' + helper, ...E(3), '', ...E(3), 'Gas Total Price Per Liter: ___________', ...E(3)]);
  ws.mergeCells(rn, 1, rn, 4);
  ws.mergeCells(rn, 5, rn, 8);
  ws.mergeCells(rn, 9, rn, NCOLS);
  r4.getCell(1).font      = { size: 10 };
  r4.getCell(1).alignment = { vertical: 'middle' };
  r4.getCell(9).font      = { size: 9 };
  r4.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
  r4.height = 18;

  // ── Row 5: blank separator ──────────────────────────────────────────────────
  next(E(NCOLS));

  // ── Row 6: Table headers ─────────────────────────────────────────────────
  const HEADERS = [
    'Priority', 'Company Name', 'Documents', 'Reference',
    'Waybill #', 'Remarks', 'Area', 'Type / Mode',
    'TIME-IN', 'TIME-OUT', 'Signed by Client', 'Remarks',
  ];
  const hdr = next(HEADERS);
  hdr.eachCell({ includeEmpty: true }, cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_ARGB } };
    cell.font      = { bold: true, color: { argb: WHITE_ARGB }, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = {
      top:    { style: 'thin', color: { argb: NAVY_ARGB } },
      bottom: { style: 'thin', color: { argb: NAVY_ARGB } },
      left:   { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
    };
  });
  hdr.height = 22;

  // ── Data rows ───────────────────────────────────────────────────────────────
  sorted.forEach((r, idx) => {
    const dr = next([
      r.priority      || '',
      r.company_name  || '',
      r.id            || '',
      r.reference     || '',
      '',   // Waybill # — blank
      r.remarks       || '',
      r.area          || '',
      '',   // Type/Mode — blank
      '',   // TIME-IN — blank
      '',   // TIME-OUT — blank
      '',   // Signed by Client — blank
      '',   // Remarks — blank
    ]);
    const isAlt = idx % 2 === 1;
    dr.eachCell({ includeEmpty: true }, cell => {
      if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_ARGB } };
      cell.font      = { size: 9 };
      cell.alignment = { vertical: 'middle' };
      cell.border    = {
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        left:   { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right:  { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
    dr.height = 18;
  });

  // ── Footer ───────────────────────────────────────────────────────────────────
  next(E(NCOLS));

  // IMPORTANT REMINDERS! — red bg, white bold
  const remR = next(['IMPORTANT REMINDERS!', ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  fillRowColor(remR, SOFT_RED_ARGB);
  remR.getCell(1).font      = { bold: true, size: 10, color: { argb: WHITE_ARGB } };
  remR.getCell(1).alignment = { vertical: 'middle' };
  remR.height = 18;

  // 4 yellow reminder rows
  const REMINDER_BULLETS = [
    'PLEASE READ NOTE AND FOLLOW',
    'ALWAYS BRING YOUR OR AND CR FOR POSSIBLE COLLECTION',
    "ALL DOC'S SHOULD HAVE PRINTED NAME AND DELIVERED BY",
    'CHECK THE ITEM PER DELIVERY RECEIPTS BEFORE CLIENT SIGNING',
  ];
  for (const txt of REMINDER_BULLETS) {
    const yr = next([txt, ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS);
    fillRowColor(yr, SOFT_YELLOW_ARGB);
    yr.getCell(1).font      = { size: 9 };
    yr.getCell(1).alignment = { vertical: 'middle' };
    yr.height = 16;
  }

  // Red text note
  const noteR = next(['NOTE: ALWAYS BRING O.R / CR', ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  noteR.getCell(1).font      = { bold: true, size: 9, color: { argb: RED_ARGB } };
  noteR.getCell(1).alignment = { vertical: 'middle' };
  noteR.height = 16;

  // KM tracking
  next(E(NCOLS));
  const kmR = next(['KM START: ___________', ...E(5), 'KM END: ___________', ...E(NCOLS - 8)]);
  ws.mergeCells(rn, 1, rn, 6);
  ws.mergeCells(rn, 7, rn, NCOLS);
  kmR.getCell(1).font = { size: 9 };
  kmR.getCell(7).font = { size: 9 };
  kmR.height = 16;

  // A MUST READ! — yellow bg, red bold title
  const mustTitleR = next(['A MUST READ!', ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  fillRowColor(mustTitleR, AMBER_ARGB);
  mustTitleR.getCell(1).font      = { bold: true, size: 10, color: { argb: RED_ARGB } };
  mustTitleR.getCell(1).alignment = { vertical: 'middle' };
  mustTitleR.height = 18;

  const mustNoteR = next([MUST_READ_NOTE, ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  fillRowColor(mustNoteR, SOFT_YELLOW_ARGB);
  mustNoteR.getCell(1).font      = { size: 8 };
  mustNoteR.getCell(1).alignment = { vertical: 'middle', wrapText: true };
  mustNoteR.height = 36;

  // Status counts (left) | Time tracking (right)
  next(E(NCOLS));

  const c0 = next([`No. of Scheduled: ${counts.scheduled}`, ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  c0.getCell(1).font = { size: 9 };
  c0.height = 16;

  const c1 = next([`No. of Pending: ${counts.pending}`, ...E(5), 'Time of Departure: ___________', ...E(NCOLS - 8)]);
  ws.mergeCells(rn, 1, rn, 6);
  ws.mergeCells(rn, 7, rn, NCOLS);
  c1.getCell(1).font = { size: 9 };
  c1.getCell(7).font = { size: 9 };
  c1.height = 16;

  const c2 = next([`No. of Rescheduled / Hold: ${counts.reschedHold}`, ...E(5), 'Time of Arrival: ___________', ...E(NCOLS - 8)]);
  ws.mergeCells(rn, 1, rn, 6);
  ws.mergeCells(rn, 7, rn, NCOLS);
  c2.getCell(1).font = { size: 9 };
  c2.getCell(7).font = { size: 9 };
  c2.height = 16;

  const c3 = next([`No. of Accomplished: ${counts.accomplished}`, ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  c3.getCell(1).font = { size: 9 };
  c3.height = 16;

  if (auditSets) {
    const cNote = next([TRAIL_FOOTNOTE, ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS);
    cNote.getCell(1).font = { italic: true, size: 7, color: { argb: 'FF64748B' } };
    cNote.height = 13;
  }

  const c4 = next([`No. of Shipment: ${counts.total}`, ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  c4.getCell(1).font = { bold: true, size: 9 };
  c4.height = 16;

  const c5 = next(['No. of Transfer out / Txo: ___________', ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  c5.getCell(1).font = { size: 9 };
  c5.height = 16;

  const c6 = next(['C/o Breakfix: ___________', ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  c6.getCell(1).font = { size: 9 };
  c6.height = 16;

  // Courier reminder
  next(E(NCOLS));
  const courR = next([
    'Kindly put waybill number once shipment has been accomplished. Update supply chain status immediately.',
    ...E(NCOLS - 1),
  ]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  courR.getCell(1).font      = { italic: true, size: 8 };
  courR.getCell(1).alignment = { wrapText: true };
  courR.height = 22;

  // Sign-off
  next(E(NCOLS));
  const sig1 = next([`PREPARED BY: ${preparedBy}`, ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  sig1.getCell(1).font = { bold: true, size: 10 };
  sig1.height = 18;

  const sig2 = next(['CHECKED BY: ___________', ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  sig2.getCell(1).font = { bold: true, size: 10 };
  sig2.height = 18;

  const sig3 = next(['Logistics Coordinator', ...E(NCOLS - 1)]);
  ws.mergeCells(rn, 1, rn, NCOLS);
  sig3.getCell(1).font      = { italic: true, size: 9 };
  sig3.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  sig3.height = 16;

  // ── Logo overlay — rows 1–2, center columns (logo above title in row 3) ─────
  const logo = await loadLogoBase64();
  if (logo) {
    const imgId = wb.addImage({ base64: logo.split(',')[1], extension: 'png' });
    ws.addImage(imgId, {
      tl: { col: 4.5, row: 0 },
      br: { col: 7.5, row: 2 },
    } as any);
  }

  // ── Download ──────────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `${filename}-route-slip-${now.toISOString().split('T')[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export async function downloadRouteSlipPDF({
  records, driverName, date, preparedBy, filename, auditSets,
}: RouteSlipParams): Promise<void> {
  const { jsPDF }             = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const now  = new Date();
  const year = now.getFullYear();
  const dateDisplay = date
    ? fmtDate(`${date}T12:00:00`)
    : fmtDate(now.toISOString());

  const pageW = doc.internal.pageSize.getWidth();   // 297mm landscape
  const pageH = doc.internal.pageSize.getHeight();  // 210mm landscape

  const vehicle = records.find(r => r.vehicle)?.vehicle ?? '';
  const helper  = records.find(r => r.driver_assistants?.length)
    ?.driver_assistants.join(', ') ?? '';

  const sorted = sortedRecords(records);
  const counts = auditSets ? computeHistoricCounts(records, auditSets) : computeCounts(records);

  // ── Logo ────────────────────────────────────────────────────────────────────
  const logo = await loadLogoBase64();
  const MARGIN = 10;
  const centerX = pageW / 2;

  if (logo) doc.addImage(logo, 'PNG', centerX - 22, 4, 44, 15);

  // ── Title ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY_RGB);
  doc.text(TITLE, centerX, logo ? 23 : 12, { align: 'center' });

  // ── Left header block ───────────────────────────────────────────────────────
  const leftX = MARGIN;
  let lY = 8;
  const labelFont = () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY_RGB); };
  const valueFont = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 41, 59); };

  const labelValue = (label: string, value: string, x: number, y: number) => {
    labelFont();
    doc.text(label, x, y);
    valueFont();
    doc.text(value, x + doc.getTextWidth(label) + 1.5, y);
  };

  labelValue('Vehicle:', vehicle,     leftX, lY);      lY += 5;
  labelValue('Date:',    dateDisplay, leftX, lY);      lY += 5;
  labelValue('Driver:',  driverName,  leftX, lY);      lY += 5;
  labelValue('Helper:',  helper,      leftX, lY);

  // ── Right header block ──────────────────────────────────────────────────────
  const rightX = pageW - MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('CONFIDENTIAL', rightX, 8, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...[255, 0, 0] as [number, number, number]);
  doc.text(`YR-${year}`, rightX, 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('Fleet Card Odometer: ___________', rightX, 20, { align: 'right' });
  doc.text('Gas Total Price Per Liter: ___________', rightX, 25, { align: 'right' });

  // ── Header separator ────────────────────────────────────────────────────────
  doc.setDrawColor(...NAVY_RGB);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 30, pageW - MARGIN, 30);

  // ── Data table ──────────────────────────────────────────────────────────────
  // Landscape A4 usable width = 297 - 20 = 277mm
  // 12 columns summing to 277mm
  autoTable(doc, {
    head: [[
      'Priority', 'Company Name', 'Documents', 'Reference',
      'Waybill #', 'Remarks', 'Area', 'Type /\nMode',
      'TIME-IN', 'TIME-OUT', 'Signed by\nClient', 'Remarks',
    ]],
    body: sorted.map(r => [
      r.priority     || '',
      r.company_name || '',
      r.id           || '',
      r.reference    || '',
      '',  // Waybill #
      r.remarks      || '',
      r.area         || '',
      '',  // Type/Mode
      '',  // TIME-IN
      '',  // TIME-OUT
      '',  // Signed by Client
      '',  // Remarks
    ]),
    startY: 33,
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      fontSize: 7,
      cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: NAVY_RGB,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 9,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    bodyStyles: { textColor: [30, 41, 59], minCellHeight: 7.5, valign: 'middle' },
    columnStyles: {
      0:  { cellWidth: 16 },  // Priority
      1:  { cellWidth: 52 },  // Company Name
      2:  { cellWidth: 24 },  // Documents
      3:  { cellWidth: 22 },  // Reference
      4:  { cellWidth: 16 },  // Waybill #
      5:  { cellWidth: 38 },  // Remarks
      6:  { cellWidth: 20 },  // Area
      7:  { cellWidth: 14 },  // Type/Mode
      8:  { cellWidth: 15 },  // TIME-IN
      9:  { cellWidth: 18 },  // TIME-OUT
      10: { cellWidth: 20 },  // Signed by Client
      11: { cellWidth: 22 },  // Remarks (last)
    },
    didDrawPage: (data: any) => {
      const total   = (doc as any).internal.getNumberOfPages();
      const current = data.pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('Microgenesis Business Systems — Confidential', centerX, pageH - 4, { align: 'center' });
      doc.text(`Page ${current} of ${total}`, pageW - MARGIN, pageH - 4, { align: 'right' });
      if (current > 1) {
        doc.setDrawColor(...NAVY_RGB);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, 8, pageW - MARGIN, 8);
      }
    },
  });

  // ── Footer ──────────────────────────────────────────────────────────────────
  let fy = ((doc as any).lastAutoTable?.finalY ?? 100) + 5;
  const footerHeight = 85;
  if (fy + footerHeight > pageH - 10) { doc.addPage(); fy = 15; }

  const usableW = pageW - MARGIN * 2;

  // IMPORTANT REMINDERS! — dark red bg, white text
  doc.setFillColor(...SOFT_RED_RGB);
  doc.rect(MARGIN, fy, usableW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('IMPORTANT REMINDERS!', MARGIN + 2, fy + 4.8);
  fy += 7;

  // 4 soft-yellow reminder rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  for (const txt of [
    'PLEASE READ NOTE AND FOLLOW',
    'ALWAYS BRING YOUR OR AND CR FOR POSSIBLE COLLECTION',
    "ALL DOC'S SHOULD HAVE PRINTED NAME AND DELIVERED BY",
    'CHECK THE ITEM PER DELIVERY RECEIPTS BEFORE CLIENT SIGNING',
  ]) {
    doc.setFillColor(...SOFT_YELLOW_RGB);
    doc.rect(MARGIN, fy, usableW, 6, 'F');
    doc.text(txt, MARGIN + 2, fy + 4.2);
    fy += 6;
  }

  // Dark-red text note
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...SOFT_RED_RGB);
  doc.text('NOTE: ALWAYS BRING O.R / CR', MARGIN + 2, fy + 4);
  fy += 7;

  // KM tracking
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('KM START: ___________', MARGIN, fy + 4);
  doc.text('KM END: ___________', MARGIN + usableW / 2, fy + 4);
  fy += 8;

  // A MUST READ! — amber bg, white bold title
  doc.setFillColor(...AMBER_RGB);
  doc.rect(MARGIN, fy, usableW, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('A MUST READ!', MARGIN + 2, fy + 4.5);
  fy += 6.5;

  const mustLines = doc.splitTextToSize(MUST_READ_NOTE, usableW - 4);
  const mustH = mustLines.length * 4 + 4;
  doc.setFillColor(...SOFT_YELLOW_RGB);
  doc.rect(MARGIN, fy, usableW, mustH, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(30, 41, 59);
  doc.text(mustLines, MARGIN + 2, fy + 4);
  fy += mustH + 4;

  // Status counts (left half) | Time tracking (right half)
  const colW = usableW / 2 - 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);

  const leftCounts = [
    `No. of Scheduled: ${counts.scheduled}`,
    `No. of Pending: ${counts.pending}`,
    `No. of Rescheduled / Hold: ${counts.reschedHold}`,
    `No. of Accomplished: ${counts.accomplished}`,
    `No. of Shipment: ${counts.total}`,
    'No. of Transfer out / Txo: ___________',
    'C/o Breakfix: ___________',
  ];
  leftCounts.forEach((txt, i) => {
    if (i === 4) doc.setFont('helvetica', 'bold');
    else doc.setFont('helvetica', 'normal');
    doc.text(txt, MARGIN, fy + i * 5.5);
  });

  doc.setFont('helvetica', 'normal');
  doc.text('Time of Departure: ___________', MARGIN + colW + 10, fy);
  doc.text('Time of Arrival: ___________',   MARGIN + colW + 10, fy + 5.5);
  fy += leftCounts.length * 5.5 + 1;

  if (auditSets) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(TRAIL_FOOTNOTE, MARGIN, fy, { maxWidth: usableW });
    fy += 6;
  }

  // Courier reminder
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Kindly put waybill number once shipment has been accomplished. Update supply chain status immediately.',
    MARGIN, fy,
    { maxWidth: usableW },
  );
  fy += 10;

  // Sign-off
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`PREPARED BY: ${preparedBy}`, MARGIN, fy);
  doc.text('CHECKED BY: ___________', MARGIN + colW + 10, fy);
  fy += 5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Logistics Coordinator', MARGIN + colW + 10, fy);

  doc.save(`${filename}-route-slip-${now.toISOString().split('T')[0]}.pdf`);
}

// ─── All-drivers export ───────────────────────────────────────────────────────

export interface AllDriversRouteSlipParams {
  records: DeliveryRecord[];
  /** YYYY-MM-DD date filter, or '' if none set */
  date: string;
  preparedBy: string;
  filename: string;
  /** When provided, counts are built from the full status history (Status Trail mode). */
  auditSets?: Map<string, Set<string>>;
}

function groupByDriver(records: DeliveryRecord[]): [string, DeliveryRecord[]][] {
  const map = new Map<string, DeliveryRecord[]>();
  for (const r of records) {
    const driver = r.driver?.trim();
    if (!driver || driver.toLowerCase() === 'unassigned') continue;
    if (!map.has(driver)) map.set(driver, []);
    map.get(driver)!.push(r);
  }
  const entries: [string, DeliveryRecord[]][] = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [, recs] of entries) {
    recs.sort((a, b) => {
      const ca = (a.area || '').toLowerCase();
      const cb = (b.area || '').toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      return (a.priority || '').localeCompare(b.priority || '');
    });
  }
  return entries;
}

export async function downloadAllDriversRouteSlipExcel({
  records, date, preparedBy, filename, auditSets,
}: AllDriversRouteSlipParams): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb      = new ExcelJS.Workbook();
  const logo    = await loadLogoBase64();
  const now     = new Date();
  const year    = now.getFullYear();
  const dateDisplay = date ? fmtDate(`${date}T12:00:00`) : fmtDate(now.toISOString());
  const groups = groupByDriver(records);

  const addSheet = (driverName: string, driverRecords: DeliveryRecord[]) => {
    const vehicle = driverRecords.find(r => r.vehicle)?.vehicle ?? '';
    const helper  = driverRecords.find(r => r.driver_assistants?.length)?.driver_assistants.join(', ') ?? '';
    const counts  = auditSets ? computeHistoricCounts(driverRecords, auditSets) : computeCounts(driverRecords);

    const sheetName = driverName.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
    const ws = wb.addWorksheet(sheetName);

    const NCOLS = 12;
    ws.columns = [
      { width: 12 }, { width: 36 }, { width: 18 }, { width: 18 },
      { width: 14 }, { width: 52 }, { width: 14 }, { width: 13 },
      { width: 12 }, { width: 12 }, { width: 16 }, { width: 20 },
    ];

    const E = (n: number) => Array<null>(n).fill(null);
    let rn = 0;
    const next = (vals: (string | number | null | undefined)[]) => { rn++; return ws.addRow(vals); };
    const fillRowColor = (row: ReturnType<typeof ws.addRow>, argb: string) => {
      for (let c = 1; c <= NCOLS; c++)
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    };

    // Row 1: Vehicle | logo area | CONFIDENTIAL
    const r1 = next(['Vehicle: ' + vehicle, ...E(3), '', ...E(3), 'CONFIDENTIAL', ...E(3)]);
    ws.mergeCells(rn, 1, rn, 4); ws.mergeCells(rn, 5, rn, 8); ws.mergeCells(rn, 9, rn, NCOLS);
    r1.getCell(1).font = { bold: true, size: 10 }; r1.getCell(1).alignment = { vertical: 'middle' };
    r1.getCell(9).font = { bold: true, size: 9 }; r1.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
    r1.height = 48;

    // Row 2: Date | logo area | YR-[year] red
    const r2 = next(['Date: ' + dateDisplay, ...E(3), '', ...E(3), `YR-${year}`, ...E(3)]);
    ws.mergeCells(rn, 1, rn, 4); ws.mergeCells(rn, 5, rn, 8); ws.mergeCells(rn, 9, rn, NCOLS);
    r2.getCell(1).font = { size: 10 }; r2.getCell(1).alignment = { vertical: 'middle' };
    r2.getCell(9).font = { bold: true, size: 12, color: { argb: RED_ARGB } };
    r2.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
    r2.height = 36;

    // Row 3: Driver | Title (center) | Fleet Card
    const r3 = next(['Driver: ' + driverName, ...E(3), TITLE, ...E(3), 'Fleet Card Odometer: ___________', ...E(3)]);
    ws.mergeCells(rn, 1, rn, 4); ws.mergeCells(rn, 5, rn, 8); ws.mergeCells(rn, 9, rn, NCOLS);
    r3.getCell(1).font = { bold: true, size: 10 }; r3.getCell(1).alignment = { vertical: 'middle' };
    r3.getCell(5).font = { bold: true, size: 12, color: { argb: NAVY_ARGB } };
    r3.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    r3.getCell(9).font = { size: 9 }; r3.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
    r3.height = 22;

    // Row 4: Helper | empty | Gas Price
    const r4 = next(['Helper: ' + helper, ...E(3), '', ...E(3), 'Gas Total Price Per Liter: ___________', ...E(3)]);
    ws.mergeCells(rn, 1, rn, 4); ws.mergeCells(rn, 5, rn, 8); ws.mergeCells(rn, 9, rn, NCOLS);
    r4.getCell(1).font = { size: 10 }; r4.getCell(1).alignment = { vertical: 'middle' };
    r4.getCell(9).font = { size: 9 }; r4.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
    r4.height = 18;

    next(E(NCOLS)); // blank separator

    // Table headers
    const HEADERS = [
      'Priority', 'Company Name', 'Documents', 'Reference',
      'Waybill #', 'Remarks', 'Area', 'Type / Mode',
      'TIME-IN', 'TIME-OUT', 'Signed by Client', 'Remarks',
    ];
    const hdr = next(HEADERS);
    hdr.eachCell({ includeEmpty: true }, cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_ARGB } };
      cell.font      = { bold: true, color: { argb: WHITE_ARGB }, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border    = {
        top:    { style: 'thin', color: { argb: NAVY_ARGB } },
        bottom: { style: 'thin', color: { argb: NAVY_ARGB } },
        left:   { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    });
    hdr.height = 22;

    // Data rows
    driverRecords.forEach((r, idx) => {
      const dr = next([
        r.priority || '', r.company_name || '', r.id || '', r.reference || '',
        '', r.remarks || '', r.area || '', '', '', '', '', '',
      ]);
      const isAlt = idx % 2 === 1;
      dr.eachCell({ includeEmpty: true }, cell => {
        if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_ARGB } };
        cell.font      = { size: 9 };
        cell.alignment = { vertical: 'middle' };
        cell.border    = {
          bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
          left:   { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right:  { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
      dr.height = 18;
    });

    // Footer
    next(E(NCOLS));

    const remR = next(['IMPORTANT REMINDERS!', ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); fillRowColor(remR, SOFT_RED_ARGB);
    remR.getCell(1).font = { bold: true, size: 10, color: { argb: WHITE_ARGB } };
    remR.getCell(1).alignment = { vertical: 'middle' }; remR.height = 18;

    for (const txt of [
      'PLEASE READ NOTE AND FOLLOW',
      'ALWAYS BRING YOUR OR AND CR FOR POSSIBLE COLLECTION',
      "ALL DOC'S SHOULD HAVE PRINTED NAME AND DELIVERED BY",
      'CHECK THE ITEM PER DELIVERY RECEIPTS BEFORE CLIENT SIGNING',
    ]) {
      const yr = next([txt, ...E(NCOLS - 1)]);
      ws.mergeCells(rn, 1, rn, NCOLS); fillRowColor(yr, SOFT_YELLOW_ARGB);
      yr.getCell(1).font = { size: 9 }; yr.getCell(1).alignment = { vertical: 'middle' }; yr.height = 16;
    }

    const noteR = next(['NOTE: ALWAYS BRING O.R / CR', ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS);
    noteR.getCell(1).font = { bold: true, size: 9, color: { argb: SOFT_RED_ARGB } };
    noteR.getCell(1).alignment = { vertical: 'middle' }; noteR.height = 16;

    next(E(NCOLS));
    const kmR = next(['KM START: ___________', ...E(5), 'KM END: ___________', ...E(NCOLS - 8)]);
    ws.mergeCells(rn, 1, rn, 6); ws.mergeCells(rn, 7, rn, NCOLS);
    kmR.getCell(1).font = { size: 9 }; kmR.getCell(7).font = { size: 9 }; kmR.height = 16;

    const mustTitleR = next(['A MUST READ!', ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); fillRowColor(mustTitleR, AMBER_ARGB);
    mustTitleR.getCell(1).font = { bold: true, size: 10, color: { argb: WHITE_ARGB } };
    mustTitleR.getCell(1).alignment = { vertical: 'middle' }; mustTitleR.height = 18;

    const mustNoteR = next([MUST_READ_NOTE, ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); fillRowColor(mustNoteR, SOFT_YELLOW_ARGB);
    mustNoteR.getCell(1).font = { size: 8 };
    mustNoteR.getCell(1).alignment = { vertical: 'middle', wrapText: true }; mustNoteR.height = 36;

    next(E(NCOLS));

    const c0 = next([`No. of Scheduled: ${counts.scheduled}`, ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); c0.getCell(1).font = { size: 9 }; c0.height = 16;

    const c1 = next([`No. of Pending: ${counts.pending}`, ...E(5), 'Time of Departure: ___________', ...E(NCOLS - 8)]);
    ws.mergeCells(rn, 1, rn, 6); ws.mergeCells(rn, 7, rn, NCOLS);
    c1.getCell(1).font = { size: 9 }; c1.getCell(7).font = { size: 9 }; c1.height = 16;

    const c2 = next([`No. of Rescheduled / Hold: ${counts.reschedHold}`, ...E(5), 'Time of Arrival: ___________', ...E(NCOLS - 8)]);
    ws.mergeCells(rn, 1, rn, 6); ws.mergeCells(rn, 7, rn, NCOLS);
    c2.getCell(1).font = { size: 9 }; c2.getCell(7).font = { size: 9 }; c2.height = 16;

    const c3 = next([`No. of Accomplished: ${counts.accomplished}`, ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); c3.getCell(1).font = { size: 9 }; c3.height = 16;

    if (auditSets) {
      const cNote = next([TRAIL_FOOTNOTE, ...E(NCOLS - 1)]);
      ws.mergeCells(rn, 1, rn, NCOLS);
      cNote.getCell(1).font = { italic: true, size: 7, color: { argb: 'FF64748B' } };
      cNote.height = 13;
    }

    const c4 = next([`No. of Shipment: ${counts.total}`, ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); c4.getCell(1).font = { bold: true, size: 9 }; c4.height = 16;

    const c5 = next(['No. of Transfer out / Txo: ___________', ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); c5.getCell(1).font = { size: 9 }; c5.height = 16;

    const c6 = next(['C/o Breakfix: ___________', ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); c6.getCell(1).font = { size: 9 }; c6.height = 16;

    next(E(NCOLS));
    const courR = next([
      'Kindly put waybill number once shipment has been accomplished. Update supply chain status immediately.',
      ...E(NCOLS - 1),
    ]);
    ws.mergeCells(rn, 1, rn, NCOLS); courR.getCell(1).font = { italic: true, size: 8 };
    courR.getCell(1).alignment = { wrapText: true }; courR.height = 22;

    next(E(NCOLS));
    const sig1 = next([`PREPARED BY: ${preparedBy}`, ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); sig1.getCell(1).font = { bold: true, size: 10 }; sig1.height = 18;

    const sig2 = next(['CHECKED BY: ___________', ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); sig2.getCell(1).font = { bold: true, size: 10 }; sig2.height = 18;

    const sig3 = next(['Logistics Coordinator', ...E(NCOLS - 1)]);
    ws.mergeCells(rn, 1, rn, NCOLS); sig3.getCell(1).font = { italic: true, size: 9 };
    sig3.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }; sig3.height = 16;

    if (logo) {
      const imgId = wb.addImage({ base64: logo.split(',')[1], extension: 'png' });
      ws.addImage(imgId, { tl: { col: 4.5, row: 0 }, br: { col: 7.5, row: 2 } } as any);
    }
  };

  if (groups.length === 0) {
    const ws = wb.addWorksheet('No Records');
    ws.addRow(['No records with assigned drivers found.']);
  } else {
    for (const [driverName, driverRecords] of groups) {
      addSheet(driverName, driverRecords);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href     = url;
  a.download = `${filename}-route-slip-all-drivers-${now.toISOString().split('T')[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAllDriversRouteSlipPDF({
  records, date, preparedBy, filename, auditSets,
}: AllDriversRouteSlipParams): Promise<void> {
  const { jsPDF }             = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const logo = await loadLogoBase64();

  const now         = new Date();
  const year        = now.getFullYear();
  const dateDisplay = date ? fmtDate(`${date}T12:00:00`) : fmtDate(now.toISOString());
  const groups = groupByDriver(records);

  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const MARGIN  = 10;
  const centerX = pageW / 2;
  const usableW = pageW - MARGIN * 2;

  const renderHeader = (driverName: string, vehicle: string, helper: string) => {
    if (logo) doc.addImage(logo, 'PNG', centerX - 22, 4, 44, 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...NAVY_RGB);
    doc.text(TITLE, centerX, 23, { align: 'center' });

    let lY = 8;
    const lv = (label: string, value: string, x: number, y: number) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY_RGB);
      doc.text(label, x, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
      doc.text(value || ' ', x + doc.getTextWidth(label) + 1.5, y);
    };
    lv('Vehicle:', vehicle,     MARGIN, lY); lY += 5;
    lv('Date:',    dateDisplay, MARGIN, lY); lY += 5;
    lv('Driver:',  driverName,  MARGIN, lY); lY += 5;
    lv('Helper:',  helper,      MARGIN, lY);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
    doc.text('CONFIDENTIAL', pageW - MARGIN, 8, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 0, 0);
    doc.text(`YR-${year}`, pageW - MARGIN, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 41, 59);
    doc.text('Fleet Card Odometer: ___________',    pageW - MARGIN, 20, { align: 'right' });
    doc.text('Gas Total Price Per Liter: ___________', pageW - MARGIN, 25, { align: 'right' });

    doc.setDrawColor(...NAVY_RGB); doc.setLineWidth(0.5);
    doc.line(MARGIN, 30, pageW - MARGIN, 30);
  };

  const renderFooter = (driverRecords: DeliveryRecord[], startY: number) => {
    const counts = auditSets ? computeHistoricCounts(driverRecords, auditSets) : computeCounts(driverRecords);
    let fy = startY;
    if (fy + 120 > pageH - 8) { doc.addPage(); fy = 15; }

    doc.setFillColor(...SOFT_RED_RGB);
    doc.rect(MARGIN, fy, usableW, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
    doc.text('IMPORTANT REMINDERS!', MARGIN + 2, fy + 4.8);
    fy += 7;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(30, 41, 59);
    for (const txt of [
      'PLEASE READ NOTE AND FOLLOW',
      'ALWAYS BRING YOUR OR AND CR FOR POSSIBLE COLLECTION',
      "ALL DOC'S SHOULD HAVE PRINTED NAME AND DELIVERED BY",
      'CHECK THE ITEM PER DELIVERY RECEIPTS BEFORE CLIENT SIGNING',
    ]) {
      doc.setFillColor(...SOFT_YELLOW_RGB); doc.rect(MARGIN, fy, usableW, 6, 'F');
      doc.text(txt, MARGIN + 2, fy + 4.2); fy += 6;
    }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...SOFT_RED_RGB);
    doc.text('NOTE: ALWAYS BRING O.R / CR', MARGIN + 2, fy + 4); fy += 7;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 41, 59);
    doc.text('KM START: ___________', MARGIN, fy + 4);
    doc.text('KM END: ___________', MARGIN + usableW / 2, fy + 4); fy += 8;

    doc.setFillColor(...AMBER_RGB); doc.rect(MARGIN, fy, usableW, 6.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
    doc.text('A MUST READ!', MARGIN + 2, fy + 4.5); fy += 6.5;

    const mustLines = doc.splitTextToSize(MUST_READ_NOTE, usableW - 4);
    const mustH = mustLines.length * 4 + 4;
    doc.setFillColor(...SOFT_YELLOW_RGB); doc.rect(MARGIN, fy, usableW, mustH, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(30, 41, 59);
    doc.text(mustLines, MARGIN + 2, fy + 4); fy += mustH + 4;

    const colW = usableW / 2 - 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 41, 59);
    [
      `No. of Scheduled: ${counts.scheduled}`,
      `No. of Pending: ${counts.pending}`,
      `No. of Rescheduled / Hold: ${counts.reschedHold}`,
      `No. of Accomplished: ${counts.accomplished}`,
      `No. of Shipment: ${counts.total}`,
      'No. of Transfer out / Txo: ___________',
      'C/o Breakfix: ___________',
    ].forEach((txt, i) => {
      if (i === 4) doc.setFont('helvetica', 'bold'); else doc.setFont('helvetica', 'normal');
      doc.text(txt, MARGIN, fy + i * 5.5);
    });
    doc.setFont('helvetica', 'normal');
    doc.text('Time of Departure: ___________', MARGIN + colW + 10, fy);
    doc.text('Time of Arrival: ___________',   MARGIN + colW + 10, fy + 5.5);
    fy += 7 * 5.5 + 1;

    if (auditSets) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(100, 116, 139);
      doc.text(TRAIL_FOOTNOTE, MARGIN, fy, { maxWidth: usableW });
      fy += 6;
    }

    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    doc.text(
      'Kindly put waybill number once shipment has been accomplished. Update supply chain status immediately.',
      MARGIN, fy, { maxWidth: usableW },
    );
    fy += 10;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
    doc.text(`PREPARED BY: ${preparedBy}`, MARGIN, fy);
    doc.text('CHECKED BY: ___________', MARGIN + colW + 10, fy);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text('Logistics Coordinator', MARGIN + colW + 10, fy + 5);
  };

  if (groups.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 116, 139);
    doc.text('No records with assigned drivers found.', MARGIN, 30);
  } else {
    let isFirst = true;
    for (const [driverName, driverRecords] of groups) {
      if (!isFirst) doc.addPage();

      const vehicle = driverRecords.find(r => r.vehicle)?.vehicle ?? '';
      const helper  = driverRecords.find(r => r.driver_assistants?.length)?.driver_assistants.join(', ') ?? '';
      renderHeader(driverName, vehicle, helper);

      let driverFirstPage = true;
      autoTable(doc, {
        head: [[
          'Priority', 'Company Name', 'Documents', 'Reference',
          'Waybill #', 'Remarks', 'Area', 'Type /\nMode',
          'TIME-IN', 'TIME-OUT', 'Signed by\nClient', 'Remarks',
        ]],
        body: driverRecords.map(r => [
          r.priority || '', r.company_name || '', r.id || '', r.reference || '',
          '', r.remarks || '', r.area || '', '', '', '', '', '',
        ]),
        startY: 33,
        margin: { left: MARGIN, right: MARGIN },
        styles: {
          fontSize: 7,
          cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: NAVY_RGB,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7,
          halign: 'center',
          valign: 'middle',
          minCellHeight: 9,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { textColor: [30, 41, 59], minCellHeight: 7.5, valign: 'middle' },
        columnStyles: {
          0:  { cellWidth: 16 }, 1:  { cellWidth: 52 }, 2:  { cellWidth: 24 },
          3:  { cellWidth: 22 }, 4:  { cellWidth: 16 }, 5:  { cellWidth: 38 },
          6:  { cellWidth: 20 }, 7:  { cellWidth: 14 }, 8:  { cellWidth: 15 },
          9:  { cellWidth: 18 }, 10: { cellWidth: 20 }, 11: { cellWidth: 22 },
        },
        didDrawPage: (data: any) => {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(148, 163, 184);
          doc.text('Microgenesis Business Systems — Confidential', centerX, pageH - 4, { align: 'center' });
          doc.text(`Page ${(doc as any).internal.getNumberOfPages()}`, pageW - MARGIN, pageH - 4, { align: 'right' });
          if (!driverFirstPage) {
            doc.setDrawColor(...NAVY_RGB); doc.setLineWidth(0.3);
            doc.line(MARGIN, 8, pageW - MARGIN, 8);
          }
          driverFirstPage = false;
        },
      });

      const finalY = (doc as any).lastAutoTable?.finalY ?? 100;
      renderFooter(driverRecords, finalY + 5);
      isFirst = false;
    }
  }

  doc.save(`${filename}-route-slip-all-drivers-${now.toISOString().split('T')[0]}.pdf`);
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────

export async function downloadRouteSlipDocx({
  records, driverName, date, preparedBy, filename, auditSets,
}: RouteSlipParams): Promise<void> {
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, ImageRun,
    AlignmentType, WidthType, PageOrientation, VerticalAlign,
  } = await import('docx');

  const now         = new Date();
  const year        = now.getFullYear();
  const dateDisplay = date ? fmtDate(`${date}T12:00:00`) : fmtDate(now.toISOString());
  const vehicle     = records.find(r => r.vehicle)?.vehicle ?? '';
  const helper      = records.find(r => r.driver_assistants?.length)?.driver_assistants.join(', ') ?? '';
  const sorted = sortedRecords(records);
  const counts = auditSets ? computeHistoricCounts(records, auditSets) : computeCounts(records);

  // Logo as Uint8Array for DOCX image embedding
  const logoDataUrl = await loadLogoBase64();
  let logoBytes: Uint8Array | null = null;
  if (logoDataUrl) {
    const b64 = logoDataUrl.split(',')[1];
    const bin = atob(b64);
    logoBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) logoBytes[i] = bin.charCodeAt(i);
  }

  const CONTENT_W = 15398;
  const nb        = { style: 'none'   as const, size: 0, color: 'FFFFFF' };
  const thin      = { style: 'single' as const, size: 4, color: 'E2E8F0' };
  const noBorders  = { top: nb,   bottom: nb,   left: nb,   right: nb };
  const thinBorders = { top: thin, bottom: thin, left: thin, right: thin };

  const leftW   = Math.round(CONTENT_W * 0.28);
  const rightW  = Math.round(CONTENT_W * 0.28);
  const centerW = CONTENT_W - leftW - rightW;

  const PDF_COL_W = [16, 52, 24, 22, 16, 38, 20, 14, 15, 15, 20, 25];
  const totalPDF  = PDF_COL_W.reduce((s, w) => s + w, 0);
  const colWidths = PDF_COL_W.map(w => Math.round((w / totalPDF) * CONTENT_W));
  const HEADERS_12 = [
    'Priority', 'Company Name', 'Documents', 'Reference',
    'Waybill #', 'Remarks', 'Area', 'Type / Mode',
    'TIME-IN', 'TIME-OUT', 'Signed by Client', 'Remarks',
  ];

  const gap = () => new Paragraph({ children: [], spacing: { before: 80, after: 80 } });

  const colorBar = (text: string, fill: string, color: string, bold = false, size = 18) =>
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      rows: [new TableRow({ children: [new TableCell({
        shading: { fill }, borders: noBorders,
        width: { size: CONTENT_W, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text, bold, color, size })] })],
      })] })],
    });

  const twoCol = (l: string, r: string, bold = false) => {
    const half = Math.round(CONTENT_W / 2);
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      borders: { top: nb, bottom: nb, left: nb, right: nb },
      rows: [new TableRow({ children: [
        new TableCell({ borders: noBorders, width: { size: half,            type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: l, bold, size: 17 })] })] }),
        new TableCell({ borders: noBorders, width: { size: CONTENT_W - half, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: r, size: 17 })] })] }),
      ] })],
    });
  };

  // Header 3-col table
  const hdrTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    borders: { top: nb, bottom: nb, left: nb, right: nb },
    rows: [new TableRow({ children: [
      new TableCell({ borders: noBorders, width: { size: leftW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
        new Paragraph({ children: [new TextRun({ text: `Vehicle: ${vehicle}`, bold: true, size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: `Date: ${dateDisplay}`, size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: `Driver: ${driverName}`, bold: true, size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: `Helper: ${helper}`, size: 18 })] }),
      ] }),
      new TableCell({ borders: noBorders, width: { size: centerW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
        ...(logoBytes ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logoBytes, transformation: { width: 120, height: 44 }, type: 'png' })] })] : []),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: TITLE, bold: true, size: 22, color: '1F3864' })] }),
      ] }),
      new TableCell({ borders: noBorders, width: { size: rightW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'CONFIDENTIAL', bold: true, size: 16 })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `YR-${year}`, bold: true, size: 20, color: 'FF0000' })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Fleet Card Odometer: ___________', size: 16 })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Gas Total Price Per Liter: ___________', size: 16 })] }),
      ] }),
    ] })],
  });

  // Data table
  const dataTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({ tableHeader: true, children: HEADERS_12.map((h, i) => new TableCell({
        shading: { fill: '1F3864' }, borders: thinBorders,
        width: { size: colWidths[i], type: WidthType.DXA },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 16 })] })],
      })) }),
      ...sorted.map((r, idx) => new TableRow({ children: [
        r.priority || '', r.company_name || '', r.id || '', r.reference || '',
        '', r.remarks || '', r.area || '', '', '', '', '', '',
      ].map((val, i) => new TableCell({
        shading: idx % 2 === 1 ? { fill: 'F8F9FA' } : undefined,
        borders: thinBorders, width: { size: colWidths[i], type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: val, size: 16 })] })],
      })) })),
    ],
  });

  const doc = new Document({
    creator: 'Microgenesis Business Systems',
    title: TITLE,
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE, width: 16838, height: 11906 },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: [
        hdrTable, gap(), dataTable, gap(),
        colorBar('IMPORTANT REMINDERS!', '991B1B', 'FFFFFF', true),
        colorBar('PLEASE READ NOTE AND FOLLOW', 'FEFCE8', '1E293B'),
        colorBar('ALWAYS BRING YOUR OR AND CR FOR POSSIBLE COLLECTION', 'FEFCE8', '1E293B'),
        colorBar("ALL DOC'S SHOULD HAVE PRINTED NAME AND DELIVERED BY", 'FEFCE8', '1E293B'),
        colorBar('CHECK THE ITEM PER DELIVERY RECEIPTS BEFORE CLIENT SIGNING', 'FEFCE8', '1E293B'),
        new Paragraph({ children: [new TextRun({ text: 'NOTE: ALWAYS BRING O.R / CR', bold: true, color: '991B1B', size: 17 })] }),
        gap(),
        twoCol('KM START: ___________', 'KM END: ___________'),
        gap(),
        colorBar('A MUST READ!', '92400E', 'FFFFFF', true),
        colorBar(MUST_READ_NOTE, 'FEFCE8', '1E293B', false, 16),
        gap(),
        new Paragraph({ children: [new TextRun({ text: `No. of Scheduled: ${counts.scheduled}`, size: 17 })] }),
        twoCol(`No. of Pending: ${counts.pending}`, 'Time of Departure: ___________'),
        twoCol(`No. of Rescheduled / Hold: ${counts.reschedHold}`, 'Time of Arrival: ___________'),
        new Paragraph({ children: [new TextRun({ text: `No. of Accomplished: ${counts.accomplished}`, size: 17 })] }),
        new Paragraph({ children: [new TextRun({ text: `No. of Shipment: ${counts.total}`, bold: true, size: 17 })] }),
        new Paragraph({ children: [new TextRun({ text: 'No. of Transfer out / Txo: ___________', size: 17 })] }),
        new Paragraph({ children: [new TextRun({ text: 'C/o Breakfix: ___________', size: 17 })] }),
        ...(auditSets ? [new Paragraph({ children: [new TextRun({ text: TRAIL_FOOTNOTE, italics: true, size: 13, color: '64748B' })] })] : []),
        gap(),
        new Paragraph({ children: [new TextRun({ text: 'Kindly put waybill number once shipment has been accomplished. Update supply chain status immediately.', italics: true, size: 16, color: '64748B' })] }),
        gap(),
        twoCol(`PREPARED BY: ${preparedBy}`, 'CHECKED BY: ___________', true),
        new Paragraph({ children: [new TextRun({ text: 'Logistics Coordinator', italics: true, size: 16, color: '64748B' })] }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${filename}-route-slip-${now.toISOString().split('T')[0]}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAllDriversRouteSlipDocx({
  records, date, preparedBy, filename, auditSets,
}: AllDriversRouteSlipParams): Promise<void> {
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, ImageRun,
    AlignmentType, WidthType, PageOrientation, VerticalAlign,
  } = await import('docx');

  const now         = new Date();
  const year        = now.getFullYear();
  const dateDisplay = date ? fmtDate(`${date}T12:00:00`) : fmtDate(now.toISOString());
  const groups = groupByDriver(records);

  const logoDataUrl = await loadLogoBase64();
  let logoBytes: Uint8Array | null = null;
  if (logoDataUrl) {
    const b64 = logoDataUrl.split(',')[1];
    const bin = atob(b64);
    logoBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) logoBytes[i] = bin.charCodeAt(i);
  }

  const CONTENT_W = 15398;
  const nb         = { style: 'none'   as const, size: 0, color: 'FFFFFF' };
  const thin       = { style: 'single' as const, size: 4, color: 'E2E8F0' };
  const noBorders  = { top: nb,   bottom: nb,   left: nb,   right: nb };
  const thinBorders = { top: thin, bottom: thin, left: thin, right: thin };

  const PDF_COL_W  = [16, 52, 24, 22, 16, 38, 20, 14, 15, 15, 20, 25];
  const totalPDF   = PDF_COL_W.reduce((s, w) => s + w, 0);
  const colWidths  = PDF_COL_W.map(w => Math.round((w / totalPDF) * CONTENT_W));
  const HEADERS_12 = [
    'Priority', 'Company Name', 'Documents', 'Reference',
    'Waybill #', 'Remarks', 'Area', 'Type / Mode',
    'TIME-IN', 'TIME-OUT', 'Signed by Client', 'Remarks',
  ];

  const gap = () => new Paragraph({ children: [], spacing: { before: 80, after: 80 } });

  const colorBar = (text: string, fill: string, color: string, bold = false, size = 18) =>
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      rows: [new TableRow({ children: [new TableCell({
        shading: { fill }, borders: noBorders,
        width: { size: CONTENT_W, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text, bold, color, size })] })],
      })] })],
    });

  const twoCol = (l: string, r: string, bold = false) => {
    const half = Math.round(CONTENT_W / 2);
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      borders: { top: nb, bottom: nb, left: nb, right: nb },
      rows: [new TableRow({ children: [
        new TableCell({ borders: noBorders, width: { size: half,             type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: l, bold, size: 17 })] })] }),
        new TableCell({ borders: noBorders, width: { size: CONTENT_W - half, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: r, size: 17 })] })] }),
      ] })],
    });
  };

  const buildDriverContent = (driverName: string, driverRecords: DeliveryRecord[], isFirst: boolean) => {
    const vehicle = driverRecords.find(r => r.vehicle)?.vehicle ?? '';
    const helper  = driverRecords.find(r => r.driver_assistants?.length)?.driver_assistants.join(', ') ?? '';
    const counts  = auditSets ? computeHistoricCounts(driverRecords, auditSets) : computeCounts(driverRecords);
    const sorted  = sortedRecords(driverRecords);

    const leftW   = Math.round(CONTENT_W * 0.28);
    const rightW  = Math.round(CONTENT_W * 0.28);
    const centerW = CONTENT_W - leftW - rightW;

    const hdrTable = new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      borders: { top: nb, bottom: nb, left: nb, right: nb },
      rows: [new TableRow({ children: [
        new TableCell({ borders: noBorders, width: { size: leftW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
          new Paragraph({ children: [new TextRun({ text: `Vehicle: ${vehicle}`, bold: true, size: 18 })] }),
          new Paragraph({ children: [new TextRun({ text: `Date: ${dateDisplay}`, size: 18 })] }),
          new Paragraph({ children: [new TextRun({ text: `Driver: ${driverName}`, bold: true, size: 18 })] }),
          new Paragraph({ children: [new TextRun({ text: `Helper: ${helper}`, size: 18 })] }),
        ] }),
        new TableCell({ borders: noBorders, width: { size: centerW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
          ...(logoBytes ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logoBytes, transformation: { width: 120, height: 44 }, type: 'png' })] })] : []),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: TITLE, bold: true, size: 22, color: '1F3864' })] }),
        ] }),
        new TableCell({ borders: noBorders, width: { size: rightW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'CONFIDENTIAL', bold: true, size: 16 })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `YR-${year}`, bold: true, size: 20, color: 'FF0000' })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Fleet Card Odometer: ___________', size: 16 })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Gas Total Price Per Liter: ___________', size: 16 })] }),
        ] }),
      ] })],
    });

    const dataTable = new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      rows: [
        new TableRow({ tableHeader: true, children: HEADERS_12.map((h, i) => new TableCell({
          shading: { fill: '1F3864' }, borders: thinBorders,
          width: { size: colWidths[i], type: WidthType.DXA },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 16 })] })],
        })) }),
        ...sorted.map((r, idx) => new TableRow({ children: [
          r.priority || '', r.company_name || '', r.id || '', r.reference || '',
          '', r.remarks || '', r.area || '', '', '', '', '', '',
        ].map((val, i) => new TableCell({
          shading: idx % 2 === 1 ? { fill: 'F8F9FA' } : undefined,
          borders: thinBorders, width: { size: colWidths[i], type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: val, size: 16 })] })],
        })) })),
      ],
    });

    return [
      ...(isFirst ? [] : [new Paragraph({ pageBreakBefore: true, children: [] })]),
      hdrTable, gap(), dataTable, gap(),
      colorBar('IMPORTANT REMINDERS!', '991B1B', 'FFFFFF', true),
      colorBar('PLEASE READ NOTE AND FOLLOW', 'FEFCE8', '1E293B'),
      colorBar('ALWAYS BRING YOUR OR AND CR FOR POSSIBLE COLLECTION', 'FEFCE8', '1E293B'),
      colorBar("ALL DOC'S SHOULD HAVE PRINTED NAME AND DELIVERED BY", 'FEFCE8', '1E293B'),
      colorBar('CHECK THE ITEM PER DELIVERY RECEIPTS BEFORE CLIENT SIGNING', 'FEFCE8', '1E293B'),
      new Paragraph({ children: [new TextRun({ text: 'NOTE: ALWAYS BRING O.R / CR', bold: true, color: '991B1B', size: 17 })] }),
      gap(),
      twoCol('KM START: ___________', 'KM END: ___________'),
      gap(),
      colorBar('A MUST READ!', '92400E', 'FFFFFF', true),
      colorBar(MUST_READ_NOTE, 'FEFCE8', '1E293B', false, 16),
      gap(),
      new Paragraph({ children: [new TextRun({ text: `No. of Scheduled: ${counts.scheduled}`, size: 17 })] }),
      twoCol(`No. of Pending: ${counts.pending}`, 'Time of Departure: ___________'),
      twoCol(`No. of Rescheduled / Hold: ${counts.reschedHold}`, 'Time of Arrival: ___________'),
      new Paragraph({ children: [new TextRun({ text: `No. of Accomplished: ${counts.accomplished}`, size: 17 })] }),
      new Paragraph({ children: [new TextRun({ text: `No. of Shipment: ${counts.total}`, bold: true, size: 17 })] }),
      new Paragraph({ children: [new TextRun({ text: 'No. of Transfer out / Txo: ___________', size: 17 })] }),
      new Paragraph({ children: [new TextRun({ text: 'C/o Breakfix: ___________', size: 17 })] }),
      ...(auditSets ? [new Paragraph({ children: [new TextRun({ text: TRAIL_FOOTNOTE, italics: true, size: 13, color: '64748B' })] })] : []),
      gap(),
      new Paragraph({ children: [new TextRun({ text: 'Kindly put waybill number once shipment has been accomplished. Update supply chain status immediately.', italics: true, size: 16, color: '64748B' })] }),
      gap(),
      twoCol(`PREPARED BY: ${preparedBy}`, 'CHECKED BY: ___________', true),
      new Paragraph({ children: [new TextRun({ text: 'Logistics Coordinator', italics: true, size: 16, color: '64748B' })] }),
    ];
  };

  const allChildren = groups.length === 0
    ? [new Paragraph({ children: [new TextRun({ text: 'No records with assigned drivers found.', size: 20 })] })]
    : groups.flatMap(([driverName, driverRecords], idx) =>
        buildDriverContent(driverName, driverRecords, idx === 0),
      );

  const doc = new Document({
    creator: 'Microgenesis Business Systems',
    title: TITLE,
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE, width: 16838, height: 11906 },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: allChildren,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${filename}-route-slip-all-drivers-${now.toISOString().split('T')[0]}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
