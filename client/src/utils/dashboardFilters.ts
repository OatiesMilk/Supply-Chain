import type { DeliveryRecord } from '../types';
import { isDraftRecord, manilaToday } from './recordLifecycle';
import { AGE_CRITICAL_DAYS, manilaDaysSince } from './manilaDays';

export const DASHBOARD_FILTERS = {
  'sc-scheduled-today': { label: 'Deliveries Scheduled Today', screen: 'deliveries' },
  'sc-pending-assignment': { label: 'Pending Driver Assignment', screen: 'deliveries' },
  'sc-on-hold': { label: 'On-Hold Items', screen: 'deliveries' },
  'sc-rescheduled': { label: 'Rescheduled Items', screen: 'deliveries' },
  'sc-completed-today': { label: 'Deliveries Completed Today', screen: 'deliveries' },
  'sc-awaiting-verification': { label: 'Awaiting Sales Verification', screen: 'deliveries' },
  'sc-awaiting-verification-delivery': { label: 'Deliveries Awaiting Verification', screen: 'deliveries' },
  'sc-awaiting-verification-collection': { label: 'Collections Awaiting Verification', screen: 'accounting_collection' },
  'sc-awaiting-verification-pickup': { label: 'Pick-ups Awaiting Verification', screen: 'procurement_pickup' },
  'sc-awaiting-verification-sales-order': { label: 'Sales Orders Awaiting Verification', screen: 'sales_orders' },
  'sc-attention-no-driver': { label: 'No Driver, Due Soon', screen: 'deliveries' },
  'sc-attention-on-hold-rescheduled': { label: 'On-Hold / Rescheduled', screen: 'deliveries' },
  'sc-attention-pending-confirmation': { label: 'Pending Confirmation', screen: 'deliveries' },
  'sc-attention-all': { label: 'Items Need Action', screen: 'deliveries' },
  'log-assigned-today': { label: 'Assigned to Drivers Today', screen: 'main' },
  'log-unassigned': { label: 'No Driver Assigned', screen: 'main' },
  'log-completed-today': { label: 'Records Completed Today', screen: 'dashboard' },
  'log-on-hold': { label: 'On-Hold Records', screen: 'main' },
  'log-rescheduled': { label: 'Rescheduled Records', screen: 'main' },
  'log-on-hold-rescheduled': { label: 'On-Hold / Rescheduled Records', screen: 'main' },
  'log-flags': { label: 'Flagged Records', screen: 'main' },
  'log-rma-requests': { label: 'RMA transport requests', screen: 'rma' },
  'log-transport-requests': { label: 'Transport requests', screen: 'deliveries' },
  'sc-in-transit': { label: 'In transit', screen: 'deliveries' },
  'tass-rma-in-transit': { label: 'RMA in transit', screen: 'rma' },
  'tass-open-rma': { label: 'Open RMA', screen: 'rma' },
  'tass-rma-aging': { label: 'Open RMA over 7 days', screen: 'rma' },
  'tass-rma-on-hold': { label: 'RMA On-Hold', screen: 'rma' },
  'tass-pending-pickups': { label: 'Pick-ups Pending', screen: 'procurement_pickup' },
  'tass-pending-verification': { label: 'Collections Pending', screen: 'accounting_collection' },
  'admin-active-users': { label: 'Total Active Users', screen: 'admin' },
  'admin-records-this-week': { label: 'Records This Week', screen: 'transactions' },
  'admin-unverified-collections': { label: 'Unverified Collections', screen: 'accounting_collection' },
  'admin-audit-today': { label: 'Audit Events Today', screen: 'admin' },
} as const;

export type DashboardFilterId = keyof typeof DASHBOARD_FILTERS;

export function getDashboardFilterLabel(id: DashboardFilterId): string {
  return DASHBOARD_FILTERS[id].label;
}

