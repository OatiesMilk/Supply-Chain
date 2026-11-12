import { ArrowRight, CheckCircle2, Clock, Navigation, PauseCircle, RefreshCw, Truck, UserX } from 'lucide-react';
import type { ApiDashboardOverview, ApiDashboardStats } from '@/api';
import type { DeliveryCategory, DeliveryRecord, DeliveryStatus } from '@/types';
import { screenKeyForCategory } from '@/routes/screenRouting';
import type { DashboardFilterId } from '@/utils/dashboardFilters';
import { jobTypeLabel } from '@/utils/driverJobs';
import DashboardStatusChart from './DashboardStatusChart';
import {
  DashboardPage, DashboardPanel, EmptyState, KpiRow, KpiTile, PanelError, RecordTable, StatusPill, TileSkeleton, formatDate, formatDateTime,
  type RecordColumn,
} from './ui';

type SalesStats = Extract<ApiDashboardStats, { role: 'SALES_COORDINATOR' }>;

interface Props {
  /** null while the server numbers load. Tiles show skeletons, never locally counted guesses. */
  stats: SalesStats | null;
  overview?: ApiDashboardOverview;
  overviewStatus?: 'pending' | 'error' | 'success';
  onRetryOverview?: () => void;
  /** SKUs are listed in the record count footer only. */
  skuCount?: number;
  onNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  canAccess?: (screen: string) => boolean;
}

const CHART_STATUSES: DeliveryStatus[] = ['Scheduled', 'Pending', 'In Transit', 'On-Hold', 'Rescheduled', 'Delivered'];

/** The SC job types a Driver runs, in footer order, each opened on its own screen. */
const IN_TRANSIT_TYPES: Array<{ category: DeliveryCategory; label: string }> = [
  { category: 'Deliveries', label: 'Deliveries' },
  { category: 'Procurement Pick-up', label: 'Procurement Pickups' },
  { category: 'Sales Orders', label: 'Sales Orders' },
];

const linkClass = 'inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-[#1F3864] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]';

const inTransitColumns: RecordColumn<DeliveryRecord>[] = [
  { key: 'id', header: 'Record', render: record => record.id },
  { key: 'type', header: 'Type', render: record => jobTypeLabel(record.category) },
  { key: 'company', header: 'Company', render: record => <span className="block max-w-[14rem] truncate md:max-w-[12rem]" title={record.company_name}>{record.company_name}</span> },
  { key: 'area', header: 'Area', render: record => record.area || 'Not set' },
  { key: 'date', header: 'Planned date', render: record => formatDate(record.delivery_date) },
  { key: 'driver', header: 'Driver', render: record => record.driver || 'Not set' },
  { key: 'started', header: 'Started', render: record => formatDateTime(record.time_in) },
  { key: 'status', header: 'Status', render: record => <StatusPill record={record} />, hideLabelWhenStacked: true },
];

