import RecordStatus from '@/components/RecordStatus';
import { usePermissions } from '@/hooks/usePermissions';
import RmaWorkflowPanel from '@/features/deliveries/RmaWorkflowPanel';
import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  CheckCircle,
  Copy,
  MapPin,
  Package,
  RefreshCw,
  Navigation,
  Clock,
  UserCheck,
  X,
} from "lucide-react";
import { DeliveryRecord, DeliveryStatus } from "@/types";
import PodUploader from "@/components/PodUploader";
import { completionError, type PodReadiness } from "@/utils/podRequirement";

import { useRecordTimeInMutation, usePagedRecordsQuery } from '@/api/queries/useRecordsQuery';
import { useDriverOverviewQuery, useClampRecordPage } from '@/api/queries/useOperationalViews';
import RecordPageControls from '@/components/RecordPageControls';
import { canRecordTimeIn, dashboardRunDaysLate, deliveryScheduleState, hasValidRunTimeIn, isDashboardRunActionable, isDraftRecord, manilaToday } from '@/utils/recordLifecycle';
import DoneRecordModal from "./DoneRecordModal";
import DriverQueueSwitch, { type DriverQueue } from './DriverQueueSwitch';
import { uploadStagedFiles } from '@/api/queries/usePodAttachments';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from '@/utils/notify';
import AccountMenu from '@/layouts/AccountMenu';
import { DashboardPage, DashboardPanel, EmptyState, KpiTile, TileSkeleton, formatDate } from './ui';

interface DriverDashboardProps {
  records: DeliveryRecord[];
  currentUserName: string;
  currentUserEmail: string;
  canManageAdmin: boolean;
  onNavigate: (screen: string) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  onLogout: () => void;
  /** Refreshes the run queues and counters together. */
  onRefresh?: () => Promise<void> | void;
  dataLoading: boolean;
  serverPaging?: boolean;
  /** Queue switch shown above the run list. */
  queueSwitch?: ReactNode;
  /** Pagination shown under the run list. */
  listFooter?: ReactNode;
  dashboardCounts?: { today: number; remaining: number; completed: number; rma_active: number; rma_completed: number };
}

const RUN_LIST_ID = 'driver-run-list';

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

const NO_REFERENCE = 'No reference yet';

function categoryLabelFor(rec: DeliveryRecord): string {
  return rec.category === 'RMA' ? 'RMA transport' : rec.category === 'Deliveries' ? 'Delivery' : rec.category;
}

/** The reference a driver can quote to the office. Never the internal record id. */
function referenceFor(rec: Pick<DeliveryRecord, 'category' | 'reference' | 'rma_reference'>): string | null {
  const value = rec.category === 'RMA' ? rec.rma_reference || rec.reference : rec.reference;
  return value?.trim() || null;
}

function dueLabel(date: string | null | undefined): string {
  return date ? `Due ${formatDate(date)}` : 'Due date not set';
}

