import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, Loader2, X } from 'lucide-react';
import type { ExportColumn, ExportMeta, StatusHistoryCounts } from '@/utils/export';
import type { DocumentSize } from '@/utils/documentSize';
import type { AllOpsSummary } from '@/utils/allOpsExport';
import ExcelWorkbookPreview from './ExcelWorkbookPreview';

export type ExportPreviewFormat = 'csv' | 'excel' | 'pdf' | 'docx';

const FORMAT_LABEL: Record<ExportPreviewFormat, string> = {
  csv: 'CSV', excel: 'Excel workbook', pdf: 'PDF', docx: 'Word document',
};
const PAGE_SIZE = 25;

function parseCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(field);
      if (row.some(value => value.length > 0)) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  row.push(field);
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

function CsvArtifactPreview({ text }: { text: string }) {
  const rows = useMemo(() => parseCsv(text), [text]);
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  return <div className="h-full overflow-auto rounded-lg border border-slate-200 bg-white">
    <table className="w-full min-w-max border-collapse text-left text-xs text-slate-700">
      <tbody>{rows.map((row, rowIndex) => {
        const isSectionHeading = row.length === 1 && row[0].length > 0;
        const isColumnHeading = rowIndex > 0 && row.length === columnCount && rows[rowIndex - 1].length < columnCount;
        return <tr key={rowIndex} className={isColumnHeading ? 'bg-[#1F3864] font-semibold text-white' : isSectionHeading ? 'bg-slate-50 font-semibold text-[#1F3864]' : rowIndex % 2 ? 'bg-white' : 'bg-slate-50'}>
          {Array.from({ length: columnCount }, (_, columnIndex) => <td key={columnIndex} className={`max-w-72 whitespace-pre-wrap break-words border-b border-slate-100 px-3 py-2 align-top ${isColumnHeading ? 'text-white' : ''}`}>{row[columnIndex] ?? ''}</td>)}
        </tr>;
      })}</tbody>
    </table>
    {!rows.length && <p className="p-4 text-sm text-slate-500">This CSV contains no rows.</p>}
  </div>;
}

