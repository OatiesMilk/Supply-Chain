import { RecordStatusProgress } from '@/components/RecordStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import type { DeliveryRecord, DeliveryStatus, UserRole } from '@/types';
import { VEHICLES } from '@/data';
import NextStepCard from './NextStepCard';
import MarkDeliveredDialog, { type CompletionValues } from './MarkDeliveredDialog';
import StartTransportDialog from './StartTransportDialog';
import { START_LABEL, completionLabels, recordingForLine } from '@/utils/completionDialog';
import { useWorkspaceDraft } from './WorkspaceDrafts';
import { useDriversQuery } from '@/api/queries/useDriversQuery';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { invalidateOperationalQueries, normalizeApiRecord, saveRecordToCache, useRecordDetailQuery } from '@/api/queries/useRecordsQuery';
import { operationalSyncOptions } from '@/api/queries/operationalSync';
import { RMA_MOVEMENT_LABELS, rmaLogisticsTransportNotice } from '@/utils/rmaTransport';
import { formatManilaTimestamp } from '@/utils/manilaTimestamp';
import { manilaDateTimeInput, manilaInputToIso, manilaToday } from '@/utils/recordLifecycle';
import { rankDriversByCoverage } from '@/utils/driverCoverage';
import { notify } from '@/utils/notify';
import { ActionDialog } from '@/components/ActionDialog';
import { Check, ChevronDown, ChevronUp, CircleAlert, CircleCheck, ClipboardEdit, Loader2, Save } from 'lucide-react';
import { WorkflowSection, workflowFieldHintClass, workflowFieldLabelClass, workflowInputClass, workflowPrimaryButtonClass, workflowSecondaryButtonClass, workflowSelectClass } from './WorkflowSection';

type Action = 'assign' | 'receive' | 'complete' | 'status' | 'correct-transport';

/** Manila calendar day (YYYY-MM-DD) of a saved timestamp. */
const manilaDayOf = (value?: string | null) => value ? manilaToday(new Date(value)) : null;
/** Inline validation for the editable receipt/completion dates (the server re-validates). */
export function rmaEventDateError(value: string, label: string, today: string, min: string | null, minMessage: string): string | null {
  if (!value) return `${label} is required.`;
  if (value > today) return `${label} cannot be in the future.`;
  if (min && value < min) return minMessage;
  return null;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
    <dt className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
    <dd className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</dd>
  </div>;
}

/** Shared transport/receipt UI. Each write keeps the version visible when editing
 * started, so a background refresh cannot silently bless stale form values. */
