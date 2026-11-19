import type { DeliveryRecord } from '../types';
import { formatManilaTimestamp } from './manilaTimestamp';
import { deliveryScheduleState, manilaToday } from './recordLifecycle';
import { recordingForLine } from './completionDialog';

export const RMA_MOVEMENT_LABELS = {
  LOGISTICS_TRANSPORT: 'Logistics transport',
  SUPPLIER_COLLECTION: 'Supplier collection',
  INTERNAL_NO_DRIVER: 'Internal / no driver',
} as const;
export const RMA_TRANSPORT_LABELS = { PENDING: 'Pending', IN_TRANSIT: 'In Transit', COMPLETED: 'Complete' } as const;

export function rmaWorkflowExportFields(record: DeliveryRecord) {
  return {
    rma_movement_fmt: record.rma_movement ? RMA_MOVEMENT_LABELS[record.rma_movement] : '',
    rma_transport_status_fmt: record.rma_transport_status ? RMA_TRANSPORT_LABELS[record.rma_transport_status] : '',
    rma_transport_started_at_fmt: record.rma_transport_started_at ? formatManilaTimestamp(record.rma_transport_started_at) : '',
    rma_transport_completed_at_fmt: record.rma_transport_completed_at ? formatManilaTimestamp(record.rma_transport_completed_at) : '',
    rma_recipient: record.rma_recipient ?? '',
    rma_received_at_fmt: record.rma_received_at ? formatManilaTimestamp(record.rma_received_at) : '',
    rma_completed_at_fmt: record.rma_completed_at ? formatManilaTimestamp(record.rma_completed_at) : '',
  };
}

export const RMA_RECEIVED_BY_MAX = 120;
/** Mirrors the server rule for completing transport: Received By is required, 1 to 120 characters. */
export function rmaReceivedByError(value: string): string | null {
  const text = value.trim();
  if (!text) return 'Received by is required before completing transport.';
  if (text.length > RMA_RECEIVED_BY_MAX) return `Received by must be ${RMA_RECEIVED_BY_MAX} characters or fewer.`;
  return null;
}

/** One line above the transport buttons. Logistics records transport for the assigned driver under its own name;
 *  before the planned date it sees when transport can start instead of buttons. */
export function rmaLogisticsTransportNotice(record: Pick<DeliveryRecord, 'driver' | 'driver_id' | 'delivery_date' | 'rma_transport_status'>,
  canRecord: boolean, today = manilaToday()): { kind: 'acting' | 'future'; text: string } | null {
  if (canRecord) return { kind: 'acting', text: recordingForLine(record.driver) };
  if (record.driver_id && record.rma_transport_status === 'PENDING' && deliveryScheduleState(record.delivery_date, today).future) {
    return { kind: 'future', text: `Transport can start on ${record.delivery_date}.` };
  }
  return null;
}
