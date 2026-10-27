import { manilaToday } from '@/utils/recordLifecycle';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Route, ChevronDown, Loader2, AlertTriangle, FileText, Clock, History } from 'lucide-react';
import { DocumentSize, DEFAULT_DOCUMENT_SIZE } from '../utils/documentSize';
import DocumentSizeSelect from './DocumentSizeSelect';
import { DeliveryRecord } from '../types';
import type { ExportColumn, ExportMeta } from '../utils/export';
import ExportPreviewDialog, { type ExportPreviewFormat } from './ExportPreviewDialog';
import { downloadBlob } from '@/utils/downloadBlob';
import {
  downloadRouteSlipExcel,
  downloadRouteSlipPDF,
  downloadRouteSlipDocx,
  downloadAllDriversRouteSlipExcel,
  downloadAllDriversRouteSlipPDF,
  downloadAllDriversRouteSlipDocx,
  fetchHistoricStatusSets,
} from '../utils/routeSlip';

interface Props {
  records: DeliveryRecord[];
  driverFilter: string;
  dateFrom: string;
  preparedBy: string;
  filename: string;
  onFocusDateFilter: () => void;
}

type Format  = 'excel' | 'pdf' | 'docx';
type Variant = 'current' | 'trail';
type LoadingKey = `${Format}-${Variant}`;

