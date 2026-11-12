import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FileDown, FileSpreadsheet, FileText, ChevronDown, Loader2, Route, Clock, History } from 'lucide-react';
import { DocumentSize, DEFAULT_DOCUMENT_SIZE } from '../utils/documentSize';
import DocumentSizeSelect from './DocumentSizeSelect';
import {
  ExportColumn,
  ExportMeta,
  StatusHistoryCounts,
  downloadCSV,
  downloadExcel,
  downloadPDF
} from '../utils/export';
import {
  AllOpsSummary,
  downloadAllOpsCSV,
  downloadAllOpsExcel,
  downloadAllOpsPDF,
} from '../utils/allOpsExport';
import { downloadRouteSlipForPeriod } from '../utils/routeSlip';
import { filterRouteSlipRecords, routeSlipDriverNames, routeSlipSelectionError } from '../utils/routeSlipPeriod';
import RouteSlipPeriodFields, { type RouteSlipPeriodFieldsProps } from './RouteSlipPeriodFields';
import { downloadDocx } from '../utils/exportDocx';
import { DeliveryRecord } from '../types';
import ExportPreviewDialog, { type ExportPreviewFormat } from './ExportPreviewDialog';
import { downloadBlob } from '../utils/downloadBlob';

interface RouteSlipProps {
  records: DeliveryRecord[];
  dateFrom: string;
  dateTo?: string;
  preparedBy: string;
}

interface Props {
  rows: Record<string, string | number | null | undefined>[];
  columns: ExportColumn[];
  pdfColumns?: ExportColumn[];
  sheetName: string;
  filename: string;
  pdfTitle: string;
  meta: ExportMeta;
  showPdf?: boolean;
  pdfPortrait?: boolean;
  summary?: AllOpsSummary;
  routeSlipProps?: RouteSlipProps;
  routeSlipPeriodFields?: RouteSlipPeriodFieldsProps;
  statusHistoryCounts?: StatusHistoryCounts;
  totalCount?: number;
  fetchExportData?: () => Promise<{
    rows: Record<string, string | number | null | undefined>[];
    summary?: AllOpsSummary;
    routeSlipProps?: RouteSlipProps;
  }>;
}

type Format = 'csv' | 'excel' | 'pdf' | 'docx';
type Variant = 'current' | 'trail';
type LoadingKey = `${Format}-${Variant}`;

