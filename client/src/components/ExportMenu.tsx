import React, { useState, useRef, useEffect } from 'react';
import { FileDown, FileSpreadsheet, FileText, ChevronDown, Loader2, Route, Clock, History } from 'lucide-react';
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
import { downloadRouteSlipExcel, downloadRouteSlipPDF, downloadRouteSlipDocx } from '../utils/routeSlip';
import { downloadDocx } from '../utils/exportDocx';
import { DeliveryRecord } from '../types';

interface RouteSlipProps {
  records: DeliveryRecord[];
  driverName: string;
  date: string;
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
  statusHistoryCounts?: StatusHistoryCounts;
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
  statusHistoryCounts,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<LoadingKey | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasTrail = !!statusHistoryCounts;

  const run = async (fmt: Format, variant: Variant) => {
    setOpen(false);
    const key: LoadingKey = `${fmt}-${variant}`;
    setLoading(key);
    const hist = variant === 'trail' ? statusHistoryCounts : undefined;
    try {
      if (routeSlipProps && fmt !== 'csv') {
        const rsParams = { ...routeSlipProps, filename };
        if (fmt === 'excel') await downloadRouteSlipExcel(rsParams);
        if (fmt === 'pdf')   await downloadRouteSlipPDF(rsParams);
        if (fmt === 'docx')  await downloadRouteSlipDocx(rsParams);
      } else if (summary) {
        const summaryTitle = pdfTitle.replace(/ records?$/i, '') + ' — Comprehensive Report';
        if (fmt === 'csv')   downloadAllOpsCSV(rows, columns, filename, meta, summary, summaryTitle, hist);
        if (fmt === 'excel') await downloadAllOpsExcel(rows, columns, filename, meta, summary, summaryTitle, hist);
        if (fmt === 'pdf')   await downloadAllOpsPDF(rows, pdfColumns ?? columns, filename, meta, summary, summaryTitle, hist);
      } else {
        if (fmt === 'csv')   downloadCSV(rows, columns, filename, meta, hist);
        if (fmt === 'excel') await downloadExcel(rows, columns, sheetName, filename, meta, hist);
        if (fmt === 'pdf')   await downloadPDF(rows, pdfColumns ?? columns, pdfTitle, filename, meta, !pdfPortrait, hist);
      }
      if (fmt === 'docx') {
        if (routeSlipProps) {
          await downloadRouteSlipDocx({ ...routeSlipProps, filename });
        } else {
          const summaryTitle = summary ? (pdfTitle.replace(/ records?$/i, '') + ' — Comprehensive Report') : undefined;
          await downloadDocx(rows, columns, pdfTitle, filename, meta, summary, summaryTitle, hist);
        }
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setLoading(null);
    }
  };

  const isLoading = loading !== null;
  const loadingLabel = loading
    ? (() => { const [fmt] = loading.split('-') as [Format, Variant]; return fmt.toUpperCase(); })()
    : '';

  const fmtButton = (fmt: Format, label: string, icon: React.ReactNode, color: string, variant: Variant) => (
    <button
      key={`${fmt}-${variant}`}
      onClick={() => run(fmt, variant)}
      className={`w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${color}`}
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
    <div className="relative" ref={ref}>
      <button
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
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[220px]">
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
          <div className="mx-3 mt-1 pt-1 border-t border-slate-100 text-[9px] text-slate-400 pb-1">
            {rows.length} record{rows.length !== 1 ? 's' : ''} will be exported
          </div>
        </div>
      )}
    </div>
  );
}
