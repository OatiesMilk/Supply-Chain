import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BarChart2, Loader2, AlertTriangle, RefreshCw, FileDown, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { DocumentSize, DEFAULT_DOCUMENT_SIZE } from '@/utils/documentSize';
import DocumentSizeSelect from '@/components/DocumentSizeSelect';
import { api, ApiReportSummary } from '@/api';
import { DELIVERY_STATUSES } from '@/data';
import { ExportColumn, ExportMeta, fmtDate, fmtTime, downloadCSV, downloadExcel, downloadPDF } from '@/utils/export';
import { downloadDocx } from '@/utils/exportDocx';
import ExportPreviewDialog, { type ExportPreviewFormat } from '@/components/ExportPreviewDialog';
import { downloadBlob } from '@/utils/downloadBlob';

const CATEGORIES = ['Deliveries', 'RMA', 'Accounting Collection', 'Procurement Pick-up', 'Sales Orders'];

function SummaryCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function BreakdownTable({ title, rows, colA, colB }: { title: string; rows: { label: string; count: number }[]; colA: string; colB: string }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      </div>
      <div className="divide-y divide-slate-50">
        {rows.map(r => (
          <div key={r.label} className="flex items-center px-4 py-2.5 gap-3 hover:bg-slate-50">
            <span className="text-xs text-slate-700 flex-1 truncate">{r.label}</span>
            <div className="w-24 bg-slate-100 rounded-full h-1.5 shrink-0">
              <div
                className="bg-[#0078C1] h-1.5 rounded-full"
                style={{ width: `${total > 0 ? Math.round((r.count / total) * 100) : 0}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-800 w-8 text-right">{r.count}</span>
            <span className="text-[10px] text-slate-400 w-8 text-right">{total > 0 ? Math.round((r.count / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const REPORT_COLUMNS: ExportColumn[] = [
  { header: 'Section',       key: 'section', width: 22 },
  { header: 'Label',         key: 'label',   width: 32 },
  { header: 'Count / Value', key: 'value',   width: 20 },
];

function buildReportRows(data: ApiReportSummary): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  rows.push({ section: 'Summary', label: 'Delivery Date Cohort — Total Records', value: String(data.total) });
  rows.push({ section: 'Summary', label: 'Delivered in Delivery Date Cohort', value: String(data.accomplished) });
  rows.push({ section: 'Summary', label: 'Completed by Time Out in Range (independent of Status filter)', value: String(data.completed_in_range) });
  rows.push({ section: 'Summary', label: 'On-Hold',          value: String(data.on_hold) });
  rows.push({ section: 'Summary', label: 'Pending',          value: String(data.pending) });
  rows.push({ section: 'Summary', label: 'Delivered Rate in Delivery Date Cohort', value: `${data.completion_rate}%` });
  data.by_status.forEach(r   => rows.push({ section: 'By Status',   label: r.status,   value: String(r.count) }));
  data.by_category.forEach(r => rows.push({ section: 'By Category', label: r.category, value: String(r.count) }));
  data.by_area.forEach(r     => rows.push({ section: 'By Area',     label: r.area,     value: String(r.count) }));
  data.by_driver.forEach(r   => rows.push({ section: 'By Driver',   label: r.driver,   value: String(r.count) }));
  return rows;
}

type ExportFmt = 'csv' | 'excel' | 'pdf' | 'docx';

function StatReportExportMenu({
  data, dateFrom, dateTo, currentUserName, currentUserRole
}: {
  data: ApiReportSummary;
  dateFrom: string;
  dateTo: string;
  currentUserName: string;
  currentUserRole: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ExportFmt | null>(null);
  const [docSize, setDocSize] = useState<DocumentSize>(DEFAULT_DOCUMENT_SIZE);
  const [preview, setPreview] = useState<{ format: ExportFmt; rows: ReturnType<typeof buildReportRows>; meta: ExportMeta; title: string; fileBlob?: Blob; fileName?: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const run = async (fmt: ExportFmt) => {
    setOpen(false);
    setLoading(fmt);
    const rows = buildReportRows(data);
    const title = 'Statistical Report';
    const dateRange = dateFrom || dateTo
      ? `${dateFrom || 'all time'} to ${dateTo || 'all time'}`
      : 'All dates';
    const meta: ExportMeta = {
      reportName: title,
      dateRange,
      dateBasis: 'Delivery Date cohort and completion Time Out (Asia/Manila)',
      generatedByName: currentUserName,
      generatedByRole: currentUserRole,
    };
    try {
      const stamp = new Date().toISOString().split('T')[0];
      let fileBlob: Blob;
      let fileName = `mg-statistical-report-${stamp}.${fmt === 'excel' ? 'xlsx' : fmt}`;
      if (fmt === 'csv') fileBlob = downloadCSV(rows, REPORT_COLUMNS, 'mg-statistical-report', meta, undefined, true) as Blob;
      else if (fmt === 'excel') fileBlob = await downloadExcel(rows, REPORT_COLUMNS, 'Statistical Report', 'mg-statistical-report', meta, undefined, docSize, true) as Blob;
      else if (fmt === 'pdf') fileBlob = await downloadPDF(rows, REPORT_COLUMNS, title, 'mg-statistical-report', meta, false, undefined, docSize, true) as Blob;
      else { fileBlob = await downloadDocx(rows, REPORT_COLUMNS, title, `mg-statistical-report-${stamp}`, meta, undefined, undefined, undefined, docSize, true) as Blob; fileName = `mg-statistical-report-${stamp}.docx`; }
      setPreview({ format: fmt, rows, meta, title, fileBlob, fileName });
    } catch (err) {
      console.error('Statistical report export failed:', err);
    } finally {
      setLoading(null);
    }
  };

  const closePreview = useCallback(() => setPreview(null), []);
  const downloadPreview = async () => {
    if (!preview) return;
    const { format: fmt, rows, meta, title } = preview;
    setLoading(fmt);
    try {
      if (preview.fileBlob) {
        downloadBlob(preview.fileBlob, preview.fileName ?? 'mg-statistical-report.xlsx');
        return;
      }
      if (fmt === 'csv') downloadCSV(rows, REPORT_COLUMNS, 'mg-statistical-report', meta);
      if (fmt === 'excel') await downloadExcel(rows, REPORT_COLUMNS, 'Statistical Report', 'mg-statistical-report', meta, undefined, docSize);
      if (fmt === 'pdf') await downloadPDF(rows, REPORT_COLUMNS, title, 'mg-statistical-report', meta, false, undefined, docSize);
      if (fmt === 'docx') await downloadDocx(rows, REPORT_COLUMNS, title, `mg-statistical-report-${new Date().toISOString().split('T')[0]}`, meta, undefined, undefined, undefined, docSize);
    } catch (err) {
      console.error('Statistical report export failed:', err);
      throw err;
    } finally { setLoading(null); }
  };

  const isLoading = loading !== null;
  const options: { fmt: ExportFmt; label: string; icon: React.ReactNode; color: string }[] = [
    { fmt: 'csv',   label: 'Export CSV',          icon: <FileText      className="w-3.5 h-3.5" />, color: 'text-emerald-700 hover:bg-emerald-50' },
    { fmt: 'docx',  label: 'Export Word (.docx)',  icon: <FileText      className="w-3.5 h-3.5" />, color: 'text-blue-700 hover:bg-blue-50' },
    { fmt: 'excel', label: 'Export Excel',         icon: <FileSpreadsheet className="w-3.5 h-3.5" />, color: 'text-green-700 hover:bg-green-50' },
    { fmt: 'pdf',   label: 'Export PDF',           icon: <FileDown      className="w-3.5 h-3.5" />, color: 'text-red-700 hover:bg-red-50' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !isLoading && setOpen(o => !o)}
        disabled={isLoading}
        className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-60 shadow-xs"
      >
        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
        {isLoading ? `Exporting ${loading?.toUpperCase()}…` : 'Export'}
        {!isLoading && <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg p-3 min-w-[220px]">
          <DocumentSizeSelect value={docSize} onChange={setDocSize} disabled={isLoading} />
          <div className="flex flex-col -mx-3">
            {options.map(opt => (
              <button
                key={opt.fmt}
                onClick={() => run(opt.fmt)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-bold transition-colors cursor-pointer ${opt.color}`}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {preview && <ExportPreviewDialog
        format={preview.format as ExportPreviewFormat}
        variant="current"
        rows={preview.rows}
        columns={REPORT_COLUMNS}
        meta={preview.meta}
        title={preview.title}
        documentSize={docSize}
        excelBlob={preview.format === 'excel' ? preview.fileBlob : undefined}
        fileBlob={preview.fileBlob}
        onClose={closePreview}
        onDownload={downloadPreview}
      />}
    </div>
  );
}

export default function StatisticalReportView({ currentUserName = '', currentUserRole = '' }: { currentUserName?: string; currentUserRole?: string }) {
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [category,  setCategory]  = useState('');
  const [status,    setStatus]    = useState('');
  const [driver,    setDriver]    = useState('');
  const [area,      setArea]      = useState('');

  const [data,    setData]    = useState<ApiReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] bg-white';
  const labelCls = 'text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1';

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getReportSummary({
        deliveryDateFrom: dateFrom || undefined,
        deliveryDateTo:   dateTo   || undefined,
        category:  category  || undefined,
        status:    status    || undefined,
        driver:    driver    || undefined,
        area:      area      || undefined,
      });
      setData(result);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setDateFrom(''); setDateTo(''); setCategory(''); setStatus(''); setDriver(''); setArea('');
    setData(null); setError(null);
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filters</p>
          {data && (
            <StatReportExportMenu
              data={data}
              dateFrom={dateFrom}
              dateTo={dateTo}
              currentUserName={currentUserName}
              currentUserRole={currentUserRole}
            />
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className={labelCls}>Delivery Date From (Manila)</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Delivery Date To (Manila)</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
              <option value="">All</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
              <option value="">All</option>
              {DELIVERY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Driver</label>
            <input type="text" value={driver} onChange={e => setDriver(e.target.value)} placeholder="Any driver" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Area</label>
            <input type="text" value={area} onChange={e => setArea(e.target.value)} placeholder="Any area" className={inputCls} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={handleFetch}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0078C1] hover:bg-[#1F3864] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5" />}
            {loading ? 'Loading…' : 'Generate Report'}
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-600 text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        )}
      </div>

      {/* Results */}
      {data && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
            <SummaryCard label="Delivery Date Cohort" value={data.total} sub="Records scheduled in range" />
            <SummaryCard label="Delivered in Cohort" value={data.accomplished} sub="Current Delivered status" />
            <SummaryCard
              label="Completed by Time Out"
              value={data.completed_in_range}
              sub={`${dateFrom || dateTo ? 'Selected Manila date range' : 'All dates'}; independent of Status filter`}
            />
            <SummaryCard label="On-Hold"           value={data.on_hold}     />
            <SummaryCard label="Pending"           value={data.pending}   />
            <SummaryCard label="Delivered Rate" value={`${data.completion_rate}%`} sub="Within Delivery Date cohort" />
          </div>

          {/* Breakdown tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BreakdownTable
              title="By Status (Delivery Date cohort)"
              colA="Status"
              colB="Count"
              rows={data.by_status.map(r => ({ label: r.status, count: r.count }))}
            />
            <BreakdownTable
              title="By Category (Delivery Date cohort)"
              colA="Category"
              colB="Count"
              rows={data.by_category.map(r => ({ label: r.category, count: r.count }))}
            />
            <BreakdownTable
              title="Top Areas (Delivery Date cohort)"
              colA="Area"
              colB="Count"
              rows={data.by_area.map(r => ({ label: r.area, count: r.count }))}
            />
            <BreakdownTable
              title="By Driver (Delivery Date cohort)"
              colA="Driver"
              colB="Count"
              rows={data.by_driver.map(r => ({ label: r.driver, count: r.count }))}
            />
          </div>
        </div>
      )}

      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <BarChart2 className="w-12 h-12 text-slate-200" />
          <p className="text-slate-400 text-sm">Apply filters above and click <strong>Generate Report</strong> to see results.</p>
        </div>
      )}
    </div>
  );
}