export default function ExportMenu({
  rows,
  columns,
  pdfColumns,
  sheetName,
  filename,
  pdfTitle,
  meta,
  showPdf = true,
  pdfPortrait = false,
  summary,
  routeSlipProps,
  routeSlipPeriodFields,
  statusHistoryCounts,
  totalCount,
  fetchExportData,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<LoadingKey | null>(null);
  const [docSize, setDocSize] = useState<DocumentSize>(DEFAULT_DOCUMENT_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    format: Format;
    variant: Variant;
    rows: Record<string, string | number | null | undefined>[];
    columns: ExportColumn[];
    title: string;
    fileBlob: Blob;
    fileName: string;
    statusHistoryCounts?: StatusHistoryCounts;
    summary?: AllOpsSummary;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const periodError = routeSlipProps && routeSlipPeriodFields ? routeSlipSelectionError(routeSlipPeriodFields.selection) : null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasTrail = !!statusHistoryCounts;

  const run = async (fmt: Format, variant: Variant) => {
    if (fmt !== 'csv' && periodError) return;
    setError(null);
    setOpen(false);
    triggerRef.current?.focus();
    const key: LoadingKey = `${fmt}-${variant}`;
    setLoading(key);
    const hist = variant === 'trail' ? statusHistoryCounts : undefined;
    try {
      let exportRows = rows;
      let exportSummary = summary;
      let exportRouteSlip = routeSlipProps;
      if (fetchExportData) {
        const fetched = await fetchExportData();
        exportRows = fetched.rows;
        if (fetched.summary) exportSummary = fetched.summary;
        if (fetched.routeSlipProps) exportRouteSlip = fetched.routeSlipProps;
      }

      const summaryTitle = pdfTitle.replace(/ records?$/i, '') + ' — Comprehensive Report';
      const title = exportRouteSlip ? 'Courier/Daily Route Slip Report' : exportSummary && fmt === 'pdf' ? summaryTitle : pdfTitle;
      const previewColumns = fmt === 'pdf' ? pdfColumns ?? columns : columns;
      let fileBlob: Blob;
      if (exportRouteSlip && fmt !== 'csv') {
        fileBlob = await downloadRouteSlipForPeriod(fmt, { ...exportRouteSlip, filename, documentSize: docSize, variant }, true) as Blob;
      } else if (fmt === 'csv') {
        fileBlob = exportSummary
          ? downloadAllOpsCSV(exportRows, columns, filename, meta, exportSummary, summaryTitle, hist, true) as Blob
          : downloadCSV(exportRows, columns, filename, meta, hist, true) as Blob;
      } else if (fmt === 'excel') {
        fileBlob = exportSummary
          ? await downloadAllOpsExcel(exportRows, columns, filename, meta, exportSummary, summaryTitle, hist, docSize, true) as Blob
          : await downloadExcel(exportRows, columns, sheetName, filename, meta, hist, docSize, true) as Blob;
      } else if (fmt === 'pdf') {
        fileBlob = exportSummary
          ? await downloadAllOpsPDF(exportRows, previewColumns, filename, meta, exportSummary, summaryTitle, hist, docSize, true) as Blob
          : await downloadPDF(exportRows, previewColumns, pdfTitle, filename, meta, !pdfPortrait, hist, docSize, true) as Blob;
      } else {
        fileBlob = exportSummary
          ? await downloadDocx(exportRows, columns, pdfTitle, filename, meta, exportSummary, summaryTitle, hist, docSize, true) as Blob
          : await downloadDocx(exportRows, columns, pdfTitle, filename, meta, undefined, undefined, hist, docSize, true) as Blob;
      }
      const dateStamp = new Date().toISOString().split('T')[0];
      const routeSlipSingleDriver = exportRouteSlip && routeSlipDriverNames(filterRouteSlipRecords(exportRouteSlip.records, {
        dateFrom: exportRouteSlip.dateFrom,
        dateTo: exportRouteSlip.dateTo,
      })).length === 1;
      const routeSlipSuffix = routeSlipSingleDriver ? '-route-slip' : '-route-slip-all-drivers';
      const extension = fmt === 'excel' ? 'xlsx' : fmt;
      const fileName = exportRouteSlip
        ? `${filename}${routeSlipSuffix}-${dateStamp}.${extension}`
        : `${filename}-${dateStamp}.${extension}`;
      setPreview({ format: fmt, variant, rows: exportRows, columns: previewColumns, title, fileBlob, fileName, statusHistoryCounts: hist, summary: exportSummary });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const isLoading = loading !== null;
  const closePreview = useCallback(() => setPreview(null), []);
  const downloadPreview = useCallback(async () => {
    if (preview) downloadBlob(preview.fileBlob, preview.fileName);
  }, [preview]);
  const loadingLabel = loading
    ? (() => { const [fmt] = loading.split('-') as [Format, Variant]; return fmt.toUpperCase(); })()
    : '';

  const fmtButton = (fmt: Format, label: string, icon: React.ReactNode, color: string, variant: Variant) => (
    <button
      key={`${fmt}-${variant}`}
      onClick={() => run(fmt, variant)}
      disabled={fmt !== 'csv' && Boolean(periodError)}
      className={`w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${color}`}
    >
      {icon} {label}
    </button>
  );

  const csvIcon    = <FileText className="w-3.5 h-3.5" />;
  const docxIcon   = routeSlipProps ? <Route className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />;
  const excelIcon  = routeSlipProps ? <Route className="w-3.5 h-3.5" /> : <FileSpreadsheet className="w-3.5 h-3.5" />;
  const pdfIcon    = routeSlipProps ? <Route className="w-3.5 h-3.5" /> : <FileDown className="w-3.5 h-3.5" />;

  const csvLabel   = 'Export CSV';
  const docxLabel  = routeSlipProps ? 'Route Slip — Word (.docx)' : 'Export Word (.docx)';
  const excelLabel = routeSlipProps ? 'Route Slip — Excel' : 'Export Excel';
  const pdfLabel   = routeSlipProps ? 'Route Slip — PDF' : 'Export PDF';

  return (
    <div className="relative" ref={ref} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    }}>
      <button
        ref={triggerRef}
        aria-expanded={open}
        onClick={() => !isLoading && setOpen(o => !o)}
        disabled={isLoading}
        className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 text-[11px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-60 shadow-xs"
      >
        {isLoading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <FileDown className="w-3.5 h-3.5" />
        }
        {isLoading ? `Exporting ${loadingLabel}…` : 'Export'}
        {!isLoading && <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <div className={`absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg p-3 ${routeSlipProps ? 'w-80 max-w-[calc(100vw-2rem)]' : 'min-w-[220px]'}`}>
          {routeSlipProps && routeSlipPeriodFields && <RouteSlipPeriodFields {...routeSlipPeriodFields} />}
          <DocumentSizeSelect value={docSize} onChange={setDocSize} disabled={isLoading} />
          <div className="flex flex-col -mx-3">
            {hasTrail ? (
              <>
              {/* ── Current Status ── */}
              <div className="px-3.5 pt-2 pb-1">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <Clock className="w-3 h-3" /> Current Status
                </div>
              </div>
              {fmtButton('csv',   csvLabel,   csvIcon,   'text-emerald-700 hover:bg-emerald-50', 'current')}
              {fmtButton('docx',  docxLabel,  docxIcon,  'text-blue-700 hover:bg-blue-50',       'current')}
              {fmtButton('excel', excelLabel, excelIcon, 'text-green-700 hover:bg-green-50',     'current')}
              {showPdf && fmtButton('pdf', pdfLabel, pdfIcon, 'text-red-700 hover:bg-red-50',    'current')}

              <div className="mx-3 my-1.5 border-t border-slate-100" />

              {/* ── Status Trail ── */}
              <div className="px-3.5 pb-1">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <History className="w-3 h-3" /> Status Trail
                </div>
              </div>
              {fmtButton('csv',   `${csvLabel} (Trail)`,   csvIcon,   'text-emerald-700 hover:bg-emerald-50', 'trail')}
              {fmtButton('docx',  `${docxLabel.replace('Export ', '').replace('Route Slip — ', '')} (Trail)`,  docxIcon,  'text-blue-700 hover:bg-blue-50',       'trail')}
              {fmtButton('excel', `${excelLabel.replace('Export ', '').replace('Route Slip — ', '')} (Trail)`, excelIcon, 'text-green-700 hover:bg-green-50',     'trail')}
              {showPdf && fmtButton('pdf', `${pdfLabel.replace('Export ', '').replace('Route Slip — ', '')} (Trail)`, pdfIcon, 'text-red-700 hover:bg-red-50',    'trail')}
            </>
          ) : (
            <>
              {fmtButton('csv',   csvLabel,   csvIcon,   'text-emerald-700 hover:bg-emerald-50', 'current')}
              {fmtButton('docx',  docxLabel,  docxIcon,  'text-blue-700 hover:bg-blue-50',       'current')}
              {fmtButton('excel', excelLabel, excelIcon, 'text-green-700 hover:bg-green-50',     'current')}
              {showPdf && fmtButton('pdf', pdfLabel, pdfIcon, 'text-red-700 hover:bg-red-50',    'current')}
            </>
          )}
          </div>
          <div className="mx-3 mt-1 pt-1 border-t border-slate-100 text-[9px] text-slate-400 pb-1">
            {totalCount !== undefined ? totalCount : rows.length} record{(totalCount !== undefined ? totalCount : rows.length) !== 1 ? 's' : ''} will be exported
          </div>
        </div>
      )}
      {error && <p role="alert" className="absolute right-0 top-full mt-1 z-30 bg-red-50 border border-red-200 rounded-lg p-3 w-80 max-w-[calc(100vw-2rem)] text-xs text-red-700">{error}</p>}
      {preview && <ExportPreviewDialog
        format={preview.format as ExportPreviewFormat}
        variant={preview.variant}
        rows={preview.rows}
        columns={preview.columns}
        meta={meta}
        title={preview.title}
        documentSize={docSize}
        statusHistoryCounts={preview.statusHistoryCounts}
        summary={preview.summary}
        excelBlob={preview.format === 'excel' ? preview.fileBlob : undefined}
        fileBlob={preview.fileBlob}
        onClose={closePreview}
        onDownload={downloadPreview}
      />}
    </div>
  );
}
