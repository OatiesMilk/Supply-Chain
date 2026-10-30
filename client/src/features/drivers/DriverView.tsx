import RecordStatus from '@/components/RecordStatus';
import { usePermissions } from '@/hooks/usePermissions';
import RmaWorkflowPanel from '@/features/deliveries/RmaWorkflowPanel';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, ChevronRight, Clock3, MapPin, Package,
  Search, Truck, UserRound, X,
} from 'lucide-react';
import type { DeliveryRecord, DeliveryStatus, OutputActionConfig, OutputActionTrigger } from '@/types';
import { api } from '@/api';
import { DRIVERS, VEHICLES, DRIVER_ASSISTANTS } from '@/data';
import { getOutputTrigger, runOutputActions } from '@/outputActions';
import { exportRecordOutputPDF } from '@/utils/recordOutputPdf';
import { screenKeyForCategory } from '@/routes/screenRouting';
import AssistantPicker from './AssistantPicker';
import PodUploader from '@/components/PodUploader';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { completionError } from '@/utils/podRequirement';

import { canRecordTimeIn, isDraftRecord } from '@/utils/recordLifecycle';
import { useRecordTimeInMutation } from '@/api/queries/useRecordsQuery';

interface DriverViewProps {
  records: DeliveryRecord[];
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  currentUserName: string;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
  onNavigate: (screen: string, item_id?: string) => void;
}

type RunTab = 'active' | 'completed';
const isActive = (record: DeliveryRecord) => record.status !== 'Delivered';
const matches = (record: DeliveryRecord, term: string) =>
  [record.reference, record.company_name, record.area, record.category, record.driver]
    .some(value => value.toLocaleLowerCase().includes(term));