export default function RmaWorkflowPanel({ record: initialRecord, currentUserRole, embedded = false }: {
  record: DeliveryRecord; currentUserRole: UserRole; embedded?: boolean;
}) {
  const access = usePermissions();
  const id = useId();
  const client = useQueryClient();
  const detail = useRecordDetailQuery(initialRecord);
  const record = detail.data ?? initialRecord;
  const capabilities = useQuery({
    queryKey: ['records', 'rma-capabilities', record.id],
    queryFn: () => api.getRmaCapabilities(record.id),
    ...operationalSyncOptions,
  });
  const allowed = capabilities.data;
  const submitted = record.is_draft !== 'Yes' && record.status !== 'Draft';
  const finished = record.status === 'Delivered';
  const internalTransport = record.rma_movement === 'LOGISTICS_TRANSPORT';
  const awaitingTransport = internalTransport && record.rma_transport_status !== 'COMPLETED';
  const caps = allowed ? {
    assign: access.canRecord('RMA', 'ASSIGN') && allowed.assign && submitted && !finished && awaitingTransport && !record.rma_received_at && (currentUserRole === 'Logistics' || currentUserRole === 'Admin'),
    transport: access.canRecord('RMA', 'STATUS') && allowed.transport && submitted && !finished && awaitingTransport && (currentUserRole === 'Driver' || currentUserRole === 'Logistics'),
    receive: access.canRecord('RMA', 'RECEIVE') && allowed.receive && submitted && !finished && !!record.rma_movement && !awaitingTransport && !record.rma_received_at && currentUserRole === 'TASS',
    complete: access.canRecord('RMA', 'COMPLETE') && allowed.complete && submitted && !finished && !awaitingTransport && !!record.rma_received_at && currentUserRole === 'TASS',
    pod: access.canRecord('RMA', 'POD') && allowed.pod && submitted && !finished && internalTransport
      && record.rma_transport_status === 'IN_TRANSIT' && (currentUserRole === 'Driver' || currentUserRole === 'Logistics'),
    status: access.canRecord('RMA', 'STATUS') && allowed.status && !finished && (currentUserRole === 'TASS' || currentUserRole === 'Admin'),
    correctTransport: access.canRecord('RMA', 'ASSIGN')
      && Boolean(allowed.correctTransport)
      && submitted && finished && internalTransport
      && record.rma_transport_status === 'COMPLETED'
      && currentUserRole === 'Logistics',
  } : undefined;
  const directory = useDriversQuery(caps?.assign === true);
  const { readiness } = usePodAttachments(record.id);
  const [driverId, setDriverId] = useState(record.driver_id ?? '');
  const [vehicle, setVehicle] = useState(record.vehicle || '(None)');
  const [assistants, setAssistants] = useState(record.driver_assistants ?? []);
  const [dialog, setDialog] = useState<'start' | 'complete' | null>(null);
  const [dialogVersion, setDialogVersion] = useState(0);
  const [cardFocus, setCardFocus] = useState(0);
  const [nextStatus, setNextStatus] = useState<DeliveryStatus | ''>('');
  const [transportReceivedBy, setTransportReceivedBy] = useState(record.rma_transport_received_by ?? '');
  const [transportStartedAt, setTransportStartedAt] = useState(manilaDateTimeInput(record.rma_transport_started_at));
  const [transportCompletedAt, setTransportCompletedAt] = useState(manilaDateTimeInput(record.rma_transport_completed_at));
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editVersion, setEditVersion] = useState(record.rma_version ?? 0);
  const [feedback, setFeedback] = useState('');
  // Status changes carry their own reason, separate from the receipt and completion steps (#347).
  const [statusRemarks, setStatusRemarks] = useState('');
  const [confirmComplete, setConfirmComplete] = useState(false);
  const version = record.rma_version ?? 0;
  // rma_version only increases; an edit is stale only when the record moved past the version editing is based on.
  const staleForm = dirty && version > editVersion;
  // TASS records the actual date the signed slip / item came back, not who signed it.
  const today = manilaToday();
  const transportCompletedDate = internalTransport ? manilaDayOf(record.rma_transport_completed_at) : null;
  const receivedDateMin = manilaDayOf(record.rma_received_at);
  // Both event dates default to today (Manila); the receipt date is the lower bound for completion.
  const [receiptDate, setReceiptDate] = useState(today);
  const [completionDate, setCompletionDate] = useState(today);
  const receiptDateError = rmaEventDateError(receiptDate, 'Receipt date', today, transportCompletedDate,
    'Receipt date cannot be earlier than the transport completion date.');
  const completionDateError = rmaEventDateError(completionDate, 'Completion date', today, receivedDateMin,
    'Completion date cannot be earlier than the receipt date.');
  const resetEventDates = () => { setReceiptDate(manilaToday()); setCompletionDate(manilaToday()); };

  const savedTransportReceivedBy = record.rma_transport_received_by ?? '';
  const savedTransportStartedAt = manilaDateTimeInput(record.rma_transport_started_at);
  const savedTransportCompletedAt = manilaDateTimeInput(record.rma_transport_completed_at);
  const receivedByChanged = transportReceivedBy.trim() !== savedTransportReceivedBy.trim();
  const startedAtChanged = Boolean(record.rma_transport_started_at) && transportStartedAt !== savedTransportStartedAt;
  const completedAtChanged = Boolean(record.rma_transport_completed_at) && transportCompletedAt !== savedTransportCompletedAt;
  const hasCorrectionChanges = receivedByChanged || startedAtChanged || completedAtChanged;
  const correctionValidationError = (() => {
    if (receivedByChanged && !transportReceivedBy.trim()) return 'Transport Received By is required.';
    if (receivedByChanged && transportReceivedBy.trim().length > 120) return 'Transport Received By must be 120 characters or fewer.';
    if (startedAtChanged && !transportStartedAt) return 'Transport Started is required.';
    if (completedAtChanged && !transportCompletedAt) return 'Transport Completed is required.';
    const nextStartIso = startedAtChanged && transportStartedAt ? manilaInputToIso(transportStartedAt) : record.rma_transport_started_at;
    const nextEndIso = completedAtChanged && transportCompletedAt ? manilaInputToIso(transportCompletedAt) : record.rma_transport_completed_at;
    if (nextStartIso && nextEndIso && Date.parse(nextEndIso) < Date.parse(nextStartIso)) {
      return 'Transport Completed must be after Transport Started.';
    }
    return null;
  })();

  useEffect(() => {
    setCorrectionOpen(false);
  }, [record.id]);

  useEffect(() => {
    if (dirty) return;
    setDriverId(record.driver_id ?? '');
    setVehicle(record.vehicle || '(None)');
    setAssistants(record.driver_assistants ?? []);
    setTransportReceivedBy(record.rma_transport_received_by ?? '');
    setTransportStartedAt(manilaDateTimeInput(record.rma_transport_started_at));
    setTransportCompletedAt(manilaDateTimeInput(record.rma_transport_completed_at));
    setCompletionDate(manilaToday());
    setEditVersion(version);
  }, [record.id, version, record.driver_id, record.vehicle, record.driver_assistants, record.rma_transport_received_by, record.rma_transport_started_at, record.rma_transport_completed_at, record.rma_received_at, dirty]);
  const beginEdit = () => {
    if (!dirty) setEditVersion(version);
    setDirty(true);
    setFeedback('');
  };
  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      const permission = action === 'assign' ? caps?.assign : action === 'receive' ? caps?.receive : action === 'status' ? caps?.status : action === 'correct-transport' ? caps?.correctTransport : caps?.complete;
      if (!permission) throw new Error('This action is no longer available for your account.');
      // Defensive: every control is already disabled while stale, including the open Complete confirmation (#347 QA run 1, finding 3).
      if (staleForm) throw new Error('This RMA changed while you were editing. Review the latest saved values before retrying.');
      const reason = (action === 'status' ? statusRemarks : remarks).trim();
      const precondition = { expected_version: dirty ? editVersion : version, remarks: reason };
      if (!precondition.remarks) throw new Error(action === 'status' ? 'Enter a status change reason before saving.' : 'Enter remarks before saving.');
      if (action === 'assign') return api.assignRma(record.id, {
        ...precondition, driver_id: driverId || null, vehicle,
        driver_assistants: assistants,
      });
      if (action === 'correct-transport') {
        if (correctionValidationError) throw new Error(correctionValidationError);
        const payload: Parameters<typeof api.correctRmaTransport>[1] = { ...precondition };
        if (receivedByChanged) payload.transport_received_by = transportReceivedBy.trim();
        if (startedAtChanged) payload.transport_started_at = manilaInputToIso(transportStartedAt);
        if (completedAtChanged) payload.transport_completed_at = manilaInputToIso(transportCompletedAt);
        if (payload.transport_received_by === undefined && payload.transport_started_at === undefined && payload.transport_completed_at === undefined) {
          throw new Error('Change at least one transport detail before saving.');
        }
        return api.correctRmaTransport(record.id, payload);
      }
      if (action === 'status') {
        if (!nextStatus) throw new Error('Select an RMA status.');
        return api.patchStatus(record.id, nextStatus, precondition.remarks, { expected_version: precondition.expected_version });
      }
      if (action === 'receive') {
        if (receiptDateError) throw new Error(receiptDateError);
        return api.receiveRma(record.id, { ...precondition, received_at: receiptDate });
      }
      if (completionDateError) throw new Error(completionDateError);
      return api.patchStatus(record.id, 'Delivered', precondition.remarks, {
        expected_version: precondition.expected_version,
        completed_at: completionDate,
        ...(record.rma_recipient ? { received_by: record.rma_recipient } : {}),
      });
    },
    onSuccess: async (saved, action) => {
      const savedRecord = normalizeApiRecord(saved);
      // Clear only what this action submitted (#347 QA run 1, finding 1).
      const todayNow = manilaToday();
      if (action === 'status') { setStatusRemarks(''); setNextStatus(''); }
      else if (action === 'receive') { setRemarks(''); setReceiptDate(todayNow); setCompletionDate(todayNow); }
      else if (action === 'assign') setRemarks('');
      else { setRemarks(''); setStatusRemarks(''); resetEventDates(); setNextStatus(''); } // complete, correct-transport
      // Inputs of another stage that are still on screen keep the form dirty.
      const retainedDraft = action === 'status'
        ? !!remarks.trim() || receiptDate !== todayNow || completionDate !== todayNow
        : action === 'receive' || action === 'assign'
          ? !!statusRemarks.trim() || !!nextStatus
          : false;
      if (retainedDraft) {
        // The server accepted our expected_version, so the only change since editing began is this save.
        // Rebase onto the saved version: an unrelated later change still shows the stale review.
        setEditVersion(savedRecord.rma_version ?? version);
      }
      await saveRecordToCache(client, savedRecord);
      if (!retainedDraft) setDirty(false);
      if (action === 'correct-transport') setCorrectionOpen(false);
      if (action === 'complete') setConfirmComplete(false);
      const message = action === 'assign' ? 'Driver assignment saved'
        : action === 'receive' ? 'Physical receipt confirmed'
          : action === 'complete' ? 'RMA completed'
            : action === 'status' ? `Status set to ${savedRecord.status}`
              : 'Driver completion details updated';
      // Successes use a toast only; the inline banner is reserved for errors.
      setFeedback('');
      notify.success(message);
      // Move focus to the Step 2 heading once receipt is confirmed.
      if (action === 'receive') setCardFocus(value => value + 1);
      await invalidateOperationalQueries(client);
    },
    onError: async error => {
      setFeedback(error instanceof Error ? error.message : 'Could not save. Please try again.');
      // A rejected stale version or revoked permission needs current server facts.
      await invalidateOperationalQueries(client);
    },
  });
  useEffect(() => {
    if (!feedback || mutation.isError) return;
    const timeout = window.setTimeout(() => setFeedback(''), 4500);
    return () => window.clearTimeout(timeout);
  }, [feedback, mutation.isError]);
  useWorkspaceDraft(`rma-workflow-${record.id}`, dirty || readiness.hasStagedFiles, mutation.isPending || readiness.uploading);
  const denied = detail.error instanceof ApiError && [401, 403, 404].includes(detail.error.status);
  if (denied) return <section role="region" aria-label="RMA transport" className={embedded ? 'rounded-lg border border-red-200 bg-red-50 p-3' : 'rounded-xl border border-slate-200 bg-white p-5'}><p role="alert">This RMA is no longer available to your account.</p></section>;

  const openDialog = (kind: 'start' | 'complete') => { setDialogVersion(record.rma_version ?? 0); setDialog(kind); };
  const closeDialog = (reason: 'cancel' | 'success') => { setDialog(null); if (reason === 'success') setCardFocus(value => value + 1); };
  /** Saves with the version the dialog opened with; a stale version keeps the dialog open and refreshes the record. */
  const saveTransport = async (data: { transport_status: 'IN_TRANSIT' | 'COMPLETED'; remarks: string; received_by?: string }, success: string) => {
    try {
      const saved = await api.progressRmaTransport(record.id, { ...data, expected_version: dialogVersion });
      await saveRecordToCache(client, normalizeApiRecord(saved));
      notify.success(success);
      await invalidateOperationalQueries(client);
    } catch (error) {
      await invalidateOperationalQueries(client);
      if (error instanceof ApiError && error.status === 409) throw new Error('This RMA changed in another session. Close this and try again.');
      throw error;
    }
  };
  const startTransport = (remarks: string) => saveTransport({ transport_status: 'IN_TRANSIT', remarks }, 'Transport started.');
  const completeTransport = ({ receivedBy, remarks }: CompletionValues) => saveTransport({ transport_status: 'COMPLETED', remarks, received_by: receivedBy }, 'Transport complete. Waiting for TASS receipt.');

  const busy = mutation.isPending;
  const canSave = !!remarks.trim() && !busy && !staleForm && !detail.isError && !capabilities.isError;
  // TASS works one stage at a time. Receipt and completion are mutually exclusive by construction (receipt needs !rma_received_at).
  const tassStep = caps?.receive ? 'receive' as const : caps?.complete ? 'complete' as const : null;
  const stepRemarksReady = !!remarks.trim() && !busy && !staleForm && !detail.isError && !capabilities.isError;
  const statusReady = !!statusRemarks.trim() && !busy && !staleForm && !detail.isError && !capabilities.isError;
  const drivers = (directory.data ?? []).filter(entry => entry.type === 'DRIVER' && entry.is_active);
  const rankedDrivers = rankDriversByCoverage(drivers, entry => entry.coverage_areas, record.area);
  const coveringCount = rankedDrivers.area.length + rankedDrivers.subregion.length;
  const assistantOptions = (directory.data ?? []).filter(entry => entry.type === 'ASSISTANT' && entry.is_active);
  const transportStep = caps?.transport && record.rma_transport_status === 'PENDING' ? 'start' as const
    : caps?.transport && record.rma_transport_status === 'IN_TRANSIT' ? 'complete' as const : null;
  const futureNotice = !transportStep && currentUserRole === 'Logistics' && internalTransport && !finished && allowed
    ? rmaLogisticsTransportNotice(record, false) : null;
  const recordingFor = transportStep && currentUserRole !== 'Driver' ? recordingForLine(record.driver) : null;
  const transportReference = record.rma_reference || record.record_no || '';
  const statusOptions = caps?.status ? (record.allowed_statuses ?? []).filter(status => !['Draft', 'Delivered', 'In Transit'].includes(status)) : [];
  const hasAction = caps?.assign || tassStep !== null || statusOptions.length > 0;
  // The stale-form notice renders once, in the section that owns the current action.
  const staleHome = caps?.assign ? 'assign' : tassStep ? 'step' : statusOptions.length > 0 ? 'status' : null;
  const staleNotice = staleForm ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
    <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
    <p>This RMA changed while you were editing. Review the latest saved state before retrying. <button type="button" className="min-h-11 font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800" onClick={() => { setDirty(false); setRemarks(''); setStatusRemarks(''); resetEventDates(); setNextStatus(''); setFeedback(''); }}>Use latest saved values</button></p>
  </div> : null;
  const savedAssistants = record.driver_assistants ?? [];
  const assignmentChanged = driverId !== (record.driver_id ?? '')
    || vehicle !== (record.vehicle || '(None)')
    || assistants.length !== savedAssistants.length
    || savedAssistants.some(name => !assistants.includes(name));
  const availableAssistantNames = [...new Set([...assistants, ...assistantOptions.map(entry => entry.name)])];
  const input = workflowInputClass;
  const selectInput = workflowSelectClass;
  const fieldLabel = workflowFieldLabelClass;
  const fieldHint = workflowFieldHintClass;
  const button = workflowPrimaryButtonClass;

  if (!embedded && currentUserRole === 'Logistics' && finished) {
    const completionParts: string[] = [];
    const transportReceiver = record.rma_transport_received_by?.trim();
    const recipientName = record.rma_recipient?.trim() || record.received_by?.trim();
    if (transportReceiver) completionParts.push(`Transport received by: ${transportReceiver}`);
    if (record.rma_transport_started_at) completionParts.push(`Transport started: ${formatManilaTimestamp(record.rma_transport_started_at)}`);
    if (record.rma_transport_completed_at) completionParts.push(`Transport completed: ${formatManilaTimestamp(record.rma_transport_completed_at)}`);
    if (recipientName) completionParts.push(`Physical receipt: ${recipientName}`);
    else if (record.rma_received_at) completionParts.push(`Physical receipt: Confirmed (${formatManilaTimestamp(record.rma_received_at)})`);
    if (record.rma_completed_at) completionParts.push(`RMA completed: ${formatManilaTimestamp(record.rma_completed_at)}`);

    const canCorrect = Boolean(caps?.correctTransport);
    const isCorrectionExpanded = canCorrect && (correctionOpen || hasCorrectionChanges);
    const canCollapse = !hasCorrectionChanges && !remarks.trim();
    const resetCorrection = (collapse = false) => {
      setTransportReceivedBy(savedTransportReceivedBy);
      setTransportStartedAt(savedTransportStartedAt);
      setTransportCompletedAt(savedTransportCompletedAt);
      setRemarks('');
      setDirty(false);
      setEditVersion(version);
      setFeedback('');
      if (collapse) setCorrectionOpen(false);
    };

    return (
      <section role="region" aria-label="RMA transport" data-record-id={record.id} className="space-y-4">
        {(detail.isError || capabilities.isError) && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Updates could not sync. Your saved view is shown; actions are paused. <button type="button" className="min-h-11 font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700" onClick={() => { void detail.refetch(); void capabilities.refetch(); }}>Retry sync</button></p>
        </div>}
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
          This RMA is completed. Status and driver assignment are locked.
        </p>

        {!isCorrectionExpanded ? (
          <div className="border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs font-semibold text-slate-700">Driver completion details</p>
                <p className="text-xs text-slate-600">
                  {completionParts.length > 0
                    ? completionParts.join(' · ')
                    : 'No driver transport details were recorded for this RMA.'}
                </p>
              </div>
              {canCorrect && (
                <button
                  type="button"
                  aria-expanded="false"
                  disabled={busy}
                  onClick={() => { setFeedback(''); setCorrectionOpen(true); }}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ClipboardEdit aria-hidden="true" className="h-3.5 w-3.5" />
                  Edit driver completion details
                  <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border-t border-slate-100 pt-3">
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Driver completion details</p>
                    <p className={fieldHint}>
                      Correct the driver&apos;s transport receiver or timestamps with remarks, using Manila time.
                    </p>
                  </div>
                  {canCollapse && (
                    <button
                      type="button"
                      aria-expanded="true"
                      disabled={busy}
                      onClick={() => setCorrectionOpen(false)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:opacity-50"
                    >
                      Hide
                      <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={`${id}-transport-received-by`} className={fieldLabel}>
                    Transport Received By <span className="text-red-600">*</span>
                  </label>
                  <input
                    id={`${id}-transport-received-by`}
                    type="text"
                    value={transportReceivedBy}
                    disabled={busy}
                    onChange={event => { beginEdit(); setTransportReceivedBy(event.target.value); }}
                    placeholder="Name of person who received items from the driver"
                    className={input}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-transport-started`} className={fieldLabel}>Transport Started (Manila)</label>
                    <input
                      id={`${id}-transport-started`}
                      type="datetime-local"
                      value={transportStartedAt}
                      disabled={!record.rma_transport_started_at || busy}
                      onChange={event => { beginEdit(); setTransportStartedAt(event.target.value); }}
                      className={input}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-transport-completed`} className={fieldLabel}>Transport Completed (Manila)</label>
                    <input
                      id={`${id}-transport-completed`}
                      type="datetime-local"
                      value={transportCompletedAt}
                      disabled={!record.rma_transport_completed_at || busy}
                      onChange={event => { beginEdit(); setTransportCompletedAt(event.target.value); }}
                      className={input}
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  TASS physical receipt{recipientName ? ` (${recipientName})` : ''} and final RMA completion{record.rma_completed_at ? ` (${formatManilaTimestamp(record.rma_completed_at)})` : ''} remain read-only.
                </p>
              </div>
            </div>

            {staleForm && <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <p>This RMA changed while you were editing. Review the latest saved state before retrying. <button type="button" className="min-h-11 font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800" onClick={() => resetCorrection(false)}>Use latest saved values</button></p>
            </div>}

            {correctionValidationError && <p role="alert" className="text-xs font-semibold text-red-700">{correctionValidationError}</p>}

            <WorkflowSection title="Save RMA transport correction" description="Add a reason for correcting the driver's transport completion details.">
              <div className="space-y-1.5">
                <label htmlFor={`${id}-correction-remarks`} className={fieldLabel}>
                  Change Reason / Remarks{' '}
                  {hasCorrectionChanges
                    ? <span className="text-red-500">*</span>
                    : <span className="font-normal text-slate-400">(required when saving changes)</span>}
                </label>
                <textarea
                  id={`${id}-correction-remarks`}
                  required
                  value={remarks}
                  rows={3}
                  disabled={busy}
                  onChange={event => { beginEdit(); setRemarks(event.target.value); }}
                  placeholder="Reason for correcting transport completion details (required)…"
                  className={`${input} resize-y`}
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={busy || (!hasCorrectionChanges && !remarks.trim())}
                  onClick={() => resetCorrection(true)}
                  className={workflowSecondaryButtonClass}
                >
                  Revert
                </button>
                <button
                  type="button"
                  disabled={!canSave || !hasCorrectionChanges || !!correctionValidationError}
                  onClick={() => mutation.mutate('correct-transport')}
                  className={button}
                >
                  {busy && mutation.variables === 'correct-transport'
                    ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Saving…</>
                    : <><Save aria-hidden="true" className="h-4 w-4" />Save Changes</>}
                </button>
              </div>
            </WorkflowSection>
          </div>
        )}

        {feedback && <div role={mutation.isError ? 'alert' : 'status'} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${mutation.isError ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {mutation.isError ? <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" /> : <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0" />}
          <span>{feedback}</span>
        </div>}
      </section>
    );
  }

  return <section role="region" aria-label="RMA transport" data-record-id={record.id} className={embedded ? 'space-y-4' : 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'}>
    {!embedded && <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5 sm:py-5 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 space-y-2">
        <h3 className="text-base font-bold text-brand-navy">RMA transport</h3>
        <RecordStatusProgress record={record} />
      </div>
      <span className="inline-flex max-w-full items-center gap-2 self-start rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-brand-navy">
        <span className="shrink-0 text-slate-500">Movement</span>
        <span className="truncate">{record.rma_movement ? RMA_MOVEMENT_LABELS[record.rma_movement] : 'Choose in Overview'}</span>
      </span>
    </header>}

    {!embedded && <dl className="grid gap-2 bg-slate-50/60 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
      {internalTransport && <>
        <SummaryItem label="Driver" value={record.driver || 'Unassigned'} />
        <SummaryItem label="Vehicle" value={record.vehicle || '(None)'} />
      </>}
      <SummaryItem label="Physical receipt" value={record.rma_received_at
        ? `${record.rma_recipient || 'Confirmed'} · ${formatManilaTimestamp(record.rma_received_at)}`
        : 'Not confirmed'} />
      {record.rma_transport_started_at && <SummaryItem label="Transport started" value={formatManilaTimestamp(record.rma_transport_started_at)} />}
      {record.rma_transport_completed_at && <SummaryItem label="Transport completed" value={formatManilaTimestamp(record.rma_transport_completed_at)} />}
      {record.rma_completed_at && <SummaryItem label="RMA completed" value={formatManilaTimestamp(record.rma_completed_at)} />}
    </dl>}

    <div className={embedded ? 'space-y-4' : 'space-y-4 p-4 sm:p-5'}>
    {record.rma_movement && record.rma_movement !== 'LOGISTICS_TRANSPORT' && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">No internal driver assignment is required for this movement.</p>}
    {(detail.isError || capabilities.isError) && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>Updates could not sync. Your saved view is shown; actions are paused. <button type="button" className="min-h-11 font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700" onClick={() => { void detail.refetch(); void capabilities.refetch(); }}>Retry sync</button></p>
    </div>}
    {capabilities.isPending && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading available actions…</p>}

    {(transportStep || futureNotice) && <NextStepCard title="Transport"
      text={transportStep === 'start' ? `Transport not started${record.driver ? ` · Driver: ${record.driver}` : ''}`
        : transportStep === 'complete' ? `In transit${record.rma_transport_started_at ? ` since ${formatManilaTimestamp(record.rma_transport_started_at)}` : ''}${record.driver ? ` · Driver: ${record.driver}` : ''}`
          : futureNotice!.text}
      buttonLabel={transportStep === 'start' ? START_LABEL : transportStep === 'complete' ? completionLabels('RMA').button : undefined}
      onAction={transportStep ? () => openDialog(transportStep) : undefined} disabled={busy} focusSignal={cardFocus}
      actionHint={transportStep === 'start' ? 'Opens a short form for remarks.' : transportStep === 'complete' ? 'Opens a short form for the proof photo, Received by and remarks.' : undefined}>
      {recordingFor && <p className="mt-2 text-sm text-slate-700">{recordingFor}</p>}
    </NextStepCard>}
    {transportStep && <>
      <StartTransportDialog open={dialog === 'start'} company={record.company_name} typeLabel="RMA" reference={transportReference} driver={record.driver} showRecordingFor={currentUserRole !== 'Driver'} timeInNote={false} onConfirm={startTransport} onClose={closeDialog} />
      <MarkDeliveredDialog open={dialog === 'complete'} recordId={record.id} category="RMA" rma company={record.company_name} typeLabel="RMA" reference={transportReference} driver={record.driver} showRecordingFor={currentUserRole !== 'Driver'} onConfirm={completeTransport} onClose={closeDialog} />
    </>}

    {caps?.assign && <WorkflowSection title="Driver & transport details" description={`Choose the crew for this return. Drivers covering ${record.area} are listed first.`}>
      <fieldset disabled={busy} aria-label="RMA driver assignment" className="min-w-0 space-y-4 border-0 p-0">
      {directory.isPending && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />Loading drivers and assistants…</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label htmlFor={`${id}-driver`} className={fieldLabel}>Driver
          <span className="relative block">
            <select id={`${id}-driver`} value={driverId} className={selectInput} disabled={directory.isPending || directory.isError} onChange={event => { beginEdit(); setDriverId(event.target.value); }}>
              <option value="">Unassigned</option>
              {record.driver_id && !drivers.some(entry => entry.id === record.driver_id) && <option value={record.driver_id}>{record.driver} (current)</option>}
              {rankedDrivers.area.length > 0 && <optgroup label={`Covers ${record.area}`}>
                {rankedDrivers.area.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </optgroup>}
              {rankedDrivers.subregion.length > 0 && <optgroup label={`Covers ${rankedDrivers.subregionName} (subregion)`}>
                {rankedDrivers.subregion.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </optgroup>}
              {rankedDrivers.other.length > 0 && <optgroup label={coveringCount > 0 ? 'Other drivers' : 'All drivers'}>
                {rankedDrivers.other.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </optgroup>}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </span>
          <span className={fieldHint}>Area coverage matches appear at the top of the list.</span>
        </label>
        <label htmlFor={`${id}-vehicle`} className={fieldLabel}>Vehicle
          <span className="relative block">
            <select id={`${id}-vehicle`} value={vehicle} className={selectInput} onChange={event => { beginEdit(); setVehicle(event.target.value); }}>
              {vehicle && !VEHICLES.includes(vehicle as typeof VEHICLES[number]) && <option value={vehicle}>{vehicle}</option>}
              {VEHICLES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </span>
          <span className={fieldHint}>Optional · choose “(None)” if no vehicle is needed.</span>
        </label>
      </div>

      <fieldset className="mt-4 space-y-2" aria-describedby={`${id}-assistants-help`}>
        <legend className="text-sm font-semibold text-slate-700">Assistants</legend>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p id={`${id}-assistants-help`} className={fieldHint}>Choose anyone joining the driver for this return.</p>
          <span className="text-xs font-medium text-slate-500">{assistants.length} selected</span>
        </div>
        {availableAssistantNames.length > 0 ? <ul className="grid max-h-48 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2">
          {availableAssistantNames.map(name => {
            const selected = assistants.includes(name);
            return <li key={name}>
              <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-[border-color,background-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-brand-blue/25 ${selected ? 'border-brand-blue/40 bg-blue-50/70 font-semibold text-brand-navy' : 'border-slate-200 bg-white text-slate-700'}`}>
                <input type="checkbox" checked={selected} disabled={busy} className="h-4 w-4 shrink-0 accent-brand-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed" onChange={event => {
                  beginEdit();
                  setAssistants(current => event.target.checked ? [...current, name] : current.filter(value => value !== name));
                }} />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-blue" />}
              </label>
            </li>;
          })}
        </ul> : <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">No active assistants are available.</p>}
      </fieldset>
      {directory.isError && <div role="alert" className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
        <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>Could not load the Driver directory.</span>
        <button type="button" onClick={() => void directory.refetch()} className="min-h-11 font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">Retry</button>
      </div>}
      </fieldset>
    </WorkflowSection>}

    {caps?.assign && <WorkflowSection variant="flat" title={embedded ? 'Transport actions' : 'Save assignment'} description="Add a reason, then save the crew for this return.">
    <label htmlFor={`${id}-remarks`} className={fieldLabel}>Remarks <span className="text-red-600">Required</span>
      <textarea id={`${id}-remarks`} required value={remarks} rows={3} aria-describedby={`${id}-remarks-help`} className={`${input} resize-y`} disabled={busy} onChange={event => { beginEdit(); setRemarks(event.target.value); }} placeholder="Reason for this workflow update" />
      <span id={`${id}-remarks-help`} className={fieldHint}>This reason is saved to the RMA audit trail.</span>
    </label>

    {staleHome === 'assign' && staleNotice}

    <div className="space-y-3 border-t border-slate-200 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-500">
          {staleForm ? 'Use the latest saved values before continuing.'
            : assignmentChanged ? remarks.trim() ? 'Assignment changes are ready to save.' : 'Add a reason to enable saving.'
              : 'Change a driver, vehicle, or assistant, then add a reason to save.'}
        </p>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button type="button" className={button} disabled={!canSave || !assignmentChanged || directory.isPending || directory.isError} onClick={() => mutation.mutate('assign')}>
            {busy && mutation.variables === 'assign' ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Saving assignment…</> : 'Save assignment'}
          </button>
        </div>
      </div>
    </div>
    </WorkflowSection>}

    {tassStep && <NextStepCard
      title={tassStep === 'receive' ? 'Step 1 of 2 · Physical receipt' : 'Step 2 of 2 · Complete RMA'}
      text={tassStep === 'receive'
        ? (internalTransport ? 'Transport is complete. Confirm when the signed slip or returned item is physically received.' : 'Confirm when the signed slip or returned item is physically received.')
        : `Receipt confirmed${record.rma_received_at ? ` ${formatManilaTimestamp(record.rma_received_at)}` : ''}. Set the completion date and complete the RMA.`}
      buttonLabel={tassStep === 'receive'
        ? (busy && mutation.variables === 'receive' ? 'Confirming…' : 'Confirm physical receipt')
        : 'Complete RMA'}
      onAction={tassStep === 'receive' ? () => mutation.mutate('receive') : () => { setFeedback(''); setConfirmComplete(true); }}
      disabled={tassStep === 'receive' ? !stepRemarksReady || !!receiptDateError : !stepRemarksReady || !!completionDateError}
      hint={staleForm ? 'Use the latest saved values before continuing.'
        : tassStep === 'receive' ? (receiptDateError ?? 'Add remarks to confirm receipt.') : (completionDateError ?? 'Add remarks to complete the RMA.')}
      focusSignal={cardFocus}>
      <div className="mt-3 space-y-3">
        {tassStep === 'receive' ? <label htmlFor={`${id}-receipt-date`} className={fieldLabel}>Receipt date
          <input id={`${id}-receipt-date`} type="date" value={receiptDate} max={today} min={transportCompletedDate ?? undefined} className={input} disabled={busy}
            aria-invalid={receiptDateError ? true : undefined} aria-describedby={`${id}-receipt-date-help`}
            onChange={event => { beginEdit(); setReceiptDate(event.target.value); }} />
          <span id={`${id}-receipt-date-help`} className={receiptDateError ? 'text-xs font-medium text-red-700' : fieldHint}>
            {receiptDateError ?? 'Actual date the signed slip or returned item was received (defaults to today).'}
          </span>
        </label> : <label htmlFor={`${id}-completion-date`} className={fieldLabel}>Completion date
          <input id={`${id}-completion-date`} type="date" value={completionDate} max={today} min={receivedDateMin ?? undefined} className={input} disabled={busy}
            aria-invalid={completionDateError ? true : undefined} aria-describedby={`${id}-completion-date-help`}
            onChange={event => { beginEdit(); setCompletionDate(event.target.value); }} />
          <span id={`${id}-completion-date-help`} className={completionDateError ? 'text-xs font-medium text-red-700' : fieldHint}>
            {completionDateError ?? 'Actual date the RMA was completed (defaults to today; cannot be earlier than the receipt date).'}
          </span>
        </label>}
        <label htmlFor={`${id}-remarks`} className={fieldLabel}>Remarks <span className="text-red-600">Required</span>
          <textarea id={`${id}-remarks`} required value={remarks} rows={3} aria-describedby={`${id}-remarks-help`} className={`${input} resize-y`} disabled={busy}
            onChange={event => { beginEdit(); setRemarks(event.target.value); }}
            placeholder={tassStep === 'receive' ? 'Reason for confirming receipt' : 'Reason for completing this RMA'} />
          <span id={`${id}-remarks-help`} className={fieldHint}>This reason is saved to the RMA audit trail.</span>
        </label>
        {staleHome === 'step' && staleNotice}
      </div>
    </NextStepCard>}

    {statusOptions.length > 0 && <WorkflowSection variant="flat" title="Change RMA status" description="Optional · put the RMA On-Hold or reschedule it. This does not confirm receipt or complete the RMA.">
    <label htmlFor={`${id}-status`} className={fieldLabel}>RMA status
      <span className="relative block">
        <select id={`${id}-status`} value={nextStatus} className={selectInput} disabled={busy} onChange={event => { beginEdit(); setNextStatus(event.target.value as DeliveryStatus); }}>
          <option value="">Select a status</option>
          {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </span>
      <span className={fieldHint}>Current status: {record.status}</span>
    </label>
    <label htmlFor={`${id}-status-remarks`} className={fieldLabel}>Status change reason <span className="text-red-600">Required</span>
      <textarea id={`${id}-status-remarks`} required value={statusRemarks} rows={3} aria-describedby={`${id}-status-remarks-help`} className={`${input} resize-y`} disabled={busy} onChange={event => { beginEdit(); setStatusRemarks(event.target.value); }} placeholder="Reason for this status change" />
      <span id={`${id}-status-remarks-help`} className={fieldHint}>This reason is saved to the RMA audit trail.</span>
    </label>

    {staleHome === 'status' && staleNotice}

    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
      <button type="button" className={workflowSecondaryButtonClass} disabled={!statusReady || !nextStatus} onClick={() => mutation.mutate('status')}>
        {busy && mutation.variables === 'status' ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Saving status…</> : 'Save RMA status'}
      </button>
    </div>
    </WorkflowSection>}
    {busy && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Saving workflow update…</p>}
    {feedback && <div role={mutation.isError ? 'alert' : 'status'} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${mutation.isError ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      {mutation.isError ? <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" /> : <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0" />}
      <span>{feedback}</span>
    </div>}
    {caps?.complete && <ActionDialog
      open={confirmComplete}
      title="Complete this RMA?"
      description={`Receipt date: ${receivedDateMin ?? '—'}\nCompletion date: ${completionDate}\n\nCompleting locks the RMA status and driver assignment.`}
      confirmLabel="Complete RMA"
      confirmDisabled={staleForm || !stepRemarksReady || !!completionDateError}
      confirmHint={staleForm ? 'This RMA changed while this confirmation was open. Review the latest saved values before completing.' : undefined}
      icon={CircleCheck}
      pending={busy && mutation.variables === 'complete'}
      error={confirmComplete && mutation.isError ? feedback : null}
      onConfirm={() => mutation.mutate('complete')}
      onDismiss={() => setConfirmComplete(false)}
    >
      {staleForm && <button type="button" onClick={() => { setConfirmComplete(false); setCardFocus(value => value + 1); }}
        className="min-h-11 font-semibold text-amber-900 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800">
        Review latest saved values</button>}
    </ActionDialog>}
    {!hasAction && !finished && !transportStep && !futureNotice && !capabilities.isPending && !capabilities.isError && <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600"><CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />No workflow action is available for this record and account.</p>}
    </div>
  </section>;
}
