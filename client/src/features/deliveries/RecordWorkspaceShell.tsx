import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { CompanyHistoryButton } from '@/components/CompanyHistoryPanel';
import RecordStatus from '@/components/RecordStatus';
import { screenKeyForCategory } from '@/routes/screenRouting';
import { useUIStore } from '@/store/uiStore';
import type { DeliveryRecord } from '@/types';
import { formatManilaTime, formatManilaTimestamp as formatTs } from '@/utils/manilaTimestamp';
import { recordLabel } from '@/utils/recordLabel';
import { INTERNAL_TRANSFER_LABEL } from '@/utils/rma';
import { useWorkspaceNavigation } from './WorkspaceDrafts';
import WorkspaceTabs, { type WorkspaceTab } from './WorkspaceTabs';

export const PRIORITY_BADGE_COLOR: Record<string, string> = {
  '1 - Low':      'bg-slate-100 text-slate-700 border-slate-200',
  '2 - Moderate': 'bg-amber-50 text-amber-700 border-amber-200',
  '3 - High':     'bg-red-50 text-red-700 border-red-200',
};

export function getStartTimeDisplay(
  record: DeliveryRecord,
  formatTimestamp: (value: string | null | undefined) => string = formatTs,
) {
  if (record.category !== 'RMA') return { label: 'Time In', value: formatTimestamp(record.time_in) };
  if (!record.rma_movement) return { label: 'Transport started', value: 'Not selected' };
  if (record.rma_movement !== 'LOGISTICS_TRANSPORT') return { label: 'Transport started', value: 'Not applicable' };
  return { label: 'Transport started', value: formatTimestamp(record.rma_transport_started_at) };
}

export interface RecordWorkspaceShellProps {
  id: string;
  tabsId: string;
  record: DeliveryRecord;
  allRecordIds: string[];
  onBack: () => void;
  onNavigateToRecord: (id: string) => void;
  tabs: WorkspaceTab[];
  renderPanel: (tabId: string) => ReactNode;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  headerActions?: ReactNode;
  topNotice?: ReactNode;
  summaryBadges?: ReactNode;
  children?: ReactNode;
}

/**
 * Shared outer workspace chrome for all 5 operational record categories
 * (Deliveries, RMA, Procurement Pick-up, Sales Orders, and Accounting Collection).
 */
export function RecordWorkspaceShell({
  id,
  tabsId,
  record,
  allRecordIds,
  onBack,
  onNavigateToRecord,
  tabs,
  renderPanel,
  activeTab,
  onTabChange,
  headerActions,
  topNotice,
  summaryBadges,
  children,
}: RecordWorkspaceShellProps) {
  const { requestLeave, pending } = useWorkspaceNavigation();
  const navigationNonce = useUIStore(s => s.navigationNonce);
  const currentScreen = useUIStore(s => s.currentScreen);
  const selectedRecordId = useUIStore(s => s.selectedRecordId);
  const navigate = useUIStore(s => s.handleNavigate);
  const initialNavigationNonce = useRef(navigationNonce);
  const moduleScreen = screenKeyForCategory(record.category);

  useEffect(() => {
    if (navigationNonce === initialNavigationNonce.current) return;
    initialNavigationNonce.current = navigationNonce;

    if (currentScreen !== moduleScreen || selectedRecordId) return;
    requestLeave(onBack);
  }, [navigationNonce, currentScreen, selectedRecordId, moduleScreen, requestLeave, onBack]);

  const currentIndex = allRecordIds.indexOf(record.id);
  const prevId = currentIndex > 0 ? allRecordIds[currentIndex - 1] : null;
  const nextId = currentIndex < allRecordIds.length - 1 ? allRecordIds[currentIndex + 1] : null;

  const startTimeSummary = getStartTimeDisplay(record, value =>
    record.category === 'RMA' ? formatTs(value) : formatManilaTime(value),
  );

  return (
    <div className="space-y-4" id={id}>
      {topNotice}

      {/* Top breadcrumb & record navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-slate-200/80 pb-3.5">
        <div className="flex min-w-[14rem] flex-1 items-center gap-2.5">
          <button
            type="button"
            onClick={() => requestLeave(onBack)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-brand-blue hover:text-brand-navy text-xs font-semibold transition-colors cursor-pointer shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue rounded"
          >
            <ArrowLeft className="w-4 h-4" />
            {record.category}
          </button>
          <span className="text-slate-300">/</span>
          <span className="tabular-nums font-semibold text-slate-900 text-sm truncate">{recordLabel(record)}</span>
          <span className="text-slate-500 text-xs truncate hidden sm:inline">— {record.company_name}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (prevId) requestLeave(() => onNavigateToRecord(prevId));
              }}
              disabled={!prevId || pending}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 bg-white rounded-lg hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-slate-600 cursor-pointer"
              title="Previous Record"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <span className="text-xs text-slate-500 tabular-nums px-1.5 hidden sm:inline">
              {currentIndex + 1} / {allRecordIds.length}
            </span>
            <button
              type="button"
              onClick={() => {
                if (nextId) requestLeave(() => onNavigateToRecord(nextId));
              }}
              disabled={!nextId || pending}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 bg-white rounded-lg hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-slate-600 cursor-pointer"
              title="Next Record"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {headerActions}
        </div>
      </div>

      {/* Record summary strip */}
      <section aria-label="Record summary" className="rounded-xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <CompanyHistoryButton
            companyId={record.company_id}
            companyName={record.company_name}
            currentRecordId={record.id}
            disabled={pending}
            className="font-semibold text-sm text-slate-900"
            onOpenRecord={(screen, targetId) => requestLeave(() => navigate(screen, targetId))}
          />
          <span className="text-slate-400">·</span>
          <span className="text-slate-600 font-medium">{record.category}</span>
          <RecordStatus record={record} />
          {record.category === 'RMA' && record.rma_type && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-medium text-slate-700">{record.rma_type}</span>
          )}
          {record.category === 'RMA' && record.is_internal_transfer && (
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 font-semibold text-indigo-700" title={INTERNAL_TRANSFER_LABEL}>Internal Transfer</span>
          )}
          {summaryBadges}
          <span
            className={`rounded-full border px-2.5 py-0.5 font-medium ${
              PRIORITY_BADGE_COLOR[record.priority] ?? 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            Priority: {record.priority}
          </span>
        </div>
        <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-slate-700">
          {[
            ['Driver', record.driver || 'Unassigned'],
            ['Delivery date', record.delivery_date],
            [record.category === 'RMA' ? startTimeSummary.label : 'Time in', startTimeSummary.value],
            [
              record.category === 'RMA' ? 'Completed at' : 'Time out',
              formatManilaTime(record.category === 'RMA' ? record.rma_completed_at ?? record.time_out : record.time_out),
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-1.5">
              <dt className="text-slate-500">{label}:</dt>
              <dd className="font-semibold text-slate-800 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <WorkspaceTabs
        key={record.id}
        id={tabsId}
        tabs={tabs}
        renderPanel={renderPanel}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />

      {children}
    </div>
  );
}
