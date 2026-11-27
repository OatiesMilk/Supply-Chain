import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, Loader2, Save } from 'lucide-react';
import { api } from '@/api';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { useRecordTimeInMutation, useUpdateRecordMutation } from '@/api/queries/useRecordsQuery';
import {
  acStatusLabel,
  DRIVERS,
  DRIVER_ASSISTANTS,
  DRIVER_COVERAGE_AREAS,
  driverIdForName,
  getManagedDriverVersion,
  getNearbyAreas,
  getSubregion,
  subscribeManagedDrivers,
} from '@/data';
import { usePermissions } from '@/hooks/usePermissions';
import { getOutputTrigger, runOutputActions } from '@/outputActions';
import type { DeliveryRecord, DeliveryStatus, OutputActionConfig, OutputActionTrigger, UserRole } from '@/types';
import { START_LABEL, completionLabels, nextStepForRun } from '@/utils/completionDialog';
import { rankDriversByCoverage } from '@/utils/driverCoverage';
import { notify } from '@/utils/notify';
import { completionError } from '@/utils/podRequirement';
import {
  canRecordTimeIn,
  isDraftRecord,
  manilaDateTimeInput,
  manilaInputToIso,
  manilaToday,
  rescheduleDateError,
  selectableStatuses,
} from '@/utils/recordLifecycle';
import { exportRecordOutputPDF } from '@/utils/recordOutputPdf';
import { DriverFallbackFields } from './DriverFallbackFields';
import MarkDeliveredDialog, { type CompletionValues } from './MarkDeliveredDialog';
import NextStepCard from './NextStepCard';
import { ReturnToDraftDialog } from './ReturnToDraftDialog';
import StartTransportDialog from './StartTransportDialog';
import {
  WorkflowSection,
  workflowFieldHintClass,
  workflowFieldLabelClass,
  workflowInputClass,
  workflowPrimaryButtonClass,
  workflowSecondaryButtonClass,
  workflowSelectClass,
} from './WorkflowSection';
import { useWorkspaceDraft } from './WorkspaceDrafts';

export interface DispatchActionsTabProps {
  record: DeliveryRecord;
  allRecords: DeliveryRecord[];
  currentUserRole: UserRole;
  currentUserName: string;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  outputActionConfigs?: Record<OutputActionTrigger, OutputActionConfig>;
  idPrefix: 'delivery' | 'accounting';
}

/**
 * Shared Status & Actions tab for all 4 non-RMA operational categories
 * (Deliveries, Procurement Pick-up, Sales Orders, and Accounting Collection).
 */
