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

function isManilaDate(iso: string | null | undefined, targetDate: string): boolean {
  if (!iso) return false;
  const timestamp = new Date(iso);
  if (Number.isNaN(timestamp.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(timestamp);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}` === targetDate;
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
      error={query.error} retry={() => { void query.refetch(); void overview.refetch(); }} />
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
  const allRmaTransportRecords = records.filter(record => record.category === 'RMA' && record.rma_movement === 'LOGISTICS_TRANSPORT');
  const completedRmaIds = new Set(allRmaTransportRecords
    .filter(record => record.rma_transport_status === 'COMPLETED'
      ? record.status !== 'Delivered' || isManilaDate(record.rma_transport_completed_at ?? record.rma_completed_at, today)
      : record.status === 'Delivered' && isManilaDate(record.rma_completed_at, today))
    .map(record => record.id));
  const activeRmaRecords = allRmaTransportRecords.filter(record => record.status !== 'Delivered' && record.rma_transport_status !== 'COMPLETED');
  records = records.filter(record => record.category !== 'RMA' || completedRmaIds.has(record.id));
  const accessibleRecords = [...records, ...activeRmaRecords];
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
  const todayRecs = accessibleRecords.filter((r) => r.delivery_date === today);
  const actionableRecs = records.filter(record => isDashboardRunActionable(record, today));
  const activeRecs = actionableRecs.filter((r) => r.status !== "Delivered");
  const activeWorkRecords = [...activeRecs, ...activeRmaRecords]
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  const accomplishedRecords = records.filter(r => r.category === 'RMA'
    ? completedRmaIds.has(r.id)
    : r.status === 'Delivered' && (dashboardCounts ? true : r.category === 'Deliveries'
      ? r.delivery_date === today || !!r.completed_late || (deliveryScheduleState(r.delivery_date, today).future && hasValidRunTimeIn(r.time_in))
      : r.delivery_date === today));
  const recordsInScope = activeWorkRecords.length + accomplishedRecords.length;

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
              value: dashboardCounts ? dashboardCounts.completed + dashboardCounts.rma_completed : accomplishedRecords.length,
              color: "text-emerald-700",
            },
            {
              label: "Remaining",
              value: dashboardCounts ? dashboardCounts.remaining + dashboardCounts.rma_active : activeWorkRecords.length,
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

      {/* Body */}
      <div className="space-y-4">
        {dataLoading && (
          <div role="status" className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading runs…
          </div>
        )}

        {!dataLoading && recordsInScope === 0 && (
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

        {activeWorkRecords.length > 0 && <section aria-label="Active work" className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Active work ({activeWorkRecords.length})</h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {activeWorkRecords.map(rec => {
              const isRma = rec.category === 'RMA';
              const categoryLabel = isRma ? 'RMA transport' : rec.category === 'Deliveries' ? 'Delivery' : rec.category;
              const recordLabel = isRma ? rec.rma_reference || rec.reference || rec.id : rec.reference || rec.id;
              const daysLate = dashboardRunDaysLate(rec, today);
              const futureStarted = !isRma && deliveryScheduleState(rec.delivery_date, today).future && hasValidRunTimeIn(rec.time_in);
              return <article
                aria-label={`Active ${categoryLabel.toLowerCase()} ${recordLabel}`}
                key={rec.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:items-center">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-[11px] text-slate-500">{recordLabel}</p>
                    <p className="mt-0.5 break-words text-sm font-semibold leading-snug text-slate-900">{rec.company_name}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${isRma ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                      {categoryLabel}
                    </span>
                    {daysLate > 0 && !isRma && <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">Overdue · {daysLate} day{daysLate === 1 ? '' : 's'} late</span>}
                    {futureStarted && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">Started</span>}
                    <RecordStatus record={rec} compact={isRma} />
                  </div>
                </div>

                <div className="space-y-3 px-4 py-3">
                  <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2 text-sm text-slate-600">
                    <p className="flex min-w-0 items-center gap-1.5 break-words"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-red-400" />{rec.area || 'Area not set'}</p>
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />Due {rec.delivery_date || 'date not set'}</p>
                    {rec.item_description && <p className="flex min-w-0 items-center gap-1.5 break-words"><Package aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />{rec.item_description.slice(0, 40)}{rec.item_description.length > 40 ? '…' : ''}</p>}
                  </div>

                  {isRma ? <RmaWorkflowPanel record={rec} currentUserRole="Driver" embedded /> : (
                    <div className="space-y-2.5 border-t border-slate-100 pt-3">
                      {!rec.time_in ? (
                        <button
                          onClick={() => handleTimeIn(rec)}
                          aria-label="Record Time In — Start transport"
                          disabled={saving || !access.canRecord(rec.category, 'TIME_IN') || !canRecordTimeIn(rec)}
                          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0078C1] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1F3864] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Clock aria-hidden="true" className="h-4 w-4" /> Start transport
                        </button>
                      ) : <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                        <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-500" />Transport started: {fmtTime(rec.time_in)}
                      </div>}

                      <PodUploader recordId={rec.id} required disabled={saving} onReadinessChange={onPodReadinessChange} />

                      <div className="space-y-1">
                        <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <UserCheck aria-hidden="true" className="h-3.5 w-3.5" />Received By *
                        </label>
                        <input
                          type="text"
                          value={receivedByInputs[rec.id] ?? rec.received_by ?? ''}
                          onChange={event => setReceivedByInputs(previous => ({ ...previous, [rec.id]: event.target.value }))}
                          placeholder="Name of person who received the item…"
                          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0078C1] focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30"
                        />
                      </div>

                      {completionError(rec, 'Delivered', receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id]) && <p className="text-xs text-slate-600">{completionError(rec, 'Delivered', receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id])}</p>}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => { setPendingAction({ rec, status: 'Delivered' }); setRemarksInput(''); setSaveFeedback(null); }}
                          disabled={saving || !access.canRecord(rec.category, 'COMPLETE') || !access.canRecord(rec.category, 'STATUS') || !(rec.allowed_statuses ?? []).includes('Delivered') || !!completionError(rec, 'Delivered', receivedByInputs[rec.id] ?? rec.received_by, podStates[rec.id])}
                          className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-emerald-700 px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                        ><CheckCircle aria-hidden="true" className="h-4 w-4" />Accomplish</button>
                        <button
                          onClick={() => { setPendingAction({ rec, status: 'Pending' }); setRemarksInput(''); setSaveFeedback(null); }}
                          disabled={saving || !access.canRecord(rec.category, 'STATUS') || !(rec.allowed_statuses ?? []).includes('Pending')}
                          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg bg-amber-600 px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                        ><Navigation aria-hidden="true" className="h-4 w-4" />Pending</button>
                        <button
                          onClick={() => { setPendingAction({ rec, status: 'Rescheduled' }); setRemarksInput(''); setSaveFeedback(null); }}
                          disabled={saving || !access.canRecord(rec.category, 'STATUS') || !(rec.allowed_statuses ?? []).includes('Rescheduled')}
                          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg bg-[#1F3864] px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[#0078C1] disabled:cursor-not-allowed disabled:opacity-50"
                        ><RefreshCw aria-hidden="true" className="h-4 w-4" />Reschedule</button>
                      </div>
                    </div>
                  )}
                </div>
              </article>;
            })}
          </div>
        </section>}

        {/* Completed records */}
        {accomplishedRecords.length > 0 && (
          <section aria-label="Accomplished records" className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Accomplished ({accomplishedRecords.length})</h2>
            {accomplishedRecords.map(rec => {
              const isRma = rec.category === 'RMA';
              const categoryLabel = isRma ? 'RMA transport' : rec.category === 'Deliveries' ? 'Delivery' : rec.category;
              const recordLabel = isRma ? rec.rma_reference || rec.reference || rec.id : rec.reference || rec.id;
              const startedAt = isRma ? rec.rma_transport_started_at : rec.time_in;
              const finishedAt = isRma ? rec.rma_transport_completed_at ?? rec.rma_completed_at : rec.time_out;
              const waitingTass = isRma && rec.status !== 'Delivered';
              const completionBadge = waitingTass
                ? rec.rma_received_at ? 'Awaiting TASS completion' : 'Awaiting TASS receipt'
                : isRma ? 'RMA complete' : 'Done';
              return <button
                type="button"
                key={rec.id}
                onClick={() => setSelectedDoneRecord(rec)}
                className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[11px] text-slate-500">{recordLabel}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isRma ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{categoryLabel}</span>
                  </div>
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
                  {(startedAt || finishedAt) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
                      {startedAt && (
                        <span className="flex items-center gap-1">
                          <Clock aria-hidden="true" className="h-3 w-3 text-blue-400" />Started: {fmtTime(startedAt)}
                        </span>
                      )}
                      {finishedAt && (
                        <span className="flex items-center gap-1">
                          <Clock aria-hidden="true" className="h-3 w-3 text-emerald-400" />{isRma && rec.rma_transport_completed_at ? 'Transport complete:' : isRma ? 'RMA complete:' : 'Completed:'} {fmtTime(finishedAt)}
                        </span>
                      )}
                    </div>
                  )}
                  {(rec.received_by || rec.rma_recipient) && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <UserCheck aria-hidden="true" className="h-3 w-3" /> {isRma ? rec.rma_recipient : rec.received_by}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  {completionBadge}
                </span>
              </button>;
            })}
          </section>
        )}

        {/* Upcoming and other-date records stay visible without execution controls. */}
        {records.filter(
          (r) => r.category !== 'RMA' && !isDashboardRunActionable(r, today) && r.status !== "Delivered",
        ).length > 0 && (
          <section aria-label="Upcoming and other-date runs" className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Upcoming / Other Dates</h2>
            {records
              .filter((r) => r.category !== 'RMA' && !isDashboardRunActionable(r, today) && r.status !== "Delivered")
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
                    notify.success(pendingAction.status === 'In Transit' ? 'Transport started successfully' : 'Status updated successfully');
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
