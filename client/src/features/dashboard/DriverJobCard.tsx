import { useState } from 'react';
import { CheckCircle, Clock, Copy, MapPin, Package, UserCheck } from 'lucide-react';
import RecordStatus from '@/components/RecordStatus';
import PodUploader from '@/components/PodUploader';
import type { DeliveryRecord } from '@/types';
import type { PodReadiness } from '@/utils/podRequirement';
import { dashboardRunDaysLate } from '@/utils/recordLifecycle';
import { driverCompletionError, driverJobActions, jobStartedAt, jobTypeLabel, RECEIVED_BY_MAX_LENGTH } from '@/utils/driverJobs';
import { notify } from '@/utils/notify';
import { formatDate } from './ui';

export const NO_REFERENCE = 'No reference yet';

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
}

/** The reference a driver can quote to the office. Never the internal record id. */
export function referenceFor(rec: Pick<DeliveryRecord, 'category' | 'reference' | 'rma_reference'>): string | null {
  const value = rec.category === 'RMA' ? rec.rma_reference || rec.reference : rec.reference;
  return value?.trim() || null;
}

export function dueLabel(date: string | null | undefined): string {
  return date ? `Due ${formatDate(date)}` : 'Due date not set';
}

/** Same look for every job type; only the text changes. */
export function JobTypeBadge({ category }: { category: DeliveryRecord['category'] }) {
  return <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700" data-job-type>{jobTypeLabel(category)}</span>;
}

export function CustomerName({ name }: { name: string }) {
  return <p className="line-clamp-2 break-words text-base font-semibold leading-snug text-slate-900" title={name} data-customer-name>{name}</p>;
}

/** One-line reference. Tapping it copies the full value when `copyable`. */
export function RecordReference({ value, copyable = false }: { value: string | null; copyable?: boolean }) {
  if (!value) return <p className="text-xs text-slate-500" data-record-reference>{NO_REFERENCE}</p>;
  const text = <>
    <span className="shrink-0 text-slate-400">Ref</span>
    <span className="min-w-0 truncate tabular-nums text-slate-600">{value}</span>
  </>;
  if (!copyable) return <p className="flex min-w-0 items-center gap-1.5 text-xs" title={value} data-record-reference>{text}</p>;
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      notify.success('Reference copied');
    } catch {
      notify.error('Could not copy the reference');
    }
  };
  return <button type="button" onClick={() => { void copy(); }} title={value} aria-label={`Copy reference ${value}`} data-record-reference
    className="-my-2 flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-md text-left text-xs hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]">
    {text}
    <Copy aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
  </button>;
}

const CLAMP_AT = 80;

/** Two lines at most, with a toggle to read the rest. */
export function ClampedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > CLAMP_AT;
  return <span className="min-w-0 break-words">
    <span className={long && !expanded ? 'line-clamp-2' : undefined} data-clamped={long && !expanded ? 'true' : undefined}>{text}</span>
    {long && <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0078C1] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]">
      {expanded ? 'Show less' : 'Show more'}
    </button>}
  </span>;
}

export interface DriverJobCardProps {
  record: DeliveryRecord;
  today: string;
  saving: boolean;
  receivedBy: string;
  pod?: PodReadiness;
  onReceivedByChange: (value: string) => void;
  onPodReadinessChange: (recordId: string, readiness: PodReadiness) => void;
  onStart: (record: DeliveryRecord) => void;
  onComplete: (record: DeliveryRecord) => void;
}

/**
 * One card for every job a Driver is assigned: Delivery, RMA, Procurement Pickup,
 * Sales Order and Accounting Collection. Drivers can only start transport and
 * complete; Pending and Reschedule belong to Logistics.
 */
export default function DriverJobCard({ record, today, saving, receivedBy, pod, onReceivedByChange, onPodReadinessChange, onStart, onComplete }: DriverJobCardProps) {
  const typeLabel = jobTypeLabel(record.category);
  const reference = referenceFor(record);
  const daysLate = dashboardRunDaysLate(record, today);
  const actions = driverJobActions(record);
  const startedAt = jobStartedAt(record);
  const completionError = actions.complete ? driverCompletionError(receivedBy, pod) : null;
  const receivedById = `received-by-${record.id}`;
  return <article
    aria-label={`Active ${typeLabel.toLowerCase()} ${reference ?? NO_REFERENCE.toLowerCase()}, ${record.company_name}`}
    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    data-driver-job-card={typeLabel}
  >
    <div className="space-y-1.5 border-b border-slate-100 bg-white px-4 py-3" data-card-header>
      <div className="flex flex-wrap items-center gap-1.5" data-card-badges>
        <JobTypeBadge category={record.category} />
        <RecordStatus record={record} compact />
      </div>
      <CustomerName name={record.company_name} />
      <RecordReference value={reference} copyable />
    </div>

    <div className="space-y-3 px-4 py-3">
      <ul className="space-y-1.5 text-sm text-slate-600" aria-label="Run details">
        <li className="flex min-w-0 items-start gap-2"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /><span className="min-w-0 break-words">{record.area || 'Area not set'}</span></li>
        <li className={`flex min-w-0 items-start gap-2 ${daysLate > 0 ? 'font-semibold text-rose-700' : ''}`} data-due-date>
          <Clock aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${daysLate > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          <span>{dueLabel(record.delivery_date)}{daysLate > 0 && ` · ${daysLate} day${daysLate === 1 ? '' : 's'} late`}</span>
        </li>
        {record.item_description && <li className="flex min-w-0 items-start gap-2"><Package aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><ClampedText text={record.item_description} /></li>}
      </ul>

      <div className="space-y-2.5 border-t border-slate-100 pt-3" data-driver-actions>
        {!startedAt ? <>
          <button
            type="button"
            onClick={() => onStart(record)}
            aria-label="Start transport"
            disabled={saving || !actions.start}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0078C1] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1F3864] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Clock aria-hidden="true" className="h-4 w-4" /> Start transport
          </button>
          {!actions.start && actions.start_blocked_reason && <p className="text-xs text-slate-600" data-start-blocked>{actions.start_blocked_reason}</p>}
        </> : <>
          <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
            <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-500" />Transport started: {fmtTime(startedAt)}
          </div>

          <PodUploader recordId={record.id} required disabled={saving || !actions.complete} onReadinessChange={onPodReadinessChange} />

          <div className="space-y-1">
            <label htmlFor={receivedById} className="flex items-center gap-1 text-sm font-semibold text-slate-700">
              <UserCheck aria-hidden="true" className="h-3.5 w-3.5" />Received by *
            </label>
            <input
              id={receivedById}
              type="text"
              value={receivedBy}
              maxLength={RECEIVED_BY_MAX_LENGTH}
              disabled={saving || !actions.complete}
              onChange={event => onReceivedByChange(event.target.value)}
              placeholder="Name of person who received the item…"
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0078C1] focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 disabled:bg-slate-50 sm:text-sm"
            />
          </div>

          {completionError && <p className="text-xs text-slate-600" data-completion-hint>{completionError}</p>}
          {!actions.complete && record.status === 'On-Hold' && <p className="text-xs text-slate-600">On hold. Contact Logistics.</p>}
          <button
            type="button"
            onClick={() => onComplete(record)}
            disabled={saving || !actions.complete || !!completionError}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] disabled:cursor-not-allowed disabled:opacity-50"
          ><CheckCircle aria-hidden="true" className="h-4 w-4" />Complete delivery</button>
        </>}
      </div>
    </div>
  </article>;
}
