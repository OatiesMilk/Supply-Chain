import { AlertTriangle, ClipboardCheck, Clock, Navigation, PackageCheck, RotateCcw } from 'lucide-react';
import type { ApiDashboardOverview, ApiDashboardStats } from '@/api';
import type { DeliveryRecord } from '@/types';
import type { DashboardFilterId } from '@/utils/dashboardFilters';
import {
  ActionPill, AgeIndicator, DashboardPage, DashboardPanel, EmptyState, KpiRow, KpiTile, PanelError, RecordTable, StatusPill, TileSkeleton, formatDate, formatDateTime,
  type RecordColumn,
} from './ui';
import { recordLabel } from '../../utils/recordLabel';
import { formatRmaMovementBadge } from '../../utils/rmaTableDisplay';

/** TASS works from the RMA reference, so every TASS table leads with it and shows the record number underneath. */
const rmaReferenceColumn: RecordColumn<DeliveryRecord> = { key: 'id', header: 'RMA', render: record => (
  <>
    <span>{record.rma_reference || recordLabel(record)}</span>
    {record.rma_reference && <span className="block text-xs font-normal text-slate-600">{recordLabel(record)}</span>}
  </>
) };
const companyColumn: RecordColumn<DeliveryRecord> = { key: 'company', header: 'Company', render: record => <span className="block max-w-[14rem] truncate md:max-w-[12rem]" title={record.company_name}>{record.company_name}</span> };
const areaColumn: RecordColumn<DeliveryRecord> = { key: 'area', header: 'Area', render: record => record.area || 'Not set' };

/** TASS works from the RMA reference, so every TASS table leads with it and shows the record number underneath. */
const rmaReferenceColumn: RecordColumn<DeliveryRecord> = { key: 'id', header: 'RMA', render: record => (
  <>
    <span>{record.rma_reference || recordLabel(record)}</span>
    {record.rma_reference && <span className="block text-xs font-normal text-slate-600">{recordLabel(record)}</span>}
  </>
) };
const companyColumn: RecordColumn<DeliveryRecord> = { key: 'company', header: 'Company', render: record => <span className="block max-w-[14rem] truncate md:max-w-[12rem]" title={record.company_name}>{record.company_name}</span> };
const areaColumn: RecordColumn<DeliveryRecord> = { key: 'area', header: 'Area', render: record => record.area || 'Not set' };

const inTransitColumns: RecordColumn<DeliveryRecord>[] = [
  rmaReferenceColumn,
  companyColumn,
  areaColumn,
  { key: 'driver', header: 'Driver', render: record => record.driver || 'Not set' },
  { key: 'started', header: 'Transport started', render: record => formatDateTime(record.rma_transport_started_at) },
  { key: 'status', header: 'RMA status', render: record => <StatusPill record={record} hideCategoryPrefix />, hideLabelWhenStacked: true },
];

const receiptColumns: RecordColumn<DeliveryRecord>[] = [
  rmaReferenceColumn,
  companyColumn,
  { key: 'movement', header: 'Movement', render: record => formatRmaMovementBadge(record.rma_movement).label },
  { key: 'transport', header: 'Transport completed', render: record => (record.rma_movement === 'LOGISTICS_TRANSPORT' ? formatDateTime(record.rma_transport_completed_at) : 'No driver leg') },
  { key: 'age', header: 'Age', align: 'center', render: record => <AgeIndicator since={record.submitted_at ?? record.created_at} /> },
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
  rmaReferenceColumn,
  companyColumn,
  areaColumn,
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
  const receipts = overview?.record_previews.rma_awaiting_receipt ?? [];
  const receiptTotal = overview?.counts['tass-rma-awaiting-receipt'] ?? 0;

  return (
    <DashboardPage title="TASS dashboard" id="tass-dashboard" updatedAt={overview?.generated_at} onRefresh={onRefresh} refreshing={refreshing}>
      <KpiRow count={6}>
        <KpiTile label="Awaiting TASS receipt" unit="RMA records" icon={PackageCheck} value={stats?.rma_awaiting_receipt} tone={stats?.rma_awaiting_receipt ? 'warning' : 'neutral'}
          context={stats ? (stats.rma_awaiting_receipt > 0 ? 'Confirm receipt' : 'Nothing to receive') : undefined}
          onOpen={open('rma', 'tass-rma-awaiting-receipt')} />
        <KpiTile label="Awaiting completion" unit="RMA records" icon={ClipboardCheck} value={stats?.rma_awaiting_completion} tone={stats?.rma_awaiting_completion ? 'warning' : 'neutral'}
          context={stats ? (stats.rma_awaiting_completion > 0 ? 'Received, ready to complete' : 'Nothing to complete') : undefined}
          onOpen={open('rma', 'tass-rma-awaiting-completion')} />
        <KpiTile label="Open RMA" unit="records" icon={RotateCcw} value={stats?.open_rma} context={openContext}
          tone={!stats?.open_rma ? 'neutral' : aging ? 'critical' : 'warning'} onOpen={open('rma', 'tass-open-rma')} />
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
        title="Ready for receipt"
        count={status === 'success' ? `${receiptTotal} waiting` : undefined}
        footer={status === 'success' && receiptTotal > 0 ? (
          <>
            <span className="tabular-nums">Showing {receipts.length} of {receiptTotal}</span>
            {canAccess('rma') && (
              <ActionPill
                label={`View all ${receiptTotal} awaiting receipt`}
                arrow="forward"
                onClick={() => onNavigate('rma', undefined, 'tass-rma-awaiting-receipt')}
              />
            )}
          </>
        ) : undefined}
      >
        {status === 'pending' && <TileSkeleton lines={3} />}
        {status === 'error' && <PanelError message="RMA ready for receipt could not be loaded." onRetry={onRetryOverview} />}
        {status === 'success' && (receiptTotal === 0
          ? <EmptyState icon={<PackageCheck className="h-9 w-9 text-slate-500" />} title="Nothing waiting for receipt" description="RMA appear here once transport is complete, or right after submission when no driver is involved." />
          : <RecordTable rows={receipts} columns={receiptColumns} rowKey={record => record.id} caption="RMA ready for TASS receipt, longest waiting first"
              onOpen={canAccess('rma') ? record => onNavigate('rma', record.id) : undefined}
              openLabel={record => `Open RMA ready for receipt ${record.rma_reference || recordLabel(record)}`} />)}
      </DashboardPanel>

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
