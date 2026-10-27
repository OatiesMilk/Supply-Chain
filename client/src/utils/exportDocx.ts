/**
 * DOCX export utility — Word document download for tabular record sets.
 * Uses the `docx` npm package (browser-compatible via dynamic import).
 */

import { statusHistoryCohortLabel, type ExportColumn, type ExportMeta, type StatusHistoryCounts } from './export';
import type { AllOpsSummary } from './allOpsExport';
import { DocumentSize, DEFAULT_DOCUMENT_SIZE, getDocxDimensions, getDocxLandscapeContentWidth, fitColumnWidths } from './documentSize';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function borderSet(color = 'E2E8F0', size = 4) {
  return { style: 'single' as const, size, color };
}

function cellBorders(color?: string, size?: number) {
  const b = borderSet(color, size);
  return { top: b, bottom: b, left: b, right: b };
}

// ─── Main download function ───────────────────────────────────────────────────

const STATUS_ORDER = ['Draft', 'Scheduled', 'In Transit', 'Delivered', 'Pending', 'On-Hold', 'Rescheduled'] as const;

const STATUS_COLORS: Record<string, string> = {
  'Scheduled':   '2563EB',
  'Delivered':   '059669',
  'Pending':     'D97706',
  'On-Hold':     'DC2626',
  'Rescheduled': '7C3AED',
};

