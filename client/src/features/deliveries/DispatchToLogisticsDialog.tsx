import { useEffect, useId, useRef, useState } from 'react';
import { Download, Send } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';
import DocumentSizeSelect from '@/components/DocumentSizeSelect';
import { api, type ApiCompany, type ApiLogisticsRecipient, type ApiRmaLogisticsDispatch, type ApiRmaLogisticsDispatchResult, type RmaDispatchEmailStatus } from '@/api';
import type { DeliveryRecord } from '@/types';
import type { DocumentSize } from '@/utils/documentSize';
import { downloadBlob } from '@/utils/downloadBlob';
import { DEFAULT_SLIP_DOCUMENT_SIZE, generateBulkRmaClientSlipsPdf, MAX_BULK_SLIP_RECORDS } from '@/utils/rmaClientSlipPdf';
import {
  generateTassDailyRouteSlipBlob, manilaToday, rmaRouteSlipRecords, routeSlipDateStamp, routeSlipPeriodDates, sortTassRouteSlipRecords, tassRouteClientSlipsFileName,
} from '@/utils/tassDailyRouteSlip';
import { formatSlipDate } from '@/utils/rmaItems';

export type DispatchScope = 'selected' | 'filtered';
export const DEFAULT_DISPATCH_NOTE = 'Good afternoon. Attached are the TASS client slips and the Daily Route Slip for printing. Thank you.';
export const MAX_DISPATCH_NOTE = 1000;

interface Props {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  initialScope?: DispatchScope;
  loadSelected: () => Promise<DeliveryRecord[]>;
  loadFiltered: (dateFrom: string, dateTo: string, cap: number) => Promise<DeliveryRecord[]>;
  defaultDateFrom: string;
  defaultDateTo: string;
  companies: ApiCompany[];
  /** Builds the Client Slips PDF and DRR workbook; defaults to the real generators. */
  generateFiles?: DispatchFileGenerator;
}

export type DispatchFileGenerator = (records: DeliveryRecord[], options: { documentSize: DocumentSize; groupByMovement: boolean; companies: ApiCompany[] }) => Promise<{ pdf: Blob; xlsx: Blob }>;

export const generateDispatchFiles: DispatchFileGenerator = async (records, { documentSize, groupByMovement, companies }) => {
  const slips = await generateBulkRmaClientSlipsPdf(records, { documentSize, groupByMovement, companies });
  const { blob: xlsx } = await generateTassDailyRouteSlipBlob(records, { groupByMovement });
  return { pdf: slips.doc.output('blob'), xlsx };
};

/** Truthful email outcome labels: MOCKED and FAILED are never presented as sent. */
/**
 * Outcome dialog title and description (also the dialog's aria-describedby text).
 * Only a provider-accepted email is described as dispatched; unconfirmed, mocked,
 * skipped and failed outcomes never claim the slips were sent to the recipient.
 */
export function dispatchOutcomeCopy(
  dispatch: Pick<ApiRmaLogisticsDispatch, 'record_count' | 'dispatch_date' | 'recipient' | 'email_status' | 'in_app_notified'>,
  unconfirmed: boolean,
): { title: string; description: string } {
  const count = `${dispatch.record_count} RMA slip${dispatch.record_count === 1 ? '' : 's'} for ${formatSlipDate(dispatch.dispatch_date)}`;
  const target = dispatch.recipient.name;
  const notice = dispatch.in_app_notified ? `In-app notification recorded for ${target}` : `Handoff recorded for ${target}`;
  if (unconfirmed) {
    return { title: 'Dispatch Status Unconfirmed', description: `${notice} (${count}); email delivery status is still in progress or unconfirmed.` };
  }
  switch (dispatch.email_status) {
    case 'SENT':
      return { title: 'Dispatched to Logistics', description: `${count} accepted by the mail provider for ${target} and in-app notification delivered.` };
    case 'MOCKED':
      return { title: 'Dispatch Recorded (Email Mocked)', description: `${notice} (${count}); email was mocked on the server and not delivered by email.` };
    case 'SKIPPED':
      return { title: 'Dispatch Recorded (Email Skipped)', description: `${notice} (${count}); email was skipped because no deliverable email address is on file.` };
    case 'FAILED':
      return { title: 'Dispatch Recorded (Email Failed)', description: `${notice} (${count}), but email delivery failed. Download the backup files below.` };
  }
}

