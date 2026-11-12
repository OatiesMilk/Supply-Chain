import { AlertTriangle, ArrowRight, Clock, Navigation, PackageSearch, RotateCcw } from 'lucide-react';
import type { ApiDashboardOverview, ApiDashboardStats } from '@/api';
import type { DeliveryRecord } from '@/types';
import type { DashboardFilterId } from '@/utils/dashboardFilters';
import {
  AgeIndicator, DashboardPage, DashboardPanel, EmptyState, KpiRow, KpiTile, PanelError, RecordTable, StatusPill, TileSkeleton, formatDate, formatDateTime,
  type RecordColumn,
} from './ui';

const linkClass = 'inline-flex items-center gap-1 rounded-sm font-semibold text-[#1F3864] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]';

const inTransitColumns: RecordColumn<DeliveryRecord>[] = [
  { key: 'id', header: 'RMA', render: record => (
    <>
      <span>{record.rma_reference || record.id}</span>
      {record.rma_reference && <span className="block text-xs font-normal text-slate-600">{record.id}</span>}
    </>
  ) },
  { key: 'company', header: 'Company', render: record => <span className="block max-w-[14rem] truncate md:max-w-[12rem]" title={record.company_name}>{record.company_name}</span> },
  { key: 'area', header: 'Area', render: record => record.area || 'Not set' },
  { key: 'driver', header: 'Driver', render: record => record.driver || 'Not set' },
  { key: 'started', header: 'Transport started', render: record => formatDateTime(record.rma_transport_started_at) },
  { key: 'status', header: 'RMA status', render: record => <StatusPill record={record} hideCategoryPrefix />, hideLabelWhenStacked: true },
];

type TassStats = Extract<ApiDashboardStats, { role: 'TASS' }>;

interface Props {
  /** null while the server numbers load. Tiles show skeletons, never locally counted guesses. */
  stats: TassStats | null;
  overview?: ApiDashboardOverview;
  overviewStatus?: 'pending' | 'error' | 'success';
  onRetryOverview?: () => void;
  onNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Tiles and links for screens the viewer cannot open render without a button. */
  canAccess?: (screen: string) => boolean;
}

const columns: RecordColumn<DeliveryRecord>[] = [
  { key: 'id', header: 'Record', render: record => (
    <>
      <span>{record.id}</span>
      {record.rma_reference && <span className="block text-xs font-normal text-slate-600">{record.rma_reference}</span>}
    </>
  ) },
  { key: 'company', header: 'Company', render: record => <span className="block max-w-[14rem] truncate md:max-w-[12rem]" title={record.company_name}>{record.company_name}</span> },
  { key: 'area', header: 'Area', render: record => record.area || 'Not set' },
  { key: 'status', header: 'Status', render: record => <StatusPill record={record} hideCategoryPrefix />, hideLabelWhenStacked: true },
  { key: 'date', header: 'Delivery date', render: record => formatDate(record.delivery_date) },
  { key: 'age', header: 'Age', align: 'center', render: record => <AgeIndicator since={record.submitted_at ?? record.created_at} /> },
];