export async function downloadDocx(
  rows:         Record<string, string | number | null | undefined>[],
  columns:      ExportColumn[],
  reportTitle:  string,
  filename:     string,
  meta:         ExportMeta,
  summary?:     AllOpsSummary,
  summaryTitle?: string,
  statusHistoryCounts?: StatusHistoryCounts,
  documentSize: DocumentSize = DEFAULT_DOCUMENT_SIZE,
  returnBlob = false
): Promise<void | Blob> {
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
    AlignmentType, WidthType, HeadingLevel, PageOrientation,
  } = await import('docx');

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Column widths proportional to pdfWidth/width, filling the page
  const { width, height } = getDocxDimensions(documentSize);
  const CONTENT_W = getDocxLandscapeContentWidth(documentSize);
  const weights = columns.map(c => c.pdfWidth ?? c.width ?? 20);
  const colWidths = fitColumnWidths(weights, CONTENT_W, true);

  // ── Table header row ───────────────────────────────────────────────────────
  const hdrRow = new TableRow({
    tableHeader: true,
    children: columns.map((c, i) =>
      new TableCell({
        shading: { fill: '1F3864' },
        borders: cellBorders('1F3864', 2),
        width: { size: colWidths[i], type: WidthType.DXA },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: c.header, bold: true, color: 'FFFFFF', size: 18 })],
        })],
      }),
    ),
  });

  // ── Data rows ──────────────────────────────────────────────────────────────
  const dataRows = rows.map((row, idx) =>
    new TableRow({
      children: columns.map((c, i) =>
        new TableCell({
          shading: idx % 2 === 1 ? { fill: 'F8F9FA' } : undefined,
          borders: cellBorders(),
          width: { size: colWidths[i], type: WidthType.DXA },
          children: [new Paragraph({
            children: [new TextRun({ text: String(row[c.key] ?? ''), size: 17 })],
          })],
        }),
      ),
    }),
  );

  // ── Status History Summary table ────────────────────────────────────────────
  const historyChildren: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  if (statusHistoryCounts) {
    historyChildren.push(
      new Paragraph({
        children: [new TextRun({ text: `LIFETIME STATUS HISTORY — ${statusHistoryCohortLabel(statusHistoryCounts)} cohort`, bold: true, size: 22, color: '1F3864' })],
        spacing: { before: 120, after: 80 },
      }),
    );

    const histColW = [4000, 3200, 3200];
    const histHdrRow = new TableRow({
      tableHeader: true,
      children: ['Status', 'Ever Held', 'Current Status'].map((h, i) =>
        new TableCell({
          shading: { fill: '1F3864' },
          borders: cellBorders('1F3864', 2),
          width: { size: histColW[i], type: WidthType.DXA },
          children: [new Paragraph({
            alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
            children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })],
          })],
        }),
      ),
    });

    const histDataRows = STATUS_ORDER.map((s, idx) =>
      new TableRow({
        children: [
          new TableCell({
            shading: idx % 2 === 1 ? { fill: 'F8F9FA' } : undefined,
            borders: cellBorders(),
            width: { size: histColW[0], type: WidthType.DXA },
            children: [new Paragraph({
              children: [new TextRun({ text: s, bold: true, color: STATUS_COLORS[s] ?? '1F3864', size: 18 })],
            })],
          }),
          new TableCell({
            shading: idx % 2 === 1 ? { fill: 'F8F9FA' } : undefined,
            borders: cellBorders(),
            width: { size: histColW[1], type: WidthType.DXA },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: String(statusHistoryCounts.ever_held[s] ?? 0), size: 18 })],
            })],
          }),
          new TableCell({
            shading: idx % 2 === 1 ? { fill: 'F8F9FA' } : undefined,
            borders: cellBorders(),
            width: { size: histColW[2], type: WidthType.DXA },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: String(statusHistoryCounts.current[s] ?? 0), size: 18 })],
            })],
          }),
        ],
      }),
    );

    const histTotalRow = new TableRow({
      children: [
        new TableCell({
          shading: { fill: 'EEF2FF' }, borders: cellBorders(),
          width: { size: histColW[0], type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'Total Records', bold: true, size: 18, color: '1F3864' })] })],
        }),
        new TableCell({
          shading: { fill: 'EEF2FF' }, borders: cellBorders(),
          width: { size: histColW[1], type: WidthType.DXA },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(statusHistoryCounts.total_records), bold: true, size: 18 })] })],
        }),
        new TableCell({
          shading: { fill: 'EEF2FF' }, borders: cellBorders(),
          width: { size: histColW[2], type: WidthType.DXA },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(statusHistoryCounts.total_records), bold: true, size: 18 })] })],
        }),
      ],
    });

    historyChildren.push(
      new Table({
        width: { size: 10400, type: WidthType.DXA },
        rows: [histHdrRow, ...histDataRows, histTotalRow],
      }),
      new Paragraph({
        children: [new TextRun({
          text: 'History window: full record lifetime. Ever Held counts may exceed total records because records can pass through multiple statuses.',
          italics: true, size: 14, color: '64748B',
        })],
        spacing: { before: 40, after: 120 },
      }),
    );
  }

  // ── Summary section (AllOps only) ──────────────────────────────────────────
  const summaryChildren: InstanceType<typeof Paragraph>[] = [];
  if (summary) {
    const title = summaryTitle ?? reportTitle;
    summaryChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: title, bold: true, size: 26, color: '1F3864' })],
        spacing: { before: 200, after: 100 },
      }),
    );

    const kv = (label: string, value: string | number) =>
      new Paragraph({
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: 18 }),
          new TextRun({ text: String(value), size: 18 }),
        ],
        spacing: { after: 60 },
      });

    summaryChildren.push(
      kv('Total Records',   summary.total),
      kv('Overdue',         summary.overdueCount),
      kv('Delivery Date Filter (Asia/Manila)', meta.dateRange || 'All dates'),
      kv('Delivery Date Range (Asia/Manila)', summary.dateRangeStr),
    );

    for (const { status, count, pct } of summary.statusBreakdown) {
      summaryChildren.push(kv(status, `${count} (${pct}%)`));
    }

    if (summary.totalAmountAC > 0) {
      summaryChildren.push(kv('AC Amount', `₱${summary.totalAmountAC.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`));
    }

    summaryChildren.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
  }

  // ── Build document ─────────────────────────────────────────────────────────
  const doc = new Document({
    creator: 'Microgenesis Business Systems',
    title:    reportTitle,
    sections: [{
      properties: {
        page: {
          size: {
            orientation: PageOrientation.LANDSCAPE,
            width,
            height,
          },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: [
        // Branding
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Microgenesis Business Systems', bold: true, size: 22, color: '1F3864' })],
          spacing: { after: 40 },
        }),
        // Report title
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: reportTitle, bold: true, size: 28, color: '1F3864' })],
          spacing: { after: 60 },
        }),
        // Meta: date range
        ...(meta.dateRange ? [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `Date Range: ${meta.dateRange}`, size: 18, color: '64748B' })],
          spacing: { after: 40 },
        })] : []),
        ...(meta.dateBasis ? [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `Date Basis: ${meta.dateBasis}`, size: 16, color: '64748B' })],
          spacing: { after: 40 },
        })] : []),
        // Meta: generated by
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: `Generated by: ${meta.generatedByName} (${meta.generatedByRole}) · ${dateStr}`,
            size: 18,
            color: '64748B',
          })],
          spacing: { after: 160 },
        }),

        // Status history summary
        ...historyChildren,

        // Optional summary
        ...summaryChildren,

        // Data table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [hdrRow, ...dataRows],
        }),

        // Footer note
        new Paragraph({ children: [new TextRun({ text: '' })], spacing: { before: 120 } }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({
            text: `${rows.length} record${rows.length !== 1 ? 's' : ''} exported · Microgenesis Business Systems — Confidential`,
            size: 16,
            color: '94A3B8',
          })],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  if (returnBlob) return blob;
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${filename}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
