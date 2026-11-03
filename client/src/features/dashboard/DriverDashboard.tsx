import RecordStatus from '@/components/RecordStatus';
import { usePermissions } from '@/hooks/usePermissions';
import RmaWorkflowPanel from '@/features/deliveries/RmaWorkflowPanel';
import { useState, useCallback, type ReactNode } from "react";
import {
  CheckCircle,
  MapPin,
  Package,
  RefreshCw,
  Navigation,
  Clock,
  UserCheck,
  X,
  Loader2
} from "lucide-react";
import { DeliveryRecord, DeliveryStatus } from "@/types";
import PodUploader from "@/components/PodUploader";
import { completionError, type PodReadiness } from "@/utils/podRequirement";

import { useRecordTimeInMutation, usePagedRecordsQuery } from '@/api/queries/useRecordsQuery';
import { useDriverOverviewQuery, useClampRecordPage } from '@/api/queries/useOperationalViews';
import RecordPageControls from '@/components/RecordPageControls';
import { canRecordTimeIn, dashboardRunDaysLate, deliveryScheduleState, hasValidRunTimeIn, isDashboardRunActionable, isDraftRecord, manilaToday } from '@/utils/recordLifecycle';
import DoneRecordModal from "./DoneRecordModal";
import { uploadStagedFiles } from '@/api/queries/usePodAttachments';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from '@/utils/notify';
import AccountMenu from '@/layouts/AccountMenu';

