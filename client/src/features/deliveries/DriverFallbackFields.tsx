import { ChevronDown, ChevronUp, ClipboardEdit } from 'lucide-react';
import type { DeliveryRecord, DeliveryStatus } from '@/types';
import { formatManilaTimestamp } from '@/utils/manilaTimestamp';
import { workflowFieldHintClass, workflowFieldLabelClass, workflowInputClass } from './WorkflowSection';

export interface DriverFallbackFieldsProps {
  idPrefix: string;
  record: Pick<DeliveryRecord, 'id' | 'status' | 'received_by' | 'time_in' | 'time_out'>;
  selectedStatus: DeliveryStatus;
  receivedBy: string;
  onReceivedByChange: (value: string) => void;
  timeIn: string;
  onTimeInChange: (value: string) => void;
  timeOut: string;
  onTimeOutChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  transportHandedOff: boolean;
  canComplete: boolean;
  canTimeIn: boolean;
  hasFallbackChanges: boolean;
}

/**
 * Collapsible driver-fallback inputs (Received By, Time In, Time Out) inside Status & Actions.
 * Collapsed by default so normal driver/assistant assignment stays uncluttered, and
 * auto-expanded whenever Logistics selects "Complete transport" or already has unsaved edits.
 */
export function DriverFallbackFields({
  idPrefix,
  record,
  selectedStatus,
  receivedBy,
  onReceivedByChange,
  timeIn,
  onTimeInChange,
  timeOut,
  onTimeOutChange,
  open,
  onOpenChange,
  saving,
  transportHandedOff,
  canComplete,
  canTimeIn,
  hasFallbackChanges,
}: DriverFallbackFieldsProps) {
  const forcedOpen = selectedStatus === 'Delivered' && record.status !== 'Delivered';
  const canEditAny = !transportHandedOff && (canComplete || canTimeIn);
  const isExpanded = canEditAny && (open || forcedOpen || hasFallbackChanges);
  const requiresReceivedBy = selectedStatus === 'Delivered' || record.status === 'Delivered';

  const summaryParts: string[] = [];
  if (record.received_by?.trim()) summaryParts.push(`Received by: ${record.received_by.trim()}`);
  if (record.time_in) summaryParts.push(`Time In: ${formatManilaTimestamp(record.time_in)}`);
  if (record.time_out) summaryParts.push(`Time Out: ${formatManilaTimestamp(record.time_out)}`);
  const hasRecordedValues = summaryParts.length > 0;

  if (!isExpanded) {
    return (
      <div className="border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs font-semibold text-slate-700">Driver completion details</p>
            {hasRecordedValues ? (
              <p className="text-xs text-slate-600">{summaryParts.join(' · ')}</p>
            ) : (
              <p className="text-xs text-slate-500">
                {transportHandedOff
                  ? 'Handoff timestamps and recipient are locked while Sales reviews the proof.'
                  : 'Usually recorded by the driver. Only use if the driver cannot finish this run in the app.'}
              </p>
            )}
          </div>
          {canEditAny && (
            <button
              type="button"
              aria-expanded="false"
              disabled={saving}
              onClick={() => onOpenChange(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ClipboardEdit aria-hidden="true" className="h-3.5 w-3.5" />
              {hasRecordedValues ? 'Edit driver completion details' : 'Enter driver completion details'}
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const canCollapse = !forcedOpen && !hasFallbackChanges;

  return (
    <div className="border-t border-slate-100 pt-3">
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-800">Driver completion details</p>
            <p className={workflowFieldHintClass}>
              {forcedOpen
                ? 'Required to complete transport on behalf of the driver.'
                : 'Use when the driver cannot finish this run in the app, or to correct recorded timestamps.'}
            </p>
          </div>
          {canCollapse && (
            <button
              type="button"
              aria-expanded="true"
              disabled={saving}
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:opacity-50"
            >
              Hide
              <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-received-by`} className={workflowFieldLabelClass}>
            Received By{' '}
            {requiresReceivedBy
              ? <span className="text-red-600">*</span>
              : <span className="font-normal text-slate-500">(required when completing transport)</span>}
          </label>
          <input
            id={`${idPrefix}-received-by`}
            type="text"
            value={receivedBy}
            disabled={saving || transportHandedOff || !canComplete}
            onChange={e => onReceivedByChange(e.target.value)}
            placeholder="Name of receiver (if any)"
            className={workflowInputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-time-in`} className={workflowFieldLabelClass}>Time In (Manila)</label>
            <input
              id={`${idPrefix}-time-in`}
              type="datetime-local"
              value={timeIn}
              disabled={!record.time_in || saving || transportHandedOff || !canTimeIn}
              onChange={e => onTimeInChange(e.target.value)}
              className={workflowInputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-time-out`} className={workflowFieldLabelClass}>Time Out (Manila)</label>
            <input
              id={`${idPrefix}-time-out`}
              type="datetime-local"
              value={timeOut}
              disabled={!record.time_out || saving || transportHandedOff || !canComplete}
              onChange={e => onTimeOutChange(e.target.value)}
              className={workflowInputClass}
            />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Time In starts the run; Time Out is saved automatically at transport handoff. Existing timestamps can be corrected above with remarks, using Manila time.
        </p>
      </div>
    </div>
  );
}
