import { AlertTriangle, Clock, Navigation, RotateCcw } from 'lucide-react';
import type { ApiDashboardOverview, ApiDashboardStats } from '@/api';
import type { DeliveryRecord } from '@/types';
import type { DashboardFilterId } from '@/utils/dashboardFilters';
import {
  ActionPill, AgeIndicator, DashboardPage, DashboardPanel, EmptyState, KpiRow, KpiTile, PanelError, RecordTable, StatusPill, TileSkeleton, formatDate, formatDateTime,
  type RecordColumn,
} from './ui';
import { recordLabel } from '../../utils/recordLabel';

const inTransitColumns: RecordColumn<DeliveryRecord>[] = [
  { key: 'id', header: 'RMA', render: record => (
    <>
      <span>{record.rma_reference || recordLabel(record)}</span>
      {record.rma_reference && <span className="block text-xs font-normal text-slate-600">{recordLabel(record)}</span>}
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
      <span>{recordLabel(record)}</span>
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

  const previews = overview?.record_previews.rma_attention ?? [];
  const total = overview?.counts['tass-open-rma'] ?? overview?.counts.rma_attention ?? 0;
  const moving = overview?.record_previews.rma_in_transit ?? [];
  const movingTotal = overview?.counts['tass-rma-in-transit'] ?? 0;

  return (
    <DashboardPage title="TASS dashboard" id="tass-dashboard" updatedAt={overview?.generated_at} onRefresh={onRefresh} refreshing={refreshing}>
      <KpiRow count={4}>
        <KpiTile label="Open RMA" unit="records" icon={RotateCcw} value={stats?.open_rma} context={openContext}
          tone={aging ? 'critical' : 'warning'} onOpen={open('rma', 'tass-open-rma')} />
        <KpiTile label="On hold" unit="RMA records" icon={AlertTriangle} value={stats?.rma_on_hold} tone="critical"
          context={stats ? (stats.rma_on_hold > 0 ? 'Blocked, needs action' : 'No blocked RMA') : undefined}
          onOpen={open('rma', 'tass-rma-on-hold')} />
        <KpiTile label="In transit" unit="RMA records" icon={Navigation} value={stats?.rma_in_transit}
          context={stats ? (stats.rma_in_transit > 0 ? 'With Logistics driver' : 'None in transit') : undefined}
          onOpen={open('rma', 'tass-rma-in-transit')} />
        <KpiTile label="Aging over 7 days" unit="RMA records" icon={Clock} value={stats?.rma_aging} tone={stats?.rma_aging ? 'critical' : undefined}
          context={stats ? (stats.rma_aging > 0 ? 'Needs follow-up' : 'All within 7 days') : undefined}
          onOpen={open('rma', 'tass-rma-aging')} />
      </KpiRow>

      <DashboardPanel
        title="Open RMA needing attention"
        count={status === 'success' ? `${total} open` : undefined}
        footer={status === 'success' && total > 0 ? (
          <>
            <span className="tabular-nums">Showing {previews.length} of {total}</span>
            {canAccess('rma') && (
              <ActionPill
                label={`View all ${total} open RMA records`}
                arrow="forward"
                onClick={() => onNavigate('rma', undefined, 'tass-open-rma')}
              />
            )}
          </>
        ) : undefined}
      >
        {status === 'pending' && <TileSkeleton lines={4} />}
        {status === 'error' && <PanelError message="Open RMA records could not be loaded." onRetry={onRetryOverview} />}
        {status === 'success' && (total === 0
          ? <EmptyState title="No open RMA records" description="All return and warranty records are resolved." />
          : <RecordTable rows={previews} columns={columns} rowKey={record => record.id} caption="Open RMA records, On-Hold first, then oldest submission"
              onOpen={canAccess('rma') ? record => onNavigate('rma', record.id) : undefined} openLabel={record => `Open RMA record ${record.rma_reference || recordLabel(record)}`} />)}
      </DashboardPanel>

      <DashboardPanel
        title="RMA in transit"
        count={status === 'success' ? `${movingTotal} in transit` : undefined}
        footer={status === 'success' && movingTotal > 0 ? (
          <>
            <span className="tabular-nums">Showing {moving.length} of {movingTotal}</span>
            {canAccess('rma') && (
              <ActionPill
                label={`View all ${movingTotal} in transit`}
                arrow="forward"
                onClick={() => onNavigate('rma', undefined, 'tass-rma-in-transit')}
              />
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
              openLabel={record => `Open RMA in transit ${record.rma_reference || recordLabel(record)}`} />)}
      </DashboardPanel>
    </DashboardPage>
  );
}