function CategoryBadge({ label, rma }: { label: string; rma: boolean }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${rma ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{label}</span>;
}

function CustomerName({ name }: { name: string }) {
  return <p className="line-clamp-2 break-words text-base font-semibold leading-snug text-slate-900" title={name} data-customer-name>{name}</p>;
}

/** One-line reference. Tapping it copies the full value when `copyable`. */
function RecordReference({ value, copyable = false }: { value: string | null; copyable?: boolean }) {
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
function ClampedText({ text }: { text: string }) {
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

export default function DriverDashboard(props: DriverDashboardProps) {
  return props.serverPaging ? <PagedDriverDashboard {...props} /> : <DriverDashboardContent {...props} />;
}
function PagedDriverDashboard(props: DriverDashboardProps) {
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<DriverQueue>('active');
  const query = usePagedRecordsQuery({ view: 'driver_dashboard', queue, page, limit: 25 });
  const overview = useDriverOverviewQuery();
  useClampRecordPage(page, query.data?.total, setPage);
  const pageChanged = useRef(false);
  // After a page change, bring the driver back to the top of the list.
  useEffect(() => {
    if (!pageChanged.current) return;
    pageChanged.current = false;
    const list = document.getElementById(RUN_LIST_ID);
    list?.scrollIntoView?.({ block: 'start' });
    list?.focus({ preventScroll: true });
  }, [page]);
  const changePage = (next: number) => { pageChanged.current = true; setPage(next); };
  const totals = overview.data?.dashboard;
  const queueSwitch = <section aria-label="Run queues" className="space-y-3">
    <DriverQueueSwitch queue={queue} controls={RUN_LIST_ID} onChange={value => { setQueue(value); setPage(1); }}
      counts={totals ? { active: totals.remaining + totals.rma_active, done: totals.completed + totals.rma_completed } : undefined} />
    {query.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Could not load records. <button type="button" onClick={() => { void query.refetch(); void overview.refetch(); }} className="min-h-11 font-semibold underline">Retry</button>
    </p>}
  </section>;
  const listFooter = query.isPending || query.error ? null
    : <RecordPageControls page={page} total={query.data?.total ?? 0} onPageChange={changePage} collapseSinglePage />;

  return <DriverDashboardContent {...props} records={query.data?.rows ?? []} dashboardCounts={overview.data?.dashboard}
    dataLoading={query.isPending} queueSwitch={queueSwitch} listFooter={listFooter} />;
}
function DriverDashboardContent({
  records,
  currentUserName,
  currentUserEmail,
  canManageAdmin,
  onNavigate,
  onUpdateRecord,
  onLogout,
  onRefresh,
  dataLoading, dashboardCounts, queueSwitch, listFooter,
}: DriverDashboardProps) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh ? async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } } : undefined;
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
  // While the first load is in flight there is nothing trustworthy to count.
  const summaryLoading = dataLoading && records.length === 0 && !dashboardCounts;

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
            <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">Microgenesis Field Mobile</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <p className="hidden text-sm text-slate-600 sm:block">{currentUserName}</p>
            <AccountMenu name={currentUserName} email={currentUserEmail} role="Driver"
              canManageAdmin={canManageAdmin} onNavigate={onNavigate} onLogout={onLogout} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <DashboardPage title="Driver dashboard" subtitle={todayLabel} id="driver-dashboard" onRefresh={refresh} refreshing={refreshing} touchFriendly>
        <section aria-label="Driver summary" className="grid grid-cols-3 gap-2 sm:gap-3">
          <KpiTile size="compact" label="Today's runs" value={summaryLoading ? null : dashboardCounts?.today ?? todayRecs.length} />
          <KpiTile size="compact" label="Accomplished" value={summaryLoading ? null : dashboardCounts ? dashboardCounts.completed + dashboardCounts.rma_completed : accomplishedRecords.length} />
          <KpiTile size="compact" label="Remaining" value={summaryLoading ? null : dashboardCounts ? dashboardCounts.remaining + dashboardCounts.rma_active : activeWorkRecords.length} />
        </section>

        {queueSwitch}

      {saveFeedback && !pendingAction && (
        <div>
          <div role="alert" className={`rounded-xl border p-3 text-sm font-semibold shadow-sm ${saveFeedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : saveFeedback.type === 'info' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            {saveFeedback.message}
          </div>
        </div>
      )}

      {/* Body: the run list, then its pagination */}
      <div id={RUN_LIST_ID} tabIndex={-1} aria-label="Run list" className="space-y-4 focus:outline-none">
        {dataLoading && <TileSkeleton lines={3} />}

        {!dataLoading && recordsInScope === 0 && (
          <EmptyState
            title={dashboardCounts ? 'No records in this queue.' : 'No runs ready for execution today.'}
            description="Check back later or contact Logistics."
          />
        )}

        {activeWorkRecords.length > 0 && <DashboardPanel title={`Active work (${activeWorkRecords.length})`}>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
            {activeWorkRecords.map(rec => {
              const isRma = rec.category === 'RMA';
              const categoryLabel = categoryLabelFor(rec);
              const recordLabel = referenceFor(rec);
              const daysLate = isRma ? 0 : dashboardRunDaysLate(rec, today);
              const futureStarted = !isRma && deliveryScheduleState(rec.delivery_date, today).future && hasValidRunTimeIn(rec.time_in);
              return <article
                aria-label={`Active ${categoryLabel.toLowerCase()} ${recordLabel ?? NO_REFERENCE.toLowerCase()}, ${rec.company_name}`}
                key={rec.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="space-y-1.5 border-b border-slate-100 bg-white px-4 py-3" data-card-header>
                  <div className="flex flex-wrap items-center gap-1.5" data-card-badges>
                    <CategoryBadge label={categoryLabel} rma={isRma} />
                    {futureStarted && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Started</span>}
                    <RecordStatus record={rec} compact={isRma} />
                  </div>
                  <CustomerName name={rec.company_name} />
                  <RecordReference value={recordLabel} copyable />
                </div>

                <div className="space-y-3 px-4 py-3">
                  <ul className="space-y-1.5 text-sm text-slate-600" aria-label="Run details">
                    <li className="flex min-w-0 items-start gap-2"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /><span className="min-w-0 break-words">{rec.area || 'Area not set'}</span></li>
                    <li className={`flex min-w-0 items-start gap-2 ${daysLate > 0 ? 'font-semibold text-rose-700' : ''}`} data-due-date>
                      <Clock aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${daysLate > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
                      <span>{dueLabel(rec.delivery_date)}{daysLate > 0 && ` · ${daysLate} day${daysLate === 1 ? '' : 's'} late`}</span>
                    </li>
                    {rec.item_description && <li className="flex min-w-0 items-start gap-2"><Package aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><ClampedText text={rec.item_description} /></li>}
                  </ul>

                  {isRma ? <RmaWorkflowPanel record={rec} currentUserRole="Driver" embedded /> : (
                    <div className="space-y-2.5 border-t border-slate-100 pt-3">
                      {!rec.time_in ? (
                        <button
                          onClick={() => handleTimeIn(rec)}
                          aria-label="Record Time In: start transport"
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
                        <label className="flex items-center gap-1 text-sm font-semibold text-slate-700">
                          <UserCheck aria-hidden="true" className="h-3.5 w-3.5" />Received by *
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
                          className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-emerald-700 px-2 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                        ><CheckCircle aria-hidden="true" className="h-4 w-4" />Accomplish</button>
                        <button
                          onClick={() => { setPendingAction({ rec, status: 'Pending' }); setRemarksInput(''); setSaveFeedback(null); }}
                          disabled={saving || !access.canRecord(rec.category, 'STATUS') || !(rec.allowed_statuses ?? []).includes('Pending')}
                          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg bg-amber-600 px-2 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                        ><Navigation aria-hidden="true" className="h-4 w-4" />Pending</button>
                        <button
                          onClick={() => { setPendingAction({ rec, status: 'Rescheduled' }); setRemarksInput(''); setSaveFeedback(null); }}
                          disabled={saving || !access.canRecord(rec.category, 'STATUS') || !(rec.allowed_statuses ?? []).includes('Rescheduled')}
                          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg bg-[#1F3864] px-2 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0078C1] disabled:cursor-not-allowed disabled:opacity-50"
                        ><RefreshCw aria-hidden="true" className="h-4 w-4" />Reschedule</button>
                      </div>
                    </div>
                  )}
                </div>
              </article>;
            })}
          </div>
        </DashboardPanel>}

        {/* Completed records */}
        {accomplishedRecords.length > 0 && (
          <DashboardPanel title={`Accomplished (${accomplishedRecords.length})`}>
            <div className="space-y-3">
            {accomplishedRecords.map(rec => {
              const isRma = rec.category === 'RMA';
              const categoryLabel = categoryLabelFor(rec);
              const recordLabel = referenceFor(rec);
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
                className="block w-full space-y-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] cursor-pointer"
              >
                <span className="flex flex-wrap items-center gap-1.5" data-card-badges>
                  <CategoryBadge label={categoryLabel} rma={isRma} />
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{completionBadge}</span>
                </span>
                <CustomerName name={rec.company_name} />
                <RecordReference value={recordLabel} />
                {rec.completed_late && (
                  <p className="text-xs font-semibold text-rose-700">
                    Completed {rec.days_late ?? 0} day{rec.days_late === 1 ? '' : 's'} late
                  </p>
                )}
                <p className="flex items-start gap-1.5 text-xs text-slate-600">
                  <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                  <span className="min-w-0 break-words">{rec.area || 'Area not set'}</span>
                </p>
                {(startedAt || finishedAt) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-600">
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
                  <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <UserCheck aria-hidden="true" className="h-3 w-3" /> {isRma ? rec.rma_recipient : rec.received_by}
                  </p>
                )}
              </button>;
            })}
            </div>
          </DashboardPanel>
        )}

        {/* Upcoming and other-date records stay visible without execution controls. */}
        {records.filter(
          (r) => r.category !== 'RMA' && !isDashboardRunActionable(r, today) && r.status !== "Delivered",
        ).length > 0 && (
          <DashboardPanel title="Upcoming and other dates">
            <div className="space-y-3">
            {records
              .filter((r) => r.category !== 'RMA' && !isDashboardRunActionable(r, today) && r.status !== "Delivered")
              .map((rec) => (
                <div
                  key={rec.id}
                  className="space-y-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-1.5" data-card-badges>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {rec.category === 'Deliveries'
                        ? deliveryScheduleState(rec.delivery_date, today).valid ? 'Upcoming · read-only' : 'Delivery Date needed · read-only'
                        : 'Other date · read-only'}
                    </span>
                    <RecordStatus record={rec} />
                  </div>
                  <CustomerName name={rec.company_name} />
                  <RecordReference value={referenceFor(rec)} copyable />
                  <p className="flex items-start gap-1.5 text-xs text-slate-600">
                    <Clock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />{dueLabel(rec.delivery_date)}
                  </p>
                  <p className="flex items-start gap-1.5 text-xs text-slate-600">
                    <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    <span className="min-w-0 break-words">{rec.area || 'Area not set'}{rec.item_description ? ` · ${rec.item_description}` : ''}</span>
                  </p>
                </div>
              ))}
            </div>
          </DashboardPanel>
        )}

        {listFooter && <div data-run-list-footer>{listFooter}</div>}
      </div>

      {/* Status confirmation modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm space-y-4 p-6 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Confirm status
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
              <label htmlFor="driver-action-remarks" className="text-sm font-semibold text-slate-700 block">
                Remarks, reason for change (required)
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
        </DashboardPage>
      </main>
    </div>
  );
}