export const EMAIL_STATUS_COPY: Record<RmaDispatchEmailStatus, { label: string; className: string; detail: string }> = {
  SENT: { label: 'SENT', className: 'bg-emerald-50 text-emerald-800 border-emerald-200', detail: 'The email with both attachments was accepted by the mail provider.' },
  MOCKED: { label: 'MOCKED', className: 'bg-amber-50 text-amber-900 border-amber-200', detail: 'No live mail provider is configured, so the email was only logged on the server. Nothing was delivered by email.' },
  SKIPPED: { label: 'SKIPPED', className: 'bg-slate-100 text-slate-700 border-slate-200', detail: 'The coordinator has no deliverable email address; only the in-app notification was sent.' },
  FAILED: { label: 'FAILED', className: 'bg-red-50 text-red-800 border-red-200', detail: 'The email could not be delivered. Download the files below and send them another way.' },
};

export function EmailStatusBadge({ status, unconfirmed = false }: { status: RmaDispatchEmailStatus; unconfirmed?: boolean }) {
  // A stored FAILED that is only an unfinished reservation is never shown as a confirmed failure.
  if (unconfirmed) {
    return <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold tracking-wide text-amber-900">UNCONFIRMED</span>;
  }
  const copy = EMAIL_STATUS_COPY[status];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wide ${copy.className}`}>{copy.label}</span>;
}

/** Pre-send copy describes what will be attempted; live email delivery depends on server mail configuration. */
export const DISPATCH_PRESEND_DESCRIPTION = 'Send the Client Slips PDF and the Daily Route Slip (DRRMMDDYY.xlsx) to the Logistics coordinator printing today. They receive an in-app notification, and an email with both files when mail delivery is configured.';

/** Truthful in-app notification outcome: only a created notification uses the success style. */
export const IN_APP_STATUS_COPY = {
  delivered: { label: 'Delivered', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  notCreated: { label: 'Not created', className: 'bg-amber-50 text-amber-900 border-amber-200' },
} as const;

export function InAppStatusBadge({ notified }: { notified: boolean }) {
  const copy = notified ? IN_APP_STATUS_COPY.delivered : IN_APP_STATUS_COPY.notCreated;
  return <span data-testid="dispatch-in-app-status" className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${copy.className}`}>{copy.label}</span>;
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);

interface BackupFiles { pdf: Blob; xlsx: Blob; pdfFileName: string; xlsxFileName: string }
interface Outcome { result: ApiRmaLogisticsDispatchResult; pdf: Blob; xlsx: Blob; skippedDrafts: number }