interface DriverDashboardProps {
  records: DeliveryRecord[];
  currentUserName: string;
  currentUserEmail: string;
  canManageAdmin: boolean;
  onNavigate: (screen: string) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  onLogout: () => void;
  dataLoading: boolean;
  serverPaging?: boolean;
  queueControls?: ReactNode;
  dashboardCounts?: { today: number; remaining: number; completed: number; rma_active: number; rma_completed: number };
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

export default function DriverDashboard(props: DriverDashboardProps) {
  return props.serverPaging ? <PagedDriverDashboard {...props} /> : <DriverDashboardContent {...props} />;
}
function PagedDriverDashboard(props: DriverDashboardProps) {
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<'active' | 'completed'>('active');
  const query = usePagedRecordsQuery({ view: 'driver_dashboard', queue, page, limit: 25 });
  const overview = useDriverOverviewQuery();
  useClampRecordPage(page, query.data?.total, setPage);
  const queueControls = <section aria-label="Run queues" className="mb-5 space-y-3">
    <nav className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2" aria-label="Run queues">
      {(['active', 'completed'] as const).map(value => <button key={value} type="button" aria-pressed={queue === value}
        onClick={() => { setQueue(value); setPage(1); }}
        className={`min-h-11 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] ${queue === value ? 'bg-[#1F3864] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
        {value === 'active' ? 'Active work' : 'Completed today / RMA awaiting receipt'}
      </button>)}
    </nav>
    <RecordPageControls page={page} total={query.data?.total ?? 0} onPageChange={setPage} loading={query.isPending}
      error={query.error ?? overview.error} retry={() => { void query.refetch(); void overview.refetch(); }} />
  </section>;

  return <DriverDashboardContent {...props} records={query.data?.rows ?? []} dashboardCounts={overview.data?.dashboard}
    dataLoading={query.isPending} queueControls={queueControls} />;
}
function DriverDashboardContent({
  records,
  currentUserName,
  currentUserEmail,
  canManageAdmin,
  onNavigate,
  onUpdateRecord,
  onLogout,
  dataLoading, dashboardCounts, queueControls,
}: DriverDashboardProps) {
  const access = usePermissions();
  const today = manilaToday();
  const timeInMutation = useRecordTimeInMutation();
  const queryClient = useQueryClient();
  records = records.filter(record => access.canRecord(record.category) && !isDraftRecord(record));
  const rmaRecords = records.filter(record => record.category === 'RMA' && record.rma_movement === 'LOGISTICS_TRANSPORT');
  records = records.filter(record => record.category !== 'RMA');
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

  // The server returns the linked Driver's assigned non-draft records. Every
  // non-RMA category keeps overdue and started runs active across Manila midnight.
  const todayRecs = records.filter((r) => r.delivery_date === today);
  const actionableRecs = records.filter(record => isDashboardRunActionable(record, today));
  const activeRecs = actionableRecs.filter((r) => r.status !== "Delivered");
  const doneRecs = records.filter((r) => r.status === "Delivered" &&
    (dashboardCounts ? true : r.category === 'Deliveries'
      ? r.delivery_date === today || !!r.completed_late || (deliveryScheduleState(r.delivery_date, today).future && hasValidRunTimeIn(r.time_in))
      : r.delivery_date === today));
  const runsInScope = activeRecs.length + doneRecs.length;

  const handleTimeIn = (rec: DeliveryRecord) => {
    if (!access.canRecord(rec.category, 'TIME_IN')) return;
    setPendingAction({ rec, status: "In Transit" });
    setRemarksInput("");
    setSaveFeedback(null);
  };

  const applyStatus = async (
    rec: DeliveryRecord,
    status: DeliveryStatus,
    remarks: string,
  ) => {
    if (!access.canRecord(rec.category, 'STATUS') || status === 'Delivered' && !access.canRecord(rec.category, 'COMPLETE')) throw new Error('This action is no longer available for your account.');
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


  return (
    <div className="min-h-screen bg-[#F8F9FB] font-sans text-slate-800">
      <header className="h-16 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">Microgenesis Field Mobile</p>
            <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">Driver dashboard</h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <p className="hidden text-sm text-slate-600 sm:block">{currentUserName} · {todayLabel}</p>
            <AccountMenu name={currentUserName} email={currentUserEmail} role="Driver"
              canManageAdmin={canManageAdmin} onNavigate={onNavigate} onLogout={onLogout} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <section aria-label="Driver summary" className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
          {[
            {
              label: "Today's Runs",
              value: dashboardCounts?.today ?? todayRecs.length,
              color: "text-[#1F3864]",
            },
            {
              label: "Accomplished",
              value: dashboardCounts?.completed ?? doneRecs.length,
              color: "text-emerald-700",
            },
            {
              label: "Remaining",
              value: dashboardCounts?.remaining ?? activeRecs.length,
              color: "text-amber-700",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm sm:px-4"
            >
              <p className={`text-xl font-bold sm:text-2xl ${s.color}`}>{s.value}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                {s.label}
              </p>
            </div>
          ))}
        </section>

        {queueControls}

      {saveFeedback && !pendingAction && (
        <div className="mb-4">
          <div role="alert" className={`rounded-xl border p-3 text-sm font-semibold shadow-sm ${saveFeedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : saveFeedback.type === 'info' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            {saveFeedback.message}
          </div>
        </div>
      )}

      {rmaRecords.length > 0 && <section aria-label="RMA tasks" className="mb-5 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">RMA transport tasks</h2>
          <p className="mt-1 text-sm text-slate-600">{dashboardCounts?.rma_active ?? rmaRecords.filter(record => record.rma_transport_status !== 'COMPLETED').length} active · {dashboardCounts?.rma_completed ?? rmaRecords.filter(record => record.rma_transport_status === 'COMPLETED').length} awaiting receipt</p>
        </div>
        {rmaRecords.map(record => <div key={record.id} className="space-y-2"><h3 className="font-bold text-slate-900">{record.rma_reference || record.reference || record.id} · {record.company_name}</h3><RmaWorkflowPanel record={record} currentUserRole="Driver" /></div>)}
      </section>}

      {/* Body */}
      <div className="space-y-4">
        {dataLoading && (
          <div role="status" className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading runs…
          </div>
        )}

        {!dataLoading && runsInScope === 0 && rmaRecords.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
            <p className="font-bold text-slate-600">
              {dashboardCounts ? 'No records in this queue.' : 'No runs ready for execution today.'}
            </p>
            <p className="text-xs mt-1">
              Check back later or contact Logistics.
            </p>
          </div>
        )}

        {/* Active records */}
        <section aria-label="Active runs" className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {activeRecs.map((rec) => {
          const daysLate = dashboardRunDaysLate(rec, today);
          const futureStarted = rec.category === 'Deliveries' && deliveryScheduleState(rec.delivery_date, today).future && hasValidRunTimeIn(rec.time_in);
          return (
            <div
              key={rec.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:items-center">
                <div className="min-w-0">
                  <p className="break-all font-mono text-[11px] text-slate-500">
                    {rec.reference}
                  </p>
                  <p className="mt-0.5 break-words text-sm font-semibold leading-snug text-slate-900">
                    {rec.company_name}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {daysLate > 0 && rec.category === 'Deliveries' && (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
                      Overdue · {daysLate} day{daysLate === 1 ? '' : 's'} late
                    </span>
                  )}
                  {futureStarted && (
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">Started</span>
                  )}
                  <RecordStatus record={rec} />
                </div>
              </div>

              <div className="px-4 py-3 space-y-3">
                <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2 text-sm text-slate-600">
                  <p className="flex min-w-0 items-center gap-1.5 break-words">
                    <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    {rec.area}
                  </p>
                  {rec.item_description && (
                    <p className="flex min-w-0 items-center gap-1.5 break-words">
                      <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
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
                      disabled={saving || !access.canRecord(rec.category, 'TIME_IN') || !canRecordTimeIn(rec)}
                      className="min-h-11 w-full rounded-lg bg-[#0078C1] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1F3864] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Clock className="w-4 h-4" /> Record Time In
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700 font-bold">
                      <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                      Time In recorded: {fmtTime(rec.time_in)}
                    </div>
                  )}

                  {/* Step 2: Proof of Delivery */}
                  <PodUploader recordId={rec.id} required disabled={saving} onReadinessChange={onPodReadinessChange} />

                  {/* Receiver name is required for completion. */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" /> Received By *
                    </label>
                    <input
                      type="text"
                      value={receivedByInputs[rec.id] ?? rec.received_by ?? ""}
                      onChange={(e) =>
                        setReceivedByInputs((prev) => ({
                          ...prev,
                          [rec.id]: e.target.value,
                        }))
                      }
                      placeholder="Name of person who received the item…"
                      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0078C1] focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30"
                    />
                  </div>

                  {completionError(rec, "Delivered", receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id]) && <p className="text-xs text-slate-600">{completionError(rec, "Delivered", receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id])}</p>}
                  {/* Step 3: Status buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        setPendingAction({ rec, status: "Delivered" });
                        setRemarksInput("");
                        setSaveFeedback(null);
                      }}
                      disabled={saving || !access.canRecord(rec.category, 'COMPLETE') || !access.canRecord(rec.category, 'STATUS') || !(rec.allowed_statuses ?? []).includes("Delivered") || !!completionError(rec, "Delivered", receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id])}
                      className="min-h-11 rounded-lg bg-emerald-700 px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 flex flex-col items-center justify-center gap-1 cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" /> Accomplish
                    </button>
                    <button
                      onClick={() => {
                        setPendingAction({ rec, status: "Pending" });
                        setRemarksInput("");
                        setSaveFeedback(null);
                      }}
                      disabled={saving || !access.canRecord(rec.category, 'STATUS') || !(rec.allowed_statuses ?? []).includes("Pending")}
                      className="min-h-11 rounded-lg bg-amber-600 px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 flex flex-col items-center justify-center gap-1"
                    >
                      <Navigation className="w-4 h-4" /> Pending
                    </button>
                    <button
                      onClick={() => {
                        setPendingAction({ rec, status: "Rescheduled" });
                        setRemarksInput("");
                        setSaveFeedback(null);
                      }}
                      disabled={saving || !access.canRecord(rec.category, 'STATUS') || !(rec.allowed_statuses ?? []).includes("Rescheduled")}
                      className="min-h-11 rounded-lg bg-[#1F3864] px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[#0078C1] disabled:cursor-not-allowed disabled:opacity-50 flex flex-col items-center justify-center gap-1"
                    >
                      <RefreshCw className="w-4 h-4" /> Reschedule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </section>

        {/* Completed records */}
        {doneRecs.length > 0 && (
          <section aria-label="Accomplished runs" className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Accomplished ({doneRecs.length})</h2>
            {doneRecs.map((rec) => (
              <button
                type="button"
                key={rec.id}
                onClick={() => setSelectedDoneRecord(rec)}
                className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-slate-500">
                    {rec.reference}
                  </p>
                  <p className="break-words text-sm font-semibold text-slate-900">
                    {rec.company_name}
                  </p>
                  {rec.completed_late && (
                    <p className="mt-1 text-xs font-semibold text-rose-700">
                      Completed {rec.days_late ?? 0} day{rec.days_late === 1 ? '' : 's'} late
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                    <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                    {rec.area}
                  </p>
                  {(rec.time_in || rec.time_out) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
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
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <UserCheck className="w-3 h-3" /> {rec.received_by}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  Done
                </span>
              </button>
            ))}
          </section>
        )}

        {/* Upcoming and other-date records stay visible without execution controls. */}
        {records.filter(
          (r) => !isDashboardRunActionable(r, today) && r.status !== "Delivered",
        ).length > 0 && (
          <section aria-label="Upcoming and other-date runs" className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Upcoming / Other Dates</h2>
            {records
              .filter((r) => !isDashboardRunActionable(r, today) && r.status !== "Delivered")
              .map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div>
                    <p className="font-mono text-[11px] text-slate-500">
                      {rec.reference} · {rec.delivery_date}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      {rec.company_name}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {rec.area}{rec.item_description ? ` · ${rec.item_description}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                      {rec.category === 'Deliveries'
                        ? deliveryScheduleState(rec.delivery_date, today).valid ? 'Upcoming · read-only' : 'Delivery Date needed · read-only'
                        : 'Other date · read-only'}
                    </span>
                    <RecordStatus record={rec} />
                  </div>
                </div>
              ))}
          </section>
        )}
      </div>

      {/* Status confirmation modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm space-y-4 p-6 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Confirm Status
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mark{" "}
                  <span className="font-bold text-slate-800">
                    {pendingAction.rec.reference}
                  </span>{" "}
                  as{" "}
                  <span className="font-bold text-slate-800">
                    {STATUS_VERB[pendingAction.status] ?? pendingAction.status}
                  </span>
                </p>
              </div>
              <button
                disabled={saving}
                onClick={() => {
                  setPendingAction(null);
                  setRemarksInput("");
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="driver-action-remarks" className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                Remarks — reason for change (required)
              </label>
              <p id="driver-action-remarks-help" className="text-xs text-slate-600">Explain why you are making this change. The reason is saved with your name in the record history.</p>
              <textarea
                id="driver-action-remarks"
                aria-describedby="driver-action-remarks-help"
                required
                value={remarksInput}
                onChange={(e) => setRemarksInput(e.target.value)}
                rows={3}
                placeholder="Enter remarks…"
                autoFocus
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] resize-none"
              />
            </div>

            {photoError && <p role="alert" className="text-xs text-red-700">{photoError}</p>}
            {saveFeedback && <p role="alert" className={`text-xs ${saveFeedback.type === 'success' ? 'text-emerald-700' : saveFeedback.type === 'info' ? 'text-amber-700' : 'text-red-700'}`}>{saveFeedback.message}</p>}
            <div className="flex gap-2 justify-end">
              <button
                disabled={saving}
                onClick={() => {
                  setPendingAction(null);
                  setRemarksInput("");
                }}
                className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={saving || !remarksInput.trim() || !!photoError}
                onClick={async () => {
                  if (saving || !remarksInput.trim() || photoError) return;
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
                className="px-4 py-2 bg-[#1F3864] hover:bg-[#0078C1] text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDoneRecord && (
        <DoneRecordModal
          record={selectedDoneRecord}
          onClose={() => setSelectedDoneRecord(null)}
        />
      )}
      </main>
    </div>
  );
}