export function getManilaWeekRange(today = manilaToday()) {
  const weekStart = new Date(`${today}T00:00:00.000Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  return { from: weekStart.toISOString().slice(0, 10), to: today };
}

function isManilaDay(value: string | null | undefined, day: string): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date) === day;
}

function isDelivery(record: DeliveryRecord): boolean {
  return record.category === 'Deliveries' && !isDraftRecord(record);
}

/** Older RMAs recorded final completion as Time Out. */
export function recordCompletedAt(record: DeliveryRecord): string | null | undefined {
  return record.category === 'RMA' ? record.rma_completed_at ?? record.time_out : record.completion_signed_off_at ?? record.time_out;
}

/** Every RMA that is neither completed nor a draft. Mirrors OPEN_RMA_STATUSES on the server. */
function isOpenRma(record: DeliveryRecord): boolean {
  return record.category === 'RMA' && !isDraftRecord(record) && record.status !== 'Delivered';
}

/** Non-RMA job types a Driver runs. Mirrors DRIVER_RUN_CATEGORIES on the server. */
const DRIVER_RUN_CATEGORIES: readonly string[] = ['Deliveries', 'Accounting Collection', 'Procurement Pick-up', 'Sales Orders'];
const DRIVER_OUT_STATUSES: readonly string[] = ['Scheduled', 'In Transit', 'Pending'];
const RMA_NOT_OUT_STATUSES: readonly string[] = ['Delivered', 'On-Hold', 'Rescheduled'];

function isLogisticsRma(record: DeliveryRecord): boolean {
  return record.category === 'RMA' && !isDraftRecord(record) && record.rma_movement === 'LOGISTICS_TRANSPORT';
}

function isDriverRun(record: DeliveryRecord): boolean {
  return DRIVER_RUN_CATEGORIES.includes(record.category) && !isDraftRecord(record);
}

/** Mirrors transportRequestFilter: an open driver job with no Driver profile. */
function isTransportRequest(record: DeliveryRecord): boolean {
  if (record.driver_id || ['Delivered', 'Transport Complete'].includes(record.status)) return false;
  if (isDriverRun(record)) return true;
  return isLogisticsRma(record) && !!record.rma_transport_status && record.rma_transport_status !== 'COMPLETED';
}

/** Mirrors driversInTransitFilter for non-RMA runs: assigned, still out, and started. */
function isRunInTransit(record: DeliveryRecord): boolean {
  return isDriverRun(record) && !!record.driver_id && DRIVER_OUT_STATUSES.includes(record.status)
    && (record.status === 'In Transit' || !!record.time_in);
}

/** Mirrors driversInTransitFilter for RMA: Logistics transport started and the RMA not held or done. */
function isRmaInTransit(record: DeliveryRecord): boolean {
  return isLogisticsRma(record) && !!record.driver_id && !RMA_NOT_OUT_STATUSES.includes(record.status)
    && record.rma_transport_status === 'IN_TRANSIT';
}

function noDriver(record: DeliveryRecord): boolean {
  return !record.driver?.trim() && !['Delivered', 'Transport Complete'].includes(record.status);
}

function onHoldOrRescheduled(record: DeliveryRecord): boolean {
  return record.status === 'On-Hold' || record.status === 'Rescheduled';
}

function scNeedsAction(record: DeliveryRecord, today: string): boolean {
  const dueDate = record.delivery_date ? new Date(`${record.delivery_date}T00:00:00.000Z`) : null;
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const dueWithinTwoDays = !!dueDate && !Number.isNaN(dueDate.getTime()) &&
    (dueDate.getTime() - todayDate.getTime()) / 86_400_000 <= 2;
  return (noDriver(record) && dueWithinTwoDays) || onHoldOrRescheduled(record) ||
    record.status === 'Pending' || record.status === 'Scheduled';
}

export function matchesDashboardFilter(
  record: DeliveryRecord,
  id: DashboardFilterId,
  today = manilaToday(),
): boolean {
  switch (id) {
    case 'sc-scheduled-today':
      return isDelivery(record) && record.status === 'Scheduled' && record.delivery_date === today;
    case 'sc-pending-assignment':
      return isDelivery(record) && noDriver(record);
    case 'log-unassigned':
      return isTransportRequest(record);
    case 'sc-on-hold':
      return isDelivery(record) && record.status === 'On-Hold';
    case 'sc-rescheduled':
      return isDelivery(record) && record.status === 'Rescheduled';
    case 'sc-completed-today':
      return isDelivery(record) && record.status === 'Delivered' && isManilaDay(record.completion_signed_off_at ?? record.time_out, today);
    case 'log-completed-today':
      return !isDraftRecord(record) && record.status === 'Delivered' && isManilaDay(recordCompletedAt(record), today);
    case 'sc-awaiting-verification':
      return !isDraftRecord(record) && record.category !== 'RMA' && record.status === 'Transport Complete';
    case 'sc-awaiting-verification-delivery':
      return !isDraftRecord(record) && record.category === 'Deliveries' && record.status === 'Transport Complete';
    case 'sc-awaiting-verification-collection':
      return !isDraftRecord(record) && record.category === 'Accounting Collection' && record.status === 'Transport Complete';
    case 'sc-awaiting-verification-pickup':
      return !isDraftRecord(record) && record.category === 'Procurement Pick-up' && record.status === 'Transport Complete';
    case 'sc-awaiting-verification-sales-order':
      return !isDraftRecord(record) && record.category === 'Sales Orders' && record.status === 'Transport Complete';
    case 'sc-attention-no-driver': {
      if (!isDelivery(record) || !noDriver(record) || !record.delivery_date) return false;
      const dueDate = new Date(`${record.delivery_date}T00:00:00.000Z`);
      const todayDate = new Date(`${today}T00:00:00.000Z`);
      return !Number.isNaN(dueDate.getTime()) && (dueDate.getTime() - todayDate.getTime()) / 86_400_000 <= 2;
    }
    case 'sc-attention-on-hold-rescheduled':
      return isDelivery(record) && onHoldOrRescheduled(record);
    case 'sc-attention-pending-confirmation':
      return isDelivery(record) && (record.status === 'Pending' || record.status === 'Scheduled');
    case 'sc-attention-all':
      return isDelivery(record) && scNeedsAction(record, today);
    case 'log-assigned-today':
      return !isDraftRecord(record) && !!record.driver_id && record.delivery_date === today && (
        (isDriverRun(record) && !['Delivered', 'Transport Complete'].includes(record.status)) ||
        (isLogisticsRma(record) && record.status !== 'Delivered' && !!record.rma_transport_status && record.rma_transport_status !== 'COMPLETED')
      );
    case 'log-on-hold-rescheduled':
      return !isDraftRecord(record) && onHoldOrRescheduled(record);
    case 'log-on-hold':
      return !isDraftRecord(record) && record.status === 'On-Hold';
    case 'log-rescheduled':
      return !isDraftRecord(record) && record.status === 'Rescheduled';
    case 'log-flags':
      return !isDraftRecord(record) && (isTransportRequest(record) || onHoldOrRescheduled(record));
    case 'log-rma-requests':
      return record.category === 'RMA' && !isDraftRecord(record) && record.rma_movement === 'LOGISTICS_TRANSPORT'
        && record.status !== 'Delivered' && !!record.rma_transport_status && record.rma_transport_status !== 'COMPLETED';
    case 'log-transport-requests':
      return isTransportRequest(record);
    case 'sc-in-transit':
      return isRunInTransit(record);
    case 'tass-rma-in-transit':
      return isRmaInTransit(record);
    case 'tass-open-rma':
      return isOpenRma(record);
    case 'tass-rma-aging': {
      const age = manilaDaysSince(record.submitted_at ?? record.created_at);
      return isOpenRma(record) && age !== null && age > AGE_CRITICAL_DAYS;
    }
    case 'tass-rma-on-hold':
      return record.category === 'RMA' && record.status === 'On-Hold';
    case 'tass-pending-pickups':
      return record.category === 'Procurement Pick-up' && (record.status === 'Scheduled' || record.status === 'Pending');
    case 'tass-pending-verification':
    case 'admin-unverified-collections':
      return record.category === 'Accounting Collection' && record.status === 'Delivered' && !record.collection_verified;
    default:
      return false;
  }
}

export function filterRecordsForDashboard(
  records: DeliveryRecord[],
  id: DashboardFilterId | null,
  today = manilaToday(),
): DeliveryRecord[] {
  return id ? records.filter(record => matchesDashboardFilter(record, id, today)) : records;
}
