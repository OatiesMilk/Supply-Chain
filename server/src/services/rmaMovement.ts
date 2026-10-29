import type { Prisma } from '@prisma/client';
import { deliveryScheduleState } from './deliveryLifecycle';
import type { RmaTransportContext } from './recordAccess';

export const RMA_MOVEMENTS = ['LOGISTICS_TRANSPORT', 'SUPPLIER_COLLECTION', 'INTERNAL_NO_DRIVER'] as const;
export type RmaMovement = typeof RMA_MOVEMENTS[number];
export interface RmaMovementRecord {
  category?: string; draft?: boolean; status?: string; rmaMovement?: string | null;
  rmaTransportStatus?: string | null; deliveryDate?: string | null;
  driverId?: string | null; rmaReceivedAt?: Date | string | null;
}
export function validRmaMovement(value: unknown): value is RmaMovement {
  return typeof value === 'string' && (RMA_MOVEMENTS as readonly string[]).includes(value);
}
export function isLogisticsRma(record: RmaMovementRecord): boolean {
  return record.category === 'RMA' && record.rmaMovement === 'LOGISTICS_TRANSPORT';
}
export function eligibleRmaTransport(record: RmaMovementRecord): boolean {
  return isLogisticsRma(record) && record.draft === false;
}
export function rmaTransportDateError(record: RmaMovementRecord, now = new Date()): string | null {
  const schedule = deliveryScheduleState(record.deliveryDate, now);
  if (!schedule.valid) return 'This RMA transport has no valid planned date. Contact TASS before taking action.';
  if (schedule.future) return 'This RMA transport is scheduled for a future date and is read-only until that date.';
  return null;
}
export function rmaTransportContext(record: RmaMovementRecord, now = new Date()): RmaTransportContext {
  return {
    requiresLogistics: isLogisticsRma(record), requiresInternalDriver: isLogisticsRma(record),
    eligible: eligibleRmaTransport(record),
    actionAllowed: eligibleRmaTransport(record) && !!record.driverId && record.status !== 'ACCOMPLISHED'
      && record.rmaTransportStatus !== 'COMPLETED' && !rmaTransportDateError(record, now),
  };
}
export function rmaMovementInputError(body: Record<string, unknown>, submitting = false): string | null {
  if (body.rma_movement !== undefined && body.rma_movement !== null && body.rma_movement !== '' && !validRmaMovement(body.rma_movement)) return 'Choose a valid RMA movement method.';
  if (!submitting) return null;
  if (!validRmaMovement(body.rma_movement)) return 'Choose a movement method before submitting this RMA.';
  if (body.rma_movement === 'LOGISTICS_TRANSPORT' && !deliveryScheduleState(body.delivery_date).valid) return 'A valid planned transport date is required for Logistics transport.';
  return null;
}
/** Operational filtering is independent of authorized search/view/print. */
export const dispatchMovementScope: Prisma.DeliveryRecordWhereInput = {
  OR: [{ category: { not: 'RMA' } }, { category: 'RMA', rmaMovement: 'LOGISTICS_TRANSPORT', NOT: { rmaTransportStatus: 'COMPLETED' } }],
};
export function needsLogisticsHandoff(record: RmaMovementRecord): boolean {
  return record.draft === false && (record.category !== 'RMA' || isLogisticsRma(record))
    && !record.driverId && record.status !== 'ACCOMPLISHED' && record.rmaTransportStatus !== 'COMPLETED';
}
