/**
 * All Operations export utilities — sort, summary computation, and
 * format-specific download functions (CSV with # headers, Excel with a
 * Summary sheet, PDF with a cover page before the data table).
 */

import { DeliveryRecord } from '../types';
import { ExportColumn, ExportMeta, StatusHistoryCounts, fmtDate, fmtTime, fmtStatus, fmtCurrency, fmtDatetime } from './export';

const STATUS_ORDER = ['Scheduled', 'Delivered', 'Pending', 'On-Hold', 'Rescheduled'] as const;

// ─── Sort ────────────────────────────────────────────────────────────────────

export type DateSortMode = 'nearest' | 'oldest' | 'furthest';

export const DATE_SORT_LABELS: Record<DateSortMode, string> = {
  nearest:  'Nearest to Present',
  oldest:   'Oldest First',
  furthest: 'Furthest Future First',
};

function getRecordDate(r: DeliveryRecord): Date | null {
  // All categories share delivery_date in the frontend model
  const d = r.delivery_date;
  if (!d) return null;
  const dt = new Date(d.includes('T') ? d : `${d}T12:00:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

export function sortRecordsByDate(records: DeliveryRecord[], mode: DateSortMode): DeliveryRecord[] {
  const now = Date.now();
  return [...records].sort((a, b) => {
    const da = getRecordDate(a);
    const db = getRecordDate(b);
    if (!da && !db) return 0;
    if (!da) return 1;  // no-date records fall to bottom
    if (!db) return -1;
    switch (mode) {
      case 'nearest':  return Math.abs(da.getTime() - now) - Math.abs(db.getTime() - now);
      case 'oldest':   return da.getTime() - db.getTime();
      case 'furthest': return db.getTime() - da.getTime();
    }
  });
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export interface AllOpsSummary {
  total: number;
  statusBreakdown:   { status: string;   count: number; pct: number }[];
  categoryBreakdown: { category: string; count: number; pct: number }[];
  totalAmountAC: number;
  overdueCount: number;
  dateRangeStr: string;
  sortLabel: string;
  generatedAt: string;
}

const DONE_STATUSES = new Set(['Delivered']);

export function computeAllOpsSummary(records: DeliveryRecord[], sortMode: DateSortMode): AllOpsSummary {
  const total = records.length;
  const now = Date.now();
  const statusMap: Record<string, number>  = {};
  const catMap:    Record<string, number>  = {};
  let totalAmountAC = 0;
  let overdueCount  = 0;
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const r of records) {
    statusMap[r.status]   = (statusMap[r.status]   ?? 0) + 1;
    catMap[r.category]    = (catMap[r.category]    ?? 0) + 1;
    if (r.category === 'Accounting Collection' && r.amount != null) totalAmountAC += r.amount;
    const d = getRecordDate(r);
    if (d) {
      if (d.getTime() < now && !DONE_STATUSES.has(r.status)) overdueCount++;
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
  }

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

  const statusBreakdown = Object.entries(statusMap)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count, pct: pct(count) }));

  const categoryBreakdown = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count, pct: pct(count) }));

  const dateRangeStr = minDate && maxDate
    ? (minDate.toDateString() === maxDate.toDateString()
        ? fmtDate(minDate.toISOString())
        : `${fmtDate(minDate.toISOString())} — ${fmtDate(maxDate.toISOString())}`)
    : 'N/A';

  const now2 = new Date();
  return {
    total, statusBreakdown, categoryBreakdown, totalAmountAC, overdueCount,
    dateRangeStr,
    sortLabel: DATE_SORT_LABELS[sortMode],
    generatedAt: `${fmtDate(now2.toISOString())} at ${fmtTime(now2.toISOString())}`,
  };
}

// ─── Column definitions ───────────────────────────────────────────────────────

export const ALL_OPS_COLUMNS: ExportColumn[] = [
  { header: 'Record ID',       key: 'id',              width: 18 },
  { header: 'Company Name',    key: 'company_name',    width: 28 },
  { header: 'Reference No.',   key: 'reference',       width: 22 },
  { header: 'Category',        key: 'category',        width: 26 },
  { header: 'Priority',        key: 'priority',        width: 18 },
  { header: 'Area',            key: 'area',            width: 18 },
  { header: 'Date',            key: 'date_fmt',        width: 18 },
  { header: 'Driver',          key: 'driver',          width: 24 },
  { header: 'Account Manager', key: 'account_manager', width: 24 },
  { header: 'Item Type',       key: 'item_type',       width: 16 },
  { header: 'Status',          key: 'status_fmt',      width: 14 },
  { header: 'Amount (PHP)',    key: 'amount_fmt',      width: 18 },
  { header: 'Remarks',         key: 'remarks',         width: 36 },
  { header: 'Created By',      key: 'created_by',      width: 22 },
  { header: 'Created At',      key: 'created_at_fmt',  width: 22 },
];

export const PDF_ALL_OPS_COLUMNS: ExportColumn[] = [
  { header: 'Record ID',      key: 'id',              pdfWidth: 20                                          },
  { header: 'Company',        key: 'company_name',    pdfWidth: 50                                          },
  { header: 'Reference',      key: 'reference',       pdfWidth: 24                                          },
  { header: 'Category',       key: 'category',        pdfWidth: 34                                          },
  { header: 'Area',           key: 'area',            pdfWidth: 28                                          },
  { header: 'Date',           key: 'date_fmt',        pdfWidth: 22                                          },
  { header: 'Driver',         key: 'driver',          pdfWidth: 28                                          },
  { header: 'Acct Manager',   key: 'account_manager', pdfWidth: 26                                          },
  { header: 'Amount (PHP)',   key: 'amount_fmt',      pdfWidth: 26, pdfAlign: 'right'                       },
  { header: 'Status',         key: 'status_fmt',      pdfWidth: 24, pdfPill: true, pdfAlign: 'center'       },
];

export function serializeAllOpsRow(r: DeliveryRecord): Record<string, string | number | null> {
  return {
    id:              r.id,
    company_name:    r.company_name,
    reference:       r.reference || '',
    category:        r.category,
    priority:        r.priority,
    area:            r.area || '',
    date_fmt:        fmtDate(r.delivery_date),
    driver:          r.driver || '',
    account_manager: r.account_manager || '',
    item_type:       r.item_type || '',
    status_fmt:      fmtStatus(r.status),
    amount_fmt:      r.category === 'Accounting Collection' && r.amount != null ? fmtCurrency(r.amount) : '',
    remarks:         r.remarks || '',
    created_by:      r.created_by,
    created_at_fmt:  fmtDatetime(r.created_at),
  };
}

// ─── CSV (# comment summary header) ──────────────────────────────────────────

export function downloadAllOpsCSV(
  rows: Record<string, string | number | null | undefined>[],
  columns: ExportColumn[],
  filename: string,
  meta: ExportMeta,
  summary: AllOpsSummary,
  reportTitle = 'All Operations — Comprehensive Report',
  statusHistoryCounts?: StatusHistoryCounts
): void {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

  const historyLines: string[] = statusHistoryCounts ? [
    `#`,
    `# STATUS HISTORY SUMMARY`,
    `# Status,Ever Held,Current Status`,
    ...STATUS_ORDER.map(s => `# ${s},${statusHistoryCounts.ever_held[s] ?? 0},${statusHistoryCounts.current[s] ?? 0}`),
    `# Total Records,${statusHistoryCounts.total_records},${statusHistoryCounts.total_records}`,
    `# * Ever Held counts may exceed total records as one record can pass through multiple statuses over its lifetime.`,
  ] : [];

  const commentLines: string[] = [
    `# Microgenesis Business Systems`,
    `# ${reportTitle}`,
    `# Generated: ${summary.generatedAt}`,
    `# Generated by: ${meta.generatedByName} (${meta.generatedByRole})`,
    `# Total Records: ${summary.total}`,
    `# Date Range: ${summary.dateRangeStr}`,
    `# Sort Applied: ${summary.sortLabel}`,
    `#`,
    `# STATUS BREAKDOWN`,
    ...summary.statusBreakdown.map(r => `# ${r.status}: ${r.count} (${r.pct}%)`),
    `#`,
    `# CATEGORY BREAKDOWN`,
    ...summary.categoryBreakdown.map(r => `# ${r.category}: ${r.count} (${r.pct}%)`),
    `#`,
    `# KEY METRICS`,
    `# Total Amount to Collect (PHP): ${fmtCurrency(summary.totalAmountAC)}`,
    `# Overdue Records: ${summary.overdueCount}`,
    ...historyLines,
    `#`,
  ];

  const headerRow  = columns.map(c => q(c.header)).join(',');
  const dataRows   = rows.map(r => columns.map(c => q(String(r[c.key] ?? ''))).join(','));
  const footerRow  = `# Total Records: ${rows.length}`;

  const csv = [
    ...commentLines,
    headerRow,
    ...dataRows,
    footerRow,
  ].join('\r\n');

  const now = new Date();
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${filename}-${now.toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Excel (Summary sheet + Records sheet) ────────────────────────────────────

const NAVY  = 'FF1F3864';
const WHITE = 'FFFFFFFF';
const GRAY  = 'FFF8F9FA';
const LIGHT_BLUE = 'FFE8F4FD';

export async function downloadAllOpsExcel(
  rows: Record<string, string | number | null | undefined>[],
  columns: ExportColumn[],
  filename: string,
  meta: ExportMeta,
  summary: AllOpsSummary,
  reportTitle = 'All Operations — Comprehensive Report',
  statusHistoryCounts?: StatusHistoryCounts
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.generatedByName;
  wb.created = new Date();

  // ── Sheet 1: Summary ────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Summary');
  ws.columns = [{ width: 36 }, { width: 18 }, { width: 14 }];

  const addHeading = (text: string) => {
    const r = ws.addRow([text]);
    r.getCell(1).font = { bold: true, size: 12, color: { argb: NAVY } };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    ws.mergeCells(r.number, 1, r.number, 3);
    r.height = 20;
  };

  const addKV = (label: string, value: string) => {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = { bold: true, size: 10, color: { argb: NAVY } };
    r.getCell(2).font = { size: 10 };
    ws.mergeCells(r.number, 2, r.number, 3);
    r.height = 16;
  };

  const addTableHeader = (...headers: string[]) => {
    const r = ws.addRow(headers);
    r.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    r.height = 18;
  };

  const addTableRow = (values: (string | number)[], isAlt: boolean) => {
    const r = ws.addRow(values);
    r.eachCell(cell => {
      if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } };
      cell.font = { size: 10 };
      cell.alignment = { vertical: 'middle' };
    });
    r.height = 16;
  };

  // Title block
  const t1 = ws.addRow(['Microgenesis Business Systems']);
  t1.getCell(1).font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.mergeCells(1, 1, 1, 3);

  const t2 = ws.addRow([reportTitle]);
  t2.getCell(1).font = { bold: true, size: 11, color: { argb: NAVY } };
  ws.mergeCells(2, 1, 2, 3);

  ws.addRow([]);

  // Metadata
  addHeading('Export Metadata');
  addKV('Generated', summary.generatedAt);
  addKV('Generated By', `${meta.generatedByName} (${meta.generatedByRole})`);
  addKV('Total Records', String(summary.total));
  addKV('Date Range', summary.dateRangeStr);
  addKV('Sort Applied', summary.sortLabel);
  ws.addRow([]);

  // Status breakdown
  addHeading('Status Breakdown');
  addTableHeader('Status', 'Count', '% of Total');
  summary.statusBreakdown.forEach((row, i) => addTableRow([row.status, row.count, `${row.pct}%`], i % 2 === 1));
  ws.addRow([]);

  // Category breakdown
  addHeading('Category / Type Breakdown');
  addTableHeader('Category', 'Count', '% of Total');
  summary.categoryBreakdown.forEach((row, i) => addTableRow([row.category, row.count, `${row.pct}%`], i % 2 === 1));
  ws.addRow([]);

  // Key metrics
  addHeading('Key Metrics');
  addKV('Total Amount to Collect (PHP)', fmtCurrency(summary.totalAmountAC));
  addKV('Overdue Records', String(summary.overdueCount));

  // Status history counts (optional)
  if (statusHistoryCounts) {
    ws.addRow([]);
    addHeading('Status History Summary');
    addTableHeader('Status', 'Ever Held', 'Current Status');
    STATUS_ORDER.forEach((s, i) => addTableRow([s, statusHistoryCounts.ever_held[s] ?? 0, statusHistoryCounts.current[s] ?? 0], i % 2 === 1));
    addTableRow(['Total Records', statusHistoryCounts.total_records, statusHistoryCounts.total_records], false);
    const noteRow = ws.addRow(['* Ever Held counts may exceed total records as one record can pass through multiple statuses over its lifetime.']);
    noteRow.getCell(1).font = { italic: true, size: 8, color: { argb: '64748B' } };
    ws.mergeCells(noteRow.number, 1, noteRow.number, 3);
  }

  // ── Sheet 2: Records ────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Records');

  const r1 = ws2.addRow(['Microgenesis Business Systems']);
  r1.getCell(1).font = { bold: true, size: 13, color: { argb: NAVY } };

  const r2 = ws2.addRow([`${reportTitle} — ${summary.dateRangeStr}`]);
  r2.getCell(1).font = { size: 11, color: { argb: NAVY } };

  const r3 = ws2.addRow([
    `Generated by: ${meta.generatedByName} (${meta.generatedByRole})  ·  ${summary.generatedAt}  ·  Sort: ${summary.sortLabel}`
  ]);
  r3.getCell(1).font = { size: 10, italic: true, color: { argb: '64748B' } };
  ws2.addRow([]);

  const hdr = ws2.addRow(columns.map(c => c.header));
  hdr.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  hdr.height = 22;

  rows.forEach((r, idx) => {
    const dr = ws2.addRow(columns.map(c => r[c.key] ?? ''));
    const isAlt = idx % 2 === 1;
    dr.eachCell({ includeEmpty: true }, cell => {
      if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } };
      cell.font = { size: 10 };
      cell.alignment = { vertical: 'middle' };
    });
    dr.height = 18;
  });

  const ftr = ws2.addRow([`Total Records: ${rows.length}`]);
  ftr.getCell(1).font = { bold: true, italic: true, size: 10, color: { argb: NAVY } };
  ftr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };

  ws2.columns = columns.map(c => ({ width: Math.max(c.width ?? 18, c.header.length + 4) }));

  const colCount = columns.length;
  if (colCount > 1) {
    ws2.mergeCells(1, 1, 1, colCount);
    ws2.mergeCells(2, 1, 2, colCount);
    ws2.mergeCells(3, 1, 3, colCount);
    ws2.mergeCells(5 + rows.length + 1, 1, 5 + rows.length + 1, colCount);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF (Page 1 = summary cover, Page 2+ = data table) ──────────────────────

const PILL_COLORS: Record<string, [number, number, number]> = {
  'delivered':   [5,   150, 105],
  'scheduled':   [37,  99,  235],
  'pending':     [217, 119, 6  ],
  'rescheduled': [124, 58,  237],
  'on hold':     [220, 38,  38 ],
  'on-hold':     [220, 38,  38 ],
  'cancelled':   [107, 114, 128],
};

export async function downloadAllOpsPDF(
  rows: Record<string, string | number | null | undefined>[],
  columns: ExportColumn[],
  filename: string,
  meta: ExportMeta,
  summary: AllOpsSummary,
  reportTitle = 'All Operations — Comprehensive Report',
  statusHistoryCounts?: StatusHistoryCounts
): Promise<void> {
  const { jsPDF }          = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const NAVY_RGB: [number, number, number] = [31, 56, 100];
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const now   = new Date();
  const dateStr = fmtDate(now.toISOString());
  const timeStr = fmtTime(now.toISOString());

  // Try to load logo
  let logo: string | null = null;
  try {
    const res = await fetch('/microgenesis_logo.png');
    if (res.ok) {
      const blob = await res.blob();
      logo = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
  } catch { /* skip */ }

  // ── PAGE 1: Summary cover ────────────────────────────────────────────────
  if (logo) doc.addImage(logo, 'PNG', 10, 6, 32, 11);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(reportTitle, pageW / 2, 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(summary.dateRangeStr, pageW / 2, 19, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated by ${meta.generatedByName} (${meta.generatedByRole})`, pageW - 10, 9, { align: 'right' });
  doc.text(`${dateStr}  at  ${timeStr}`, pageW - 10, 13.5, { align: 'right' });

  doc.setDrawColor(...NAVY_RGB);
  doc.setLineWidth(0.5);
  doc.line(10, 23, pageW - 10, 23);

  // Metadata block
  const metaY = 29;
  const colW  = (pageW - 20) / 4;
  const metaItems: [string, string][] = [
    ['Total Records',  String(summary.total)],
    ['Date Range',     summary.dateRangeStr],
    ['Sort Applied',   summary.sortLabel],
    ['Generated',      summary.generatedAt],
  ];
  metaItems.forEach(([label, value], i) => {
    const x = 10 + i * colW;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY_RGB);
    doc.text(label.toUpperCase(), x, metaY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(value, x, metaY + 5);
  });

  // Status + Category breakdown tables side-by-side
  const tableTop = metaY + 13;
  const halfW    = (pageW - 24) / 2;

  // Status breakdown
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_RGB);
  doc.text('STATUS BREAKDOWN', 10, tableTop - 2);

  autoTable(doc, {
    head: [['Status', 'Count', '% of Total']],
    body: summary.statusBreakdown.map(r => [r.status, r.count, `${r.pct}%`]),
    startY: tableTop,
    margin: { left: 10, right: pageW / 2 + 2 },
    tableWidth: halfW,
    styles: { fontSize: 8, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 } },
    headStyles: { fillColor: NAVY_RGB, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    bodyStyles: { textColor: [30, 41, 59] },
    didDrawPage: () => {},
  });
  const statusTableEndY = (doc as any).lastAutoTable?.finalY ?? tableTop + 40;

  // Category breakdown (positioned to the right)
  const rightX = pageW / 2 + 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_RGB);
  doc.text('CATEGORY BREAKDOWN', rightX, tableTop - 2);

  autoTable(doc, {
    head: [['Category', 'Count', '% of Total']],
    body: summary.categoryBreakdown.map(r => [r.category, r.count, `${r.pct}%`]),
    startY: tableTop,
    margin: { left: rightX, right: 10 },
    tableWidth: halfW,
    styles: { fontSize: 8, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 } },
    headStyles: { fillColor: NAVY_RGB, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    bodyStyles: { textColor: [30, 41, 59] },
    didDrawPage: () => {},
  });
  const categoryTableEndY = (doc as any).lastAutoTable?.finalY ?? tableTop + 40;

  // Key metrics below BOTH breakdown tables (use the taller of the two)
  const metricsY = Math.max(statusTableEndY, categoryTableEndY) + 8;

  if (metricsY + 20 < pageH - 15) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...NAVY_RGB);
    doc.text('KEY METRICS', 10, metricsY);

    doc.setLineWidth(0.3);
    doc.line(10, metricsY + 3, pageW - 10, metricsY + 3);

    const metrics: [string, string][] = [
      ['Total Amount to Collect (PHP)', fmtCurrency(summary.totalAmountAC).replace(/₱/g, 'PHP ')],
      ['Overdue Records',               String(summary.overdueCount)],
    ];
    metrics.forEach(([label, value], i) => {
      const x = 10 + i * (colW * 2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), x, metricsY + 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      doc.text(value, x, metricsY + 15);
    });
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('(See records pages for full data)', 10, metricsY + 4);
  }

  // Status history summary (if provided)
  if (statusHistoryCounts) {
    const histY = Math.max(statusTableEndY, categoryTableEndY) + 30;
    if (histY + 50 < pageH - 15) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...NAVY_RGB);
      doc.text('STATUS HISTORY SUMMARY', 10, histY - 2);

      const histBody = STATUS_ORDER.map(s => [
        s,
        String(statusHistoryCounts.ever_held[s] ?? 0),
        String(statusHistoryCounts.current[s] ?? 0),
      ]);
      histBody.push(['Total Records', String(statusHistoryCounts.total_records), String(statusHistoryCounts.total_records)]);

      autoTable(doc, {
        head: [['Status', 'Ever Held', 'Current Status']],
        body: histBody,
        startY: histY,
        margin: { left: 10, right: 10 },
        tableWidth: 130,
        styles: { fontSize: 8, cellPadding: { top: 2, right: 4, bottom: 2, left: 4 } },
        headStyles: { fillColor: NAVY_RGB, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center' } },
        didDrawPage: () => {},
      });

      const histFinalY = (doc as any).lastAutoTable?.finalY ?? histY + 40;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        '* Ever Held counts may exceed total records as one record can pass through multiple statuses over its lifetime.',
        10, histFinalY + 4
      );
    }
  }

  // Page 1 footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`${dateStr} at ${timeStr}`, 10, pageH - 5);
  doc.text('Microgenesis Business Systems — Confidential', pageW / 2, pageH - 5, { align: 'center' });
  // Page number added in post-pass after autoTable so the true total is known

  // ── PAGE 2+: Data table ──────────────────────────────────────────────────
  doc.addPage();

  // Page 2 header
  if (logo) doc.addImage(logo, 'PNG', 10, 5, 28, 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text(reportTitle.replace(/\s*—\s*Comprehensive Report$/i, '').trim() + ' — Records', pageW / 2, 12, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Sort: ${summary.sortLabel}  ·  ${summary.total} records`, pageW / 2, 17, { align: 'center' });

  doc.setDrawColor(...NAVY_RGB);
  doc.setLineWidth(0.4);
  doc.line(10, 20, pageW - 10, 20);

  const pdfSafe = (v: string | number | null | undefined) =>
    v == null ? '' : String(v).replace(/₱/g, 'PHP ');

  const pillCols = new Set<number>(
    columns.reduce<number[]>((acc, col, i) => { if (col.pdfPill) acc.push(i); return acc; }, [])
  );

  autoTable(doc, {
    head: [columns.map(c => c.header)],
    body: rows.map(r => columns.map(c => pdfSafe(r[c.key]))),
    startY: 23,
    margin: { top: 20, left: 10, right: 10 },
    tableWidth: 'auto',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY_RGB,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 9,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    bodyStyles: { textColor: [30, 41, 59], minCellHeight: 8, valign: 'middle' },
    columnStyles: Object.fromEntries(
      columns.map((col, i) => [i, {
        cellWidth: col.pdfWidth ?? 'auto',
        halign: col.pdfAlign ?? (pillCols.has(i) ? 'center' : 'left'),
      }])
    ),
    willDrawCell: (data: any) => {
      if (data.section === 'body' && pillCols.has(data.column.index)) data.cell.text = [];
    },
    didDrawCell: (data: any) => {
      if (data.section !== 'body' || !pillCols.has(data.column.index)) return;
      const text = String(data.cell.raw ?? '').trim();
      if (!text) return;
      const color: [number, number, number] = PILL_COLORS[text.toLowerCase()] ?? [107, 114, 128];
      const { width: cw, height: ch, x: cx, y: cy } = data.cell;
      const pillW = Math.min(cw - 6, 32);
      const pillH = 5;
      const pillX = cx + (cw - pillW) / 2;
      const pillY = cy + (ch - pillH) / 2;
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(pillX, pillY, pillW, pillH, 1.2, 1.2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text(text, pillX + pillW / 2, pillY + pillH / 2 + 0.4, { align: 'center', baseline: 'middle' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
    },
    rowPageBreak: 'avoid',
    didDrawPage: (data: any) => {
      // Timestamp + centre text footer — page number added in post-pass
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`${dateStr} at ${timeStr}`, 10, pageH - 5);
      doc.text('Microgenesis Business Systems — Confidential', pageW / 2, pageH - 5, { align: 'center' });

      if (data.pageNumber > 1) {
        // Snap to current page so addImage anchors to absolute (10, 5)
        const currentPage = (doc as any).internal.getNumberOfPages();
        doc.setPage(currentPage);
        if (logo) doc.addImage(logo, 'PNG', 10, 5, 28, 10);
        doc.setDrawColor(...NAVY_RGB);
        doc.setLineWidth(0.4);
        // Line below the logo (logo spans y=5→15; line at y=17 with 2mm margin)
        doc.line(10, 17, pageW - 10, 17);
      }
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY_RGB);
  doc.text(`Total Records: ${rows.length}`, 10, finalY + 6);

  // Post-pass: now that all pages exist the true total is known —
  // write "Page N of M" on every page (page 1 footer + all data pages).
  const totalPdfPages = (doc as any).internal.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  for (let p = 1; p <= totalPdfPages; p++) {
    doc.setPage(p);
    doc.text(`Page ${p} of ${totalPdfPages}`, pageW - 10, pageH - 5, { align: 'right' });
  }

  doc.save(`${filename}-${now.toISOString().split('T')[0]}.pdf`);
}
