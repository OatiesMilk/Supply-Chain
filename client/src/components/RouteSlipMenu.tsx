import { useState, useRef, useEffect, useCallback } from 'react';
import { Route, ChevronDown, Loader2, FileText, Clock, History } from 'lucide-react';
import { DocumentSize, DEFAULT_DOCUMENT_SIZE } from '../utils/documentSize';
import DocumentSizeSelect from './DocumentSizeSelect';
import RouteSlipPeriodFields, { type RouteSlipPeriodFieldsProps } from './RouteSlipPeriodFields';
import { DeliveryRecord } from '../types';
import type { ExportColumn, ExportMeta } from '../utils/export';
import ExportPreviewDialog, { type ExportPreviewFormat } from './ExportPreviewDialog';
import { downloadBlob } from '@/utils/downloadBlob';
import { downloadRouteSlipForPeriod, type RouteSlipFormat } from '../utils/routeSlip';
import { routeSlipPeriod, routeSlipSelectionError, filterRouteSlipRecords } from '../utils/routeSlipPeriod';

interface Props extends RouteSlipPeriodFieldsProps {
  driverFilter: string;
  preparedBy: string;
  filename: string;
  fetchRecords: () => Promise<DeliveryRecord[]>;
}

type Variant = 'current' | 'trail';
type LoadingKey = `${RouteSlipFormat}-${Variant}`;

export default function RouteSlipMenu({ driverFilter, selection, onChange, preparedBy, filename, fetchRecords }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<LoadingKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docSize, setDocSize] = useState<DocumentSize>(DEFAULT_DOCUMENT_SIZE);
  const [preview, setPreview] = useState<{ format: RouteSlipFormat; variant: Variant; records: DeliveryRecord[]; fileBlob: Blob; fileName: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const periodError = routeSlipSelectionError(selection);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLSelectElement>('select')?.focus();
  }, [open]);

  const doExport = async (format: RouteSlipFormat, variant: Variant) => {
    if (periodError) return;
    setLoading(`${format}-${variant}`);
    setError(null);
    close();
    try {
      const period = routeSlipPeriod(selection);
      const fetchedRecords = await fetchRecords();
      const filteredRecords = filterRouteSlipRecords(fetchedRecords, period)
        .filter(record => !driverFilter || record.driver?.trim() === driverFilter);
      const fileBlob = await downloadRouteSlipForPeriod(format, {
        records: filteredRecords, ...period, preparedBy, filename, variant, documentSize: docSize,
      }, true) as Blob;
      const stamp = new Date().toISOString().split('T')[0];
      const suffix = driverFilter ? 'route-slip' : 'route-slip-all-drivers';
      const extension = format === 'excel' ? 'xlsx' : format;
      const fileName = format === 'docx' ? `${filename}-${suffix}.docx` : `${filename}-${suffix}-${stamp}.${extension}`;
      setPreview({ format, variant, records: filteredRecords, fileBlob, fileName });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Route slip export failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const closePreview = useCallback(() => setPreview(null), []);
  const downloadPreview = async () => {
    if (preview) downloadBlob(preview.fileBlob, preview.fileName);
  };

  return (
    <div className="relative" ref={ref} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    }}>
      <button ref={triggerRef} type="button" aria-expanded={open} aria-haspopup="dialog"
        onClick={() => { setError(null); setOpen(value => !value); }} disabled={loading !== null}
        className="flex items-center gap-1.5 bg-[#1F3864] hover:bg-[#2a4d82] text-white text-[11px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-60 shadow-xs">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Route className="w-3.5 h-3.5" />}
        {loading ? `Exporting ${loading.split('-')[0].toUpperCase()}…` : 'Route Slip'}
        {!loading && <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && <div role="dialog" aria-label="Generate route slip" className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-80 max-w-[calc(100vw-2rem)]">
        <RouteSlipPeriodFields selection={selection} onChange={onChange} />
        <DocumentSizeSelect value={docSize} onChange={setDocSize} disabled={loading !== null} />
        {(['current', 'trail'] as const).map(variant => <div key={variant} className="mt-2">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
            {variant === 'current' ? <Clock className="w-3 h-3" /> : <History className="w-3 h-3" />}
            {variant === 'current' ? 'Current Status' : 'Status Trail'}
          </div>
          {(['excel', 'pdf', 'docx'] as const).map(format => <button key={format} type="button"
            disabled={Boolean(periodError) || loading !== null} onClick={() => doExport(format, variant)}
            className="w-full flex items-center gap-2.5 py-2 px-1 text-[11px] font-bold text-[#1F3864] hover:bg-blue-50 rounded disabled:opacity-40 disabled:cursor-not-allowed">
            {format === 'docx' ? <FileText className="w-3.5 h-3.5" /> : <Route className="w-3.5 h-3.5" />}
            {format === 'docx' ? 'Word' : format === 'pdf' ? 'PDF' : 'Excel'} ({variant === 'current' ? 'Current' : 'Status Trail'})
          </button>)}
        </div>)}
        <p className="text-[10px] text-slate-500 border-t border-slate-100 pt-2 mt-2">
          {driverFilter ? `Driver filter: ${driverFilter}. ` : ''}One slip per assigned driver for the selected period. Status Trail includes each record’s full history.
        </p>
      </div>}
      {error && <p role="alert" className="absolute right-0 top-full mt-1 z-30 bg-red-50 border border-red-200 rounded-lg p-3 w-80 max-w-[calc(100vw-2rem)] text-xs text-red-700">{error}</p>}
      {preview && (() => {
        const columns: ExportColumn[] = [
          { header: 'Record ID', key: 'id' }, { header: 'Company', key: 'company' },
          { header: 'Reference', key: 'reference' }, { header: 'Area', key: 'area' },
          { header: 'Delivery Date', key: 'deliveryDate' }, { header: 'Driver', key: 'driver' },
          { header: 'Status', key: 'status' },
        ];
        const rows = preview.records.map(record => ({
          id: record.id, company: record.company_name, reference: record.reference,
          area: record.area, deliveryDate: record.delivery_date, driver: record.driver,
          status: record.status,
        }));
        const period = routeSlipPeriod(selection);
        const meta: ExportMeta = {
          reportName: 'Route Slip', dateRange: period.dateTo ? `${period.dateFrom} – ${period.dateTo}` : `From ${period.dateFrom} onward`,
          generatedByName: preparedBy, generatedByRole: '',
        };
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