export function DispatchActionsTab({
  record,
  allRecords,
  currentUserRole,
  currentUserName,
  onUpdateRecord,
  outputActionConfigs,
  idPrefix,
}: DispatchActionsTabProps) {
  useSyncExternalStore(subscribeManagedDrivers, getManagedDriverVersion);
  const access = usePermissions();
  const isCollection = record.category === 'Accounting Collection';
  const entityNoun = isCollection ? 'collection' : 'delivery';
  const formatStatus = (status: DeliveryStatus) => (isCollection ? acStatusLabel(status) : status);

  const canAssign = access.canRecord(record.category, 'ASSIGN');
  const canCompleteStatus = isCollection
    ? currentUserRole === 'Logistics' && access.canRecord(record.category, 'COMPLETE')
    : access.canRecord(record.category, 'COMPLETE');

  const [saving, setSaving] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<DeliveryStatus>(record.status);
  const [actionRemarks, setActionRemarks] = useState('');
  const [actionRemarksError, setActionRemarksError] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const actionRemarksRef = useRef<HTMLTextAreaElement>(null);

  const { readiness: podReadiness, uploadStaged } = usePodAttachments(record.id);
  const timeInMutation = useRecordTimeInMutation();
  const dispatchMutation = useUpdateRecordMutation();

  const [selectedDriver, setSelectedDriver] = useState(record.driver ?? '');
  const [assistants, setAssistants] = useState<string[]>(record.driver_assistants ?? []);
  const [timeIn, setTimeIn] = useState(manilaDateTimeInput(record.time_in));
  const [timeOut, setTimeOut] = useState(manilaDateTimeInput(record.time_out));
  const [receivedBy, setReceivedBy] = useState(record.received_by ?? '');
  const [newDeliveryDate, setNewDeliveryDate] = useState('');
  const [returnToDraftOpen, setReturnToDraftOpen] = useState(false);
  const [driverDetailsOpen, setDriverDetailsOpen] = useState(false);
  const [dialog, setDialog] = useState<'start' | 'complete' | null>(null);
  const [cardFocus, setCardFocus] = useState(0);

  const draftRecord = isDraftRecord(record);
  const transportHandedOff = record.status === 'Transport Complete';
  const completed = record.status === 'Delivered';
  const assignmentLocked = draftRecord || transportHandedOff || completed || !canAssign;

  const statusOptions = selectableStatuses(record, currentUserRole).filter(
    status =>
      status !== 'Delivered' &&
      access.canRecord(record.category, 'STATUS') &&
      (status !== 'Draft' || access.canRecord(record.category, 'SUBMIT')),
  );

  const statusChanged = selectedStatus !== record.status;
  const photoError = statusChanged ? completionError(record, selectedStatus, receivedBy, podReadiness) : null;
  const needsNewDate =
    statusChanged &&
    selectedStatus === 'Rescheduled' &&
    record.category === 'Deliveries' &&
    (currentUserRole === 'Logistics' || currentUserRole === 'Admin');
  const newDateError = needsNewDate ? rescheduleDateError(newDeliveryDate, record.delivery_date) : null;

  const hasFallbackChanges =
    timeIn !== manilaDateTimeInput(record.time_in) ||
    timeOut !== manilaDateTimeInput(record.time_out) ||
    (receivedBy || '') !== (record.received_by ?? '');
  const normalizedAssistants = assistants.filter(a => a.trim());
  const savedAssistants = record.driver_assistants ?? [];
  const assignmentFieldsChanged =
    selectedDriver !== (record.driver ?? '') ||
    JSON.stringify(normalizedAssistants) !== JSON.stringify(savedAssistants);
  const driverFieldsChanged = assignmentFieldsChanged || hasFallbackChanges;

  const hasChanges = statusChanged || driverFieldsChanged;
  const recordsForDriver = (currentUserRole === 'Logistics' || currentUserRole === 'Admin') && access.canRecord(record.category, 'WRITE');
  const nextStep = recordsForDriver ? nextStepForRun(record, {
    canStart: access.canRecord(record.category, 'TIME_IN') && canRecordTimeIn(record),
    canComplete: access.canRecord(record.category, 'STATUS') && canCompleteStatus,
    dirty: hasChanges || !!actionRemarks.trim() || podReadiness.hasStagedFiles,
    collection: isCollection,
  }) : null;
  const closeDialog = (reason: 'cancel' | 'success') => {
    setDialog(null);
    if (reason === 'success') setCardFocus(value => value + 1);
  };
  const startRun = async (remarks: string) => {
    await timeInMutation.mutateAsync({ id: record.id, remarks });
    notify.success('Time In recorded');
  };
  const markDelivered = async ({ receivedBy: receiver, remarks }: CompletionValues) => {
    const now = new Date().toISOString();
    await onUpdateRecord(record.id, {
      status: 'Delivered',
      received_by: receiver,
      status_remarks: remarks,
      modified_by: `${currentUserName} (${currentUserRole})`,
      modified_at: now,
    } as Partial<DeliveryRecord>);
    notify.success(completionLabels(record.category).success);
    if (outputActionConfigs) {
      const trigger = getOutputTrigger(record.category, 'Delivered');
      if (trigger) {
        const output = await runOutputActions(trigger, outputActionConfigs[trigger], {
          amName: record.account_manager,
          at: now,
          recordId: record.id,
          category: record.category,
          api,
          exportPDF: async () => exportRecordOutputPDF(await api.getRecord(record.id)),
        });
        if (output.email.failed || output.pdf === 'failed') {
          notify.error(`Changes saved. ${output.banners.join(' ')}`);
        } else {
          output.banners.forEach(message => notify.info(message));
        }
      }
    }
  };
  const [dispatchEditVersion, setDispatchEditVersion] = useState(record.edit_version);
  useEffect(() => {
    if (!hasChanges && !actionRemarks.trim()) setDispatchEditVersion(record.edit_version);
  }, [record.id, record.edit_version, hasChanges, actionRemarks]);

  // Re-sync local state when switching records or after a saved status/timestamp transition
  useEffect(() => {
    setSelectedDriver(record.driver ?? '');
    setAssistants(record.driver_assistants ?? []);
    setTimeIn(manilaDateTimeInput(record.time_in));
    setTimeOut(manilaDateTimeInput(record.time_out));
    setReceivedBy(record.received_by ?? '');
    setSelectedStatus(record.status);
    setNewDeliveryDate('');
    setActionRemarks('');
    setActionRemarksError(false);
    setSaveFeedback(null);
    setDriverDetailsOpen(false);
  }, [record.id, record.time_in, record.time_out, record.status, record.delivery_date]); // eslint-disable-line react-hooks/exhaustive-deps

  useWorkspaceDraft(
    'dispatch',
    hasChanges || !!actionRemarks || podReadiness.hasStagedFiles,
    saving || podReadiness.uploading,
  );

  const handleSave = async () => {
    if (saving || photoError || newDateError || !access.canRecord(record.category, 'WRITE')) return;
    if (statusChanged && (!access.canRecord(record.category, 'STATUS') || (selectedStatus === 'Delivered' && !canCompleteStatus))) return;
    if (assignmentFieldsChanged && assignmentLocked) return;
    if (timeIn !== manilaDateTimeInput(record.time_in) && !access.canRecord(record.category, 'TIME_IN')) return;
    if (
      (timeOut !== manilaDateTimeInput(record.time_out) || (receivedBy || '') !== (record.received_by ?? '')) &&
      !access.canRecord(record.category, 'COMPLETE')
    ) {
      return;
    }

    if (!hasChanges && !actionRemarks.trim() && !podReadiness.hasStagedFiles) {
      setSaveFeedback('No changes detected to save.');
      return;
    }

    if (hasChanges && !actionRemarks.trim()) {
      setActionRemarksError(true);
      requestAnimationFrame(() => {
        actionRemarksRef.current?.focus();
        actionRemarksRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      return;
    }

    setActionRemarksError(false);
    setSaveFeedback(null);
    setSaving(true);

    const now = new Date().toISOString();
    let detailsSaved = false;
    let nextEditVersion = dispatchEditVersion;

    try {
      await uploadStaged();

      // The update hook routes status changes to PATCH /status and ordinary
      // dispatch fields to PUT /records/:id. Keep them as two ordered writes
      // behind this single button so neither set of changes is silently lost.
      if (driverFieldsChanged || (!statusChanged && actionRemarks.trim())) {
        const fieldUpdates: Partial<DeliveryRecord> = {
          expected_edit_version: dispatchEditVersion,
          remarks: actionRemarks.trim(),
          modified_by: `${currentUserName} (${currentUserRole})`,
          modified_at: now,
        };
        if (selectedDriver !== (record.driver ?? '')) {
          // Save the stable Driver profile id; the server copies the display name.
          const driverId = selectedDriver ? driverIdForName(selectedDriver) : null;
          if (selectedDriver && !driverId) fieldUpdates.driver = selectedDriver;
          else fieldUpdates.driver_id = driverId;
        }
        if (JSON.stringify(normalizedAssistants) !== JSON.stringify(savedAssistants)) {
          fieldUpdates.driver_assistants = normalizedAssistants;
        }
        if (timeIn !== manilaDateTimeInput(record.time_in)) fieldUpdates.time_in = timeIn ? manilaInputToIso(timeIn) : null;
        if (timeOut !== manilaDateTimeInput(record.time_out)) fieldUpdates.time_out = timeOut ? manilaInputToIso(timeOut) : null;
        if ((receivedBy || '') !== (record.received_by ?? '')) fieldUpdates.received_by = receivedBy;

        // Keep the exact result of this save as the baseline for a following
        // reschedule; a fresh read could silently accept another writer's edit.
        const saved = await dispatchMutation.mutateAsync({ id: record.id, updates: fieldUpdates });
        nextEditVersion = saved.edit_version;
        setDispatchEditVersion(saved.edit_version);
        detailsSaved = true;
      }

      if (statusChanged) {
        const statusUpdates: Partial<DeliveryRecord> & { status_remarks?: string } = {
          status: selectedStatus,
          status_remarks: actionRemarks.trim(),
          modified_by: `${currentUserName} (${currentUserRole})`,
          modified_at: now,
          ...(selectedStatus === 'Delivered' ? { received_by: receivedBy.trim() } : {}),
          ...(needsNewDate ? { delivery_date: newDeliveryDate, expected_edit_version: nextEditVersion } : {}),
        };
        await onUpdateRecord(record.id, statusUpdates);
      }

      setActionRemarks('');
      notify.success(
        statusChanged && selectedStatus === 'Delivered'
          ? 'Transport complete. Awaiting Sales verification.'
          : isCollection
            ? 'Collection dispatch changes saved'
            : 'Dispatch & Logistics changes saved',
      );

      if (statusChanged && outputActionConfigs) {
        const trigger = getOutputTrigger(record.category, selectedStatus);
        if (trigger) {
          const output = await runOutputActions(trigger, outputActionConfigs[trigger], {
            amName: record.account_manager,
            at: now,
            recordId: record.id,
            category: record.category,
            api,
            exportPDF: async () => exportRecordOutputPDF(await api.getRecord(record.id)),
          });
          if (output.email.failed || output.pdf === 'failed') {
            notify.error(`Changes saved. ${output.banners.join(' ')}`);
          } else {
            output.banners.forEach(message => notify.info(message));
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save the changes. Please try again.';
      notify.error(
        detailsSaved && statusChanged
          ? `Dispatch details were saved, but the status was not changed: ${message}`
          : message,
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedAssistantNames = [...new Set(normalizedAssistants)];
  const availableAssistantNames = [...new Set([...selectedAssistantNames, ...DRIVER_ASSISTANTS])];

  const recordSubregion = getSubregion(record.area);
  const nearbyAreas = getNearbyAreas(record.area);
  const ranked = rankDriversByCoverage(DRIVERS, d => DRIVER_COVERAGE_AREAS[d], record.area);
  const coveringCount = ranked.area.length + ranked.subregion.length;
  const today = manilaToday();
  const subregionAreas = record.area ? [record.area, ...nearbyAreas] : [];
  const sameDayHintMap: Record<string, number> = {};
  if (recordSubregion) {
    allRecords.forEach(r => {
      if (r.id !== record.id && r.driver && r.delivery_date === today && subregionAreas.includes(r.area)) {
        sameDayHintMap[r.driver] = (sameDayHintMap[r.driver] ?? 0) + 1;
      }
    });
  }
  const sameDayHints = Object.entries(sameDayHintMap);
  const hasLegacyDriver = Boolean(selectedDriver && !DRIVERS.includes(selectedDriver));

  return (
    <div className="space-y-6">
      {nextStep && (
        <>
          <NextStepCard
            text={nextStep.text}
            done={nextStep.kind === 'done'}
            focusSignal={cardFocus}
            buttonLabel={nextStep.action === 'start' ? START_LABEL : nextStep.action === 'complete' ? completionLabels(record.category).button : undefined}
            onAction={nextStep.action ? () => setDialog(nextStep.action!) : undefined}
            disabled={nextStep.disabled || saving}
            hint={nextStep.hint}
            actionHint={nextStep.action === 'start' ? 'Opens a short form for remarks.' : nextStep.action === 'complete' ? 'Opens a short form for the proof photo, Received by and remarks.' : undefined}
          />
          <StartTransportDialog open={dialog === 'start'} company={record.company_name} typeLabel={record.category} reference={record.reference} driver={record.driver} onConfirm={startRun} onClose={closeDialog} />
          <MarkDeliveredDialog open={dialog === 'complete'} recordId={record.id} category={record.category} company={record.company_name} typeLabel={record.category} reference={record.reference} driver={record.driver} onConfirm={markDelivered} onClose={closeDialog} />
        </>
      )}

      {/* Status update — hidden once completed since no status transitions remain */}
      {!completed && (
        <WorkflowSection
          title={isCollection ? 'Collection status' : 'Delivery status'}
          description={`Choose the status for this ${entityNoun}. Changes apply when saved.`}
        >
          {statusOptions.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {statusOptions.map(s => (
                <button
                  type="button"
                  key={s}
                  onClick={() => {
                    if (s === 'Draft') {
                      setReturnToDraftOpen(true);
                      return;
                    }
                    setSelectedStatus(s);
                    setNewDeliveryDate('');
                    setSaveFeedback(null);
                  }}
                  disabled={saving}
                  aria-pressed={s === 'Draft' ? undefined : selectedStatus === s}
                  aria-haspopup={s === 'Draft' ? 'dialog' : undefined}
                  className={`min-h-11 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
                    selectedStatus === s
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-brand-blue hover:text-brand-blue'
                  }`}
                >
                  {s === 'Draft' ? 'Return to Draft' : s === 'Delivered' ? 'Complete transport' : formatStatus(s)}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              {transportHandedOff
                ? 'Transport handoff is complete and awaiting Sales verification. No further status changes are available here.'
                : `No further status changes are available for this ${isCollection ? 'collection' : 'record'}.`}
            </p>
          )}

          <ReturnToDraftDialog
            record={record}
            open={returnToDraftOpen}
            onDismiss={() => setReturnToDraftOpen(false)}
            onSubmit={async reason => {
              await onUpdateRecord(record.id, { status: 'Draft', remarks: reason });
              notify.success('Record returned to Draft');
            }}
          />

          {needsNewDate && (
            <div className="space-y-1.5">
              <label htmlFor="reschedule-new-date" className={workflowFieldLabelClass}>
                New delivery date <span className="text-red-600">*</span>
              </label>
              <input
                id="reschedule-new-date"
                type="date"
                value={newDeliveryDate}
                min={manilaToday()}
                disabled={saving}
                required
                aria-invalid={!!newDateError}
                aria-describedby="reschedule-new-date-help"
                onChange={e => {
                  setNewDeliveryDate(e.target.value);
                  setSaveFeedback(null);
                }}
                className={`${workflowInputClass} sm:max-w-xs ${newDateError ? 'border-red-400 bg-red-50' : ''}`}
              />
              <p
                id="reschedule-new-date-help"
                className={`${workflowFieldHintClass} ${newDateError ? 'font-semibold text-red-600' : ''}`}
              >
                {newDateError ?? 'The driver sees this run again on the new date.'}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-600">
              Current status: <span className="font-semibold text-slate-800">{formatStatus(record.status)}</span>
              {selectedStatus !== record.status && (
                <span className="ml-2 text-brand-navy">
                  → {selectedStatus === 'Delivered' ? 'Complete transport' : formatStatus(selectedStatus)} (unsaved)
                </span>
              )}
            </p>
          </div>
          {photoError && (
            <p role="alert" className="text-xs font-semibold text-red-700">
              {photoError}
            </p>
          )}
        </WorkflowSection>
      )}

      {completed ? (
        <div className="space-y-4">
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900"
          >
            This {entityNoun} is completed. Status and driver assignment are locked.
          </p>
          <DriverFallbackFields
            idPrefix={idPrefix}
            record={record}
            selectedStatus={selectedStatus}
            receivedBy={receivedBy}
            onReceivedByChange={setReceivedBy}
            timeIn={timeIn}
            onTimeInChange={setTimeIn}
            timeOut={timeOut}
            onTimeOutChange={setTimeOut}
            open={driverDetailsOpen}
            onOpenChange={setDriverDetailsOpen}
            saving={saving}
            transportHandedOff={transportHandedOff}
            canComplete={access.canRecord(record.category, 'COMPLETE')}
            canTimeIn={access.canRecord(record.category, 'TIME_IN')}
            hasFallbackChanges={hasFallbackChanges}
          />
        </div>
      ) : (
        <WorkflowSection
          title={isCollection ? 'Driver & collection details' : 'Driver & delivery details'}
          description={`Assign the driver and assistants for this ${entityNoun}.`}
        >
          <div className="space-y-3">
            {draftRecord && (
              <p
                role="status"
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
              >
                Submit this draft before changing its assignment. Existing assignments are retained.
              </p>
            )}
            {transportHandedOff && (
              <p
                role="status"
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"
              >
                Transport handoff is complete. Driver assignment and run timestamps are locked while Sales reviews the proof.
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor={`${idPrefix}-driver-select`} className={workflowFieldLabelClass}>
                Driver
              </label>
              <span className="relative block">
                <select
                  id={`${idPrefix}-driver-select`}
                  value={selectedDriver}
                  disabled={saving || assignmentLocked}
                  onChange={e => setSelectedDriver(e.target.value)}
                  className={`${workflowSelectClass} ${!selectedDriver ? 'border-amber-400 bg-amber-50' : ''}`}
                >
                  <option value="">-- Unassigned --</option>
                  {hasLegacyDriver && <option value={selectedDriver}>{selectedDriver}</option>}
                  {ranked.area.length > 0 && (
                    <optgroup label={`Covers ${record.area}`}>
                      {ranked.area.map(d => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {ranked.subregion.length > 0 && (
                    <optgroup label={`Covers ${ranked.subregionName} (subregion)`}>
                      {ranked.subregion.map(d => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {ranked.other.length > 0 && (
                    <optgroup label={coveringCount > 0 ? 'Other drivers' : 'All drivers'}>
                      {ranked.other.map(d => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                />
              </span>
              {coveringCount > 0 ? (
                <p className="text-xs leading-5 text-emerald-600 font-semibold">
                  {coveringCount} driver{coveringCount !== 1 ? 's' : ''} cover{coveringCount === 1 ? 's' : ''}{' '}
                  {record.area} — shown first.
                </p>
              ) : (
                <p className={workflowFieldHintClass}>
                  No driver covers {record.area || 'this area'} yet — showing all drivers.
                </p>
              )}
              {recordSubregion && nearbyAreas.length > 0 && (
                <p className={`${workflowFieldHintClass} italic`}>
                  Part of <span className="font-semibold not-italic text-slate-500">{recordSubregion}</span> — nearby:{' '}
                  {nearbyAreas.join(', ')}
                </p>
              )}
              {sameDayHints.length > 0 && (
                <p className="text-xs leading-5 text-brand-blue font-semibold mt-1 flex flex-col">
                  <span className="mb-0.5 border-b border-blue-100 pb-0.5 inline-block w-max">
                    On this page, also assigned to {recordSubregion ?? record.area} today:
                  </span>
                  {sameDayHints.map(([d, count]) => (
                    <span key={d}>
                      • {d} <span className="opacity-75">({count} {count === 1 ? 'run' : 'runs'})</span>
                    </span>
                  ))}
                </p>
              )}
            </div>

            <fieldset className="mt-4 space-y-2" aria-describedby={`${idPrefix}-assistants-help`}>
              <legend className="text-sm font-semibold text-slate-700">Driver assistants</legend>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p id={`${idPrefix}-assistants-help`} className={workflowFieldHintClass}>
                  Choose anyone joining the driver for this {entityNoun}.
                </p>
                <span className="text-xs font-medium text-slate-500">{selectedAssistantNames.length} selected</span>
              </div>
              {availableAssistantNames.length > 0 ? (
                <ul className="grid max-h-48 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2">
                  {availableAssistantNames.map(name => {
                    const selected = assistants.includes(name);
                    return (
                      <li key={name}>
                        <label
                          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-[border-color,background-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-brand-blue/25 motion-reduce:transition-none ${
                            selected
                              ? 'border-brand-blue/40 bg-blue-50/70 font-semibold text-brand-navy'
                              : 'border-slate-200 bg-white text-slate-700'
                          } ${saving || assignmentLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={saving || assignmentLocked}
                            className="h-4 w-4 shrink-0 accent-brand-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed"
                            onChange={event =>
                              setAssistants(current => {
                                const currentNames = current.filter(value => value.trim());
                                return event.target.checked
                                  ? currentNames.includes(name)
                                    ? currentNames
                                    : [...currentNames, name]
                                  : currentNames.filter(value => value !== name);
                              })
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                          {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-blue" />}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No driver assistants are available.
                </p>
              )}
            </fieldset>

            <DriverFallbackFields
              idPrefix={idPrefix}
              record={record}
              selectedStatus={selectedStatus}
              receivedBy={receivedBy}
              onReceivedByChange={setReceivedBy}
              timeIn={timeIn}
              onTimeInChange={setTimeIn}
              timeOut={timeOut}
              onTimeOutChange={setTimeOut}
              open={driverDetailsOpen}
              onOpenChange={setDriverDetailsOpen}
              saving={saving}
              transportHandedOff={transportHandedOff}
              canComplete={access.canRecord(record.category, 'COMPLETE')}
              canTimeIn={access.canRecord(record.category, 'TIME_IN')}
              hasFallbackChanges={hasFallbackChanges}
            />
          </div>
        </WorkflowSection>
      )}

      {/* Unified Save Model — hidden on completed records unless correcting receipt/timestamps */}
      {(!completed || driverDetailsOpen || hasChanges) && (
        <WorkflowSection
          title={isCollection ? 'Save collection changes' : 'Save delivery changes'}
          description="Add a reason when changing dispatch or status details."
        >
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-action-remarks`} className={workflowFieldLabelClass}>
              Change Reason / Remarks
              {hasChanges ? (
                <span className="text-red-500 ml-1">*</span>
              ) : (
                <span className="text-slate-400 font-normal ml-1">(optional — no changes detected)</span>
              )}
            </label>
            <textarea
              id={`${idPrefix}-action-remarks`}
              ref={actionRemarksRef}
              value={actionRemarks}
              onChange={e => {
                setActionRemarks(e.target.value);
                if (actionRemarksError && e.target.value.trim()) setActionRemarksError(false);
              }}
              rows={3}
              placeholder={hasChanges ? 'Reason for the changes above (required)…' : 'Optional note…'}
              className={`${workflowInputClass} resize-y ${actionRemarksError ? 'border-red-400 bg-red-50' : ''}`}
            />
            {actionRemarksError && (
              <p role="alert" className="text-xs text-red-600 font-semibold">
                A reason is required when making changes to dispatch or status fields.
              </p>
            )}
          </div>

          {saveFeedback && (
            <p role="status" className="text-xs font-semibold text-amber-700">
              {saveFeedback}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-4 border-t border-slate-200 mt-6">
            <button
              type="button"
              onClick={() => {
                setSelectedStatus(record.status);
                setNewDeliveryDate('');
                setSelectedDriver(record.driver ?? '');
                setAssistants(record.driver_assistants ?? []);
                setTimeIn(manilaDateTimeInput(record.time_in));
                setTimeOut(manilaDateTimeInput(record.time_out));
                setReceivedBy(record.received_by ?? '');
                setActionRemarks('');
                setActionRemarksError(false);
                setSaveFeedback(null);
                setDriverDetailsOpen(false);
              }}
              disabled={saving || !hasChanges}
              className={workflowSecondaryButtonClass}
            >
              Revert
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !access.canRecord(record.category, 'WRITE') || !!photoError || !!newDateError}
              className={workflowPrimaryButtonClass}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </WorkflowSection>
      )}
    </div>
  );
}
