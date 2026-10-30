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
import { RMA_MOVEMENT_LABELS, RMA_TRANSPORT_LABELS } from '@/utils/rmaTransport';
import { formatManilaTimestamp } from '@/utils/manilaTimestamp';
import { rankDriversByCoverage } from '@/utils/driverCoverage';

type Action = 'assign' | 'start' | 'transport-complete' | 'receive' | 'complete' | 'status';

/** Shared transport/receipt UI. Each write keeps the version visible when editing
 * started, so a background refresh cannot silently bless stale form values. */
export default function RmaWorkflowPanel({ record: initialRecord, currentUserRole }: {
  record: DeliveryRecord; currentUserRole: UserRole;
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
    pod: access.canRecord('RMA', 'POD') && allowed.pod && submitted && !finished && internalTransport && currentUserRole === 'Driver',
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
    onSuccess: async saved => {
      await saveRecordToCache(client, normalizeApiRecord(saved));
      setDirty(false);
      setRemarks('');
      setRecipient('');
      setNextStatus('');
      setFeedback('Changes saved.');
      await invalidateOperationalQueries(client);
    },
    onError: async error => {
      setFeedback(error instanceof Error ? error.message : 'Could not save. Please try again.');
      // A rejected stale version or revoked permission needs current server facts.
      await invalidateOperationalQueries(client);
    },
  });
  useWorkspaceDraft(`rma-workflow-${record.id}`, dirty || readiness.hasStagedFiles, mutation.isPending || readiness.uploading);
  const denied = detail.error instanceof ApiError && [401, 403, 404].includes(detail.error.status);
  if (denied) return <section role="region" aria-label="RMA transport" className="rounded-xl border border-slate-200 bg-white p-5"><p role="alert">This RMA is no longer available to your account.</p></section>;

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
  const input = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60';
  const button = 'min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

  return <section role="region" aria-label="RMA transport" data-record-id={record.id} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="space-y-1">
      <h3 className="font-bold text-slate-900">RMA transport</h3>
      <p className="text-sm text-slate-700">Movement: {record.rma_movement ? RMA_MOVEMENT_LABELS[record.rma_movement] : 'Choose a movement method in Overview'}</p>
      {record.rma_movement === 'LOGISTICS_TRANSPORT' && <>
        <p className="text-sm text-slate-700">Transport: {record.rma_transport_status ? RMA_TRANSPORT_LABELS[record.rma_transport_status] : 'Pending'}</p>
        <p className="text-sm text-slate-700">Driver: {record.driver || 'Unassigned'}</p>
        <p className="text-sm text-slate-700">Vehicle: {record.vehicle || '(None)'}</p>
        {record.rma_transport_started_at && <p className="text-xs text-slate-500">Started: {formatManilaTimestamp(record.rma_transport_started_at)}</p>}
        {record.rma_transport_completed_at && <p className="text-xs text-slate-500">Transport completed: {formatManilaTimestamp(record.rma_transport_completed_at)}</p>}
      </>}
      {record.rma_movement && record.rma_movement !== 'LOGISTICS_TRANSPORT' && <p className="text-sm text-slate-600">No internal Driver assignment is required.</p>}
      <p className="text-sm text-slate-700">Physical receipt: {record.rma_received_at ? `${record.rma_recipient} · ${formatManilaTimestamp(record.rma_received_at)}` : 'Not confirmed'}</p>
      <p className="text-sm text-slate-700">Final RMA: {record.status === 'Delivered' ? 'Complete' : record.status}</p>
      {record.rma_completed_at && <p className="text-xs text-slate-500">RMA completed: {formatManilaTimestamp(record.rma_completed_at)}</p>}
    </div>
    {(detail.isError || capabilities.isError) && <div role="alert" className="text-sm text-red-700">
      Updates could not sync. Your saved view is shown; actions are paused.
      <button type="button" className="ml-2 min-h-11 underline" onClick={() => { void detail.refetch(); void capabilities.refetch(); }}>Retry sync</button>
    </div>}
    {capabilities.isPending && <p role="status" className="text-sm text-slate-600">Loading available actions…</p>}
    {caps?.assign && <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-bold text-slate-800">Assign driver</legend>
      <div className="space-y-1 text-sm font-semibold"><label htmlFor={`${id}-driver`}>Driver</label>
        <select id={`${id}-driver`} value={driverId} className={input} disabled={directory.isPending || directory.isError} onChange={event => { beginEdit(); setDriverId(event.target.value); }}>
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
      </div>
      <div className="space-y-1 text-sm font-semibold"><label htmlFor={`${id}-vehicle`}>Vehicle</label>
        <select id={`${id}-vehicle`} value={vehicle} className={input} onChange={event => { beginEdit(); setVehicle(event.target.value); }}>
          {vehicle && !VEHICLES.includes(vehicle as typeof VEHICLES[number]) && <option value={vehicle}>{vehicle}</option>}
          {VEHICLES.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <div className="space-y-1 text-sm font-semibold sm:col-span-2"><label htmlFor={`${id}-assistants`}>Assistants</label>
        <select id={`${id}-assistants`} multiple value={assistants} className={input} onChange={event => { beginEdit(); setAssistants(Array.from(event.target.selectedOptions, option => option.value)); }}>
          {[...new Set([...assistants, ...assistantOptions.map(entry => entry.name)])].map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      {directory.isError && <p role="alert" className="text-sm text-red-700">Could not load the Driver directory. <button type="button" onClick={() => void directory.refetch()} className="underline">Retry directory</button></p>}
    </fieldset>}
    {caps?.pod && currentUserRole === 'Driver' && <PodUploader recordId={record.id} required disabled={busy} />}
    {caps?.receive && <label htmlFor={`${id}-recipient`} className="block space-y-1 text-sm font-semibold">Recipient
      <input id={`${id}-recipient`} value={recipient} className={input} disabled={busy} onChange={event => { beginEdit(); setRecipient(event.target.value); }} placeholder="Name of recipient / collector" />
    </label>}
    {statusOptions.length > 0 && <label htmlFor={`${id}-status`} className="block space-y-1 text-sm font-semibold">RMA status
      <select id={`${id}-status`} value={nextStatus} className={input} disabled={busy} onChange={event => { beginEdit(); setNextStatus(event.target.value as DeliveryStatus); }}>
        <option value="">Select a status</option>
        {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
      </select>
    </label>}
    {hasAction && <label htmlFor={`${id}-remarks`} className="block space-y-1 text-sm font-semibold">Remarks
      <textarea id={`${id}-remarks`} required value={remarks} rows={2} className={input} disabled={busy} onChange={event => { beginEdit(); setRemarks(event.target.value); }} placeholder="Reason for this workflow update" />
    </label>}
    {staleForm && <div role="alert" className="text-sm text-amber-800">This RMA changed while you were editing. Review the latest saved state before retrying.
      <button type="button" className="ml-2 min-h-11 underline" onClick={() => { setDirty(false); setRemarks(''); setRecipient(''); setNextStatus(''); setFeedback(''); }}>Use latest saved values</button>
    </div>}
    {canFinishTransport && !readiness.hasPhoto && <p className="text-sm text-slate-600">Save a proof-of-delivery photo before completing transport.</p>}
    <div className="flex flex-wrap gap-2">
      {caps?.assign && <button type="button" className={button} disabled={!canSave || directory.isPending || directory.isError} onClick={() => mutation.mutate('assign')}>Save assignment</button>}
      {canStart && <button type="button" className={button} disabled={!canSave} onClick={() => mutation.mutate('start')}>Start transport</button>}
      {canFinishTransport && <button type="button" className={button} disabled={!canSave || !readiness.hasPhoto || readiness.loading || readiness.uploading || readiness.loadFailed} onClick={() => mutation.mutate('transport-complete')}>Complete transport</button>}
      {caps?.receive && <button type="button" className={button} disabled={!canSave || !recipient.trim()} onClick={() => mutation.mutate('receive')}>Confirm physical receipt</button>}
      {statusOptions.length > 0 && <button type="button" className={button} disabled={!canSave || !nextStatus} onClick={() => mutation.mutate('status')}>Save RMA status</button>}
      {caps?.complete && <button type="button" className={button} disabled={!canSave} onClick={() => mutation.mutate('complete')}>Complete RMA</button>}
    </div>
    {busy && <p role="status" className="text-sm text-slate-600">Saving…</p>}
    {feedback && <p role={mutation.isError ? 'alert' : 'status'} className={`text-sm ${mutation.isError ? 'text-red-700' : 'text-emerald-700'}`}>{feedback}</p>}
    {!hasAction && !capabilities.isPending && !capabilities.isError && <p className="text-sm text-slate-600">No workflow action is available for this record and account.</p>}
  </section>;
}
