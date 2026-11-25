import React, { useEffect, useId, useRef, useState } from 'react';
import { Download, XCircle } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';
import DocumentSizeSelect from '@/components/DocumentSizeSelect';
import type { ApiCompany } from '@/api';
import type { DeliveryRecord } from '@/types';
import type { DocumentSize } from '@/utils/documentSize';
import { DEFAULT_SLIP_DOCUMENT_SIZE, generateBulkRmaClientSlipsPdf, MAX_BULK_SLIP_RECORDS } from '@/utils/rmaClientSlipPdf';

export type BulkSlipScope = 'selected' | 'filtered';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Rows checked in the RMA table (may be empty). */
  selectedCount: number;
  /** Fresh, authorized copies of the checked records. */
  loadSelected: () => Promise<DeliveryRecord[]>;
  /** All records matching the current view filters for a delivery-date range (across pages). */
  loadFiltered: (dateFrom: string, dateTo: string) => Promise<DeliveryRecord[]>;
  defaultDateFrom: string;
  defaultDateTo: string;
  companies: ApiCompany[];
}

/**
 * Bulk RMA client slip extraction: one borderless Microgenesis slip per page
 * in a single PDF. Never includes internal notes or documentation trails.
 */
export default function BulkRmaSlipsDialog({ open, onClose, selectedCount, loadSelected, loadFiltered, defaultDateFrom, defaultDateTo, companies }: Props) {
  const fromId = useId();
  const toId = useId();
  const [scope, setScope] = useState<BulkSlipScope>(selectedCount > 0 ? 'selected' : 'filtered');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [documentSize, setDocumentSize] = useState<DocumentSize>(DEFAULT_SLIP_DOCUMENT_SIZE);
  const [groupByMovement, setGroupByMovement] = useState(true);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob; fileName: string; count: number; missing: number } | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setScope(selectedCount > 0 ? 'selected' : 'filtered');
    setDateFrom(defaultDateFrom);
    setDateTo(defaultDateTo);
    setError(null);
    setProgress(null);
  }, [open, selectedCount, defaultDateFrom, defaultDateTo]);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => () => controller.current?.abort(), []);

  const dismiss = () => {
    controller.current?.abort();
    setPending(false);
    onClose();
  };

  const extract = async () => {
    if (pending) return;
    if (scope === 'filtered' && dateFrom && dateTo && dateFrom > dateTo) { setError('The From date must be on or before the To date.'); return; }
    setPending(true);
    setError(null);
    controller.current = new AbortController();
    const signal = controller.current.signal;
    try {
      setProgress('Loading records…');
      const records = scope === 'selected' ? await loadSelected() : await loadFiltered(dateFrom, dateTo);
      if (signal.aborted) return;
      const slips = records.filter(record => record.category === 'RMA');
      if (!slips.length) throw new Error(scope === 'selected' ? 'Select at least one RMA record.' : 'No RMA records match the current filters and date range.');
      if (slips.length > MAX_BULK_SLIP_RECORDS) {
        throw new Error(`${slips.length} records match. Extract at most ${MAX_BULK_SLIP_RECORDS} slips at a time — narrow the date range or filters.`);
      }
      setProgress(`Preparing ${slips.length} slip${slips.length === 1 ? '' : 's'}…`);
      const output = await generateBulkRmaClientSlipsPdf(slips, {
        documentSize, groupByMovement, companies, signal,
        onProgress: (done, total) => setProgress(`Rendering slip ${done} of ${total}…`),
      });
      if (signal.aborted) return;
      const blob = output.doc.output('blob');
      const stamp = scope === 'filtered' && (dateFrom || dateTo) ? `${dateFrom || 'start'}_to_${dateTo || 'latest'}` : new Date().toISOString().slice(0, 10);
      setResult({ url: URL.createObjectURL(blob), blob, fileName: `rma-client-slips-${stamp}.pdf`, count: slips.length, missing: output.missingSignatureCount });
      onClose();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err instanceof Error ? err.message : 'Could not extract the slips. Please try again.');
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  const download = () => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(result.blob);
    link.download = result.fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <>
      <ActionDialog
        open={open}
        title="Extract Slips (PDF)"
        description="One client slip per page in a single PDF. Internal Logistics notes, workflow remarks and history are never included."
        confirmLabel="Extract PDF"
        pending={pending}
        error={error}
        onConfirm={() => void extract()}
        onDismiss={dismiss}
      >
        <fieldset className="mb-4 space-y-2" disabled={pending}>
          <legend className="mb-1 text-xs font-semibold text-slate-700">Records</legend>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="radio" name="bulk-slip-scope" className="mt-1" checked={scope === 'selected'} disabled={selectedCount === 0} onChange={() => setScope('selected')} />
            <span>Selected records <span className="text-slate-500">({selectedCount})</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="radio" name="bulk-slip-scope" className="mt-1" checked={scope === 'filtered'} onChange={() => setScope('filtered')} />
            <span>Current filters and delivery-date range</span>
          </label>
          {scope === 'filtered' && (
            <div className="ml-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor={fromId} className="block text-xs font-semibold text-slate-600">From</label>
                <input id={fromId} type="date" value={dateFrom} max={dateTo || undefined} onChange={event => setDateFrom(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label htmlFor={toId} className="block text-xs font-semibold text-slate-600">To</label>
                <input id={toId} type="date" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <p className="text-xs text-slate-500 sm:col-span-2">Up to {MAX_BULK_SLIP_RECORDS} slips per extraction.</p>
            </div>
          )}
        </fieldset>
        <DocumentSizeSelect value={documentSize} onChange={setDocumentSize} disabled={pending} orientationLabel="Portrait" />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={groupByMovement} disabled={pending} onChange={event => setGroupByMovement(event.target.checked)} />
          <span>
            Group &amp; sort by Movement Method
            <span className="block text-xs text-slate-500">Logistics Route → Supplier Collection → Internal Printing, then by RMA reference.</span>
          </span>
        </label>
        <p aria-live="polite" className="mt-3 min-h-[1rem] text-xs text-slate-600">{progress}</p>
      </ActionDialog>

      {result && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="Extracted slips preview">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-slate-900 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{result.fileName}</p>
                <p className="text-xs text-slate-400">
                  {result.count} slip{result.count === 1 ? '' : 's'}
                  {result.missing > 0 && ` · ${result.missing} issuer${result.missing === 1 ? ' has' : 's have'} no digital signature on file (printed name shown)`}
                </p>
              </div>
              <button type="button" onClick={() => setResult(null)} className="rounded p-2 hover:bg-white/10" aria-label="Close preview">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <iframe title="Extracted RMA client slips preview" src={result.url} className="min-h-0 flex-1 bg-white" />
            <div className="flex justify-center p-4">
              <button type="button" onClick={download}
                className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100">
                <Download className="h-4 w-4" /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