export default function TassDashboard({ stats, overview, overviewStatus, onRetryOverview, onNavigate, onRefresh, refreshing, canAccess = () => true }: Props) {
  const status = overviewStatus ?? (overview ? 'success' : 'pending');
  const open = (screen: string, filter?: DashboardFilterId) => (canAccess(screen) ? () => onNavigate(screen, undefined, filter) : undefined);
  const onHold = overview?.counts['tass-rma-on-hold'];
  const aging = overview?.counts['tass-rma-aging'];
  const openContext = onHold === undefined || aging === undefined ? undefined : `${onHold} on hold, ${aging} over 7 days`;
  const verifiedToday = stats?.verified_today ?? 0;

  const previews = overview?.record_previews.rma_attention ?? [];
  const total = overview?.counts['tass-open-rma'] ?? overview?.counts.rma_attention ?? 0;
  const moving = overview?.record_previews.rma_in_transit ?? [];
  const movingTotal = overview?.counts['tass-rma-in-transit'] ?? 0;

  return (
    <DashboardPage title="Command dashboard" id="tass-dashboard" updatedAt={overview?.generated_at} onRefresh={onRefresh} refreshing={refreshing}>
      <KpiRow count={4}>
        <KpiTile label="Open RMA" unit="records" icon={RotateCcw} value={stats?.open_rma} context={openContext}
          tone={aging ? 'critical' : 'warning'} onOpen={open('rma', 'tass-open-rma')} />
        <KpiTile label="On hold" unit="RMA records" icon={AlertTriangle} value={stats?.rma_on_hold} tone="critical"
          context={stats ? (stats.rma_on_hold > 0 ? 'Blocked, needs action' : 'No blocked RMA') : undefined}
          onOpen={open('rma', 'tass-rma-on-hold')} />
        <KpiTile label="Pick-ups pending" unit="pick-ups" icon={PackageSearch} value={stats?.pending_procurement_pickup}
          context={stats ? (stats.pending_procurement_pickup > 0 ? 'Waiting to be picked up' : 'Nothing pending') : undefined}
          onOpen={open('procurement_pickup', 'tass-pending-pickups')} />
        <KpiTile label="Collections to verify" unit="collections" icon={Clock} value={stats?.pending_verification} tone="warning"
          context={stats ? (verifiedToday > 0 ? `${verifiedToday} verified today` : stats.pending_verification > 0 ? 'Awaiting your sign-off' : 'Nothing to verify') : undefined}
          onOpen={open('accounting_collection', 'tass-pending-verification')} />
      </KpiRow>

      <DashboardPanel
        title="Open RMA needing attention"
        count={status === 'success' ? `${total} open` : undefined}
        footer={status === 'success' && total > 0 ? (
          <>
            <span>Showing {previews.length} of {total}</span>
            {canAccess('rma') && (
              <button type="button" onClick={() => onNavigate('rma', undefined, 'tass-open-rma')}
                className="inline-flex items-center gap-1 rounded-sm font-semibold text-[#1F3864] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]">
                View all {total} open RMA records <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        ) : undefined}
      >
        {status === 'pending' && <TileSkeleton lines={4} />}
        {status === 'error' && <PanelError message="Open RMA records could not be loaded." onRetry={onRetryOverview} />}
        {status === 'success' && (total === 0
          ? <EmptyState title="No open RMA records" description="All return and warranty records are resolved." />
          : <RecordTable rows={previews} columns={columns} rowKey={record => record.id} caption="Open RMA records, On-Hold first, then oldest submission"
              onOpen={canAccess('rma') ? record => onNavigate('rma', record.id) : undefined} openLabel={record => `Open RMA record ${record.rma_reference || record.id}`} />)}
      </DashboardPanel>

      <DashboardPanel
        title="RMA in transit"
        count={status === 'success' ? `${movingTotal} in transit` : undefined}
        footer={status === 'success' && movingTotal > 0 ? (
          <>
            <span>Showing {moving.length} of {movingTotal}</span>
            {canAccess('rma') && (
              <button type="button" onClick={() => onNavigate('rma', undefined, 'tass-rma-in-transit')} className={linkClass}>
                View all {movingTotal} in transit <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        ) : undefined}
      >
        {status === 'pending' && <TileSkeleton lines={3} />}
        {status === 'error' && <PanelError message="RMA in transit could not be loaded." onRetry={onRetryOverview} />}
        {status === 'success' && (movingTotal === 0
          ? <EmptyState icon={<Navigation className="h-9 w-9 text-slate-500" />} title="No RMA are in transit" description="RMA appear here once the driver starts the Logistics transport." />
          : <RecordTable rows={moving} columns={inTransitColumns} rowKey={record => record.id} caption="RMA in transit, oldest transport start first"
              onOpen={canAccess('rma') ? record => onNavigate('rma', record.id) : undefined}
              openLabel={record => `Open RMA in transit ${record.rma_reference || record.id}`} />)}
      </DashboardPanel>
    </DashboardPage>
  );
}