export default function DriverView({
  records, onUpdateRecord, outputActionConfigs, onNavigate,
}: DriverViewProps) {
  const access = usePermissions();
  records = records.filter(record => access.canRecord(record.category) && !isDraftRecord(record) && (record.category !== 'RMA' || record.rma_movement === 'LOGISTICS_TRANSPORT' && record.rma_transport_status !== 'COMPLETED'));
  const timeInMutation = useRecordTimeInMutation();
  const [search, setSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [tab, setTab] = useState<RunTab>('active');
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<DeliveryStatus | null>(null);
  const [remarks, setRemarks] = useState('');
  const [receiverInputs, setReceiverInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{message: string, type: 'success'|'error'|'info'} | null>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);

  const activeRecords = records.filter(isActive);
  const unassignedRecords = activeRecords.filter(record => !record.driver);
  const driverNames = Array.from(new Set([
    ...DRIVERS,
    ...records.map(record => record.driver).filter(Boolean),
  ])).sort((a, b) => {
    const countA = activeRecords.filter(record => record.driver === a).length;
    const countB = activeRecords.filter(record => record.driver === b).length;
    return countB - countA || a.localeCompare(b);
  });
  const term = search.trim().toLocaleLowerCase();
  const visibleDrivers = driverNames.filter(driver =>
    !term || driver.toLocaleLowerCase().includes(term) || records.some(record => record.driver === driver && matches(record, term))
  );
  const driver = selectedDriver && visibleDrivers.includes(selectedDriver) ? selectedDriver : visibleDrivers[0];
  const driverRecords = records.filter(record => record.driver === driver);
  const filteredRuns = driverRecords
    .filter(record => (tab === 'active' ? isActive(record) : !isActive(record)))
    .filter(record => !term || driver.toLocaleLowerCase().includes(term) || matches(record, term))
    .sort((a, b) => tab === 'active'
      ? a.delivery_date.localeCompare(b.delivery_date) || a.reference.localeCompare(b.reference)
      : b.delivery_date.localeCompare(a.delivery_date) || a.reference.localeCompare(b.reference));
  const selectedRecord = records.find(record => record.id === selectedRecordId && record.driver === driver) ?? null;
  const { readiness: podReadiness, uploadStaged } = usePodAttachments(selectedRecord?.id ?? '');
  const photoError = selectedRecord ? completionError(selectedRecord, 'Delivered', receiverInputs[selectedRecord.id] ?? selectedRecord.received_by, podReadiness) : null;
  const activeForDriver = driverRecords.filter(isActive).length;

  useEffect(() => {
    if (!pendingStatus) lastTrigger.current?.focus();
  }, [pendingStatus]);

  const chooseDriver = (name: string) => {
    setSelectedDriver(name);
    setSelectedRecordId(null);
    setTab('active');
    setFeedback(null);
  };
  const chooseTab = (next: RunTab) => {
    setTab(next);
    setSelectedRecordId(null);
    setFeedback(null);
  };
  const closeStatus = () => {
    setPendingStatus(null);
    setRemarks('');
  };

  const save = async (record: DeliveryRecord, updates: Partial<DeliveryRecord>, failureMessage: string) => {
    if (!access.canRecord(record.category, updates.status ? 'STATUS' : 'ASSIGN') || updates.status === 'Delivered' && !access.canRecord(record.category, 'COMPLETE')) return false;
    setSaving(true);
    setFeedback(null);
    try {
      await onUpdateRecord(record.id, updates);
      return true;
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : failureMessage, type: 'error' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const changeVehicle = (record: DeliveryRecord, vehicle: string) =>
    void save(record, { vehicle, remarks: `Vehicle set to ${vehicle || '(None)'}` }, 'Could not update the vehicle. Please try again.');
  const addAssistant = (record: DeliveryRecord, assistant: string) => {
    if (!assistant || record.driver_assistants.includes(assistant)) return;
    void save(record, {
      driver_assistants: [...record.driver_assistants, assistant],
      remarks: `Added assistant: ${assistant}`,
    }, 'Could not add the assistant. Please try again.');
  };
  const removeAssistant = (record: DeliveryRecord, assistant: string) =>
    void save(record, {
      driver_assistants: record.driver_assistants.filter(name => name !== assistant),
      remarks: `Removed assistant: ${assistant}`,
    }, 'Could not remove the assistant. Please try again.');

  const confirmStatus = async () => {
    if (!selectedRecord || !pendingStatus || !remarks.trim() || !access.canRecord(selectedRecord.category, pendingStatus === 'In Transit' ? 'TIME_IN' : 'STATUS') || pendingStatus === 'Delivered' && !access.canRecord(selectedRecord.category, 'COMPLETE')) return;
    if (completionError(selectedRecord, pendingStatus, receiverInputs[selectedRecord.id] ?? selectedRecord.received_by, podReadiness)) return;
    
    if (pendingStatus === selectedRecord.status) {
      setFeedback({ message: 'Choose a different status before saving.', type: 'info' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      await uploadStaged();

      if (pendingStatus === "In Transit") {
        await timeInMutation.mutateAsync({ id: selectedRecord.id, remarks: remarks.trim() });
        closeStatus();
        setFeedback({ message: 'Status updated successfully.', type: 'success' });
        setTimeout(() => setFeedback(null), 3000);
        return;
      }
      const status = pendingStatus;
      const receivedBy = receiverInputs[selectedRecord.id]?.trim() || selectedRecord.received_by?.trim() || '';
      const updates = {
        status,
        status_remarks: remarks.trim(),
        ...(status === 'Delivered' ? { received_by: receivedBy } : {}),
      } as Partial<DeliveryRecord>;
      const saved = await save(selectedRecord, updates, 'Could not update the run. Please try again.');
      if (!saved) return;
      closeStatus();
      setFeedback({ message: 'Status updated successfully.', type: 'success' });
      setTimeout(() => setFeedback(null), 3000);
      if (status === 'Delivered' && tab === 'active') setSelectedRecordId(null);
      const trigger = getOutputTrigger(selectedRecord.category, status);
      if (trigger) {
        try {
          const output = await runOutputActions(trigger, outputActionConfigs[trigger], {
            amName: selectedRecord.account_manager,
            at: new Date().toISOString(),
            recordId: selectedRecord.id, category: selectedRecord.category,
            api, exportPDF: async () => exportRecordOutputPDF(await api.getRecord(selectedRecord.id)),
          });
          setFeedback({ message: `Status saved. ${output.banners.join(' ')}`, type: output.email.failed || output.pdf === 'failed' ? 'error' : 'success' });
        } catch {
          setFeedback({ message: 'The status was saved, but an output action could not finish. Check notifications before retrying.', type: 'error' });
        }
      }
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "Could not update the run. Please try again.", type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" id="driver-view-container">
      <header className="flex flex-wrap items-center justify-end gap-2">
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">{activeRecords.length}</strong> active runs
          <span aria-hidden="true"> · </span>
          <button type="button" onClick={() => setShowUnassigned(open => !open)}
            aria-expanded={showUnassigned} aria-controls="unassigned-runs"
            className="font-semibold text-amber-800 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
            {unassignedRecords.length} need a driver
          </button>
        </p>
      </header>

      {showUnassigned && (
        <section id="unassigned-runs" aria-label="Unassigned runs" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-bold text-amber-950">Runs needing a driver</h2>
          {unassignedRecords.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">All active runs have a driver.</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {unassignedRecords.map(record => (
                <button key={record.id} type="button" onClick={() => onNavigate(screenKeyForCategory(record.category), record.id)}
                  className="min-h-11 rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-sm hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">
                  <span className="block font-semibold text-slate-900">{record.reference} · {record.company_name}</span>
                  <span className="text-xs text-slate-600">{record.category} · {record.delivery_date}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {feedback && !selectedRecord && <p role="alert" className={`rounded-lg border p-3 text-sm ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : feedback.type === 'info' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{feedback.message}</p>}

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <label className="sr-only" htmlFor="driver-view-search">Search drivers and runs</label>
        <input id="driver-view-search" type="search" value={search} onChange={event => { setSearch(event.target.value); setSelectedRecordId(null); }}
          placeholder="Search driver, customer, reference, or area"
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden self-start rounded-xl border border-slate-200 bg-white p-2 lg:block" aria-label="Drivers">
          <h2 className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">Drivers</h2>
          {visibleDrivers.length === 0 && <p className="px-3 py-4 text-sm text-slate-600">No drivers match.</p>}
          {visibleDrivers.map(name => {
            const count = activeRecords.filter(record => record.driver === name).length;
            return (
              <button key={name} type="button" onClick={() => chooseDriver(name)} aria-current={driver === name ? 'true' : undefined}
                className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${driver === name ? 'bg-blue-50 font-semibold text-blue-900' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span className="min-w-0 truncate">{name}</span>
                <span className="shrink-0 tabular-nums text-xs text-slate-500">{count}</span>
              </button>
            );
          })}
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="lg:hidden">
            <label htmlFor="driver-view-driver" className="mb-1 block text-sm font-semibold text-slate-700">Driver</label>
            <select id="driver-view-driver" value={driver ?? ''} onChange={event => chooseDriver(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
              {visibleDrivers.length === 0 && <option value="">No drivers found</option>}
              {visibleDrivers.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          {driver ? (
            <section aria-label={`${driver} runs`} className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Truck aria-hidden="true" className="h-5 w-5 shrink-0 text-blue-700" />
                    <h2 className="min-w-0 truncate text-lg font-bold text-slate-900">{driver}</h2>
                  </div>
                  <span className="text-sm text-slate-500">{activeForDriver} active</span>
                </div>
                <div role="tablist" aria-label="Run status" className="mt-4 flex gap-5 border-b border-slate-200">
                  {(['active', 'completed'] as const).map(next => (
                    <button key={next} type="button" role="tab" aria-selected={tab === next} onClick={() => chooseTab(next)}
                      className={`min-h-10 border-b-2 pb-2 text-sm font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${tab === next ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                      {next} <span className="tabular-nums">{driverRecords.filter(record => next === 'active' ? isActive(record) : !isActive(record)).length}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_minmax(21rem,0.9fr)]">
                <div className={`min-w-0 divide-y divide-slate-100 ${selectedRecord ? 'hidden xl:block' : ''}`}>
                  {filteredRuns.length === 0 ? (
                    <p className="p-8 text-center text-sm text-slate-600">{term ? 'No matching runs for this driver.' : `No ${tab} runs for this driver.`}</p>
                  ) : filteredRuns.map(record => (
                    <button key={record.id} type="button" onClick={() => { setSelectedRecordId(record.id); setFeedback(null); }}
                      aria-current={selectedRecord?.id === record.id ? 'true' : undefined}
                      className={`flex min-h-20 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:px-5 ${selectedRecord?.id === record.id ? 'bg-blue-50/70' : ''}`}>
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{record.company_name}</span>
                        <span className="block truncate text-xs text-slate-600">{record.reference} · {record.area}</span>
                        <span className="block text-xs text-slate-500">{record.delivery_date}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <RecordStatus record={record} />
                        <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" />
                      </span>
                    </button>
                  ))}
                </div>

                <div className={`${selectedRecord ? '' : 'hidden xl:block'} min-w-0 border-slate-200 xl:border-l`}>
                  {selectedRecord ? (
                    <div className="space-y-5 p-4 sm:p-5">
                      <button type="button" onClick={() => setSelectedRecordId(null)}
                        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-blue-700 xl:hidden">
                        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to runs
                      </button>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-600">{selectedRecord.reference}</span>
                          <RecordStatus record={selectedRecord} />
                        </div>
                        <h3 className="break-words text-lg font-bold text-slate-900">{selectedRecord.company_name}</h3>
                        <p className="text-sm text-slate-600">{selectedRecord.category} · {selectedRecord.delivery_date}</p>
                        <p className="flex items-start gap-2 text-sm text-slate-700"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{selectedRecord.area}</p>
                      </div>

                      {selectedRecord.item_description && (
                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500"><Package aria-hidden="true" className="h-4 w-4" />Item summary</p>
                          <p className="mt-1 break-words text-sm text-slate-700">{selectedRecord.item_description}</p>
                        </div>
                      )}

                      {selectedRecord.category === 'RMA' && (
                        <RmaWorkflowPanel record={selectedRecord} currentUserRole="Logistics" />
                      )}

                      {selectedRecord.category !== 'RMA' && <div className="flex flex-col gap-4 border-t border-slate-200 pt-4">
                        <div>
                          <label htmlFor="driver-run-vehicle" className="mb-1 block text-sm font-medium text-slate-700">Vehicle</label>
                          <select id="driver-run-vehicle" value={selectedRecord.vehicle} disabled={saving || !access.canRecord(selectedRecord.category, 'ASSIGN')}
                            onChange={event => changeVehicle(selectedRecord, event.target.value)}
                            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600">
                            {VEHICLES.map(vehicle => <option key={vehicle} value={vehicle}>{vehicle}</option>)}
                          </select>
                        </div>

                        <AssistantPicker key={selectedRecord.id} selected={selectedRecord.driver_assistants}
                          options={DRIVER_ASSISTANTS} saving={saving || !access.canRecord(selectedRecord.category, 'ASSIGN')}
                          onAdd={name => addAssistant(selectedRecord, name)}
                          onRemove={name => removeAssistant(selectedRecord, name)} />
                      </div>}

                      {feedback && <p role="alert" className={`rounded-lg border p-3 text-sm ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : feedback.type === 'info' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{feedback.message}</p>}

                      {selectedRecord.category !== 'RMA' && selectedRecord.status !== 'Delivered' && (
                        <div className="space-y-4 border-t border-slate-200 pt-4">
                          {!selectedRecord.time_in ? (
                            <button type="button" disabled={saving || !access.canRecord(selectedRecord.category, 'TIME_IN') || !canRecordTimeIn(selectedRecord)}
                              onClick={event => { lastTrigger.current = event.currentTarget; setPendingStatus("In Transit"); setRemarks(""); setFeedback(null); }}
                              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
                              <Clock3 aria-hidden="true" className="h-4 w-4" /> Record time in
                            </button>
                          ) : (
                            <p className="flex items-center gap-2 text-sm text-blue-800"><Clock3 aria-hidden="true" className="h-4 w-4" />Time in: {new Date(selectedRecord.time_in).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}</p>
                          )}

                          {selectedRecord.time_in && (
                            <div>
                              <label htmlFor="driver-run-receiver" className="mb-1 block text-sm font-semibold text-slate-700">Received By *</label>
                              <input id="driver-run-receiver" type="text" value={receiverInputs[selectedRecord.id] ?? selectedRecord.received_by ?? ''}
                                onChange={event => setReceiverInputs(previous => ({ ...previous, [selectedRecord.id]: event.target.value }))}
                                placeholder="Receiver name" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" />
                            </div>
                          )}

                          <PodUploader key={selectedRecord.id} recordId={selectedRecord.id} required disabled={saving} />
                          {photoError && <p className="text-xs text-slate-600">{photoError}</p>}
                          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                            {(['Delivered', 'Pending', 'Rescheduled'] as const).map(status => (
                              <button key={status} type="button" disabled={saving || !access.canRecord(selectedRecord.category, 'STATUS') || (status === 'Delivered' && !access.canRecord(selectedRecord.category, 'COMPLETE')) || !(selectedRecord.allowed_statuses ?? []).includes(status) || (status === 'Delivered' && (!!photoError || !selectedRecord.time_in || !(receiverInputs[selectedRecord.id]?.trim() || selectedRecord.received_by?.trim())))}
                                onClick={event => { lastTrigger.current = event.currentTarget; setPendingStatus(status); setRemarks(''); setFeedback(null); }}
                                className={`min-h-11 rounded-lg px-2 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${status === 'Delivered' ? 'bg-emerald-700 text-white' : status === 'Pending' ? 'bg-amber-100 text-amber-900' : 'bg-violet-100 text-violet-900'}`}>
                                {status === 'Delivered' ? 'Accomplish' : status === 'Rescheduled' ? 'Reschedule' : status}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedRecord.status === 'Delivered' && (
                        <div className="space-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
                          <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Completed run</p>
                          {selectedRecord.time_in && <p>Time in: {new Date(selectedRecord.time_in).toLocaleString()}</p>}
                          {selectedRecord.time_out && <p>Time out: {new Date(selectedRecord.time_out).toLocaleString()}</p>}
                          {selectedRecord.received_by && <p className="flex items-center gap-2"><UserRound aria-hidden="true" className="h-4 w-4" />Received by {selectedRecord.received_by}</p>}
                          {selectedRecord.email_notification_sent && <p>Account manager notified</p>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center text-slate-500">
                      <Truck aria-hidden="true" className="h-7 w-7" />
                      <p className="mt-3 text-sm">Select a run to view details and actions.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">No drivers match your search.</div>
          )}
        </div>
      </div>

      {pendingStatus && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="driver-status-title" onKeyDown={event => {
            if (event.key === 'Escape' && !saving) closeStatus();
            if (event.key !== 'Tab') return;
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled)'));
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }} className="max-h-[90dvh] w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="driver-status-title" className="text-lg font-bold text-slate-900">Confirm status</h2>
                <p className="mt-1 text-sm text-slate-600">Mark {selectedRecord.reference} as {pendingStatus === 'Delivered' ? 'Accomplished' : pendingStatus}.</p>
              </div>
              <button type="button" onClick={closeStatus} disabled={saving} aria-label="Close status confirmation"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><X aria-hidden="true" className="h-5 w-5" /></button>
            </div>
            {pendingStatus === 'Delivered' && photoError && <p role="alert" className="text-sm text-red-800">{photoError}</p>}
            {feedback && <p role="alert" className={`rounded-lg p-3 text-sm ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800' : feedback.type === 'info' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'}`}>{feedback.message}</p>}
            <div>
              <label htmlFor="driver-status-remarks" className="mb-1 block text-sm font-semibold text-slate-700">Remarks — reason for change (required)</label>
              <p id="driver-status-remarks-help" className="mb-2 text-sm text-slate-600">Explain why you are making this change. The reason is saved with your name in the record history.</p>
              <textarea id="driver-status-remarks" aria-describedby="driver-status-remarks-help" required autoFocus rows={3} value={remarks} onChange={event => setRemarks(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeStatus} disabled={saving} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={() => void confirmStatus()} disabled={saving || !remarks.trim() || !!completionError(selectedRecord, pendingStatus, receiverInputs[selectedRecord.id] ?? selectedRecord.received_by, podReadiness)}
                className="min-h-11 rounded-lg bg-blue-800 px-4 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
