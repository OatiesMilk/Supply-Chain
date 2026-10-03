import React, { useState, useRef, useEffect } from 'react';
import { FileDown, FileSpreadsheet, FileText, ChevronDown, Loader2, Clock, History } from 'lucide-react';
import { DeliveryRecord } from '../types';
import { ExportMeta, StatusHistoryCounts } from '../utils/export';
import {
  computeAllOpsSummary,
  serializeAllOpsRow,
  ALL_OPS_COLUMNS,
  PDF_ALL_OPS_COLUMNS,
  downloadAllOpsCSV,
  downloadAllOpsExcel,
  downloadAllOpsPDF,
} from '../utils/allOpsExport';
import { downloadDocx } from '../utils/exportDocx';

interface Props {
  records: DeliveryRecord[];
  meta: ExportMeta;
  activeFilterLabel?: string;
  statusHistoryCounts?: StatusHistoryCounts;
}

type Format = 'csv' | 'excel' | 'pdf' | 'docx';
type Variant = 'current' | 'trail';
type LoadingKey = `${Format}-${Variant}`;

export default function AllOpsExportMenu({ records, meta, activeFilterLabel, statusHistoryCounts }: Props) {
  const [open,    setOpen]    = useState(false);
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
    setLoading(`${fmt}-${variant}`);
    const hist = variant === 'trail' ? statusHistoryCounts : undefined;
    try {
      const rows        = records.map(serializeAllOpsRow);
      const summary     = computeAllOpsSummary(records, 'nearest');
      const reportTitle = activeFilterLabel
        ? `${activeFilterLabel} — Comprehensive Report`
        : 'All Operations — Comprehensive Report';

      if (fmt === 'csv')   downloadAllOpsCSV(rows, ALL_OPS_COLUMNS, 'all-operations', meta, summary, reportTitle, hist);
      if (fmt === 'excel') await downloadAllOpsExcel(rows, ALL_OPS_COLUMNS, 'all-operations', meta, summary, reportTitle, hist);
      if (fmt === 'pdf')   await downloadAllOpsPDF(rows, PDF_ALL_OPS_COLUMNS, 'all-operations', meta, summary, reportTitle, hist);
      if (fmt === 'docx')  await downloadDocx(rows, ALL_OPS_COLUMNS, reportTitle, 'all-operations', meta, summary, reportTitle, hist);
    } catch (err) {
      console.error('All Ops export failed:', err);
    } finally {
      setLoading(null);
    }
  };

  const isLoading = loading !== null;
  const loadingLabel = loading
    ? (() => { const [fmt] = loading.split('-') as [Format, Variant]; return fmt.toUpperCase(); })()
    : '';

  const btn = (fmt: Format, label: string, icon: React.ReactNode, color: string, variant: Variant) => (
    <button
      key={`${fmt}-${variant}`}
      onClick={() => run(fmt, variant)}
      className={`w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${color}`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !isLoading && setOpen(o => !o)}
        disabled={isLoading}
        className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 text-[11px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-60 shadow-xs"
      >
        {isLoading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <FileDown className="w-3.5 h-3.5" />}
        {isLoading
          ? `Exporting ${loadingLabel}…`
          : activeFilterLabel
            ? `Export · ${activeFilterLabel}`
            : 'Export'}
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
              {btn('csv',   'CSV',          <FileText className="w-3.5 h-3.5" />,        'text-emerald-700 hover:bg-emerald-50', 'current')}
              {btn('docx',  'Word (.docx)', <FileText className="w-3.5 h-3.5" />,        'text-blue-700 hover:bg-blue-50',       'current')}
              {btn('excel', 'Excel',        <FileSpreadsheet className="w-3.5 h-3.5" />, 'text-green-700 hover:bg-green-50',     'current')}
              {btn('pdf',   'PDF',          <FileDown className="w-3.5 h-3.5" />,        'text-red-700 hover:bg-red-50',         'current')}

              <div className="mx-3 my-1.5 border-t border-slate-100" />

              {/* ── Status Trail ── */}
              <div className="px-3.5 pb-1">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <History className="w-3 h-3" /> Status Trail
                </div>
              </div>
              {btn('csv',   'CSV (Trail)',          <FileText className="w-3.5 h-3.5" />,        'text-emerald-700 hover:bg-emerald-50', 'trail')}
              {btn('docx',  'Word (Trail)',         <FileText className="w-3.5 h-3.5" />,        'text-blue-700 hover:bg-blue-50',       'trail')}
              {btn('excel', 'Excel (Trail)',        <FileSpreadsheet className="w-3.5 h-3.5" />, 'text-green-700 hover:bg-green-50',     'trail')}
              {btn('pdf',   'PDF (Trail)',          <FileDown className="w-3.5 h-3.5" />,        'text-red-700 hover:bg-red-50',         'trail')}
            </>
          ) : (
            <>
              {btn('csv',   'Export CSV',          <FileText className="w-3.5 h-3.5" />,        'text-emerald-700 hover:bg-emerald-50', 'current')}
              {btn('docx',  'Export Word (.docx)', <FileText className="w-3.5 h-3.5" />,        'text-blue-700 hover:bg-blue-50',       'current')}
              {btn('excel', 'Export Excel',        <FileSpreadsheet className="w-3.5 h-3.5" />, 'text-green-700 hover:bg-green-50',     'current')}
              {btn('pdf',   'Export PDF',          <FileDown className="w-3.5 h-3.5" />,        'text-red-700 hover:bg-red-50',         'current')}
            </>
          )}

          <div className="mx-3.5 mt-1 pt-1 border-t border-slate-100 text-[9px] text-slate-400 pb-1">
            {records.length} record{records.length !== 1 ? 's' : ''} · includes cover summary
          </div>
        </div>
      )}
    </div>
  );
}
