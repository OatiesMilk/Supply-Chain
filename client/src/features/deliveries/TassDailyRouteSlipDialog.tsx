import { useEffect, useId, useRef, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';
import ExportPreviewDialog from '@/components/ExportPreviewDialog';
import type { DeliveryRecord } from '@/types';
import { downloadBlob } from '@/utils/downloadBlob';
import {
  generateTassDailyRouteSlipBlob, MAX_ROUTE_SLIP_RECORDS, rmaRouteSlipRecords, routeSlipMovementCounts, sortTassRouteSlipRecords,
  TASS_DAILY_ROUTE_SLIP_HEADERS, tassDailyRouteSlipFileName, type RouteSlipMovementFilter,
} from '@/utils/tassDailyRouteSlip';

export type RouteSlipScope = 'selected' | 'filtered';

interface Props {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  /** Scope chosen when the dialog opens (the bulk bar pre-selects "selected"). */
  initialScope?: RouteSlipScope;
  loadSelected: () => Promise<DeliveryRecord[]>;
  /** Records matching the current view filters for a delivery-date range, stopping one past `cap`. */
  loadFiltered: (dateFrom: string, dateTo: string, cap: number) => Promise<DeliveryRecord[]>;
  defaultDateFrom: string;
  defaultDateTo: string;
  generatedByName: string;
  generatedByRole: string;
}

interface Generated { blob: Blob; fileName: string; rows: Record<string, string>[]; counts: ReturnType<typeof routeSlipMovementCounts> }

/** Clean 11-column TASS Daily Route Slip (DRRMMDDYY.xlsx) with live workbook preview. */
export default function TassDailyRouteSlipDialog({
  open, onClose, selectedCount, initialScope, loadSelected, loadFiltered, defaultDateFrom, defaultDateTo, generatedByName, generatedByRole,
}: Props) {
  const fromId = useId();
  const toId = useId();
  const movementId = useId();
  const [scope, setScope] = useState<RouteSlipScope>('filtered');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [groupByMovement, setGroupByMovement] = useState(true);
  const [movementFilter, setMovementFilter] = useState<RouteSlipMovementFilter>('ALL');
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!open) return;
    setScope(initialScope ?? (selectedCount > 0 ? 'selected' : 'filtered'));
    setDateFrom(defaultDateFrom);
    setDateTo(defaultDateTo);
    setError(null);
    setProgress(null);
    cancelled.current = false;
  }, [open, initialScope, selectedCount, defaultDateFrom, defaultDateTo]);

  const dismiss = () => { cancelled.current = true; setPending(false); onClose(); };

  const generate = async () => {
    if (pending) return;
    if (scope === 'filtered' && dateFrom && dateTo && dateFrom > dateTo) { setError('The From date must be on or before the To date.'); return; }
    setPending(true);
    setError(null);
    cancelled.current = false;
    try {
      setProgress('Loading records…');
      const loaded = scope === 'selected' ? await loadSelected() : await loadFiltered(dateFrom, dateTo, MAX_ROUTE_SLIP_RECORDS);
      if (cancelled.current) return;
      const ordered = sortTassRouteSlipRecords(rmaRouteSlipRecords(loaded), { groupByMovement, movementFilter });
      if (!ordered.length) throw new Error(scope === 'selected' ? 'Select at least one RMA record.' : 'No RMA records match the current filters and date range.');
      if (ordered.length > MAX_ROUTE_SLIP_RECORDS) throw new Error(`${ordered.length} records match. Export at most ${MAX_ROUTE_SLIP_RECORDS} at a time — narrow the date range or filters.`);
      setProgress('Generating Daily Route Slip…');
      const { blob, rows } = await generateTassDailyRouteSlipBlob(ordered, { groupByMovement, movementFilter });
      if (cancelled.current) return;
      const fileName = tassDailyRouteSlipFileName(scope === 'filtered' ? { dateFrom, dateTo, records: ordered } : { records: ordered });
      setGenerated({ blob, fileName, rows: rows.map(row => ({ ...row.values })), counts: routeSlipMovementCounts(ordered) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the Daily Route Slip. Please try again.');
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  return (
    <>
      <ActionDialog
        open={open}
        title="Daily Route Slip (DRR)"
        description="Clean 11-column DRRMMDDYY.xlsx for Logistics: RMA rows only, no extra columns, and a FOR INTERNAL USE ONLY footer."
        confirmLabel="Generate & preview"
        icon={FileSpreadsheet}
        size="lg"
        pending={pending}
        error={error}
        onConfirm={() => void generate()}
        onDismiss={dismiss}
      >
        <fieldset className="mb-4 space-y-2" disabled={pending}>
          <legend className="mb-1 text-xs font-semibold text-slate-700">Records</legend>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="radio" name="tass-route-slip-scope" className="mt-1" checked={scope === 'selected'} disabled={selectedCount === 0} onChange={() => setScope('selected')} />
            <span>Selected records <span className="text-slate-500">({selectedCount})</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="radio" name="tass-route-slip-scope" className="mt-1" checked={scope === 'filtered'} onChange={() => setScope('filtered')} />
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
              <p className="text-xs text-slate-500 sm:col-span-2">Up to {MAX_ROUTE_SLIP_RECORDS} records per Daily Route Slip.</p>
            </div>
          )}
        </fieldset>
        <div className="mb-3">
          <label htmlFor={movementId} className="block text-xs font-semibold text-slate-700">Movements</label>
          <select id={movementId} value={movementFilter} disabled={pending} onChange={event => setMovementFilter(event.target.value as RouteSlipMovementFilter)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="ALL">All matching movements</option>
            <option value="LOGISTICS_TRANSPORT">Logistics Route only</option>
          </select>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={groupByMovement} disabled={pending} onChange={event => setGroupByMovement(event.target.checked)} />
          <span>
            Group &amp; sort by Movement Method
            <span className="block text-xs text-slate-500">Logistics Route → Supplier Collection → Internal Printing, then by delivery date and reference.</span>
          </span>
        </label>
        <p aria-live="polite" className="mt-3 min-h-[1rem] text-xs text-slate-600">{progress}</p>
      </ActionDialog>

      {generated && (
        <ExportPreviewDialog
          format="excel"
          variant="current"
          rows={generated.rows}
          columns={TASS_DAILY_ROUTE_SLIP_HEADERS.map(header => ({ header, key: header }))}
          meta={{
            reportName: generated.fileName,
            dateRange: `Logistics Route ${generated.counts.logistics} · Supplier Collection ${generated.counts.supplier} · Internal Printing ${generated.counts.internal}`,
            generatedByName, generatedByRole,
          }}
          title={`Daily Route Slip ${generated.fileName}`}
          documentSize="a4"
          excelBlob={generated.blob}
          onClose={() => setGenerated(null)}
          onDownload={async () => downloadBlob(generated.blob, generated.fileName)}
        />
      )}
    </>
  );
}