export default function SalesCoordinatorDashboard({ stats, overview, overviewStatus, onRetryOverview, skuCount = 0, onNavigate, onRefresh, refreshing, canAccess = () => true }: Props) {
  const status = overviewStatus ?? (overview ? 'success' : 'pending');
  const open = (filter: DashboardFilterId) => (canAccess('deliveries') ? () => onNavigate('deliveries', undefined, filter) : undefined);
  const counts = overview?.counts;
  const chartData = CHART_STATUSES.map(name => ({ status: name, count: overview?.status_totals[name] ?? 0 }));
  const attention = counts?.['sc-attention-all'] ?? 0;
  const recordTotal = (overview?.record_total ?? 0) + skuCount;
  const inTransit = overview?.record_previews.in_transit ?? [];
  const inTransitTotal = counts?.['sc-in-transit'] ?? 0;

  const pending = stats?.pending_driver_assignment;
  const onHold = stats?.on_hold;
  const rescheduled = stats?.rescheduled;
  const done = stats?.accomplished_today;

  return (
    <DashboardPage title="Sales dashboard" id="dashboard-view-container" updatedAt={overview?.generated_at} onRefresh={onRefresh} refreshing={refreshing}>
      <KpiRow count={5}>
        <KpiTile label="Scheduled today" unit="deliveries" icon={Truck} value={stats?.deliveries_scheduled_today}
          context={stats ? "Today's queue" : undefined} onOpen={open('sc-scheduled-today')} />
        <KpiTile label="Pending driver assignment" unit="deliveries" icon={UserX} value={pending} tone="warning"
          context={stats ? (pending ? 'Needs a driver' : 'All assigned') : undefined} onOpen={open('sc-pending-assignment')} />
        <KpiTile label="On hold" unit="deliveries" icon={PauseCircle} value={onHold} tone="critical"
          context={stats ? (onHold ? 'Blocked' : 'Nothing blocked') : undefined} onOpen={open('sc-on-hold')} />
        <KpiTile label="Rescheduled" unit="deliveries" icon={RefreshCw} value={rescheduled} tone="warning"
          context={stats ? (rescheduled ? 'Needs follow-up' : 'Nothing to follow up') : undefined} onOpen={open('sc-rescheduled')} />
        <KpiTile label="Completed today" unit="deliveries" icon={CheckCircle2} value={done}
          context={stats ? (done ? 'Confirmed today' : 'None yet today') : undefined} onOpen={open('sc-completed-today')} />
      </KpiRow>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5" id="dashboard-charts">
        <div className="lg:col-span-2" id="chart-delivery-status">
          <DashboardPanel title="Delivery record status"
            footer={status === 'success' ? <span>Records available to your account: {recordTotal.toLocaleString()} ({overview?.record_total ?? 0} operational records, {skuCount} SKUs)</span> : undefined}>
            {status === 'pending' && <TileSkeleton lines={4} />}
            {status === 'error' && <PanelError message="Delivery status totals could not be loaded." onRetry={onRetryOverview} />}
            {status === 'success' && (
              <>
                <p className="mb-3 text-sm text-slate-600">Status breakdown across all your delivery records</p>
                <div className="h-64" id="status-chart-wrapper"><DashboardStatusChart data={chartData} /></div>
              </>
            )}
          </DashboardPanel>
        </div>

        <div className="lg:col-span-3" id="needs-attention-panel">
          <DashboardPanel title="Needs attention" count={status === 'success' ? `${attention} need action` : undefined}
            actions={status === 'success' && canAccess('deliveries') ? (
              <button type="button" onClick={() => onNavigate('deliveries', undefined, 'sc-attention-all')}
                className="rounded-sm text-sm font-semibold text-[#1F3864] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]">
                View all {attention} items needing action
              </button>
            ) : undefined}>
            {status === 'pending' && <TileSkeleton lines={3} />}
            {status === 'error' && <PanelError message="Attention counts could not be loaded." onRetry={onRetryOverview} />}
            {status === 'success' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <KpiTile size="compact" label="No driver, due soon" unit="deliveries" icon={UserX} tone="critical" value={counts?.['sc-attention-no-driver'] ?? 0}
                  context="No driver, due within 2 days" onOpen={open('sc-attention-no-driver')} />
                <KpiTile size="compact" label="On hold or rescheduled" unit="deliveries" icon={PauseCircle} tone="warning" value={counts?.['sc-attention-on-hold-rescheduled'] ?? 0}
                  context="Blocked or moved to a new date" onOpen={open('sc-attention-on-hold-rescheduled')} />
                <KpiTile size="compact" label="Pending confirmation" unit="deliveries" icon={Clock} tone="warning" value={counts?.['sc-attention-pending-confirmation'] ?? 0}
                  context="Scheduled or pending, awaiting confirmation" onOpen={open('sc-attention-pending-confirmation')} />
              </div>
            )}
          </DashboardPanel>
        </div>
      </div>

      <div id="in-transit-panel">
        <DashboardPanel title="In transit" count={status === 'success' ? `${inTransitTotal} in transit` : undefined}
          footer={status === 'success' && inTransitTotal > 0 ? (
            <>
              <span>Showing {inTransit.length} of {inTransitTotal}</span>
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                {IN_TRANSIT_TYPES.filter(type => canAccess(screenKeyForCategory(type.category))).map(type => (
                  <button key={type.category} type="button" className={linkClass}
                    onClick={() => onNavigate(screenKeyForCategory(type.category), undefined, 'sc-in-transit')}>
                    View {type.label} in transit <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ))}
              </span>
            </>
          ) : undefined}>
          {status === 'pending' && <TileSkeleton lines={4} />}
          {status === 'error' && <PanelError message="In-transit jobs could not be loaded." onRetry={onRetryOverview} />}
          {status === 'success' && (inTransitTotal === 0
            ? <EmptyState icon={<Navigation className="h-9 w-9 text-slate-500" />} title="No jobs are in transit"
                description="Deliveries, Pick-ups and Sales Orders appear here once the driver starts the run." />
            : <RecordTable rows={inTransit} columns={inTransitColumns} rowKey={record => record.id} caption="Jobs in transit, oldest planned date first"
                onOpen={record => onNavigate(screenKeyForCategory(record.category), record.id)}
                canOpen={record => canAccess(screenKeyForCategory(record.category))}
                openLabel={record => `Open ${jobTypeLabel(record.category)} ${record.id} for ${record.company_name}`} />)}
        </DashboardPanel>
      </div>
    </DashboardPage>
  );
}
