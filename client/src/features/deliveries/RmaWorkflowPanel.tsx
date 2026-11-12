import { RecordStatusProgress } from '@/components/RecordStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import type { DeliveryRecord, DeliveryStatus, UserRole } from '@/types';
import { VEHICLES } from '@/data';
import PodUploader from '@/components/PodUploader';
import { useWorkspaceDraft } from './WorkspaceDrafts';
import { useDriversQuery } from '@/api/queries/useDriversQuery';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { invalidateOperationalQueries, normalizeApiRecord, saveRecordToCache, useRecordDetailQuery } from '@/api/queries/useRecordsQuery';
import { operationalSyncOptions } from '@/api/queries/operationalSync';
import { RMA_MOVEMENT_LABELS } from '@/utils/rmaTransport';
import { formatManilaTimestamp } from '@/utils/manilaTimestamp';
import { rankDriversByCoverage } from '@/utils/driverCoverage';
import { notify } from '@/utils/notify';
import { Check, ChevronDown, CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { WorkflowSection, workflowFieldHintClass, workflowFieldLabelClass, workflowInputClass, workflowPrimaryButtonClass, workflowSelectClass } from './WorkflowSection';

type Action = 'assign' | 'start' | 'transport-complete' | 'receive' | 'complete' | 'status';

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
    <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
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
    transport: access.canRecord('RMA', 'STATUS') && allowed.transport && submitted && !finished && awaitingTransport && currentUserRole === 'Driver',
    receive: access.canRecord('RMA', 'RECEIVE') && allowed.receive && submitted && !finished && !!record.rma_movement && !awaitingTransport && !record.rma_received_at && currentUserRole === 'TASS',
    complete: access.canRecord('RMA', 'COMPLETE') && allowed.complete && submitted && !finished && !awaitingTransport && !!record.rma_received_at && currentUserRole === 'TASS',
    pod: access.canRecord('RMA', 'POD') && allowed.pod && submitted && !finished && internalTransport
      && record.rma_transport_status === 'IN_TRANSIT' && currentUserRole === 'Driver',
    status: access.canRecord('RMA', 'STATUS') && allowed.status && !finished && (currentUserRole === 'TASS' || currentUserRole === 'Admin'),
  } : undefined;
  const directory = useDriversQuery(caps?.assign === true);
  const { readiness, uploadStaged } = usePodAttachments(record.id);
  const [driverId, setDriverId] = useState(record.driver_id ?? '');
  const [vehicle, setVehicle] = useState(record.vehicle || '(None)');
  const [assistants, setAssistants] = useState(record.driver_assistants ?? []);
  const [recipient, setRecipient] = useState('');
  const [nextStatus, setNextStatus] = useState<DeliveryStatus | ''>('');
  const [remarks, setRemarks] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editVersion, setEditVersion] = useState(record.rma_version ?? 0);
  const [feedback, setFeedback] = useState('');
  const version = record.rma_version ?? 0;
  const staleForm = dirty && editVersion !== version;

  useEffect(() => {
    if (dirty) return;
    setDriverId(record.driver_id ?? '');
    setVehicle(record.vehicle || '(None)');
    setAssistants(record.driver_assistants ?? []);
    setEditVersion(version);
  }, [record.id, version, record.driver_id, record.vehicle, record.driver_assistants, dirty]);
  const beginEdit = () => {
    if (!dirty) setEditVersion(version);
    setDirty(true);
    setFeedback('');
  };
  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      const permission = action === 'assign' ? caps?.assign : action === 'start' || action === 'transport-complete' ? caps?.transport : action === 'receive' ? caps?.receive : action === 'status' ? caps?.status : caps?.complete;
      if (!permission) throw new Error('This action is no longer available for your account.');
      const precondition = { expected_version: dirty ? editVersion : version, remarks: remarks.trim() };
      if (!precondition.remarks) throw new Error('Enter remarks before saving.');
      if (action === 'assign') return api.assignRma(record.id, {
        ...precondition, driver_id: driverId || null, vehicle,
        driver_assistants: assistants,
      });
      if (action === 'start' || action === 'transport-complete') {
        if (action === 'transport-complete') await uploadStaged();
        return api.progressRmaTransport(record.id, {
          ...precondition, transport_status: action === 'start' ? 'IN_TRANSIT' : 'COMPLETED',
        });
      }
      if (action === 'status') {
        if (!nextStatus) throw new Error('Select an RMA status.');
        return api.patchStatus(record.id, nextStatus, precondition.remarks, { expected_version: precondition.expected_version });
      }
      if (action === 'receive') return api.receiveRma(record.id, { ...precondition, recipient: recipient.trim() });
      return api.patchStatus(record.id, 'Delivered', precondition.remarks, {
        expected_version: precondition.expected_version,
        received_by: record.rma_recipient ?? undefined,
      });
    },
    onSuccess: async (saved, action) => {
      await saveRecordToCache(client, normalizeApiRecord(saved));
      setDirty(false);
      setRemarks('');
      setRecipient('');
      setNextStatus('');
      const message = action === 'assign' ? 'Driver assignment saved.'
        : action === 'start' ? 'Transport started.'
          : action === 'transport-complete' ? 'RMA transport accomplished. Awaiting TASS receipt.'
            : 'Workflow update saved.';
      setFeedback(message);
      if (action === 'transport-complete') notify.success(message);
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

  const busy = mutation.isPending;
  const canSave = !!remarks.trim() && !busy && !staleForm && !detail.isError && !capabilities.isError;
  const drivers = (directory.data ?? []).filter(entry => entry.type === 'DRIVER' && entry.is_active);
  const rankedDrivers = rankDriversByCoverage(drivers, entry => entry.coverage_areas, record.area);
  const coveringCount = rankedDrivers.area.length + rankedDrivers.subregion.length;
  const assistantOptions = (directory.data ?? []).filter(entry => entry.type === 'ASSISTANT' && entry.is_active);
  const canStart = caps?.transport && record.rma_transport_status === 'PENDING';
  const canFinishTransport = caps?.transport && record.rma_transport_status === 'IN_TRANSIT';
  const statusOptions = caps?.status ? (record.allowed_statuses ?? []).filter(status => !['Draft', 'Delivered', 'In Transit'].includes(status)) : [];
  const hasAction = caps?.assign || caps?.transport || caps?.receive || caps?.complete || statusOptions.length > 0;
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

  return <section role="region" aria-label="RMA transport" data-record-id={record.id} className={embedded ? 'space-y-4' : 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'}>
    {!embedded && <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5 sm:py-5 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 space-y-2">
        <h3 className="text-base font-bold text-[#1F3864]">RMA transport</h3>
        <RecordStatusProgress record={record} />
      </div>
      <span className="inline-flex max-w-full items-center gap-2 self-start rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#1F3864]">
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
              <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-[border-color,background-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-[#0078C1]/25 ${selected ? 'border-[#0078C1]/40 bg-blue-50/70 font-semibold text-[#1F3864]' : 'border-slate-200 bg-white text-slate-700'}`}>
                <input type="checkbox" checked={selected} disabled={busy} className="h-4 w-4 shrink-0 accent-[#0078C1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1] disabled:cursor-not-allowed" onChange={event => {
                  beginEdit();
                  setAssistants(current => event.target.checked ? [...current, name] : current.filter(value => value !== name));
                }} />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-[#0078C1]" />}
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

    {caps?.pod && currentUserRole === 'Driver' && <PodUploader recordId={record.id} required disabled={busy} purpose="transport" />}
    {hasAction && <WorkflowSection variant="flat" title={embedded ? 'Transport actions' : 'RMA workflow actions'} description="Available actions depend on the return movement, current stage, and your role.">
    {caps?.receive && <label htmlFor={`${id}-recipient`} className={fieldLabel}>Recipient
      <input id={`${id}-recipient`} value={recipient} className={input} disabled={busy} onChange={event => { beginEdit(); setRecipient(event.target.value); }} placeholder="Name of recipient / collector" />
      <span className={fieldHint}>Record who physically received the returned item.</span>
    </label>}
    {statusOptions.length > 0 && <label htmlFor={`${id}-status`} className={fieldLabel}>RMA status
      <span className="relative block">
        <select id={`${id}-status`} value={nextStatus} className={selectInput} disabled={busy} onChange={event => { beginEdit(); setNextStatus(event.target.value as DeliveryStatus); }}>
          <option value="">Select a status</option>
          {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </span>
      <span className={fieldHint}>Current status: {record.status}</span>
    </label>}
    {hasAction && <label htmlFor={`${id}-remarks`} className={fieldLabel}>Remarks <span className="text-red-600">Required</span>
      <textarea id={`${id}-remarks`} required value={remarks} rows={3} aria-describedby={`${id}-remarks-help`} className={`${input} resize-y`} disabled={busy} onChange={event => { beginEdit(); setRemarks(event.target.value); }} placeholder="Reason for this workflow update" />
      <span id={`${id}-remarks-help`} className={fieldHint}>This reason is saved to the RMA audit trail.</span>
    </label>}

    {staleForm && <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>This RMA changed while you were editing. Review the latest saved state before retrying. <button type="button" className="min-h-11 font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800" onClick={() => { setDirty(false); setRemarks(''); setRecipient(''); setNextStatus(''); setFeedback(''); }}>Use latest saved values</button></p>
    </div>}
    {canFinishTransport && !readiness.hasPhoto && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">Save a transport proof photo before completing transport.</p>}

    <div className="space-y-3 border-t border-slate-200 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-500">
          {staleForm ? 'Use the latest saved values before continuing.' : caps?.assign
            ? assignmentChanged ? remarks.trim() ? 'Assignment changes are ready to save.' : 'Add a reason to enable saving.'
              : 'Change a driver, vehicle, or assistant, then add a reason to save.'
            : remarks.trim() ? 'Ready to record this workflow update.' : 'Add a reason before saving this workflow update.'}
        </p>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {caps?.assign && <button type="button" className={button} disabled={!canSave || !assignmentChanged || directory.isPending || directory.isError} onClick={() => mutation.mutate('assign')}>
            {busy && mutation.variables === 'assign' ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Saving assignment…</> : 'Save assignment'}
          </button>}
          {canStart && <button type="button" className={button} disabled={!canSave} onClick={() => mutation.mutate('start')}>
            {busy && mutation.variables === 'start' ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Starting…</> : 'Start transport'}
          </button>}
          {canFinishTransport && <button type="button" className={button} disabled={!canSave || !readiness.hasPhoto || readiness.loading || readiness.uploading || readiness.loadFailed} onClick={() => mutation.mutate('transport-complete')}>
            {busy && mutation.variables === 'transport-complete' ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Completing…</> : 'Complete transport'}
          </button>}
          {caps?.receive && <button type="button" className={button} disabled={!canSave || !recipient.trim()} onClick={() => mutation.mutate('receive')}>
            {busy && mutation.variables === 'receive' ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Confirming…</> : 'Confirm physical receipt'}
          </button>}
          {statusOptions.length > 0 && <button type="button" className={button} disabled={!canSave || !nextStatus} onClick={() => mutation.mutate('status')}>
            {busy && mutation.variables === 'status' ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Saving status…</> : 'Save RMA status'}
          </button>}
          {caps?.complete && <button type="button" className={button} disabled={!canSave} onClick={() => mutation.mutate('complete')}>
            {busy && mutation.variables === 'complete' ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Completing…</> : 'Complete RMA'}
          </button>}
        </div>
      </div>
    </div>
    </WorkflowSection>}
    {busy && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Saving workflow update…</p>}
    {feedback && <div role={mutation.isError ? 'alert' : 'status'} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${mutation.isError ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      {mutation.isError ? <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" /> : <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0" />}
      <span>{feedback}</span>
    </div>}
    {!hasAction && !finished && !capabilities.isPending && !capabilities.isError && <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600"><CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />No workflow action is available for this record and account.</p>}
    </div>
  </section>;
}
