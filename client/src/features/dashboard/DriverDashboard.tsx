import RecordStatus from '@/components/RecordStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { MapPin, Clock, UserCheck, X } from "lucide-react";
import { DeliveryRecord } from "@/types";
import type { PodReadiness } from "@/utils/podRequirement";
import { driverCompletionError, jobTypeLabel } from '@/utils/driverJobs';
import DriverJobCard, { CustomerName, JobTypeBadge, NO_REFERENCE, RecordReference, dueLabel, fmtTime, referenceFor } from './DriverJobCard';
import { api } from '@/api';
import { invalidateOperationalQueries, normalizeApiRecord, saveRecordToCache } from '@/api/queries/useRecordsQuery';

import { useRecordTimeInMutation, usePagedRecordsQuery } from '@/api/queries/useRecordsQuery';
import { useDriverOverviewQuery, useClampRecordPage } from '@/api/queries/useOperationalViews';
import RecordPageControls from '@/components/RecordPageControls';
import { deliveryScheduleState, hasValidRunTimeIn, isDashboardRunActionable, isDraftRecord, manilaToday } from '@/utils/recordLifecycle';
import DoneRecordModal from "./DoneRecordModal";
import DriverQueueSwitch, { type DriverQueue } from './DriverQueueSwitch';
import { uploadStagedFiles } from '@/api/queries/usePodAttachments';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from '@/utils/notify';
import AccountMenu from '@/layouts/AccountMenu';
import { DashboardPage, DashboardPanel, EmptyState, KpiStrip, TileSkeleton } from './ui';

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

