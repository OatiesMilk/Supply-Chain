import type { DeliveryCategory, DeliveryRecord, DriverActions } from '../types';
import { canRecordTimeIn, hasValidRunTimeIn } from './recordLifecycle';
import type { PodReadiness } from './podRequirement';

/** The one label that tells a Driver what kind of job a card is. */
const JOB_TYPE_LABELS: Record<DeliveryCategory, string> = {
  Deliveries: 'Delivery',
  RMA: 'RMA',
  'Procurement Pick-up': 'Procurement Pickup',
  'Sales Orders': 'Sales Order',
  'Accounting Collection': 'Accounting Collection',
};
export function jobTypeLabel(category: DeliveryCategory | string): string {
  return JOB_TYPE_LABELS[category as DeliveryCategory] ?? category;
}

export const RECEIVED_BY_MAX_LENGTH = 120;

export function jobStartedAt(record: DeliveryRecord): string | null {
  return (record.category === 'RMA' ? record.rma_transport_started_at : record.time_in) || null;
}

/** Prefer the server's answer; fall back to the same rules for older responses. */
export function driverJobActions(record: DeliveryRecord): DriverActions {
  if (record.driver_actions) return record.driver_actions;
  if (record.category === 'RMA') {
    const active = record.rma_movement === 'LOGISTICS_TRANSPORT' && !record.rma_received_at && record.status !== 'Delivered';
    return { start: active && record.rma_transport_status === 'PENDING', complete: active && record.rma_transport_status === 'IN_TRANSIT', start_blocked_reason: null };
  }
  if (record.status === 'Delivered') return { start: false, complete: false, start_blocked_reason: null };
  if (hasValidRunTimeIn(record.time_in)) return { start: false, complete: record.status === 'In Transit' || record.status === 'Pending', start_blocked_reason: null };
  if (record.status === 'On-Hold') return { start: false, complete: false, start_blocked_reason: 'On hold. Contact Logistics.' };
  return { start: canRecordTimeIn(record), complete: false, start_blocked_reason: null };
}

/** Why "Complete delivery" is not available yet. Every job type needs a saved photo and Received By. */
export function driverCompletionError(receivedBy: string | null | undefined, pod?: PodReadiness): string | null {
  if (pod?.uploading) return 'Wait for the proof of delivery upload to finish.';
  if (!pod || pod.loading) return 'Checking proof of delivery photos…';
  if (pod.loadFailed) return 'Could not verify proof of delivery photos. Retry loading the attachments.';
  if (!pod.hasPhoto) return 'Upload at least one JPG or PNG photo before completing. Documents alone do not count.';
  if (!receivedBy?.trim()) return 'Received By is required before completing this run.';
  if (receivedBy.trim().length > RECEIVED_BY_MAX_LENGTH) return `Received By must be ${RECEIVED_BY_MAX_LENGTH} characters or fewer.`;
  return null;
}
