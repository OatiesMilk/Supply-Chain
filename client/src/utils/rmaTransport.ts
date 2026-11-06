import type { DeliveryRecord } from '../types';
import { formatManilaTimestamp } from './manilaTimestamp';

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