export default function RouteSlipMenu({
  records, driverFilter, dateFrom, preparedBy, filename, onFocusDateFilter,
}: Props) {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState<LoadingKey | null>(null);
  const [warning, setWarning]   = useState<Format | null>(null);
  const [docSize, setDocSize]   = useState<DocumentSize>(DEFAULT_DOCUMENT_SIZE);
  const [trailFallback, setTrailFallback] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ format: Format; variant: Variant; auditSets?: Map<string, Set<string>>; fileBlob?: Blob; fileName?: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setWarning(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!trailFallback) return;
    const t = setTimeout(() => setTrailFallback(false), 4000);
    return () => clearTimeout(t);
  }, [trailFallback]);

  const doExport = async (fmt: Format, variant: Variant) => {
    setOpen(false);
    setWarning(null);
    setPreviewError(null);
    setLoading(`${fmt}-${variant}`);

    let auditSets: Map<string, Set<string>> | undefined;

    if (variant === 'trail') {
      try {
        auditSets = await fetchHistoricStatusSets(records);
      } catch {
        setTrailFallback(true);
        auditSets = undefined;
      }
    }

    try {
      let fileBlob: Blob;
      const stamp = new Date().toISOString().split('T')[0];
      const suffix = driverFilter ? 'route-slip' : 'route-slip-all-drivers';
      const extension = fmt === 'excel' ? 'xlsx' : fmt;
      const fileName = fmt === 'docx' ? `${filename}-${suffix}.docx` : `${filename}-${suffix}-${stamp}.${extension}`;
      if (driverFilter) {
        const params = { records, driverName: driverFilter, date: dateFrom || manilaToday(), preparedBy, filename, auditSets, documentSize: docSize };
        if (fmt === 'excel') fileBlob = await downloadRouteSlipExcel(params, true) as Blob;
        else if (fmt === 'pdf') fileBlob = await downloadRouteSlipPDF(params, true) as Blob;
        else fileBlob = await downloadRouteSlipDocx(params, true) as Blob;
      } else {
        const params = { records, date: dateFrom, preparedBy, filename, auditSets, documentSize: docSize };
        if (fmt === 'excel') fileBlob = await downloadAllDriversRouteSlipExcel(params, true) as Blob;
        else if (fmt === 'pdf') fileBlob = await downloadAllDriversRouteSlipPDF(params, true) as Blob;
        else fileBlob = await downloadAllDriversRouteSlipDocx(params, true) as Blob;
      }
      setPreview({ format: fmt, variant, auditSets, fileBlob, fileName });
    } catch (error) {
      console.error('Route slip preview failed:', error);
      setPreviewError(error instanceof Error ? error.message : 'The route slip preview could not be prepared.');
    } finally { setLoading(null); }
  };

  const closePreview = useCallback(() => setPreview(null), []);
  const downloadPreview = async () => {
    if (!preview) return;
    const { format: fmt, variant, auditSets } = preview;
    setLoading(`${fmt}-${variant}`);
    try {
      if (preview.fileBlob) {
        downloadBlob(preview.fileBlob, preview.fileName ?? `${filename}.xlsx`);
        return;
      }
      if (driverFilter) {
        const params = { records, driverName: driverFilter, date: dateFrom || manilaToday(), preparedBy, filename, auditSets, documentSize: docSize };
        if (fmt === 'excel') await downloadRouteSlipExcel(params);
        if (fmt === 'pdf') await downloadRouteSlipPDF(params);
        if (fmt === 'docx') await downloadRouteSlipDocx(params);
      } else {
        const params = { records, date: dateFrom, preparedBy, filename, auditSets, documentSize: docSize };
        if (fmt === 'excel') await downloadAllDriversRouteSlipExcel(params);
        if (fmt === 'pdf') await downloadAllDriversRouteSlipPDF(params);
        if (fmt === 'docx') await downloadAllDriversRouteSlipDocx(params);
      }
    } catch (err) {
      console.error('Route slip export failed:', err);
      throw err;
    } finally { setLoading(null); }
  };

  const handleSelect = (fmt: Format, variant: Variant) => {
    if (!driverFilter && !dateFrom) {
      setOpen(false);
      setWarning(fmt);
      return;
    }
    doExport(fmt, variant);
  };

  const isLoading = loading !== null;
  const driverCount = driverFilter
    ? 1
    : new Set(records.map(r => r.driver?.trim()).filter(d => d && d.toLowerCase() !== 'unassigned')).size;

  const loadingLabel = loading
    ? (() => {
        const [fmt] = loading.split('-') as [Format, Variant];
        return fmt.toUpperCase();
      })()
    : '';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { if (!isLoading) { setWarning(null); setOpen(o => !o); } }}
        disabled={isLoading}
        className="flex items-center gap-1.5 bg-[#1F3864] hover:bg-[#2a4d82] text-white text-[11px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-60 shadow-xs"
      >
        {isLoading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Route className="w-3.5 h-3.5" />
        }
        {isLoading ? `Exporting ${loadingLabel}…` : 'Route Slip'}
        {!isLoading && <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg p-3 min-w-[220px]">
          <DocumentSizeSelect value={docSize} onChange={setDocSize} disabled={isLoading} />
          <div className="flex flex-col -mx-3">
          {/* ── Current Status ── */}
          <div className="px-3.5 pt-2 pb-1">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
              <Clock className="w-3 h-3" /> Current Status
            </div>
          </div>
          <button
            onClick={() => handleSelect('excel', 'current')}
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[11px] font-bold text-green-700 hover:bg-green-50 transition-colors cursor-pointer"
          >
            <Route className="w-3.5 h-3.5" /> Excel (Current)
          </button>
          <button
            onClick={() => handleSelect('pdf', 'current')}
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <Route className="w-3.5 h-3.5" /> PDF (Current)
          </button>
          <button
            onClick={() => handleSelect('docx', 'current')}
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" /> Word (Current)
          </button>

          <div className="mx-3 my-1.5 border-t border-slate-100" />

          {/* ── Status Trail ── */}
          <div className="px-3.5 pb-1">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
              <History className="w-3 h-3" /> Status Trail
            </div>
          </div>
          <button
            onClick={() => handleSelect('excel', 'trail')}
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[11px] font-bold text-green-700 hover:bg-green-50 transition-colors cursor-pointer"
          >
            <Route className="w-3.5 h-3.5" /> Excel (Status Trail)
          </button>
          <button
            onClick={() => handleSelect('pdf', 'trail')}
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <Route className="w-3.5 h-3.5" /> PDF (Status Trail)
          </button>
          <button
            onClick={() => handleSelect('docx', 'trail')}
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" /> Word (Status Trail)
          </button>

          </div>
          <div className="mx-3 mt-1.5 pt-1 border-t border-slate-100 text-[9px] text-slate-400 pb-1.5">
            {driverFilter
              ? `${records.length} record${records.length !== 1 ? 's' : ''} · ${driverFilter}`
              : `${records.length} record${records.length !== 1 ? 's' : ''} · ${driverCount} driver${driverCount !== 1 ? 's' : ''}`
            }
          </div>
        </div>
      )}

      {warning && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-amber-50 border border-amber-200 rounded-xl shadow-lg p-3.5 w-72">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[11px] font-bold text-amber-800">No date filter set</p>
          </div>
          <p className="text-[11px] text-amber-700 mb-3 leading-relaxed">
            Please set a date filter before exporting the full route slip. Exporting without a date may include all records across all time.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setWarning(null); onFocusDateFilter(); }}
              className="flex-1 text-[11px] font-bold text-[#1F3864] border border-[#1F3864] rounded-lg px-2 py-1.5 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              Set a Date
            </button>
            <button
              onClick={() => doExport(warning, 'current')}
              className="flex-1 text-[11px] font-bold text-white bg-amber-600 rounded-lg px-2 py-1.5 hover:bg-amber-700 transition-colors cursor-pointer"
            >
              Export Anyway
            </button>
          </div>
        </div>
      )}

      {trailFallback && (
        <div className="absolute right-0 top-full mt-1 z-30 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl shadow-lg px-3.5 py-2.5 w-72 pointer-events-none">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Could not load status history — exporting current status only.
          </p>
        </div>
      )}
      {previewError && <div role="alert" className="absolute right-0 top-full mt-1 z-30 max-w-xs rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{previewError}</div>}

      {preview && (() => {
        const columns: ExportColumn[] = [
          { header: 'Record ID', key: 'id' }, { header: 'Company', key: 'company' },
          { header: 'Reference', key: 'reference' }, { header: 'Area', key: 'area' },
          { header: 'Delivery Date', key: 'deliveryDate' }, { header: 'Driver', key: 'driver' },
          { header: 'Status', key: 'status' },
        ];
        const rows = records.filter(record => !driverFilter || record.driver === driverFilter).map(record => ({
          id: record.id, company: record.company_name, reference: record.reference,
          area: record.area, deliveryDate: record.delivery_date, driver: record.driver,
          status: record.status,
        }));
        const meta: ExportMeta = { reportName: 'Route Slip', dateRange: dateFrom || 'All dates', generatedByName: preparedBy, generatedByRole: '' };
        return <ExportPreviewDialog
          format={preview.format as ExportPreviewFormat}
          variant={preview.variant}
          rows={rows}
          columns={columns}
          meta={meta}
          title={`${driverFilter || 'All Drivers'} Route Slip`}
          documentSize={docSize}
          excelBlob={preview.format === 'excel' ? preview.fileBlob : undefined}
          fileBlob={preview.fileBlob}
          onClose={closePreview}
          onDownload={downloadPreview}
        />;
      })()}
    </div>
  );
}