type DriverAction = 'start' | 'complete';
const ACTION_TITLE: Record<DriverAction, string> = { start: 'Start transport', complete: 'Complete delivery' };

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
    action: DriverAction;
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
  const receivedByFor = (rec: DeliveryRecord) => receivedByInputs[rec.id] ?? (rec.category === 'RMA' ? rec.rma_transport_received_by : rec.received_by) ?? '';
  const photoError = pendingAction?.action === 'complete'
    ? driverCompletionError(receivedByFor(pendingAction.rec), podStates[pendingAction.rec.id])
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

  // The button that opened the confirm sheet gets focus back when it closes.
  const sheetOpener = useRef<HTMLElement | null>(null);
  const openSheet = (rec: DeliveryRecord, action: DriverAction) => {
    sheetOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingAction({ rec, action });
    setRemarksInput("");
    setSaveFeedback(null);
  };
  const closeSheet = useCallback(() => {
    setPendingAction(null);
    setRemarksInput("");
    const opener = sheetOpener.current;
    sheetOpener.current = null;
    if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
  }, []);
  useEffect(() => {
    if (!pendingAction) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) closeSheet(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pendingAction, saving, closeSheet]);

  const saveRma = async (rec: DeliveryRecord, data: { transport_status: 'IN_TRANSIT' | 'COMPLETED'; remarks: string; received_by?: string }) => {
    const saved = await api.progressRmaTransport(rec.id, { ...data, expected_version: rec.rma_version ?? 0 });
    await saveRecordToCache(queryClient, normalizeApiRecord(saved));
    await invalidateOperationalQueries(queryClient);
  };

  /** Start transport: Time In for runs, transport start for RMA. */
  const startTransport = async (rec: DeliveryRecord, remarks: string) => {
    if (rec.category === 'RMA') return saveRma(rec, { transport_status: 'IN_TRANSIT', remarks });
    if (!access.canRecord(rec.category, 'TIME_IN')) throw new Error('This action is no longer available for your account.');
    await timeInMutation.mutateAsync({ id: rec.id, remarks });
  };

  /** Complete delivery: uploads the staged POD first, then completes with Received By. */
  const completeJob = async (rec: DeliveryRecord, remarks: string) => {
    const receivedBy = receivedByFor(rec).trim();
    await uploadStagedFiles(rec.id, queryClient);
    if (rec.category === 'RMA') return saveRma(rec, { transport_status: 'COMPLETED', remarks, received_by: receivedBy });
    if (!access.canRecord(rec.category, 'STATUS') || !access.canRecord(rec.category, 'COMPLETE')) throw new Error('This action is no longer available for your account.');
    await onUpdateRecord(rec.id, { status: 'Delivered', status_remarks: remarks, received_by: receivedBy } as any);
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
        <KpiStrip label="Driver summary" items={[
          { label: "Today's runs", shortLabel: 'Today', value: summaryLoading ? null : dashboardCounts?.today ?? todayRecs.length },
          { label: 'Accomplished', shortLabel: 'Done', value: summaryLoading ? null : dashboardCounts ? dashboardCounts.completed + dashboardCounts.rma_completed : accomplishedRecords.length },
          { label: 'Remaining', shortLabel: 'Left', value: summaryLoading ? null : dashboardCounts ? dashboardCounts.remaining + dashboardCounts.rma_active : activeWorkRecords.length },
        ]} />

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
            {activeWorkRecords.map(rec => <DriverJobCard
              key={rec.id}
              record={rec}
              today={today}
              saving={saving}
              receivedBy={receivedByFor(rec)}
              pod={podStates[rec.id]}
              onReceivedByChange={value => setReceivedByInputs(previous => ({ ...previous, [rec.id]: value }))}
              onPodReadinessChange={onPodReadinessChange}
              onStart={record => openSheet(record, 'start')}
              onComplete={record => openSheet(record, 'complete')}
            />)}
          </div>
        </DashboardPanel>}

        {/* Completed records */}
        {accomplishedRecords.length > 0 && (
          <DashboardPanel title={`Accomplished (${accomplishedRecords.length})`}>
            <div className="space-y-3">
            {accomplishedRecords.map(rec => {
              const isRma = rec.category === 'RMA';
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
                  <JobTypeBadge category={rec.category} />
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
                {(isRma ? rec.rma_transport_received_by || rec.rma_recipient : rec.received_by) && (
                  <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <UserCheck aria-hidden="true" className="h-3 w-3" /> {isRma ? rec.rma_transport_received_by || rec.rma_recipient : rec.received_by}
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

      {/* Status confirmation sheet: bottom sheet on phones, centered card from sm up */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="driver-confirm-title" aria-describedby="driver-confirm-summary"
            className="max-h-[90dvh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-sm sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="driver-confirm-title" className="text-base font-semibold text-slate-900">
                  {ACTION_TITLE[pendingAction.action]}
                </h2>
                <p id="driver-confirm-summary" className="mt-1 text-sm text-slate-600">
                  {pendingAction.action === 'start' ? 'Start transport for ' : 'Complete '}
                  <span className="font-semibold text-slate-900">{pendingAction.rec.company_name}</span>
                  {' '}({jobTypeLabel(pendingAction.rec.category)})
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500" title={referenceFor(pendingAction.rec) ?? undefined}>
                  {referenceFor(pendingAction.rec) ? `Ref ${referenceFor(pendingAction.rec)}` : NO_REFERENCE}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={saving}
                onClick={closeSheet}
                className="-mr-2 -mt-2 inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] disabled:opacity-50"
              >
                <X aria-hidden="true" className="h-5 w-5" />
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
                className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-base focus:border-[#0078C1] focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 sm:text-sm"
              />
            </div>

            {photoError && <p role="alert" className="text-sm text-red-700">{photoError}</p>}
            {saveFeedback && <p role="alert" className={`text-sm ${saveFeedback.type === 'success' ? 'text-emerald-700' : saveFeedback.type === 'info' ? 'text-amber-700' : 'text-red-700'}`}>{saveFeedback.message}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={closeSheet}
                className="min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !remarksInput.trim() || !!photoError}
                onClick={async () => {
                  if (saving || !remarksInput.trim() || photoError) return;
                  setSaving(true);
                  setSaveFeedback(null);
                  try {
                    const { rec, action } = pendingAction;
                    if (action === 'start') await startTransport(rec, remarksInput.trim());
                    else await completeJob(rec, remarksInput.trim());
                    closeSheet();
                    notify.success(action === 'start' ? 'Transport started' : rec.category === 'RMA' ? 'Transport complete. Waiting for TASS receipt.' : 'Delivery completed');
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Could not save. Please try again.';
                    setSaveFeedback({ message, type: 'error' });
                    notify.error(message);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="min-h-11 cursor-pointer rounded-xl bg-[#1F3864] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0078C1] disabled:cursor-not-allowed disabled:opacity-40"
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
