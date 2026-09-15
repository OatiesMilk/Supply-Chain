import { useState, useRef, useEffect } from 'react';
import { Route, ChevronDown, Loader2, AlertTriangle, FileText, Clock, History } from 'lucide-react';
import { DeliveryRecord } from '../types';
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
  const [trailFallback, setTrailFallback] = useState(false);
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
      if (driverFilter) {
        const params = {
          records,
          driverName: driverFilter,
          date: dateFrom || new Date().toISOString().split('T')[0],
          preparedBy,
          filename,
          auditSets,
        };
        if (fmt === 'excel') await downloadRouteSlipExcel(params);
        if (fmt === 'pdf')   await downloadRouteSlipPDF(params);
        if (fmt === 'docx')  await downloadRouteSlipDocx(params);
      } else {
        const params = { records, date: dateFrom, preparedBy, filename, auditSets };
        if (fmt === 'excel') await downloadAllDriversRouteSlipExcel(params);
        if (fmt === 'pdf')   await downloadAllDriversRouteSlipPDF(params);
        if (fmt === 'docx')  await downloadAllDriversRouteSlipDocx(params);
      }
    } catch (err) {
      console.error('Route slip export failed:', err);
    } finally {
      setLoading(null);
    }
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
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[220px]">

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
    </div>
  );
}
