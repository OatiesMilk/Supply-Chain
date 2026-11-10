import { AlertTriangle, ArrowRight, CheckCircle2, Navigation, PauseCircle, RefreshCw, Truck, UserX } from 'lucide-react';
import type { ApiDashboardOverview, ApiDashboardStats } from '@/api';
import type { DeliveryRecord } from '@/types';
import { screenKeyForCategory } from '@/routes/screenRouting';
import type { DashboardFilterId } from '@/utils/dashboardFilters';
import { DashboardPage, DashboardPanel, EmptyState, KpiRow, KpiTile, PanelError, RecordTable, StatusPill, TileSkeleton, formatDate, type RecordColumn } from './ui';

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
}

const linkClass = 'inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-[#1F3864] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]';

const requestColumns: RecordColumn<DeliveryRecord>[] = [
  { key: 'id', header: 'RMA', render: record => record.rma_reference || record.id },
  { key: 'company', header: 'Company', render: record => <span className="block max-w-[14rem] truncate md:max-w-[12rem]" title={record.company_name}>{record.company_name}</span> },
  { key: 'area', header: 'Area', render: record => record.area || 'Not set' },
  { key: 'date', header: 'Transport date', render: record => formatDate(record.delivery_date) },
  { key: 'driver', header: 'Driver', render: record => record.driver
    ? record.driver
    : <span className="inline-flex items-center gap-1 font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Needs driver</span> },
  { key: 'status', header: 'Status', render: record => <StatusPill record={record} />, hideLabelWhenStacked: true },
];

export default function LogisticsDashboard({ stats, overview, overviewStatus, onRetryOverview, onNavigate, onRefresh, refreshing, canAccess = () => true }: Props) {
  const status = overviewStatus ?? (overview ? 'success' : 'pending');
  const open = (filter: DashboardFilterId) => (canAccess('deliveries') ? () => onNavigate('deliveries', undefined, filter) : undefined);
  const counts = overview?.counts ?? {};
  const rmaRequests = overview?.record_previews.rma_requests ?? [];
  const rmaTotal = counts.rma_requests ?? 0;
  const driversOut = overview?.drivers_out ?? [];
  const driversTotal = overview?.drivers_out_total ?? 0;
  const flags = counts['log-flags'] ?? 0;

  const unassigned = stats?.unassigned_count;
  const completed = stats?.completed_today;
  const heldMoved = stats?.on_hold_rescheduled;

  return (
    <DashboardPage title="Logistics dashboard" id="logistics-dashboard" updatedAt={overview?.generated_at} onRefresh={onRefresh} refreshing={refreshing}>
      <KpiRow count={4}>
        <KpiTile label="Assigned to drivers today" unit="deliveries" icon={Truck} value={stats?.assigned_today}
          context={stats ? 'Active today' : undefined} onOpen={open('log-assigned-today')} />
        <KpiTile label="No driver assigned" unit="deliveries" icon={UserX} tone="warning" value={unassigned}
          context={stats ? (unassigned ? 'Needs a driver' : 'All assigned') : undefined} onOpen={open('log-unassigned')} />
        <KpiTile label="Completed today" unit="deliveries" icon={CheckCircle2} value={completed}
          context={stats ? (completed ? 'Accomplished today' : 'None yet today') : undefined} onOpen={open('log-completed-today')} />
        <KpiTile label="On hold or rescheduled" unit="deliveries" icon={RefreshCw} tone="warning" value={heldMoved}
          context={stats ? (heldMoved ? 'Needs reassignment' : 'Nothing to reassign') : undefined} onOpen={open('log-on-hold-rescheduled')} />
      </KpiRow>

      <DashboardPanel title="RMA transport requests" count={status === 'success' ? `${rmaTotal} ${rmaTotal === 1 ? 'request' : 'requests'}` : undefined}
        footer={status === 'success' && rmaTotal > 0 ? (
          <>
            <span>Showing {rmaRequests.length} of {rmaTotal} requests</span>
            {canAccess('rma') && <button type="button" className={linkClass} onClick={() => onNavigate('rma', undefined, 'log-rma-requests')}>View all requests <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
          </>
        ) : undefined}>
        {status === 'pending' && <TileSkeleton lines={4} />}
        {status === 'error' && <PanelError message="RMA transport requests could not be loaded." onRetry={onRetryOverview} />}
        {status === 'success' && (rmaTotal === 0
          ? <EmptyState title="No RMA transport requests need dispatch" description="Returns waiting for Logistics dispatch will appear here." />
          : <RecordTable rows={rmaRequests} columns={requestColumns} rowKey={record => record.id} caption="RMA transport requests waiting for Logistics dispatch"
              onOpen={canAccess('rma') ? record => onNavigate('rma', record.id) : undefined}
              openLabel={record => `Open RMA ${record.rma_reference || record.id} for ${record.company_name}`} />)}
      </DashboardPanel>

      <DashboardPanel title="Drivers out for delivery" count={status === 'success' ? `${driversTotal} driver${driversTotal === 1 ? '' : 's'}` : undefined}
        footer={status === 'success' && driversTotal > driversOut.length ? (
          <>
            <span>Showing {driversOut.length} of {driversTotal} drivers</span>
            {canAccess('driver_board') && <button type="button" className={linkClass} onClick={() => onNavigate('driver_board')}>View all {driversTotal} assigned Drivers <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
          </>
        ) : undefined}>
        {status === 'pending' && <TileSkeleton lines={3} />}
        {status === 'error' && <PanelError message="Drivers out for delivery could not be loaded." onRetry={onRetryOverview} />}
        {status === 'success' && (driversOut.length === 0
          ? <EmptyState icon={<Navigation className="h-9 w-9 text-slate-500" />} title="No drivers currently assigned to today's deliveries" />
          : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {driversOut.map(({ driver, records, total }) => (
                <li key={driver} className="rounded-lg border border-slate-200 p-3">
                  <p className="truncate font-semibold text-slate-900" title={driver}>{driver}</p>
                  <p className="mb-2 text-sm text-slate-600">{total} active deliver{total !== 1 ? 'ies' : 'y'}</p>
                  <ul className="space-y-1">
                    {records.slice(0, 3).map(record => (
                      <li key={record.id}>
                        <button type="button" onClick={() => onNavigate(screenKeyForCategory(record.category), record.id)}
                          className="block w-full truncate rounded-sm text-left font-mono text-sm text-[#1F3864] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]"
                          aria-label={`Open ${record.id} for ${record.company_name}`}>
                          {record.id} · {record.company_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {total > records.length && <p className="mt-1 text-sm text-slate-600">+{total - records.length} more records</p>}
                </li>
              ))}
            </ul>
          ))}
      </DashboardPanel>

      <DashboardPanel title="Needs attention" count={status === 'success' ? `${flags} ${flags === 1 ? 'flag' : 'flags'}` : undefined}
        actions={status === 'success' && canAccess('deliveries') ? <button type="button" className={linkClass} onClick={() => onNavigate('deliveries', undefined, 'log-flags')}>View all {flags} flags</button> : undefined}>
        {status === 'pending' && <TileSkeleton lines={3} />}
        {status === 'error' && <PanelError message="Attention counts could not be loaded." onRetry={onRetryOverview} />}
        {status === 'success' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <KpiTile size="compact" label="Unassigned records" unit="deliveries" icon={UserX} tone="warning" value={counts['log-unassigned'] ?? 0}
              context="Records with no driver yet" onOpen={open('log-unassigned')} />
            <KpiTile size="compact" label="On hold" unit="deliveries" icon={PauseCircle} tone="critical" value={counts['log-on-hold'] ?? 0}
              context="Deliveries currently blocked" onOpen={open('log-on-hold')} />
            <KpiTile size="compact" label="Rescheduled" unit="deliveries" icon={RefreshCw} tone="warning" value={counts['log-rescheduled'] ?? 0}
              context="Moved to a new delivery date" onOpen={open('log-rescheduled')} />
          </div>
        )}
      </DashboardPanel>
    </DashboardPage>
  );
}