export default function ExportPreviewDialog({
  format, variant, rows, columns, meta, title, documentSize, statusHistoryCounts, summary, excelBlob, fileBlob, onClose, onDownload,
}: {
  format: ExportPreviewFormat;
  variant: 'current' | 'trail';
  rows: Record<string, string | number | null | undefined>[];
  columns: ExportColumn[];
  meta: ExportMeta;
  title: string;
  documentSize: DocumentSize;
  statusHistoryCounts?: StatusHistoryCounts;
  summary?: AllOpsSummary;
  excelBlob?: Blob;
  fileBlob?: Blob;
  onClose: () => void;
  onDownload: () => Promise<void>;
}) {
  const [page, setPage] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<{ url?: string; text?: string; docxRendered?: boolean; error?: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const docxHostRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);

  useEffect(() => {
    if (!fileBlob || format === 'excel') { setArtifactPreview(null); return; }
    let cancelled = false;
    let objectUrl: string | undefined;
    setArtifactPreview(null);
    if (format === 'pdf') {
      objectUrl = URL.createObjectURL(fileBlob);
      setArtifactPreview({ url: objectUrl });
    } else if (format === 'csv') {
      fileBlob.text().then(text => { if (!cancelled) setArtifactPreview({ text }); });
    } else if (format === 'docx') {
      const host = docxHostRef.current;
      if (!host) return;
      host.replaceChildren();
      import('docx-preview').then(async ({ renderAsync }) => {
        await renderAsync(await fileBlob.arrayBuffer(), host, host, {
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
        });
        if (!cancelled) setArtifactPreview({ docxRendered: true });
      }).catch(error => { if (!cancelled) setArtifactPreview({ error: error instanceof Error ? error.message : 'Could not preview the Word document.' }); });
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (docxHostRef.current) docxHostRef.current.replaceChildren();
    };
  }, [fileBlob, format]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !downloading) onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [downloading, onClose]);

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try { await onDownload(); onClose(); }
    catch (error) { setDownloadError(error instanceof Error ? error.message : 'The export could not be prepared. Please try again.'); }
    finally { setDownloading(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget && !downloading) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="export-preview-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Eye aria-hidden="true" className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 id="export-preview-title" className="truncate text-base font-bold text-slate-900">Preview {title}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{FORMAT_LABEL[format]} · {rows.length.toLocaleString()} records · {documentSize} page size{variant === 'trail' ? ' · Status trail included' : ''}</p>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={downloading} aria-label="Close export preview" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"><X aria-hidden="true" className="h-5 w-5" /></button>
        </header>

        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <p className="text-sm font-bold text-[#1F3864]">{meta.reportName}{meta.dateRange ? ` — ${meta.dateRange}` : ''}</p>
          {meta.dateBasis && <p className="mt-1 text-xs text-slate-500">Date basis: {meta.dateBasis}</p>}
          <p className="mt-1 text-xs text-slate-500">Prepared by {meta.generatedByName}{meta.generatedByRole ? ` (${meta.generatedByRole})` : ''}</p>
          {variant === 'trail' && statusHistoryCounts && (
            <p className="mt-2 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
              Status trail shows lifetime history for {statusHistoryCounts.total_records.toLocaleString()} records. A record may appear under multiple statuses it passed through.
            </p>
          )}
          {summary && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
            <span><strong className="text-slate-900">{summary.total.toLocaleString()}</strong> total records</span>
            <span><strong className="text-slate-900">{summary.overdueCount.toLocaleString()}</strong> overdue</span>
            <span><strong className="text-slate-900">{summary.statusBreakdown.length}</strong> status groups</span>
            {summary.totalAmountAC > 0 && <span><strong className="text-slate-900">₱{summary.totalAmountAC.toLocaleString()}</strong> amount to collect</span>}
          </div>}
        </div>

        {variant === 'trail' && statusHistoryCounts && <div className="shrink-0 border-b border-slate-100 px-5 py-2">
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Lifetime status summary</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] sm:grid-cols-4">
            {['Draft', 'Scheduled', 'In Transit', 'Delivered', 'Pending', 'On-Hold', 'Rescheduled'].map(status => <div key={status} className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate font-medium text-slate-700">{status}</span>
              <span className="shrink-0 text-slate-500">{statusHistoryCounts.ever_held[status] ?? 0} ever · {statusHistoryCounts.current[status] ?? 0} now</span>
            </div>)}
          </div>
        </div>}

        <div className={`min-h-0 flex-1 overflow-auto p-4 sm:p-5 ${variant === 'trail' ? 'min-h-[280px]' : ''}`}>
          {format === 'excel' && excelBlob ? <ExcelWorkbookPreview blob={excelBlob} /> : fileBlob && format === 'pdf' ? (artifactPreview?.url ? <iframe title={`Generated PDF preview: ${title}`} src={artifactPreview.url} className="h-full min-h-[32rem] w-full rounded-lg border border-slate-200 bg-slate-100" /> : <div className="flex h-full min-h-48 items-center justify-center text-sm text-slate-500">Preparing generated PDF preview…</div>) : fileBlob && format === 'csv' ? (artifactPreview?.text != null ? <CsvArtifactPreview text={artifactPreview.text} /> : <div className="flex h-full min-h-48 items-center justify-center text-sm text-slate-500">Loading generated CSV…</div>) : fileBlob && format === 'docx' ? (
            <div className="relative h-full min-h-[32rem] overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-4 sm:p-8">
              <div ref={docxHostRef} className="mx-auto w-fit min-w-full" />
              {!artifactPreview?.docxRendered && <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 text-sm text-slate-500">{artifactPreview?.error ?? 'Preparing Word page preview…'}</div>}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-slate-500">No records match this export.</div>
          ) : (
            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-max border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[#1F3864] text-white">
                  <tr>{columns.map(column => <th key={column.key} scope="col" className="whitespace-nowrap px-3 py-3 font-bold">{column.header}</th>)}</tr>
                </thead>
                <tbody>
                  {pageRows.map((row, rowIndex) => (
                    <tr key={`${page * PAGE_SIZE + rowIndex}`} className={rowIndex % 2 ? 'bg-slate-50' : 'bg-white'}>
                      {columns.map(column => <td key={column.key} className="max-w-72 border-t border-slate-100 px-3 py-2.5 text-slate-700">{row[column.key] == null ? '—' : String(row[column.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex min-h-11 items-center gap-2 text-xs text-slate-500">
            {format === 'excel' && excelBlob ? <span>Showing generated workbook sheets, values, merges, and cell formatting.</span> : fileBlob ? <span>Previewing the generated {FORMAT_LABEL[format]} file.</span> : rows.length > PAGE_SIZE && <>
              <button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)} aria-label="Previous preview page" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span>Rows {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length.toLocaleString()} · Page {page + 1} of {pageCount}</span>
              <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(value => value + 1)} aria-label="Next preview page" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </>}
            {!fileBlob && rows.length <= PAGE_SIZE && <span>{rows.length.toLocaleString()} record{rows.length === 1 ? '' : 's'} in preview</span>}
          </div>
          <div className="flex items-center gap-2">
            {downloadError && <p role="alert" className="mr-2 max-w-xs text-xs text-red-700">{downloadError}</p>}
            <button type="button" disabled={downloading} onClick={onClose} className="min-h-11 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            <button type="button" disabled={downloading} onClick={download} className="flex min-h-11 items-center gap-2 rounded-lg bg-[#1F3864] px-5 text-sm font-bold text-white hover:bg-[#172b4d] disabled:opacity-60">
              {downloading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="h-4 w-4" />}
              {downloading ? 'Preparing download…' : `Download ${FORMAT_LABEL[format]}`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