/** TASS hands the day's Client Slips PDF + DRRMMDDYY.xlsx to the Logistics coordinator on printing duty. */
export default function DispatchToLogisticsDialog({
  open, onClose, selectedCount, initialScope, loadSelected, loadFiltered, defaultDateFrom, defaultDateTo, companies, generateFiles = generateDispatchFiles,
}: Props) {
  const fromId = useId(), toId = useId(), recipientId = useId(), noteId = useId();
  const [scope, setScope] = useState<DispatchScope>('filtered');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [recipients, setRecipients] = useState<ApiLogisticsRecipient[] | null>(null);
  const [recipient, setRecipient] = useState('');
  const [recent, setRecent] = useState<ApiRmaLogisticsDispatch[]>([]);
  const [documentSize, setDocumentSize] = useState<DocumentSize>(DEFAULT_SLIP_DOCUMENT_SIZE);
  const [groupByMovement, setGroupByMovement] = useState(true);
  const [note, setNote] = useState(DEFAULT_DISPATCH_NOTE);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Generated files survive a failed request so they can be downloaded as a backup.
  const [backupFiles, setBackupFiles] = useState<BackupFiles | null>(null);
  const idempotencyKey = useRef<string>(newKey());

  useEffect(() => {
    if (!open) return;
    setScope(initialScope ?? (selectedCount > 0 ? 'selected' : 'filtered'));
    setDateFrom(defaultDateFrom);
    setDateTo(defaultDateTo);
    setError(null);
    setProgress(null);
    setOutcome(null);
    setBackupFiles(null);
    idempotencyKey.current = newKey();
    let active = true;
    setRecipients(null);
    api.getRmaLogisticsRecipients()
      .then(data => { if (!active) return; setRecipients(data.recipients); setRecipient(current => data.recipients.some(r => r.id === current) ? current : data.recipients[0]?.id ?? ''); })
      .catch(err => { if (active) { setRecipients([]); setError(err instanceof Error ? err.message : 'Could not load Logistics coordinators.'); } });
    api.getRmaLogisticsDispatches({ date: manilaToday(), limit: 5 })
      .then(data => { if (active) setRecent(data.dispatches); })
      .catch(() => { if (active) setRecent([]); });
    return () => { active = false; };
  }, [open, initialScope, selectedCount, defaultDateFrom, defaultDateTo]);

  // A different dispatch intent (including an edited message note) gets a fresh key;
  // retrying the exact same intent reuses the existing key for safe deduplication.
  useEffect(() => {
    idempotencyKey.current = newKey();
    setBackupFiles(null);
  }, [scope, dateFrom, dateTo, recipient, groupByMovement, documentSize, note]);

  const dispatch = async () => {
    if (pending) return;
    if (!recipient) { setError('Choose the Logistics printing coordinator.'); return; }
    if (scope === 'filtered' && dateFrom && dateTo && dateFrom > dateTo) { setError('The From date must be on or before the To date.'); return; }
    if (note.length > MAX_DISPATCH_NOTE) { setError(`The message must be ${MAX_DISPATCH_NOTE} characters or fewer.`); return; }
    setPending(true);
    setError(null);
    try {
      setProgress('Loading records…');
      const loaded = rmaRouteSlipRecords(scope === 'selected' ? await loadSelected() : await loadFiltered(dateFrom, dateTo, MAX_BULK_SLIP_RECORDS));
      const drafts = loaded.filter(record => record.is_draft === 'Yes' || record.status === 'Draft');
      const records = sortTassRouteSlipRecords(loaded.filter(record => !drafts.includes(record)), { groupByMovement });
      if (!records.length) throw new Error(drafts.length ? 'Draft RMA records cannot be dispatched to Logistics. Submit them first.' : 'No RMA records match this dispatch.');
      if (records.length > MAX_BULK_SLIP_RECORDS) throw new Error(`${records.length} records match. Dispatch at most ${MAX_BULK_SLIP_RECORDS} at a time — narrow the date range or filters.`);
      const period = routeSlipPeriodDates(scope === 'filtered' ? { dateFrom, dateTo, records } : { records });
      const dispatchDate = period.from === period.to ? period.from : manilaToday();
      setProgress('Generating Client Slips PDF and DRRMMDDYY.xlsx…');
      const { pdf, xlsx } = await generateFiles(records, { documentSize, groupByMovement, companies });
      const pdfFileName = tassRouteClientSlipsFileName(dispatchDate);
      const xlsxFileName = `DRR${routeSlipDateStamp(dispatchDate)}.xlsx`;
      setBackupFiles({ pdf, xlsx, pdfFileName, xlsxFileName });
      setProgress('Dispatching to Logistics…');
      const form = new FormData();
      form.append('recipient_user_id', recipient);
      form.append('dispatch_date', dispatchDate);
      form.append('record_ids', JSON.stringify(records.map(record => record.id)));
      if (note.trim()) form.append('note', note.trim());
      form.append('idempotency_key', idempotencyKey.current);
      // The server ignores these names and assigns Tass_Route_MMDDYY.pdf / DRRMMDDYY.xlsx itself.
      form.append('client_slips', pdf, pdfFileName);
      form.append('route_slip', xlsx, xlsxFileName);
      const result = await api.dispatchRmaToLogistics(form);
      setOutcome({ result, pdf, xlsx, skippedDrafts: drafts.length });
      setRecent(current => [result.dispatch, ...current.filter(row => row.id !== result.dispatch.id)].slice(0, 5));
    } catch (err) {
      // backupFiles is intentionally kept: the generated files stay downloadable.
      setError(err instanceof Error ? err.message : 'Could not dispatch to Logistics. Please try again.');
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  const noRecipients = recipients !== null && recipients.length === 0;
  const dispatchInfo = outcome?.result.dispatch;
  const isUnconfirmed = Boolean(outcome?.result.outcome_unconfirmed || dispatchInfo?.outcome_unconfirmed);
  const outcomeCopy = outcome && dispatchInfo ? dispatchOutcomeCopy(dispatchInfo, isUnconfirmed) : null;

  return (
    <ActionDialog
      open={open}
      title={outcomeCopy ? outcomeCopy.title : 'Dispatch to Logistics'}
      description={outcomeCopy
        ? outcomeCopy.description
        : DISPATCH_PRESEND_DESCRIPTION}
      confirmLabel={outcome ? 'Close' : 'Dispatch'}
      icon={Send}
      size="lg"
      pending={pending}
      error={error}
      confirmDisabled={!recipient || noRecipients}
      onConfirm={outcome ? undefined : () => void dispatch()}
      onDismiss={() => { if (!pending) onClose(); }}
    >
      {outcome ? (
        <div className="space-y-3 text-sm" data-testid="dispatch-outcome">
          {isUnconfirmed && (
            <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" data-testid="dispatch-unconfirmed-warning">
              <p className="font-semibold">Email outcome not yet confirmed</p>
              <p className="mt-0.5">This dispatch is still in progress or its final email status has not been confirmed. Retrying did not resend the email. Check recent dispatches, verify with {dispatchInfo!.recipient.name}, or use the backup files below.</p>
            </div>
          )}
          {outcome.result.deduplicated && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">This dispatch was already recorded; no duplicate email or notification was sent.</p>}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <span className="font-semibold text-slate-700">In-app notification</span>
            <InAppStatusBadge notified={dispatchInfo!.in_app_notified} />
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-700">Email delivery</span>
              <EmailStatusBadge status={dispatchInfo!.email_status} unconfirmed={isUnconfirmed} />
            </div>
            {!isUnconfirmed && <p className="mt-1 text-xs text-slate-600">{EMAIL_STATUS_COPY[dispatchInfo!.email_status].detail}</p>}
            {dispatchInfo!.email_status === 'FAILED' && outcome.result.email_error
              && <p className={`mt-1 break-words text-xs ${isUnconfirmed ? 'text-amber-800' : 'text-red-700'}`}>Detail: {outcome.result.email_error}</p>}
          </div>
          {outcome.skippedDrafts > 0 && <p className="text-xs text-amber-800">{outcome.skippedDrafts} draft record{outcome.skippedDrafts === 1 ? ' was' : 's were'} skipped; submit drafts before dispatching them.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadBlob(outcome.pdf, dispatchInfo!.client_slips_file_name)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-3.5 w-3.5" /> {dispatchInfo!.client_slips_file_name}
            </button>
            <button type="button" onClick={() => downloadBlob(outcome.xlsx, dispatchInfo!.route_slip_file_name)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-3.5 w-3.5" /> {dispatchInfo!.route_slip_file_name}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor={recipientId} className="block text-xs font-semibold text-slate-700">Logistics printing coordinator</label>
            <select id={recipientId} value={recipient} disabled={pending || !recipients?.length} onChange={event => setRecipient(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {recipients === null && <option value="">Loading coordinators…</option>}
              {noRecipients && <option value="">No active Logistics coordinator available</option>}
              {recipients?.map(r => <option key={r.id} value={r.id}>{r.name} ({r.email})</option>)}
            </select>
            {noRecipients && <p className="mt-1 text-xs text-amber-800">No active Logistics coordinator with RMA access and an email address is available. Ask an Admin to check the Logistics accounts.</p>}
          </div>
          <fieldset className="space-y-2" disabled={pending}>
            <legend className="mb-1 text-xs font-semibold text-slate-700">Records</legend>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="radio" name="dispatch-scope" className="mt-1" checked={scope === 'selected'} disabled={selectedCount === 0} onChange={() => setScope('selected')} />
              <span>Selected records <span className="text-slate-500">({selectedCount})</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="radio" name="dispatch-scope" className="mt-1" checked={scope === 'filtered'} onChange={() => setScope('filtered')} />
              <span>Current filters and delivery-date range</span>
            </label>
            {scope === 'filtered' && (
              <div className="ml-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor={fromId} className="block text-xs font-semibold text-slate-600">From</label>
                  <input id={fromId} type="date" value={dateFrom} max={dateTo || undefined} onChange={event => setDateFrom(event.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor={toId} className="block text-xs font-semibold text-slate-600">To</label>
                  <input id={toId} type="date" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
              </div>
            )}
            <p className="text-xs text-slate-500">Up to {MAX_BULK_SLIP_RECORDS} submitted RMA records; drafts are skipped.</p>
          </fieldset>
          <DocumentSizeSelect value={documentSize} onChange={setDocumentSize} disabled={pending} orientationLabel="Portrait" />
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={groupByMovement} disabled={pending} onChange={event => setGroupByMovement(event.target.checked)} />
            <span>Group &amp; sort by Movement Method<span className="block text-xs text-slate-500">Applied to both the PDF and the Daily Route Slip.</span></span>
          </label>
          <div>
            <label htmlFor={noteId} className="block text-xs font-semibold text-slate-700">Message to Logistics (optional)</label>
            <textarea id={noteId} value={note} maxLength={MAX_DISPATCH_NOTE} rows={3} disabled={pending} onChange={event => setNote(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <p className="text-right text-[11px] text-slate-400">{note.length}/{MAX_DISPATCH_NOTE}</p>
          </div>
          {recent.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-700">Today&apos;s dispatches</p>
              <ul className="mt-1 space-y-1">
                {recent.map(row => (
                  <li key={row.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    <span className="truncate">{new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {row.recipient.name} · {row.record_count} record{row.record_count === 1 ? '' : 's'}</span>
                    <EmailStatusBadge status={row.email_status} unconfirmed={Boolean(row.outcome_unconfirmed)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && backupFiles && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950" data-testid="dispatch-error-backup">
              <p className="font-semibold">Local backup files ready</p>
              <p className="mt-0.5 text-amber-900">Both files were already generated. You can download them now as a backup while resolving the error below.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadBlob(backupFiles.pdf, backupFiles.pdfFileName)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-amber-100/60">
                  <Download className="h-3.5 w-3.5" /> {backupFiles.pdfFileName}
                </button>
                <button type="button" onClick={() => downloadBlob(backupFiles.xlsx, backupFiles.xlsxFileName)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-amber-100/60">
                  <Download className="h-3.5 w-3.5" /> {backupFiles.xlsxFileName}
                </button>
              </div>
            </div>
          )}
          <p aria-live="polite" className="min-h-[1rem] text-xs text-slate-600">{progress}</p>
        </div>
      )}
    </ActionDialog>
  );
}
