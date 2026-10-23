import { completionActionLabel } from '@/utils/navigationLabels';
import OperationalDashboard from './OperationalDashboard';
import { useState, useCallback } from "react";
import {
  CheckCircle,
  MapPin,
  Package,
  RefreshCw,
  Navigation,
  Clock,
  UserCheck,
  LogOut,
  Loader2
} from "lucide-react";
import { DeliveryRecord, DeliveryStatus } from "@/types";
import PodUploader from "@/components/PodUploader";
import { completionError, type PodReadiness } from "@/utils/podRequirement";

import { useRecordsQuery, useRecordTimeInMutation } from '@/api/queries/useRecordsQuery';
import { canRecordTimeIn, dashboardRunDaysLate, deliveryScheduleState, hasValidRunTimeIn, isDashboardRunActionable, isDraftRecord, manilaToday } from '@/utils/recordLifecycle';
import { ActionDialog } from '@/components/ActionDialog';
import DoneRecordModal from "./DoneRecordModal";
import { uploadStagedFiles } from '@/api/queries/usePodAttachments';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from '@/utils/notify';

interface DriverDashboardProps {
  records: DeliveryRecord[];
  currentUserName: string;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  onLogout: () => void;
  dataLoading: boolean;
}

const STATUS_VERB: Record<string, string> = {
  Delivered: "Accomplished",
  Pending: "Pending",
  Rescheduled: "Rescheduled",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DriverDashboard({
  records,
  currentUserName,
  onUpdateRecord,
  onLogout,
  dataLoading,
}: DriverDashboardProps) {
  const today = manilaToday();
  const timeInMutation = useRecordTimeInMutation();
  const runsQuery = useRecordsQuery();
  const queryClient = useQueryClient();
  records = records.filter(record => !isDraftRecord(record));
  const todayLabel = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const [selectedDoneRecord, setSelectedDoneRecord] = useState<DeliveryRecord | null>(null);

  const [pendingAction, setPendingAction] = useState<{
    rec: DeliveryRecord;
    status: DeliveryStatus;
  } | null>(null);
  const [remarksInput, setRemarksInput] = useState("");
  const [receivedByInputs, setReceivedByInputs] = useState<
    Record<string, string>
  >({});

  const [podStates, setPodStates] = useState<Record<string, PodReadiness>>({});
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const onPodReadinessChange = useCallback((id: string, state: PodReadiness) => {
    setPodStates(previous => ({ ...previous, [id]: state }));
  }, []);
  const photoError = pendingAction
    ? completionError(pendingAction.rec, pendingAction.status, receivedByInputs[pendingAction.rec.id] ?? pendingAction.rec.received_by, podStates[pendingAction.rec.id])
    : null;

  // The server returns all assigned non-draft records. Deliveries use the latest
  // saved date: overdue runs are actionable, while future unstarted runs are read-only.
  const todayRecs = records.filter((r) => r.delivery_date === today);
  const actionableRecs = records.filter(record => isDashboardRunActionable(record, today));
  const activeRecs = actionableRecs.filter((r) => r.status !== "Delivered");
  const doneRecs = records.filter((r) => r.status === "Delivered" &&
    (r.category === 'Deliveries'
      ? r.delivery_date === today || !!r.completed_late || (deliveryScheduleState(r.delivery_date, today).future && hasValidRunTimeIn(r.time_in))
      : r.delivery_date === today));
  const runsInScope = activeRecs.length + doneRecs.length;

  const handleTimeIn = (rec: DeliveryRecord) => {
    setPendingAction({ rec, status: "In Transit" });
    setRemarksInput("");
    setSaveFeedback(null);
  };

  const applyStatus = async (
    rec: DeliveryRecord,
    status: DeliveryStatus,
    remarks: string,
  ) => {
    const extra =
      status === "Delivered"
        ? {
            received_by: (receivedByInputs[rec.id] ?? rec.received_by ?? "").trim(),
          }
        : undefined;
    await onUpdateRecord(rec.id, {
      status,
      status_remarks: remarks,
      ...(extra ?? {}),
    } as any);
  };

  const statusBadge = (status: DeliveryStatus) => {
    switch (status) {
      case "Delivered":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "Pending":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "Rescheduled":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "On-Hold":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-blue-100 text-blue-700 border-blue-200";
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col">
      {/* Header */}
      <div className="bg-[#1F3864] text-white px-4 pt-10 pb-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-caption font-bold tracking-wider uppercase text-blue-200 hyphens-auto [overflow-wrap:anywhere]">
              Microgenesis Field Mobile
            </p>
            <h1 className="text-lg font-black leading-tight">
              {currentUserName}
            </h1>
            <p className="text-data text-blue-200 mt-0.5">{todayLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 text-data font-bold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Log Out
            </button>
          </div>
        </div>


      </div>

      {saveFeedback && !pendingAction && (
        <div className="px-4 py-3 pb-0">
          <div role="alert" className={`rounded-xl border p-3 text-data font-semibold shadow-sm ${saveFeedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : saveFeedback.type === 'info' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            {saveFeedback.message}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full">
        <OperationalDashboard driver />
        <div className="text-data text-slate-600">
          <button className="rounded border border-slate-300 bg-white px-3 py-2 font-semibold" disabled={runsQuery.isFetching} onClick={() => void runsQuery.refetch()}>{runsQuery.isFetching ? 'Refreshing runs…' : 'Refresh run list'}</button>
          {runsQuery.dataUpdatedAt > 0 && <p className="mt-2">Run list last updated: {new Date(runsQuery.dataUpdatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT</p>}
        </div>
        {runsQuery.isError && <p role="alert" className="rounded bg-amber-50 p-3 text-sm text-amber-900">{runsQuery.data ? 'Run list is stale; refresh failed.' : 'Unable to load your run list.'} {runsQuery.error.message} Use Refresh run list to try again. If it keeps failing, contact Logistics.</p>}
        {dataLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-500 text-data">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading runs…
          </div>
        )}

        {!dataLoading && !runsQuery.isError && runsInScope === 0 && (
          <div className="text-center py-16 text-slate-600">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
            <p className="font-bold text-slate-600">
              No runs ready for execution today.
            </p>
            <p className="text-data mt-1">
              Refresh the run list to check for new assignments, or contact Logistics if an expected run is missing.
            </p>
          </div>
        )}

        {/* Active records */}
        {activeRecs.map((rec) => {
          const daysLate = dashboardRunDaysLate(rec, today);
          const futureStarted = rec.category === 'Deliveries' && deliveryScheduleState(rec.delivery_date, today).future && hasValidRunTimeIn(rec.time_in);
          return (
            <div
              key={rec.id}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >
              {/* Card header */}
              <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <p className="font-mono text-data text-slate-500">
                    {rec.reference}
                  </p>
                  <p className="font-black text-sm text-slate-900 leading-tight">
                    {rec.company_name}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {daysLate > 0 && rec.category === 'Deliveries' && (
                    <span className="px-2 py-0.5 rounded-full border border-rose-200 bg-rose-50 text-data font-bold text-rose-700">
                      Overdue · {daysLate} day{daysLate === 1 ? '' : 's'} late
                    </span>
                  )}
                  {futureStarted && (
                    <span className="px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-data font-bold text-blue-700">Started</span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full border text-data font-bold uppercase tracking-wider ${statusBadge(rec.status)}`}>
                    {rec.status}
                  </span>
                </div>
              </div>

              <div className="px-4 py-3 space-y-3">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-data text-slate-600">
                  <p className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    {rec.area}
                  </p>
                  {rec.item_description && (
                    <p className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      {rec.item_description.slice(0, 40)}
                      {rec.item_description.length > 40 ? "…" : ""}
                    </p>
                  )}
                </div>

                {/* ePOD flow */}
                <div className="space-y-2.5 border-t border-slate-100 pt-3">
                  {/* Step 1: Time In */}
                  {!rec.time_in ? (
                    <button
                      onClick={() => handleTimeIn(rec)}
                      disabled={saving || !canRecordTimeIn(rec)}
                      className="w-full py-2.5 rounded-xl font-bold text-data tracking-wide uppercase bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Clock className="w-4 h-4" /> Record Time In
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-data text-blue-700 font-bold">
                      <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                      Time In recorded: {fmtTime(rec.time_in)}
                    </div>
                  )}

                  {/* Step 2: Proof of Delivery */}
                  <PodUploader recordId={rec.id} required disabled={saving} onReadinessChange={onPodReadinessChange} />

                  {/* Receiver name is required for completion. */}
                  <div className="space-y-1">
                    <label htmlFor={`received-by-${rec.id}`} className="text-data font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" /> Received By *
                    </label>
                    <input
                      id={`received-by-${rec.id}`}
                      aria-required="true"
                      aria-describedby={completionError(rec, "Delivered", receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id]) ? `completion-help-${rec.id}` : undefined}
                      type="text"
                      value={receivedByInputs[rec.id] ?? rec.received_by ?? ""}
                      onChange={(e) =>
                        setReceivedByInputs((prev) => ({
                          ...prev,
                          [rec.id]: e.target.value,
                        }))
                      }
                      placeholder="Name of person who received the item…"
                      className="w-full border border-field rounded-xl px-3 py-2.5 text-body focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                    />
                  </div>

                  {completionError(rec, "Delivered", receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id]) && <p id={`completion-help-${rec.id}`} className="text-data text-slate-600">{completionError(rec, "Delivered", receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id])}</p>}
                  {/* Step 3: Status buttons */}
                  <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        setPendingAction({ rec, status: "Delivered" });
                        setRemarksInput("");
                        setSaveFeedback(null);
                      }}
                      aria-describedby={completionError(rec, "Delivered", receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id]) ? `completion-help-${rec.id}` : undefined}
                      disabled={saving || !(rec.allowed_statuses ?? []).includes("Delivered") || !!completionError(rec, "Delivered", receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id])}
                      className="min-w-0 px-1 text-center whitespace-normal disabled:opacity-40 disabled:cursor-not-allowed py-2.5 rounded-xl font-bold text-data bg-emerald-700 hover:bg-emerald-800 text-white transition-all flex min-[360px]:flex-col items-center justify-center gap-1 cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" /> {completionActionLabel(rec.category)}
                    </button>
                    <button
                      onClick={() => {
                        setPendingAction({ rec, status: "Pending" });
                        setRemarksInput("");
                        setSaveFeedback(null);
                      }}
                      disabled={saving || !(rec.allowed_statuses ?? []).includes("Pending")}
                      className="disabled:opacity-40 py-2.5 rounded-xl font-bold text-data bg-amber-700 hover:bg-amber-800 text-white transition-all flex min-[360px]:flex-col items-center justify-center gap-1"
                    >
                      <Navigation className="w-4 h-4" /> Pending
                    </button>
                    <button
                      onClick={() => {
                        setPendingAction({ rec, status: "Rescheduled" });
                        setRemarksInput("");
                        setSaveFeedback(null);
                      }}
                      disabled={saving || !(rec.allowed_statuses ?? []).includes("Rescheduled")}
                      className="disabled:opacity-40 py-2.5 rounded-xl font-bold text-data bg-purple-600 hover:bg-purple-700 text-white transition-all flex min-[360px]:flex-col items-center justify-center gap-1"
                    >
                      <RefreshCw className="w-4 h-4" /> Reschedule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Completed records */}
        {doneRecs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <p className="text-caption font-black text-slate-600 uppercase tracking-widest">
                Accomplished ({doneRecs.length})
              </p>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            {doneRecs.map((rec) => (
              <button
                type="button"
                key={rec.id}
                onClick={() => setSelectedDoneRecord(rec)}
                className="w-full text-left bg-white rounded-2xl border border-emerald-200 px-4 py-3 flex items-start justify-between gap-3 hover:bg-emerald-50 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="font-mono text-data text-slate-500">
                    {rec.reference}
                  </p>
                  <p className="font-bold text-sm text-slate-800 truncate">
                    {rec.company_name}
                  </p>
                  {rec.completed_late && (
                    <p className="text-data font-bold text-rose-700 mt-0.5">
                      Completed {rec.days_late ?? 0} day{rec.days_late === 1 ? '' : 's'} late
                    </p>
                  )}
                  <p className="text-data text-slate-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                    {rec.area}
                  </p>
                  {(rec.time_in || rec.time_out) && (
                    <div className="flex items-center gap-3 mt-1.5 text-data text-slate-500 font-bold">
                      {rec.time_in && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-blue-400" /> In:{" "}
                          {fmtTime(rec.time_in)}
                        </span>
                      )}
                      {rec.time_out && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-emerald-400" /> Out:{" "}
                          {fmtTime(rec.time_out)}
                        </span>
                      )}
                    </div>
                  )}
                  {rec.received_by && (
                    <p className="text-data text-emerald-700 font-bold mt-0.5 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> {rec.received_by}
                    </p>
                  )}
                </div>
                <span className="text-data font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full shrink-0">
                  Done
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Upcoming and other-date records stay visible without execution controls. */}
        {records.filter(
          (r) => !isDashboardRunActionable(r, today) && r.status !== "Delivered",
        ).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <p className="text-caption font-black text-slate-600 uppercase tracking-widest">
                Upcoming / Other Dates
              </p>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            {records
              .filter((r) => !isDashboardRunActionable(r, today) && r.status !== "Delivered")
              .map((rec) => (
                <div
                  key={rec.id}
                  className="bg-white/70 rounded-xl border border-slate-200 px-4 py-2.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-2"
                >
                  <div className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">
                    <p className="font-mono text-data text-slate-500">
                      {rec.reference} · {rec.delivery_date}
                    </p>
                    <p className="text-data font-bold text-slate-700">
                      {rec.company_name}
                    </p>
                    <p className="text-data text-slate-500 mt-0.5">
                      {rec.area}{rec.item_description ? ` · ${rec.item_description}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-start min-[400px]:items-end gap-1">
                    <span className="text-data font-bold border border-slate-200 bg-slate-50 px-2 py-0.5 rounded-full text-slate-600">
                      {rec.category === 'Deliveries'
                        ? deliveryScheduleState(rec.delivery_date, today).valid ? 'Upcoming · read-only' : 'Delivery Date needed · read-only'
                        : 'Other date · read-only'}
                    </span>
                    <span className={`text-data font-bold border px-2 py-0.5 rounded-full ${statusBadge(rec.status)}`}>
                      {rec.status}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Keep the native dialog mounted so close restores focus to its trigger. */}
      <ActionDialog
        open={!!pendingAction}
        title="Confirm Status"
        description={pendingAction ? `Mark ${pendingAction.rec.reference} as ${STATUS_VERB[pendingAction.status] ?? pendingAction.status}` : ''}
        pending={saving}
        confirmLabel="Confirm"
        confirmDisabled={!remarksInput.trim() || !!photoError}
        onDismiss={() => {
          if (saving) return;
          setPendingAction(null);
          setRemarksInput('');
        }}
        onConfirm={async () => {
          if (!pendingAction || saving || !remarksInput.trim() || photoError) return;
          if (pendingAction.status === pendingAction.rec.status) {
            setSaveFeedback({ message: 'Choose a different status before saving.', type: 'info' });
            return;
          }
          setSaving(true);
          setSaveFeedback(null);
          try {
            const recordId = pendingAction.rec.id;
            await uploadStagedFiles(recordId, queryClient);

            if (pendingAction.status === "In Transit") {
              await timeInMutation.mutateAsync({ id: recordId, remarks: remarksInput.trim() });
            } else {
              await applyStatus(pendingAction.rec, pendingAction.status, remarksInput.trim());
            }
            setPendingAction(null);
            setRemarksInput("");
            notify.success('Status updated successfully');
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not update the delivery. Please try again.';
            setSaveFeedback({ message, type: 'error' });
            notify.error(message);
          } finally {
            setSaving(false);
          }
        }}
      >
        {pendingAction && <>
          <div className="space-y-1.5">
            <label htmlFor="driver-action-remarks" className="text-data font-black text-slate-600 uppercase tracking-wider block">
              Remarks — reason for change (required)
            </label>
            <p id="driver-action-remarks-help" className="text-data text-slate-600">Explain why you are making this change. The reason is saved with your name in the record history.</p>
            <textarea
              id="driver-action-remarks"
              aria-describedby="driver-action-remarks-help"
              required
              disabled={saving}
              value={remarksInput}
              onChange={e => setRemarksInput(e.target.value)}
              rows={3}
              placeholder="Enter remarks…"
              autoFocus
              className="min-h-[var(--mg-control-height)] w-full border border-field rounded-xl px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 resize-y"
            />
          </div>
          {photoError && <p role="alert" className="text-data text-red-700">{photoError}</p>}
          {saveFeedback && <p role="alert" className={`text-data ${saveFeedback.type === 'success' ? 'text-emerald-700' : saveFeedback.type === 'info' ? 'text-amber-700' : 'text-red-700'}`}>{saveFeedback.message}</p>}
        </>}
      </ActionDialog>

      {selectedDoneRecord && (
        <DoneRecordModal
          record={selectedDoneRecord}
          onClose={() => setSelectedDoneRecord(null)}
        />
      )}
    </div>
  );
}
