import { CheckCircle2, Navigation, RefreshCw, Truck, UserX } from 'lucide-react';
import { useState } from 'react';
import type { ApiDashboardOverview, ApiDashboardStats } from '@/api';
import type { DeliveryCategory, DeliveryRecord } from '@/types';
import { screenKeyForCategory } from '@/routes/screenRouting';
import { jobTypeLabel } from '@/utils/driverJobs';
import type { DashboardFilterId } from '@/utils/dashboardFilters';
import { ActionPill, ActionPillGroup, DashboardPage, DashboardPanel, EmptyState, KpiRow, KpiTile, PanelError, RecordTable, StatusPill, TileSkeleton, formatDate, type RecordColumn } from './ui';
import { recordLabel } from '../../utils/recordLabel';
import CompletedTodayDialog from './CompletedTodayDialog';

type LogisticsStats = Extract<ApiDashboardStats, { role: 'LOGISTICS' }>;

interface Props {
  /** null while the server numbers load. Tiles show skeletons, never locally counted guesses. */
  stats: LogisticsStats | null;
  overview?: ApiDashboardOverview;
  overviewStatus?: 'pending' | 'error' | 'success';
  onRetryOverview?: () => void;
  onNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  canAccess?: (screen: string) => boolean;
  canReadRecords?: boolean;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** Same started rule as the server: RMA by transport status, other jobs once Time In is recorded. */
const inTransit = (record: DeliveryRecord) => (record.category === 'RMA' ? record.rma_transport_status === 'IN_TRANSIT' : record.status === 'In Transit' || !!record.time_in);

/** Transport request types in footer order, keyed by the server's category. */
const REQUEST_TYPES: Array<{ key: 'DELIVERY' | 'RMA' | 'ACCOUNTING_COLLECTION' | 'PROCUREMENT_PICKUP' | 'SALES_ORDERS'; category: DeliveryCategory; one: string; many: string }> = [
  { key: 'DELIVERY', category: 'Deliveries', one: 'Delivery', many: 'Deliveries' },
  { key: 'RMA', category: 'RMA', one: 'RMA', many: 'RMA' },
  { key: 'ACCOUNTING_COLLECTION', category: 'Accounting Collection', one: 'Accounting Collection', many: 'Accounting Collections' },
  { key: 'PROCUREMENT_PICKUP', category: 'Procurement Pick-up', one: 'Procurement Pickup', many: 'Procurement Pickups' },
  { key: 'SALES_ORDERS', category: 'Sales Orders', one: 'Sales Order', many: 'Sales Orders' },
];

const REQUESTS_PANEL_ID = 'transport-requests-panel';
/** Brings the Transport requests panel into view and moves focus to it; it holds the per-type links. */
function showTransportRequests() {
  const panel = document.getElementById(REQUESTS_PANEL_ID);
  if (!panel) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  panel.focus({ preventScroll: true });
}

const recordRef = (record: DeliveryRecord) => (record.category === 'RMA' && record.rma_reference) || recordLabel(record);

const requestColumns: RecordColumn<DeliveryRecord>[] = [
  { key: 'id', header: 'Record', render: recordRef },
  { key: 'type', header: 'Type', render: record => jobTypeLabel(record.category) },
  { key: 'company', header: 'Company', render: record => <span className="block max-w-[14rem] truncate md:max-w-[12rem]" title={record.company_name}>{record.company_name}</span> },
  { key: 'area', header: 'Area', render: record => record.area || 'Not set' },
  { key: 'date', header: 'Date', render: record => formatDate(record.delivery_date) },
  { key: 'status', header: 'Status', render: record => <StatusPill record={record} />, hideLabelWhenStacked: true },
];

export default function LogisticsDashboard({ stats, overview, overviewStatus, onRetryOverview, onNavigate, onRefresh, refreshing, canAccess = () => true, canReadRecords = true }: Props) {
  const [showCompleted, setShowCompleted] = useState(false);
  const status = overviewStatus ?? (overview ? 'success' : 'pending');
  const open = (filter: DashboardFilterId) => (canAccess('main') ? () => onNavigate('main', undefined, filter) : undefined);
  const counts = overview?.counts ?? {};
  const requests = overview?.record_previews.transport_requests ?? [];
  const requestTotal = counts['log-transport-requests'] ?? 0;
  const byType = overview?.transport_requests_by_type ?? {};
  const driversOut = overview?.drivers_out ?? [];
  const driversTotal = overview?.drivers_out_total ?? 0;

  const unassigned = stats?.unassigned_count;
  const completed = stats?.completed_today;
  const heldMoved = stats?.on_hold_rescheduled;

  return (
    <DashboardPage title="Logistics dashboard" id="logistics-dashboard" updatedAt={overview?.generated_at} onRefresh={onRefresh} refreshing={refreshing}>
      <KpiRow count={4}>
        <KpiTile label="Assigned to drivers today" unit="records" icon={Truck} value={stats?.assigned_today}
          context={stats ? 'Active today across all types' : undefined} onOpen={open('log-assigned-today')} />
        <KpiTile label="No driver assigned" unit="jobs" icon={UserX} tone="warning" value={unassigned}
          context={stats ? (unassigned ? 'Needs a driver' : 'All assigned') : undefined} onOpen={showTransportRequests} actionLabel="Show transport requests" />
        <KpiTile label="Completed today" unit={completed === 1 ? 'record' : 'records'} icon={CheckCircle2} value={completed}
          context={stats ? (completed ? 'Across all record types' : 'None yet today') : undefined}
          onOpen={canReadRecords ? () => setShowCompleted(true) : undefined} />
        <KpiTile label="On hold or rescheduled" unit="records" icon={RefreshCw} tone="warning" value={heldMoved}
          context={stats ? (heldMoved ? 'Needs reassignment' : 'Nothing to reassign') : undefined} onOpen={open('log-on-hold-rescheduled')} />
      </KpiRow>
      {showCompleted && canReadRecords && (
        <CompletedTodayDialog canAccess={canAccess} onClose={() => setShowCompleted(false)}
          onOpenRecord={(screen, id) => { setShowCompleted(false); onNavigate(screen, id); }} />
      )}

      <div id={REQUESTS_PANEL_ID} tabIndex={-1} className="scroll-mt-4 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy">
      <DashboardPanel title="Transport requests" count={status === 'success' ? plural(requestTotal, 'request', 'requests') : undefined}
        footer={status === 'success' && requestTotal > 0 ? (
          <>
            <span className="tabular-nums">Showing {requests.length} of {requestTotal} requests</span>
            <ActionPillGroup label="Open queue:">
              {REQUEST_TYPES.filter(type => (byType[type.key] ?? 0) > 0).map(type => {
                const total = byType[type.key] ?? 0;
                const screen = screenKeyForCategory(type.category);
                const accessibleLabel = `View ${plural(total, type.one, type.many)}`;
                return canAccess(screen)
                  ? (
                    <ActionPill
                      key={type.key}
                      label={total === 1 ? type.one : type.many}
                      accessibleLabel={accessibleLabel}
                      count={total}
                      onClick={() => onNavigate(screen, undefined, 'log-transport-requests')}
                    />
                  )
                  : (
                    <span
                      key={type.key}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-500 tabular-nums"
                    >
                      {plural(total, type.one, type.many)}
                    </span>
                  );
              })}
            </ActionPillGroup>
          </>
        ) : undefined}>
        {status === 'pending' && <TileSkeleton lines={4} />}
        {status === 'error' && <PanelError message="Transport requests could not be loaded." onRetry={onRetryOverview} />}
        {status === 'success' && (requestTotal === 0
          ? <EmptyState title="No transport requests need dispatch" description="Deliveries, RMA, Pick-ups and Sales Orders waiting for a driver will appear here." />
          : <RecordTable rows={requests} columns={requestColumns} rowKey={record => record.id} caption="Driver jobs waiting for a driver, oldest date first"
              onOpen={record => onNavigate(screenKeyForCategory(record.category), record.id)}
              canOpen={record => canAccess(screenKeyForCategory(record.category))}
              openLabel={record => `Open ${jobTypeLabel(record.category)} ${recordRef(record)} for ${record.company_name}`} />)}
      </DashboardPanel>
      </div>

      <DashboardPanel title="Drivers out for delivery" count={status === 'success' ? `${driversTotal} driver${driversTotal === 1 ? '' : 's'}` : undefined}
        footer={status === 'success' && driversTotal > driversOut.length ? (
          <>
            <span className="tabular-nums">Showing {driversOut.length} of {driversTotal} drivers</span>
            {canAccess('driver_board') && (
              <ActionPill
                label={`View all ${driversTotal} assigned Drivers`}
                arrow="forward"
                onClick={() => onNavigate('driver_board')}
              />
            )}
          </>
        ) : undefined}>
        {status === 'pending' && <TileSkeleton lines={3} />}
        {status === 'error' && <PanelError message="Drivers out for delivery could not be loaded." onRetry={onRetryOverview} />}
        {status === 'success' && (driversOut.length === 0
          ? <EmptyState icon={<Navigation className="h-9 w-9 text-slate-500" />} title="No drivers are out for delivery today" />
          : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {driversOut.map(({ driver_id, driver, records, total, in_transit }) => (
                <li key={driver_id} className="rounded-lg border border-slate-200 p-3">
                  <p className="truncate font-semibold text-slate-900" title={driver}>{driver}</p>
                  <p className="mb-2 text-sm text-slate-600">
                    {plural(total, 'active job', 'active jobs')}{in_transit > 0 && <> · <span className="font-semibold text-brand-navy">{in_transit} in transit</span></>}
                  </p>
                  <ul className="space-y-1">
                    {records.slice(0, 3).map(record => {
                      const screen = screenKeyForCategory(record.category);
                      const label = <>{recordLabel(record)} · {record.company_name}</>;
                      return (
                        <li key={record.id} className="flex min-w-0 items-center gap-2 text-sm">
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{jobTypeLabel(record.category)}</span>
                          {canAccess(screen)
                            ? <button type="button" onClick={() => onNavigate(screen, record.id)}
                                className="block min-w-0 truncate rounded-sm text-left tabular-nums text-brand-navy hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                                aria-label={`Open ${jobTypeLabel(record.category)} ${recordLabel(record)} for ${record.company_name}${inTransit(record) ? ', in transit' : ''}`}>
                                {label}
                              </button>
                            : <span className="block min-w-0 truncate tabular-nums text-slate-700">{label}</span>}
                          {inTransit(record) && <span className="shrink-0 text-xs font-semibold text-brand-navy">In transit</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {total > records.length && <p className="mt-1 text-sm text-slate-600">+{plural(total - records.length, 'more job', 'more jobs')}</p>}
                </li>
              ))}
            </ul>
          ))}
      </DashboardPanel>
    </DashboardPage>
  );
}
